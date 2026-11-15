import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import type { Db } from '../../src/server/db/client';
import { accounts } from '../../src/server/db/schema';
import { AuthError, completePasswordReset, completeVerification, confirmAccountByOwner, MAX_SIGN_UPS_PER_HOUR, requestPasswordReset, signIn, signUp, startVerification } from '../../src/server/auth/accounts';
import { createSession, endSession, findSession, type Account } from '../../src/server/auth/session';
import { setDeliverForTests, type Mail } from '../../src/server/auth/mail';
import { resolveActor } from '../../src/server/access/actor';
import { PENDING_ROLE, roleForNewAccount } from '../../src/server/access/policy';
import { lockDocuments, pullChanges, pushChanges, readDocs, writeChanges } from '../../src/server/sync/documents';
import { closeTestDb, freshTestDb } from './test-db';

let db: Db;
let mails: Mail[];
const ORIGIN = 'http://localhost:3000';
const tokenIn = (mail: Mail) => new URL(mail.link).searchParams.get('token')!;
const fresh = async (id: string): Promise<Account> => (await db.select().from(accounts).where(eq(accounts.id, id)))[0];

/** Sign up and open the emailed link as that same person. */
async function signUpAndConfirm(email: string, password = 'secret-1'): Promise<Account> {
  const account = await signUp(db, { email, password });
  const before = mails.length;
  await startVerification(db, account, ORIGIN);
  expect(await completeVerification(db, tokenIn(mails[before]), account.id)).toBe(true);
  return fresh(account.id);
}

beforeEach(async () => {
  db = await freshTestDb();
  mails = [];
  setDeliverForTests(async (mail) => void mails.push(mail));
});
afterAll(closeTestDb);

describe('sign-up', () => {
  it('creates an account with no role and no access', async () => {
    const account = await signUp(db, { email: 'Owner@Example.com ', password: 'secret-1' });
    expect(account.email).toBe('owner@example.com');
    expect((await readDocs(db, [`userRoles/${account.id}`])).size).toBe(0);
    expect(await resolveActor(db, account)).toMatchObject({ active: false, roleId: null });
    // Nothing was added to the records every device downloads.
    expect((await pullChanges(db, 0)).docs).toHaveLength(0);
  });

  it('stores a hash, never the password', async () => {
    const account = await signUp(db, { email: 'owner@example.com', password: 'plain-text-pw' });
    const row = await fresh(account.id);
    expect(row.passwordHash).toMatch(/^scrypt\$/);
    expect(JSON.stringify(row)).not.toContain('plain-text-pw');
  });

  it('refuses a second account for the same email, and bad input', async () => {
    await signUp(db, { email: 'owner@example.com', password: 'secret-1' });
    await expect(signUp(db, { email: 'OWNER@example.com', password: 'another-1' })).rejects.toMatchObject({ code: 'email-in-use' });
    await expect(signUp(db, { email: 'not-an-email', password: 'secret-1' })).rejects.toMatchObject({ code: 'invalid-email' });
    await expect(signUp(db, { email: 'x@example.com', password: '12345' })).rejects.toMatchObject({ code: 'weak-password' });
  });

  it('stops a flood of new accounts', async () => {
    const now = new Date();
    await db.insert(accounts).values(Array.from({ length: MAX_SIGN_UPS_PER_HOUR }, (_, i) => ({ id: `flood${i}`, email: `flood${i}@example.com`, passwordHash: null, emailVerified: false, createdAt: now })));
    await expect(signUp(db, { email: 'one-more@example.com', password: 'secret-1' })).rejects.toMatchObject({ code: 'too-many-sign-ups', status: 429 });
    // An hour later the door is open again.
    const later = new Date(now.getTime() + 61 * 60_000);
    await expect(signUp(db, { email: 'one-more@example.com', password: 'secret-1' }, later)).resolves.toBeTruthy();
  });

  it('cannot be used to take over someone carried across from the old app', async () => {
    // The old app's records say this email is an admin, but (disabled or deleted there) it has no account here.
    await db.transaction(async (tx) => {
      await lockDocuments(tx);
      await writeChanges(tx, [
        { path: 'userRoles/firebaseUidOfExEmployee', data: { roleId: 'admin', email: 'ex@example.com' } },
        { path: 'roles/admin', data: { name: 'Admin', permissions: [] } },
      ]);
    });
    const stranger = await signUpAndConfirm('ex@example.com');
    expect(stranger.id).not.toBe('firebaseUidOfExEmployee');
    expect(await resolveActor(db, stranger)).toMatchObject({ active: false, roleId: PENDING_ROLE });
    // The old record is untouched.
    expect((await readDocs(db, ['userRoles/firebaseUidOfExEmployee'])).get('userRoles/firebaseUidOfExEmployee')).toEqual({ roleId: 'admin', email: 'ex@example.com' });
  });
});

