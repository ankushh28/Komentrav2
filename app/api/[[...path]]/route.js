import { NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import crypto from 'crypto';
import { getDb } from '@/lib/mongo';
import { hashPassword, comparePassword, signToken, getUserFromRequest } from '@/lib/auth';
import { sendOtpEmail, generateOtp, sendPasswordResetOtpEmail } from '@/lib/email';
import { getQueue } from '@/lib/queue';

const META_APP_ID = process.env.META_APP_ID;
const META_APP_SECRET = process.env.META_APP_SECRET;
const VERIFY_TOKEN = process.env.WEBHOOK_VERIFY_TOKEN || 'test';
const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL;
const API_VERSION = process.env.META_API_VERSION || 'v23.0';
const REDIRECT_URI = `${BASE_URL}/api/instagram/callback`;

function json(data, status = 200) {
  return NextResponse.json(data, { status });
}

function getPath(params) {
  return '/' + (params?.path?.join('/') || '');
}

// ----------- AUTH HANDLERS -----------
async function handleSignup(req) {
  const { email, password, username } = await req.json();
  if (!email || !password || !username) return json({ error: 'username, email and password required' }, 400);
  const db = await getDb();
  const existing = await db.collection('users').findOne({ email });
  if (existing && existing.emailVerified) return json({ error: 'User already exists' }, 400);

  const otp = generateOtp();
  const otpExpiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 min

  if (existing && !existing.emailVerified) {
    // Allow resending OTP for unverified accounts
    await db.collection('users').updateOne(
      { _id: existing._id },
      { $set: { username, password: await hashPassword(password), otp, otpExpiresAt, updatedAt: new Date() } },
    );
  } else {
    const user = {
      _id: uuidv4(),
      username,
      email,
      password: await hashPassword(password),
      emailVerified: false,
      otp,
      otpExpiresAt,
      createdAt: new Date(),
    };
    await db.collection('users').insertOne(user);
  }

  try {
    const r = await sendOtpEmail(email, otp, username);
    console.log('OTP email sent:', r?.data?.id || r);
  } catch (e) {
    console.error('Failed to send OTP email', e);
    return json({ error: 'Failed to send verification email. Please try again.' }, 500);
  }
  return json({ needsVerification: true, email });
}

async function handleVerifyOtp(req) {
  const { email, otp } = await req.json();
  if (!email || !otp) return json({ error: 'email and otp required' }, 400);
  const db = await getDb();
  const user = await db.collection('users').findOne({ email });
  if (!user) return json({ error: 'User not found' }, 404);
  if (user.emailVerified) return json({ error: 'Already verified. Please log in.' }, 400);
  if (!user.otp || user.otp !== otp) return json({ error: 'Invalid code' }, 400);
  if (new Date(user.otpExpiresAt) < new Date()) return json({ error: 'Code expired. Resend a new one.' }, 400);

  await db.collection('users').updateOne(
    { _id: user._id },
    { $set: { emailVerified: true }, $unset: { otp: '', otpExpiresAt: '' } },
  );
  const token = signToken({ userId: user._id, email: user.email, username: user.username });
  return json({ token, user: { id: user._id, email: user.email, username: user.username } });
}

async function handleResendOtp(req) {
  const { email } = await req.json();
  if (!email) return json({ error: 'email required' }, 400);
  const db = await getDb();
  const user = await db.collection('users').findOne({ email });
  if (!user) return json({ error: 'User not found' }, 404);
  if (user.emailVerified) return json({ error: 'Already verified' }, 400);

  const otp = generateOtp();
  const otpExpiresAt = new Date(Date.now() + 10 * 60 * 1000);
  await db.collection('users').updateOne({ _id: user._id }, { $set: { otp, otpExpiresAt } });
  try { await sendOtpEmail(email, otp, user.username); } catch (e) { return json({ error: 'Failed to send' }, 500); }
  return json({ sent: true });
}

async function handleLogin(req) {
  const { email, password } = await req.json();
  if (!email || !password) return json({ error: 'email and password required' }, 400);
  const db = await getDb();
  const user = await db.collection('users').findOne({ email });
  if (!user) return json({ error: 'Invalid credentials' }, 401);
  const ok = await comparePassword(password, user.password);
  if (!ok) return json({ error: 'Invalid credentials' }, 401);
  if (!user.emailVerified) return json({ error: 'Please verify your email first', needsVerification: true, email }, 403);
  const token = signToken({ userId: user._id, email: user.email, username: user.username });
  return json({ token, user: { id: user._id, email: user.email, username: user.username } });
}

async function handleMe(req) {
  const u = getUserFromRequest(req);
  if (!u) return json({ error: 'Unauthorized' }, 401);
  return json({ user: { id: u.userId, email: u.email, username: u.username } });
}

// ----------- INSTAGRAM OAUTH -----------
function buildAuthUrl(state) {
  const scopes = [
    'instagram_business_basic',
    'instagram_business_manage_messages',
    'instagram_business_manage_comments',
    'instagram_business_content_publish',
  ].join(',');
  const url = new URL('https://www.instagram.com/oauth/authorize');
  url.searchParams.set('enable_fb_login', '0');
  url.searchParams.set('force_authentication', '1');
  url.searchParams.set('client_id', META_APP_ID);
  url.searchParams.set('redirect_uri', REDIRECT_URI);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', scopes);
  url.searchParams.set('state', state);
  return url.toString();
}

async function handleConnect(req) {
  const u = getUserFromRequest(req);
  if (!u) return json({ error: 'Unauthorized' }, 401);
    const state = Buffer.from(JSON.stringify({ userId: u.userId, n: Date.now() })).toString('base64url');
  return json({ url: buildAuthUrl(state) });
}

async function handleCallback(req) {
  const url = new URL(req.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const errParam = url.searchParams.get('error');
  if (errParam) {
    return NextResponse.redirect(`${BASE_URL}/?ig=error&msg=${encodeURIComponent(errParam)}`);
  }
  if (!code || !state) {
    return NextResponse.redirect(`${BASE_URL}/?ig=error&msg=missing_code`);
  }
  let parsed;
  try {
    parsed = JSON.parse(Buffer.from(state, 'base64url').toString());
  } catch (e) {
    return NextResponse.redirect(`${BASE_URL}/?ig=error&msg=bad_state`);
  }
  const userId = parsed.userId;

  try {
    // 1) Exchange code for short-lived token
    const form = new URLSearchParams();
    form.set('client_id', META_APP_ID);
    form.set('client_secret', META_APP_SECRET);
    form.set('grant_type', 'authorization_code');
    form.set('redirect_uri', REDIRECT_URI);
    form.set('code', code);
    const tokenRes = await fetch('https://api.instagram.com/oauth/access_token', {
      method: 'POST',
      body: form,
    });
    const tokenData = await tokenRes.json();
    if (!tokenRes.ok || !tokenData.access_token) {
      console.error('Token exchange failed', tokenData);
      return NextResponse.redirect(`${BASE_URL}/?ig=error&msg=${encodeURIComponent(JSON.stringify(tokenData))}`);
    }
    const shortToken = tokenData.access_token;
    const tokenUserId = String(tokenData.user_id);

    // 2) Exchange short -> long-lived (60 days)
    const longUrl = new URL('https://graph.instagram.com/access_token');
    longUrl.searchParams.set('grant_type', 'ig_exchange_token');
    longUrl.searchParams.set('client_secret', META_APP_SECRET);
    longUrl.searchParams.set('access_token', shortToken);
    const longRes = await fetch(longUrl.toString());
    const longData = await longRes.json();
    const accessToken = longData.access_token || shortToken;
    const expiresIn = longData.expires_in || 3600;

    // 3) Fetch user info — get BOTH user_id (app-scoped) and id (page-scoped, used in webhooks)
    const infoUrl = `https://graph.instagram.com/${API_VERSION}/me?fields=user_id,id,username,account_type&access_token=${accessToken}`;
    const infoRes = await fetch(infoUrl);
    const info = await infoRes.json();
    const instagramUserId = String(info.user_id || info.id || tokenUserId);
    const appScopedUserId = String(info.id || tokenUserId);

    const db = await getDb();
    await db.collection('instagram_accounts').findOneAndUpdate(
      {
        connectedUserId: userId,
        $or: [
          { instagramUserId },
          { instagramUserId: tokenUserId },
          { instagramBusinessAccountId: instagramUserId },
          { instagramBusinessAccountId: tokenUserId },
          { instagramAppScopedUserId: appScopedUserId },
          { instagramTokenUserId: tokenUserId },
        ],
      },
      {
        $set: {
          connectedUserId: userId,
          instagramUserId,
          instagramBusinessAccountId: instagramUserId,
          instagramAppScopedUserId: appScopedUserId,
          instagramTokenUserId: tokenUserId,
          instagramWebhookIds: [instagramUserId, info.id, tokenUserId].filter(Boolean).map(String),
          username: info.username || 'unknown',
          accountType: info.account_type || null,
          accessToken,
          tokenExpiry: new Date(Date.now() + expiresIn * 1000),
          updatedAt: new Date(),
        },
        $setOnInsert: { _id: uuidv4(), createdAt: new Date() },
      },
      { upsert: true }
    );

    // 4) Subscribe app to webhooks for this user
    try {
      const subUrl = `https://graph.instagram.com/${API_VERSION}/${instagramUserId}/subscribed_apps`;
      const subForm = new URLSearchParams();
      subForm.set('subscribed_fields', 'comments,messages,live_comments,message_reactions');
      subForm.set('access_token', accessToken);
      const subRes = await fetch(subUrl, { method: 'POST', body: subForm });
      const subData = await subRes.json();
      console.log('Webhook subscribe result:', subData);
    } catch (e) {
      console.error('Webhook subscribe error', e);
    }

    return NextResponse.redirect(`${BASE_URL}/dashboard?ig=success`);
  } catch (e) {
    console.error('OAuth callback exception', e);
    return NextResponse.redirect(`${BASE_URL}/dashboard?ig=error&msg=${encodeURIComponent(e.message)}`);
  }
}

async function handleListAccounts(req) {
  const u = getUserFromRequest(req);
  if (!u) return json({ error: 'Unauthorized' }, 401);
  const db = await getDb();
  const list = await db.collection('instagram_accounts').find({ connectedUserId: u.userId }).toArray();
  return json({ accounts: list.map(a => ({
    id: a._id,
    instagramUserId: a.instagramUserId,
    username: a.username,
    accountType: a.accountType,
    tokenExpiry: a.tokenExpiry,
  })) });
}

async function handleDisconnect(req, accountId) {
  const u = getUserFromRequest(req);
  if (!u) return json({ error: 'Unauthorized' }, 401);
  const db = await getDb();
  await db.collection('instagram_accounts').deleteOne({ _id: accountId, connectedUserId: u.userId });
  await db.collection('automations').deleteMany({ userId: u.userId, instagramAccountId: accountId });
  return json({ success: true });
}

async function handleResubscribe(req, accountId) {
  const u = getUserFromRequest(req);
  if (!u) return json({ error: 'Unauthorized' }, 401);
  const db = await getDb();
  const acct = await db.collection('instagram_accounts').findOne({ _id: accountId, connectedUserId: u.userId });
  if (!acct) return json({ error: 'Account not found' }, 404);
  try {
    const infoUrl = `https://graph.instagram.com/${API_VERSION}/me?fields=user_id,id,username,account_type&access_token=${encodeURIComponent(acct.accessToken)}`;
    const infoRes = await fetch(infoUrl);
    const info = await infoRes.json();
    if (!infoRes.ok) return json({ error: info.error?.message || 'failed to refresh account identity', details: info }, 500);

    const instagramUserId = String(info.user_id || info.id || acct.instagramUserId);
    const appScopedUserId = String(info.id || acct.instagramAppScopedUserId || acct.instagramUserId);
    await db.collection('instagram_accounts').updateOne(
      { _id: accountId, connectedUserId: u.userId },
      {
        $set: {
          instagramUserId,
          instagramBusinessAccountId: instagramUserId,
          instagramAppScopedUserId: appScopedUserId,
          username: info.username || acct.username,
          accountType: info.account_type || acct.accountType || null,
          updatedAt: new Date(),
        },
        $addToSet: {
          instagramWebhookIds: {
            $each: [instagramUserId, info.id, acct.instagramUserId, acct.instagramBusinessAccountId].filter(Boolean).map(String),
          },
        },
      },
    );

    const subUrl = `https://graph.instagram.com/${API_VERSION}/${instagramUserId}/subscribed_apps`;
    const subForm = new URLSearchParams();
    subForm.set('subscribed_fields', 'comments,messages,live_comments,message_reactions');
    subForm.set('access_token', acct.accessToken);
    const r = await fetch(subUrl, { method: 'POST', body: subForm });
    const d = await r.json();
    console.log('Re-subscribe result', { instagramUserId, data: d });
    if (!r.ok) return json({ error: d.error?.message || 'subscribe failed', details: d }, 500);
    return json({ success: true, instagramUserId, data: d });
  } catch (e) {
    return json({ error: e.message }, 500);
  }
}

async function handleCheckSubscription(req, accountId) {
  const u = getUserFromRequest(req);
  if (!u) return json({ error: 'Unauthorized' }, 401);
  const db = await getDb();
  const acct = await db.collection('instagram_accounts').findOne({ _id: accountId, connectedUserId: u.userId });
  if (!acct) return json({ error: 'Account not found' }, 404);
  const url = `https://graph.instagram.com/v22.0/me/subscribed_apps?access_token=${encodeURIComponent(acct.accessToken)}`;
  const r = await fetch(url);
  const d = await r.json();
  return json({ status: r.status, data: d });
}

async function handleListMedia(req) {
  const u = getUserFromRequest(req);
  if (!u) return json({ error: 'Unauthorized' }, 401);
  const url = new URL(req.url);
  const accountId = url.searchParams.get('accountId');
  if (!accountId) return json({ error: 'accountId required' }, 400);
  const db = await getDb();
  const acct = await db.collection('instagram_accounts').findOne({ _id: accountId, connectedUserId: u.userId });
  if (!acct) return json({ error: 'Account not found' }, 404);
  try {
    const mediaUrl = `https://graph.instagram.com/v22.0/me/media?fields=id,caption,media_type,media_url,thumbnail_url,permalink,timestamp&limit=25&access_token=${encodeURIComponent(acct.accessToken)}`;
    const r = await fetch(mediaUrl);
    const d = await r.json();
    console.log('IG media response', r.status, JSON.stringify(d).slice(0, 500));
    if (!r.ok) {
      return json({ error: d.error?.message || 'failed to fetch media', details: d }, 500);
    }
    return json({ media: d.data || [] });
  } catch (e) {
    console.error('media fetch error', e);
    return json({ error: e.message }, 500);
  }
}

// Helper to remove surrounding quotes from keywords (handles JSON-encoded strings)
function stripQuotes(str) {
  let s = String(str || '').trim();
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
    s = s.slice(1, -1);
  }
  return s.replace(/\\"/g, '"').replace(/\\'/g, "'");
}

// ----------- AUTOMATIONS -----------
async function handleCreateAutomation(req) {
  const u = getUserFromRequest(req);
  if (!u) return json({ error: 'Unauthorized' }, 401);
  const body = await req.json();
  const type = body.type === 'dm_reply' ? 'dm_reply' : 'comment_dm';
  const db = await getDb();

  if (type === 'dm_reply') {
    const { instagramAccountId, keywords, matchType, replyMessages, replyButtons, name, igUsername } = body;
    const cleanKeywords = Array.isArray(keywords) ? keywords.map(k => stripQuotes(String(k)).toLowerCase().trim()).filter(Boolean) : [];
    const cleanReplies = Array.isArray(replyMessages) ? replyMessages.map(s => String(s).trim()).filter(Boolean).slice(0, 3) : [];
    const cleanButtons = Array.isArray(replyButtons) ? replyButtons.filter(b => b && b.title && b.url).slice(0, 3) : [];
    if (!instagramAccountId || cleanKeywords.length === 0 || cleanReplies.length === 0) {
      return json({ error: 'Need an account, at least 1 keyword, and 1 reply variant.' }, 400);
    }
    const doc = {
      _id: uuidv4(),
      userId: u.userId,
      instagramAccountId,
      type: 'dm_reply',
      name: name || cleanKeywords[0],
      keywords: cleanKeywords,
      matchType: ['exact', 'contains', 'starts_with'].includes(matchType) ? matchType : 'contains',
      replyMessages: cleanReplies,
      replyButtons: cleanButtons,
      igUsername: igUsername || null,
      isActive: true,
      createdAt: new Date(),
    };
    await db.collection('automations').insertOne(doc);
    return json({ automation: doc });
  }

  const {
    instagramAccountId, postId, postPermalink, postThumbnail,
    keywords, matchType, replyMessages, dmText, dmButtons,
    askToFollow, followMessage, followButtonText, igUsername, name,
  } = body;
  const cleanKeywords = Array.isArray(keywords) ? keywords.map(k => stripQuotes(String(k)).toLowerCase().trim()).filter(Boolean) : [];
  const cleanReplies = Array.isArray(replyMessages) ? replyMessages.map(s => String(s).trim()).filter(Boolean).slice(0, 3) : [];
  const cleanButtons = Array.isArray(dmButtons) ? dmButtons.filter(b => b && b.title && b.url).slice(0, 3) : [];
  if (!instagramAccountId || !postId || cleanKeywords.length === 0 || cleanReplies.length === 0 || !dmText) {
    return json({ error: 'Missing fields. Need at least 1 keyword, 1 reply variant and a DM message.' }, 400);
  }
  const doc = {
    _id: uuidv4(),
    userId: u.userId,
    instagramAccountId,
    type: 'comment_dm',
    postId,
    postPermalink: postPermalink || null,
    postThumbnail: postThumbnail || null,
    name: name || cleanKeywords[0],
    keywords: cleanKeywords,
    matchType: ['exact', 'contains', 'starts_with'].includes(matchType) ? matchType : 'contains',
    replyMessages: cleanReplies,
    dmText: String(dmText),
    dmButtons: cleanButtons,
    askToFollow: !!askToFollow,
    followMessage: askToFollow ? (followMessage || `Follow @${igUsername || ''} first to unlock this!`) : null,
    followButtonText: askToFollow ? (followButtonText || 'I Followed ✓') : null,
    igUsername: igUsername || null,
    isActive: true,
    createdAt: new Date(),
    triggerWord: cleanKeywords[0],
    replyMessage: cleanReplies[0],
    dmMessage: String(dmText),
  };
  await db.collection('automations').insertOne(doc);
  return json({ automation: doc });
}

async function handleListAutomations(req) {
  const u = getUserFromRequest(req);
  if (!u) return json({ error: 'Unauthorized' }, 401);
  const db = await getDb();
  const list = await db.collection('automations').find({ userId: u.userId }).sort({ createdAt: -1 }).toArray();
  return json({ automations: list });
}

async function handleUpdateAutomation(req, id) {
  const u = getUserFromRequest(req);
  if (!u) return json({ error: 'Unauthorized' }, 401);
  const body = await req.json();
  const update = {};
  if (typeof body.isActive === 'boolean') update.isActive = body.isActive;
  if (body.triggerWord) update.triggerWord = body.triggerWord.toLowerCase().trim();
  if (body.replyMessage) update.replyMessage = body.replyMessage;
  if (body.dmMessage) update.dmMessage = body.dmMessage;
  const db = await getDb();
  await db.collection('automations').updateOne({ _id: id, userId: u.userId }, { $set: update });
  const doc = await db.collection('automations').findOne({ _id: id, userId: u.userId });
  return json({ automation: doc });
}

async function handleDeleteAutomation(req, id) {
  const u = getUserFromRequest(req);
  if (!u) return json({ error: 'Unauthorized' }, 401);
  const db = await getDb();
  await db.collection('automations').deleteOne({ _id: id, userId: u.userId });
  return json({ success: true });
}

// ----------- WEBHOOK -----------
async function handleWebhookVerify(req) {
  const url = new URL(req.url);
  const mode = url.searchParams.get('hub.mode');
  const token = url.searchParams.get('hub.verify_token');
  const challenge = url.searchParams.get('hub.challenge');
  if (mode === 'subscribe' && token === VERIFY_TOKEN) {
    return new NextResponse(challenge, { status: 200 });
  }
  return new NextResponse('forbidden', { status: 403 });
}

async function replyToComment(accessToken, commentId, message) {
  const url = `https://graph.instagram.com/${API_VERSION}/${commentId}/replies`;
  const form = new URLSearchParams();
  form.set('message', message);
  form.set('access_token', accessToken);
  const r = await fetch(url, { method: 'POST', body: form });
  const d = await r.json();
  return { ok: r.ok, data: d };
}

async function sendDMText(accessToken, recipient, message) {
  // recipient = { comment_id } for first reply (private reply window) OR { id } once user is in active conversation
  const url = `https://graph.instagram.com/v22.0/me/messages?access_token=${encodeURIComponent(accessToken)}`;
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      recipient,
      message: { text: message },
    }),
  });
  const d = await r.json();
  return { ok: r.ok, data: d };
}

