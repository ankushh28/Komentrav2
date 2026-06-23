'use client';

import { useState, useEffect, useCallback } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { Skeleton } from '@/components/ui/skeleton';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import logoImage from '@/logo.png';
import { toast } from 'sonner';
import { authFetch, isSessionExpiredError } from '@/lib/client-auth';
import {
  Instagram, LogOut, Plus, Trash2, Zap, Send, Sparkles,
  CheckCircle2, ExternalLink, UserPlus, Link as LinkIcon,
  X, Hash, Shuffle, Wand2, ChevronRight, BarChart3, MessageCircle, Inbox,
  Pencil, Settings, Users, Menu, LifeBuoy, CreditCard, ChevronDown, Search,
  RefreshCw, ImageOff, Copy, AlertTriangle, Youtube, Film,
} from 'lucide-react';

function SectionHeader({ icon: Icon, step, title, subtitle }) {
  return (
    <div className="flex items-start gap-3 pt-2">
      <div className="w-8 h-8 rounded-lg bg-slate-950 text-white flex items-center justify-center text-sm font-bold flex-shrink-0">{step}</div>
      <div>
        <h3 className="font-semibold flex items-center gap-2"><Icon className="w-4 h-4 text-slate-700" />{title}</h3>
        {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
      </div>
    </div>
  );
}

function paddedVariants(values) {
  const clean = Array.isArray(values) ? values.filter(Boolean).slice(0, 3) : [];
  return [...clean, '', '', ''].slice(0, 3);
}

function keywordList(a) {
  return a?.keywords?.length ? a.keywords : (a?.triggerWord ? [a.triggerWord] : []);
}

function runLabel(count = 0) {
  return `${count} ${count === 1 ? 'run' : 'runs'}`;
}

function pauseTimeLabel(value) {
  if (!value) return 'the scheduled time';
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return 'the scheduled time';
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

function mediaPreviewSrc(media) {
  if (!media) return null;
  if (media.thumbnail_url) return media.thumbnail_url;
  if (media.media_type !== 'VIDEO' && media.media_url) return media.media_url;
  return null;
}

function MediaPreview({ src, alt = '', className = '' }) {
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
  }, [src]);

  if (!src || failed) {
    return (
      <div className={`${className} flex items-center justify-center bg-slate-100 text-slate-400`}>
        <ImageOff className="h-5 w-5" />
      </div>
    );
  }

  return <img src={src} alt={alt} className={className} loading="lazy" onError={() => setFailed(true)} />;
}

