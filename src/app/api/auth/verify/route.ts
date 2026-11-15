import { completeVerification } from '@/server/auth/accounts';
import { errorJson, getDb, json, readJson, route, signedIn } from '@/server/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Confirms an email address. Called by the /verify page, which the emailed
 * link opens. It is a POST from a signed-in browser on purpose: a mail
 * program that merely fetches the link, or a different person who opens it,
 * confirms nothing.
 */
export const POST = route(async (req) => {
  const signed = await signedIn(req);
  if (!signed) return errorJson(401, 'signed-out', 'Sign in on this device first, then open the link again.');
  const body = await readJson(req);
  const ok = await completeVerification(getDb(), body.token, signed.account.id);
  return ok ? json({ ok: true }) : errorJson(400, 'invalid-link', 'This link has expired, was already used, or was sent for a different account.');
});
