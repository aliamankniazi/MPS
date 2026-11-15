'use client';

import { useForm, type SubmitHandler } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { LogIn, Fuel, Mail, ShieldCheck, Loader2 } from 'lucide-react';
import Link from 'next/link';
import { useAuth } from '@/hooks/use-auth';
import { useRouter } from 'next/navigation';
import { useState, useEffect, useRef } from 'react';
import { AuthFormValues } from '@/lib/types';
import { differenceInDays, startOfDay } from 'date-fns';
import { sendEmailVerification } from '@/data/auth';


const loginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
});

const getPunjabiDate = (date: Date): { day: number; month: string; year: number } => {
  const year = date.getFullYear();
  const month = date.getMonth(); 
  const day = date.getDate();

  const monthData = [
      { name: 'چیت', length: 31, start: { m: 2, d: 14 } },
      { name: 'وساکھ', length: 31, start: { m: 3, d: 14 } },
      { name: 'جیٹھ', length: 31, start: { m: 4, d: 15 } },
      { name: 'ہاੜ', length: 31, start: { m: 5, d: 15 } },
      { name: 'ساوڻ', length: 31, start: { m: 6, d: 16 } },
      { name: 'بھادوں', length: 30, start: { m: 7, d: 16 } },
      { name: 'اسو', length: 30, start: { m: 8, d: 15 } },
      { name: 'کاتک', length: 30, start: { m: 9, d: 15 } },
      { name: 'مگھر', length: 30, start: { m: 10, d: 14 } },
      { name: 'پوہ', length: 30, start: { m: 11, d: 14 } },
      { name: 'ماگھ', length: 30, start: { m: 0, d: 13 } },
      { name: 'پھگڻ', length: 30, start: { m: 1, d: 12 } }
  ];

  let bikramiYear = year + 57;
  let desiDay = 0;
  let desiMonth = '';

  let gregorianYearForBikramiStart = year;
  if (month < 2 || (month === 2 && day < 14)) {
      gregorianYearForBikramiStart--;
      bikramiYear--; 
  }

  const monthStarts = monthData.map(m => ({
      ...m,
      startDate: new Date(m.start.m >= 2 ? gregorianYearForBikramiStart : gregorianYearForBikramiStart + 1, m.start.m, m.start.d)
  })).sort((a,b) => a.startDate.getTime() - b.startDate.getTime());
  
  let foundMonth = false;
  for (let i = monthStarts.length - 1; i >= 0; i--) {
      if (date >= monthStarts[i].startDate) {
          desiMonth = monthStarts[i].name;
          desiDay = differenceInDays(date, monthStarts[i].startDate) + 1;
          foundMonth = true;
          break;
      }
  }

  if (!foundMonth) {
      const lastMonthOfPreviousYear = monthStarts[monthStarts.length -1];
      desiMonth = lastMonthOfPreviousYear.name;
      desiDay = differenceInDays(date, new Date(gregorianYearForBikramiStart, lastMonthOfPreviousYear.start.m, lastMonthOfPreviousYear.start.d)) + 1;
  }
  
  return { day: desiDay, month: desiMonth, year: bikramiYear };
};

const getNextRamadanInfo = (currentDate: Date) => {
    const ramadanPeriods = [
        { start: new Date('2025-02-28'), end: new Date('2025-03-29') },
        { start: new Date('2026-02-17'), end: new Date('2026-03-18') },
        { start: new Date('2027-02-07'), end: new Date('2027-03-08') },
        { start: new Date('2028-01-27'), end: new Date('2028-02-25') },
    ];

    const today = startOfDay(currentDate);

    for (const period of ramadanPeriods) {
        if (today >= startOfDay(period.start) && today <= startOfDay(period.end)) {
            return { daysRemaining: 0, isDuring: true };
        }
    }

    const nextRamadanDate = ramadanPeriods.find(period => startOfDay(period.start) > today)?.start;

    if (!nextRamadanDate) {
        return { daysRemaining: null, isDuring: false };
    }

    const daysRemaining = differenceInDays(startOfDay(nextRamadanDate), today);
    return { daysRemaining, isDuring: false };
};


