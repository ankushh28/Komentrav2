'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import {
  ArrowLeft,
  CalendarClock,
  CheckCircle2,
  CreditCard,
  Crown,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  XCircle,
  Zap,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

function formatLimit(value) {
  return Number(value || 0).toLocaleString('en-IN');
}

function formatDate(value) {
  return value ? new Date(value).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : 'Not scheduled';
}

function percent(used, limit) {
  if (!limit) return 0;
  return Math.min(100, Math.round((used / limit) * 100));
}

function Meter({ label, used, limit }) {
  const pct = percent(used, limit);
  const warn = pct >= 80;
  return (
    <div>
      <div className="mb-1 flex items-center justify-between gap-3 text-sm">
        <span className={warn ? 'font-medium text-amber-700' : 'text-slate-600'}>{label}</span>
        <span className="font-medium">{formatLimit(used)} / {formatLimit(limit)}</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-slate-100">
        <div className={`h-full rounded-full ${warn ? 'bg-amber-500' : 'bg-slate-950'}`} style={{ width: `${pct}%` }} />
      </div>
      {warn && <p className="mt-1 text-xs text-amber-700">Usage is above 80% for this limit.</p>}
    </div>
  );
}

function loadRazorpayScript() {
  return new Promise((resolve, reject) => {
    if (window.Razorpay) {
      resolve(true);
      return;
    }
    const script = document.createElement('script');
    script.src = 'https://checkout.razorpay.com/v1/checkout.js';
    script.onload = () => resolve(true);
    script.onerror = () => reject(new Error('Unable to load Razorpay Checkout. Please try again.'));
    document.body.appendChild(script);
  });
}

