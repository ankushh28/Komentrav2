'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Activity, Bot, ArrowLeft, BarChart3, Zap, MessageSquare, Send, ShieldCheck,
  TrendingUp, UserCheck, Hash, Clock, Briefcase,
} from 'lucide-react';
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid,
  BarChart, Bar,
} from 'recharts';

function StatTile({ label, value, sublabel, icon: Icon }) {
  return (
    <Card className="border border-slate-200 bg-white text-slate-950 shadow-sm">
      <CardContent className="p-5">
        <div className="flex items-center justify-between mb-2">
          <p className="text-xs text-slate-500">{label}</p>
          {Icon && <Icon className="w-4 h-4 text-slate-500" />}
        </div>
        <p className="text-3xl font-bold">{value}</p>
        {sublabel && <p className="text-xs text-slate-500 mt-1">{sublabel}</p>}
      </CardContent>
    </Card>
  );
}

function FlowBadge({ flow }) {
  const map = {
    direct: { label: 'Direct DM', cls: 'bg-emerald-100 text-emerald-700' },
    'follow-gated': { label: 'Follow-prompt', cls: 'bg-amber-100 text-amber-700' },
    'follow-confirmed': { label: 'Follow ✓ → DM', cls: 'bg-slate-100 text-slate-700' },
    'follow-not-verified': { label: 'Follow not verified', cls: 'bg-rose-100 text-rose-700' },
  };
  const { label, cls } = map[flow] || { label: flow, cls: 'bg-slate-100 text-slate-700' };
  return <Badge className={`${cls} text-[10px]`}>{label}</Badge>;
}

