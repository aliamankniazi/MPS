/**
 * The web addresses themselves, called the way a browser calls them: cookies,
 * who is allowed in, and what a stranger gets.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { setDeliverForTests, type Mail } from '../../src/server/auth/mail';
import { closeTestDb, freshTestDb, testDatabaseUrl } from './test-db';

type Handler = (req: Request) => Promise<Response>;
let signup: Handler, signin: Handler, signout: Handler, session: Handler, sendVerify: Handler, verify: Handler, syncGet: Handler, syncPost: Handler;
let mails: Mail[];
const BASE = 'http://localhost:3000';

beforeAll(async () => {
  process.env.DATABASE_URL = testDatabaseUrl(); // the routes read the address from the environment
  ({ POST: signup } = await import('../../src/app/api/auth/signup/route'));
  ({ POST: signin } = await import('../../src/app/api/auth/signin/route'));
  ({ POST: signout } = await import('../../src/app/api/auth/signout/route'));
  ({ GET: session } = await import('../../src/app/api/auth/session/route'));
  ({ POST: sendVerify } = await import('../../src/app/api/auth/verify/send/route'));
  ({ GET: verify } = await import('../../src/app/api/auth/verify/route'));
  ({ GET: syncGet, POST: syncPost } = await import('../../src/app/api/sync/route'));
});
beforeEach(async () => {
  await freshTestDb();
  mails = [];
  setDeliverForTests(async (mail) => void mails.push(mail));
});
afterAll(async () => {
  const globals = globalThis as { __mpsDb?: { pool: { end(): Promise<void> } } };
  await globals.__mpsDb?.pool.end();
  await closeTestDb();
});

const post = (path: string, body: unknown, cookie?: string, headers: Record<string, string> = {}) =>
  new Request(BASE + path, { method: 'POST', headers: { 'content-type': 'application/json', host: 'localhost:3000', ...(cookie ? { cookie } : {}), ...headers }, body: JSON.stringify(body) });
const get = (path: string, cookie?: string) => new Request(BASE + path, { headers: { host: 'localhost:3000', ...(cookie ? { cookie } : {}) } });
const cookieFrom = (res: Response) => res.headers.get('set-cookie')!.split(';')[0];

async function approvedAdmin(): Promise<string> {
  const res = await signup(post('/api/auth/signup', { email: 'owner@example.com', password: 'secret-1' }));
  const cookie = cookieFrom(res);
  await sendVerify(post('/api/auth/verify/send', {}, cookie));
  await verify(get(new URL(mails[0].link).pathname + new URL(mails[0].link).search));
  return cookie;
}

describe('the sign-in routes', () => {
  it('sign-up sets a cookie the page cannot read and never returns the password hash', async () => {
    const res = await signup(post('/api/auth/signup', { email: 'owner@example.com', password: 'secret-1' }));
    expect(res.status).toBe(200);
    const setCookie = res.headers.get('set-cookie')!;
    expect(setCookie).toMatch(/^mps_session=/);
    expect(setCookie).toContain('HttpOnly');
    expect(setCookie).toContain('SameSite=Lax');
    const text = await res.text();
    expect(text).not.toMatch(/scrypt|passwordHash/);
    expect(JSON.parse(text).user).toMatchObject({ email: 'owner@example.com', emailVerified: false, active: false, roleId: 'admin' });
  });

  it('a wrong password is a plain 401 with no cookie', async () => {
    await signup(post('/api/auth/signup', { email: 'owner@example.com', password: 'secret-1' }));
    const res = await signin(post('/api/auth/signin', { email: 'owner@example.com', password: 'nope-nope' }));
    expect(res.status).toBe(401);
    expect(res.headers.get('set-cookie')).toBeNull();
    expect((await res.json()).error.message).toBe('Incorrect email or password.');
  });

  it('the emailed link approves the account; sign-out ends the session', async () => {
    const cookie = await approvedAdmin();
    expect((await (await session(get('/api/auth/session', cookie))).json()).user).toMatchObject({ emailVerified: true, active: true });

    const out = await signout(post('/api/auth/signout', {}, cookie));
    expect(out.headers.get('set-cookie')).toContain('Max-Age=0');
    expect((await (await session(get('/api/auth/session', cookie))).json()).user).toBeNull();
  });

  it('refuses a write that comes from another website', async () => {
    const res = await signin(post('/api/auth/signin', { email: 'owner@example.com', password: 'secret-1' }, undefined, { origin: 'https://evil.example' }));
    expect(res.status).toBe(403);
  });
});

describe('the sync route', () => {
  const ops = [{ opId: 'op-route-0001', path: 'transactions/t1', type: 'set', data: { totalAmount: 500 } }];

  it('a stranger gets nothing', async () => {
    expect((await syncGet(get('/api/sync?since=0'))).status).toBe(401);
    expect((await syncPost(post('/api/sync', { ops }))).status).toBe(401);
    expect((await syncGet(get('/api/sync?since=0', 'mps_session=made-up-value'))).status).toBe(401);
  });

  it('a signed-in person whose email is not approved gets nothing either', async () => {
    const res = await signup(post('/api/auth/signup', { email: 'owner@example.com', password: 'secret-1' }));
    const cookie = cookieFrom(res);
    expect((await syncGet(get('/api/sync?since=0', cookie))).status).toBe(403);
    expect((await syncPost(post('/api/sync', { ops }, cookie))).status).toBe(403);
  });

  it('an approved person can save and read back', async () => {
    const cookie = await approvedAdmin();
    const pushed = await syncPost(post('/api/sync', { ops }, cookie));
    expect((await pushed.json()).results).toEqual([{ opId: 'op-route-0001', status: 'applied' }]);

    const pulled = await (await syncGet(get('/api/sync?since=0', cookie))).json();
    const mine = pulled.docs.find((d: { p: string }) => d.p === 'transactions/t1');
    expect(mine.d).toEqual({ totalAmount: 500 });
    expect(pulled.more).toBe(false);

    expect((await syncGet(get('/api/sync?since=-1', cookie))).status).toBe(400);
    expect((await syncPost(post('/api/sync', { ops: 'nope' }, cookie))).status).toBe(400);
  });
});