describe('who gets in', () => {
  it('on an empty system, the first person to confirm their email becomes the admin', async () => {
    const owner = await signUpAndConfirm('owner@example.com');
    expect(await resolveActor(db, owner)).toMatchObject({ active: true, roleId: 'admin' });
  });

  it('a stranger who signs up and confirms their own email still reaches nothing until an admin gives them a role', async () => {
    const owner = await signUpAndConfirm('owner@example.com');
    const stranger = await signUpAndConfirm('stranger@example.com');
    const expected = roleForNewAccount({ isFirstAccount: false, email: 'stranger@example.com' });
    expect((await readDocs(db, [`userRoles/${stranger.id}`])).get(`userRoles/${stranger.id}`)).toEqual({ roleId: expected, email: 'stranger@example.com' });

    // This is the rule the owner is asked to decide. Whatever it says, "pending" must mean no access.
    if (expected === PENDING_ROLE) {
      expect((await resolveActor(db, stranger)).active).toBe(false);
      const admin = await resolveActor(db, owner);
      const approve = await pushChanges(db, admin, [{ opId: 'op-approve-01', path: `userRoles/${stranger.id}`, type: 'update', data: { roleId: 'attendant' } }]);
      expect(approve.results[0].status).toBe('applied');
    }
    expect((await resolveActor(db, stranger)).active).toBe(true);
  });
});

describe('confirming an account by hand (no email set up yet)', () => {
  it('has the same effect as the emailed link: confirmed, and waiting for a role', async () => {
    const owner = await signUpAndConfirm('owner@example.com');
    const staff = await signUp(db, { email: 'staff@example.com', password: 'secret-1' });
    expect(await confirmAccountByOwner(db, 'nobody@example.com')).toBe(false);
    expect(await confirmAccountByOwner(db, 'Staff@Example.com')).toBe(true);
    expect(await confirmAccountByOwner(db, 'staff@example.com')).toBe(true); // doing it twice changes nothing

    const role = (await readDocs(db, [`userRoles/${staff.id}`])).get(`userRoles/${staff.id}`);
    expect(role).toEqual({ roleId: roleForNewAccount({ isFirstAccount: false, email: 'staff@example.com' }), email: 'staff@example.com' });
    expect((await fresh(staff.id)).emailVerified).toBe(true);
    // The owner's own role is untouched.
    expect((await resolveActor(db, owner)).roleId).toBe('admin');
  });
});

describe('sign-in', () => {
  it('accepts the right password only', async () => {
    await signUp(db, { email: 'owner@example.com', password: 'secret-1' });
    await expect(signIn(db, { email: 'owner@example.com', password: 'secret-1' })).resolves.toMatchObject({ email: 'owner@example.com' });
    await expect(signIn(db, { email: 'owner@example.com', password: 'secret-2' })).rejects.toMatchObject({ code: 'invalid-credential' });
    await expect(signIn(db, { email: 'nobody@example.com', password: 'secret-1' })).rejects.toMatchObject({ code: 'invalid-credential' });
  });

  it('locks the account after repeated wrong passwords', async () => {
    await signUp(db, { email: 'owner@example.com', password: 'secret-1' });
    for (let i = 0; i < 8; i++) {
      await expect(signIn(db, { email: 'owner@example.com', password: 'wrong-pw' })).rejects.toBeInstanceOf(AuthError);
    }
    await expect(signIn(db, { email: 'owner@example.com', password: 'secret-1' })).rejects.toMatchObject({ code: 'too-many-attempts' });
    const later = new Date(Date.now() + 16 * 60_000);
    await expect(signIn(db, { email: 'owner@example.com', password: 'secret-1' }, later)).resolves.toBeTruthy();
  });

  it('many guesses fired at the same instant cannot slip past the limit', async () => {
    await signUp(db, { email: 'owner@example.com', password: 'secret-1' });
    const guesses = await Promise.all(
      Array.from({ length: 24 }, (_, i) => signIn(db, { email: 'owner@example.com', password: `guess-${i}` }).then(() => 'ok', (e: AuthError) => e.code)),
    );
    const tested = guesses.filter((code) => code === 'invalid-credential').length;
    expect(tested).toBe(8); // exactly eight passwords were actually checked
    expect(guesses.filter((code) => code === 'too-many-attempts')).toHaveLength(16);
  });

  it('a migrated person with no password is told to set one', async () => {
    await db.insert(accounts).values({ id: 'uid1', email: 'old@example.com', passwordHash: null, emailVerified: true, createdAt: new Date() });
    await expect(signIn(db, { email: 'old@example.com', password: 'anything' })).rejects.toMatchObject({ code: 'no-password' });
  });
});

