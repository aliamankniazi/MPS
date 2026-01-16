'use client';

// This hook is deprecated and now an alias for useAuth.
// The RolesProvider is no longer needed and has been removed.
// All role logic is now handled within AuthProvider and useAuth.

import { useAuth } from './use-auth';
import type { Permission } from '@/lib/types';

// Re-export for compatibility
export { PERMISSIONS } from '@/lib/types';
export type { Permission };

/**
 * @deprecated Please use `useAuth` instead.
 */
export const useRoles = useAuth;