async function sendDMButtons(accessToken, recipient, text, buttons) {
  const url = `https://graph.instagram.com/v22.0/me/messages?access_token=${encodeURIComponent(accessToken)}`;
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      recipient,
      message: {
        attachment: {
          type: 'template',
          payload: {
            template_type: 'button',
            text,
            buttons: buttons.map(b => ({ type: 'web_url', url: b.url, title: b.title })),
          },
        },
      },
    }),
  });
  const d = await r.json();
  return { ok: r.ok, data: d };
}

// Send a "Follow first" prompt with a postback button. When user taps "I Followed ✓",
// Instagram will deliver a messaging.postback webhook back to us with our payload.
async function sendFollowPrompt(accessToken, recipient, text, buttonTitle, automationId, igUsername) {
  const url = `https://graph.instagram.com/v22.0/me/messages?access_token=${encodeURIComponent(accessToken)}`;
  const buttons = [];
  if (igUsername) {
    buttons.push({ type: 'web_url', url: `https://instagram.com/${igUsername}`, title: `Open @${igUsername}` });
  }
  buttons.push({ type: 'postback', title: buttonTitle || 'I Followed ✓', payload: `RP_FOLLOW:${automationId}` });

  const r = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      recipient,
      message: {
        attachment: {
          type: 'template',
          payload: {
            template_type: 'button',
            text,
            buttons,
          },
        },
      },
    }),
  });
  const d = await r.json();
  return { ok: r.ok, data: d };
}

