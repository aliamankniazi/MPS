import { startVerification } from '@/server/auth/accounts';
import { errorJson, getDb, json, originOf, route, signedIn } from '@/server/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Emails the signed-in person their "approve this sign-in" link. */
export const POST = route(async (req) => {
  const signed = await signedIn(req);
  if (!signed) return errorJson(401, 'signed-out', 'Please sign in first.');
  return json({ result: await startVerification(getDb(), signed.account, originOf(req)) });
});