export default function AnalyticsPage() {
  const router = useRouter();
  const [data, setData] = useState(null);
  const [workspaces, setWorkspaces] = useState([]);
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) { router.push('/'); return; }
    Promise.all([
      fetch('/api/workspaces', { headers: { Authorization: `Bearer ${token}` } }).then(r => r.json()),
      fetch('/api/analytics', { headers: { Authorization: `Bearer ${token}` } }).then(r => r.json()),
    ])
      .then(([workspaceData, analyticsData]) => {
        const list = workspaceData.workspaces || [];
        setWorkspaces(list);
        const stored = localStorage.getItem('selectedWorkspaceId');
        const nextId = (stored && list.some(w => w.id === stored) && stored) || list.find(w => w.status === 'active')?.id || list[0]?.id || '';
        setSelectedWorkspaceId(nextId);
        setData(analyticsData);
      })
      .finally(() => setLoading(false));
  }, [router]);

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center bg-slate-50"><Activity className="w-8 h-8 animate-pulse text-slate-700" /></div>;
  }
  if (!data) return null;

  const { summary, timeline, perAutomation, workspaceBreakdown = [], topKeywords, funnel, recentMatches } = data;
  const selectWorkspace = (id) => {
    setSelectedWorkspaceId(id);
    localStorage.setItem('selectedWorkspaceId', id);
  };

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white/90 backdrop-blur sticky top-0 z-20">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" onClick={() => router.push('/dashboard')}>
              <ArrowLeft className="w-4 h-4 mr-1" /> Back
            </Button>
            <div className="flex items-center gap-2">
              <BarChart3 className="w-5 h-5 text-slate-700" />
              <h1 className="text-xl font-bold">Analytics</h1>
            </div>
          </div>
          <div className="hidden sm:flex items-center gap-2">
            <Select value={selectedWorkspaceId} onValueChange={selectWorkspace}>
              <SelectTrigger className="w-52 bg-white">
                <SelectValue placeholder="Workspace" />
              </SelectTrigger>
              <SelectContent>
                {workspaces.map((w) => (
                  <SelectItem key={w.id} value={w.id}>
                    {w.name}{w.status === 'disabled' ? ' (disabled)' : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button variant="outline" size="sm" onClick={() => router.push('/dashboard')}>
              Open workspace
            </Button>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8 max-w-6xl space-y-8">
        <div className="sm:hidden flex items-center gap-2">
          <Select value={selectedWorkspaceId} onValueChange={selectWorkspace}>
            <SelectTrigger className="flex-1 bg-white">
              <SelectValue placeholder="Workspace" />
            </SelectTrigger>
            <SelectContent>
              {workspaces.map((w) => (
                <SelectItem key={w.id} value={w.id}>
                  {w.name}{w.status === 'disabled' ? ' (disabled)' : ''}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {/* Top stat tiles */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatTile label="Workspaces" value={summary.totals.workspaces || workspaces.length} sublabel={`${summary.totals.activeWorkspaces || 0} active`} icon={Briefcase} />
          <StatTile label="Active Automations" value={summary.totals.activeAutomations} sublabel={`of ${summary.totals.automations} total`} icon={Zap} />
          <StatTile label="Triggers Fired" value={summary.totals.totalTriggers} sublabel={`${summary.runsLast7Days} this week`} icon={TrendingUp} />
          <StatTile label="DMs Sent" value={summary.totals.totalDMs} sublabel={summary.totals.followConvRate !== null ? `${summary.totals.followConvRate}% follow conv.` : ''} icon={Send} />
        </div>

        <Card>
          <CardContent className="p-6">
            <h2 className="text-lg font-semibold mb-4 flex items-center gap-2"><Briefcase className="w-4 h-4 text-slate-700" /> Workspace Breakdown</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {workspaceBreakdown.map(w => (
                <div key={w.id} className="rounded-lg border bg-slate-50 p-4">
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <p className="font-semibold">{w.name}</p>
                      <p className="text-xs text-muted-foreground">{w.accounts} account · {w.automations} automations</p>
                    </div>
                    <Badge className={w.status === 'active' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600'}>{w.status}</Badge>
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-sm">
                    <div><p className="text-xs text-muted-foreground">Active</p><p className="font-semibold">{w.activeAutomations}</p></div>
                    <div><p className="text-xs text-muted-foreground">Triggers</p><p className="font-semibold">{w.triggers}</p></div>
                    <div><p className="text-xs text-muted-foreground">DMs</p><p className="font-semibold">{w.dms}</p></div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Timeline chart */}
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold flex items-center gap-2"><TrendingUp className="w-4 h-4 text-slate-700" /> Last 7 days — Triggers fired</h2>
            </div>
            <div style={{ width: '100%', height: 240 }}>
              <ResponsiveContainer>
                <AreaChart data={timeline} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="grad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#0f172a" stopOpacity={0.6}/>
                      <stop offset="100%" stopColor="#0f172a" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="date" tickFormatter={(d) => d.slice(5)} stroke="#94a3b8" fontSize={12} />
                  <YAxis allowDecimals={false} stroke="#94a3b8" fontSize={12} />
                  <Tooltip />
                  <Area type="monotone" dataKey="count" stroke="#0f172a" strokeWidth={2} fill="url(#grad)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Funnel + Top Keywords */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card>
            <CardContent className="p-6">
              <h2 className="text-lg font-semibold mb-4 flex items-center gap-2"><Activity className="w-4 h-4 text-slate-700" /> Engagement Funnel</h2>
              <div className="space-y-3">
                {[
                  { label: 'Triggers matched', value: funnel.triggers, icon: Zap, color: 'bg-slate-500' },
                  { label: 'Public replies posted', value: funnel.replies, icon: MessageSquare, color: 'bg-sky-600' },
                  { label: 'Follow-prompts sent', value: funnel.followGated, icon: UserCheck, color: 'bg-amber-500' },
                  { label: 'Followed & verified', value: funnel.followConfirmed, icon: ShieldCheck, color: 'bg-emerald-500' },
                  { label: 'DMs delivered', value: funnel.dmsSent, icon: Send, color: 'bg-rose-500' },
                ].map((row) => {
                  const max = Math.max(funnel.triggers, 1);
                  const pct = (row.value / max) * 100;
                  return (
                    <div key={row.label}>
                      <div className="flex justify-between text-sm mb-1">
                        <span className="flex items-center gap-2"><row.icon className="w-3.5 h-3.5" /> {row.label}</span>
                        <span className="font-semibold">{row.value}</span>
                      </div>
                      <div className="w-full h-2 rounded-full bg-slate-100 overflow-hidden">
                        <div className={`h-full ${row.color}`} style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <h2 className="text-lg font-semibold mb-4 flex items-center gap-2"><Hash className="w-4 h-4 text-slate-700" /> Top Trigger Keywords</h2>
              {topKeywords.length === 0 ? (
                <p className="text-sm text-muted-foreground">No matches yet — fire some automations to see data here.</p>
              ) : (
                <div style={{ width: '100%', height: 240 }}>
                  <ResponsiveContainer>
                    <BarChart data={topKeywords} layout="vertical" margin={{ top: 0, right: 16, left: 16, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                      <XAxis type="number" allowDecimals={false} stroke="#94a3b8" fontSize={12} />
                      <YAxis type="category" dataKey="keyword" stroke="#94a3b8" fontSize={12} width={100} />
                      <Tooltip />
                      <Bar dataKey="count" fill="#0f172a" radius={[0, 4, 4, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Per Automation */}
        <Card>
          <CardContent className="p-6">
            <h2 className="text-lg font-semibold mb-4 flex items-center gap-2"><Zap className="w-4 h-4 text-amber-500" /> Per-Automation Performance</h2>
            {perAutomation.length === 0 ? (
              <p className="text-sm text-muted-foreground">No automations yet.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-xs text-muted-foreground border-b">
                    <tr>
                      <th className="text-left py-2">Workspace</th>
                      <th className="text-left py-2">Automation</th>
                      <th className="text-left">Keywords</th>
                      <th className="text-right">Triggers</th>
                      <th className="text-right">DMs</th>
                      <th className="text-right">Follow ✓</th>
                      <th className="text-right">Last fired</th>
                      <th className="text-center">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {perAutomation.map(a => (
                      <tr key={a.id} className="border-b hover:bg-slate-50">
                        <td className="py-3">
                          <Badge variant="outline" className="text-[10px]">{a.workspaceName || 'Workspace'}</Badge>
                        </td>
                        <td className="py-3 flex items-center gap-2">
                          {a.thumb && <img src={a.thumb} alt="" className="w-9 h-9 rounded-md object-cover" />}
                          <span className="font-medium truncate max-w-[160px]">{a.name}</span>
                        </td>
                        <td className="py-3">
                          <div className="flex flex-wrap gap-1">
                            {a.keywords.slice(0, 3).map(k => <Badge key={k} className="bg-slate-100 text-slate-700 text-[10px]">{k}</Badge>)}
                          </div>
                        </td>
                        <td className="py-3 text-right font-semibold">{a.triggers}</td>
                        <td className="py-3 text-right">{a.dms}</td>
                        <td className="py-3 text-right">{a.followConfirmed}</td>
                        <td className="py-3 text-right text-xs text-muted-foreground">
                          {a.lastRun ? new Date(a.lastRun).toLocaleString() : '—'}
                        </td>
                        <td className="py-3 text-center">
                          <Badge className={a.isActive ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600'}>
                            {a.isActive ? 'ON' : 'OFF'}
                          </Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Recent Matches */}
        <Card>
          <CardContent className="p-6">
            <h2 className="text-lg font-semibold mb-4 flex items-center gap-2"><Clock className="w-4 h-4 text-slate-700" /> Recent Matched Comments (50)</h2>
            {recentMatches.length === 0 ? (
              <p className="text-sm text-muted-foreground">No matches yet. Once a tester comments your trigger word, it'll show up here.</p>
            ) : (
              <div className="space-y-2 max-h-96 overflow-y-auto">
                {recentMatches.map(r => (
                  <div key={r.id} className="flex items-center justify-between p-3 rounded-lg bg-slate-50">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <Badge variant="outline" className="text-[10px]">{r.workspaceName || 'Workspace'}</Badge>
                        <span className="text-xs text-muted-foreground">{r.automationName}</span>
                        <FlowBadge flow={r.flow} />
                        {r.replyOk && <Badge className="bg-emerald-100 text-emerald-700 text-[10px]">Reply ✓</Badge>}
                        {r.dmOk && <Badge className="bg-slate-100 text-slate-700 text-[10px]">DM ✓</Badge>}
                      </div>
                      <p className="text-sm truncate">"{r.commentText}"</p>
                    </div>
                    <span className="text-xs text-muted-foreground ml-4 flex-shrink-0">
                      {new Date(r.ranAt).toLocaleString()}
                    </span>
                  </div>
                ))}
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