function matchesKeyword(text, keywords, matchType) {
  const t = (text || '').toLowerCase().trim();
  return keywords.some(k => {
    const kw = String(k).toLowerCase().trim();
    if (!kw) return false;
    if (matchType === 'exact') return t === kw;
    if (matchType === 'starts_with') return t.startsWith(kw);
    return t.includes(kw);
  });
}

// Instagram User Profile API — verifies if the IG user (igsid) follows the connected business account.
// Requires `instagram_business_manage_messages` scope (we have it).
async function checkUserFollowsBusiness(accessToken, igsid) {
  const url = `https://graph.instagram.com/v22.0/${igsid}?fields=is_user_follow_business,follower_count,name,username&access_token=${encodeURIComponent(accessToken)}`;
  try {
    const r = await fetch(url);
    const d = await r.json();
    return { ok: r.ok, isFollowing: d.is_user_follow_business === true, raw: d };
  } catch (e) {
    return { ok: false, isFollowing: false, error: e.message };
  }
}

async function sendDM(accessToken, igUserId, recipientId, message) {
  const url = `https://graph.instagram.com/${API_VERSION}/${igUserId}/messages`;
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      recipient: { comment_id: recipientId },
      message: { text: message },
    }),
  });
  const d = await r.json();
  return { ok: r.ok, data: d };
}