export default function BillingPage() {
  const router = useRouter();
  const [token, setToken] = useState(null);
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [checkoutPlan, setCheckoutPlan] = useState('');
  const [billingAction, setBillingAction] = useState('');

  useEffect(() => {
    const t = localStorage.getItem('token');
    if (!t) {
      router.replace('/auth?mode=login');
      return;
    }
    setToken(t);
  }, [router]);

  const loadStatus = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const res = await fetch('/api/billing/status', { headers: { Authorization: `Bearer ${token}` } });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Unable to load billing status');
      setStatus(data);
    } catch (e) {
      toast.error(e.message);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => { loadStatus(); }, [loadStatus]);

  const currentPlanId = status?.plan?.id || 'free';
  const paidPlans = useMemo(() => (status?.plans || []).filter(plan => plan.id !== 'free'), [status]);
  const isPaidCurrent = currentPlanId !== 'free' && ['active', 'authenticated'].includes(String(status?.subscription?.status || '').toLowerCase());
  const scheduledPlan = status?.subscription?.scheduledPlanId
    ? (status.plans || []).find(plan => plan.id === status.subscription.scheduledPlanId)
    : null;

  const startCheckout = async (planId) => {
    if (!token) return;
    setCheckoutPlan(planId);
    try {
      const res = await fetch('/api/billing/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ planId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Unable to start checkout');
      await loadRazorpayScript();
      const checkout = new window.Razorpay({
        key: data.keyId,
        subscription_id: data.subscriptionId,
        name: 'Komentra',
        description: `${data.plan.name} plan`,
        prefill: data.prefill || {},
        notes: { planId },
        handler: () => {
          toast.success('Payment received. Your plan will update after Razorpay confirms it.');
          setTimeout(loadStatus, 1500);
        },
        modal: {
          ondismiss: () => toast.info('Checkout closed. Your current plan is unchanged.'),
        },
      });
      checkout.open();
    } catch (e) {
      toast.error(e.message);
    } finally {
      setCheckoutPlan('');
    }
  };

  const schedulePlanChange = async (planId) => {
    if (!token) return;
    const plan = (status.plans || []).find(item => item.id === planId);
    if (!confirm(`Schedule ${plan?.name || 'this plan'} for the next billing cycle?`)) return;
    setBillingAction(planId);
    try {
      const res = await fetch('/api/billing/subscription', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ action: 'change_plan', planId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Unable to schedule plan change');
      toast.success(data.message || 'Plan change scheduled');
      await loadStatus();
    } catch (e) {
      toast.error(e.message);
    } finally {
      setBillingAction('');
    }
  };

  const cancelAtPeriodEnd = async () => {
    if (!token) return;
    if (!confirm('Schedule cancellation at the end of this billing period? Your current plan remains active until then.')) return;
    setBillingAction('cancel');
    try {
      const res = await fetch('/api/billing/subscription', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ action: 'cancel' }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Unable to schedule cancellation');
      toast.success(data.message || 'Cancellation scheduled');
      await loadStatus();
    } catch (e) {
      toast.error(e.message);
    } finally {
      setBillingAction('');
    }
  };

  if (!token || loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <RefreshCw className="h-7 w-7 animate-spin text-slate-700" />
      </div>
    );
  }

  if (!status) return null;

  return (
    <div className="min-h-screen bg-slate-50 text-slate-950">
      <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/90 backdrop-blur">
        <div className="container mx-auto flex items-center justify-between gap-3 px-4 py-4">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" onClick={() => router.push('/dashboard')}>
              <ArrowLeft className="mr-1 h-4 w-4" /> Back
            </Button>
            <div className="flex items-center gap-2">
              <CreditCard className="h-5 w-5 text-slate-700" />
              <h1 className="text-xl font-bold">Billing / Plan</h1>
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={loadStatus}>
            <RefreshCw className="mr-1 h-4 w-4" /> Refresh
          </Button>
        </div>
      </header>

      <main className="container mx-auto max-w-6xl space-y-6 px-4 py-8">
        <section className="grid gap-4 lg:grid-cols-[0.9fr_1.1fr]">
          <Card className="border-slate-200 bg-white shadow-sm">
            <CardContent className="p-6">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-sm font-medium text-slate-500">Current plan</p>
                  <div className="mt-2 flex items-center gap-2">
                    <h2 className="text-3xl font-semibold">{status.plan.name}</h2>
                    <Badge className={currentPlanId === 'free' ? 'bg-slate-100 text-slate-700' : 'bg-emerald-100 text-emerald-700'}>
                      {status.subscription.status}
                    </Badge>
                  </div>
                  <p className="mt-2 text-sm text-slate-600">{status.plan.description}</p>
                </div>
                <Crown className="h-6 w-6 text-amber-500" />
              </div>
              <div className="mt-6 grid gap-3 text-sm sm:grid-cols-2">
                <div className="rounded-lg border border-slate-200 p-3">
                  <p className="text-slate-500">Renews / ends</p>
                  <p className="mt-1 font-medium">{formatDate(status.subscription.currentPeriodEnd)}</p>
                </div>
                <div className="rounded-lg border border-slate-200 p-3">
                  <p className="text-slate-500">Payment</p>
                  <p className="mt-1 font-medium">{status.subscription.lastPaymentStatus || 'No payment needed'}</p>
                </div>
              </div>
              {scheduledPlan && (
                <div className="mt-4 flex gap-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                  <CalendarClock className="mt-0.5 h-4 w-4 shrink-0" />
                  <p>{scheduledPlan.name} is scheduled for {formatDate(status.subscription.scheduledPlanAt || status.subscription.currentPeriodEnd)}.</p>
                </div>
              )}
              {isPaidCurrent && !status.subscription.cancelAtPeriodEnd && (
                <Button variant="outline" className="mt-5 border-rose-200 text-rose-700 hover:bg-rose-50" onClick={cancelAtPeriodEnd} disabled={billingAction === 'cancel'}>
                  <XCircle className="mr-2 h-4 w-4" />
                  {billingAction === 'cancel' ? 'Scheduling...' : 'Cancel at period end'}
                </Button>
              )}
            </CardContent>
          </Card>

          <Card className="border-slate-200 bg-white shadow-sm">
            <CardContent className="space-y-5 p-6">
              <div className="flex items-center gap-2">
                <Zap className="h-5 w-5 text-slate-700" />
                <h2 className="text-lg font-semibold">Usage this month</h2>
              </div>
              <Meter label="Workspaces" used={status.usage.workspaces.used} limit={status.usage.workspaces.limit} />
              <Meter label="Instagram accounts" used={status.usage.accounts.used} limit={status.usage.accounts.limit} />
              <div className="space-y-4">
                {status.usage.workspacesBreakdown.length === 0 ? (
                  <p className="text-sm text-slate-500">Create a workspace to see automation and trigger usage.</p>
                ) : status.usage.workspacesBreakdown.map(workspace => (
                  <div key={workspace.id} className="rounded-lg border border-slate-200 p-4">
                    <div className="mb-3 flex items-center justify-between gap-3">
                      <p className="font-medium">{workspace.name}</p>
                      <Badge variant="outline">{workspace.status}</Badge>
                    </div>
                    <div className="space-y-3">
                      <Meter label="Active automations" used={workspace.activeAutomations} limit={workspace.activeAutomationsLimit} />
                      <Meter label="Triggers" used={workspace.triggersUsed} limit={workspace.triggerLimit} />
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </section>

        <section>
          <div className="mb-4">
            <h2 className="text-xl font-semibold">Upgrade options</h2>
            <p className="mt-1 text-sm text-slate-600">Paid plans activate only after Razorpay confirms the subscription.</p>
          </div>
          <div className="grid gap-4 lg:grid-cols-3">
            {paidPlans.map(plan => (
              <Card key={plan.id} className={`border bg-white shadow-sm ${plan.id === currentPlanId ? 'border-slate-950' : 'border-slate-200'}`}>
                <CardContent className="p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h3 className="text-lg font-semibold">{plan.name}</h3>
                      <p className="mt-1 text-sm text-slate-500">{plan.description}</p>
                    </div>
                    {plan.id === currentPlanId && <Badge className="bg-emerald-100 text-emerald-700">Current</Badge>}
                  </div>
                  <div className="mt-5">
                    <span className="text-3xl font-semibold">Rs. {formatLimit(plan.priceInr)}</span>
                    <span className="text-sm text-slate-500">/mo</span>
                  </div>
                  <ul className="mt-5 space-y-2 text-sm text-slate-600">
                    <li className="flex gap-2"><CheckCircle2 className="mt-0.5 h-4 w-4 text-emerald-600" /> {plan.maxWorkspaces} workspace/account limit</li>
                    <li className="flex gap-2"><CheckCircle2 className="mt-0.5 h-4 w-4 text-emerald-600" /> {plan.maxActiveAutomationsPerWorkspace} active automations per workspace</li>
                    <li className="flex gap-2"><CheckCircle2 className="mt-0.5 h-4 w-4 text-emerald-600" /> {formatLimit(plan.monthlyTriggersPerWorkspace)} triggers per workspace/month</li>
                    <li className="flex gap-2"><ShieldCheck className="mt-0.5 h-4 w-4 text-sky-600" /> {plan.analyticsLookbackDays}-day analytics</li>
                  </ul>
                  <Button
                    className="mt-5 w-full bg-slate-950 hover:bg-slate-800"
                    disabled={plan.id === currentPlanId || checkoutPlan === plan.id || billingAction === plan.id}
                    onClick={() => (isPaidCurrent ? schedulePlanChange(plan.id) : startCheckout(plan.id))}
                  >
                    <Sparkles className="mr-2 h-4 w-4" />
                    {plan.id === currentPlanId
                      ? 'Current plan'
                      : checkoutPlan === plan.id
                        ? 'Opening...'
                        : billingAction === plan.id
                          ? 'Scheduling...'
                          : isPaidCurrent
                            ? `Schedule ${plan.name}`
                            : `Upgrade to ${plan.name}`}
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>

        <div className="rounded-lg border border-slate-200 bg-white p-4 text-sm text-slate-600">
          Need help with billing or an agency setup? <Link href="/contact?topic=billing" className="font-medium text-slate-950 hover:underline">Contact support</Link>.
        </div>
      </main>
    </div>
  );
}
