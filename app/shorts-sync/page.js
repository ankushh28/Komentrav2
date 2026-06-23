'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { ArrowLeft, ExternalLink, Film, Instagram, RefreshCw, Trash2, Youtube } from 'lucide-react';
import { authFetch, isSessionExpiredError } from '@/lib/client-auth';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';

function scopedHeaders(token, workspaceId, extra = {}) {
  return {
    ...extra,
    Authorization: `Bearer ${token}`,
    ...(workspaceId ? { 'X-Workspace-Id': workspaceId } : {}),
  };
}

function timeLabel(value) {
  if (!value) return '';
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return '';
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

function statusBadgeClass(status) {
  if (status === 'uploaded') return 'border-emerald-200 bg-emerald-50 text-emerald-700';
  if (status === 'failed') return 'border-rose-200 bg-rose-50 text-rose-700';
  if (status === 'skipped') return 'border-amber-200 bg-amber-50 text-amber-700';
  if (status === 'processing' || status === 'queued' || status === 'queued_retry') return 'border-sky-200 bg-sky-50 text-sky-700';
  return 'border-slate-200 bg-slate-50 text-slate-600';
}

function statusLabel(status) {
  if (status === 'queued_retry') return 'Retry queued';
  return String(status || 'pending').replace(/_/g, ' ').replace(/^\w/, c => c.toUpperCase());
}

export default function ShortsSyncPage() {
  const router = useRouter();
  const [token, setToken] = useState('');
  const [workspaces, setWorkspaces] = useState([]);
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState('');
  const [state, setState] = useState(null);
  const [loading, setLoading] = useState(true);
  const [connectingYouTube, setConnectingYouTube] = useState(false);
  const [disconnectingYouTube, setDisconnectingYouTube] = useState(false);
  const [saving, setSaving] = useState(false);
  const [retryingRunId, setRetryingRunId] = useState('');

  useEffect(() => {
    const t = localStorage.getItem('token');
    const u = localStorage.getItem('user');
    if (!t || !u) { router.replace('/auth?mode=login'); return; }
    setToken(t);
  }, [router]);

  const loadWorkspaces = useCallback(async (preferredId = '') => {
    if (!token) return;
    try {
      const res = await authFetch(router, '/api/workspaces', { headers: { Authorization: `Bearer ${token}` } });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to load workspaces');
      const list = data.workspaces || [];
      setWorkspaces(list);
      const params = new URLSearchParams(window.location.search);
      const urlWorkspaceId = params.get('workspaceId') || '';
      const stored = localStorage.getItem('selectedWorkspaceId') || '';
      const nextId =
        [preferredId, urlWorkspaceId, selectedWorkspaceId, stored].find(id => id && list.some(w => w.id === id)) ||
        list.find(w => w.status === 'active')?.id ||
        list[0]?.id ||
        '';
      if (nextId) {
        setSelectedWorkspaceId(nextId);
        localStorage.setItem('selectedWorkspaceId', nextId);
      }
    } catch (e) {
      if (!isSessionExpiredError(e)) toast.error(e.message || 'Failed to load workspaces');
    }
  }, [token, selectedWorkspaceId, router]);

  const loadShortsSync = useCallback(async (workspaceIdOverride = '') => {
    const workspaceId = workspaceIdOverride || selectedWorkspaceId;
    if (!token || !workspaceId) return;
    setLoading(true);
    try {
      const res = await authFetch(router, '/api/shorts-sync', { headers: scopedHeaders(token, workspaceId) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to load Shorts Sync');
      setState(data);
    } catch (e) {
      if (!isSessionExpiredError(e)) toast.error(e.message || 'Failed to load Shorts Sync');
    } finally {
      setLoading(false);
    }
  }, [token, selectedWorkspaceId, router]);

  useEffect(() => { if (token) loadWorkspaces(); }, [token, loadWorkspaces]);
  useEffect(() => { if (token && selectedWorkspaceId) loadShortsSync(selectedWorkspaceId); }, [token, selectedWorkspaceId, loadShortsSync]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const workspaceId = params.get('workspaceId') || '';
    if (workspaceId) {
      setSelectedWorkspaceId(workspaceId);
      localStorage.setItem('selectedWorkspaceId', workspaceId);
    }
    if (params.get('yt') === 'success') {
      toast.success('YouTube channel connected');
      window.history.replaceState({}, '', workspaceId ? `/shorts-sync?workspaceId=${workspaceId}` : '/shorts-sync');
      loadShortsSync(workspaceId || selectedWorkspaceId);
    } else if (params.get('yt') === 'error') {
      toast.error('YouTube connection failed: ' + (params.get('msg') || 'unknown'));
      window.history.replaceState({}, '', workspaceId ? `/shorts-sync?workspaceId=${workspaceId}` : '/shorts-sync');
    }
  }, [loadShortsSync, selectedWorkspaceId]);

  const selectWorkspace = (id) => {
    setSelectedWorkspaceId(id);
    localStorage.setItem('selectedWorkspaceId', id);
    router.replace(`/shorts-sync?workspaceId=${id}`);
  };

  const connectYouTube = async () => {
    if (!selectedWorkspaceId) { toast.error('Choose a workspace first'); return; }
    setConnectingYouTube(true);
    try {
      const res = await authFetch(router, '/api/youtube/connect', { headers: scopedHeaders(token, selectedWorkspaceId) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Unable to connect YouTube');
      window.location.href = data.url;
    } catch (e) {
      if (!isSessionExpiredError(e)) toast.error(e.message || 'Unable to connect YouTube');
      setConnectingYouTube(false);
    }
  };

  const disconnectYouTube = async () => {
    if (!confirm('Disconnect this YouTube channel and turn off Shorts Sync?')) return;
    setDisconnectingYouTube(true);
    try {
      const res = await authFetch(router, '/api/youtube/channel', {
        method: 'DELETE',
        headers: scopedHeaders(token, selectedWorkspaceId),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Failed to disconnect YouTube');
      toast.success('YouTube disconnected');
      loadShortsSync(selectedWorkspaceId);
    } catch (e) {
      if (!isSessionExpiredError(e)) toast.error(e.message || 'Failed to disconnect YouTube');
    } finally {
      setDisconnectingYouTube(false);
    }
  };

  const toggleShortsSync = async (enabled) => {
    setSaving(true);
    try {
      const res = await authFetch(router, '/api/shorts-sync', {
        method: 'PUT',
        headers: scopedHeaders(token, selectedWorkspaceId, { 'Content-Type': 'application/json' }),
        body: JSON.stringify({ enabled, privacyStatus: 'private', notifySubscribers: false }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Failed to update Shorts Sync');
      setState(data);
      toast.success(enabled ? 'Shorts Sync enabled' : 'Shorts Sync disabled');
    } catch (e) {
      if (!isSessionExpiredError(e)) toast.error(e.message || 'Failed to update Shorts Sync');
    } finally {
      setSaving(false);
    }
  };

  const retryRun = async (runId) => {
    setRetryingRunId(runId);
    try {
      const res = await authFetch(router, `/api/shorts-sync/runs/${runId}/retry`, {
        method: 'POST',
        headers: scopedHeaders(token, selectedWorkspaceId),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Failed to queue retry');
      toast.success('Retry queued');
      loadShortsSync(selectedWorkspaceId);
    } catch (e) {
      if (!isSessionExpiredError(e)) toast.error(e.message || 'Failed to queue retry');
    } finally {
      setRetryingRunId('');
    }
  };

  if (!token) return null;

  const workspace = workspaces.find(w => w.id === selectedWorkspaceId);
  const workspaceActive = (workspace?.status || 'active') === 'active';
  const settings = state?.settings || {};
  const instagram = state?.instagramAccount || workspace?.account || null;
  const channel = state?.youtubeChannel || null;
  const runs = state?.runs || [];
  const canUse = !!state?.entitlement?.canUse;
  const enabled = !!settings.enabled;

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b bg-white/90 backdrop-blur">
        <div className="container mx-auto flex min-w-0 items-center justify-between gap-3 px-4 py-4">
          <div className="min-w-0">
            <Button asChild variant="ghost" size="sm" className="mb-2 -ml-2">
              <Link href="/dashboard"><ArrowLeft className="mr-2 h-4 w-4" /> Dashboard</Link>
            </Button>
            <h1 className="flex items-center gap-2 text-2xl font-bold text-slate-950"><Youtube className="h-6 w-6 text-red-600" /> Shorts Sync</h1>
            <p className="mt-1 text-sm text-muted-foreground">Publish new Instagram videos to YouTube Shorts from one workspace.</p>
          </div>
          <div className="w-56 shrink-0">
            <Select value={selectedWorkspaceId} onValueChange={selectWorkspace}>
              <SelectTrigger className="bg-white"><SelectValue placeholder="Workspace" /></SelectTrigger>
              <SelectContent>
                {workspaces.map(w => (
                  <SelectItem key={w.id} value={w.id}>{w.name}{w.status === 'disabled' ? ' (disabled)' : ''}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </header>

      <main className="container mx-auto max-w-6xl px-4 py-8">
        {loading ? (
          <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_380px]">
            <Skeleton className="h-72 w-full" />
            <Skeleton className="h-72 w-full" />
          </div>
        ) : (
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_420px]">
            <div className="space-y-6">
              <Card className="border border-slate-200 bg-white shadow-sm">
                <CardContent className="p-5">
                  <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <h2 className="text-lg font-bold text-slate-950">Connections</h2>
                      <p className="text-sm text-muted-foreground">Choose the Instagram workspace and YouTube channel that should sync.</p>
                    </div>
                    <Badge variant="outline" className={enabled ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-slate-200 bg-white text-slate-600'}>
                      {enabled ? 'Sync on' : 'Sync off'}
                    </Badge>
                  </div>

                  <div className="grid gap-3 md:grid-cols-2">
                    <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                      <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-slate-700">
                        <Instagram className="h-4 w-4" /> Instagram
                      </div>
                      <p className="truncate font-semibold text-slate-950">{instagram?.username ? `@${instagram.username}` : 'Not connected'}</p>
                      {!instagram && <p className="mt-1 text-xs text-muted-foreground">Connect Instagram from the dashboard first.</p>}
                    </div>
                    <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                      <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-slate-700">
                        <Youtube className="h-4 w-4" /> YouTube
                      </div>
                      <div className="flex items-center justify-between gap-3">
                        <p className="min-w-0 truncate font-semibold text-slate-950">{channel?.title || 'Not connected'}</p>
                        {channel ? (
                          <Button variant="ghost" size="icon" title="Disconnect YouTube" disabled={!workspaceActive || disconnectingYouTube} onClick={disconnectYouTube}>
                            <Trash2 className="h-4 w-4 text-rose-600" />
                          </Button>
                        ) : (
                          <Button size="sm" disabled={!workspaceActive || connectingYouTube} onClick={connectYouTube}>
                            {connectingYouTube && <RefreshCw className="mr-2 h-4 w-4 animate-spin" />}
                            Connect
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="border border-slate-200 bg-white shadow-sm">
                <CardContent className="p-5">
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <h2 className="text-lg font-bold text-slate-950">Auto-publish new videos</h2>
                      <p className="mt-1 text-sm text-muted-foreground">New square or vertical videos up to 3 minutes are uploaded to YouTube as private Shorts.</p>
                      {!canUse && <p className="mt-2 text-sm font-medium text-amber-700">Available on Creator, Growth, and Agency plans.</p>}
                      {settings.lastScanAt && (
                        <p className="mt-2 text-xs text-muted-foreground">
                          Last scan: {timeLabel(settings.lastScanAt)}{settings.lastScanMessage ? ` - ${settings.lastScanMessage}` : ''}
                        </p>
                      )}
                    </div>
                    <Switch
                      checked={enabled}
                      disabled={!workspaceActive || saving || !canUse || !instagram || !channel}
                      onCheckedChange={toggleShortsSync}
                      aria-label="Toggle Shorts Sync"
                    />
                  </div>
                </CardContent>
              </Card>

              <div className="rounded-lg border border-sky-100 bg-sky-50 p-4 text-sm text-sky-900">
                YouTube may keep API uploads private until the Google API project passes compliance review. Komentra uploads as private by default so creators can review before publishing.
              </div>
            </div>

            <Card className="border border-slate-200 bg-white shadow-sm">
              <CardContent className="p-0">
                <div className="flex items-center justify-between border-b px-4 py-3">
                  <p className="font-semibold text-slate-950">Recent activity</p>
                  <Film className="h-4 w-4 text-slate-500" />
                </div>
                {runs.length === 0 ? (
                  <div className="px-4 py-16 text-center text-sm text-muted-foreground">
                    New sync activity will appear here.
                  </div>
                ) : (
                  <div className="divide-y">
                    {runs.map(run => (
                      <div key={run.id} className="p-4">
                        <div className="mb-2 flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-semibold text-slate-950">{run.caption || run.instagramMediaId || 'Instagram video'}</p>
                            <p className="text-xs text-muted-foreground">{timeLabel(run.createdAt)}</p>
                          </div>
                          <Badge variant="outline" className={statusBadgeClass(run.status)}>{statusLabel(run.status)}</Badge>
                        </div>
                        {(run.message || run.failureReason) && <p className="text-xs text-muted-foreground">{run.failureReason || run.message}</p>}
                        <div className="mt-3 flex flex-wrap items-center gap-2">
                          {run.youtubeUrl && (
                            <Button asChild variant="outline" size="sm">
                              <a href={run.youtubeUrl} target="_blank" rel="noreferrer"><ExternalLink className="mr-2 h-3.5 w-3.5" /> YouTube</a>
                            </Button>
                          )}
                          {['failed', 'skipped'].includes(run.status) && (
                            <Button variant="outline" size="sm" disabled={retryingRunId === run.id} onClick={() => retryRun(run.id)}>
                              {retryingRunId === run.id && <RefreshCw className="mr-2 h-3.5 w-3.5 animate-spin" />}
                              Retry
                            </Button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        )}
      </main>
    </div>
  );
}
