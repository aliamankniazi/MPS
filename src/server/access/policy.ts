/**
 * WHO MAY DO WHAT. Every request to the server passes through these rules;
 * hiding a button in the browser is never the protection.
 *
 * The app's screens have always let every signed-in person use every screen,
 * so the rules keep that: an active person may read and change all business
 * records. What changes is that "active" is now decided here, on the server.
 */

/** A role that lets nobody in: the person waits until an admin gives them a real role. */
export const PENDING_ROLE = 'pending';
export const ADMIN_ROLE = 'admin';
/** The roles the app creates by itself on first use. */
export const BUILT_IN_ROLES: readonly string[] = [ADMIN_ROLE, 'attendant'];

/** Only an admin may change who has which role, or what a role allows. */
const ADMIN_ONLY_COLLECTIONS: readonly string[] = ['roles', 'userRoles'];

export type Actor = {
  accountId: string;
  email: string;
  emailVerified: boolean;
  /** From the person's 'userRoles/<id>' record; null when they have none. */
  roleId: string | null;
  /** Verified email AND a real role. Only active people reach business data. */
  active: boolean;
};

/**
 * The role a brand-new sign-up receives.
 */
export function roleForNewAccount(input: { isFirstAccount: boolean; email: string }): string {
  // The very first person to sign up on an empty system sets it up.
  if (input.isFirstAccount) return ADMIN_ROLE;

  // TODO(human): decide what every later sign-up may do before an admin has
  // looked at them. Until you choose, the safe answer is in force: they wait.
  // (Returning 'attendant' here would give anyone on the internet who signs up
  // full access to every record as soon as they confirm their own email.)
  return PENDING_ROLE;
}

/** Verified email and a role that exists (and is not the waiting role). */
export function isActive(emailVerified: boolean, roleId: string | null, knownRoleIds: ReadonlySet<string>): boolean {
  if (!emailVerified || !roleId || roleId === PENDING_ROLE) return false;
  return knownRoleIds.has(roleId) || BUILT_IN_ROLES.includes(roleId);
}

export function canRead(actor: Actor): boolean {
  return actor.active;
}

/** `rootCollection` is the first part of the record's path, e.g. 'customers'. */
export function canWrite(actor: Actor, rootCollection: string): boolean {
  if (!actor.active) return false;
  if (ADMIN_ONLY_COLLECTIONS.includes(rootCollection)) return actor.roleId === ADMIN_ROLE;
  return true;
}
