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

let workspaceIndexesPromise;

function cleanWorkspaceName(name) {
  return String(name || '').trim().slice(0, 80) || 'Default Workspace';
}

function publicWorkspace(workspace, extra = {}) {
  return {
    id: workspace._id,
    name: workspace.name,
    status: workspace.status || 'active',
    createdAt: workspace.createdAt,
    updatedAt: workspace.updatedAt,
    disabledAt: workspace.disabledAt || null,
    ...extra,
  };
}

function workspaceHeader(req) {
  return req.headers.get('x-workspace-id') || req.headers.get('X-Workspace-Id');
}

async function ensureWorkspaceIndexes(db) {
  if (!workspaceIndexesPromise) {
    workspaceIndexesPromise = Promise.all([
      db.collection('workspaces').createIndex({ ownerUserId: 1, status: 1 }),
      db.collection('instagram_accounts').createIndex(
        { workspaceId: 1 },
        { unique: true, sparse: true }
      ),
      db.collection('instagram_accounts').createIndex({ connectedUserId: 1, workspaceId: 1 }),
      db.collection('automations').createIndex({ userId: 1, workspaceId: 1 }),
      db.collection('automation_runs').createIndex({ userId: 1, workspaceId: 1, ranAt: -1 }),
      db.collection('audience_members').createIndex({ workspaceId: 1, instagramScopedUserId: 1 }, { unique: true }),
      db.collection('audience_members').createIndex({ userId: 1, workspaceId: 1, lastTriggeredAt: -1 }),
    ]).catch((e) => {
      workspaceIndexesPromise = null;
      console.error('[workspaces] index setup failed', e?.message);
    });
  }
  await workspaceIndexesPromise;
}

async function getOrCreateMigrationWorkspace(db, userId, key, name) {
  const now = new Date();
  const res = await db.collection('workspaces').findOneAndUpdate(
    { ownerUserId: userId, migrationKey: key },
    {
      $setOnInsert: {
        _id: uuidv4(),
        ownerUserId: userId,
        name: cleanWorkspaceName(name),
        status: 'active',
        migrationKey: key,
        createdAt: now,
      },
      $set: { updatedAt: now },
    },
    { upsert: true, returnDocument: 'after' }
  );
  return res.value || res;
}

async function ensureUserWorkspaces(db, userId) {
  await ensureWorkspaceIndexes(db);
  const now = new Date();
  const accounts = await db.collection('instagram_accounts').find({ connectedUserId: userId }).toArray();
  const accountIds = accounts.map(a => a._id);

  for (const account of accounts) {
    let workspaceId = account.workspaceId;
    if (!workspaceId) {
      const workspace = await getOrCreateMigrationWorkspace(
        db,
        userId,
        `ig:${account._id}`,
        account.username ? `@${account.username}` : 'Instagram Workspace'
      );
      workspaceId = workspace._id;
      await db.collection('instagram_accounts').updateOne(
        { _id: account._id, connectedUserId: userId },
        { $set: { workspaceId, updatedAt: now } }
      );
    }
    await db.collection('automations').updateMany(
      { userId, instagramAccountId: account._id, workspaceId: { $exists: false } },
      { $set: { workspaceId, updatedAt: now } }
    );
    await db.collection('automation_runs').updateMany(
      { userId, instagramAccountId: account._id, workspaceId: { $exists: false } },
      { $set: { workspaceId } }
    );
  }

  const orphanAutomations = await db.collection('automations').find({
    userId,
    workspaceId: { $exists: false },
    ...(accountIds.length ? { instagramAccountId: { $nin: accountIds } } : {}),
  }).project({ _id: 1 }).toArray();

  if (orphanAutomations.length > 0) {
    const fallback = await getOrCreateMigrationWorkspace(db, userId, 'default', 'Default Workspace');
    const orphanIds = orphanAutomations.map(a => a._id);
    await db.collection('automations').updateMany(
      { _id: { $in: orphanIds }, userId },
      { $set: { workspaceId: fallback._id, updatedAt: now } }
    );
    await db.collection('automation_runs').updateMany(
      { userId, automationId: { $in: orphanIds }, workspaceId: { $exists: false } },
      { $set: { workspaceId: fallback._id } }
    );
  }

  const workspaces = await db.collection('workspaces').find({ ownerUserId: userId }).sort({ createdAt: 1 }).toArray();
  if (workspaces.length === 0) {
    const workspace = {
      _id: uuidv4(),
      ownerUserId: userId,
      name: 'Default Workspace',
      status: 'active',
      migrationKey: 'default',
      createdAt: now,
      updatedAt: now,
    };
    await db.collection('workspaces').insertOne(workspace);
    return [workspace];
  }
  return workspaces;
}

