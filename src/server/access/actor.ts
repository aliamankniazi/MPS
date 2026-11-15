/**
 * Works out what a signed-in account is allowed to do, from the same
 * 'userRoles' and 'roles' records the Role Management screen edits.
 */
import { and, eq, or } from 'drizzle-orm';
import type { Db, Tx } from '../db/client';
import { documents } from '../db/schema';
import type { Account } from '../auth/session';
import { isActive, type Actor } from './policy';

export async function resolveActor(db: Db | Tx, account: Account): Promise<Actor> {
  const ownRolePath = `userRoles/${account.id}`;
  const rows = await db
    .select({ path: documents.path, docId: documents.docId, collection: documents.collection, dataRaw: documents.dataRaw })
    .from(documents)
    .where(and(eq(documents.deleted, false), or(eq(documents.path, ownRolePath), eq(documents.collection, 'roles'))));

  let roleId: string | null = null;
  const knownRoleIds = new Set<string>();
  for (const row of rows) {
    if (row.path === ownRolePath) {
      const value = (JSON.parse(row.dataRaw) as { roleId?: unknown }).roleId;
      roleId = typeof value === 'string' ? value : null;
    } else {
      knownRoleIds.add(row.docId);
    }
  }
  return {
    accountId: account.id,
    email: account.email,
    emailVerified: account.emailVerified,
    roleId,
    active: isActive(account.emailVerified, roleId, knownRoleIds),
  };
}
