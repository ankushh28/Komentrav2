import { NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import crypto from 'crypto';
import { getDb } from '@/lib/mongo';
import { hashPassword, comparePassword, signToken, getUserFromRequest } from '@/lib/auth';

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
  const { email, password } = await req.json();
  if (!email || !password) return json({ error: 'email and password required' }, 400);
  const db = await getDb();
  const existing = await db.collection('users').findOne({ email });
  if (existing) return json({ error: 'User already exists' }, 400);
  const user = {
    _id: uuidv4(),
    email,
    password: await hashPassword(password),
    createdAt: new Date(),
  };
  await db.collection('users').insertOne(user);
  const token = signToken({ userId: user._id, email });
  return json({ token, user: { id: user._id, email } });
}

async function handleLogin(req) {
  const { email, password } = await req.json();
  if (!email || !password) return json({ error: 'email and password required' }, 400);
  const db = await getDb();
  const user = await db.collection('users').findOne({ email });
  if (!user) return json({ error: 'Invalid credentials' }, 401);
  const ok = await comparePassword(password, user.password);
  if (!ok) return json({ error: 'Invalid credentials' }, 401);
  const token = signToken({ userId: user._id, email });
  return json({ token, user: { id: user._id, email } });
}

async function handleMe(req) {
  const u = getUserFromRequest(req);
  if (!u) return json({ error: 'Unauthorized' }, 401);
  return json({ user: { id: u.userId, email: u.email } });
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
  // state = userId so we can identify in callback
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
    const igUserId = String(tokenData.user_id);

    // 2) Exchange short -> long-lived (60 days)
    const longUrl = new URL('https://graph.instagram.com/access_token');
    longUrl.searchParams.set('grant_type', 'ig_exchange_token');
    longUrl.searchParams.set('client_secret', META_APP_SECRET);
    longUrl.searchParams.set('access_token', shortToken);
    const longRes = await fetch(longUrl.toString());
    const longData = await longRes.json();
    const accessToken = longData.access_token || shortToken;
    const expiresIn = longData.expires_in || 3600;

    // 3) Fetch user info
    const infoUrl = `https://graph.instagram.com/${API_VERSION}/me?fields=user_id,username,account_type&access_token=${accessToken}`;
    const infoRes = await fetch(infoUrl);
    const info = await infoRes.json();

    const db = await getDb();
    await db.collection('instagram_accounts').findOneAndUpdate(
      { connectedUserId: userId, instagramUserId: igUserId },
      {
        $set: {
          connectedUserId: userId,
          instagramUserId: igUserId,
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
      const subUrl = `https://graph.instagram.com/${API_VERSION}/${igUserId}/subscribed_apps`;
      const subForm = new URLSearchParams();
      subForm.set('subscribed_fields', 'comments,messages,live_comments,message_reactions');
      subForm.set('access_token', accessToken);
      const subRes = await fetch(subUrl, { method: 'POST', body: subForm });
      const subData = await subRes.json();
      console.log('Webhook subscribe result:', subData);
    } catch (e) {
      console.error('Webhook subscribe error', e);
    }

    return NextResponse.redirect(`${BASE_URL}/?ig=success`);
  } catch (e) {
    console.error('OAuth callback exception', e);
    return NextResponse.redirect(`${BASE_URL}/?ig=error&msg=${encodeURIComponent(e.message)}`);
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
    const subUrl = `https://graph.instagram.com/v22.0/me/subscribed_apps`;
    const subForm = new URLSearchParams();
    subForm.set('subscribed_fields', 'comments,messages,live_comments,message_reactions');
    subForm.set('access_token', acct.accessToken);
    const r = await fetch(subUrl, { method: 'POST', body: subForm });
    const d = await r.json();
    console.log('Re-subscribe result', d);
    if (!r.ok) return json({ error: d.error?.message || 'subscribe failed', details: d }, 500);
    return json({ success: true, data: d });
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

// ----------- AUTOMATIONS -----------
async function handleCreateAutomation(req) {
  const u = getUserFromRequest(req);
  if (!u) return json({ error: 'Unauthorized' }, 401);
  const body = await req.json();
  const {
    instagramAccountId, postId, postPermalink, postThumbnail,
    keywords, matchType, replyMessages, dmText, dmButtons,
    askToFollow, followMessage, igUsername, name,
  } = body;
  const cleanKeywords = Array.isArray(keywords) ? keywords.map(k => String(k).toLowerCase().trim()).filter(Boolean) : [];
  const cleanReplies = Array.isArray(replyMessages) ? replyMessages.map(s => String(s).trim()).filter(Boolean).slice(0, 3) : [];
  const cleanButtons = Array.isArray(dmButtons) ? dmButtons.filter(b => b && b.title && b.url).slice(0, 3) : [];
  if (!instagramAccountId || !postId || cleanKeywords.length === 0 || cleanReplies.length === 0 || !dmText) {
    return json({ error: 'Missing fields. Need at least 1 keyword, 1 reply variant and a DM message.' }, 400);
  }
  const db = await getDb();
  const doc = {
    _id: uuidv4(),
    userId: u.userId,
    instagramAccountId,
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
    igUsername: igUsername || null,
    isActive: true,
    createdAt: new Date(),
    // legacy fields for back-compat
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

async function handleWebhookEvent(req) {
  const rawBody = await req.text();
  let body;
  try {
    body = JSON.parse(rawBody);
  } catch (e) {
    return new NextResponse('bad json', { status: 400 });
  }
  console.log('Webhook event:', JSON.stringify(body));

  const db = await getDb();
  await db.collection('webhook_events').insertOne({ _id: uuidv4(), receivedAt: new Date(), payload: body });

  // Acknowledge immediately spec, but process inline since simple MVP
  try {
    if (body.object === 'instagram' && Array.isArray(body.entry)) {
      for (const entry of body.entry) {
        const igUserId = String(entry.id);
        const changes = entry.changes || [];
        for (const change of changes) {
          if (change.field === 'comments') {
            const v = change.value || {};
            const commentText = (v.text || '').toLowerCase();
            const commentId = v.id;
            const mediaId = v.media?.id || v.media_id;
            const fromId = v.from?.id;
            if (!commentId || !mediaId) continue;

            // Find automations by postId directly — this avoids IG-ID-format mismatches
            // between OAuth-returned user_id and webhook entry.id.
            const automations = await db.collection('automations').find({
              postId: mediaId,
              isActive: true,
            }).toArray();

            if (automations.length === 0) {
              console.log('No automation found for media', mediaId);
              continue;
            }

            // Load the IG account linked to the first matched automation (all should share account)
            const acct = await db.collection('instagram_accounts').findOne({ _id: automations[0].instagramAccountId });
            if (!acct) {
              console.log('IG account record missing for automation', automations[0]._id);
              continue;
            }

            // Opportunistically save the webhook-style business account ID for future use
            if (acct.instagramBusinessAccountId !== igUserId) {
              await db.collection('instagram_accounts').updateOne(
                { _id: acct._id },
                { $set: { instagramBusinessAccountId: igUserId } }
              );
            }
            for (const auto of automations) {
              const keywords = (auto.keywords && auto.keywords.length) ? auto.keywords : (auto.triggerWord ? [auto.triggerWord] : []);
              const matchType = auto.matchType || 'contains';
              if (matchesKeyword(commentText, keywords, matchType)) {
                console.log(`Matched keywords ${JSON.stringify(keywords)} (${matchType}) on comment '${commentText}'`);
                // Pick random reply variant
                const replies = (auto.replyMessages && auto.replyMessages.length) ? auto.replyMessages : [auto.replyMessage];
                const reply = replies[Math.floor(Math.random() * replies.length)];
                const r1 = await replyToComment(acct.accessToken, commentId, reply);
                console.log('Reply result', r1);

                // Branch: askToFollow → send a single follow-prompt with postback button.
                // Else → send the main DM straight away.
                let rDM = null;
                if (auto.askToFollow) {
                  rDM = await sendFollowPrompt(
                    acct.accessToken,
                    { comment_id: commentId },
                    auto.followMessage || `Follow @${acct.username} first to unlock 🎁`,
                    auto.followButtonText || 'I Followed ✓',
                    auto._id,
                    acct.username,
                  );
                  console.log('Follow-prompt sent:', rDM);
                } else {
                  const dmText = auto.dmText || auto.dmMessage || '';
                  const buttons = Array.isArray(auto.dmButtons) ? auto.dmButtons.filter(b => b.title && b.url).slice(0, 3) : [];
                  if (buttons.length > 0) {
                    rDM = await sendDMButtons(acct.accessToken, { comment_id: commentId }, dmText, buttons);
                  } else {
                    rDM = await sendDMText(acct.accessToken, { comment_id: commentId }, dmText);
                  }
                  console.log('DM result', rDM);
                }

                await db.collection('automation_runs').insertOne({
                  _id: uuidv4(),
                  automationId: auto._id,
                  commentId,
                  fromUserId: fromId,
                  commentText: v.text,
                  replyUsed: reply,
                  replyResult: r1,
                  dmResult: rDM,
                  flow: auto.askToFollow ? 'follow-gated' : 'direct',
                  ranAt: new Date(),
                });
              }
            }
          }
        }

        // Handle messaging events (postback from "I Followed" button)
        const messaging = entry.messaging || [];
        for (const msg of messaging) {
          if (msg.postback?.payload?.startsWith('RP_FOLLOW:')) {
            const automationId = msg.postback.payload.slice('RP_FOLLOW:'.length);
            const senderId = msg.sender?.id;
            if (!senderId) continue;

            const auto = await db.collection('automations').findOne({ _id: automationId });
            if (!auto || !auto.isActive) {
              console.log('Postback automation not found or inactive', automationId);
              continue;
            }
            const acct = await db.collection('instagram_accounts').findOne({ _id: auto.instagramAccountId });
            if (!acct) continue;

            const dmText = auto.dmText || auto.dmMessage || '';
            const buttons = Array.isArray(auto.dmButtons) ? auto.dmButtons.filter(b => b.title && b.url).slice(0, 3) : [];
            let rDM;
            if (buttons.length > 0) {
              rDM = await sendDMButtons(acct.accessToken, { id: senderId }, dmText, buttons);
            } else {
              rDM = await sendDMText(acct.accessToken, { id: senderId }, dmText);
            }
            console.log('Post-follow DM sent to', senderId, ':', rDM);

            await db.collection('automation_runs').insertOne({
              _id: uuidv4(),
              automationId: auto._id,
              fromUserId: senderId,
              dmResult: rDM,
              flow: 'follow-confirmed',
              ranAt: new Date(),
            });
          }
        }
      }
    }
  } catch (e) {
    console.error('webhook processing error', e);
  }

  return new NextResponse('EVENT_RECEIVED', { status: 200 });
}

// ----------- DISPATCHER -----------
async function dispatch(req, params, method) {
  const path = getPath(params);
  // health
  if (path === '/' || path === '/health') return json({ ok: true });

  // Auth
  if (path === '/auth/signup' && method === 'POST') return handleSignup(req);
  if (path === '/auth/login' && method === 'POST') return handleLogin(req);
  if (path === '/auth/me' && method === 'GET') return handleMe(req);

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
