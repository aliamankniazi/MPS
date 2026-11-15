'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { confirmEmailLink } from '@/data/auth';

type State = { kind: 'working' } | { kind: 'approved-waiting' } | { kind: 'failed'; message: string };

/**
 * Where the link in an "approve your sign-in" email lands. The approval only
 * counts in the browser that is signed in as the account the email was for.
 */
export default function VerifyPage() {
  const router = useRouter();
  const [state, setState] = useState<State>({ kind: 'working' });

  useEffect(() => {
    // Read from the address bar here rather than with useSearchParams, which
    // would need a Suspense boundary to build.
    const token = new URLSearchParams(window.location.search).get('token') ?? '';
    let cancelled = false;
    confirmEmailLink(token)
      .then((active) => {
        if (cancelled) return;
        if (active) {
          // Same flag the sign-in screen sets once the account is approved.
          localStorage.setItem('pumppal_2fa_verified', 'true');
          router.push('/');
        } else {
          setState({ kind: 'approved-waiting' });
        }
      })
      .catch((error: Error) => !cancelled && setState({ kind: 'failed', message: error.message }));
    return () => {
      cancelled = true;
    };
  }, [router]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle>
            {state.kind === 'working' && 'Approving your sign-in...'}
            {state.kind === 'approved-waiting' && 'Email confirmed'}
            {state.kind === 'failed' && 'Could not approve'}
          </CardTitle>
          <CardDescription>
            {state.kind === 'working' && 'One moment.'}
            {state.kind === 'approved-waiting' && 'Your email address is confirmed. An admin now needs to give your account a role in Role Management. You can sign in after that.'}
            {state.kind === 'failed' && state.message}
          </CardDescription>
        </CardHeader>
        {state.kind !== 'working' && (
          <CardContent className="text-center">
            <Button asChild variant="outline">
              <Link href="/login">Back to sign-in</Link>
            </Button>
          </CardContent>
        )}
      </Card>
    </div>
  );
}
