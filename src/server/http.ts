/**
 * Shared plumbing for the API routes: one database pool per running copy of
 * the app, who-is-asking, and turning errors into plain JSON answers.
 */
import { connect, type Db } from './db/client';
import { AuthError } from './auth/accounts';
import { MailNotConfiguredError } from './auth/mail';
import { findSession, readSessionCookie, type Account } from './auth/session';
import { resolveActor } from './access/actor';
import type { Actor } from './access/policy';

const globals = globalThis as { __mpsDb?: ReturnType<typeof connect> };

export function getDb(): Db {
  globals.__mpsDb ??= connect();
  return globals.__mpsDb.db;
}

export function json(body: unknown, init: { status?: number; headers?: Record<string, string> } = {}): Response {
  return new Response(JSON.stringify(body), {
    status: init.status ?? 200,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...init.headers },
  });
}

export const errorJson = (status: number, code: string, message: string): Response => json({ error: { code, message } }, { status });

/**
 * The address to put in emailed links: APP_URL when set, otherwise the
 * address this request itself arrived at. Headers a caller can make up
 * (X-Forwarded-Host) are never used, or a reset link could be pointed at
 * someone else's website.
 */
export function originOf(req: Request): string {
  const configured = process.env.APP_URL?.trim();
  if (configured) return configured.endsWith('/') ? configured.slice(0, -1) : configured;
  return new URL(req.url).origin;
}

/** A browser on another website must not be able to make a signed-in person's browser act for it. */
function fromAnotherSite(req: Request): boolean {
  const origin = req.headers.get('origin');
  if (!origin) return false; // not a browser (a script, a test)
  try {
    // Compared with the address the request arrived at (not APP_URL), so the
    // app keeps working on every address it is legitimately served from.
    const from = new URL(origin).host;
    return from !== new URL(req.url).host && from !== req.headers.get('host');
  } catch {
    return true;
  }
}

export type Signed = { account: Account; actor: Actor; token: string; expiresAt: Date; renewed: boolean };

export async function signedIn(req: Request): Promise<Signed | null> {
  const token = readSessionCookie(req.headers.get('cookie'));
  const found = await findSession(getDb(), token);
  if (!found || !token) return null;
  return { account: found.account, actor: await resolveActor(getDb(), found.account), token, expiresAt: found.expiresAt, renewed: found.renewed };
}

/** What the browser is told about the signed-in person: no password hash, and no role. */
export function publicUser(account: Account, actor: Actor) {
  return { uid: account.id, email: account.email, emailVerified: account.emailVerified, active: actor.active };
}

export async function readJson(req: Request): Promise<Record<string, unknown>> {
  try {
    const body = (await req.json()) as unknown;
    return typeof body === 'object' && body !== null && !Array.isArray(body) ? (body as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

/** Wraps a route: blocks cross-site writes and answers known errors as JSON instead of a crash page. */
export function route(handler: (req: Request) => Promise<Response>): (req: Request) => Promise<Response> {
  return async (req) => {
    try {
      if (req.method !== 'GET' && fromAnotherSite(req)) return errorJson(403, 'cross-site', 'Request refused.');
      return await handler(req);
    } catch (e) {
      if (e instanceof AuthError) return errorJson(e.status, e.code, e.message);
      if (e instanceof MailNotConfiguredError) return errorJson(503, 'mail-not-configured', e.message);
      console.error('[api]', req.method, new URL(req.url).pathname, e instanceof Error ? e.message.split('params:')[0] : e);
      return errorJson(500, 'server-error', 'Something went wrong on the server. Please try again.');
    }
  };
}
