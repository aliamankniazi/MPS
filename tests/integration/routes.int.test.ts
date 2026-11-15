/**
 * The web addresses themselves, called the way a browser calls them: cookies,
 * who is allowed in, and what a stranger gets.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { setDeliverForTests, type Mail } from '../../src/server/auth/mail';
import { closeTestDb, freshTestDb, testDatabaseUrl } from './test-db';

type Handler = (req: Request) => Promise<Response>;
let signup: Handler, signin: Handler, signout: Handler, session: Handler, sendVerify: Handler, verify: Handler, resetRequest: Handler, syncGet: Handler, syncPost: Handler;
let mails: Mail[];
const BASE = 'http://localhost:3000';

beforeAll(async () => {
  process.env.DATABASE_URL = testDatabaseUrl(); // the routes read the address from the environment
  delete process.env.APP_URL;
  ({ POST: signup } = await import('../../src/app/api/auth/signup/route'));
  ({ POST: signin } = await import('../../src/app/api/auth/signin/route'));
  ({ POST: signout } = await import('../../src/app/api/auth/signout/route'));
  ({ GET: session } = await import('../../src/app/api/auth/session/route'));
  ({ POST: sendVerify } = await import('../../src/app/api/auth/verify/send/route'));
  ({ POST: verify } = await import('../../src/app/api/auth/verify/route'));
  ({ POST: resetRequest } = await import('../../src/app/api/auth/reset/request/route'));
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
const tokenIn = (mail: Mail) => new URL(mail.link).searchParams.get('token')!;

/** Signs up and opens the emailed link in the same "browser" (same cookie). */
async function signUpAndConfirm(email: string): Promise<string> {
  const cookie = cookieFrom(await signup(post('/api/auth/signup', { email, password: 'secret-1' })));
  const before = mails.length;
  await sendVerify(post('/api/auth/verify/send', {}, cookie));
  const res = await verify(post('/api/auth/verify', { token: tokenIn(mails[before]) }, cookie));
  expect(res.status).toBe(200);
  return cookie;
}

describe('the sign-in routes', () => {
  it('sign-up sets a cookie the page cannot read and tells the browser neither the hash nor the role', async () => {
    const res = await signup(post('/api/auth/signup', { email: 'owner@example.com', password: 'secret-1' }));
    expect(res.status).toBe(200);
    const setCookie = res.headers.get('set-cookie')!;
    expect(setCookie).toMatch(/^mps_session=/);
    expect(setCookie).toContain('HttpOnly');
    expect(setCookie).toContain('SameSite=Lax');
    const text = await res.text();
    expect(text).not.toMatch(/scrypt|passwordHash|roleId/);
    expect(JSON.parse(text).user).toEqual({ uid: expect.any(String), email: 'owner@example.com', emailVerified: false, active: false });
  });

  it('a wrong password is a plain 401 with no cookie', async () => {
    await signup(post('/api/auth/signup', { email: 'owner@example.com', password: 'secret-1' }));
    const res = await signin(post('/api/auth/signin', { email: 'owner@example.com', password: 'nope-nope' }));
    expect(res.status).toBe(401);
    expect(res.headers.get('set-cookie')).toBeNull();
    expect((await res.json()).error.message).toBe('Incorrect email or password.');
  });

  it('the emailed link approves the account only from the browser that is signing in', async () => {
    const cookie = cookieFrom(await signup(post('/api/auth/signup', { email: 'owner@example.com', password: 'secret-1' })));
    await sendVerify(post('/api/auth/verify/send', {}, cookie));
    const token = tokenIn(mails[0]);
    expect(new URL(mails[0].link).pathname).toBe('/verify'); // a page, not an address that acts when merely fetched

    // Opened where nobody is signed in (another device, or a mail scanner): nothing happens.
    expect((await verify(post('/api/auth/verify', { token }))).status).toBe(401);
    expect((await (await session(get('/api/auth/session', cookie))).json()).user).toMatchObject({ emailVerified: false, active: false });

    expect((await verify(post('/api/auth/verify', { token }, cookie))).status).toBe(200);
    expect((await (await session(get('/api/auth/session', cookie))).json()).user).toMatchObject({ emailVerified: true, active: true });

    const out = await signout(post('/api/auth/signout', {}, cookie));
    expect(out.headers.get('set-cookie')).toContain('Max-Age=0');
    expect((await (await session(get('/api/auth/session', cookie))).json()).user).toBeNull();
  });

  it('refuses a write that comes from another website, whatever address the app is configured with', async () => {
    const evil = await signin(post('/api/auth/signin', { email: 'owner@example.com', password: 'secret-1' }, undefined, { origin: 'https://evil.example' }));
    expect(evil.status).toBe(403);

    process.env.APP_URL = 'https://pump.example.com';
    try {
      // Served from another legitimate address (a Vercel alias): still works.
      const own = await signin(post('/api/auth/signin', { email: 'nobody@example.com', password: 'secret-1' }, undefined, { origin: BASE }));
      expect(own.status).toBe(401);
    } finally {
      delete process.env.APP_URL;
    }
  });

  it('a made-up forwarding header cannot point an emailed link at another website', async () => {
    await signup(post('/api/auth/signup', { email: 'owner@example.com', password: 'secret-1' }));
    await resetRequest(post('/api/auth/reset/request', { email: 'owner@example.com' }, undefined, { 'x-forwarded-host': 'evil.example', 'x-forwarded-proto': 'https' }));
    expect(mails).toHaveLength(1);
    expect(new URL(mails[0].link).origin).toBe(BASE);
  });
});