async function getWorkspaceForRequest(req, db, userId, { requireActive = false } = {}) {
  const workspaces = await ensureUserWorkspaces(db, userId);
  const requestedId = workspaceHeader(req);
  const workspace = requestedId
    ? workspaces.find(w => w._id === requestedId)
    : workspaces.find(w => (w.status || 'active') === 'active') || workspaces[0];

  if (!workspace) return { error: json({ error: 'Workspace not found' }, 404) };
  if (requestedId && !workspace) return { error: json({ error: 'Workspace not found' }, 404) };
  if (requireActive && (workspace.status || 'active') !== 'active') {
    return { error: json({ error: 'Workspace is disabled. Re-enable it before making changes.' }, 403) };
  }
  return { workspace, workspaces };
}

async function handleListWorkspaces(req) {
  const u = getUserFromRequest(req);
  if (!u) return json({ error: 'Unauthorized' }, 401);
  const db = await getDb();
  const workspaces = await ensureUserWorkspaces(db, u.userId);
  const [accounts, automationCounts] = await Promise.all([
    db.collection('instagram_accounts').find({ connectedUserId: u.userId }).toArray(),
    db.collection('automations').aggregate([
      { $match: { userId: u.userId } },
      { $group: { _id: '$workspaceId', count: { $sum: 1 }, active: { $sum: { $cond: ['$isActive', 1, 0] } } } },
    ]).toArray(),
  ]);
  const accountByWorkspace = new Map(accounts.map(a => [a.workspaceId, a]));
  const countsByWorkspace = new Map(automationCounts.map(c => [c._id, c]));
  return json({
    workspaces: workspaces.map(w => {
      const account = accountByWorkspace.get(w._id);
      const counts = countsByWorkspace.get(w._id) || {};
      return publicWorkspace(w, {
        account: account ? {
          id: account._id,
          username: account.username,
          pfp: account.pfp || null,
          accountType: account.accountType || null,
        } : null,
        automationsCount: counts.count || 0,
        activeAutomationsCount: counts.active || 0,
      });
    }),
  });
}

async function handleCreateWorkspace(req) {
  const u = getUserFromRequest(req);
  if (!u) return json({ error: 'Unauthorized' }, 401);
  const body = await req.json();
  const db = await getDb();
  await ensureUserWorkspaces(db, u.userId);
  const now = new Date();
  const workspace = {
    _id: uuidv4(),
    ownerUserId: u.userId,
    name: cleanWorkspaceName(body.name || 'New Workspace'),
    status: 'active',
    createdAt: now,
    updatedAt: now,
  };
  await db.collection('workspaces').insertOne(workspace);
  return json({ workspace: publicWorkspace(workspace) });
}

async function handleUpdateWorkspace(req, id) {
  const u = getUserFromRequest(req);
  if (!u) return json({ error: 'Unauthorized' }, 401);
  const body = await req.json();
  const db = await getDb();
  await ensureUserWorkspaces(db, u.userId);
  const update = { updatedAt: new Date() };
  if (Object.prototype.hasOwnProperty.call(body, 'name')) update.name = cleanWorkspaceName(body.name);
  if (Object.prototype.hasOwnProperty.call(body, 'status')) {
    if (!['active', 'disabled'].includes(body.status)) return json({ error: 'Invalid workspace status' }, 400);
    update.status = body.status;
    if (body.status === 'disabled') update.disabledAt = new Date();
  }
  const unset = body.status === 'active' ? { disabledAt: '' } : undefined;
  const result = await db.collection('workspaces').findOneAndUpdate(
    { _id: id, ownerUserId: u.userId },
    unset ? { $set: update, $unset: unset } : { $set: update },
    { returnDocument: 'after' }
  );
  const workspace = result.value || result;
  if (!workspace) return json({ error: 'Workspace not found' }, 404);
  return json({ workspace: publicWorkspace(workspace) });
}

async function handleDeleteWorkspace(req, id) {
  const u = getUserFromRequest(req);
  if (!u) return json({ error: 'Unauthorized' }, 401);
  const db = await getDb();
  await ensureUserWorkspaces(db, u.userId);
  const workspace = await db.collection('workspaces').findOne({ _id: id, ownerUserId: u.userId });
  if (!workspace) return json({ error: 'Workspace not found' }, 404);
  await Promise.all([
    db.collection('instagram_accounts').deleteMany({ connectedUserId: u.userId, workspaceId: id }),
    db.collection('automations').deleteMany({ userId: u.userId, workspaceId: id }),
    db.collection('automation_runs').deleteMany({ userId: u.userId, workspaceId: id }),
    db.collection('workspaces').deleteOne({ _id: id, ownerUserId: u.userId }),
  ]);
  return json({ success: true });
}

