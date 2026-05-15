'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from 'sonner';
import { Bot, Mail, ArrowLeft, ShieldCheck } from 'lucide-react';

function Logo() {
  return (
    <div className="flex items-center gap-2">
      <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-indigo-500 via-violet-500 to-fuchsia-500 flex items-center justify-center shadow-lg shadow-violet-500/30">
        <Bot className="w-5 h-5 text-white" />
      </div>
      <span className="text-xl font-extrabold tracking-tight">Komentra</span>
    </div>
  );
}

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

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-indigo-50 via-violet-50 to-fuchsia-50 p-4 relative overflow-hidden">
      <div className="absolute top-0 -left-32 w-96 h-96 bg-violet-300/30 rounded-full blur-3xl"></div>
      <div className="absolute bottom-0 -right-32 w-96 h-96 bg-fuchsia-300/30 rounded-full blur-3xl"></div>
      <div className="w-full max-w-md relative z-10">
        <div className="flex justify-between items-center mb-6">
          <Button variant="ghost" size="sm" onClick={() => router.push('/')}>
            <ArrowLeft className="w-4 h-4 mr-1" /> Home
          </Button>
          <Logo />
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
                  <Label htmlFor="password">Password</Label>
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
            ) : (
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
            )}
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
