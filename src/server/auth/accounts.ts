/**
 * Sign-up, sign-in, "approve by email" and password reset. This replaces
 * Firebase Authentication; the screens call it the same way they always did.
 */
import { randomBytes } from 'node:crypto';
import { and, desc, eq, isNull, sql } from 'drizzle-orm';
import type { Db } from '../db/client';
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
const MAX_FAILED_SIGN_INS = 8;
const LOCK_FOR = 15 * MINUTE;
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
 * Creates an account. The SERVER decides the role (the browser used to pick
 * its own). Someone who was already in the old app's user list keeps their
 * existing role record when they register the same email address.
 */
export async function signUp(db: Db, input: { email: unknown; password: unknown }, now = new Date()): Promise<Account> {
  const email = normaliseEmail(input.email);
  checkCredentials(email, input.password);
  const passwordHash = await hashPassword(input.password);

  try {
    return await withRetry(() =>
      db.transaction(async (tx) => {
        await lockDocuments(tx); // one sign-up at a time, so "first account" is decided once
        const [existing] = await tx.select({ id: accounts.id }).from(accounts).where(eq(accounts.email, email)).limit(1);
        if (existing) throw new AuthError('email-in-use', 'This email is already registered. Sign in, or use "Forgot password".', 409);

        const roleRows = await tx
          .select({ docId: documents.docId, dataRaw: documents.dataRaw })
          .from(documents)
          .where(and(eq(documents.collection, 'userRoles'), eq(documents.deleted, false)));
        const [{ total }] = await tx.select({ total: sql<number>`COUNT(*)` }).from(accounts);
        const takenIds = new Set((await tx.select({ id: accounts.id }).from(accounts)).map((a) => a.id));

        const earlier = roleRows.find((r) => {
          const recordEmail = (JSON.parse(r.dataRaw) as { email?: unknown }).email;
          return normaliseEmail(recordEmail) === email && !takenIds.has(r.docId);
        });

        const id = earlier?.docId ?? newAccountId();
        if (!earlier) {
          const roleId = roleForNewAccount({ isFirstAccount: Number(total) === 0 && roleRows.length === 0, email });
          await writeChanges(tx, [{ path: `userRoles/${id}`, data: { roleId, email } }], now);
        }
        const account: Account = { id, email, passwordHash, emailVerified: false, failedSignIns: 0, lockedUntil: null, createdAt: now };
        await tx.insert(accounts).values(account);
        return account;
      }),
    );
  } catch (e) {
    if (isDuplicate(e)) throw new AuthError('email-in-use', 'This email is already registered. Sign in, or use "Forgot password".', 409);
    throw e;
  }
}

// Checked when the email is unknown, so a wrong email takes as long as a wrong password.
let decoyHash: Promise<string> | undefined;

export async function signIn(db: Db, input: { email: unknown; password: unknown }, now = new Date()): Promise<Account> {
  const email = normaliseEmail(input.email);
  const password = typeof input.password === 'string' ? input.password : '';
  const wrong = () => new AuthError('invalid-credential', 'Incorrect email or password.', 401);

  const account = await findAccountByEmail(db, email);
  if (!account) {
    decoyHash ??= hashPassword('decoy-password-never-matches');
    await verifyPassword(password, await decoyHash);
    throw wrong();
  }
  if (account.lockedUntil && account.lockedUntil.getTime() > now.getTime()) {
    throw new AuthError('too-many-attempts', 'Too many wrong passwords. Try again in 15 minutes, or use "Forgot password".', 429);
  }
  if (!account.passwordHash) {
    throw new AuthError('no-password', 'This account has no password yet. Use "Forgot password" to set one.', 401);
  }
  if (!(await verifyPassword(password, account.passwordHash))) {
    const failed = account.failedSignIns + 1;
    const lock = failed >= MAX_FAILED_SIGN_INS;
    await db
      .update(accounts)
      .set({ failedSignIns: lock ? 0 : failed, lockedUntil: lock ? new Date(now.getTime() + LOCK_FOR) : null })
      .where(eq(accounts.id, account.id));
    throw wrong();
  }
  if (account.failedSignIns !== 0 || account.lockedUntil) {
    await db.update(accounts).set({ failedSignIns: 0, lockedUntil: null }).where(eq(accounts.id, account.id));
  }
  return { ...account, failedSignIns: 0, lockedUntil: null };
}

