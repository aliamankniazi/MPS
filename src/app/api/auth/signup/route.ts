import { signUp } from '@/server/auth/accounts';
import { createSession, sessionCookieHeader } from '@/server/auth/session';
import { resolveActor } from '@/server/access/actor';
import { getDb, json, publicUser, readJson, route } from '@/server/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const POST = route(async (req) => {
  const body = await readJson(req);
  const db = getDb();
  const account = await signUp(db, { email: body.email, password: body.password });
  const session = await createSession(db, account.id);
  return json(
    { user: publicUser(account, await resolveActor(db, account)) },
    { headers: { 'set-cookie': sessionCookieHeader(session.token, session.expiresAt) } },
  );
});
