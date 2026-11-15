import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import type { Db } from '../../src/server/db/client';
import { accounts } from '../../src/server/db/schema';
import { AuthError, completePasswordReset, completeVerification, requestPasswordReset, signIn, signUp, startVerification } from '../../src/server/auth/accounts';
import { createSession, endSession, findSession } from '../../src/server/auth/session';
import { setDeliverForTests, type Mail } from '../../src/server/auth/mail';
import { resolveActor } from '../../src/server/access/actor';
import { roleForNewAccount } from '../../src/server/access/policy';
import { lockDocuments, readDocs, writeChanges } from '../../src/server/sync/documents';
import { closeTestDb, freshTestDb } from './test-db';

let db: Db;
let mails: Mail[];
const ORIGIN = 'http://localhost:3000';
const tokenIn = (mail: Mail) => new URL(mail.link).searchParams.get('token')!;

beforeEach(async () => {
  db = await freshTestDb();
  mails = [];
  setDeliverForTests(async (mail) => void mails.push(mail));
});
afterAll(closeTestDb);

describe('sign-up', () => {
  it('makes the first person the admin and gives later people the role the policy names', async () => {
    const first = await signUp(db, { email: 'Owner@Example.com ', password: 'secret-1' });
    const second = await signUp(db, { email: 'staff@example.com', password: 'secret-2' });

    expect(first.email).toBe('owner@example.com');
    const roles = await readDocs(db, [`userRoles/${first.id}`, `userRoles/${second.id}`]);
    expect(roles.get(`userRoles/${first.id}`)).toEqual({ roleId: 'admin', email: 'owner@example.com' });
    expect(roles.get(`userRoles/${second.id}`)).toEqual({ roleId: roleForNewAccount({ isFirstAccount: false, email: 'staff@example.com' }), email: 'staff@example.com' });
  });

  it('stores a hash, never the password', async () => {
    const account = await signUp(db, { email: 'owner@example.com', password: 'plain-text-pw' });
    const [row] = await db.select().from(accounts).where(eq(accounts.id, account.id));
    expect(row.passwordHash).toMatch(/^scrypt\$/);
    expect(JSON.stringify(row)).not.toContain('plain-text-pw');
  });

  it('refuses a second account for the same email, and bad input', async () => {
    await signUp(db, { email: 'owner@example.com', password: 'secret-1' });
    await expect(signUp(db, { email: 'OWNER@example.com', password: 'another-1' })).rejects.toMatchObject({ code: 'email-in-use' });
    await expect(signUp(db, { email: 'not-an-email', password: 'secret-1' })).rejects.toMatchObject({ code: 'invalid-email' });
    await expect(signUp(db, { email: 'x@example.com', password: '12345' })).rejects.toMatchObject({ code: 'weak-password' });
  });

  it('someone from the old app keeps their id and role when they register the same email', async () => {
    await db.transaction(async (tx) => {
      await lockDocuments(tx);
      await writeChanges(tx, [
        { path: 'userRoles/firebaseUid123', data: { roleId: 'admin', email: 'Owner@Example.com' } },
        { path: 'roles/admin', data: { name: 'Admin', permissions: [] } },
      ]);
    });
    const account = await signUp(db, { email: 'owner@example.com', password: 'secret-1' });
    expect(account.id).toBe('firebaseUid123');
    // ...but the role does them no good until they prove the email is theirs.
    expect((await resolveActor(db, account)).active).toBe(false);
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
});

describe('email approval', () => {
  it('a new account is not active until its emailed link is opened, and the link works once', async () => {
    const account = await signUp(db, { email: 'owner@example.com', password: 'secret-1' });
    expect((await resolveActor(db, account)).active).toBe(false);

    expect(await startVerification(db, account, ORIGIN)).toBe('sent');
    expect(await startVerification(db, account, ORIGIN)).toBe('recently-sent');
    expect(mails).toHaveLength(1);
    expect(mails[0].to).toBe('owner@example.com');

    expect(await completeVerification(db, 'wrong-token-wrong-token-wrong')).toBe(false);
    expect(await completeVerification(db, tokenIn(mails[0]))).toBe(true);
    expect(await completeVerification(db, tokenIn(mails[0]))).toBe(false);

    const [fresh] = await db.select().from(accounts).where(eq(accounts.id, account.id));
    expect((await resolveActor(db, fresh)).active).toBe(true);
    expect(await startVerification(db, fresh, ORIGIN)).toBe('already-verified');
  });

  it('an expired link does nothing', async () => {
    const account = await signUp(db, { email: 'owner@example.com', password: 'secret-1' });
    await startVerification(db, account, ORIGIN);
    const tomorrow = new Date(Date.now() + 25 * 3600_000);
    expect(await completeVerification(db, tokenIn(mails[0]), tomorrow)).toBe(false);
  });
});

describe('password reset', () => {
  it('sets a new password, signs out other devices, and says nothing about unknown emails', async () => {
    const account = await signUp(db, { email: 'owner@example.com', password: 'old-secret' });
    const { token: session } = await createSession(db, account.id);

    await requestPasswordReset(db, 'nobody@example.com', ORIGIN);
    expect(mails).toHaveLength(0);

    await requestPasswordReset(db, 'OWNER@example.com', ORIGIN);
    expect(mails).toHaveLength(1);
    expect(mails[0].link).toContain('/reset-password?token=');

    await expect(completePasswordReset(db, tokenIn(mails[0]), '123')).rejects.toMatchObject({ code: 'weak-password' });
    expect(await completePasswordReset(db, tokenIn(mails[0]), 'new-secret')).toBe(true);
    expect(await completePasswordReset(db, tokenIn(mails[0]), 'again-secret')).toBe(false);

    expect(await findSession(db, session)).toBeNull();
    await expect(signIn(db, { email: 'owner@example.com', password: 'old-secret' })).rejects.toMatchObject({ code: 'invalid-credential' });
    const signedIn = await signIn(db, { email: 'owner@example.com', password: 'new-secret' });
    expect(signedIn.emailVerified).toBe(true); // opening the emailed link proved the address
  });
});