function summarizeWebhook(body) {
  const entries = Array.isArray(body?.entry) ? body.entry : [];
  return {
    object: body?.object || null,
    entries: entries.length,
    entryIds: entries.map(e => e.id).filter(Boolean),
    changes: entries.reduce((sum, e) => sum + (Array.isArray(e.changes) ? e.changes.length : 0), 0),
    messaging: entries.reduce((sum, e) => sum + (Array.isArray(e.messaging) ? e.messaging.length : 0), 0),
    recipientIds: entries.flatMap(e => (e.messaging || []).map(m => m.recipient?.id)).filter(Boolean),
    changeFields: entries.flatMap(e => (e.changes || []).map(c => c.field)).filter(Boolean),
  };
}

async function handleWebhookEvent(req) {
  const rawBody = await req.text();
  let body;
  try { body = JSON.parse(rawBody); } catch (e) { return new NextResponse('bad json', { status: 400 }); }
  const summary = summarizeWebhook(body);
  console.log('[webhook] event received', JSON.stringify(summary));

  // Best-effort raw archive (non-blocking)
  try {
    const db = await getDb();
    db.collection('webhook_events').insertOne({ _id: uuidv4(), receivedAt: new Date(), payload: body })
      .then(() => console.log('[webhook] archived event'))
      .catch((e) => console.error('[webhook] archive error', e?.message));
  } catch (e) {
    console.error('[webhook] archive setup error', e?.message);
  }

  // Push to BullMQ for async processing — return 200 immediately to Meta
  try {
    const q = getQueue();
    const jobId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const job = await q.add('event', body, { jobId });
    console.log('[webhook] enqueued event', JSON.stringify({ jobId: job.id, ...summary }));
  } catch (e) {
    console.error('[webhook] queue error', e?.message);
  }

  return new NextResponse('EVENT_RECEIVED', { status: 200 });
}

