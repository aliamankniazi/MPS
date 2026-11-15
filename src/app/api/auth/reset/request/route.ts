import { requestPasswordReset } from '@/server/auth/accounts';
import { getDb, json, originOf, readJson, route } from '@/server/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Always answers ok, so it cannot be used to find out which emails have accounts. */
export const POST = route(async (req) => {
  const body = await readJson(req);
  await requestPasswordReset(getDb(), body.email, originOf(req));
  return json({ ok: true });
});
