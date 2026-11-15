/**
 * Sign-up, sign-in, "approve by email" and password reset. This replaces
 * Firebase Authentication; the screens call it the same way they always did.
 *
 * How a new person gets in, in order:
 *   1. They sign up: an account exists, and nothing else.
 *   2. They open the emailed link IN THE BROWSER WHERE THEY ARE SIGNED IN.
 *      That proves the address is theirs, and only then is their role record
 *      created (the role comes from src/server/access/policy.ts).
 *   3. If that role is "pending", an admin gives them a real role in Role
 *      Management. Until then they can read and write nothing.
 */
import { randomBytes } from 'node:crypto';
import { and, desc, eq, gt, isNull, sql } from 'drizzle-orm';
import type { Db, Tx } from '../db/client';
import { accounts, documents, emailTokens } from '../db/schema';
import { withRetry } from '../db/retry';
import { lockDocuments, writeChanges } from '../sync/documents';
import { roleForNewAccount } from '../access/policy';
import { hashPassword, verifyPassword, MAX_PASSWORD_LENGTH, MIN_PASSWORD_LENGTH } from './password';
import { endAllSessions, hashToken, newToken, type Account } from './session';
import { sendMail } from './mail';

export class AuthError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status = 400,
  ) {
    super(message);
  }
}

const MINUTE = 60_000;
const VERIFY_TTL = 24 * 60 * MINUTE;
const RESET_TTL = 60 * MINUTE;
const RESEND_AFTER = MINUTE;
/** Approval emails one account may trigger in a day. */
const MAX_VERIFY_EMAILS_PER_DAY = 5;
const MAX_FAILED_SIGN_INS = 8;
const LOCK_FOR = 15 * MINUTE;
/** New accounts allowed per hour, across everyone. Ten staff never reach it; a script hammering sign-up does. */
export const MAX_SIGN_UPS_PER_HOUR = 20;
const APP_NAME = 'PumpPal';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const normaliseEmail = (email: unknown): string => (typeof email === 'string' ? email.trim().toLowerCase() : '');

