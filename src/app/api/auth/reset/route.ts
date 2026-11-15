import { completePasswordReset } from '@/server/auth/accounts';
import { errorJson, getDb, json, readJson, route } from '@/server/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const POST = route(async (req) => {
  const body = await readJson(req);
  const ok = await completePasswordReset(getDb(), body.token, body.password);
  return ok ? json({ ok: true }) : errorJson(400, 'invalid-link', 'This reset link has expired or was already used. Ask for a new one.');
});