async function issueEmailToken(db: Db, accountId: string, purpose: 'verify' | 'reset', ttl: number, now: Date): Promise<string | null> {
  const [latest] = await db
    .select({ expiresAt: emailTokens.expiresAt })
    .from(emailTokens)
    .where(and(eq(emailTokens.accountId, accountId), eq(emailTokens.purpose, purpose), isNull(emailTokens.usedAt)))
    .orderBy(desc(emailTokens.expiresAt))
    .limit(1);
  // One was sent a moment ago: do not send another (the "resend" button, a double click).
  if (latest && latest.expiresAt.getTime() - ttl > now.getTime() - RESEND_AFTER) return null;
  const token = newToken();
  await db.insert(emailTokens).values({ tokenHash: hashToken(token), accountId, purpose, expiresAt: new Date(now.getTime() + ttl) });
  return token;
}

async function redeemEmailToken(db: Db, token: unknown, purpose: 'verify' | 'reset', now: Date): Promise<string | null> {
  if (typeof token !== 'string' || token.length < 20) return null;
  const tokenHash = hashToken(token);
  const [row] = await db.select().from(emailTokens).where(eq(emailTokens.tokenHash, tokenHash)).limit(1);
  if (!row || row.purpose !== purpose || row.usedAt || row.expiresAt.getTime() <= now.getTime()) return null;
  const [done] = await db.update(emailTokens).set({ usedAt: now }).where(and(eq(emailTokens.tokenHash, tokenHash), isNull(emailTokens.usedAt)));
  return (done as { affectedRows?: number }).affectedRows === 1 ? row.accountId : null;
}

/** Emails the "approve this sign-in" link. Does nothing for an address that is already verified. */
export async function startVerification(db: Db, account: Account, origin: string, now = new Date()): Promise<'sent' | 'already-verified' | 'recently-sent'> {
  if (account.emailVerified) return 'already-verified';
  const token = await issueEmailToken(db, account.id, 'verify', VERIFY_TTL, now);
  if (!token) return 'recently-sent';
  const link = `${origin}/api/auth/verify?token=${encodeURIComponent(token)}`;
  await sendMail({
    to: account.email,
    subject: `${APP_NAME}: approve your sign-in`,
    text: `Open this link to approve your sign-in to ${APP_NAME}:\n\n${link}\n\nThe link works once and expires in 24 hours. If you did not try to sign in, ignore this email.`,
    link,
  });
  return 'sent';
}

export async function completeVerification(db: Db, token: unknown, now = new Date()): Promise<boolean> {
  const accountId = await redeemEmailToken(db, token, 'verify', now);
  if (!accountId) return false;
  await db.update(accounts).set({ emailVerified: true }).where(eq(accounts.id, accountId));
  return true;
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

/** Sets a new password from a reset link. Opening the link also proves the email address, and signs out every other device. */
export async function completePasswordReset(db: Db, token: unknown, password: unknown, now = new Date()): Promise<boolean> {
  if (typeof password !== 'string' || password.length < MIN_PASSWORD_LENGTH || password.length > MAX_PASSWORD_LENGTH) {
    throw new AuthError('weak-password', `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
  }
  const passwordHash = await hashPassword(password);
  const accountId = await redeemEmailToken(db, token, 'reset', now);
  if (!accountId) return false;
  await db.update(accounts).set({ passwordHash, emailVerified: true, failedSignIns: 0, lockedUntil: null }).where(eq(accounts.id, accountId));
  await endAllSessions(db, accountId);
  return true;
}