// ----------- ANALYTICS -----------
async function handleAnalytics(req) {
  const u = getUserFromRequest(req);
  if (!u) return json({ error: 'Unauthorized' }, 401);
  const db = await getDb();

  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const allRuns = await db.collection('automation_runs').find({ userId: u.userId }).toArray();
  const recent = allRuns.filter(r => r.ranAt && new Date(r.ranAt) >= since);
  const automations = await db.collection('automations').find({ userId: u.userId }).toArray();
  const accounts = await db.collection('instagram_accounts').find({ connectedUserId: u.userId }).toArray();

  // Daily timeline (last 7 days)
  const days = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - i);
    const next = new Date(d); next.setDate(next.getDate() + 1);
    const count = recent.filter(r => new Date(r.ranAt) >= d && new Date(r.ranAt) < next).length;
    days.push({ date: d.toISOString().slice(0, 10), count });
  }

  // Per automation totals
  const perAutomation = automations.map(a => {
    const runs = allRuns.filter(r => r.automationId === a._id);
    const triggers = runs.filter(r => r.flow === 'direct' || r.flow === 'follow-gated').length;
    const dms = runs.filter(r => r.dmResult?.ok).length;
    const followConfirmed = runs.filter(r => r.flow === 'follow-confirmed').length;
    const lastRun = runs.length ? runs.map(r => new Date(r.ranAt)).sort((a, b) => b - a)[0] : null;
    return {
      id: a._id,
      name: a.name || (a.keywords && a.keywords[0]) || a.triggerWord,
      thumb: a.postThumbnail,
      isActive: a.isActive,
      keywords: a.keywords || (a.triggerWord ? [a.triggerWord] : []),
      triggers, dms, followConfirmed,
      lastRun,
    };
  });

  // Top keywords (from comment matches)
  const kwMap = {};
  recent.forEach(r => {
    const text = (r.commentText || '').toLowerCase();
    const auto = automations.find(a => a._id === r.automationId);
    const kws = auto?.keywords || [];
    kws.forEach(k => { if (text.includes(k)) kwMap[k] = (kwMap[k] || 0) + 1; });
  });
  const topKeywords = Object.entries(kwMap).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([k, c]) => ({ keyword: k, count: c }));

  // Funnel
  const totalTriggers = allRuns.filter(r => ['direct', 'follow-gated'].includes(r.flow)).length;
  const totalReplies = allRuns.filter(r => r.replyResult?.ok).length;
  const totalDMs = allRuns.filter(r => r.dmResult?.ok).length;
  const totalFollowGated = allRuns.filter(r => r.flow === 'follow-gated').length;
  const totalFollowConfirmed = allRuns.filter(r => r.flow === 'follow-confirmed').length;
  const followConvRate = totalFollowGated > 0 ? Math.round((totalFollowConfirmed / totalFollowGated) * 100) : null;

  // Recent matched comments (last 50)
  const recentMatches = allRuns
    .filter(r => r.commentText)
    .sort((a, b) => new Date(b.ranAt) - new Date(a.ranAt))
    .slice(0, 50)
    .map(r => {
      const auto = automations.find(a => a._id === r.automationId);
      return {
        id: r._id,
        commentText: r.commentText,
        automationName: auto?.name || (auto?.keywords && auto.keywords[0]) || 'Automation',
        flow: r.flow,
        ranAt: r.ranAt,
        replyOk: !!r.replyResult?.ok,
        dmOk: !!r.dmResult?.ok,
      };
    });

  return json({
    summary: {
      totals: {
        accounts: accounts.length,
        automations: automations.length,
        activeAutomations: automations.filter(a => a.isActive).length,
        totalTriggers,
        totalReplies,
        totalDMs,
        followConvRate,
      },
      runsLast7Days: recent.length,
    },
    timeline: days,
    perAutomation,
    topKeywords,
    funnel: {
      triggers: totalTriggers,
      replies: totalReplies,
      followGated: totalFollowGated,
      followConfirmed: totalFollowConfirmed,
      dmsSent: totalDMs,
    },
    recentMatches,
  });
}