function PostPickerGrid({ media, selectedPost, onSelect }) {
  return (
    <div className="max-h-72 overflow-y-auto overscroll-contain rounded-lg border border-slate-200 bg-white p-2 pr-1">
      <div className="grid grid-cols-[repeat(auto-fill,minmax(88px,1fr))] gap-2 pr-1">
        {media.map((m) => (
          <button
            key={m.id}
            type="button"
            onClick={() => onSelect(m)}
            className={`relative block aspect-square w-full min-w-0 overflow-hidden rounded-lg border-2 transition ${selectedPost?.id === m.id ? 'border-slate-950 ring-2 ring-slate-300' : 'border-transparent hover:border-slate-300'}`}
          >
            <MediaPreview src={mediaPreviewSrc(m)} className="h-full w-full object-cover" />
            {selectedPost?.id === m.id && (
              <div className="absolute inset-0 flex items-center justify-center bg-slate-500/40">
                <CheckCircle2 className="h-7 w-7 text-white" />
              </div>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}

function triggerLabel(a) {
  return a?.type === 'dm_reply' ? 'When user sends DM' : 'When user comments';
}

function matchLabel(matchType) {
  if (matchType === 'exact') return 'exactly';
  if (matchType === 'starts_with') return 'starts with';
  return 'contains';
}

function cloneAutomationName(automation, automations) {
  const keywords = keywordList(automation);
  const base = automation?.name || keywords[0] || 'Automation';
  const names = new Set(automations.map(a => a.name).filter(Boolean));
  let candidate = `${base} (Copy)`;
  let n = 2;
  while (names.has(candidate)) {
    candidate = `${base} (Copy ${n})`;
    n += 1;
  }
  return candidate;
}

function cloneAutomationDraft(automation, automations) {
  return {
    ...automation,
    name: cloneAutomationName(automation, automations),
  };
}

function scopedHeaders(token, workspaceId, extra = {}) {
  return {
    ...extra,
    Authorization: `Bearer ${token}`,
    ...(workspaceId ? { 'X-Workspace-Id': workspaceId } : {}),
  };
}

function AutomationTypeDialog({ open, onOpenChange, onSelect }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>New Automation</DialogTitle>
          <DialogDescription>Choose how Komentra should respond.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 py-2">
          <button
            type="button"
            onClick={() => onSelect('comment_dm')}
            className="flex items-center gap-4 rounded-xl border p-4 text-left transition hover:border-slate-300 hover:bg-slate-50"
          >
            <div className="w-11 h-11 rounded-xl bg-slate-100 flex items-center justify-center">
              <MessageCircle className="w-5 h-5 text-slate-700" />
            </div>
            <div className="flex-1">
              <p className="font-semibold text-base">Comment to DM</p>
              <p className="text-sm text-muted-foreground">Reply when someone comments on a post.</p>
            </div>
            <ChevronRight className="w-4 h-4 text-muted-foreground" />
          </button>
          <button
            type="button"
            onClick={() => onSelect('dm_reply')}
            className="flex items-center gap-4 rounded-xl border p-4 text-left transition hover:border-sky-300 hover:bg-slate-50"
          >
            <div className="w-11 h-11 rounded-xl bg-sky-100 flex items-center justify-center">
              <Inbox className="w-5 h-5 text-sky-700" />
            </div>
            <div className="flex-1">
              <p className="font-semibold text-base">DM Auto-Reply</p>
              <p className="text-sm text-muted-foreground">Reply when someone sends a keyword in DM.</p>
            </div>
            <ChevronRight className="w-4 h-4 text-muted-foreground" />
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function CreateAutomationDialog({ open, onOpenChange, accounts, token, workspaceId, onCreated, onBillingBlocked, cloneSource = null }) {
  const router = useRouter();
  const [selectedAccount, setSelectedAccount] = useState('');
  const [media, setMedia] = useState([]);
  const [loadingMedia, setLoadingMedia] = useState(false);
  const [selectedPost, setSelectedPost] = useState(null);
  const [name, setName] = useState('');
  const [keywords, setKeywords] = useState([]);
  const [kwInput, setKwInput] = useState('');
  const [matchType, setMatchType] = useState('contains');
  const [replies, setReplies] = useState(['', '', '']);
  const [dmText, setDmText] = useState('');
  const [buttons, setButtons] = useState([{ title: '', url: '' }]);
  const [askToFollow, setAskToFollow] = useState(false);
  const [followMessage, setFollowMessage] = useState('');
  const [followButtonText, setFollowButtonText] = useState('I Followed');
  const [respondToPostShares, setRespondToPostShares] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) {
      setSelectedAccount(''); setMedia([]); setSelectedPost(null); setName('');
      setKeywords([]); setKwInput(''); setMatchType('contains');
      setReplies(['', '', '']); setDmText(''); setButtons([{ title: '', url: '' }]);
      setAskToFollow(false); setFollowMessage(''); setFollowButtonText('I Followed');
      setRespondToPostShares(false);
    }
  }, [open]);

  useEffect(() => {
    if (!open || !cloneSource) return;
    setSelectedAccount(cloneSource.instagramAccountId || '');
    setSelectedPost({
      id: cloneSource.postId,
      permalink: cloneSource.postPermalink,
      thumbnail_url: cloneSource.postThumbnail,
      media_url: cloneSource.postThumbnail,
    });
    setName(cloneSource.name || '');
    setKeywords(keywordList(cloneSource));
    setKwInput('');
    setMatchType(cloneSource.matchType || 'contains');
    setReplies(paddedVariants(cloneSource.replyMessages || (cloneSource.replyMessage ? [cloneSource.replyMessage] : [])));
    setDmText(cloneSource.dmText || cloneSource.dmMessage || '');
    setButtons(cloneSource.dmButtons?.length ? cloneSource.dmButtons : [{ title: '', url: '' }]);
    setAskToFollow(!!cloneSource.askToFollow);
    setFollowMessage(cloneSource.followMessage || '');
    setFollowButtonText(cloneSource.followButtonText || 'I Followed');
    setRespondToPostShares(!!cloneSource.respondToPostShares);
  }, [open, cloneSource]);

  useEffect(() => {
    if (selectedAccount) {
      setLoadingMedia(true);
      authFetch(router, `/api/instagram/media?accountId=${selectedAccount}`, { headers: scopedHeaders(token, workspaceId) })
        .then(r => r.json()).then(d => setMedia(d.media || []))
        .catch((e) => { if (!isSessionExpiredError(e)) toast.error('Failed to load posts'); })
        .finally(() => setLoadingMedia(false));
    }
  }, [selectedAccount, token, workspaceId, router]);

  const addKeyword = () => {
    const k = kwInput.trim().toLowerCase();
    if (k && !keywords.includes(k)) setKeywords([...keywords, k]);
    setKwInput('');
  };

  const validReplies = replies.filter(r => r.trim()).slice(0, 3);
  const validButtons = buttons.filter(b => b.title.trim() && b.url.trim()).slice(0, 3);
  const cloneNeedsPostChange = !!cloneSource && selectedPost?.id === cloneSource.postId;
  const canCreate = selectedAccount && selectedPost && !cloneNeedsPostChange && keywords.length > 0 && validReplies.length > 0 && dmText.trim();

  const create = async () => {
    if (!canCreate) { toast.error('Fill in the required steps first'); return; }
    setSaving(true);
    try {
      const acct = accounts.find(a => a.id === selectedAccount);
      const res = await authFetch(router, '/api/automations', {
        method: 'POST',
        headers: scopedHeaders(token, workspaceId, { 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          instagramAccountId: selectedAccount,
          postId: selectedPost.id, postPermalink: selectedPost.permalink,
          postThumbnail: mediaPreviewSrc(selectedPost),
          name: name.trim() || keywords[0],
          keywords, matchType, replyMessages: validReplies,
          dmText: dmText.trim(), dmButtons: validButtons,
          askToFollow,
          respondToPostShares,
          followMessage: askToFollow ? (followMessage.trim() || `Follow @${acct?.username || ''} first to unlock this!`) : null,
          followButtonText: askToFollow ? (followButtonText.trim() || 'I Followed') : null,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (data.billing) onBillingBlocked?.(data);
        const error = new Error(data.error || 'Failed');
        error.billing = !!data.billing;
        throw error;
      }
      toast.success(cloneSource ? 'Automation cloned' : 'Automation created! 🚀');
      onCreated(data.automation);
      onOpenChange(false);
    } catch (e) { if (!e.billing && !isSessionExpiredError(e)) toast.error(e.message); }
    finally { setSaving(false); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[calc(100vw-1rem)] max-w-3xl max-h-[92vh] overflow-y-auto p-0">
        <DialogHeader className="px-4 pt-5 pb-3 border-b sticky top-0 bg-white z-10 sm:px-6 sm:pt-6">
          <DialogTitle className="flex items-center gap-2 text-xl sm:text-2xl">
            <div className="w-9 h-9 rounded-lg bg-slate-950 flex shrink-0 items-center justify-center"><Wand2 className="w-5 h-5 text-white" /></div>
            {cloneSource ? 'Clone Automation' : 'New Automation'}
          </DialogTitle>
          <DialogDescription>
            {cloneSource ? 'Review the copied settings, choose a different post, then create the new automation.' : 'Configure how Komentra reacts when someone comments on your post.'}
          </DialogDescription>
        </DialogHeader>

        <div className="px-4 py-4 space-y-6 sm:px-6 sm:space-y-8">
          {/* Step 1 */}
          <div className="space-y-3">
            <SectionHeader icon={Instagram} step="1" title="Instagram Account" subtitle="Pick the account this automation runs on." />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:ml-11">
              {accounts.map((a) => (
                <button key={a.id} onClick={() => { setSelectedAccount(a.id); setSelectedPost(null); setRespondToPostShares(false); }}
                  className={`p-3 rounded-xl border-2 text-left transition ${selectedAccount === a.id ? 'border-slate-950 bg-slate-50 shadow-sm' : 'border-border hover:border-slate-300'}`}>
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-full bg-slate-950 flex items-center justify-center"><Instagram className="w-4 h-4 text-white" /></div>
                    <span className="font-medium">@{a.username}</span>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Step 2 */}
          {selectedAccount && (
            <div className="space-y-3">
              <SectionHeader icon={Hash} step="2" title="Select Post" subtitle="Choose the post to monitor for comments." />
              <div className="sm:ml-11">
                {loadingMedia ? <p className="text-sm text-muted-foreground">Loading posts...</p>
                : media.length === 0 ? <p className="text-sm text-muted-foreground">No posts found.</p>
                : (
                  <PostPickerGrid
                    media={media}
                    selectedPost={selectedPost}
                    onSelect={(post) => { setSelectedPost(post); if (!post?.permalink) setRespondToPostShares(false); }}
                  />
                )}
                {cloneNeedsPostChange && (
                  <div className="mt-3 flex gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                    <p>This clone is copied from an automation on this post. Choose a different post before creating it.</p>
                  </div>
                )}
                <div className="mt-3 rounded-xl border bg-slate-50 p-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="font-medium text-sm">Reply when this post is shared in DM</p>
                      <p className="text-xs text-muted-foreground">Send the configured DM to the sender without posting a public comment reply.</p>
                    </div>
                    <Switch
                      checked={respondToPostShares}
                      disabled={!selectedPost?.permalink}
                      onCheckedChange={setRespondToPostShares}
                    />
                  </div>
                  {!selectedPost?.permalink && (
                    <p className="mt-2 text-xs text-amber-700">Instagram did not provide a permalink for this post, so shared-post matching is unavailable.</p>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Step 3 */}
          {selectedPost && (
            <div className="space-y-3">
              <SectionHeader icon={Sparkles} step="3" title="When user comments" subtitle="Keywords Komentra listens for on this post." />
              <div className="space-y-3 sm:ml-11">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                  <Input value={kwInput} onChange={(e) => setKwInput(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addKeyword(); } }}
                    placeholder='e.g. "price"  →  press Enter' className="flex-1" />
                  <Button type="button" onClick={addKeyword} variant="secondary">Add</Button>
                </div>
                {keywords.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {keywords.map((k) => (
                      <Badge key={k} className="bg-slate-100 text-slate-700 hover:bg-slate-200 pl-3 pr-1 py-1 text-sm">
                        {k}
                        <button onClick={() => setKeywords(keywords.filter(x => x !== k))} className="ml-1 hover:bg-slate-300 rounded-full p-0.5"><X className="w-3 h-3" /></button>
                      </Badge>
                    ))}
                  </div>
                )}
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
                  <Label className="text-sm">Comment match:</Label>
                  <Select value={matchType} onValueChange={setMatchType}>
                    <SelectTrigger className="w-full sm:w-56"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="contains">Contains keyword (recommended)</SelectItem>
                      <SelectItem value="exact">Exact match</SelectItem>
                      <SelectItem value="starts_with">Starts with keyword</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
          )}

          {/* Step 4 */}
          {selectedPost && (
            <div className="space-y-3">
              <SectionHeader icon={Shuffle} step="4" title="Public Reply Variants" subtitle="Add up to 3. We'll pick one at random for each match." />
              <div className="space-y-2 sm:ml-11">
                {replies.map((r, i) => (
                  <div key={i} className="flex items-start gap-2">
                    <span className="text-xs font-mono text-muted-foreground pt-3">#{i + 1}</span>
                    <Textarea value={r} onChange={(e) => { const n = [...replies]; n[i] = e.target.value; setReplies(n); }}
                      placeholder={i === 0 ? 'Sent you a DM 💌' : i === 1 ? 'Check your inbox 📥' : 'DM\'d you the details!'}
                      rows={1} className="flex-1 resize-none" />
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Step 5 */}
          {selectedPost && (
            <div className="space-y-3">
              <SectionHeader icon={UserPlus} step="5" title="Ask To Follow First" subtitle="Send a follow-prompt with verification before the main DM." />
              <div className="rounded-xl border bg-slate-50 p-4 space-y-3 sm:ml-11">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="font-medium text-sm">Require user to follow first</p>
                    <p className="text-xs text-muted-foreground">We verify the follow via Instagram API before sending main DM.</p>
                  </div>
                  <Switch checked={askToFollow} onCheckedChange={setAskToFollow} />
                </div>
                {askToFollow && (
                  <div className="space-y-3">
                    <div>
                      <Label className="text-xs">Follow-prompt message</Label>
                      <Textarea value={followMessage} onChange={(e) => setFollowMessage(e.target.value)}
                        placeholder="Hey 👋  Follow us first to unlock the link!" rows={2} className="mt-1" />
                    </div>
                    <div>
                      <Label className="text-xs">Confirmation button text</Label>
                      <Input value={followButtonText} onChange={(e) => setFollowButtonText(e.target.value)}
                        placeholder="I Followed" className="mt-1" maxLength={20} />
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Step 6 */}
          {selectedPost && (
            <div className="space-y-3">
              <SectionHeader icon={Send} step="6" title="Direct Message" subtitle="DM text + up to 3 link buttons." />
              <div className="space-y-3 sm:ml-11">
                <Textarea value={dmText} onChange={(e) => setDmText(e.target.value)} placeholder="Hey! Here's everything you need 👇" rows={3} />
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs flex items-center gap-1"><LinkIcon className="w-3 h-3" /> Link buttons (max 3)</Label>
                    {buttons.length < 3 && <Button type="button" size="sm" variant="ghost" onClick={() => setButtons([...buttons, { title: '', url: '' }])} className="text-slate-700 h-7"><Plus className="w-3 h-3 mr-1" /> Add link</Button>}
                  </div>
                  {buttons.map((b, i) => (
                    <div key={i} className="grid gap-2 rounded-lg border p-2 bg-white sm:grid-cols-[1fr_1.5fr_auto] sm:items-center">
                      <Input value={b.title} onChange={(e) => { const n = [...buttons]; n[i] = { ...n[i], title: e.target.value }; setButtons(n); }} placeholder="Button text" className="min-w-0" />
                      <Input value={b.url} onChange={(e) => { const n = [...buttons]; n[i] = { ...n[i], url: e.target.value }; setButtons(n); }} placeholder="https://..." className="min-w-0" />
                      <Button type="button" size="icon" variant="ghost" onClick={() => setButtons(buttons.filter((_, idx) => idx !== i))} className="justify-self-end"><X className="w-4 h-4 text-rose-500" /></Button>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Step 7 */}
          {selectedPost && (
            <div className="space-y-3">
              <SectionHeader icon={Zap} step="7" title="Name (optional)" subtitle="Just for your own reference." />
              <div className="sm:ml-11"><Input value={name} onChange={(e) => setName(e.target.value)} placeholder={keywords[0] || 'My automation'} /></div>
            </div>
          )}
        </div>

        <DialogFooter className="px-4 py-4 border-t bg-slate-50 sticky bottom-0 sm:px-6">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={create} disabled={saving || !canCreate} className="bg-slate-950 hover:bg-slate-800">
            {saving ? 'Creating...' : <>{cloneSource ? 'Create Clone' : 'Create Automation'} <ChevronRight className="w-4 h-4 ml-1" /></>}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CreateDmReplyDialog({ open, onOpenChange, accounts, token, workspaceId, onCreated, onBillingBlocked, cloneSource = null }) {
  const router = useRouter();
  const [selectedAccount, setSelectedAccount] = useState('');
  const [name, setName] = useState('');
  const [keywords, setKeywords] = useState([]);
  const [kwInput, setKwInput] = useState('');
  const [matchType, setMatchType] = useState('contains');
  const [replies, setReplies] = useState(['', '', '']);
  const [buttons, setButtons] = useState([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) {
      setSelectedAccount(''); setName(''); setKeywords([]); setKwInput('');
      setMatchType('contains'); setReplies(['', '', '']); setButtons([]);
    }
  }, [open]);

  useEffect(() => {
    if (!open || !cloneSource) return;
    setSelectedAccount(cloneSource.instagramAccountId || '');
    setName(cloneSource.name || '');
    setKeywords(keywordList(cloneSource));
    setKwInput('');
    setMatchType(cloneSource.matchType || 'contains');
    setReplies(paddedVariants(cloneSource.replyMessages || (cloneSource.replyMessage ? [cloneSource.replyMessage] : [])));
    setButtons(cloneSource.replyButtons || []);
  }, [open, cloneSource]);

  const addKeyword = () => {
    const k = kwInput.trim().toLowerCase();
    if (k && !keywords.includes(k)) setKeywords([...keywords, k]);
    setKwInput('');
  };

  const validReplies = replies.filter(r => r.trim()).slice(0, 3);
  const validButtons = buttons.filter(b => b.title?.trim() && b.url?.trim()).slice(0, 3);
  const canCreate = selectedAccount && keywords.length > 0 && validReplies.length > 0;

  const create = async () => {
    if (!canCreate) { toast.error('Fill in the required steps first'); return; }
    setSaving(true);
    try {
      const res = await authFetch(router, '/api/automations', {
        method: 'POST',
        headers: scopedHeaders(token, workspaceId, { 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          type: 'dm_reply',
          instagramAccountId: selectedAccount,
          name: name.trim() || keywords[0],
          keywords, matchType,
          replyMessages: validReplies,
          replyButtons: validButtons,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (data.billing) onBillingBlocked?.(data);
        const error = new Error(data.error || 'Failed');
        error.billing = !!data.billing;
        throw error;
      }
      toast.success(cloneSource ? 'DM auto-reply cloned' : 'DM auto-reply created! 🚀');
      onCreated(data.automation);
      onOpenChange(false);
    } catch (e) { if (!e.billing && !isSessionExpiredError(e)) toast.error(e.message); } finally { setSaving(false); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[calc(100vw-1rem)] max-w-2xl max-h-[92vh] overflow-y-auto p-0">
        <DialogHeader className="px-4 pt-5 pb-3 border-b sticky top-0 bg-white z-10 sm:px-6 sm:pt-6">
          <DialogTitle className="flex items-center gap-2 text-xl sm:text-2xl">
            <div className="w-9 h-9 rounded-lg bg-slate-950 flex shrink-0 items-center justify-center"><Inbox className="w-5 h-5 text-white" /></div>
            {cloneSource ? 'Clone DM Auto-Reply' : 'DM Auto-Reply'}
          </DialogTitle>
          <DialogDescription>
            {cloneSource ? 'Review the copied DM reply settings, then create the new automation.' : 'Auto-reply when someone DMs you a specific keyword.'}
          </DialogDescription>
        </DialogHeader>

        <div className="px-4 py-4 space-y-6 sm:px-6 sm:space-y-8">
          <div className="space-y-3">
            <SectionHeader icon={Instagram} step="1" title="Instagram Account" />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:ml-11">
              {accounts.map((a) => (
                <button key={a.id} onClick={() => setSelectedAccount(a.id)}
                  className={`p-3 rounded-xl border-2 text-left transition ${selectedAccount === a.id ? 'border-slate-950 bg-slate-50 shadow-sm' : 'border-border hover:border-slate-300'}`}>
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-full bg-slate-950 flex items-center justify-center"><Instagram className="w-4 h-4 text-white" /></div>
                    <span className="font-medium">@{a.username}</span>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {selectedAccount && (
            <div className="space-y-3">
              <SectionHeader icon={Sparkles} step="2" title="When user sends DM" subtitle="Keywords Komentra listens for in direct messages." />
              <div className="space-y-3 sm:ml-11">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                  <Input value={kwInput} onChange={(e) => setKwInput(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addKeyword(); } }}
                    placeholder='e.g. "info"  →  press Enter' className="flex-1" />
                  <Button type="button" onClick={addKeyword} variant="secondary">Add</Button>
                </div>
                {keywords.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {keywords.map((k) => (
                      <Badge key={k} className="bg-slate-100 text-slate-700 hover:bg-slate-200 pl-3 pr-1 py-1 text-sm">
                        {k}
                        <button onClick={() => setKeywords(keywords.filter(x => x !== k))} className="ml-1 hover:bg-slate-300 rounded-full p-0.5"><X className="w-3 h-3" /></button>
                      </Badge>
                    ))}
                  </div>
                )}
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
                  <Label className="text-sm">Match:</Label>
                  <Select value={matchType} onValueChange={setMatchType}>
                    <SelectTrigger className="w-full sm:w-56"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="contains">Contains keyword</SelectItem>
                      <SelectItem value="exact">Exact match</SelectItem>
                      <SelectItem value="starts_with">Starts with keyword</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
          )}

          {selectedAccount && (
            <div className="space-y-3">
              <SectionHeader icon={Shuffle} step="3" title="Reply Variants" subtitle="Up to 3. Random selection for natural variety." />
              <div className="space-y-2 sm:ml-11">
                {replies.map((r, i) => (
                  <div key={i} className="flex items-start gap-2">
                    <span className="text-xs font-mono text-muted-foreground pt-3">#{i + 1}</span>
                    <Textarea value={r} onChange={(e) => { const n = [...replies]; n[i] = e.target.value; setReplies(n); }}
                      placeholder={i === 0 ? 'Hey! Here\'s the info you asked for 👇' : 'Thanks for reaching out!'}
                      rows={2} className="flex-1 resize-none" />
                  </div>
                ))}
              </div>
            </div>
          )}

          {selectedAccount && (
            <div className="space-y-3">
              <SectionHeader icon={LinkIcon} step="4" title="Link Buttons (optional)" subtitle="Add up to 3 link buttons to the reply." />
              <div className="space-y-2 sm:ml-11">
                {buttons.map((b, i) => (
                  <div key={i} className="grid gap-2 rounded-lg border p-2 bg-white sm:grid-cols-[1fr_1.5fr_auto] sm:items-center">
                    <Input value={b.title || ''} onChange={(e) => { const n = [...buttons]; n[i] = { ...n[i], title: e.target.value }; setButtons(n); }} placeholder="Button text" className="min-w-0" />
                    <Input value={b.url || ''} onChange={(e) => { const n = [...buttons]; n[i] = { ...n[i], url: e.target.value }; setButtons(n); }} placeholder="https://..." className="min-w-0" />
                    <Button type="button" size="icon" variant="ghost" onClick={() => setButtons(buttons.filter((_, idx) => idx !== i))} className="justify-self-end"><X className="w-4 h-4 text-rose-500" /></Button>
                  </div>
                ))}
                {buttons.length < 3 && (
                  <Button type="button" size="sm" variant="ghost" onClick={() => setButtons([...buttons, { title: '', url: '' }])} className="text-slate-700">
                    <Plus className="w-3 h-3 mr-1" /> Add link
                  </Button>
                )}
              </div>
            </div>
          )}

          {selectedAccount && (
            <div className="space-y-3">
              <SectionHeader icon={Zap} step="5" title="Name (optional)" />
              <div className="sm:ml-11"><Input value={name} onChange={(e) => setName(e.target.value)} placeholder={keywords[0] || 'My DM auto-reply'} /></div>
            </div>
          )}
        </div>

        <DialogFooter className="px-4 py-4 border-t bg-slate-50 sticky bottom-0 sm:px-6">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={create} disabled={saving || !canCreate} className="bg-slate-950 hover:bg-slate-800">
            {saving ? 'Creating...' : <>{cloneSource ? 'Create Clone' : 'Create DM Reply'} <ChevronRight className="w-4 h-4 ml-1" /></>}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EditAutomationDialog({ automation, accounts, token, workspaceId, onOpenChange, onSaved, onBillingBlocked }) {
  const router = useRouter();
  const open = !!automation;
  const isDmReply = automation?.type === 'dm_reply';
  const [selectedAccount, setSelectedAccount] = useState('');
  const [media, setMedia] = useState([]);
  const [loadingMedia, setLoadingMedia] = useState(false);
  const [selectedPost, setSelectedPost] = useState(null);
  const [name, setName] = useState('');
  const [keywords, setKeywords] = useState([]);
  const [kwInput, setKwInput] = useState('');
  const [matchType, setMatchType] = useState('contains');
  const [replies, setReplies] = useState(['', '', '']);
  const [dmText, setDmText] = useState('');
  const [buttons, setButtons] = useState([]);
  const [askToFollow, setAskToFollow] = useState(false);
  const [followMessage, setFollowMessage] = useState('');
  const [followButtonText, setFollowButtonText] = useState('I Followed');
  const [respondToPostShares, setRespondToPostShares] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!automation) return;
    const currentPost = automation.type === 'dm_reply' ? null : {
      id: automation.postId,
      permalink: automation.postPermalink,
      thumbnail_url: automation.postThumbnail,
      media_url: automation.postThumbnail,
    };
    setSelectedAccount(automation.instagramAccountId || '');
    setSelectedPost(currentPost);
    setName(automation.name || '');
    setKeywords(keywordList(automation));
    setKwInput('');
    setMatchType(automation.matchType || 'contains');
    setReplies(paddedVariants(automation.replyMessages || (automation.replyMessage ? [automation.replyMessage] : [])));
    setDmText(automation.dmText || automation.dmMessage || '');
    setButtons(automation.type === 'dm_reply' ? (automation.replyButtons || []) : (automation.dmButtons || []));
    setAskToFollow(!!automation.askToFollow);
    setFollowMessage(automation.followMessage || '');
    setFollowButtonText(automation.followButtonText || 'I Followed');
    setRespondToPostShares(!!automation.respondToPostShares);
  }, [automation]);

  useEffect(() => {
    if (!open || !selectedAccount || isDmReply) return;
    setLoadingMedia(true);
    authFetch(router, `/api/instagram/media?accountId=${selectedAccount}`, { headers: scopedHeaders(token, workspaceId) })
      .then(r => r.json())
      .then(d => setMedia(d.media || []))
      .catch((e) => { if (!isSessionExpiredError(e)) toast.error('Failed to load posts'); })
      .finally(() => setLoadingMedia(false));
  }, [open, selectedAccount, isDmReply, token, workspaceId, router]);

  const addKeyword = () => {
    const k = kwInput.trim().toLowerCase();
    if (k && !keywords.includes(k)) setKeywords([...keywords, k]);
    setKwInput('');
  };

  const validReplies = replies.filter(r => r.trim()).slice(0, 3);
  const validButtons = buttons.filter(b => b.title?.trim() && b.url?.trim()).slice(0, 3);
  const canSave = selectedAccount && keywords.length > 0 && validReplies.length > 0 && (isDmReply || (selectedPost && dmText.trim()));

  const save = async () => {
    if (!automation || !canSave) {
      toast.error('Fill in the required fields first');
      return;
    }
    setSaving(true);
    try {
      const payload = {
        instagramAccountId: selectedAccount,
        name: name.trim() || keywords[0],
        keywords,
        matchType,
        replyMessages: validReplies,
      };
      if (isDmReply) {
        payload.replyButtons = validButtons;
      } else {
        payload.postId = selectedPost.id;
        payload.postPermalink = selectedPost.permalink || null;
        payload.postThumbnail = mediaPreviewSrc(selectedPost);
        payload.dmText = dmText.trim();
        payload.dmButtons = validButtons;
        payload.askToFollow = askToFollow;
        payload.respondToPostShares = respondToPostShares;
        payload.followMessage = askToFollow ? followMessage.trim() : null;
        payload.followButtonText = askToFollow ? (followButtonText.trim() || 'I Followed') : null;
      }

      const res = await authFetch(router, `/api/automations/${automation._id}`, {
        method: 'PUT',
        headers: scopedHeaders(token, workspaceId, { 'Content-Type': 'application/json' }),
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        if (data.billing) onBillingBlocked?.(data);
        const error = new Error(data.error || 'Failed to update automation');
        error.billing = !!data.billing;
        throw error;
      }
      toast.success('Automation updated');
      onSaved(data.automation);
      onOpenChange(false);
    } catch (e) {
      if (!e.billing && !isSessionExpiredError(e)) toast.error(e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) onOpenChange(false); }}>
      <DialogContent className="w-[calc(100vw-1rem)] max-w-3xl max-h-[92vh] overflow-y-auto p-0">
        <DialogHeader className="px-4 pt-5 pb-3 border-b sticky top-0 bg-white z-10 sm:px-6 sm:pt-6">
          <DialogTitle className="flex items-center gap-2 text-xl sm:text-2xl">
            <div className="w-9 h-9 rounded-lg flex shrink-0 items-center justify-center bg-slate-950">
              {isDmReply ? <Inbox className="w-5 h-5 text-white" /> : <MessageCircle className="w-5 h-5 text-white" />}
            </div>
            Edit Automation
          </DialogTitle>
          <DialogDescription>{isDmReply ? 'Update the DM keyword reply settings.' : 'Update the comment automation settings.'}</DialogDescription>
        </DialogHeader>

        <div className="px-4 py-4 space-y-6 sm:px-6 sm:space-y-7">
          <div className="space-y-3">
            <SectionHeader icon={Instagram} step="1" title="Instagram Account" />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:ml-11">
              {accounts.map((a) => (
                <button key={a.id} onClick={() => {
                  setSelectedAccount(a.id);
                  if (!isDmReply) {
                    setSelectedPost(null);
                    setRespondToPostShares(false);
                  }
                }}
                  className={`p-3 rounded-xl border-2 text-left transition ${selectedAccount === a.id ? 'border-slate-950 bg-slate-50 shadow-sm' : 'border-border hover:border-slate-300'}`}>
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-full bg-slate-950 flex items-center justify-center"><Instagram className="w-4 h-4 text-white" /></div>
                    <span className="font-medium">@{a.username}</span>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {!isDmReply && selectedAccount && (
            <div className="space-y-3">
              <SectionHeader icon={Hash} step="2" title="Post" subtitle="Choose the post this automation watches." />
              <div className="sm:ml-11">
                {loadingMedia ? <p className="text-sm text-muted-foreground">Loading posts...</p>
                : media.length === 0 ? <p className="text-sm text-muted-foreground">No posts found.</p>
                : (
                  <PostPickerGrid
                    media={media}
                    selectedPost={selectedPost}
                    onSelect={(post) => { setSelectedPost(post); if (!post?.permalink) setRespondToPostShares(false); }}
                  />
                )}
              </div>
            </div>
          )}

          {!isDmReply && selectedPost && (
            <div className="space-y-3">
              <SectionHeader icon={Send} step="2A" title="Shared Post DM" subtitle="Optionally respond when this exact post is sent to your inbox." />
              <div className="rounded-xl border bg-slate-50 p-4 sm:ml-11">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="font-medium text-sm">Reply when this post is shared in DM</p>
                    <p className="text-xs text-muted-foreground">Uses the configured DM and does not publish a comment reply.</p>
                  </div>
                  <Switch
                    checked={respondToPostShares}
                    disabled={!selectedPost?.permalink}
                    onCheckedChange={setRespondToPostShares}
                  />
                </div>
                {!selectedPost?.permalink && (
                  <p className="mt-2 text-xs text-amber-700">A valid Instagram permalink is required to enable this trigger.</p>
                )}
              </div>
            </div>
          )}

          <div className="space-y-3">
            <SectionHeader icon={Sparkles} step={isDmReply ? '2' : '3'} title={isDmReply ? 'When user sends DM' : 'When user comments'} subtitle="Add the keywords that should trigger this automation." />
            <div className="space-y-3 sm:ml-11">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <Input value={kwInput} onChange={(e) => setKwInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addKeyword(); } }}
                  placeholder='e.g. "price"' className="flex-1" />
                <Button type="button" onClick={addKeyword} variant="secondary">Add</Button>
              </div>
              {keywords.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {keywords.map((k) => (
                    <Badge key={k} className="bg-slate-100 text-slate-700 hover:bg-slate-200 pl-3 pr-1 py-1 text-sm">
                      {k}
                      <button onClick={() => setKeywords(keywords.filter(x => x !== k))} className="ml-1 hover:bg-slate-300 rounded-full p-0.5"><X className="w-3 h-3" /></button>
                    </Badge>
                  ))}
                </div>
              )}
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
                <Label className="text-sm">Keyword match:</Label>
                <Select value={matchType} onValueChange={setMatchType}>
                  <SelectTrigger className="w-full sm:w-56"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="contains">Contains keyword</SelectItem>
                    <SelectItem value="exact">Exact match</SelectItem>
                    <SelectItem value="starts_with">Starts with keyword</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          <div className="space-y-3">
            <SectionHeader icon={Shuffle} step={isDmReply ? '3' : '4'} title={isDmReply ? 'DM Reply' : 'Public Reply'} subtitle="Add up to 3 reply variants." />
            <div className="space-y-2 sm:ml-11">
              {replies.map((r, i) => (
                <div key={i} className="flex items-start gap-2">
                  <span className="text-xs font-mono text-muted-foreground pt-3">#{i + 1}</span>
                  <Textarea value={r} onChange={(e) => { const n = [...replies]; n[i] = e.target.value; setReplies(n); }}
                    placeholder={i === 0 ? 'Write a reply...' : 'Optional variant'} rows={2} className="flex-1 resize-none" />
                </div>
              ))}
            </div>
          </div>

          {!isDmReply && (
            <>
              <div className="space-y-3">
                <SectionHeader icon={UserPlus} step="5" title="Ask To Follow First" />
                <div className="rounded-xl border bg-slate-50 p-4 space-y-3 sm:ml-11">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="font-medium text-sm">Require user to follow first</p>
                      <p className="text-xs text-muted-foreground">Send the main DM after follow verification.</p>
                    </div>
                    <Switch checked={askToFollow} onCheckedChange={setAskToFollow} />
                  </div>
                  {askToFollow && (
                    <div className="space-y-3">
                      <Textarea value={followMessage} onChange={(e) => setFollowMessage(e.target.value)} placeholder="Follow us first to unlock the link." rows={2} />
                      <Input value={followButtonText} onChange={(e) => setFollowButtonText(e.target.value)} placeholder="I Followed" maxLength={20} />
                    </div>
                  )}
                </div>
              </div>

              <div className="space-y-3">
                <SectionHeader icon={Send} step="6" title="Direct Message" />
                <div className="space-y-3 sm:ml-11">
                  <Textarea value={dmText} onChange={(e) => setDmText(e.target.value)} placeholder="Write the DM..." rows={3} />
                </div>
              </div>
            </>
          )}

          <div className="space-y-3">
            <SectionHeader icon={LinkIcon} step={isDmReply ? '4' : '7'} title="Link Buttons" subtitle="Optional, up to 3 links." />
            <div className="space-y-2 sm:ml-11">
              {buttons.map((b, i) => (
                <div key={i} className="grid gap-2 rounded-lg border p-2 bg-white sm:grid-cols-[1fr_1.5fr_auto] sm:items-center">
                  <Input value={b.title || ''} onChange={(e) => { const n = [...buttons]; n[i] = { ...n[i], title: e.target.value }; setButtons(n); }} placeholder="Button text" className="min-w-0" />
                  <Input value={b.url || ''} onChange={(e) => { const n = [...buttons]; n[i] = { ...n[i], url: e.target.value }; setButtons(n); }} placeholder="https://..." className="min-w-0" />
                  <Button type="button" size="icon" variant="ghost" onClick={() => setButtons(buttons.filter((_, idx) => idx !== i))} className="justify-self-end"><X className="w-4 h-4 text-rose-500" /></Button>
                </div>
              ))}
              {buttons.length < 3 && (
                <Button type="button" size="sm" variant="ghost" onClick={() => setButtons([...buttons, { title: '', url: '' }])} className="text-slate-700">
                  <Plus className="w-3 h-3 mr-1" /> Add link
                </Button>
              )}
            </div>
          </div>

          <div className="space-y-3">
            <SectionHeader icon={Zap} step={isDmReply ? '5' : '8'} title="Name" />
            <div className="sm:ml-11"><Input value={name} onChange={(e) => setName(e.target.value)} placeholder={keywords[0] || 'Automation name'} /></div>
          </div>
        </div>

        <DialogFooter className="px-4 py-4 border-t bg-slate-50 sticky bottom-0 sm:px-6">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={save} disabled={saving || !canSave} className="bg-slate-950 hover:bg-slate-800">
            {saving ? 'Saving...' : 'Save changes'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AutomationCard({ a, accounts, onToggle, onDelete, onEdit, onClone, disabledActions = false, highlighted = false }) {
  const acct = accounts.find(x => x.id === a.instagramAccountId);
  const pause = a.pause?.paused ? a.pause : (acct?.pause?.paused ? acct.pause : null);
  const keywords = keywordList(a);
  const isDmReply = a.type === 'dm_reply';
  const accentBorder = isDmReply ? 'border-l-sky-600' : 'border-l-slate-950';
  const TypeIcon = isDmReply ? Inbox : MessageCircle;
  const typeBadge = isDmReply
    ? <Badge className="bg-sky-100 text-sky-700 text-xs">DM Auto-Reply</Badge>
    : <Badge className="bg-slate-100 text-slate-700 text-xs">Comment to DM</Badge>;
  const mediaBlock = !isDmReply && a.postThumbnail ? (
    <MediaPreview src={a.postThumbnail} className="h-20 w-20 rounded-lg object-cover ring-1 ring-slate-100 sm:h-24 sm:w-24 sm:rounded-xl sm:ring-2" />
  ) : (
    <div className="flex h-14 w-14 items-center justify-center rounded-lg bg-slate-100 sm:h-16 sm:w-16 sm:rounded-xl">
      <TypeIcon className={`h-6 w-6 sm:h-7 sm:w-7 ${isDmReply ? 'text-sky-700' : 'text-slate-700'}`} />
    </div>
  );
  const statusControl = (
    <div className="flex shrink-0 items-center gap-2">
      <span className={`text-xs font-medium ${a.isActive ? 'text-emerald-600' : 'text-muted-foreground'}`}>{a.isActive ? 'ON' : 'OFF'}</span>
      <Switch checked={a.isActive} disabled={disabledActions} onCheckedChange={() => onToggle(a)} />
    </div>
  );

  return (
    <Card id={`automation-${a._id}`} className={`hover:shadow-md transition-all border-l-4 ${accentBorder} bg-white ${highlighted ? 'ring-2 ring-amber-400 shadow-md' : ''}`}>
      <CardContent className="p-4 sm:p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:gap-4">
          <div className="flex items-start gap-3 sm:block">
            <div className="shrink-0">{mediaBlock}</div>
            <div className="min-w-0 flex-1 sm:hidden">
              <div className="flex items-start justify-between gap-2">
                <h3 className="min-w-0 flex-1 text-base font-semibold leading-tight">{a.name || keywords[0] || 'Automation'}</h3>
                {statusControl}
              </div>
              {a.postPermalink && (
                <a href={a.postPermalink} target="_blank" rel="noreferrer" className="mt-2 inline-flex items-center gap-1 rounded-md border border-slate-200 px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50">
                  View Post <ExternalLink className="h-3 w-3" />
                </a>
              )}
            </div>
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2 mb-3">
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="hidden font-semibold text-lg leading-tight sm:block">{a.name || keywords[0] || 'Automation'}</h3>
                  {typeBadge}
                  {pause && <Badge className="bg-amber-100 text-amber-800 text-xs">Paused</Badge>}
                  {!isDmReply && a.respondToPostShares && <Badge className="bg-violet-100 text-violet-700 text-xs">Shared-post DM</Badge>}
                  {acct && <Badge variant="outline" className="text-xs">@{acct.username}</Badge>}
                  {a.postPermalink && <a href={a.postPermalink} target="_blank" rel="noreferrer" className="hidden text-xs text-slate-700 hover:underline sm:inline-flex sm:items-center sm:gap-1">View Post <ExternalLink className="w-3 h-3" /></a>}
                </div>
                <div className="flex items-center gap-1.5 mt-2 flex-wrap sm:mt-3 sm:gap-2">
                  <span className="text-sm font-medium text-slate-700">{triggerLabel(a)} {matchLabel(a.matchType)}</span>
                  {keywords.slice(0, 5).map(k => <Badge key={k} className="bg-slate-100 text-slate-700 text-sm">{k}</Badge>)}
                </div>
                {pause && (
                  <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                    <p className="font-semibold">Sending is temporarily paused</p>
                    <p className="mt-0.5 text-xs leading-relaxed">{pause.reason} Resumes after {pauseTimeLabel(pause.pausedUntil)}.</p>
                  </div>
                )}
              </div>
              <div className="hidden sm:block">{statusControl}</div>
            </div>
            <div className="flex flex-col gap-3 border-t pt-3 sm:mt-5 sm:flex-row sm:items-center sm:justify-between">
              <span className="text-sm font-medium text-slate-600">{runLabel(a.runsCount || 0)}</span>
              <div className="grid grid-cols-3 gap-2 sm:flex sm:items-center">
                <Button variant="ghost" size="sm" disabled={disabledActions} onClick={() => onEdit(a)} className="text-slate-700 hover:bg-slate-100">
                  <Pencil className="w-4 h-4 mr-1" /> Edit
                </Button>
                <Button variant="ghost" size="sm" disabled={disabledActions} onClick={() => onClone(a)} className="text-slate-700 hover:bg-slate-100">
                  <Copy className="w-4 h-4 mr-1" /> Clone
                </Button>
                <Button variant="ghost" size="sm" disabled={disabledActions} onClick={() => onDelete(a._id)} className="text-rose-500 hover:text-rose-600 hover:bg-rose-50">
                  <Trash2 className="w-4 h-4 mr-1" /> Delete
                </Button>
              </div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
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

function ShortsSyncPanel({
  state,
  fallbackInstagramAccount = null,
  loading,
  workspaceActive,
  onConnectYouTube,
  onDisconnectYouTube,
  onToggle,
  onRetry,
  connectingYouTube,
  disconnectingYouTube,
  saving,
  retryingRunId,
}) {
  const settings = state?.settings || {};
  const channel = state?.youtubeChannel || null;
  const instagram = state?.instagramAccount || fallbackInstagramAccount || null;
  const runs = state?.runs || [];
  const canUse = !!state?.entitlement?.canUse;
  const enabled = !!settings.enabled;

  return (
    <section className="mb-10">
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="flex items-center gap-2 text-xl font-bold"><Youtube className="h-5 w-5 text-red-600" /> Shorts Sync</h2>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline" className={enabled ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-slate-200 bg-white text-slate-600'}>
            {enabled ? 'Sync on' : 'Sync off'}
          </Badge>
          <Badge variant="outline">Private uploads</Badge>
        </div>
      </div>

      <Card className="border border-slate-200 bg-white shadow-sm">
        <CardContent className="p-5">
          {loading ? (
            <div className="space-y-3">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-20 w-full" />
            </div>
          ) : (
            <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(320px,420px)]">
              <div className="space-y-4">
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                    <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-slate-700">
                      <Instagram className="h-4 w-4" /> Instagram
                    </div>
                    <p className="truncate font-semibold text-slate-950">{instagram?.username ? `@${instagram.username}` : 'Not connected'}</p>
                  </div>
                  <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                    <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-slate-700">
                      <Youtube className="h-4 w-4" /> YouTube
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <p className="min-w-0 truncate font-semibold text-slate-950">{channel?.title || 'Not connected'}</p>
                      {channel ? (
                        <Button variant="ghost" size="icon" title="Disconnect YouTube" disabled={!workspaceActive || disconnectingYouTube} onClick={onDisconnectYouTube}>
                          <Trash2 className="h-4 w-4 text-rose-600" />
                        </Button>
                      ) : (
                        <Button size="sm" disabled={!workspaceActive || connectingYouTube} onClick={onConnectYouTube}>
                          {connectingYouTube && <RefreshCw className="mr-2 h-4 w-4 animate-spin" />}
                          Connect
                        </Button>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex flex-col gap-4 rounded-lg border border-slate-200 p-4 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="font-semibold text-slate-950">Auto-publish new Instagram videos</p>
                    <p className="mt-1 text-sm text-muted-foreground">New square or vertical videos up to 3 minutes are uploaded to YouTube as private Shorts.</p>
                    {!canUse && <p className="mt-2 text-sm font-medium text-amber-700">Available on Creator, Growth, and Agency plans.</p>}
                    {settings.lastScanAt && (
                      <p className="mt-2 text-xs text-muted-foreground">
                        Last scan: {pauseTimeLabel(settings.lastScanAt)}{settings.lastScanMessage ? ` - ${settings.lastScanMessage}` : ''}
                      </p>
                    )}
                  </div>
                  <Switch
                    checked={enabled}
                    disabled={!workspaceActive || saving || !canUse || !instagram || !channel}
                    onCheckedChange={(next) => onToggle(next)}
                    aria-label="Toggle Shorts Sync"
                  />
                </div>

                <div className="rounded-lg border border-sky-100 bg-sky-50 p-3 text-sm text-sky-900">
                  YouTube may keep API uploads private until the Google API project passes compliance review.
                </div>
              </div>

              <div className="rounded-lg border border-slate-200">
                <div className="flex items-center justify-between border-b px-4 py-3">
                  <p className="font-semibold text-slate-950">Recent activity</p>
                  <Film className="h-4 w-4 text-slate-500" />
                </div>
                {runs.length === 0 ? (
                  <div className="px-4 py-10 text-center text-sm text-muted-foreground">
                    New sync activity will appear here.
                  </div>
                ) : (
                  <div className="divide-y">
                    {runs.map((run) => (
                      <div key={run.id} className="p-4">
                        <div className="mb-2 flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-semibold text-slate-950">{run.caption || run.instagramMediaId || 'Instagram video'}</p>
                            <p className="text-xs text-muted-foreground">{run.createdAt ? pauseTimeLabel(run.createdAt) : ''}</p>
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
                            <Button variant="outline" size="sm" disabled={retryingRunId === run.id} onClick={() => onRetry(run.id)}>
                              {retryingRunId === run.id && <RefreshCw className="mr-2 h-3.5 w-3.5 animate-spin" />}
                              Retry
                            </Button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </section>
  );
}

function AccountSheet({ account, workspaceName, workspaceActive, connecting, resubscribing, onConnect, onDisconnect, onResubscribe }) {
  const username = account?.username ? `@${account.username}` : 'No account';

  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button
          variant="ghost"
          className="h-10 gap-2 rounded-full border border-slate-200 bg-white px-2 shadow-sm hover:bg-slate-50"
          aria-label="Open Instagram account options"
        >
          <span className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full bg-slate-950">
            {account?.pfp ? (
              <img src={account.pfp} alt={account.username || 'Instagram account'} className="h-full w-full object-cover" />
            ) : (
              <Instagram className="h-4 w-4 text-white" />
            )}
          </span>
          <ChevronDown className="h-4 w-4 text-slate-500" />
        </Button>
      </SheetTrigger>
      <SheetContent className="w-[88vw] sm:max-w-sm">
        <SheetHeader>
          <SheetTitle>Instagram account</SheetTitle>
          <SheetDescription>{workspaceName || 'Current workspace'}</SheetDescription>
        </SheetHeader>

        <div className="mt-6 space-y-5">
          <div className="flex items-center gap-3 rounded-lg border border-slate-200 bg-slate-50 p-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-full bg-slate-950">
              {account?.pfp ? (
                <img src={account.pfp} alt={account.username || 'Instagram account'} className="h-full w-full object-cover" />
              ) : (
                <Instagram className="h-6 w-6 text-white" />
              )}
            </div>
            <div className="min-w-0">
              <p className="truncate font-semibold text-slate-950">{username}</p>
              <p className="text-xs text-muted-foreground">
                {account ? 'Connected to this workspace' : 'Connect one account to this workspace'}
              </p>
            </div>
          </div>

          {account ? (
            <div className="space-y-3">
              <Button
                type="button"
                variant="outline"
                className="w-full justify-start border-slate-200 text-slate-700 hover:bg-slate-50"
                disabled={!workspaceActive || resubscribing}
                onClick={() => onResubscribe(account.id)}
              >
                <RefreshCw className={`mr-2 h-4 w-4 ${resubscribing ? 'animate-spin' : ''}`} />
                {resubscribing ? 'Re-subscribing...' : 'Re-subscribe webhook'}
              </Button>
              <Button
                type="button"
                variant="outline"
                className="w-full justify-start border-rose-200 text-rose-600 hover:bg-rose-50 hover:text-rose-700"
                disabled={!workspaceActive}
                onClick={() => onDisconnect(account.id)}
              >
                <Trash2 className="mr-2 h-4 w-4" /> Remove account
              </Button>
            </div>
          ) : (
            <Button
              type="button"
              className="w-full bg-slate-950 hover:bg-slate-800"
              disabled={connecting || !workspaceActive}
              onClick={onConnect}
            >
              <Plus className="mr-2 h-4 w-4" /> {connecting ? 'Redirecting...' : 'Connect Instagram'}
            </Button>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

function WorkspaceSettingsDialog({ open, onOpenChange, workspace, onRename, onStatusChange, onDelete }) {
  const [name, setName] = useState('');

  useEffect(() => {
    if (workspace) setName(workspace.name || '');
  }, [workspace]);

  if (!workspace) return null;
  const isActive = (workspace.status || 'active') === 'active';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Settings className="w-5 h-5 text-slate-700" /> Workspace settings
          </DialogTitle>
          <DialogDescription>Rename, disable, re-enable, or permanently delete this workspace.</DialogDescription>
        </DialogHeader>
        <div className="space-y-5 py-2">
          <div className="space-y-2">
            <Label htmlFor="workspace-name">Workspace name</Label>
            <div className="flex gap-2">
              <Input id="workspace-name" value={name} onChange={(e) => setName(e.target.value)} />
              <Button type="button" onClick={() => onRename(name)} disabled={!name.trim() || name.trim() === workspace.name}>
                Save
              </Button>
            </div>
          </div>
          <div className="rounded-lg border p-4 flex items-center justify-between gap-4">
            <div>
              <p className="font-medium text-sm">Workspace enabled</p>
              <p className="text-xs text-muted-foreground">Disabled workspaces stay visible but cannot run or edit automations.</p>
            </div>
            <Switch checked={isActive} onCheckedChange={(checked) => onStatusChange(checked ? 'active' : 'disabled')} />
          </div>
          <div className="rounded-lg border border-rose-200 bg-rose-50 p-4">
            <p className="font-medium text-sm text-rose-700">Hard delete</p>
            <p className="text-xs text-rose-600 mt-1">Deletes this workspace, its Instagram account, automations, and analytics runs.</p>
            <Button type="button" variant="destructive" className="mt-3" onClick={onDelete}>
              <Trash2 className="w-4 h-4 mr-1" /> Delete workspace
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function DashboardPage() {
  const router = useRouter();
  const [token, setToken] = useState(null);
  const [user, setUser] = useState(null);
  const [workspaces, setWorkspaces] = useState([]);
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState('');
  const [accounts, setAccounts] = useState([]);
  const [automations, setAutomations] = useState([]);
  const [showTypeChooser, setShowTypeChooser] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [showCreateDmReply, setShowCreateDmReply] = useState(false);
  const [editingAutomation, setEditingAutomation] = useState(null);
  const [showWorkspaceSettings, setShowWorkspaceSettings] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [resubscribingAccountId, setResubscribingAccountId] = useState('');
  const [billingStatus, setBillingStatus] = useState(null);
  const [automationSearch, setAutomationSearch] = useState('');
  const [automationStatusFilter, setAutomationStatusFilter] = useState('all');
  const [cloningAutomation, setCloningAutomation] = useState(null);
  const [pauseResetAccount, setPauseResetAccount] = useState(null);
  const [resettingPause, setResettingPause] = useState(false);
  const [highlightedAutomationId, setHighlightedAutomationId] = useState('');
  const [shortsSync, setShortsSync] = useState(null);
  const [loadingShortsSync, setLoadingShortsSync] = useState(false);
  const [connectingYouTube, setConnectingYouTube] = useState(false);
  const [disconnectingYouTube, setDisconnectingYouTube] = useState(false);
  const [savingShortsSync, setSavingShortsSync] = useState(false);
  const [retryingShortsRunId, setRetryingShortsRunId] = useState('');

  useEffect(() => {
    const t = localStorage.getItem('token');
    const u = localStorage.getItem('user');
    if (!t || !u) { router.replace('/auth?mode=login'); return; }
    setToken(t);
    try { setUser(JSON.parse(u)); } catch {}
  }, [router]);

  const loadWorkspaces = useCallback(async (preferredId = '') => {
    if (!token) return;
    try {
      const res = await authFetch(router, '/api/workspaces', { headers: { Authorization: `Bearer ${token}` } });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to load workspaces');
      const list = data.workspaces || [];
      setWorkspaces(list);
      const params = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null;
      const urlWorkspaceId = params?.get('workspaceId') || '';
      const stored = typeof window !== 'undefined' ? localStorage.getItem('selectedWorkspaceId') : '';
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
      if (isSessionExpiredError(e)) return;
      toast.error(e.message);
    }
  }, [token, selectedWorkspaceId, router]);

  const refresh = useCallback(async () => {
    if (!token || !selectedWorkspaceId) return;
    try {
      const [a, b] = await Promise.all([
        authFetch(router, '/api/instagram/accounts', { headers: scopedHeaders(token, selectedWorkspaceId) }).then(r => r.json()),
        authFetch(router, '/api/automations', { headers: scopedHeaders(token, selectedWorkspaceId) }).then(r => r.json()),
      ]);
      setAccounts(a.accounts || []);
      setAutomations(b.automations || []);
    } catch (e) { if (!isSessionExpiredError(e)) toast.error('Failed to load data'); }
  }, [token, selectedWorkspaceId, router]);

  const loadShortsSync = useCallback(async (workspaceIdOverride = '') => {
    const workspaceId = workspaceIdOverride || selectedWorkspaceId;
    if (!token || !workspaceId) return;
    setLoadingShortsSync(true);
    try {
      const res = await authFetch(router, '/api/shorts-sync', { headers: scopedHeaders(token, workspaceId) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to load Shorts Sync');
      setShortsSync(data);
    } catch (e) {
      if (!isSessionExpiredError(e)) toast.error(e.message || 'Failed to load Shorts Sync');
    } finally {
      setLoadingShortsSync(false);
    }
  }, [token, selectedWorkspaceId, router]);

  const loadBillingStatus = useCallback(async () => {
    if (!token) return;
    try {
      const res = await authFetch(router, '/api/billing/status', { headers: { Authorization: `Bearer ${token}` } });
      const data = await res.json();
      if (res.ok) setBillingStatus(data);
    } catch (e) {}
  }, [token, router]);

  const showBillingBlocked = useCallback((data) => {
    toast.error(data.error || 'Your current plan limit was reached.', {
      action: {
        label: 'View plans',
        onClick: () => router.push('/billing'),
      },
    });
  }, [router]);

  useEffect(() => { if (token) loadWorkspaces(); }, [loadWorkspaces, token]);
  useEffect(() => { if (token && selectedWorkspaceId) refresh(); }, [refresh, token, selectedWorkspaceId]);
  useEffect(() => { if (token && selectedWorkspaceId) loadShortsSync(selectedWorkspaceId); }, [loadShortsSync, token, selectedWorkspaceId]);
  useEffect(() => { if (token) loadBillingStatus(); }, [loadBillingStatus, token]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const workspaceId = params.get('workspaceId');
    const automationId = params.get('automationId');
    if (workspaceId) {
      localStorage.setItem('selectedWorkspaceId', workspaceId);
      setSelectedWorkspaceId(workspaceId);
    }
    if (automationId) setHighlightedAutomationId(automationId);
    if (params.get('ig') === 'success') { toast.success('Instagram account connected!'); window.history.replaceState({}, '', '/dashboard'); loadWorkspaces(workspaceId || ''); refresh(); loadShortsSync(workspaceId || selectedWorkspaceId); }
    else if (params.get('ig') === 'error') { toast.error('Connection failed: ' + (params.get('msg') || 'unknown')); window.history.replaceState({}, '', '/dashboard'); }
    else if (params.get('yt') === 'success') { toast.success('YouTube channel connected!'); window.history.replaceState({}, '', '/dashboard'); loadShortsSync(workspaceId || selectedWorkspaceId); }
    else if (params.get('yt') === 'error') { toast.error('YouTube connection failed: ' + (params.get('msg') || 'unknown')); window.history.replaceState({}, '', '/dashboard'); }
  }, [loadWorkspaces, refresh, loadShortsSync]);

  useEffect(() => {
    if (!highlightedAutomationId || !automations.some(a => a._id === highlightedAutomationId)) return;
    const timer = window.setTimeout(() => {
      document.getElementById(`automation-${highlightedAutomationId}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 150);
    const clear = window.setTimeout(() => setHighlightedAutomationId(''), 5000);
    return () => { window.clearTimeout(timer); window.clearTimeout(clear); };
  }, [automations, highlightedAutomationId]);

  const onLogout = () => {
    localStorage.removeItem('token'); localStorage.removeItem('user');
    toast.success('Logged out'); router.push('/');
  };

  const connectIG = async () => {
    if (!selectedWorkspaceId) { toast.error('Choose a workspace first'); return; }
    if (accounts.length > 0) { toast.error('This workspace already has an Instagram account. Create a new workspace for another account.'); return; }
    setConnecting(true);
    try {
      const res = await authFetch(router, '/api/instagram/connect', { headers: scopedHeaders(token, selectedWorkspaceId) });
      const data = await res.json();
      if (!res.ok) {
        if (data.billing) showBillingBlocked(data);
        const error = new Error(data.error);
        error.billing = !!data.billing;
        throw error;
      }
      window.location.href = data.url;
    } catch (e) { if (!e.billing && !isSessionExpiredError(e)) toast.error(e.message); setConnecting(false); }
  };

  const toggle = async (a) => {
    try {
      const res = await authFetch(router, `/api/automations/${a._id}`, {
        method: 'PUT', headers: scopedHeaders(token, selectedWorkspaceId, { 'Content-Type': 'application/json' }),
        body: JSON.stringify({ isActive: !a.isActive }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) { toast.success(`Automation ${!a.isActive ? 'enabled' : 'disabled'}`); refresh(); loadBillingStatus(); }
      else {
        if (data.billing) showBillingBlocked(data);
        toast.error(data.error || 'Failed to update automation');
      }
    } catch (e) {
      if (!isSessionExpiredError(e)) toast.error(e.message || 'Failed to update automation');
    }
  };
  const remove = async (id) => {
    if (!confirm('Delete this automation?')) return;
    try {
      const res = await authFetch(router, `/api/automations/${id}`, { method: 'DELETE', headers: scopedHeaders(token, selectedWorkspaceId) });
      if (res.ok) { toast.success('Deleted'); refresh(); }
    } catch (e) {
      if (!isSessionExpiredError(e)) toast.error(e.message || 'Failed to delete automation');
    }
  };
  const disconnectAccount = async (id) => {
    if (!confirm('Disconnect this Instagram account? All linked automations will be removed.')) return;
    try {
      const res = await authFetch(router, `/api/instagram/accounts/${id}`, { method: 'DELETE', headers: scopedHeaders(token, selectedWorkspaceId) });
      if (res.ok) { toast.success('Disconnected'); await loadWorkspaces(selectedWorkspaceId); refresh(); loadBillingStatus(); }
    } catch (e) {
      if (!isSessionExpiredError(e)) toast.error(e.message || 'Failed to disconnect account');
    }
  };

  const resubscribeAccount = async (id) => {
    setResubscribingAccountId(id);
    try {
      const res = await authFetch(router, `/api/instagram/accounts/${id}/resubscribe`, {
        method: 'POST',
        headers: scopedHeaders(token, selectedWorkspaceId),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Failed to re-subscribe webhook');
      toast.success('Webhook re-subscribed');
      refresh();
    } catch (e) {
      if (!isSessionExpiredError(e)) toast.error(e.message);
    } finally {
      setResubscribingAccountId('');
    }
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
      loadShortsSync();
    } catch (e) {
      if (!isSessionExpiredError(e)) toast.error(e.message || 'Failed to disconnect YouTube');
    } finally {
      setDisconnectingYouTube(false);
    }
  };

  const toggleShortsSync = async (enabled) => {
    setSavingShortsSync(true);
    try {
      const res = await authFetch(router, '/api/shorts-sync', {
        method: 'PUT',
        headers: scopedHeaders(token, selectedWorkspaceId, { 'Content-Type': 'application/json' }),
        body: JSON.stringify({ enabled, privacyStatus: 'private', notifySubscribers: false }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (data.billing) showBillingBlocked(data);
        throw new Error(data.error || 'Failed to update Shorts Sync');
      }
      setShortsSync(data);
      toast.success(enabled ? 'Shorts Sync enabled' : 'Shorts Sync disabled');
      loadBillingStatus();
    } catch (e) {
      if (!isSessionExpiredError(e)) toast.error(e.message || 'Failed to update Shorts Sync');
    } finally {
      setSavingShortsSync(false);
    }
  };

  const retryShortsRun = async (runId) => {
    setRetryingShortsRunId(runId);
    try {
      const res = await authFetch(router, `/api/shorts-sync/runs/${runId}/retry`, {
        method: 'POST',
        headers: scopedHeaders(token, selectedWorkspaceId),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Failed to queue retry');
      toast.success('Retry queued');
      loadShortsSync();
    } catch (e) {
      if (!isSessionExpiredError(e)) toast.error(e.message || 'Failed to queue retry');
    } finally {
      setRetryingShortsRunId('');
    }
  };

  const resetSendLimit = async () => {
    if (!pauseResetAccount) return;
    setResettingPause(true);
    try {
      const res = await authFetch(router, `/api/instagram/accounts/${pauseResetAccount.id}/reset-send-limit`, {
        method: 'POST',
        headers: scopedHeaders(token, selectedWorkspaceId),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Failed to reset the send limit');
      setPauseResetAccount(null);
      await refresh();
      toast.success('Send limit reset. Automations can send again.');
    } catch (e) {
      if (!isSessionExpiredError(e)) toast.error(e.message || 'Failed to reset the send limit');
    } finally {
      setResettingPause(false);
    }
  };

  const selectWorkspace = (id) => {
    setSelectedWorkspaceId(id);
    localStorage.setItem('selectedWorkspaceId', id);
  };

  const startClone = (automation) => {
    const draft = cloneAutomationDraft(automation, automations);
    setCloningAutomation(draft);
    if (draft.type === 'dm_reply') setShowCreateDmReply(true);
    else setShowCreate(true);
  };

  const createWorkspace = async () => {
    const name = window.prompt('Workspace name', 'New Workspace');
    if (!name || !name.trim()) return;
    try {
      const res = await authFetch(router, '/api/workspaces', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ name }),
      });
      const data = await res.json();
      if (!res.ok) { if (data.billing) showBillingBlocked(data); else toast.error(data.error || 'Failed to create workspace'); return; }
      toast.success('Workspace created');
      await loadWorkspaces(data.workspace.id);
      loadBillingStatus();
    } catch (e) {
      if (!isSessionExpiredError(e)) toast.error(e.message || 'Failed to create workspace');
    }
  };

  const renameWorkspace = async (name) => {
    try {
      const res = await authFetch(router, `/api/workspaces/${selectedWorkspaceId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ name }),
      });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error || 'Failed to rename workspace'); return; }
      toast.success('Workspace updated');
      await loadWorkspaces(data.workspace.id);
    } catch (e) {
      if (!isSessionExpiredError(e)) toast.error(e.message || 'Failed to rename workspace');
    }
  };

  const setWorkspaceStatus = async (status) => {
    try {
      const res = await authFetch(router, `/api/workspaces/${selectedWorkspaceId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ status }),
      });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error || 'Failed to update workspace'); return; }
      toast.success(status === 'active' ? 'Workspace enabled' : 'Workspace disabled');
      await loadWorkspaces(data.workspace.id);
      refresh();
    } catch (e) {
      if (!isSessionExpiredError(e)) toast.error(e.message || 'Failed to update workspace');
    }
  };

  const deleteWorkspace = async () => {
    const workspace = workspaces.find(w => w.id === selectedWorkspaceId);
    if (!workspace) return;
    if (!confirm(`Permanently delete "${workspace.name}" and all its workspace data?`)) return;
    try {
      const res = await authFetch(router, `/api/workspaces/${selectedWorkspaceId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error || 'Failed to delete workspace'); return; }
      toast.success('Workspace deleted');
      setShowWorkspaceSettings(false);
      setSelectedWorkspaceId('');
      await loadWorkspaces('');
      loadBillingStatus();
    } catch (e) {
      if (!isSessionExpiredError(e)) toast.error(e.message || 'Failed to delete workspace');
    }
  };

  if (!token || !user) return null;
  const selectedWorkspace = workspaces.find(w => w.id === selectedWorkspaceId);
  const workspaceActive = (selectedWorkspace?.status || 'active') === 'active';
  const activeCount = automations.filter((a) => {
    if (!a.isActive || a.pause?.paused) return false;
    const acct = accounts.find(x => x.id === a.instagramAccountId);
    return !acct?.pause?.paused;
  }).length;
  const currentAccount = accounts[0] || null;
  const accountPause = currentAccount?.pause?.paused ? currentAccount.pause : null;
  const affectedAccountAutomations = accountPause
    ? automations.filter(a => a.isActive && a.instagramAccountId === currentAccount.id).length
    : 0;
  const normalizedSearch = automationSearch.trim().toLowerCase();
  const filteredAutomations = automations.filter((a) => {
    const matchesStatus =
      automationStatusFilter === 'all' ||
      (automationStatusFilter === 'active' && a.isActive) ||
      (automationStatusFilter === 'inactive' && !a.isActive);
    if (!matchesStatus) return false;
    if (!normalizedSearch) return true;

    const acct = accounts.find(x => x.id === a.instagramAccountId);
    const haystack = [
      a.name,
      triggerLabel(a),
      a.type === 'dm_reply' ? 'dm auto reply' : 'comment to dm',
      a.postPermalink,
      acct?.username,
      ...(keywordList(a) || []),
    ].filter(Boolean).join(' ').toLowerCase();

    return haystack.includes(normalizedSearch);
  });

  return (
    <div className="flex min-h-screen flex-col bg-slate-50">
      <header className="border-b border-slate-200 bg-white/90 backdrop-blur sticky top-0 z-20">
        <div className="container mx-auto px-4 py-3 flex min-w-0 items-center justify-between gap-3">
          <Image src={logoImage} alt="Komentra" priority className="h-11 w-auto max-w-[62%] shrink object-contain" />
          <div className="flex shrink-0 items-center gap-2 md:gap-3">
            <div className="hidden sm:flex items-center gap-2">
              <Select value={selectedWorkspaceId} onValueChange={selectWorkspace}>
                <SelectTrigger className="w-48 bg-white">
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
              <Button variant="ghost" size="icon" title="New workspace" onClick={createWorkspace}>
                <Plus className="w-4 h-4" />
              </Button>
              <Button variant="ghost" size="icon" title="Workspace settings" onClick={() => setShowWorkspaceSettings(true)} disabled={!selectedWorkspace}>
                <Settings className="w-4 h-4" />
              </Button>
            </div>
            <AccountSheet
              account={currentAccount}
              workspaceName={selectedWorkspace?.name}
              workspaceActive={workspaceActive}
              connecting={connecting}
              resubscribing={resubscribingAccountId === currentAccount?.id}
              onConnect={connectIG}
              onDisconnect={disconnectAccount}
              onResubscribe={resubscribeAccount}
            />
            <div className="hidden md:flex items-center gap-2 text-sm">
              <div className={`w-2 h-2 rounded-full ${workspaceActive ? 'bg-emerald-500 animate-pulse' : 'bg-slate-400'}`}></div>
              <span className="text-muted-foreground">{workspaceActive ? `${activeCount} active` : 'disabled'}</span>
              {billingStatus?.plan && <Badge variant="outline" className="ml-1">{billingStatus.plan.name}</Badge>}
            </div>
            <Button variant="ghost" size="sm" className="hidden md:inline-flex" onClick={() => router.push('/analytics')}>
              <BarChart3 className="w-4 h-4 mr-1" /> Analytics
            </Button>
            <Button variant="ghost" size="sm" className="hidden md:inline-flex" onClick={() => router.push('/audience')}>
              <Users className="w-4 h-4 mr-1" /> Audience
            </Button>
            <Button variant="ghost" size="sm" className="hidden md:inline-flex" onClick={() => router.push('/billing')}>
              <CreditCard className="w-4 h-4 mr-1" /> Billing
            </Button>
            <Button variant="ghost" size="sm" className="hidden md:inline-flex" onClick={() => router.push(`/contact?source=dashboard&workspaceId=${selectedWorkspaceId || ''}`)}>
              <LifeBuoy className="w-4 h-4 mr-1" /> Support
            </Button>
            <span className="hidden max-w-40 truncate text-sm text-muted-foreground lg:inline">{user.username || user.email}</span>
            <Button variant="ghost" size="sm" className="hidden md:inline-flex" onClick={onLogout}><LogOut className="w-4 h-4 mr-1" /> Logout</Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="md:hidden" aria-label="Open dashboard menu">
                  <Menu className="w-5 h-5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel className="truncate">{user.username || user.email}</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => router.push('/analytics')}>
                  <BarChart3 className="w-4 h-4 mr-2" /> Analytics
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => router.push('/audience')}>
                  <Users className="w-4 h-4 mr-2" /> Audience
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => router.push('/billing')}>
                  <CreditCard className="w-4 h-4 mr-2" /> Billing
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => router.push(`/contact?source=dashboard&workspaceId=${selectedWorkspaceId || ''}`)}>
                  <LifeBuoy className="w-4 h-4 mr-2" /> Support
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={onLogout}>
                  <LogOut className="w-4 h-4 mr-2" /> Logout
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </header>

      <main className="container mx-auto max-w-6xl flex-1 px-4 py-8">
        <div className="sm:hidden mb-4 flex min-w-0 items-center gap-2">
          <Select value={selectedWorkspaceId} onValueChange={selectWorkspace}>
            <SelectTrigger className="min-w-0 flex-1 bg-white">
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
          <Button variant="outline" size="icon" onClick={createWorkspace}><Plus className="w-4 h-4" /></Button>
          <Button variant="outline" size="icon" onClick={() => setShowWorkspaceSettings(true)} disabled={!selectedWorkspace}><Settings className="w-4 h-4" /></Button>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-2 gap-4 mb-10">
          <Card className="border border-slate-200 bg-white text-slate-950 shadow-sm">
            <CardContent className="p-5"><p className="text-xs text-slate-500 mb-1">Total Automations</p><p className="text-3xl font-bold">{automations.length}</p></CardContent>
          </Card>
          <Card className="border border-slate-200 bg-white text-slate-950 shadow-sm">
            <CardContent className="p-5"><p className="text-xs text-slate-500 mb-1">Active Now</p><p className="text-3xl font-bold">{activeCount}</p></CardContent>
          </Card>
        </div>

        {accountPause && (
          <div className="mb-6 rounded-xl border border-amber-300 bg-amber-50 p-4 shadow-sm sm:p-5" role="alert">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div className="flex min-w-0 gap-3">
                <div className="mt-0.5 rounded-full bg-amber-100 p-2 text-amber-800"><AlertTriangle className="h-5 w-5" /></div>
                <div>
                  <h2 className="font-bold text-amber-950">Automations for {currentAccount.username ? `@${currentAccount.username}` : 'this account'} are paused</h2>
                  <p className="mt-1 text-sm leading-relaxed text-amber-900">{accountPause.reason}</p>
                  <p className="mt-2 text-xs text-amber-800">
                    {affectedAccountAutomations} active {affectedAccountAutomations === 1 ? 'automation is' : 'automations are'} affected. Scheduled to resume after {pauseTimeLabel(accountPause.pausedUntil)}. Skipped comments are not replayed.
                  </p>
                </div>
              </div>
              {accountPause.canReset && (
                <Button className="shrink-0 bg-amber-900 text-white hover:bg-amber-800" onClick={() => setPauseResetAccount(currentAccount)}>
                  <RefreshCw className="mr-2 h-4 w-4" /> Reset and resume
                </Button>
              )}
            </div>
          </div>
        )}

        <ShortsSyncPanel
          state={shortsSync}
          fallbackInstagramAccount={currentAccount}
          loading={loadingShortsSync}
          workspaceActive={workspaceActive}
          onConnectYouTube={connectYouTube}
          onDisconnectYouTube={disconnectYouTube}
          onToggle={toggleShortsSync}
          onRetry={retryShortsRun}
          connectingYouTube={connectingYouTube}
          disconnectingYouTube={disconnectingYouTube}
          saving={savingShortsSync}
          retryingRunId={retryingShortsRunId}
        />

        <section>
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <h2 className="text-xl font-bold flex items-center gap-2"><Zap className="w-5 h-5 text-amber-500" /> Automations</h2>
            {accounts.length > 0 && (
              <Button disabled={!workspaceActive} onClick={() => { setCloningAutomation(null); setShowTypeChooser(true); }} className="bg-slate-950 hover:bg-slate-800">
                <Plus className="w-4 h-4 mr-2" /> New Automation
              </Button>
            )}
          </div>

          {accounts.length === 0 ? (
            <Card className="border-dashed">
              <CardContent className="py-12 text-center">
                <Sparkles className="w-12 h-12 mx-auto text-muted-foreground mb-3" />
                <p className="text-muted-foreground mb-4">Connect an Instagram account first to start creating automations.</p>
                <Button onClick={connectIG} disabled={connecting || !workspaceActive} className="bg-slate-950 hover:bg-slate-800">
                  <Plus className="w-4 h-4 mr-2" /> {connecting ? 'Redirecting...' : 'Connect Instagram'}
                </Button>
              </CardContent>
            </Card>
          ) : (
            <>
              {automations.length === 0 ? (
                <Card className="border-dashed">
                  <CardContent className="py-12 text-center">
                    <Sparkles className="w-12 h-12 mx-auto text-muted-foreground mb-3" />
                    <p className="text-muted-foreground">No automations yet. Click New Automation to create your first one.</p>
                  </CardContent>
                </Card>
              ) : (
                <>
                  <div className="mb-4 flex flex-col gap-3 rounded-lg border border-slate-200 bg-white p-3 shadow-sm md:flex-row md:items-center md:justify-between">
                    <div className="relative min-w-0 flex-1">
                      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                      <Input
                        value={automationSearch}
                        onChange={(e) => setAutomationSearch(e.target.value)}
                        placeholder="Search automations, keywords, posts"
                        className="h-10 pl-9 pr-9"
                      />
                      {automationSearch && (
                        <button
                          type="button"
                          aria-label="Clear automation search"
                          onClick={() => setAutomationSearch('')}
                          className="absolute right-2 top-1/2 rounded-md p-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 -translate-y-1/2"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                    <div className="grid h-10 grid-cols-3 rounded-lg bg-slate-100 p-1 text-sm font-medium text-slate-600 md:w-72">
                      {[
                        ['all', 'All'],
                        ['active', 'Active'],
                        ['inactive', 'Inactive'],
                      ].map(([value, label]) => (
                        <button
                          key={value}
                          type="button"
                          onClick={() => setAutomationStatusFilter(value)}
                          className={`rounded-md px-3 transition ${automationStatusFilter === value ? 'bg-white text-slate-950 shadow-sm' : 'hover:text-slate-950'}`}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {filteredAutomations.length === 0 ? (
                    <Card className="border-dashed bg-white">
                      <CardContent className="py-10 text-center">
                        <Search className="w-10 h-10 mx-auto text-muted-foreground mb-3" />
                        <p className="font-medium text-slate-700">No automations match your filters.</p>
                        <p className="text-sm text-muted-foreground">Try another search or switch the status filter.</p>
                      </CardContent>
                    </Card>
                  ) : (
                    <div className="space-y-3">
                      {filteredAutomations.map((a) => <AutomationCard key={a._id} a={a} accounts={accounts} onToggle={toggle} onDelete={remove} onEdit={setEditingAutomation} onClone={startClone} disabledActions={!workspaceActive} highlighted={highlightedAutomationId === a._id} />)}
                    </div>
                  )}
                </>
              )}
            </>
          )}
        </section>
      </main>

      <footer className="mt-auto border-t bg-white/80">
        <div className="container mx-auto flex flex-col gap-3 px-4 py-5 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
          <p>Copyright {new Date().getFullYear()} Komentra.</p>
          <div className="flex flex-wrap items-center gap-4">
            <Link href={`/contact?source=dashboard&workspaceId=${selectedWorkspaceId || ''}`} className="hover:text-foreground">Contact</Link>
            <Link href="/privacy" className="hover:text-foreground">Privacy</Link>
          </div>
        </div>
      </footer>

      <AutomationTypeDialog
        open={showTypeChooser}
        onOpenChange={setShowTypeChooser}
        onSelect={(type) => {
          setShowTypeChooser(false);
          setCloningAutomation(null);
          if (type === 'dm_reply') setShowCreateDmReply(true);
          else setShowCreate(true);
        }}
      />
      <CreateAutomationDialog open={showCreate} onOpenChange={(next) => { setShowCreate(next); if (!next) setCloningAutomation(null); }} accounts={accounts} token={token} workspaceId={selectedWorkspaceId} onCreated={() => { refresh(); loadBillingStatus(); }} onBillingBlocked={showBillingBlocked} cloneSource={cloningAutomation?.type !== 'dm_reply' ? cloningAutomation : null} />
      <CreateDmReplyDialog open={showCreateDmReply} onOpenChange={(next) => { setShowCreateDmReply(next); if (!next) setCloningAutomation(null); }} accounts={accounts} token={token} workspaceId={selectedWorkspaceId} onCreated={() => { refresh(); loadBillingStatus(); }} onBillingBlocked={showBillingBlocked} cloneSource={cloningAutomation?.type === 'dm_reply' ? cloningAutomation : null} />
      <EditAutomationDialog automation={editingAutomation} onOpenChange={() => setEditingAutomation(null)} accounts={accounts} token={token} workspaceId={selectedWorkspaceId} onSaved={() => { refresh(); loadBillingStatus(); }} onBillingBlocked={showBillingBlocked} />
      <Dialog open={!!pauseResetAccount} onOpenChange={(open) => { if (!open && !resettingPause) setPauseResetAccount(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><AlertTriangle className="h-5 w-5 text-amber-600" /> Reset the send limit?</DialogTitle>
            <DialogDescription className="pt-2 leading-relaxed">
              This immediately resumes every active automation connected to {pauseResetAccount?.username ? `@${pauseResetAccount.username}` : 'this account'}. Continuing may increase the risk of Instagram temporarily restricting messages if activity remains high.
            </DialogDescription>
          </DialogHeader>
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
            Reset only if you understand the recent sending activity. Comments already skipped during the pause will not be replayed.
          </div>
          <DialogFooter>
            <Button variant="outline" disabled={resettingPause} onClick={() => setPauseResetAccount(null)}>Keep paused</Button>
            <Button className="bg-amber-900 hover:bg-amber-800" disabled={resettingPause} onClick={resetSendLimit}>
              {resettingPause && <RefreshCw className="mr-2 h-4 w-4 animate-spin" />}
              {resettingPause ? 'Resetting...' : 'Reset and resume'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <WorkspaceSettingsDialog
        open={showWorkspaceSettings}
        onOpenChange={setShowWorkspaceSettings}
        workspace={selectedWorkspace}
        onRename={renameWorkspace}
        onStatusChange={setWorkspaceStatus}
        onDelete={deleteWorkspace}
      />
    </div>
  );
}
