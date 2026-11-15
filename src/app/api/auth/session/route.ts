import { sessionCookieHeader } from '@/server/auth/session';
import { json, publicUser, route, signedIn } from '@/server/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Who is signed in on this browser, or { user: null }. */
export const GET = route(async (req) => {
  const signed = await signedIn(req);
  if (!signed) return json({ user: null });
  // When the session was extended, extend the cookie with it, or the browser
  // would drop it on the original date however often the app is used.
  const headers = signed.renewed ? { 'set-cookie': sessionCookieHeader(signed.token, signed.expiresAt) } : undefined;
  return json({ user: publicUser(signed.account, signed.actor) }, { headers });
});
