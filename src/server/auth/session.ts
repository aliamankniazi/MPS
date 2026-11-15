/**
 * A signed-in browser holds one cookie: a long random value that JavaScript on
 * the page cannot read (HttpOnly). The database keeps only its SHA-256, so a
 * copy of the database is not a set of working logins.
 */
import { createHash, randomBytes } from 'node:crypto';
import { eq, lt } from 'drizzle-orm';
import type { Db } from '../db/client';
import { accounts, sessions } from '../db/schema';

export const SESSION_COOKIE = 'mps_session';
const DAY = 24 * 60 * 60 * 1000;
export const SESSION_LIFETIME_MS = 30 * DAY;

export const hashToken = (token: string): string => createHash('sha256').update(token).digest('hex');
export const newToken = (): string => randomBytes(32).toString('base64url');

export type Account = typeof accounts.$inferSelect;

export async function createSession(db: Db, accountId: string, now = new Date()): Promise<{ token: string; expiresAt: Date }> {
  const token = newToken();
  const expiresAt = new Date(now.getTime() + SESSION_LIFETIME_MS);
  await db.insert(sessions).values({ tokenHash: hashToken(token), accountId, expiresAt, createdAt: now });
  // Housekeeping: old sessions are of no use to anyone.
  await db.delete(sessions).where(lt(sessions.expiresAt, now));
  return { token, expiresAt };
}

/** The account behind a cookie value, or null. Extends the session when it is used. */
export async function findSession(db: Db, token: string | undefined, now = new Date()): Promise<{ account: Account; expiresAt: Date } | null> {
  if (!token) return null;
  const tokenHash = hashToken(token);
  const [row] = await db
    .select({ session: sessions, account: accounts })
    .from(sessions)
    .innerJoin(accounts, eq(accounts.id, sessions.accountId))
    .where(eq(sessions.tokenHash, tokenHash))
    .limit(1);
  if (!row || row.session.expiresAt.getTime() <= now.getTime()) return null;
  let expiresAt = row.session.expiresAt;
  // Slide the expiry forward, at most once a day so reads stay cheap.
  if (expiresAt.getTime() - now.getTime() < SESSION_LIFETIME_MS - DAY) {
    expiresAt = new Date(now.getTime() + SESSION_LIFETIME_MS);
    await db.update(sessions).set({ expiresAt }).where(eq(sessions.tokenHash, tokenHash));
  }
  return { account: row.account, expiresAt };
}

export async function endSession(db: Db, token: string | undefined): Promise<void> {
  if (token) await db.delete(sessions).where(eq(sessions.tokenHash, hashToken(token)));
}

export async function endAllSessions(db: Db, accountId: string): Promise<void> {
  await db.delete(sessions).where(eq(sessions.accountId, accountId));
}

const secure = () => process.env.NODE_ENV === 'production';

export function sessionCookieHeader(token: string, expiresAt: Date): string {
  const maxAge = Math.max(0, Math.floor((expiresAt.getTime() - Date.now()) / 1000));
  return `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure() ? '; Secure' : ''}`;
}

export function clearedCookieHeader(): string {
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure() ? '; Secure' : ''}`;
}

export function readSessionCookie(cookieHeader: string | null): string | undefined {
  for (const part of (cookieHeader ?? '').split(';')) {
    const [name, ...rest] = part.trim().split('=');
    if (name === SESSION_COOKIE) return rest.join('=') || undefined;
  }
  return undefined;
}
