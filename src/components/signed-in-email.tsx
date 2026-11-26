'use client';

import { useAuth } from '@/hooks/use-auth';

/**
 * Who is signed in, for the header of an entry screen. Each screen used to print one fixed address there,
 * whoever was at the counter.
 */
export function SignedInEmail() {
  const { user } = useAuth();
  return <span className="text-sm">{user?.email ?? ''}</span>;
}
