'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  Bot, Zap, MessageSquare, Send, Sparkles, ShieldCheck, BarChart3,
  Hash, UserCheck, ArrowRight, CheckCircle2, Instagram,
} from 'lucide-react';

export default function Home() {
  const router = useRouter();

  useEffect(() => {
    const t = localStorage.getItem('token');
    if (t) router.replace('/dashboard');
  }, [router]);

  return (
    <div className="min-h-screen bg-gradient-to-b from-white via-violet-50/30 to-fuchsia-50/30">
      {/* Nav */}
      <nav className="border-b bg-white/70 backdrop-blur-md sticky top-0 z-30">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-indigo-500 via-violet-500 to-fuchsia-500 flex items-center justify-center shadow-lg shadow-violet-500/30">
              <Bot className="w-5 h-5 text-white" />
            </div>
            <span className="text-xl font-extrabold tracking-tight">Komentra</span>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" onClick={() => router.push('/auth?mode=login')}>Sign in</Button>
            <Button onClick={() => router.push('/auth?mode=signup')} className="bg-gradient-to-r from-indigo-600 to-violet-600 shadow-lg shadow-violet-500/30">
              Get started <ArrowRight className="w-4 h-4 ml-1" />
            </Button>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="relative overflow-hidden pt-16 pb-24">
        <div className="absolute top-20 -left-32 w-96 h-96 bg-violet-300/30 rounded-full blur-3xl"></div>
        <div className="absolute top-40 -right-32 w-96 h-96 bg-fuchsia-300/30 rounded-full blur-3xl"></div>
        <div className="container mx-auto px-4 relative z-10 text-center max-w-4xl">
          <div className="inline-flex items-center gap-2 bg-violet-100 text-violet-700 px-4 py-2 rounded-full text-sm font-medium mb-6">
            <Sparkles className="w-4 h-4" /> Built for creators, brands, and agencies
          </div>
          <h1 className="text-5xl md:text-7xl font-extrabold tracking-tight bg-gradient-to-br from-slate-900 to-violet-600 bg-clip-text text-transparent leading-[1.1]">
            Auto-reply to Instagram comments.<br />Send smart DMs on autopilot.
          </h1>
          <p className="text-lg md:text-xl text-muted-foreground mt-6 max-w-2xl mx-auto">
            Komentra turns comments into quick replies and DMs, so interested people get the right link without manual follow-up.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center mt-8">
            <Button onClick={() => router.push('/auth?mode=signup')} size="lg" className="bg-gradient-to-r from-indigo-600 to-violet-600 shadow-xl shadow-violet-500/30 text-base px-8">
              Start free <ArrowRight className="w-5 h-5 ml-2" />
            </Button>
            <Button onClick={() => router.push('/auth?mode=login')} size="lg" variant="outline" className="text-base px-8">
              I have an account
            </Button>
          </div>
          <div className="flex items-center justify-center gap-6 mt-10 text-sm text-muted-foreground flex-wrap">
            <span className="flex items-center gap-1"><CheckCircle2 className="w-4 h-4 text-emerald-500" /> Verified Meta integration</span>
            <span className="flex items-center gap-1"><CheckCircle2 className="w-4 h-4 text-emerald-500" /> No credit card</span>
            <span className="flex items-center gap-1"><CheckCircle2 className="w-4 h-4 text-emerald-500" /> Setup in 2 minutes</span>
          </div>
        </div>
      </section>

      {/* Feature grid */}
      <section className="container mx-auto px-4 pb-24">
        <h2 className="text-3xl md:text-4xl font-bold text-center mb-3">Everything you need. Nothing you don't.</h2>
        <p className="text-center text-muted-foreground mb-12 max-w-2xl mx-auto">Set up the replies, DMs, links, and follow checks your Instagram workflow needs.</p>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {[
            { icon: Zap, title: 'Multi-keyword triggers', desc: 'Add as many trigger words as you want. Choose match type: contains, exact, starts-with.', color: 'from-amber-400 to-orange-500' },
            { icon: MessageSquare, title: '3 reply variants', desc: 'Avoid spammy repetition. We randomly pick from up to 3 replies for natural variety.', color: 'from-rose-400 to-fuchsia-500' },
            { icon: Send, title: 'DMs with link buttons', desc: 'Send a button-template DM with up to 3 web links. Higher click-through than plain text.', color: 'from-indigo-400 to-violet-500' },
            { icon: UserCheck, title: 'Follow-gating, verified', desc: 'Require a follow first. We check Instagram\'s API to verify the actual follow before unlocking.', color: 'from-emerald-400 to-teal-500' },
            { icon: BarChart3, title: 'Real-time analytics', desc: 'Conversion funnel, top keywords, per-automation stats, recent matches — all in one dashboard.', color: 'from-cyan-400 to-blue-500' },
            { icon: ShieldCheck, title: 'Built to scale', desc: 'Redis-backed queue with worker pool. Webhooks ack in <100ms. Ready for thousands of accounts.', color: 'from-violet-400 to-purple-600' },
          ].map((f) => (
            <Card key={f.title} className="border-0 shadow-md hover:shadow-xl transition-shadow">
              <CardContent className="p-6">
                <div className={`w-11 h-11 rounded-xl bg-gradient-to-br ${f.color} flex items-center justify-center mb-4 shadow-md`}>
                  <f.icon className="w-5 h-5 text-white" />
                </div>
                <h3 className="font-bold text-lg mb-2">{f.title}</h3>
                <p className="text-muted-foreground text-sm">{f.desc}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      {/* How it works */}
      <section className="bg-white/60 border-y py-20">
        <div className="container mx-auto px-4 max-w-5xl">
          <h2 className="text-3xl md:text-4xl font-bold text-center mb-3">How it works</h2>
          <p className="text-center text-muted-foreground mb-14">From signup to your first auto-reply in under 2 minutes.</p>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            {[
              { step: '01', title: 'Sign up', desc: 'Create an account with email + OTP verification.', icon: Bot },
              { step: '02', title: 'Connect Instagram', desc: 'One-click Meta OAuth. We handle long-lived tokens & webhook subscriptions.', icon: Instagram },
              { step: '03', title: 'Build automation', desc: 'Pick a post, add trigger keywords, write replies + DM with link buttons.', icon: Zap },
              { step: '04', title: 'Watch it fire', desc: 'Live analytics show every match, reply, and DM in real time.', icon: BarChart3 },
            ].map((s, i) => (
              <div key={s.step} className="relative">
                <div className="text-5xl font-extrabold text-violet-200 mb-2">{s.step}</div>
                <div className="w-10 h-10 rounded-lg bg-gradient-to-tr from-indigo-500 to-violet-500 flex items-center justify-center mb-3 shadow-md">
                  <s.icon className="w-5 h-5 text-white" />
                </div>
                <h3 className="font-bold mb-1">{s.title}</h3>
                <p className="text-sm text-muted-foreground">{s.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="container mx-auto px-4 py-20 text-center max-w-3xl">
        <Card className="border-0 shadow-2xl bg-gradient-to-br from-indigo-600 via-violet-600 to-fuchsia-600 text-white overflow-hidden relative">
          <div className="absolute top-0 right-0 w-64 h-64 bg-white/10 rounded-full blur-3xl"></div>
          <CardContent className="p-12 relative z-10">
            <Hash className="w-12 h-12 mx-auto mb-4 opacity-80" />
            <h3 className="text-3xl font-bold mb-3">Ready to convert comments into DMs?</h3>
            <p className="opacity-90 mb-8 max-w-xl mx-auto">Sign up free, connect your Instagram Business account, and have your first automation live in 2 minutes.</p>
            <Button onClick={() => router.push('/auth?mode=signup')} size="lg" variant="secondary" className="text-base px-8 shadow-lg">
              Get started free <ArrowRight className="w-5 h-5 ml-2" />
            </Button>
          </CardContent>
        </Card>
      </section>

      <footer className="border-t py-8 text-center text-sm text-muted-foreground">
        <div className="flex items-center justify-center gap-3 flex-wrap">
          <span>&copy; {new Date().getFullYear()} Komentra. Built for creators.</span>
          <Link href="/privacy" className="text-violet-600 hover:underline">Privacy Policy</Link>
        </div>
      </footer>
    </div>
  );
}