// ----------- DISPATCHER -----------
async function dispatch(req, params, method) {
  const path = getPath(params);
  // health
  if (path === '/' || path === '/health') return json({ ok: true });

  // Auth
  if (path === '/auth/signup' && method === 'POST') return handleSignup(req);
  if (path === '/auth/verify-otp' && method === 'POST') return handleVerifyOtp(req);
  if (path === '/auth/resend-otp' && method === 'POST') return handleResendOtp(req);
  if (path === '/auth/login' && method === 'POST') return handleLogin(req);
if (path === '/auth/me' && method === 'GET') return handleMe(req);
  if (path === '/auth/forgot-password' && method === 'POST') return handleForgotPassword(req);
  if (path === '/auth/reset-password' && method === 'POST') return handleResetPassword(req);

  // Analytics
  if (path === '/analytics' && method === 'GET') return handleAnalytics(req);

  // Instagram
  if (path === '/instagram/connect' && method === 'GET') return handleConnect(req);
  if (path === '/instagram/callback' && method === 'GET') return handleCallback(req);
  if (path === '/instagram/accounts' && method === 'GET') return handleListAccounts(req);
  if (path === '/instagram/media' && method === 'GET') return handleListMedia(req);
  if (path.startsWith('/instagram/accounts/') && method === 'DELETE') {
    const id = path.split('/')[3];
    return handleDisconnect(req, id);
  }
  if (path.startsWith('/instagram/accounts/') && path.endsWith('/resubscribe') && method === 'POST') {
    const id = path.split('/')[3];
    return handleResubscribe(req, id);
  }
  if (path.startsWith('/instagram/accounts/') && path.endsWith('/subscription') && method === 'GET') {
    const id = path.split('/')[3];
    return handleCheckSubscription(req, id);
  }

  // Automations
  if (path === '/automations' && method === 'POST') return handleCreateAutomation(req);
  if (path === '/automations' && method === 'GET') return handleListAutomations(req);
  if (path.startsWith('/automations/') && method === 'PUT') {
    const id = path.split('/')[2];
    return handleUpdateAutomation(req, id);
  }
  if (path.startsWith('/automations/') && method === 'DELETE') {
    const id = path.split('/')[2];
    return handleDeleteAutomation(req, id);
  }

  // Webhook
  if (path === '/webhook' && method === 'GET') return handleWebhookVerify(req);
  if (path === '/webhook' && method === 'POST') return handleWebhookEvent(req);

  return json({ error: 'Not Found', path }, 404);
}