describe('the sync route', () => {
  const ops = [{ opId: 'op-route-0001', path: 'transactions/t1', type: 'set', data: { totalAmount: 500 } }];

  it('a stranger gets nothing', async () => {
    expect((await syncGet(get('/api/sync?since=0'))).status).toBe(401);
    expect((await syncPost(post('/api/sync', { ops }))).status).toBe(401);
    expect((await syncGet(get('/api/sync?since=0', 'mps_session=made-up-value'))).status).toBe(401);
  });

  it('a signed-in person whose email is not confirmed gets nothing either', async () => {
    const cookie = cookieFrom(await signup(post('/api/auth/signup', { email: 'owner@example.com', password: 'secret-1' })));
    expect((await syncGet(get('/api/sync?since=0', cookie))).status).toBe(403);
    expect((await syncPost(post('/api/sync', { ops }, cookie))).status).toBe(403);
  });

  it('a stranger who signs up after the owner and confirms their own email is still shut out', async () => {
    await signUpAndConfirm('owner@example.com');
    const stranger = await signUpAndConfirm('stranger@example.com');
    expect((await (await session(get('/api/auth/session', stranger))).json()).user).toMatchObject({ emailVerified: true, active: false });
    expect((await syncGet(get('/api/sync?since=0', stranger))).status).toBe(403);
    expect((await syncPost(post('/api/sync', { ops }, stranger))).status).toBe(403);
  });

  it('an approved person can save and read back', async () => {
    const cookie = await signUpAndConfirm('owner@example.com');
    const pushed = await (await syncPost(post('/api/sync', { ops }, cookie))).json();
    expect(pushed.results).toEqual([{ opId: 'op-route-0001', status: 'applied' }]);
    expect(pushed.truth).toEqual({});

    const pulled = await (await syncGet(get('/api/sync?since=0', cookie))).json();
    const mine = pulled.docs.find((d: { p: string }) => d.p === 'transactions/t1');
    expect(mine.d).toEqual({ totalAmount: 500 });
    expect(pulled.more).toBe(false);
    expect(pulled.head).toBe(pulled.cursor);

    expect((await syncGet(get('/api/sync?since=-1', cookie))).status).toBe(400);
    expect((await syncPost(post('/api/sync', { ops: 'nope' }, cookie))).status).toBe(400);
  });
});