function checkCredentials(email: string, password: unknown): asserts password is string {
  if (!EMAIL.test(email) || email.length > 320) throw new AuthError('invalid-email', 'Enter a valid email address.');
  if (typeof password !== 'string' || password.length < MIN_PASSWORD_LENGTH) {
    throw new AuthError('weak-password', `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
  }
  if (password.length > MAX_PASSWORD_LENGTH) throw new AuthError('weak-password', 'Password is too long.');
}

/** 28 letters and digits, like the ids Firebase gave people. */
function newAccountId(): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  return Array.from(randomBytes(28), (b) => alphabet[b % alphabet.length]).join('');
}

const isDuplicate = (e: unknown): boolean => {
  for (let cur = e as { code?: string; cause?: unknown } | undefined, i = 0; cur && i < 5; cur = cur.cause as typeof cur, i++) {
    if (cur.code === 'ER_DUP_ENTRY') return true;
  }
  return false;
};

export async function findAccountByEmail(db: Db, email: string): Promise<Account | undefined> {
  const [row] = await db.select().from(accounts).where(eq(accounts.email, email)).limit(1);
  return row;
}

/**
 * Creates an account and nothing more. It has no role and reaches no data
 * until its email is confirmed (see confirmEmail). A new sign-up never takes
 * over an identity carried across from the old app.
 */
export async function signUp(db: Db, input: { email: unknown; password: unknown }, now = new Date()): Promise<Account> {
  const email = normaliseEmail(input.email);
  checkCredentials(email, input.password);

  const hourAgo = new Date(now.getTime() - 60 * MINUTE);
  const [{ recent }] = await db.select({ recent: sql<number>`COUNT(*)` }).from(accounts).where(gt(accounts.createdAt, hourAgo));
  if (Number(recent) >= MAX_SIGN_UPS_PER_HOUR) {
    throw new AuthError('too-many-sign-ups', 'Too many new accounts were created in the last hour. Please try again later.', 429);
  }
  if (await findAccountByEmail(db, email)) {
    throw new AuthError('email-in-use', 'This email is already registered. Sign in, or use "Forgot password".', 409);
  }

  const account: Account = { id: newAccountId(), email, passwordHash: await hashPassword(input.password), emailVerified: false, failedSignIns: 0, lockedUntil: null, createdAt: now };
  try {
    await db.insert(accounts).values(account);
  } catch (e) {
    if (isDuplicate(e)) throw new AuthError('email-in-use', 'This email is already registered. Sign in, or use "Forgot password".', 409);
    throw e;
  }
  return account;
}

/**
 * Marks the email as confirmed and, if the person has no role record yet,
 * creates one with the role the policy gives a newcomer. Must run inside a
 * transaction that will hold the documents lock.
 */
async function confirmEmail(tx: Tx, accountId: string, now: Date): Promise<void> {
  await lockDocuments(tx); // one at a time, so "first person" is decided once
  const [account] = await tx.select().from(accounts).where(eq(accounts.id, accountId)).for('update');
  if (!account) return;
  if (!account.emailVerified) await tx.update(accounts).set({ emailVerified: true }).where(eq(accounts.id, accountId));

  const roleRows = await tx
    .select({ docId: documents.docId })
    .from(documents)
    .where(and(eq(documents.collection, 'userRoles'), eq(documents.deleted, false)))
    .for('update');
  if (roleRows.some((row) => row.docId === accountId)) return;
  const roleId = roleForNewAccount({ isFirstAccount: roleRows.length === 0, email: account.email });
  await writeChanges(tx, [{ path: `userRoles/${accountId}`, data: { roleId, email: account.email } }], now);
}

/**
 * The owner vouches for an address from a script, for when the site cannot
 * send email yet. Has exactly the effect of the person opening their emailed
 * link: the address counts as confirmed and they get the newcomer's role, so
 * they then appear in Role Management. Returns false if there is no such account.
 */
export async function confirmAccountByOwner(db: Db, emailInput: unknown, now = new Date()): Promise<boolean> {
  const account = await findAccountByEmail(db, normaliseEmail(emailInput));
  if (!account) return false;
  await withRetry(() => db.transaction((tx) => confirmEmail(tx, account.id, now)));
  return true;
}

// Checked when the email is unknown, so a wrong email takes as long as a wrong password.
let decoyHash: Promise<string> | undefined;

/**
 * Checks a password. Attempts on one account are taken strictly one at a
 * time (the account's row is locked while its password is checked), so many
 * guesses fired at once cannot slip past the limit.
 */
export async function signIn(db: Db, input: { email: unknown; password: unknown }, now = new Date()): Promise<Account> {
  const email = normaliseEmail(input.email);
  const password = typeof input.password === 'string' ? input.password : '';

  const outcome = await withRetry(() =>
    db.transaction(async (tx): Promise<Account | AuthError> => {
      const [account] = await tx.select().from(accounts).where(eq(accounts.email, email)).for('update');
      if (!account) return new AuthError('invalid-credential', 'Incorrect email or password.', 401);
      if (account.lockedUntil && account.lockedUntil.getTime() > now.getTime()) {
        return new AuthError('too-many-attempts', 'Too many wrong passwords. Try again in 15 minutes, or use "Forgot password".', 429);
      }
      if (!account.passwordHash) {
        return new AuthError('no-password', 'This account has no password yet. Use "Forgot password" to set one.', 401);
      }
      if (!(await verifyPassword(password, account.passwordHash))) {
        const failed = account.failedSignIns + 1;
        const lock = failed >= MAX_FAILED_SIGN_INS;
        await tx
          .update(accounts)
          .set({ failedSignIns: lock ? 0 : failed, lockedUntil: lock ? new Date(now.getTime() + LOCK_FOR) : null })
          .where(eq(accounts.id, account.id));
        return new AuthError('invalid-credential', 'Incorrect email or password.', 401);
      }
      if (account.failedSignIns !== 0 || account.lockedUntil) {
        await tx.update(accounts).set({ failedSignIns: 0, lockedUntil: null }).where(eq(accounts.id, account.id));
      }
      return { ...account, failedSignIns: 0, lockedUntil: null };
    }),
  );

  if (outcome instanceof AuthError) {
    if (outcome.code === 'invalid-credential') {
      decoyHash ??= hashPassword('decoy-password-never-matches');
      await verifyPassword(password, await decoyHash);
    }
    throw outcome;
  }
  return outcome;
}

async function issueEmailToken(db: Db, accountId: string, purpose: 'verify' | 'reset', ttl: number, now: Date, dailyLimit?: number): Promise<string | null> {
  const live = await db
    .select({ expiresAt: emailTokens.expiresAt })
    .from(emailTokens)
    .where(and(eq(emailTokens.accountId, accountId), eq(emailTokens.purpose, purpose), gt(emailTokens.expiresAt, now)))
    .orderBy(desc(emailTokens.expiresAt));
  // One was sent a moment ago: do not send another (the "resend" button, a double click).
  if (live[0] && live[0].expiresAt.getTime() - ttl > now.getTime() - RESEND_AFTER) return null;
  if (dailyLimit && live.filter((t) => t.expiresAt.getTime() - ttl > now.getTime() - 24 * 60 * MINUTE).length >= dailyLimit) return null;
  const token = newToken();
  await db.insert(emailTokens).values({ tokenHash: hashToken(token), accountId, purpose, expiresAt: new Date(now.getTime() + ttl) });
  return token;
}

/** Uses up a one-time link. Returns whose it was, or null. Two requests with the same link: only one wins. */
async function redeemEmailToken(db: Db | Tx, token: unknown, purpose: 'verify' | 'reset', now: Date, mustBelongTo?: string): Promise<string | null> {
  if (typeof token !== 'string' || token.length < 20) return null;
  const tokenHash = hashToken(token);
  const [row] = await db.select().from(emailTokens).where(eq(emailTokens.tokenHash, tokenHash)).limit(1);
  if (!row || row.purpose !== purpose || row.usedAt || row.expiresAt.getTime() <= now.getTime()) return null;
  // Checked BEFORE the link is used up, so someone else opening it cannot burn it.
  if (mustBelongTo !== undefined && row.accountId !== mustBelongTo) return null;
  const [done] = await db.update(emailTokens).set({ usedAt: now }).where(and(eq(emailTokens.tokenHash, tokenHash), isNull(emailTokens.usedAt)));
  return (done as { affectedRows?: number }).affectedRows === 1 ? row.accountId : null;
}

/** Emails the "approve this sign-in" link. Does nothing for an address that is already confirmed. */
export async function startVerification(db: Db, account: Account, origin: string, now = new Date()): Promise<'sent' | 'already-verified' | 'recently-sent'> {
  if (account.emailVerified) return 'already-verified';
  const token = await issueEmailToken(db, account.id, 'verify', VERIFY_TTL, now, MAX_VERIFY_EMAILS_PER_DAY);
  if (!token) return 'recently-sent';
  const link = `${origin}/verify?token=${encodeURIComponent(token)}`;
  await sendMail({
    to: account.email,
    subject: `${APP_NAME}: approve your sign-in`,
    text: `Open this link in the same browser where you are signing in to ${APP_NAME}:\n\n${link}\n\nThe link works once and expires in 24 hours. If you did not try to sign in, ignore this email: nothing happens unless the link is opened by the person who is signing in.`,
    link,
  });
  return 'sent';
}

/**
 * Confirms an email address. The link only counts when it is opened by the
 * signed-in account it was sent for. Anyone can type someone else's address
 * into the sign-up form; if that person (or their mail program scanning the
 * link) opens it, nothing happens, because they are not signed in as the
 * account that asked.
 */
export async function completeVerification(db: Db, token: unknown, signedInAccountId: string, now = new Date()): Promise<boolean> {
  return withRetry(() =>
    db.transaction(async (tx) => {
      const accountId = await redeemEmailToken(tx, token, 'verify', now, signedInAccountId);
      if (!accountId) return false;
      await confirmEmail(tx, accountId, now);
      return true;
    }),
  );
}

/** Emails a reset link if the address has an account. Never says whether it does. */
export async function requestPasswordReset(db: Db, emailInput: unknown, origin: string, now = new Date()): Promise<void> {
  const account = await findAccountByEmail(db, normaliseEmail(emailInput));
  if (!account) return;
  const token = await issueEmailToken(db, account.id, 'reset', RESET_TTL, now);
  if (!token) return;
  const link = `${origin}/reset-password?token=${encodeURIComponent(token)}`;
  await sendMail({
    to: account.email,
    subject: `${APP_NAME}: set a new password`,
    text: `Open this link to choose a new password for ${APP_NAME}:\n\n${link}\n\nThe link works once and expires in 1 hour. If you did not ask for this, ignore this email.`,
    link,
  });
}

/**
 * Makes a one-time "choose your password" link without sending any email,
 * for the owner to pass on by hand while the site cannot send mail. It is the
 * same link "Forgot password" would email: it works once and expires in an
 * hour. Returns null if there is no such account, or one was made a moment ago.
 */
export async function createPasswordSetupLink(db: Db, emailInput: unknown, origin: string, now = new Date()): Promise<string | null> {
  const account = await findAccountByEmail(db, normaliseEmail(emailInput));
  if (!account) return null;
  const token = await issueEmailToken(db, account.id, 'reset', RESET_TTL, now);
  return token ? `${origin}/reset-password?token=${encodeURIComponent(token)}` : null;
}

/**
 * Sets a new password from a reset link. Whoever opens that link can read the
 * mailbox, so it also confirms the address; every other device is signed out
 * and any other reset link still in the mailbox stops working.
 */
export async function completePasswordReset(db: Db, token: unknown, password: unknown, now = new Date()): Promise<boolean> {
  if (typeof password !== 'string' || password.length < MIN_PASSWORD_LENGTH || password.length > MAX_PASSWORD_LENGTH) {
    throw new AuthError('weak-password', `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
  }
  const passwordHash = await hashPassword(password);
  const accountId = await withRetry(() =>
    db.transaction(async (tx) => {
      await lockDocuments(tx); // same lock order as email confirmation, so the two can never block each other
      const id = await redeemEmailToken(tx, token, 'reset', now);
      if (!id) return null;
      await tx.update(accounts).set({ passwordHash, failedSignIns: 0, lockedUntil: null }).where(eq(accounts.id, id));
      await tx.update(emailTokens).set({ usedAt: now }).where(and(eq(emailTokens.accountId, id), eq(emailTokens.purpose, 'reset'), isNull(emailTokens.usedAt)));
      await confirmEmail(tx, id, now);
      return id;
    }),
  );
  if (!accountId) return false;
  await endAllSessions(db, accountId);
  return true;
}