export default function LoginPage() {
  const { user, signIn, resetPassword } = useAuth();
  const router = useRouter();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [currentTime, setCurrentTime] = useState('');
  const [islamicDateString, setIslamicDateString] = useState('');
  const [ramadanCountdown, setRamadanCountdown] = useState('');
  const [isClient, setIsClient] = useState(false);
  
  const [step, setStep] = useState<1 | 2>(1);
  const checkInterval = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    setIsClient(true);
  }, []);

  useEffect(() => {
    if (!isClient) return;

    const timer = setInterval(() => {
        const now = new Date();
        const gregorianDate = now.toLocaleString('en-US', {
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric',
        });

        const time = now.toLocaleString('en-US', {
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            hour12: true,
        });

        setCurrentTime(`${gregorianDate} | ${time}`);
        
        const islamicDate = new Intl.DateTimeFormat('ur-PK-u-ca-islamic', {
            weekday: 'long',
            day: 'numeric',
            month: 'long',
            year: 'numeric'
        }).format(now);
        
        const desiDate = getPunjabiDate(now);
        const punjabiDate = `${desiDate.day} ${desiDate.month} ${desiDate.year}`;

        setIslamicDateString(`${islamicDate.replace(' AH', ' ہجری')} | ${punjabiDate}`);

        const ramadanInfo = getNextRamadanInfo(now);
        if (ramadanInfo.isDuring) {
            setRamadanCountdown("Ramadan Mubarak!");
        } else if (ramadanInfo.daysRemaining !== null && ramadanInfo.daysRemaining > 0) {
            setRamadanCountdown(`${ramadanInfo.daysRemaining} days remaining for Ramadan`);
        } else if (ramadanInfo.daysRemaining === 0) {
            setRamadanCountdown("Ramadan starts today!");
        } else {
            setRamadanCountdown('');
        }
    }, 1000);
    return () => clearInterval(timer);
  }, [isClient]);

  const pollVerificationStatus = async () => {
    if (user) {
      await user.reload();
      if (user.emailVerified) {
        if (checkInterval.current) clearInterval(checkInterval.current);
        localStorage.setItem('pumppal_2fa_verified', 'true');
        toast({
            title: 'Approved',
            description: 'Your email has been verified. Welcome back!',
        });
        router.push('/');
      }
    }
  };

  useEffect(() => {
    if (step === 2) {
      checkInterval.current = setInterval(pollVerificationStatus, 3000);
    }
    return () => {
      if (checkInterval.current) clearInterval(checkInterval.current);
    };
  }, [step, user]);
  
  const { register, handleSubmit, getValues, formState: { errors } } = useForm<AuthFormValues>({
    resolver: zodResolver(loginSchema),
  });

  const onSubmit: SubmitHandler<AuthFormValues> = async (data) => {
    setLoading(true);
    try {
      const userCredential = await signIn(data);
      const user = userCredential.user;

      if (!user.emailVerified) {
        await sendEmailVerification(user);
        toast({
            title: 'Approval Required',
            description: `An approval email has been sent to ${data.email}. Please click the link in the email to complete your login.`,
            duration: 10000,
        });
        setStep(2);
      } else {
        localStorage.setItem('pumppal_2fa_verified', 'true');
        router.push('/');
      }
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Login Failed',
        description: error.message || 'An unexpected error occurred.',
      });
    } finally {
        setLoading(false);
    }
  };

  const handleForgotPassword = async () => {
    const email = getValues('email');
    if (!email || !z.string().email().safeParse(email).success) {
      toast({
        variant: 'destructive',
        title: 'Email Required',
        description: 'Please enter a valid email address first to reset your password.',
      });
      return;
    }

    try {
      await resetPassword(email);
      toast({
        title: 'Email Sent',
        description: `A password reset link has been sent to ${email}.`,
      });
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: error.message || 'Failed to send reset email.',
      });
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4 flex-col gap-4">
      {isClient && (
          <div className="text-center">
              <p className="text-[35px] font-extrabold text-red-500">{currentTime}</p>
              <div className="flex items-baseline justify-center gap-4 flex-wrap mt-1">
                  <p className="text-xl font-medium text-muted-foreground">{islamicDateString}</p>
                  {ramadanCountdown && <p className="text-xl font-semibold text-green-600">{ramadanCountdown}</p>}
              </div>
          </div>
      )}
      <Card className="w-full max-w-md border-4 border-double border-red-500">
        <CardHeader className="text-center">
            <div className="flex justify-center items-center gap-2 mb-2">
                <Fuel className="h-8 w-8 text-primary" />
                <h1 className="text-2xl font-bold text-primary">Mianwali Petroleum Service</h1>
            </div>
            <p className="text-sm text-pink-600">Ballo Khel Road Opposite Assistant Commissioner House Mianwali</p>
            <p className="text-sm text-muted-foreground">Proprietor: Muhammad Ali Aman Khan Niazi</p>
            <p className="text-sm text-muted-foreground">Mobile: 0333-5425401, 0322-5824444</p>
        </CardHeader>
        <CardContent>
          {step === 1 ? (
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
                <div className="space-y-2">
                <Label htmlFor="email" className="text-pink-600">Email</Label>
                <Input id="email" type="email" {...register('email')} placeholder="you@example.com" />
                {errors.email && <p className="text-sm text-destructive">{errors.email.message}</p>}
                </div>

                <div className="space-y-2">
                <div className="flex items-center justify-between">
                    <Label htmlFor="password" className="text-pink-600">Password</Label>
                    <Button 
                    type="button" 
                    variant="link" 
                    className="px-0 font-normal h-auto text-xs text-muted-foreground"
                    onClick={handleForgotPassword}
                    >
                    Forgot password?
                    </Button>
                </div>
                <Input id="password" type="password" {...register('password')} />
                {errors.password && <p className="text-sm text-destructive">{errors.password.message}</p>}
                </div>

                <Button type="submit" className="w-full" disabled={loading}>
                {loading ? 'Logging in...' : 'Login'}
                </Button>
            </form>
          ) : (
            <div className="space-y-6 text-center">
                <div className="flex justify-center">
                    <div className="p-4 bg-primary/10 rounded-full animate-pulse">
                        <Mail className="h-12 w-12 text-primary" />
                    </div>
                </div>
                <div className="space-y-2">
                    <CardTitle className="text-xl">Waiting for Approval</CardTitle>
                    <CardDescription>
                        We've sent an approval link to <strong>{getValues('email')}</strong>. 
                        Please click the link in the email to complete your login.
                    </CardDescription>
                </div>

                <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Checking approval status...
                </div>

                <div className="space-y-2 pt-4">
                    <Button type="button" variant="outline" className="w-full" onClick={() => setStep(1)}>
                        Back to Login
                    </Button>
                    <Button type="button" variant="link" className="text-xs" onClick={() => user && sendEmailVerification(user)}>
                        Resend Approval Email
                    </Button>
                </div>
            </div>
          )}
          
          {step === 1 && (
            <div className="mt-4 text-center text-sm text-pink-600">
                Don't have an account?{' '}
                <Link href="/signup" className="underline">
                Sign up
                </Link>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
