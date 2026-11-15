'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { completePasswordReset } from '@/data/auth';

/** Where the link in a "reset your password" email lands. */
export default function ResetPasswordPage() {
  const router = useRouter();
  const { toast } = useToast();
  const [token, setToken] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    // Read from the address bar here rather than with useSearchParams, which
    // would need a Suspense boundary to build.
    setToken(new URLSearchParams(window.location.search).get('token') ?? '');
  }, []);

  const onSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (password.length < 6) {
      toast({ variant: 'destructive', title: 'Password too short', description: 'Password must be at least 6 characters.' });
      return;
    }
    if (password !== confirm) {
      toast({ variant: 'destructive', title: 'Passwords do not match', description: 'Type the same password in both boxes.' });
      return;
    }
    setSaving(true);
    try {
      await completePasswordReset(token, password);
      toast({ title: 'Password changed', description: 'You can now sign in with your new password.' });
      router.push('/login');
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'Could not change password', description: error.message || 'Please ask for a new reset link.' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle>Choose a new password</CardTitle>
          <CardDescription>Enter the new password for your account.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="password">New password</Label>
              <Input id="password" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirm">New password again</Label>
              <Input id="confirm" type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
            </div>
            <Button type="submit" className="w-full" disabled={saving || !token}>
              {saving ? 'Saving...' : 'Save new password'}
            </Button>
            {!token && <p className="text-sm text-destructive text-center">This link is incomplete. Ask for a new reset link.</p>}
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