export async function GET(request, { params }) {
  return dispatch(request, params, 'GET');
}
export async function POST(request, { params }) {
  return dispatch(request, params, 'POST');
}
export async function PUT(request, { params }) {
  return dispatch(request, params, 'PUT');
}
export async function DELETE(request, { params }) {
  return dispatch(request, params, 'DELETE');
}

async function handleForgotPassword(req) {
  const { email } = await req.json();
  if (!email) return json({ error: 'email required' }, 400);
  const db = await getDb();
  const user = await db.collection('users').findOne({ email });
  // Always return success to avoid email enumeration; only send mail if user actually exists & is verified
  if (user && user.emailVerified) {
    const resetOtp = generateOtp();
    const resetOtpExpiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 min
    await db.collection('users').updateOne(
      { _id: user._id },
      { $set: { resetOtp, resetOtpExpiresAt, updatedAt: new Date() } },
    );
    try {
      const r = await sendPasswordResetOtpEmail(email, resetOtp, user.username);
      console.log('Password reset OTP email sent:', r?.data?.id || r);
    } catch (e) {
      console.error('Failed to send password reset email', e);
      return json({ error: 'Failed to send reset email. Please try again.' }, 500);
    }
  }
  return json({ sent: true, email });
}

async function handleResetPassword(req) {
  const { email, otp, newPassword } = await req.json();
  if (!email || !otp || !newPassword) return json({ error: 'email, otp and newPassword required' }, 400);
  if (String(newPassword).length < 6) return json({ error: 'Password must be at least 6 characters' }, 400);
  const db = await getDb();
  const user = await db.collection('users').findOne({ email });
  if (!user) return json({ error: 'Invalid code' }, 400);
  if (!user.resetOtp || user.resetOtp !== otp) return json({ error: 'Invalid code' }, 400);
  if (!user.resetOtpExpiresAt || new Date(user.resetOtpExpiresAt) < new Date()) {
    return json({ error: 'Code expired. Request a new one.' }, 400);
  }

  await db.collection('users').updateOne(
    { _id: user._id },
    {
      $set: { password: await hashPassword(newPassword), emailVerified: true, updatedAt: new Date() },
      $unset: { resetOtp: '', resetOtpExpiresAt: '' },
    },
  );
  const token = signToken({ userId: user._id, email: user.email, username: user.username });
  return json({ token, user: { id: user._id, email: user.email, username: user.username } });
}
