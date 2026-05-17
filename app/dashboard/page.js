'use client';

import { useState, useEffect, useCallback } from 'react';
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
import { toast } from 'sonner';
import {
  Instagram, LogOut, Plus, Trash2, Zap, Send, Sparkles,
  CheckCircle2, ExternalLink, UserPlus, Link as LinkIcon,
  X, Hash, Shuffle, Wand2, Bot, ChevronRight, BarChart3, MessageCircle, Inbox,
  Pencil, Settings, Briefcase,
} from 'lucide-react';

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

function SectionHeader({ icon: Icon, step, title, subtitle }) {
  return (
    <div className="flex items-start gap-3 pt-2">
      <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-indigo-500 to-violet-500 text-white flex items-center justify-center text-sm font-bold flex-shrink-0">{step}</div>
      <div>
        <h3 className="font-semibold flex items-center gap-2"><Icon className="w-4 h-4 text-violet-600" />{title}</h3>
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

function triggerLabel(a) {
  return a?.type === 'dm_reply' ? 'When user sends DM' : 'When user comments';
}

function matchLabel(matchType) {
  if (matchType === 'exact') return 'exactly';
  if (matchType === 'starts_with') return 'starts with';
  return 'contains';
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
            className="flex items-center gap-4 rounded-xl border p-4 text-left transition hover:border-violet-300 hover:bg-violet-50"
          >
            <div className="w-11 h-11 rounded-xl bg-violet-100 flex items-center justify-center">
              <MessageCircle className="w-5 h-5 text-violet-600" />
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
            className="flex items-center gap-4 rounded-xl border p-4 text-left transition hover:border-cyan-300 hover:bg-cyan-50"
          >
            <div className="w-11 h-11 rounded-xl bg-cyan-100 flex items-center justify-center">
              <Inbox className="w-5 h-5 text-cyan-600" />
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

function CreateAutomationDialog({ open, onOpenChange, accounts, token, workspaceId, onCreated }) {
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
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) {
      setSelectedAccount(''); setMedia([]); setSelectedPost(null); setName('');
      setKeywords([]); setKwInput(''); setMatchType('contains');
      setReplies(['', '', '']); setDmText(''); setButtons([{ title: '', url: '' }]);
      setAskToFollow(false); setFollowMessage(''); setFollowButtonText('I Followed');
    }
  }, [open]);

  useEffect(() => {
    if (selectedAccount) {
      setLoadingMedia(true);
      fetch(`/api/instagram/media?accountId=${selectedAccount}`, { headers: scopedHeaders(token, workspaceId) })
        .then(r => r.json()).then(d => setMedia(d.media || []))
        .catch(() => toast.error('Failed to load posts'))
        .finally(() => setLoadingMedia(false));
    }
  }, [selectedAccount, token]);

  const addKeyword = () => {
    const k = kwInput.trim().toLowerCase();
    if (k && !keywords.includes(k)) setKeywords([...keywords, k]);
    setKwInput('');
  };

  const validReplies = replies.filter(r => r.trim()).slice(0, 3);
  const validButtons = buttons.filter(b => b.title.trim() && b.url.trim()).slice(0, 3);
  const canCreate = selectedAccount && selectedPost && keywords.length > 0 && validReplies.length > 0 && dmText.trim();

  const create = async () => {
    if (!canCreate) { toast.error('Fill in the required steps first'); return; }
    setSaving(true);
    try {
      const acct = accounts.find(a => a.id === selectedAccount);
      const res = await fetch('/api/automations', {
        method: 'POST',
        headers: scopedHeaders(token, workspaceId, { 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          instagramAccountId: selectedAccount,
          postId: selectedPost.id, postPermalink: selectedPost.permalink,
          postThumbnail: selectedPost.thumbnail_url || selectedPost.media_url,
          name: name.trim() || keywords[0],
          keywords, matchType, replyMessages: validReplies,
          dmText: dmText.trim(), dmButtons: validButtons,
          askToFollow,
          followMessage: askToFollow ? (followMessage.trim() || `Follow @${acct?.username || ''} first to unlock this!`) : null,
          followButtonText: askToFollow ? (followButtonText.trim() || 'I Followed') : null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed');
      toast.success('Automation created! 🚀');
      onCreated(data.automation);
      onOpenChange(false);
    } catch (e) { toast.error(e.message); }
    finally { setSaving(false); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[92vh] overflow-y-auto p-0">
        <DialogHeader className="px-6 pt-6 pb-3 border-b sticky top-0 bg-white z-10">
          <DialogTitle className="flex items-center gap-2 text-2xl">
            <div className="w-9 h-9 rounded-lg bg-gradient-to-tr from-indigo-500 to-violet-500 flex items-center justify-center"><Wand2 className="w-5 h-5 text-white" /></div>
            New Automation
          </DialogTitle>
          <DialogDescription>Configure how Komentra reacts when someone comments on your post.</DialogDescription>
        </DialogHeader>

        <div className="px-6 py-4 space-y-8">
          {/* Step 1 */}
          <div className="space-y-3">
            <SectionHeader icon={Instagram} step="1" title="Instagram Account" subtitle="Pick the account this automation runs on." />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 ml-11">
              {accounts.map((a) => (
                <button key={a.id} onClick={() => { setSelectedAccount(a.id); setSelectedPost(null); }}
                  className={`p-3 rounded-xl border-2 text-left transition ${selectedAccount === a.id ? 'border-violet-500 bg-violet-50 shadow-sm' : 'border-border hover:border-violet-300'}`}>
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-fuchsia-500 to-violet-500 flex items-center justify-center"><Instagram className="w-4 h-4 text-white" /></div>
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
              <div className="ml-11">
                {loadingMedia ? <p className="text-sm text-muted-foreground">Loading posts...</p>
                : media.length === 0 ? <p className="text-sm text-muted-foreground">No posts found.</p>
                : (
                  <div className="grid grid-cols-3 sm:grid-cols-5 gap-2 max-h-64 overflow-y-auto p-1">
                    {media.map((m) => (
                      <button key={m.id} onClick={() => setSelectedPost(m)}
                        className={`relative aspect-square rounded-lg overflow-hidden border-2 transition ${selectedPost?.id === m.id ? 'border-violet-500 ring-2 ring-violet-300' : 'border-transparent hover:border-violet-300'}`}>
                        <img src={m.thumbnail_url || m.media_url} alt="" className="w-full h-full object-cover" />
                        {selectedPost?.id === m.id && <div className="absolute inset-0 bg-violet-500/40 flex items-center justify-center"><CheckCircle2 className="w-7 h-7 text-white" /></div>}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Step 3 */}
          {selectedPost && (
            <div className="space-y-3">
              <SectionHeader icon={Sparkles} step="3" title="When user comments" subtitle="Keywords Komentra listens for on this post." />
              <div className="ml-11 space-y-3">
                <div className="flex items-center gap-2">
                  <Input value={kwInput} onChange={(e) => setKwInput(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addKeyword(); } }}
                    placeholder='e.g. "price"  →  press Enter' className="flex-1" />
                  <Button type="button" onClick={addKeyword} variant="secondary">Add</Button>
                </div>
                {keywords.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {keywords.map((k) => (
                      <Badge key={k} className="bg-violet-100 text-violet-700 hover:bg-violet-200 pl-3 pr-1 py-1 text-sm">
                        {k}
                        <button onClick={() => setKeywords(keywords.filter(x => x !== k))} className="ml-1 hover:bg-violet-300 rounded-full p-0.5"><X className="w-3 h-3" /></button>
                      </Badge>
                    ))}
                  </div>
                )}
                <div className="flex items-center gap-3">
                  <Label className="text-sm">Comment match:</Label>
                  <Select value={matchType} onValueChange={setMatchType}>
                    <SelectTrigger className="w-56"><SelectValue /></SelectTrigger>
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
              <div className="ml-11 space-y-2">
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
              <div className="ml-11 rounded-xl border bg-gradient-to-br from-violet-50/60 to-indigo-50/60 p-4 space-y-3">
                <div className="flex items-center justify-between">
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
              <div className="ml-11 space-y-3">
                <Textarea value={dmText} onChange={(e) => setDmText(e.target.value)} placeholder="Hey! Here's everything you need 👇" rows={3} />
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs flex items-center gap-1"><LinkIcon className="w-3 h-3" /> Link buttons (max 3)</Label>
                    {buttons.length < 3 && <Button type="button" size="sm" variant="ghost" onClick={() => setButtons([...buttons, { title: '', url: '' }])} className="text-violet-600 h-7"><Plus className="w-3 h-3 mr-1" /> Add link</Button>}
                  </div>
                  {buttons.map((b, i) => (
                    <div key={i} className="flex items-center gap-2 rounded-lg border p-2 bg-white">
                      <Input value={b.title} onChange={(e) => { const n = [...buttons]; n[i] = { ...n[i], title: e.target.value }; setButtons(n); }} placeholder="Button text" className="flex-1" />
                      <Input value={b.url} onChange={(e) => { const n = [...buttons]; n[i] = { ...n[i], url: e.target.value }; setButtons(n); }} placeholder="https://..." className="flex-[1.5]" />
                      <Button type="button" size="icon" variant="ghost" onClick={() => setButtons(buttons.filter((_, idx) => idx !== i))}><X className="w-4 h-4 text-rose-500" /></Button>
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
              <div className="ml-11"><Input value={name} onChange={(e) => setName(e.target.value)} placeholder={keywords[0] || 'My automation'} /></div>
            </div>
          )}
        </div>

        <DialogFooter className="px-6 py-4 border-t bg-slate-50 sticky bottom-0">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={create} disabled={saving || !canCreate} className="bg-gradient-to-r from-indigo-600 to-violet-600 shadow-lg shadow-violet-500/30">
            {saving ? 'Creating...' : <>Create Automation <ChevronRight className="w-4 h-4 ml-1" /></>}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CreateDmReplyDialog({ open, onOpenChange, accounts, token, workspaceId, onCreated }) {
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
      const res = await fetch('/api/automations', {
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
      if (!res.ok) throw new Error(data.error || 'Failed');
      toast.success('DM auto-reply created! 🚀');
      onCreated(data.automation);
      onOpenChange(false);
    } catch (e) { toast.error(e.message); } finally { setSaving(false); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[92vh] overflow-y-auto p-0">
        <DialogHeader className="px-6 pt-6 pb-3 border-b sticky top-0 bg-white z-10">
          <DialogTitle className="flex items-center gap-2 text-2xl">
            <div className="w-9 h-9 rounded-lg bg-gradient-to-tr from-cyan-500 to-blue-500 flex items-center justify-center"><Inbox className="w-5 h-5 text-white" /></div>
            DM Auto-Reply
          </DialogTitle>
          <DialogDescription>Auto-reply when someone DMs you a specific keyword.</DialogDescription>
        </DialogHeader>

        <div className="px-6 py-4 space-y-8">
          <div className="space-y-3">
            <SectionHeader icon={Instagram} step="1" title="Instagram Account" />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 ml-11">
              {accounts.map((a) => (
                <button key={a.id} onClick={() => setSelectedAccount(a.id)}
                  className={`p-3 rounded-xl border-2 text-left transition ${selectedAccount === a.id ? 'border-violet-500 bg-violet-50 shadow-sm' : 'border-border hover:border-violet-300'}`}>
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-fuchsia-500 to-violet-500 flex items-center justify-center"><Instagram className="w-4 h-4 text-white" /></div>
                    <span className="font-medium">@{a.username}</span>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {selectedAccount && (
            <div className="space-y-3">
              <SectionHeader icon={Sparkles} step="2" title="When user sends DM" subtitle="Keywords Komentra listens for in direct messages." />
              <div className="ml-11 space-y-3">
                <div className="flex items-center gap-2">
                  <Input value={kwInput} onChange={(e) => setKwInput(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addKeyword(); } }}
                    placeholder='e.g. "info"  →  press Enter' className="flex-1" />
                  <Button type="button" onClick={addKeyword} variant="secondary">Add</Button>
                </div>
                {keywords.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {keywords.map((k) => (
                      <Badge key={k} className="bg-violet-100 text-violet-700 hover:bg-violet-200 pl-3 pr-1 py-1 text-sm">
                        {k}
                        <button onClick={() => setKeywords(keywords.filter(x => x !== k))} className="ml-1 hover:bg-violet-300 rounded-full p-0.5"><X className="w-3 h-3" /></button>
                      </Badge>
                    ))}
                  </div>
                )}
                <div className="flex items-center gap-3">
                  <Label className="text-sm">Match:</Label>
                  <Select value={matchType} onValueChange={setMatchType}>
                    <SelectTrigger className="w-56"><SelectValue /></SelectTrigger>
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
              <div className="ml-11 space-y-2">
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
              <div className="ml-11 space-y-2">
                {buttons.map((b, i) => (
                  <div key={i} className="flex items-center gap-2 rounded-lg border p-2 bg-white">
                    <Input value={b.title || ''} onChange={(e) => { const n = [...buttons]; n[i] = { ...n[i], title: e.target.value }; setButtons(n); }} placeholder="Button text" className="flex-1" />
                    <Input value={b.url || ''} onChange={(e) => { const n = [...buttons]; n[i] = { ...n[i], url: e.target.value }; setButtons(n); }} placeholder="https://..." className="flex-[1.5]" />
                    <Button type="button" size="icon" variant="ghost" onClick={() => setButtons(buttons.filter((_, idx) => idx !== i))}><X className="w-4 h-4 text-rose-500" /></Button>
                  </div>
                ))}
                {buttons.length < 3 && (
                  <Button type="button" size="sm" variant="ghost" onClick={() => setButtons([...buttons, { title: '', url: '' }])} className="text-violet-600">
                    <Plus className="w-3 h-3 mr-1" /> Add link
                  </Button>
                )}
              </div>
            </div>
          )}

          {selectedAccount && (
            <div className="space-y-3">
              <SectionHeader icon={Zap} step="5" title="Name (optional)" />
              <div className="ml-11"><Input value={name} onChange={(e) => setName(e.target.value)} placeholder={keywords[0] || 'My DM auto-reply'} /></div>
            </div>
          )}
        </div>

        <DialogFooter className="px-6 py-4 border-t bg-slate-50 sticky bottom-0">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={create} disabled={saving || !canCreate} className="bg-gradient-to-r from-cyan-600 to-blue-600 shadow-lg shadow-blue-500/30">
            {saving ? 'Creating...' : <>Create DM Reply <ChevronRight className="w-4 h-4 ml-1" /></>}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EditAutomationDialog({ automation, accounts, token, workspaceId, onOpenChange, onSaved }) {
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
  }, [automation]);

  useEffect(() => {
    if (!open || !selectedAccount || isDmReply) return;
    setLoadingMedia(true);
    fetch(`/api/instagram/media?accountId=${selectedAccount}`, { headers: scopedHeaders(token, workspaceId) })
      .then(r => r.json())
      .then(d => setMedia(d.media || []))
      .catch(() => toast.error('Failed to load posts'))
      .finally(() => setLoadingMedia(false));
  }, [open, selectedAccount, isDmReply, token, workspaceId]);

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
        payload.postThumbnail = selectedPost.thumbnail_url || selectedPost.media_url || null;
        payload.dmText = dmText.trim();
        payload.dmButtons = validButtons;
        payload.askToFollow = askToFollow;
        payload.followMessage = askToFollow ? followMessage.trim() : null;
        payload.followButtonText = askToFollow ? (followButtonText.trim() || 'I Followed') : null;
      }

      const res = await fetch(`/api/automations/${automation._id}`, {
        method: 'PUT',
        headers: scopedHeaders(token, workspaceId, { 'Content-Type': 'application/json' }),
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to update automation');
      toast.success('Automation updated');
      onSaved(data.automation);
      onOpenChange(false);
    } catch (e) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) onOpenChange(false); }}>
      <DialogContent className="max-w-3xl max-h-[92vh] overflow-y-auto p-0">
        <DialogHeader className="px-6 pt-6 pb-3 border-b sticky top-0 bg-white z-10">
          <DialogTitle className="flex items-center gap-2 text-2xl">
            <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${isDmReply ? 'bg-cyan-600' : 'bg-violet-600'}`}>
              {isDmReply ? <Inbox className="w-5 h-5 text-white" /> : <MessageCircle className="w-5 h-5 text-white" />}
            </div>
            Edit Automation
          </DialogTitle>
          <DialogDescription>{isDmReply ? 'Update the DM keyword reply settings.' : 'Update the comment automation settings.'}</DialogDescription>
        </DialogHeader>

        <div className="px-6 py-4 space-y-7">
          <div className="space-y-3">
            <SectionHeader icon={Instagram} step="1" title="Instagram Account" />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 ml-11">
              {accounts.map((a) => (
                <button key={a.id} onClick={() => { setSelectedAccount(a.id); if (!isDmReply) setSelectedPost(null); }}
                  className={`p-3 rounded-xl border-2 text-left transition ${selectedAccount === a.id ? 'border-violet-500 bg-violet-50 shadow-sm' : 'border-border hover:border-violet-300'}`}>
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-fuchsia-500 to-violet-500 flex items-center justify-center"><Instagram className="w-4 h-4 text-white" /></div>
                    <span className="font-medium">@{a.username}</span>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {!isDmReply && selectedAccount && (
            <div className="space-y-3">
              <SectionHeader icon={Hash} step="2" title="Post" subtitle="Choose the post this automation watches." />
              <div className="ml-11">
                {loadingMedia ? <p className="text-sm text-muted-foreground">Loading posts...</p>
                : media.length === 0 ? <p className="text-sm text-muted-foreground">No posts found.</p>
                : (
                  <div className="grid grid-cols-3 sm:grid-cols-5 gap-2 max-h-64 overflow-y-auto p-1">
                    {media.map((m) => (
                      <button key={m.id} onClick={() => setSelectedPost(m)}
                        className={`relative aspect-square rounded-lg overflow-hidden border-2 transition ${selectedPost?.id === m.id ? 'border-violet-500 ring-2 ring-violet-300' : 'border-transparent hover:border-violet-300'}`}>
                        <img src={m.thumbnail_url || m.media_url} alt="" className="w-full h-full object-cover" />
                        {selectedPost?.id === m.id && <div className="absolute inset-0 bg-violet-500/40 flex items-center justify-center"><CheckCircle2 className="w-7 h-7 text-white" /></div>}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          <div className="space-y-3">
            <SectionHeader icon={Sparkles} step={isDmReply ? '2' : '3'} title={isDmReply ? 'When user sends DM' : 'When user comments'} subtitle="Add the keywords that should trigger this automation." />
            <div className="ml-11 space-y-3">
              <div className="flex items-center gap-2">
                <Input value={kwInput} onChange={(e) => setKwInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addKeyword(); } }}
                  placeholder='e.g. "price"' className="flex-1" />
                <Button type="button" onClick={addKeyword} variant="secondary">Add</Button>
              </div>
              {keywords.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {keywords.map((k) => (
                    <Badge key={k} className="bg-violet-100 text-violet-700 hover:bg-violet-200 pl-3 pr-1 py-1 text-sm">
                      {k}
                      <button onClick={() => setKeywords(keywords.filter(x => x !== k))} className="ml-1 hover:bg-violet-300 rounded-full p-0.5"><X className="w-3 h-3" /></button>
                    </Badge>
                  ))}
                </div>
              )}
              <div className="flex items-center gap-3">
                <Label className="text-sm">Keyword match:</Label>
                <Select value={matchType} onValueChange={setMatchType}>
                  <SelectTrigger className="w-56"><SelectValue /></SelectTrigger>
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
            <div className="ml-11 space-y-2">
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
                <div className="ml-11 rounded-xl border bg-slate-50 p-4 space-y-3">
                  <div className="flex items-center justify-between">
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
                <div className="ml-11 space-y-3">
                  <Textarea value={dmText} onChange={(e) => setDmText(e.target.value)} placeholder="Write the DM..." rows={3} />
                </div>
              </div>
            </>
          )}

          <div className="space-y-3">
            <SectionHeader icon={LinkIcon} step={isDmReply ? '4' : '7'} title="Link Buttons" subtitle="Optional, up to 3 links." />
            <div className="ml-11 space-y-2">
              {buttons.map((b, i) => (
                <div key={i} className="flex items-center gap-2 rounded-lg border p-2 bg-white">
                  <Input value={b.title || ''} onChange={(e) => { const n = [...buttons]; n[i] = { ...n[i], title: e.target.value }; setButtons(n); }} placeholder="Button text" className="flex-1" />
                  <Input value={b.url || ''} onChange={(e) => { const n = [...buttons]; n[i] = { ...n[i], url: e.target.value }; setButtons(n); }} placeholder="https://..." className="flex-[1.5]" />
                  <Button type="button" size="icon" variant="ghost" onClick={() => setButtons(buttons.filter((_, idx) => idx !== i))}><X className="w-4 h-4 text-rose-500" /></Button>
                </div>
              ))}
              {buttons.length < 3 && (
                <Button type="button" size="sm" variant="ghost" onClick={() => setButtons([...buttons, { title: '', url: '' }])} className="text-violet-600">
                  <Plus className="w-3 h-3 mr-1" /> Add link
                </Button>
              )}
            </div>
          </div>

          <div className="space-y-3">
            <SectionHeader icon={Zap} step={isDmReply ? '5' : '8'} title="Name" />
            <div className="ml-11"><Input value={name} onChange={(e) => setName(e.target.value)} placeholder={keywords[0] || 'Automation name'} /></div>
          </div>
        </div>

        <DialogFooter className="px-6 py-4 border-t bg-slate-50 sticky bottom-0">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={save} disabled={saving || !canSave} className="bg-gradient-to-r from-indigo-600 to-violet-600 shadow-lg shadow-violet-500/30">
            {saving ? 'Saving...' : 'Save changes'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AutomationCard({ a, accounts, onToggle, onDelete, onEdit, disabledActions = false }) {
  const acct = accounts.find(x => x.id === a.instagramAccountId);
  const keywords = keywordList(a);
  const isDmReply = a.type === 'dm_reply';
  const accentBorder = isDmReply ? 'border-l-cyan-500' : 'border-l-violet-500';
  const TypeIcon = isDmReply ? Inbox : MessageCircle;
  const typeBadge = isDmReply
    ? <Badge className="bg-cyan-100 text-cyan-700 text-xs">DM Auto-Reply</Badge>
    : <Badge className="bg-violet-100 text-violet-700 text-xs">Comment to DM</Badge>;

  return (
    <Card className={`hover:shadow-md transition-shadow border-l-4 ${accentBorder} bg-white`}>
      <CardContent className="p-5">
        <div className="flex items-start gap-4">
          {!isDmReply && a.postThumbnail ? (
            <img src={a.postThumbnail} alt="" className="w-24 h-24 rounded-xl object-cover flex-shrink-0 ring-2 ring-violet-100" />
          ) : (
            <div className={`w-16 h-16 rounded-xl flex items-center justify-center flex-shrink-0 ${isDmReply ? 'bg-gradient-to-br from-cyan-100 to-blue-100' : 'bg-gradient-to-br from-violet-100 to-fuchsia-100'}`}>
              <TypeIcon className={`w-7 h-7 ${isDmReply ? 'text-cyan-600' : 'text-violet-600'}`} />
            </div>
          )}
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2 mb-3">
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="font-semibold text-lg leading-tight">{a.name || keywords[0] || 'Automation'}</h3>
                  {typeBadge}
                  {acct && <Badge variant="outline" className="text-xs">@{acct.username}</Badge>}
                  {a.postPermalink && <a href={a.postPermalink} target="_blank" rel="noreferrer" className="text-xs text-violet-600 hover:underline inline-flex items-center gap-1">View Post <ExternalLink className="w-3 h-3" /></a>}
                </div>
                <div className="flex items-center gap-2 mt-3 flex-wrap">
                  <span className="text-sm font-medium text-slate-700">{triggerLabel(a)} {matchLabel(a.matchType)}</span>
                  {keywords.slice(0, 5).map(k => <Badge key={k} className="bg-violet-100 text-violet-700 text-sm">{k}</Badge>)}
                </div>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <span className={`text-xs font-medium ${a.isActive ? 'text-emerald-600' : 'text-muted-foreground'}`}>{a.isActive ? 'ON' : 'OFF'}</span>
                <Switch checked={a.isActive} disabled={disabledActions} onCheckedChange={() => onToggle(a)} />
              </div>
            </div>
            <div className="flex items-center justify-between mt-5 border-t pt-3">
              <span className="text-sm font-medium text-slate-600">{runLabel(a.runsCount || 0)}</span>
              <div className="flex items-center gap-2">
                <Button variant="ghost" size="sm" disabled={disabledActions} onClick={() => onEdit(a)} className="text-slate-700 hover:bg-slate-100">
                  <Pencil className="w-4 h-4 mr-1" /> Edit
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
            <Settings className="w-5 h-5 text-violet-600" /> Workspace settings
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
      const res = await fetch('/api/workspaces', { headers: { Authorization: `Bearer ${token}` } });
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
      toast.error(e.message);
    }
  }, [token, selectedWorkspaceId]);

  const refresh = useCallback(async () => {
    if (!token || !selectedWorkspaceId) return;
    try {
      const [a, b] = await Promise.all([
        fetch('/api/instagram/accounts', { headers: scopedHeaders(token, selectedWorkspaceId) }).then(r => r.json()),
        fetch('/api/automations', { headers: scopedHeaders(token, selectedWorkspaceId) }).then(r => r.json()),
      ]);
      setAccounts(a.accounts || []);
      setAutomations(b.automations || []);
    } catch { toast.error('Failed to load data'); }
  }, [token, selectedWorkspaceId]);

  useEffect(() => { if (token) loadWorkspaces(); }, [loadWorkspaces, token]);
  useEffect(() => { if (token && selectedWorkspaceId) refresh(); }, [refresh, token, selectedWorkspaceId]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const workspaceId = params.get('workspaceId');
    if (workspaceId) {
      localStorage.setItem('selectedWorkspaceId', workspaceId);
      setSelectedWorkspaceId(workspaceId);
    }
    if (params.get('ig') === 'success') { toast.success('Instagram account connected!'); window.history.replaceState({}, '', '/dashboard'); loadWorkspaces(workspaceId || ''); refresh(); }
    else if (params.get('ig') === 'error') { toast.error('Connection failed: ' + (params.get('msg') || 'unknown')); window.history.replaceState({}, '', '/dashboard'); }
  }, [loadWorkspaces, refresh]);

  const onLogout = () => {
    localStorage.removeItem('token'); localStorage.removeItem('user');
    toast.success('Logged out'); router.push('/');
  };

  const connectIG = async () => {
    if (!selectedWorkspaceId) { toast.error('Choose a workspace first'); return; }
    if (accounts.length > 0) { toast.error('This workspace already has an Instagram account. Create a new workspace for another account.'); return; }
    setConnecting(true);
    try {
      const res = await fetch('/api/instagram/connect', { headers: scopedHeaders(token, selectedWorkspaceId) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      window.location.href = data.url;
    } catch (e) { toast.error(e.message); setConnecting(false); }
  };

  const toggle = async (a) => {
    const res = await fetch(`/api/automations/${a._id}`, {
      method: 'PUT', headers: scopedHeaders(token, selectedWorkspaceId, { 'Content-Type': 'application/json' }),
      body: JSON.stringify({ isActive: !a.isActive }),
    });
    if (res.ok) { toast.success(`Automation ${!a.isActive ? 'enabled' : 'disabled'}`); refresh(); }
  };
  const remove = async (id) => {
    if (!confirm('Delete this automation?')) return;
    const res = await fetch(`/api/automations/${id}`, { method: 'DELETE', headers: scopedHeaders(token, selectedWorkspaceId) });
    if (res.ok) { toast.success('Deleted'); refresh(); }
  };
  const disconnectAccount = async (id) => {
    if (!confirm('Disconnect this Instagram account? All linked automations will be removed.')) return;
    const res = await fetch(`/api/instagram/accounts/${id}`, { method: 'DELETE', headers: scopedHeaders(token, selectedWorkspaceId) });
    if (res.ok) { toast.success('Disconnected'); await loadWorkspaces(selectedWorkspaceId); refresh(); }
  };

  const selectWorkspace = (id) => {
    setSelectedWorkspaceId(id);
    localStorage.setItem('selectedWorkspaceId', id);
  };

  const createWorkspace = async () => {
    const name = window.prompt('Workspace name', 'New Workspace');
    if (!name || !name.trim()) return;
    const res = await fetch('/api/workspaces', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ name }),
    });
    const data = await res.json();
    if (!res.ok) { toast.error(data.error || 'Failed to create workspace'); return; }
    toast.success('Workspace created');
    await loadWorkspaces(data.workspace.id);
  };

  const renameWorkspace = async (name) => {
    const res = await fetch(`/api/workspaces/${selectedWorkspaceId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ name }),
    });
    const data = await res.json();
    if (!res.ok) { toast.error(data.error || 'Failed to rename workspace'); return; }
    toast.success('Workspace updated');
    await loadWorkspaces(data.workspace.id);
  };

  const setWorkspaceStatus = async (status) => {
    const res = await fetch(`/api/workspaces/${selectedWorkspaceId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ status }),
    });
    const data = await res.json();
    if (!res.ok) { toast.error(data.error || 'Failed to update workspace'); return; }
    toast.success(status === 'active' ? 'Workspace enabled' : 'Workspace disabled');
    await loadWorkspaces(data.workspace.id);
    refresh();
  };

  const deleteWorkspace = async () => {
    const workspace = workspaces.find(w => w.id === selectedWorkspaceId);
    if (!workspace) return;
    if (!confirm(`Permanently delete "${workspace.name}" and all its workspace data?`)) return;
    const res = await fetch(`/api/workspaces/${selectedWorkspaceId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json();
    if (!res.ok) { toast.error(data.error || 'Failed to delete workspace'); return; }
    toast.success('Workspace deleted');
    setShowWorkspaceSettings(false);
    setSelectedWorkspaceId('');
    await loadWorkspaces('');
  };

  if (!token || !user) return null;
  const selectedWorkspace = workspaces.find(w => w.id === selectedWorkspaceId);
  const workspaceActive = (selectedWorkspace?.status || 'active') === 'active';
  const activeCount = automations.filter(a => a.isActive).length;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-violet-50/40 to-indigo-50/40">
      <header className="border-b bg-white/70 backdrop-blur-md sticky top-0 z-20">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <Logo />
          <div className="flex items-center gap-2 md:gap-3">
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
            <div className="hidden md:flex items-center gap-2 text-sm">
              <div className={`w-2 h-2 rounded-full ${workspaceActive ? 'bg-emerald-500 animate-pulse' : 'bg-slate-400'}`}></div>
              <span className="text-muted-foreground">{workspaceActive ? `${activeCount} active` : 'disabled'}</span>
            </div>
            <Button variant="ghost" size="sm" onClick={() => router.push('/analytics')}>
              <BarChart3 className="w-4 h-4 mr-1" /> Analytics
            </Button>
            <span className="text-sm text-muted-foreground hidden sm:inline">{user.username || user.email}</span>
            <Button variant="ghost" size="sm" onClick={onLogout}><LogOut className="w-4 h-4 mr-1" /> Logout</Button>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8 max-w-6xl">
        <div className="sm:hidden mb-4 flex items-center gap-2">
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
          <Button variant="outline" size="icon" onClick={createWorkspace}><Plus className="w-4 h-4" /></Button>
          <Button variant="outline" size="icon" onClick={() => setShowWorkspaceSettings(true)} disabled={!selectedWorkspace}><Settings className="w-4 h-4" /></Button>
        </div>
        {selectedWorkspace && (
          <div className="mb-6 flex items-center justify-between gap-3 rounded-lg border bg-white p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-violet-100 flex items-center justify-center">
                <Briefcase className="w-5 h-5 text-violet-600" />
              </div>
              <div>
                <p className="font-semibold">{selectedWorkspace.name}</p>
                <p className="text-xs text-muted-foreground">
                  {workspaceActive ? 'Active workspace' : 'Disabled workspace. Enable it before connecting accounts or editing automations.'}
                </p>
              </div>
            </div>
            {!workspaceActive && <Badge className="bg-slate-100 text-slate-600">Disabled</Badge>}
          </div>
        )}
        <div className="grid grid-cols-2 md:grid-cols-2 gap-4 mb-10">
          <Card className="border-0 shadow-sm bg-gradient-to-br from-violet-500 to-fuchsia-500 text-white">
            <CardContent className="p-5"><p className="text-xs opacity-80 mb-1">Total Automations</p><p className="text-3xl font-bold">{automations.length}</p></CardContent>
          </Card>
          <Card className="border-0 shadow-sm bg-gradient-to-br from-emerald-500 to-teal-500 text-white">
            <CardContent className="p-5"><p className="text-xs opacity-80 mb-1">Active Now</p><p className="text-3xl font-bold">{activeCount}</p></CardContent>
          </Card>
        </div>

        <section className="mb-10">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-bold flex items-center gap-2"><Instagram className="w-5 h-5 text-violet-600" /> Connected Accounts</h2>
            <Button onClick={connectIG} disabled={connecting || !workspaceActive || accounts.length > 0} className="bg-gradient-to-r from-indigo-600 to-violet-600 shadow-lg shadow-violet-500/30">
              <Plus className="w-4 h-4 mr-2" /> {connecting ? 'Redirecting...' : accounts.length > 0 ? 'Account connected' : 'Connect Instagram'}
            </Button>
          </div>
          {accounts.length === 0 ? (
            <Card className="border-dashed">
              <CardContent className="py-12 text-center">
                <Instagram className="w-12 h-12 mx-auto text-muted-foreground mb-3" />
                <p className="text-muted-foreground mb-4">No Instagram accounts connected yet.</p>
                <Button onClick={connectIG} disabled={connecting || !workspaceActive} className="bg-gradient-to-r from-indigo-600 to-violet-600">Connect Your First Account</Button>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {accounts.map((a) => (
                <Card key={a.id} className="hover:shadow-lg transition-shadow">
                  <CardContent className="p-5 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 rounded-full bg-gradient-to-tr from-fuchsia-500 via-violet-500 to-indigo-500 flex items-center justify-center shadow-md">
                        {a.pfp ? (
                          <img src={a.pfp} alt={a.username} className="w-full h-full object-cover rounded-full" />
                        ) : (
                          <Instagram className="w-6 h-6 text-white" />
                        )}
                      </div>
                      <div><p className="font-semibold">@{a.username}</p></div>
                    </div>
                    <div className="flex items-center gap-1">
                      <Button variant="ghost" size="icon" title="Disconnect" disabled={!workspaceActive} onClick={() => disconnectAccount(a.id)}><Trash2 className="w-4 h-4 text-rose-500" /></Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </section>

        <section>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-bold flex items-center gap-2"><Zap className="w-5 h-5 text-amber-500" /> Automations</h2>
            {accounts.length > 0 && (
              <Button disabled={!workspaceActive} onClick={() => setShowTypeChooser(true)} className="bg-gradient-to-r from-indigo-600 to-violet-600 shadow-lg shadow-violet-500/30">
                <Plus className="w-4 h-4 mr-2" /> New Automation
              </Button>
            )}
          </div>

          {accounts.length === 0 ? (
            <Card className="border-dashed">
              <CardContent className="py-12 text-center">
                <Sparkles className="w-12 h-12 mx-auto text-muted-foreground mb-3" />
                <p className="text-muted-foreground">Connect an Instagram account first to start creating automations.</p>
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
                <div className="space-y-3">
                  {automations.map((a) => <AutomationCard key={a._id} a={a} accounts={accounts} onToggle={toggle} onDelete={remove} onEdit={setEditingAutomation} disabledActions={!workspaceActive} />)}
                </div>
              )}
            </>
          )}
        </section>
      </main>

      <AutomationTypeDialog
        open={showTypeChooser}
        onOpenChange={setShowTypeChooser}
        onSelect={(type) => {
          setShowTypeChooser(false);
          if (type === 'dm_reply') setShowCreateDmReply(true);
          else setShowCreate(true);
        }}
      />
      <CreateAutomationDialog open={showCreate} onOpenChange={setShowCreate} accounts={accounts} token={token} workspaceId={selectedWorkspaceId} onCreated={() => refresh()} />
      <CreateDmReplyDialog open={showCreateDmReply} onOpenChange={setShowCreateDmReply} accounts={accounts} token={token} workspaceId={selectedWorkspaceId} onCreated={() => refresh()} />
      <EditAutomationDialog automation={editingAutomation} onOpenChange={() => setEditingAutomation(null)} accounts={accounts} token={token} workspaceId={selectedWorkspaceId} onSaved={() => refresh()} />
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
