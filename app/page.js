'use client';

import { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { Instagram, LogOut, Plus, Trash2, Zap, MessageSquare, Send, Sparkles, CheckCircle2, ExternalLink } from 'lucide-react';

function Logo() {
  return (
    <div className="flex items-center gap-2">
      <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-fuchsia-500 via-rose-500 to-amber-400 flex items-center justify-center shadow-md">
        <Zap className="w-5 h-5 text-white" />
      </div>
      <span className="text-xl font-bold tracking-tight">ReplyPilot</span>
    </div>
  );
}

function AuthScreen({ onAuth }) {
  const [mode, setMode] = useState('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await fetch(`/api/auth/${mode === 'login' ? 'login' : 'signup'}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed');
      localStorage.setItem('token', data.token);
      localStorage.setItem('user', JSON.stringify(data.user));
      toast.success(mode === 'login' ? 'Welcome back!' : 'Account created!');
      onAuth(data.token, data.user);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-rose-50 via-fuchsia-50 to-amber-50 p-4">
      <div className="w-full max-w-md">
        <div className="flex justify-center mb-8"><Logo /></div>
        <Card className="shadow-2xl border-0">
          <CardHeader>
            <CardTitle className="text-2xl">{mode === 'login' ? 'Welcome back' : 'Create your account'}</CardTitle>
            <CardDescription>
              {mode === 'login' ? 'Sign in to manage your Instagram automations.' : 'Start automating Instagram replies in minutes.'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={submit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@brand.com" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <Input id="password" type="password" required value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" />
              </div>
              <Button type="submit" className="w-full bg-gradient-to-r from-fuchsia-600 to-rose-500 hover:opacity-95" disabled={loading}>
                {loading ? 'Please wait...' : (mode === 'login' ? 'Sign in' : 'Sign up')}
              </Button>
            </form>
            <p className="text-sm text-center text-muted-foreground mt-4">
              {mode === 'login' ? "Don't have an account?" : 'Already have one?'}{' '}
              <button className="text-fuchsia-600 font-medium hover:underline" onClick={() => setMode(mode === 'login' ? 'signup' : 'login')}>
                {mode === 'login' ? 'Sign up' : 'Sign in'}
              </button>
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function CreateAutomationDialog({ open, onOpenChange, accounts, token, onCreated }) {
  const [step, setStep] = useState(1);
  const [selectedAccount, setSelectedAccount] = useState('');
  const [media, setMedia] = useState([]);
  const [loadingMedia, setLoadingMedia] = useState(false);
  const [selectedPost, setSelectedPost] = useState(null);
  const [trigger, setTrigger] = useState('');
  const [reply, setReply] = useState('');
  const [dm, setDm] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) {
      setStep(1); setSelectedAccount(''); setMedia([]); setSelectedPost(null);
      setTrigger(''); setReply(''); setDm('');
    }
  }, [open]);

  useEffect(() => {
    if (selectedAccount) {
      setLoadingMedia(true);
      fetch(`/api/instagram/media?accountId=${selectedAccount}`, { headers: { Authorization: `Bearer ${token}` } })
        .then(r => r.json())
        .then(d => { setMedia(d.media || []); })
        .catch(() => toast.error('Failed to load posts'))
        .finally(() => setLoadingMedia(false));
    }
  }, [selectedAccount, token]);

  const create = async () => {
    if (!selectedPost || !trigger || !reply || !dm) {
      toast.error('Fill all fields');
      return;
    }
    setSaving(true);
    try {
      const res = await fetch('/api/automations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          instagramAccountId: selectedAccount,
          postId: selectedPost.id,
          postPermalink: selectedPost.permalink,
          postThumbnail: selectedPost.thumbnail_url || selectedPost.media_url,
          triggerWord: trigger,
          replyMessage: reply,
          dmMessage: dm,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed');
      toast.success('Automation created!');
      onCreated(data.automation);
      onOpenChange(false);
    } catch (e) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Sparkles className="w-5 h-5 text-fuchsia-500" /> Create New Automation</DialogTitle>
          <DialogDescription>When someone comments your trigger word on a selected post, ReplyPilot will auto-reply and send a DM.</DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Step 1: account */}
          <div>
            <Label className="text-sm font-semibold">1. Instagram Account</Label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-2">
              {accounts.map((a) => (
                <button key={a.id} onClick={() => setSelectedAccount(a.id)}
                  className={`p-3 rounded-lg border-2 text-left transition ${selectedAccount === a.id ? 'border-fuchsia-500 bg-fuchsia-50' : 'border-border hover:border-fuchsia-300'}`}>
                  <div className="flex items-center gap-2">
                    <Instagram className="w-4 h-4" />
                    <span className="font-medium">@{a.username}</span>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Step 2: post */}
          {selectedAccount && (
            <div>
              <Label className="text-sm font-semibold">2. Select Post</Label>
              {loadingMedia ? (
                <p className="text-sm text-muted-foreground mt-2">Loading posts...</p>
              ) : media.length === 0 ? (
                <p className="text-sm text-muted-foreground mt-2">No posts found on this account.</p>
              ) : (
                <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 mt-2 max-h-64 overflow-y-auto">
                  {media.map((m) => (
                    <button key={m.id} onClick={() => setSelectedPost(m)}
                      className={`relative aspect-square rounded-lg overflow-hidden border-2 transition ${selectedPost?.id === m.id ? 'border-fuchsia-500 ring-2 ring-fuchsia-300' : 'border-transparent hover:border-fuchsia-300'}`}>
                      <img src={m.thumbnail_url || m.media_url} alt="" className="w-full h-full object-cover" />
                      {selectedPost?.id === m.id && (
                        <div className="absolute inset-0 bg-fuchsia-500/30 flex items-center justify-center">
                          <CheckCircle2 className="w-6 h-6 text-white" />
                        </div>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Step 3: words */}
          {selectedPost && (
            <>
              <div>
                <Label htmlFor="trigger" className="text-sm font-semibold">3. Trigger Keyword</Label>
                <Input id="trigger" value={trigger} onChange={(e) => setTrigger(e.target.value)} placeholder="e.g. price" className="mt-2" />
              </div>
              <div>
                <Label htmlFor="reply" className="text-sm font-semibold">4. Auto-Reply Comment</Label>
                <Textarea id="reply" value={reply} onChange={(e) => setReply(e.target.value)} placeholder="Sent you a DM! 💌" className="mt-2" rows={2} />
              </div>
              <div>
                <Label htmlFor="dm" className="text-sm font-semibold">5. DM Message</Label>
                <Textarea id="dm" value={dm} onChange={(e) => setDm(e.target.value)} placeholder="Hey! Here's the info you asked for..." className="mt-2" rows={3} />
              </div>
            </>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={create} disabled={saving || !selectedPost || !trigger || !reply || !dm} className="bg-gradient-to-r from-fuchsia-600 to-rose-500">
            {saving ? 'Creating...' : 'Create Automation'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Dashboard({ token, user, onLogout }) {
  const [accounts, setAccounts] = useState([]);
  const [automations, setAutomations] = useState([]);
  const [showCreate, setShowCreate] = useState(false);
  const [connecting, setConnecting] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const [a, b] = await Promise.all([
        fetch('/api/instagram/accounts', { headers: { Authorization: `Bearer ${token}` } }).then(r => r.json()),
        fetch('/api/automations', { headers: { Authorization: `Bearer ${token}` } }).then(r => r.json()),
      ]);
      setAccounts(a.accounts || []);
      setAutomations(b.automations || []);
    } catch (e) {
      toast.error('Failed to load data');
    }
  }, [token]);

  useEffect(() => { refresh(); }, [refresh]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('ig') === 'success') {
      toast.success('Instagram account connected!');
      window.history.replaceState({}, '', '/');
      refresh();
    } else if (params.get('ig') === 'error') {
      toast.error('Connection failed: ' + (params.get('msg') || 'unknown error'));
      window.history.replaceState({}, '', '/');
    }
  }, [refresh]);

  const connectIG = async () => {
    setConnecting(true);
    try {
      const res = await fetch('/api/instagram/connect', { headers: { Authorization: `Bearer ${token}` } });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      window.location.href = data.url;
    } catch (e) {
      toast.error(e.message);
      setConnecting(false);
    }
  };

  const toggle = async (a) => {
    const res = await fetch(`/api/automations/${a._id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ isActive: !a.isActive }),
    });
    if (res.ok) {
      toast.success(`Automation ${!a.isActive ? 'enabled' : 'disabled'}`);
      refresh();
    }
  };

  const remove = async (id) => {
    if (!confirm('Delete this automation?')) return;
    const res = await fetch(`/api/automations/${id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
    if (res.ok) {
      toast.success('Deleted');
      refresh();
    }
  };

  const disconnectAccount = async (id) => {
    if (!confirm('Disconnect this Instagram account? All linked automations will be removed.')) return;
    const res = await fetch(`/api/instagram/accounts/${id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
    if (res.ok) {
      toast.success('Disconnected');
      refresh();
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-rose-50/30 to-fuchsia-50/30">
      {/* Header */}
      <header className="border-b bg-white/80 backdrop-blur-md sticky top-0 z-10">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <Logo />
          <div className="flex items-center gap-4">
            <span className="text-sm text-muted-foreground hidden sm:inline">{user.email}</span>
            <Button variant="ghost" size="sm" onClick={onLogout}><LogOut className="w-4 h-4 mr-2" /> Logout</Button>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8 max-w-6xl">
        {/* Connected Accounts */}
        <section className="mb-10">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-2xl font-bold flex items-center gap-2"><Instagram className="w-6 h-6 text-fuchsia-600" /> Connected Accounts</h2>
            <Button onClick={connectIG} disabled={connecting} className="bg-gradient-to-r from-fuchsia-600 to-rose-500">
              <Plus className="w-4 h-4 mr-2" /> {connecting ? 'Redirecting...' : 'Connect Instagram'}
            </Button>
          </div>
          {accounts.length === 0 ? (
            <Card className="border-dashed">
              <CardContent className="py-12 text-center">
                <Instagram className="w-12 h-12 mx-auto text-muted-foreground mb-3" />
                <p className="text-muted-foreground mb-4">No Instagram accounts connected yet.</p>
                <Button onClick={connectIG} disabled={connecting} className="bg-gradient-to-r from-fuchsia-600 to-rose-500">Connect Your First Account</Button>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {accounts.map((a) => (
                <Card key={a.id} className="hover:shadow-lg transition-shadow">
                  <CardContent className="p-5 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 rounded-full bg-gradient-to-tr from-fuchsia-500 via-rose-500 to-amber-400 flex items-center justify-center">
                        <Instagram className="w-6 h-6 text-white" />
                      </div>
                      <div>
                        <p className="font-semibold">@{a.username}</p>
                        <p className="text-xs text-muted-foreground">{a.accountType || 'Business'}</p>
                      </div>
                    </div>
                    <Button variant="ghost" size="icon" onClick={() => disconnectAccount(a.id)}>
                      <Trash2 className="w-4 h-4 text-rose-500" />
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </section>

        {/* Automations */}
        <section>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-2xl font-bold flex items-center gap-2"><Zap className="w-6 h-6 text-amber-500" /> Automations</h2>
            <Button onClick={() => setShowCreate(true)} disabled={accounts.length === 0} className="bg-gradient-to-r from-fuchsia-600 to-rose-500">
              <Plus className="w-4 h-4 mr-2" /> Create Automation
            </Button>
          </div>

          {automations.length === 0 ? (
            <Card className="border-dashed">
              <CardContent className="py-12 text-center">
                <Sparkles className="w-12 h-12 mx-auto text-muted-foreground mb-3" />
                <p className="text-muted-foreground">No automations yet. {accounts.length === 0 ? 'Connect an Instagram account to get started.' : 'Click “Create Automation” to build your first one.'}</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {automations.map((a) => {
                const acct = accounts.find(x => x.id === a.instagramAccountId);
                return (
                  <Card key={a._id} className="hover:shadow-md transition-shadow">
                    <CardContent className="p-5">
                      <div className="flex items-start gap-4">
                        {a.postThumbnail && (
                          <img src={a.postThumbnail} alt="" className="w-20 h-20 rounded-lg object-cover flex-shrink-0" />
                        )}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-2 flex-wrap">
                            <Badge variant="secondary" className="bg-fuchsia-100 text-fuchsia-700">Trigger: “{a.triggerWord}”</Badge>
                            {acct && <Badge variant="outline">@{acct.username}</Badge>}
                            {a.postPermalink && (
                              <a href={a.postPermalink} target="_blank" rel="noreferrer" className="text-xs text-fuchsia-600 hover:underline inline-flex items-center gap-1">
                                View Post <ExternalLink className="w-3 h-3" />
                              </a>
                            )}
                          </div>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                            <div className="flex items-start gap-2">
                              <MessageSquare className="w-4 h-4 text-muted-foreground mt-0.5 flex-shrink-0" />
                              <div>
                                <p className="text-xs text-muted-foreground">Auto-reply</p>
                                <p className="truncate">{a.replyMessage}</p>
                              </div>
                            </div>
                            <div className="flex items-start gap-2">
                              <Send className="w-4 h-4 text-muted-foreground mt-0.5 flex-shrink-0" />
                              <div>
                                <p className="text-xs text-muted-foreground">DM message</p>
                                <p className="truncate">{a.dmMessage}</p>
                              </div>
                            </div>
                          </div>
                        </div>
                        <div className="flex flex-col items-end gap-2 flex-shrink-0">
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-muted-foreground">{a.isActive ? 'ON' : 'OFF'}</span>
                            <Switch checked={a.isActive} onCheckedChange={() => toggle(a)} />
                          </div>
                          <Button variant="ghost" size="icon" onClick={() => remove(a._id)}>
                            <Trash2 className="w-4 h-4 text-rose-500" />
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </section>
      </main>

      <CreateAutomationDialog open={showCreate} onOpenChange={setShowCreate} accounts={accounts} token={token} onCreated={() => refresh()} />
    </div>
  );
}

function App() {
  const [token, setToken] = useState(null);
  const [user, setUser] = useState(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const t = localStorage.getItem('token');
    const u = localStorage.getItem('user');
    if (t && u) {
      setToken(t);
      try { setUser(JSON.parse(u)); } catch {}
    }
    setReady(true);
  }, []);

  const onAuth = (t, u) => { setToken(t); setUser(u); };
  const onLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    setToken(null); setUser(null);
    toast.success('Logged out');
  };

  if (!ready) return null;
  if (!token || !user) return <AuthScreen onAuth={onAuth} />;
  return <Dashboard token={token} user={user} onLogout={onLogout} />;
}

export default App;
