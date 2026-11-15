import { json, publicUser, route, signedIn } from '@/server/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Who is signed in on this browser, or { user: null }. */
export const GET = route(async (req) => {
  const signed = await signedIn(req);
  return json({ user: signed ? publicUser(signed.account, signed.actor) : null });
});
