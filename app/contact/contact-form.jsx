'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Send, CheckCircle2, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

const initialForm = {
  name: '',
  email: '',
  company: '',
  workspaceId: '',
  instagram: '',
  topic: 'support',
  message: '',
  website: '',
};

export function ContactForm() {
  const params = useSearchParams();
  const [form, setForm] = useState(initialForm);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [workspaces, setWorkspaces] = useState([]);
  const [loadingWorkspaces, setLoadingWorkspaces] = useState(false);
  const [status, setStatus] = useState('idle');
  const [error, setError] = useState('');

  useEffect(() => {
    const source = params.get('source');
    const topic = params.get('topic');
    const allowedTopic = ['general', 'support', 'privacy', 'billing', 'partnership'].includes(topic) ? topic : '';

    try {
      const token = localStorage.getItem('token');
      const user = JSON.parse(localStorage.getItem('user') || '{}');

      if (!token || !user?.email) {
        setIsLoggedIn(false);
        setWorkspaces([]);
        setForm((current) => ({
          ...current,
          topic: allowedTopic || current.topic,
        }));
        return;
      }

      setIsLoggedIn(true);
      setForm((current) => ({
        ...current,
        name: current.name || user.username || '',
        email: current.email || user.email || '',
        topic: allowedTopic || (source === 'app' || source === 'dashboard' ? 'support' : current.topic),
      }));

      const preferredWorkspaceId = params.get('workspaceId') || localStorage.getItem('selectedWorkspaceId') || '';
      setLoadingWorkspaces(true);
      fetch('/api/workspaces', { headers: { Authorization: `Bearer ${token}` } })
        .then((res) => res.ok ? res.json() : Promise.reject(new Error('Unable to load workspaces')))
        .then((data) => {
          const list = data.workspaces || [];
          setWorkspaces(list);
          const selected =
            list.find((workspace) => workspace.id === preferredWorkspaceId) ||
            list.find((workspace) => workspace.status === 'active') ||
            list[0];

          if (selected) {
            setForm((current) => ({
              ...current,
              workspaceId: selected.id,
              company: selected.name,
            }));
          }
        })
        .catch(() => setWorkspaces([]))
        .finally(() => setLoadingWorkspaces(false));
    } catch {}
  }, [params]);

  const update = (field, value) => {
    setForm((current) => ({ ...current, [field]: value }));
  };

  const submit = async (event) => {
    event.preventDefault();
    setStatus('loading');
    setError('');

    try {
      const res = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Unable to send your message right now.');
      setStatus('sent');
      setForm((current) => ({
        ...initialForm,
        name: current.name,
        email: current.email,
        company: isLoggedIn ? current.company : '',
        workspaceId: isLoggedIn ? current.workspaceId : '',
        topic: current.topic,
      }));
    } catch (err) {
      setError(err.message);
      setStatus('error');
    }
  };

  return (
    <form onSubmit={submit} className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm md:p-6">
      <div className="hidden">
        <Label htmlFor="website">Website</Label>
        <Input id="website" value={form.website} onChange={(e) => update('website', e.target.value)} tabIndex={-1} autoComplete="off" />
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="name">Name</Label>
          <Input id="name" value={form.name} onChange={(e) => update('name', e.target.value)} placeholder="Your name" required />
        </div>
        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <Input id="email" type="email" value={form.email} onChange={(e) => update('email', e.target.value)} placeholder="you@brand.com" required />
        </div>
        {isLoggedIn ? (
          <div className="space-y-2">
            <Label>Workspace</Label>
            {workspaces.length > 0 ? (
              <Select
                value={form.workspaceId}
                onValueChange={(value) => {
                  const workspace = workspaces.find((item) => item.id === value);
                  setForm((current) => ({
                    ...current,
                    workspaceId: value,
                    company: workspace?.name || '',
                  }));
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder={loadingWorkspaces ? 'Loading workspaces...' : 'Select workspace'} />
                </SelectTrigger>
                <SelectContent>
                  {workspaces.map((workspace) => (
                    <SelectItem key={workspace.id} value={workspace.id}>
                      {workspace.name}{workspace.status === 'disabled' ? ' (disabled)' : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <Input value={loadingWorkspaces ? 'Loading workspaces...' : 'No workspace found'} disabled />
            )}
          </div>
        ) : (
          <div className="space-y-2">
            <Label htmlFor="company">Company or brand</Label>
            <Input id="company" value={form.company} onChange={(e) => update('company', e.target.value)} placeholder="Brand or agency name" />
          </div>
        )}
        <div className="space-y-2">
          <Label htmlFor="instagram">Instagram handle</Label>
          <Input id="instagram" value={form.instagram} onChange={(e) => update('instagram', e.target.value)} placeholder="@yourbrand" />
        </div>
        <div className="space-y-2 md:col-span-2">
          <Label>Topic</Label>
          <Select value={form.topic} onValueChange={(value) => update('topic', value)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="support">Support</SelectItem>
              <SelectItem value="general">General question</SelectItem>
              <SelectItem value="privacy">Privacy or deletion</SelectItem>
              <SelectItem value="billing">Billing</SelectItem>
              <SelectItem value="partnership">Partnership</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2 md:col-span-2">
          <Label htmlFor="message">Message</Label>
          <Textarea
            id="message"
            value={form.message}
            onChange={(e) => update('message', e.target.value)}
            placeholder="Tell us what you need help with."
            rows={6}
            required
          />
        </div>
      </div>

      {status === 'sent' && (
        <div className="mt-4 flex items-start gap-2 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
          <CheckCircle2 className="mt-0.5 h-4 w-4 flex-shrink-0" />
          Message sent. We will reply from admin@komentra.tech.
        </div>
      )}

      {status === 'error' && (
        <div className="mt-4 flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">
          <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" />
          {error}
        </div>
      )}

      <Button type="submit" disabled={status === 'loading'} className="mt-5 w-full bg-slate-950 hover:bg-slate-800">
        {status === 'loading' ? 'Sending...' : 'Send message'}
        <Send className="ml-2 h-4 w-4" />
      </Button>
    </form>
  );
}