describe('sessions', () => {
  it('a cookie value finds its account until it is ended or expires', async () => {
    const account = await signUp(db, { email: 'owner@example.com', password: 'secret-1' });
    const { token } = await createSession(db, account.id);
    expect((await findSession(db, token))?.account.id).toBe(account.id);
    expect(await findSession(db, 'not-a-real-token')).toBeNull();
    expect(await findSession(db, token, new Date(Date.now() + 31 * 24 * 3600_000))).toBeNull();
    await endSession(db, token);
    expect(await findSession(db, token)).toBeNull();
  });

  it('a session in regular use is extended, and says so, so the cookie can be extended with it', async () => {
    const account = await signUp(db, { email: 'owner@example.com', password: 'secret-1' });
    const { token, expiresAt } = await createSession(db, account.id);
    expect((await findSession(db, token))?.renewed).toBe(false);
    const inTenDays = new Date(Date.now() + 10 * 24 * 3600_000);
    const later = await findSession(db, token, inTenDays);
    expect(later?.renewed).toBe(true);
    expect(later!.expiresAt.getTime()).toBeGreaterThan(expiresAt.getTime());
  });
});

describe('email approval', () => {
  it('the link works once, and only for the signed-in account it was sent for', async () => {
    const owner = await signUpAndConfirm('owner@example.com');
    // Someone signs up using a staff member's address and their own password.
    const impostor = await signUp(db, { email: 'staff@example.com', password: 'attacker-pw' });
    expect(await startVerification(db, impostor, ORIGIN)).toBe('sent');
    expect(await startVerification(db, impostor, ORIGIN)).toBe('recently-sent');
    const token = tokenIn(mails[mails.length - 1]);

    // The real staff member (signed in as someone else, here the owner) opens the email: nothing happens,
    // and the link is not used up by it.
    expect(await completeVerification(db, token, owner.id)).toBe(false);
    expect((await fresh(impostor.id)).emailVerified).toBe(false);
    expect(await completeVerification(db, 'wrong-token-wrong-token-wrong', impostor.id)).toBe(false);

    // Only the browser signed in as that account can use it, once.
    expect(await completeVerification(db, token, impostor.id)).toBe(true);
    expect(await completeVerification(db, token, impostor.id)).toBe(false);
    expect(await startVerification(db, await fresh(impostor.id), ORIGIN)).toBe('already-verified');
  });

  it('an expired link does nothing, and one account cannot send endless emails', async () => {
    const account = await signUp(db, { email: 'owner@example.com', password: 'secret-1' });
    await startVerification(db, account, ORIGIN);
    const tomorrow = new Date(Date.now() + 25 * 3600_000);
    expect(await completeVerification(db, tokenIn(mails[0]), account.id, tomorrow)).toBe(false);

    let sent = 1;
    for (let i = 1; i <= 8; i++) {
      const at = new Date(Date.now() + i * 5 * 60_000); // every five minutes
      if ((await startVerification(db, account, ORIGIN, at)) === 'sent') sent++;
    }
    expect(sent).toBe(5);
  });
});

describe('password reset', () => {
  it('sets a new password, signs out other devices, cancels other reset links, and says nothing about unknown emails', async () => {
    const account = await signUpAndConfirm('owner@example.com', 'old-secret');
    const { token: session } = await createSession(db, account.id);
    mails = [];

    await requestPasswordReset(db, 'nobody@example.com', ORIGIN);
    expect(mails).toHaveLength(0);

    await requestPasswordReset(db, 'OWNER@example.com', ORIGIN);
    await requestPasswordReset(db, 'owner@example.com', ORIGIN, new Date(Date.now() + 5 * 60_000));
    expect(mails).toHaveLength(2);
    expect(mails[0].link).toContain('/reset-password?token=');

    await expect(completePasswordReset(db, tokenIn(mails[0]), '123')).rejects.toMatchObject({ code: 'weak-password' });
    expect(await completePasswordReset(db, tokenIn(mails[0]), 'new-secret')).toBe(true);
    expect(await completePasswordReset(db, tokenIn(mails[0]), 'again-secret')).toBe(false);
    expect(await completePasswordReset(db, tokenIn(mails[1]), 'other-secret')).toBe(false); // the older link in the mailbox is dead too

    expect(await findSession(db, session)).toBeNull();
    await expect(signIn(db, { email: 'owner@example.com', password: 'old-secret' })).rejects.toMatchObject({ code: 'invalid-credential' });
    await expect(signIn(db, { email: 'owner@example.com', password: 'new-secret' })).resolves.toMatchObject({ emailVerified: true });
  });

  it('a reset confirms the address but does not hand out access', async () => {
    await signUpAndConfirm('owner@example.com');
    const newcomer = await signUp(db, { email: 'new@example.com', password: 'secret-1' });
    mails = [];
    await requestPasswordReset(db, 'new@example.com', ORIGIN);
    expect(await completePasswordReset(db, tokenIn(mails[0]), 'secret-2')).toBe(true);
    const actor = await resolveActor(db, await fresh(newcomer.id));
    expect(actor.emailVerified).toBe(true);
    expect(actor.active).toBe(roleForNewAccount({ isFirstAccount: false, email: 'new@example.com' }) !== PENDING_ROLE);
  });
});
