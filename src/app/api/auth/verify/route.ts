import { completeVerification } from '@/server/auth/accounts';
import { getDb, originOf, route } from '@/server/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** The link in the approval email lands here, then goes on to the sign-in screen. */
export const GET = route(async (req) => {
  const ok = await completeVerification(getDb(), new URL(req.url).searchParams.get('token'));
  return new Response(null, { status: 303, headers: { location: `${originOf(req)}/login?verified=${ok ? '1' : '0'}`, 'cache-control': 'no-store' } });
});
