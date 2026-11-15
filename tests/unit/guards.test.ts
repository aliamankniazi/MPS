import { describe, expect, it } from 'vitest';
import { checkTarget } from '../../src/server/db/remote-guard';
import { canRead, canWrite, isActive, PENDING_ROLE, roleForNewAccount, type Actor } from '../../src/server/access/policy';
import { hashPassword, verifyPassword } from '../../src/server/auth/password';
import { connectionOptions, databaseUrl } from '../../src/server/db/client';

describe('remote guard', () => {
  it('lets a script write to this PC', () => {
    expect(checkTarget('mysql://root:x@127.0.0.1:3406/mps', undefined)).toEqual({ host: '127.0.0.1', remote: false });
    expect(checkTarget('mysql://root:x@localhost/mps', undefined).remote).toBe(false);
  });

  it('refuses any other host unless the command names exactly that host', () => {
    const cloud = 'mysql://u:p@gateway01.ap-northeast-1.prod.aws.tidbcloud.com:4000/mps';
    expect(() => checkTarget(cloud, undefined)).toThrow(/refusing/);
    expect(() => checkTarget(cloud, 'some-other-host')).toThrow(/refusing/);
    expect(checkTarget(cloud, 'gateway01.ap-northeast-1.prod.aws.tidbcloud.com').remote).toBe(true);
  });
});

describe('database address', () => {
  it('uses TLS for anything that is not this PC, and none locally', () => {
    expect(connectionOptions('mysql://u:p@db.example.com:4000/mps').ssl).toMatchObject({ rejectUnauthorized: true });
    expect(connectionOptions('mysql://u:p@127.0.0.1:3406/mps').ssl).toBeUndefined();
  });

  it('never lands in the server\'s own database when built from TIDB_* settings', () => {
    const url = databaseUrl({ TIDB_HOST: 'h', TIDB_USER: 'u', TIDB_PASSWORD: 'p@ss', TIDB_DATABASE: 'test' });
    expect(new URL(url!).pathname).toBe('/mps');
  });

  it('a TiDB connection string pasted as given (ending in /test) still lands in the app\'s own database', () => {
    const pasted = 'mysql://abc123.root:pw@gateway01.ap-northeast-1.prod.aws.tidbcloud.com:4000/test?ssl-mode=VERIFY_IDENTITY';
    const url = new URL(databaseUrl({ DATABASE_URL: pasted })!);
    expect(url.pathname).toBe('/mps');
    expect(url.hostname).toBe('gateway01.ap-northeast-1.prod.aws.tidbcloud.com');
    expect(connectionOptions(url.toString())).toMatchObject({ user: 'abc123.root', port: 4000, database: 'mps' });
    // A database of the app's own is left exactly as named.
    expect(new URL(databaseUrl({ DATABASE_URL: 'mysql://u:p@127.0.0.1:3406/mps_rehearsal' })!).pathname).toBe('/mps_rehearsal');
  });
});

describe('access rules', () => {
  const actor = (over: Partial<Actor>): Actor => ({ accountId: 'a1', email: 'a@b.c', emailVerified: true, roleId: 'attendant', active: true, ...over });

  it('the first account on an empty system becomes the admin', () => {
    expect(roleForNewAccount({ isFirstAccount: true, email: 'a@b.c' })).toBe('admin');
  });

  it('only a verified email with a real role is active', () => {
    const known = new Set(['admin', 'attendant', 'manager']);
    expect(isActive(true, 'manager', known)).toBe(true);
    expect(isActive(false, 'admin', known)).toBe(false);
    expect(isActive(true, null, known)).toBe(false);
    expect(isActive(true, PENDING_ROLE, known)).toBe(false);
    expect(isActive(true, 'deleted-role', known)).toBe(false);
  });

  it('someone who is not active reads and writes nothing', () => {
    const waiting = actor({ active: false });
    expect(canRead(waiting)).toBe(false);
    expect(canWrite(waiting, 'transactions')).toBe(false);
  });

  it('only an admin may change roles or who holds them', () => {
    expect(canWrite(actor({ roleId: 'attendant' }), 'transactions')).toBe(true);
    expect(canWrite(actor({ roleId: 'attendant' }), 'roles')).toBe(false);
    expect(canWrite(actor({ roleId: 'attendant' }), 'userRoles')).toBe(false);
    expect(canWrite(actor({ roleId: 'admin' }), 'userRoles')).toBe(true);
  });
});

describe('passwords', () => {
  it('a hash checks only against its own password and never contains it', async () => {
    const hash = await hashPassword('correct horse');
    expect(hash).not.toContain('correct horse');
    expect(await verifyPassword('correct horse', hash)).toBe(true);
    expect(await verifyPassword('wrong horse', hash)).toBe(false);
    expect(await verifyPassword('correct horse', null)).toBe(false);
    expect(await verifyPassword('correct horse', 'garbage')).toBe(false);
  });

  it('the same password hashes differently each time', async () => {
    expect(await hashPassword('same')).not.toBe(await hashPassword('same'));
  });
});