function escapeRegex(value) {
  return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function csvCell(value) {
  const text = value == null ? '' : String(value);
  return `"${text.replace(/"/g, '""')}"`;
}

function audienceLabel(member) {
  return member.username ? `@${member.username}` : (member.displayName || member.instagramScopedUserId || 'Unknown');
}

async function getAudienceForRequest(req) {
  const u = getUserFromRequest(req);
  if (!u) return { response: json({ error: 'Unauthorized' }, 401) };
  const db = await getDb();
  const { workspace, error } = await getWorkspaceForRequest(req, db, u.userId);
  if (error) return { response: error };
  return { db, user: u, workspace };
}

async function handleListAudience(req) {
  const ctx = await getAudienceForRequest(req);
  if (ctx.response) return ctx.response;
  const { db, user, workspace } = ctx;
  const url = new URL(req.url);
  const search = url.searchParams.get('search')?.trim();
  const query = { userId: user.userId, workspaceId: workspace._id };
  if (search) {
    const pattern = new RegExp(escapeRegex(search), 'i');
    query.$or = [
      { username: pattern },
      { displayName: pattern },
      { instagramScopedUserId: pattern },
      { lastAutomationName: pattern },
      { lastMessageText: pattern },
    ];
  }
  const members = await db.collection('audience_members')
    .find(query)
    .sort({ lastTriggeredAt: -1, updatedAt: -1 })
    .limit(1000)
    .toArray();

  return json({
    audience: members.map(member => ({
      id: member._id,
      userId: member.userId,
      workspaceId: member.workspaceId,
      instagramAccountId: member.instagramAccountId,
      instagramScopedUserId: member.instagramScopedUserId,
      username: member.username || null,
      displayName: member.displayName || null,
      label: audienceLabel(member),
      triggerCount: member.triggerCount || 0,
      commentTriggerCount: member.commentTriggerCount || 0,
      dmTriggerCount: member.dmTriggerCount || 0,
      firstSeenAt: member.firstSeenAt || null,
      lastSeenAt: member.lastSeenAt || null,
      lastTriggeredAt: member.lastTriggeredAt || null,
      lastAutomationId: member.lastAutomationId || null,
      lastAutomationName: member.lastAutomationName || null,
      lastMessageText: member.lastMessageText || null,
    })),
  });
}

async function handleExportAudience(req) {
  const ctx = await getAudienceForRequest(req);
  if (ctx.response) return ctx.response;
  const { db, user, workspace } = ctx;
  const members = await db.collection('audience_members')
    .find({ userId: user.userId, workspaceId: workspace._id })
    .sort({ lastTriggeredAt: -1, updatedAt: -1 })
    .toArray();

  const rows = [
    ['Username', 'Display Name', 'Instagram User ID', 'Total Triggers', 'Comment Triggers', 'DM Triggers', 'First Seen', 'Last Seen', 'Last Triggered', 'Last Automation', 'Last Message'],
    ...members.map(member => [
      member.username ? `@${member.username}` : '',
      member.displayName || '',
      member.instagramScopedUserId || '',
      member.triggerCount || 0,
      member.commentTriggerCount || 0,
      member.dmTriggerCount || 0,
      member.firstSeenAt ? new Date(member.firstSeenAt).toISOString() : '',
      member.lastSeenAt ? new Date(member.lastSeenAt).toISOString() : '',
      member.lastTriggeredAt ? new Date(member.lastTriggeredAt).toISOString() : '',
      member.lastAutomationName || '',
      member.lastMessageText || '',
    ]),
  ];
  const csv = rows.map(row => row.map(csvCell).join(',')).join('\n');
  const filename = `${cleanWorkspaceName(workspace.name).replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase() || 'workspace'}-audience.csv`;
  return new NextResponse(csv, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  });
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
    await ensureUserWorkspaces(db, existing._id);
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
    await ensureUserWorkspaces(db, user._id);
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
  await ensureUserWorkspaces(db, user._id);
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
  await ensureUserWorkspaces(db, user._id);
  const token = signToken({ userId: user._id, email: user.email, username: user.username });
  return json({ token, user: { id: user._id, email: user.email, username: user.username } });
}

async function handleMe(req) {
  const u = getUserFromRequest(req);
  if (!u) return json({ error: 'Unauthorized' }, 401);
  const db = await getDb();
  await ensureUserWorkspaces(db, u.userId);
  return json({ user: { id: u.userId, email: u.email, username: u.username } });
}

