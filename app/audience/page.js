'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ArrowLeft, Download, Search, Users, Activity, MessageCircle, Inbox } from 'lucide-react';

function scopedHeaders(token, workspaceId, extra = {}) {
  return {
    ...extra,
    Authorization: `Bearer ${token}`,
    ...(workspaceId ? { 'X-Workspace-Id': workspaceId } : {}),
  };
}

function formatDate(value) {
  return value ? new Date(value).toLocaleString() : '-';
}

function audienceName(member) {
  if (member.username) return `@${member.username}`;
  return member.displayName || member.instagramScopedUserId || 'Unknown';
}

export default function AudiencePage() {
  const router = useRouter();
  const [token, setToken] = useState(null);
  const [workspaces, setWorkspaces] = useState([]);
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState('');
  const [audience, setAudience] = useState([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const t = localStorage.getItem('token');
    if (!t) { router.push('/'); return; }
    setToken(t);
  }, [router]);

  const loadWorkspaces = useCallback(async () => {
    if (!token) return;
    const res = await fetch('/api/workspaces', { headers: { Authorization: `Bearer ${token}` } });
    const data = await res.json();
    const list = data.workspaces || [];
    setWorkspaces(list);
    const stored = localStorage.getItem('selectedWorkspaceId');
    const nextId = (stored && list.some(w => w.id === stored) && stored) || list.find(w => w.status === 'active')?.id || list[0]?.id || '';
    if (nextId) {
      setSelectedWorkspaceId(nextId);
      localStorage.setItem('selectedWorkspaceId', nextId);
    }
  }, [token]);

  const loadAudience = useCallback(async () => {
    if (!token || !selectedWorkspaceId) return;
    setLoading(true);
    const params = new URLSearchParams();
    if (search.trim()) params.set('search', search.trim());
    const res = await fetch(`/api/audience${params.toString() ? `?${params}` : ''}`, {
      headers: scopedHeaders(token, selectedWorkspaceId),
    });
    const data = await res.json();
    setAudience(data.audience || []);
    setLoading(false);
  }, [token, selectedWorkspaceId, search]);

  useEffect(() => { if (token) loadWorkspaces(); }, [token, loadWorkspaces]);
  useEffect(() => { if (selectedWorkspaceId) loadAudience(); }, [selectedWorkspaceId, loadAudience]);

  const selectedWorkspace = workspaces.find(w => w.id === selectedWorkspaceId);
  const totals = useMemo(() => audience.reduce((acc, member) => {
    acc.triggers += member.triggerCount || 0;
    acc.comments += member.commentTriggerCount || 0;
    acc.dms += member.dmTriggerCount || 0;
    return acc;
  }, { triggers: 0, comments: 0, dms: 0 }), [audience]);

  const selectWorkspace = (id) => {
    setSelectedWorkspaceId(id);
    localStorage.setItem('selectedWorkspaceId', id);
  };

  const exportCsv = () => {
    if (!token || !selectedWorkspaceId) return;
    window.location.href = `/api/audience/export?workspaceId=${encodeURIComponent(selectedWorkspaceId)}`;
    fetch('/api/audience/export', { headers: scopedHeaders(token, selectedWorkspaceId) })
      .then(async (res) => {
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${(selectedWorkspace?.name || 'workspace').replace(/[^a-z0-9]+/gi, '-').toLowerCase()}-audience.csv`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
      });
  };

  if (!token) return null;

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white/90 backdrop-blur sticky top-0 z-20">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" onClick={() => router.push('/dashboard')}>
              <ArrowLeft className="w-4 h-4 mr-1" /> Back
            </Button>
            <div className="flex items-center gap-2">
              <Users className="w-5 h-5 text-slate-700" />
              <h1 className="text-xl font-bold">Audience</h1>
            </div>
          </div>
          <div className="hidden sm:flex items-center gap-2">
            <Select value={selectedWorkspaceId} onValueChange={selectWorkspace}>
              <SelectTrigger className="w-52 bg-white"><SelectValue placeholder="Workspace" /></SelectTrigger>
              <SelectContent>
                {workspaces.map(w => <SelectItem key={w.id} value={w.id}>{w.name}{w.status === 'disabled' ? ' (disabled)' : ''}</SelectItem>)}
              </SelectContent>
            </Select>
            <Button onClick={exportCsv} className="bg-slate-950 hover:bg-slate-800">
              <Download className="w-4 h-4 mr-1" /> Export audience
            </Button>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8 max-w-6xl space-y-6">
        <div className="sm:hidden flex flex-col gap-2">
          <Select value={selectedWorkspaceId} onValueChange={selectWorkspace}>
            <SelectTrigger className="bg-white"><SelectValue placeholder="Workspace" /></SelectTrigger>
            <SelectContent>
              {workspaces.map(w => <SelectItem key={w.id} value={w.id}>{w.name}{w.status === 'disabled' ? ' (disabled)' : ''}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button onClick={exportCsv} className="bg-slate-950 hover:bg-slate-800">
            <Download className="w-4 h-4 mr-1" /> Export audience
          </Button>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card className="border border-slate-200 bg-white text-slate-950 shadow-sm">
            <CardContent className="p-5"><p className="text-xs text-slate-500 mb-1">Audience</p><p className="text-3xl font-bold">{audience.length}</p></CardContent>
          </Card>
          <Card className="border border-slate-200 bg-white text-slate-950 shadow-sm">
            <CardContent className="p-5"><p className="text-xs text-slate-500 mb-1">Triggers</p><p className="text-3xl font-bold">{totals.triggers}</p></CardContent>
          </Card>
          <Card className="border border-slate-200 bg-white text-slate-950 shadow-sm">
            <CardContent className="p-5"><p className="text-xs text-slate-500 mb-1">Comments</p><p className="text-3xl font-bold">{totals.comments}</p></CardContent>
          </Card>
          <Card className="border border-slate-200 bg-white text-slate-950 shadow-sm">
            <CardContent className="p-5"><p className="text-xs text-slate-500 mb-1">DMs</p><p className="text-3xl font-bold">{totals.dms}</p></CardContent>
          </Card>
        </div>

        <Card>
          <CardContent className="p-5">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 mb-5">
              <div>
                <h2 className="text-lg font-semibold">{selectedWorkspace?.name || 'Workspace'} audience</h2>
                <p className="text-sm text-muted-foreground">People appear here after they trigger a matching automation.</p>
              </div>
              <div className="relative w-full md:w-80">
                <Search className="w-4 h-4 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2" />
                <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search audience..." className="pl-9" />
              </div>
            </div>

            {loading ? (
              <div className="py-16 text-center text-muted-foreground"><Activity className="w-6 h-6 mx-auto mb-2 animate-pulse" /> Loading audience...</div>
            ) : audience.length === 0 ? (
              <div className="py-16 text-center">
                <Users className="w-12 h-12 mx-auto text-muted-foreground mb-3" />
                <p className="font-medium">No audience yet</p>
                <p className="text-sm text-muted-foreground">Matched comments and DMs will show up here.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-xs text-muted-foreground border-b">
                    <tr>
                      <th className="text-left py-2">User</th>
                      <th className="text-right">Total</th>
                      <th className="text-right">Comments</th>
                      <th className="text-right">DMs</th>
                      <th className="text-left">Last automation</th>
                      <th className="text-left">Last message</th>
                      <th className="text-right">Last triggered</th>
                    </tr>
                  </thead>
                  <tbody>
                    {audience.map(member => (
                      <tr key={member.id} className="border-b hover:bg-slate-50">
                        <td className="py-3">
                          <div className="font-semibold">{audienceName(member)}</div>
                          <div className="text-xs text-muted-foreground">{member.instagramScopedUserId}</div>
                        </td>
                        <td className="text-right font-semibold">{member.triggerCount}</td>
                        <td className="text-right"><Badge className="bg-slate-100 text-slate-700"><MessageCircle className="w-3 h-3 mr-1" /> {member.commentTriggerCount}</Badge></td>
                        <td className="text-right"><Badge className="bg-sky-100 text-sky-700"><Inbox className="w-3 h-3 mr-1" /> {member.dmTriggerCount}</Badge></td>
                        <td className="py-3 max-w-[220px] truncate">{member.lastAutomationName || '-'}</td>
                        <td className="py-3 max-w-[280px] truncate">"{member.lastMessageText || ''}"</td>
                        <td className="py-3 text-right text-xs text-muted-foreground whitespace-nowrap">{formatDate(member.lastTriggeredAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </main>

      <footer className="border-t bg-white/80">
        <div className="container mx-auto flex flex-col gap-3 px-4 py-5 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
          <p>Copyright {new Date().getFullYear()} Komentra.</p>
          <div className="flex flex-wrap items-center gap-4">
            <Link href={`/contact?source=app&workspaceId=${selectedWorkspaceId || ''}`} className="hover:text-foreground">Contact</Link>
            <Link href="/privacy" className="hover:text-foreground">Privacy</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
