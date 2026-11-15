import { canRead } from '@/server/access/policy';
import { MAX_OPS_PER_PUSH, pullChanges, pullToJson, pushChanges } from '@/server/sync/documents';
import { errorJson, getDb, json, readJson, route, signedIn, type Signed } from '@/server/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function activePerson(req: Request): Promise<Signed | Response> {
  const signed = await signedIn(req);
  if (!signed) return errorJson(401, 'signed-out', 'Please sign in.');
  if (!canRead(signed.actor)) return errorJson(403, 'inactive', 'This account is waiting for approval.');
  return signed;
}

/** PULL: everything saved after ?since=<version>. */
export const GET = route(async (req) => {
  const who = await activePerson(req);
  if (who instanceof Response) return who;
  const since = Number(new URL(req.url).searchParams.get('since') ?? '0');
  if (!Number.isSafeInteger(since) || since < 0) return errorJson(400, 'bad-request', 'Bad "since".');
  const pull = await pullChanges(getDb(), since);
  return new Response(pullToJson(pull), { headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });
});

/** PUSH: this device's changes, in order. */
export const POST = route(async (req) => {
  const who = await activePerson(req);
  if (who instanceof Response) return who;
  const body = await readJson(req);
  if (!Array.isArray(body.ops) || body.ops.length > MAX_OPS_PER_PUSH) return errorJson(400, 'bad-request', 'Bad "ops".');
  return json(await pushChanges(getDb(), who.actor, body.ops));
});
