import { clearedCookieHeader, endSession, readSessionCookie } from '@/server/auth/session';
import { getDb, json, route } from '@/server/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const POST = route(async (req) => {
  await endSession(getDb(), readSessionCookie(req.headers.get('cookie')));
  return json({ ok: true }, { headers: { 'set-cookie': clearedCookieHeader() } });
});