// ----------- INSTAGRAM OAUTH -----------
function buildAuthUrl(state) {
  const scopes = [
    'instagram_business_basic',
    'instagram_business_manage_messages',
    'instagram_business_manage_comments'
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

  if (!u) {
    return json({ error: 'Unauthorized' }, 401);
  }

  const db = await getDb();
  const { workspace, error } = await getWorkspaceForRequest(req, db, u.userId, { requireActive: true });
  if (error) return error;

  const existingAccount = await db.collection('instagram_accounts').findOne({
    connectedUserId: u.userId,
    workspaceId: workspace._id,
  });
  if (existingAccount) {
    return json({ error: 'This workspace already has an Instagram account. Create or switch to another workspace to connect a different account.' }, 409);
  }

  const state = crypto.randomUUID();

  await db.collection('oauth_states').insertOne({
    state,
    userId: u.userId,
    workspaceId: workspace._id,
    expiresAt: new Date(Date.now() + 10 * 60 * 1000) // 10 min
  });

  return json({
    url: buildAuthUrl(state)
  });
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
  const db = await getDb();
  const stateRecord = await db.collection('oauth_states')
    .findOneAndDelete({ state, expiresAt: { $gt: new Date() } })

  if (!stateRecord) {
    return NextResponse.redirect(
      `${BASE_URL}/?ig=error&msg=invalid_state`
    );
  }
  if (stateRecord.expiresAt < new Date()) {
    return NextResponse.redirect(
      `${BASE_URL}/?ig=error&msg=expired_state`
    );
  }

  const userId = stateRecord.userId;
  const workspaceId = stateRecord.workspaceId;

  try {
    const workspace = await db.collection('workspaces').findOne({ _id: workspaceId, ownerUserId: userId });
    if (!workspace || (workspace.status || 'active') !== 'active') {
      return NextResponse.redirect(`${BASE_URL}/dashboard?ig=error&msg=${encodeURIComponent('workspace_unavailable')}`);
    }

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
    const infoUrl = `https://graph.instagram.com/${API_VERSION}/me?fields=user_id,id,username,account_type,profile_picture_url&access_token=${accessToken}`;
    const infoRes = await fetch(infoUrl);
    const info = await infoRes.json();
    const instagramUserId = String(info.user_id || info.id || tokenUserId);
    const appScopedUserId = String(info.id || tokenUserId);

    const existingInWorkspace = await db.collection('instagram_accounts').findOne({ connectedUserId: userId, workspaceId });
    if (existingInWorkspace) {
      return NextResponse.redirect(`${BASE_URL}/dashboard?workspaceId=${workspaceId}&ig=error&msg=${encodeURIComponent('This workspace already has an Instagram account.')}`);
    }

    const duplicateAccount = await db.collection('instagram_accounts').findOne({
      connectedUserId: userId,
      workspaceId: { $ne: workspaceId },
      $or: [
        { instagramUserId },
        { instagramUserId: tokenUserId },
        { instagramBusinessAccountId: instagramUserId },
        { instagramBusinessAccountId: tokenUserId },
        { instagramAppScopedUserId: appScopedUserId },
        { instagramTokenUserId: tokenUserId },
      ],
    });
    if (duplicateAccount) {
      return NextResponse.redirect(`${BASE_URL}/dashboard?workspaceId=${workspaceId}&ig=error&msg=${encodeURIComponent('This Instagram account is already connected in another workspace.')}`);
    }

    await db.collection('instagram_accounts').findOneAndUpdate(
      {
        connectedUserId: userId,
        workspaceId,
      },
      {
        $set: {
          connectedUserId: userId,
          workspaceId,
          instagramUserId,
          instagramBusinessAccountId: instagramUserId,
          instagramAppScopedUserId: appScopedUserId,
          instagramTokenUserId: tokenUserId,
          instagramWebhookIds: [instagramUserId, info.id, tokenUserId].filter(Boolean).map(String),
          username: info.username || 'unknown',
          accountType: info.account_type || null,
          pfp: info.profile_picture_url || null,
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

    return NextResponse.redirect(`${BASE_URL}/dashboard?workspaceId=${workspaceId}&ig=success`);
  } catch (e) {
    console.error('OAuth callback exception', e);
    return NextResponse.redirect(`${BASE_URL}/dashboard?workspaceId=${workspaceId || ''}&ig=error&msg=${encodeURIComponent(e.message)}`);
  }
}

async function handleListAccounts(req) {
  const u = getUserFromRequest(req);
  if (!u) return json({ error: 'Unauthorized' }, 401);
  const db = await getDb();
  const { workspace, error } = await getWorkspaceForRequest(req, db, u.userId);
  if (error) return error;
  const list = await db.collection('instagram_accounts').find({ connectedUserId: u.userId, workspaceId: workspace._id }).toArray();
  return json({ accounts: list.map(a => ({
    id: a._id,
    workspaceId: a.workspaceId || null,
    instagramUserId: a.instagramUserId,
    username: a.username,
    accountType: a.accountType,
    tokenExpiry: a.tokenExpiry,
    pfp: a.pfp,
  })) });
}

async function handleDisconnect(req, accountId) {
  const u = getUserFromRequest(req);
  if (!u) return json({ error: 'Unauthorized' }, 401);
  const db = await getDb();
  const { workspace, error } = await getWorkspaceForRequest(req, db, u.userId, { requireActive: true });
  if (error) return error;
  await db.collection('instagram_accounts').deleteOne({ _id: accountId, connectedUserId: u.userId, workspaceId: workspace._id });
  await db.collection('automations').deleteMany({ userId: u.userId, workspaceId: workspace._id, instagramAccountId: accountId });
  return json({ success: true });
}

async function handleResubscribe(req, accountId) {
  const u = getUserFromRequest(req);
  if (!u) return json({ error: 'Unauthorized' }, 401);
  const db = await getDb();
  const { workspace, error } = await getWorkspaceForRequest(req, db, u.userId, { requireActive: true });
  if (error) return error;
  const acct = await db.collection('instagram_accounts').findOne({ _id: accountId, connectedUserId: u.userId, workspaceId: workspace._id });
  if (!acct) return json({ error: 'Account not found' }, 404);
  try {
    const infoUrl = `https://graph.instagram.com/${API_VERSION}/me?fields=user_id,id,username,account_type&access_token=${encodeURIComponent(acct.accessToken)}`;
    const infoRes = await fetch(infoUrl);
    const info = await infoRes.json();
    if (!infoRes.ok) return json({ error: info.error?.message || 'failed to refresh account identity', details: info }, 500);

    const instagramUserId = String(info.user_id || info.id || acct.instagramUserId);
    const appScopedUserId = String(info.id || acct.instagramAppScopedUserId || acct.instagramUserId);
    await db.collection('instagram_accounts').updateOne(
      { _id: accountId, connectedUserId: u.userId, workspaceId: workspace._id },
      {
        $set: {
          instagramUserId,
          instagramBusinessAccountId: instagramUserId,
          instagramAppScopedUserId: appScopedUserId,
          username: info.username || acct.username,
          accountType: info.account_type || acct.accountType || null,
          pfp: info.profile_picture_url || acct.pfp || null,
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
  const { workspace, error } = await getWorkspaceForRequest(req, db, u.userId);
  if (error) return error;
  const acct = await db.collection('instagram_accounts').findOne({ _id: accountId, connectedUserId: u.userId, workspaceId: workspace._id });
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
  const { workspace, error } = await getWorkspaceForRequest(req, db, u.userId, { requireActive: true });
  if (error) return error;
  const acct = await db.collection('instagram_accounts').findOne({ _id: accountId, connectedUserId: u.userId, workspaceId: workspace._id });
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
function cleanStringList(values, limit = 3) {
  return Array.isArray(values)
    ? values.map(s => String(s).trim()).filter(Boolean).slice(0, limit)
    : [];
}

function cleanKeywordList(values) {
  return Array.isArray(values)
    ? values.map(k => stripQuotes(String(k)).toLowerCase().trim()).filter(Boolean)
    : [];
}

function cleanButtonList(values) {
  return Array.isArray(values)
    ? values
      .map(b => ({ title: String(b?.title || '').trim(), url: String(b?.url || '').trim() }))
      .filter(b => b.title && b.url)
      .slice(0, 3)
    : [];
}

function normalizeMatchType(matchType) {
  return ['exact', 'contains', 'starts_with'].includes(matchType) ? matchType : 'contains';
}

async function findOwnedInstagramAccount(db, userId, instagramAccountId, workspaceId) {
  if (!instagramAccountId) return null;
  const query = {
    _id: instagramAccountId,
    connectedUserId: userId,
  };
  if (workspaceId) query.workspaceId = workspaceId;
  return db.collection('instagram_accounts').findOne(query);
}

async function addRunCounts(db, userId, automations, workspaceId = null) {
  if (automations.length === 0) return automations;
  const ids = automations.map(a => a._id);
  const match = { userId, automationId: { $in: ids } };
  if (workspaceId) match.workspaceId = workspaceId;
  const counts = await db.collection('automation_runs').aggregate([
    { $match: match },
    { $group: { _id: '$automationId', count: { $sum: 1 } } },
  ]).toArray();
  const countById = new Map(counts.map(row => [row._id, row.count]));
  return automations.map(a => ({ ...a, runsCount: countById.get(a._id) || 0 }));
}

async function handleCreateAutomation(req) {
  const u = getUserFromRequest(req);
  if (!u) return json({ error: 'Unauthorized' }, 401);
  const body = await req.json();
  const type = body.type === 'dm_reply' ? 'dm_reply' : 'comment_dm';
  const db = await getDb();
  const { workspace, error } = await getWorkspaceForRequest(req, db, u.userId, { requireActive: true });
  if (error) return error;
  const account = await findOwnedInstagramAccount(db, u.userId, body.instagramAccountId, workspace._id);

  if (!account) {
    return json({ error: 'Please refresh your connected Instagram accounts and try again.' }, 403);
  }

  if (type === 'dm_reply') {
    const { instagramAccountId, keywords, matchType, replyMessages, replyButtons, name } = body;
    const cleanKeywords = cleanKeywordList(keywords);
    const cleanReplies = cleanStringList(replyMessages);
    const cleanButtons = cleanButtonList(replyButtons);
    if (!instagramAccountId || cleanKeywords.length === 0 || cleanReplies.length === 0) {
      return json({ error: 'Need an account, at least 1 keyword, and 1 reply variant.' }, 400);
    }
    const doc = {
      _id: uuidv4(),
      userId: u.userId,
      workspaceId: workspace._id,
      instagramAccountId,
      type: 'dm_reply',
      name: String(name || '').trim() || cleanKeywords[0],
      keywords: cleanKeywords,
      matchType: normalizeMatchType(matchType),
      replyMessages: cleanReplies,
      replyButtons: cleanButtons,
      igUsername: account.username || null,
      isActive: true,
      createdAt: new Date(),
    };
    await db.collection('automations').insertOne(doc);
    return json({ automation: doc });
  }

  const {
    instagramAccountId, postId, postPermalink, postThumbnail,
    keywords, matchType, replyMessages, dmText, dmButtons,
    askToFollow, followMessage, followButtonText, name,
  } = body;
  const cleanKeywords = cleanKeywordList(keywords);
  const cleanReplies = cleanStringList(replyMessages);
  const cleanButtons = cleanButtonList(dmButtons);
  const cleanDmText = String(dmText || '').trim();
  const cleanPostId = String(postId || '').trim();
  if (!instagramAccountId || !cleanPostId || cleanKeywords.length === 0 || cleanReplies.length === 0 || !cleanDmText) {
    return json({ error: 'Missing fields. Need at least 1 keyword, 1 reply variant and a DM message.' }, 400);
  }
  const doc = {
    _id: uuidv4(),
    userId: u.userId,
    workspaceId: workspace._id,
    instagramAccountId,
    type: 'comment_dm',
    postId: cleanPostId,
    postPermalink: postPermalink || null,
    postThumbnail: postThumbnail || null,
    name: String(name || '').trim() || cleanKeywords[0],
    keywords: cleanKeywords,
    matchType: normalizeMatchType(matchType),
    replyMessages: cleanReplies,
    dmText: cleanDmText,
    dmButtons: cleanButtons,
    askToFollow: !!askToFollow,
    followMessage: askToFollow ? (String(followMessage || '').trim() || `Follow @${account.username || ''} first to unlock this!`) : null,
    followButtonText: askToFollow ? (String(followButtonText || '').trim() || 'I Followed') : null,
    igUsername: account.username || null,
    isActive: true,
    createdAt: new Date(),
    triggerWord: cleanKeywords[0],
    replyMessage: cleanReplies[0],
    dmMessage: cleanDmText,
  };
  await db.collection('automations').insertOne(doc);
  return json({ automation: doc });
}

async function handleListAutomations(req) {
  const u = getUserFromRequest(req);
  if (!u) return json({ error: 'Unauthorized' }, 401);
  const db = await getDb();
  const { workspace, error } = await getWorkspaceForRequest(req, db, u.userId);
  if (error) return error;
  const list = await db.collection('automations').find({ userId: u.userId, workspaceId: workspace._id }).sort({ createdAt: -1 }).toArray();
  return json({ automations: await addRunCounts(db, u.userId, list, workspace._id) });
}

async function handleUpdateAutomation(req, id) {
  const u = getUserFromRequest(req);
  if (!u) return json({ error: 'Unauthorized' }, 401);
  const body = await req.json();
  const db = await getDb();
  const { workspace, error } = await getWorkspaceForRequest(req, db, u.userId, { requireActive: true });
  if (error) return error;
  const existing = await db.collection('automations').findOne({ _id: id, userId: u.userId, workspaceId: workspace._id });
  if (!existing) return json({ error: 'Automation not found' }, 404);

  const update = {};
  if (typeof body.isActive === 'boolean') update.isActive = body.isActive;

  const settingKeys = [
    'instagramAccountId', 'name', 'keywords', 'matchType', 'replyMessages',
    'replyButtons', 'postId', 'postPermalink', 'postThumbnail', 'dmText',
    'dmButtons', 'askToFollow', 'followMessage', 'followButtonText',
  ];
  const hasSettingsUpdate = settingKeys.some(key => Object.prototype.hasOwnProperty.call(body, key));

  if (hasSettingsUpdate) {
    const instagramAccountId = body.instagramAccountId || existing.instagramAccountId;
    const account = await findOwnedInstagramAccount(db, u.userId, instagramAccountId, workspace._id);
    if (!account) {
      return json({ error: 'Please refresh your connected Instagram accounts and try again.' }, 403);
    }

    const keywords = Object.prototype.hasOwnProperty.call(body, 'keywords')
      ? cleanKeywordList(body.keywords)
      : cleanKeywordList(existing.keywords || (existing.triggerWord ? [existing.triggerWord] : []));
    const replies = Object.prototype.hasOwnProperty.call(body, 'replyMessages')
      ? cleanStringList(body.replyMessages)
      : cleanStringList(existing.replyMessages || (existing.replyMessage ? [existing.replyMessage] : []));

    if (keywords.length === 0 || replies.length === 0) {
      return json({ error: 'Add at least 1 keyword and 1 reply variant.' }, 400);
    }

    update.instagramAccountId = instagramAccountId;
    update.name = Object.prototype.hasOwnProperty.call(body, 'name')
      ? (String(body.name || '').trim() || keywords[0])
      : (existing.name || keywords[0]);
    update.keywords = keywords;
    update.matchType = normalizeMatchType(body.matchType || existing.matchType);
    update.replyMessages = replies;
    update.igUsername = account.username || null;

    if (existing.type === 'dm_reply') {
      update.replyButtons = Object.prototype.hasOwnProperty.call(body, 'replyButtons')
        ? cleanButtonList(body.replyButtons)
        : cleanButtonList(existing.replyButtons || []);
    } else {
      const dmText = Object.prototype.hasOwnProperty.call(body, 'dmText')
        ? String(body.dmText || '').trim()
        : String(existing.dmText || existing.dmMessage || '').trim();
      const postId = Object.prototype.hasOwnProperty.call(body, 'postId')
        ? String(body.postId || '').trim()
        : String(existing.postId || '').trim();
      if (!postId || !dmText) {
        return json({ error: 'Choose a post and add a DM message.' }, 400);
      }

      const askToFollow = Object.prototype.hasOwnProperty.call(body, 'askToFollow')
        ? !!body.askToFollow
        : !!existing.askToFollow;

      update.postId = postId;
      update.postPermalink = Object.prototype.hasOwnProperty.call(body, 'postPermalink') ? (body.postPermalink || null) : (existing.postPermalink || null);
      update.postThumbnail = Object.prototype.hasOwnProperty.call(body, 'postThumbnail') ? (body.postThumbnail || null) : (existing.postThumbnail || null);
      update.dmText = dmText;
      update.dmButtons = Object.prototype.hasOwnProperty.call(body, 'dmButtons') ? cleanButtonList(body.dmButtons) : cleanButtonList(existing.dmButtons || []);
      update.askToFollow = askToFollow;
      update.followMessage = askToFollow
        ? (String(Object.prototype.hasOwnProperty.call(body, 'followMessage') ? body.followMessage : existing.followMessage || '').trim() || `Follow @${account.username || ''} first to unlock this!`)
        : null;
      update.followButtonText = askToFollow
        ? (String(Object.prototype.hasOwnProperty.call(body, 'followButtonText') ? body.followButtonText : existing.followButtonText || '').trim() || 'I Followed')
        : null;
      update.triggerWord = keywords[0];
      update.replyMessage = replies[0];
      update.dmMessage = dmText;
    }
  }

  update.updatedAt = new Date();
  await db.collection('automations').updateOne({ _id: id, userId: u.userId, workspaceId: workspace._id }, { $set: update });
  const doc = await db.collection('automations').findOne({ _id: id, userId: u.userId, workspaceId: workspace._id });
  const [withCounts] = await addRunCounts(db, u.userId, [doc], workspace._id);
  return json({ automation: withCounts });
}

async function handleDeleteAutomation(req, id) {
  const u = getUserFromRequest(req);
  if (!u) return json({ error: 'Unauthorized' }, 401);
  const db = await getDb();
  const { workspace, error } = await getWorkspaceForRequest(req, db, u.userId, { requireActive: true });
  if (error) return error;
  await db.collection('automations').deleteOne({ _id: id, userId: u.userId, workspaceId: workspace._id });
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

  const signature = req.headers.get('x-hub-signature-256');

  const isValid = verifyMetaSignature(rawBody, signature);

  if (!isValid) {
    console.error('[webhook] invalid signature');

    return new NextResponse('invalid signature', {
      status: 401
    });
  }
  let body;
  try { body = JSON.parse(rawBody); } catch (e) { return new NextResponse('bad json', { status: 400 }); }
  const summary = summarizeWebhook(body);
  console.log('[webhook] event received', JSON.stringify(summary));

  try {
    const db = await getDb();
    void db.collection('webhook_events').insertOne({ _id: uuidv4(), receivedAt: new Date(), payload: body })
      .then(() => console.log('[webhook] archived event'))
      .catch((e) => console.error('[webhook] archive error', e?.message));
  } catch (e) {
    console.error('[webhook] archive setup error', e?.message);
  }

  try {
    const q = getQueue();
    const jobId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const job = await q.add('event', body, { jobId });
    console.log('[webhook] enqueued event', JSON.stringify({ jobId: job.id, ...summary }));
  } catch (e) {
    console.error('[webhook] queue error', e?.message);
    return new NextResponse('queue error', { status: 500 });
  }

  return new NextResponse('EVENT_RECEIVED', { status: 200 });
}

function verifyMetaSignature(rawBody, signature) {
  if (!signature) {
    return false;
  }

  const expectedSignature =
    'sha256=' +
    crypto
      .createHmac('sha256', process.env.META_APP_SECRET)
      .update(rawBody, 'utf8')
      .digest('hex');

  return crypto.timingSafeEqual(
    Buffer.from(expectedSignature),
    Buffer.from(signature)
  );
}
// ----------- ANALYTICS -----------
async function handleAnalytics(req) {
  const u = getUserFromRequest(req);
  if (!u) return json({ error: 'Unauthorized' }, 401);
  const db = await getDb();
  const workspaces = await ensureUserWorkspaces(db, u.userId);
  const workspaceById = new Map(workspaces.map(w => [w._id, w]));

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
      workspaceId: a.workspaceId || null,
      workspaceName: workspaceById.get(a.workspaceId)?.name || 'Workspace',
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
      const workspace = workspaceById.get(r.workspaceId || auto?.workspaceId);
      return {
        id: r._id,
        workspaceId: r.workspaceId || auto?.workspaceId || null,
        workspaceName: workspace?.name || 'Workspace',
        commentText: r.commentText,
        automationName: auto?.name || (auto?.keywords && auto.keywords[0]) || 'Automation',
        flow: r.flow,
        ranAt: r.ranAt,
        replyOk: !!r.replyResult?.ok,
        dmOk: !!r.dmResult?.ok,
      };
    });

  const workspaceBreakdown = workspaces.map(w => {
    const workspaceRuns = allRuns.filter(r => r.workspaceId === w._id);
    const workspaceAutomations = automations.filter(a => a.workspaceId === w._id);
    const workspaceAccounts = accounts.filter(a => a.workspaceId === w._id);
    return {
      id: w._id,
      name: w.name,
      status: w.status || 'active',
      accounts: workspaceAccounts.length,
      automations: workspaceAutomations.length,
      activeAutomations: workspaceAutomations.filter(a => a.isActive).length,
      triggers: workspaceRuns.filter(r => ['direct', 'follow-gated'].includes(r.flow)).length,
      dms: workspaceRuns.filter(r => r.dmResult?.ok).length,
    };
  });

  return json({
    summary: {
      totals: {
        workspaces: workspaces.length,
        activeWorkspaces: workspaces.filter(w => (w.status || 'active') === 'active').length,
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
    workspaceBreakdown,
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

  // Workspaces
  if (path === '/workspaces' && method === 'GET') return handleListWorkspaces(req);
  if (path === '/workspaces' && method === 'POST') return handleCreateWorkspace(req);
  if (path.startsWith('/workspaces/') && method === 'PUT') {
    const id = path.split('/')[2];
    return handleUpdateWorkspace(req, id);
  }
  if (path.startsWith('/workspaces/') && method === 'DELETE') {
    const id = path.split('/')[2];
    return handleDeleteWorkspace(req, id);
  }

  // Audience
  if (path === '/audience' && method === 'GET') return handleListAudience(req);
  if (path === '/audience/export' && method === 'GET') return handleExportAudience(req);

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
  await ensureUserWorkspaces(db, user._id);
  const token = signToken({ userId: user._id, email: user.email, username: user.username });
  return json({ token, user: { id: user._id, email: user.email, username: user.username } });
}
