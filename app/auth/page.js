'use client';

import { useState, useEffect, Suspense } from 'react';
import Image from 'next/image';
import { useRouter, useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from 'sonner';
import { Mail, ArrowLeft, ShieldCheck, KeyRound } from 'lucide-react';
import logoImage from '@/logo.png';

function AuthInner() {
  const router = useRouter();
  const params = useSearchParams();
  const initialMode = params.get('mode') === 'signup' ? 'signup' : 'login';
  const [mode, setMode] = useState(initialMode);
  const [step, setStep] = useState('credentials'); // 'credentials' | 'otp'
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [otp, setOtp] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (mode === 'signup') {
        const res = await fetch('/api/auth/signup', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, password, username }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed');
        toast.success('Check your inbox for the verification code 📬');
        setStep('otp');
      } else {
        const res = await fetch('/api/auth/login', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, password }),
        });
        const data = await res.json();
        if (data.needsVerification) {
          toast.info('Please verify your email first.');
          setMode('signup'); setStep('otp');
          return;
        }
        if (!res.ok) throw new Error(data.error || 'Failed');
        localStorage.setItem('token', data.token);
        localStorage.setItem('user', JSON.stringify(data.user));
        toast.success('Welcome back!');
        router.push('/dashboard');
      }
    } catch (err) {
      toast.error(err.message);
    } finally { setLoading(false); }
  };

  const verifyOtp = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await fetch('/api/auth/verify-otp', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, otp }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed');
      localStorage.setItem('token', data.token);
      localStorage.setItem('user', JSON.stringify(data.user));
      toast.success('Email verified! Welcome aboard 🚀');
      router.push('/dashboard');
    } catch (err) {
      toast.error(err.message);
    } finally { setLoading(false); }
  };

  const resend = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/auth/resend-otp', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed');
      toast.success('New code sent ✉️');
    } catch (err) { toast.error(err.message); }
    finally { setLoading(false); }
  };
  
  const requestReset = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await fetch('/api/auth/forgot-password', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed');
      toast.success('If an account exists, a reset code is on its way 📬');
      setOtp(''); setNewPassword('');
      setStep('forgot-reset');
    } catch (err) {
      toast.error(err.message);
    } finally { setLoading(false); }
  };

  const resetPassword = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await fetch('/api/auth/reset-password', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, otp, newPassword }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed');
      localStorage.setItem('token', data.token);
      localStorage.setItem('user', JSON.stringify(data.user));
      toast.success('Password updated! Welcome back 🚀');
      router.push('/dashboard');
    } catch (err) {
      toast.error(err.message);
    } finally { setLoading(false); }
  };

  const resendReset = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/auth/forgot-password', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed');
      toast.success('New reset code sent ✉️');
    } catch (err) { toast.error(err.message); }
    finally { setLoading(false); }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-indigo-50 via-violet-50 to-fuchsia-50 p-4 relative overflow-hidden">
      <div className="absolute top-0 -left-32 w-96 h-96 bg-violet-300/30 rounded-full blur-3xl"></div>
      <div className="absolute bottom-0 -right-32 w-96 h-96 bg-fuchsia-300/30 rounded-full blur-3xl"></div>
      <div className="w-full max-w-md relative z-10">
        <div className="flex justify-between items-center mb-6">
          <Button variant="ghost" size="sm" onClick={() => router.push('/')}>
            <ArrowLeft className="w-4 h-4 mr-1" /> Home
          </Button>
          <Image src={logoImage} alt="Komentra" priority className="h-11 w-auto object-contain" />
        </div>

        <Card className="shadow-2xl border-0 backdrop-blur-sm bg-white/85">
          <CardHeader className="text-center">
            {step === 'otp' ? (
              <>
                <div className="w-14 h-14 mx-auto rounded-2xl bg-gradient-to-tr from-violet-500 to-fuchsia-500 flex items-center justify-center mb-2">
                  <Mail className="w-7 h-7 text-white" />
                </div>
                <CardTitle className="text-2xl">Verify your email</CardTitle>
                <CardDescription>
                  We sent a 6-digit code to <span className="font-medium text-foreground">{email}</span>
                </CardDescription>
              </>
            ) : step === 'forgot-email' ? (
              <>
                <div className="w-14 h-14 mx-auto rounded-2xl bg-gradient-to-tr from-violet-500 to-fuchsia-500 flex items-center justify-center mb-2">
                  <KeyRound className="w-7 h-7 text-white" />
                </div>
                <CardTitle className="text-2xl">Forgot your password?</CardTitle>
                <CardDescription>
                  Enter your email and we'll send you a 6-digit code to reset it.
                </CardDescription>
              </>
            ) : step === 'forgot-reset' ? (
              <>
                <div className="w-14 h-14 mx-auto rounded-2xl bg-gradient-to-tr from-violet-500 to-fuchsia-500 flex items-center justify-center mb-2">
                  <KeyRound className="w-7 h-7 text-white" />
                </div>
                <CardTitle className="text-2xl">Reset your password</CardTitle>
                <CardDescription>
                  Enter the 6-digit code we sent to <span className="font-medium text-foreground">{email}</span> and choose a new password.
                </CardDescription>
              </>
            ) : (
              <>
                <CardTitle className="text-2xl">{mode === 'signup' ? 'Create your account' : 'Welcome back'}</CardTitle>
                <CardDescription>
                  {mode === 'signup' ? 'Start automating Instagram replies in minutes.' : 'Sign in to manage your automations.'}
                </CardDescription>
              </>
            )}
          </CardHeader>
          <CardContent>
            {step === 'credentials' ? (
              <form onSubmit={submit} className="space-y-4">
                {mode === 'signup' && (
                  <div className="space-y-2">
                    <Label htmlFor="username">Username</Label>
                    <Input id="username" required value={username} onChange={(e) => setUsername(e.target.value)} placeholder="yourname" />
                  </div>
                )}
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@brand.com" />
                </div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="password">Password</Label>
                    {mode === 'login' && (
                      <button
                        type="button"
                        className="text-xs text-violet-600 font-medium hover:underline"
                        onClick={() => setStep('forgot-email')}
                      >
                        Forgot password?
                      </button>
                    )}
                  </div>
                  <Input id="password" type="password" required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" />
                </div>
                <Button type="submit" className="w-full bg-gradient-to-r from-indigo-600 to-violet-600 shadow-lg shadow-violet-500/30" disabled={loading}>
                  {loading ? 'Please wait...' : (mode === 'signup' ? 'Send verification code' : 'Sign in')}
                </Button>
                <p className="text-sm text-center text-muted-foreground">
                  {mode === 'signup' ? 'Already have an account?' : "Don't have one yet?"}{' '}
                  <button type="button" className="text-violet-600 font-medium hover:underline" onClick={() => setMode(mode === 'signup' ? 'login' : 'signup')}>
                    {mode === 'signup' ? 'Sign in' : 'Sign up'}
                  </button>
                </p>
              </form>
            ) : step === 'otp' ? (
              <form onSubmit={verifyOtp} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="otp">6-digit code</Label>
                  <Input id="otp" required maxLength={6} value={otp} onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))}
                    placeholder="000000" className="text-center text-2xl tracking-[0.5em] font-mono" />
                </div>
                <Button type="submit" className="w-full bg-gradient-to-r from-indigo-600 to-violet-600 shadow-lg shadow-violet-500/30" disabled={loading || otp.length !== 6}>
                  {loading ? 'Verifying...' : (<><ShieldCheck className="w-4 h-4 mr-2" /> Verify & continue</>)}
                </Button>
                <div className="text-sm text-center text-muted-foreground">
                  Didn't get it?{' '}
                  <button type="button" className="text-violet-600 font-medium hover:underline" onClick={resend} disabled={loading}>
                    Resend code
                  </button>
                </div>
                <button type="button" onClick={() => setStep('credentials')} className="w-full text-xs text-muted-foreground hover:underline">
                  ← Use a different email
                </button>
              </form>
            ) : step === 'forgot-email' ? (
              <form onSubmit={requestReset} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@brand.com" />
                </div>
                <Button type="submit" className="w-full bg-gradient-to-r from-indigo-600 to-violet-600 shadow-lg shadow-violet-500/30" disabled={loading}>
                  {loading ? 'Sending...' : 'Send reset code'}
                </Button>
                <button type="button" onClick={() => setStep('credentials')} className="w-full text-xs text-muted-foreground hover:underline">
                  ← Back to sign in
                </button>
              </form>
            ) : step === 'forgot-reset' ? (
              <form onSubmit={resetPassword} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="otp">6-digit code</Label>
                  <Input id="otp" required maxLength={6} value={otp} onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))}
                    placeholder="000000" className="text-center text-2xl tracking-[0.5em] font-mono" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="newPassword">New password</Label>
                  <Input id="newPassword" type="password" required minLength={6} value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="••••••••" />
                </div>
                <Button type="submit" className="w-full bg-gradient-to-r from-indigo-600 to-violet-600 shadow-lg shadow-violet-500/30" disabled={loading}>
                  {loading ? 'Resetting...' : 'Reset password'}
                </Button>
                <div className="text-sm text-center text-muted-foreground">
                  Didn't get the code?{' '}
                  <button type="button" className="text-violet-600 font-medium hover:underline" onClick={resendReset} disabled={loading}>
                    Resend
                  </button>
                </div>
              </form>
            ) : null}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export default function AuthPage() {
  return (
    <Suspense fallback={null}>
      <AuthInner />
    </Suspense>
  );
}
