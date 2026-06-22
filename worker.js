// Background worker that consumes webhook events from the BullMQ queue
// and processes them (matching automations, posting reply, sending DM).
//
// Run with:  node worker.js
//
// In production, run multiple worker instances behind your queue for horizontal scaling.

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { Worker } from 'bullmq';
import IORedis from 'ioredis';
import { MongoClient } from 'mongodb';
import { v4 as uuidv4 } from 'uuid';
import { tryConsumeTriggerQuota } from './lib/entitlements.js';
import {
  GRAPH_ERROR_CLASSIFICATIONS,
  classifyGraphError,
  normalizeGraphError,
  shouldPauseAccountForGraphError,
} from './lib/graph-errors.js';
import {
  META_RATE_LIMIT_STATES,
  classifyMetaRateLimitUsage,
  getMetaRateLimitPauseUntil,
  parseMetaRateLimitHeaders,
} from './lib/meta-rate-limit.js';
import {
  extractInstagramPostShares,
  findMatchingInstagramPostShare,
} from './lib/instagram-post-share.js';

// Lightweight .env loader (avoids extra dep)
try {
  const envPath = path.join(process.cwd(), '.env');
  if (fs.existsSync(envPath)) {
    fs.readFileSync(envPath, 'utf-8').split('\n').forEach(line => {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
    });
  }
} catch {}

const QUEUE_NAME = 'webhook-events';
const API_VERSION = process.env.META_API_VERSION || 'v22.0';
const DEFAULT_COOLDOWN_MINUTES = 15;
const DM_COOLDOWN_SECONDS = parsePositiveInt(
  process.env.DM_AUTOMATION_COOLDOWN_SECONDS,
  DEFAULT_COOLDOWN_MINUTES * 60,
);
const FOLLOW_RETRY_COOLDOWN_SECONDS = parsePositiveInt(
  process.env.FOLLOW_RETRY_COOLDOWN_SECONDS,
  DEFAULT_COOLDOWN_MINUTES * 60,
);
const ACCOUNT_SEND_LIMIT_PER_HOUR = parsePositiveInt(
  process.env.META_ACCOUNT_SEND_LIMIT_PER_HOUR,
  50,
);
const META_RATE_LIMIT_WARN_PERCENT = parsePositiveInt(
  process.env.META_RATE_LIMIT_WARN_PERCENT,
  80,
);
const META_RATE_LIMIT_NEAR_PAUSE_MINUTES = parsePositiveInt(
  process.env.META_RATE_LIMIT_NEAR_PAUSE_MINUTES,
  10,
);

const redis = new IORedis(process.env.REDIS_URL || 'redis://localhost:6379', {
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
});

const mongo = new MongoClient(process.env.MONGO_URL);
let dbPromise = mongo.connect().then(() => mongo.db(process.env.DB_NAME || 'ig_automation'));

async function db() { return dbPromise; }
let audienceIndexesPromise;
let deliveryIndexesPromise;

function parsePositiveInt(value, fallback) {
  const parsed = parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function envFlag(name) {
  return ['1', 'true', 'yes', 'on'].includes(String(process.env[name] || '').trim().toLowerCase());
}

function graphSendError(result, fallbackMessage = 'Instagram Graph API send failed') {
  if (result?.ok) return null;
  const error = new Error(result?.data?.error?.message || fallbackMessage);
  error.name = 'GraphSendError';
  error.graph = result?.data?.error || result?.data || null;
  error.graphClassification = classifyGraphError(error);
  error.rateLimit = result?.rateLimit || null;
  return error;
}

// ---- Instagram API helpers ----
async function graphJson(url, options) {
  const r = await fetch(url, options);
  return {
    ok: r.ok,
    data: await r.json(),
    rateLimit: parseMetaRateLimitHeaders(r.headers),
  };
}

async function replyToComment(accessToken, commentId, message) {
  const url = `https://graph.instagram.com/${API_VERSION}/${commentId}/replies`;
  const form = new URLSearchParams();
  form.set('message', message);
  form.set('access_token', accessToken);
  return graphJson(url, { method: 'POST', body: form });
}
async function sendDMText(accessToken, recipient, message) {
  const url = `https://graph.instagram.com/v22.0/me/messages?access_token=${encodeURIComponent(accessToken)}`;
  return graphJson(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ recipient, message: { text: message } }),
  });
}
async function sendDMButtons(accessToken, recipient, text, buttons) {
  const url = `https://graph.instagram.com/v22.0/me/messages?access_token=${encodeURIComponent(accessToken)}`;
  return graphJson(url, {
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
}


async function sendFollowPrompt(accessToken, recipient, text, buttonTitle, automationId, igUsername) {
  const url = `https://graph.instagram.com/v22.0/me/messages?access_token=${encodeURIComponent(accessToken)}`;
  const buttons = [];
  if (igUsername) {
    buttons.push({ type: 'web_url', url: `https://instagram.com/${igUsername}`, title: `Open @${igUsername}` });
  }
  buttons.push({ type: 'postback', title: buttonTitle || 'I Followed ✓', payload: `RP_FOLLOW:${automationId}` });
  return graphJson(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      recipient,
      message: { attachment: { type: 'template', payload: { template_type: 'button', text, buttons } } },
    }),
  });
}
async function checkUserFollowsBusiness(accessToken, igsid) {
  const url = `https://graph.instagram.com/v22.0/${igsid}?fields=is_user_follow_business,follower_count,name,username&access_token=${encodeURIComponent(accessToken)}`;
  try {
    const r = await graphJson(url);
    return { ok: r.ok, isFollowing: r.data.is_user_follow_business === true, raw: r.data, rateLimit: r.rateLimit };
  } catch (e) { return { ok: false, isFollowing: false, error: e.message }; }
}

async function getUserProfile(accessToken, igsid) {
  const url = `https://graph.instagram.com/v22.0/${igsid}?fields=name,username&access_token=${encodeURIComponent(accessToken)}`;
  try {
    const r = await graphJson(url);
    return { ok: r.ok, username: r.data.username || null, displayName: r.data.name || null, raw: r.data, rateLimit: r.rateLimit };
  } catch (e) {
    return { ok: false, username: null, displayName: null, error: e.message };
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

function matchesKeyword(text, keywords, matchType) {
  const t = (text || '').toLowerCase().trim();
  return keywords.some(k => {
    const kw = stripQuotes(String(k)).toLowerCase().trim();
    if (!kw) return false;
    if (matchType === 'exact') return t === kw;
    if (matchType === 'starts_with') return t.startsWith(kw);
    return t.includes(kw);
  });
}

function textPreview(value, max = 120) {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  return text.length > max ? `${text.slice(0, max)}...` : text;
}

function logAutomation(scope, message, details = {}) {
  try {
    console.log(`[worker][${scope}] ${message}`, JSON.stringify(details));
  } catch {
    console.log(`[worker][${scope}] ${message}`);
  }
}

function graphError(result) {
  return result?.data?.error?.message || result?.data?.error?.code || null;
}

function graphErrorDetails(resultOrError) {
  const normalized = normalizeGraphError(resultOrError);
  if (!normalized.message && !normalized.code && !normalized.type) return null;
  return {
    ...normalized,
    classification: classifyGraphError(resultOrError),
  };
}

function metaRateLimitThresholds() {
  return {
    nearLimitPercent: META_RATE_LIMIT_WARN_PERCENT,
    limitedPercent: 100,
  };
}

function metaRateLimitReason(usage, state) {
  const metric = usage?.highestMetric || 'usage';
  const value = usage?.highestUsage ?? usage?.[metric] ?? 'unknown';
  return state === META_RATE_LIMIT_STATES.LIMITED
    ? `Meta Graph API rate limit reached: ${metric}=${value}`
    : `Meta Graph API rate limit near threshold: ${metric}=${value}`;
}

function isDuplicateKeyError(error) {
  return error?.code === 11000;
}

function serializeError(error) {
  return {
    message: error?.message || String(error),
    name: error?.name || null,
    graph: error?.graph || null,
    graphDetails: graphErrorDetails(error),
    classification: error?.graphClassification || classifyGraphError(error),
    stage: error?.stage || null,
  };
}

function hashEventParts(parts) {
  return crypto
    .createHash('sha256')
    .update(JSON.stringify(parts))
    .digest('hex')
    .slice(0, 32);
}

function normalizedEventText(text) {
  return String(text || '').replace(/\s+/g, ' ').trim().toLowerCase();
}

function normalizedInstagramUsername(username) {
  return String(username || '').trim().replace(/^@/, '').toLowerCase();
}

function isOwnAccountComment({ acct, entryId, fromId, fromUsername }) {
  const accountIds = [
    entryId,
    acct?.instagramUserId,
    acct?.instagramBusinessAccountId,
    acct?.instagramAppScopedUserId,
    acct?.instagramTokenUserId,
    ...(Array.isArray(acct?.instagramWebhookIds) ? acct.instagramWebhookIds : []),
  ].filter(Boolean).map(String);

  if (fromId && new Set(accountIds).has(String(fromId))) return true;

  const accountUsername = normalizedInstagramUsername(acct?.username);
  const commentUsername = normalizedInstagramUsername(fromUsername);
  return !!accountUsername && !!commentUsername && accountUsername === commentUsername;
}

function dmSourceEventId(msg, senderId, recipientId, text) {
  if (msg.message?.mid) return String(msg.message.mid);
  return `fallback:${hashEventParts([
    senderId || null,
    recipientId || null,
    msg.timestamp || null,
    normalizedEventText(text),
  ])}`;
}

function postbackSourceEventId(msg, senderId, recipientId) {
  if (msg.postback?.mid) return String(msg.postback.mid);
  if (msg.timestamp) return String(msg.timestamp);
  return `fallback:${hashEventParts([
    senderId || null,
    recipientId || null,
    msg.postback?.payload || null,
  ])}`;
}

async function ensureDeliveryIndexes(dbi) {
  if (!deliveryIndexesPromise) {
    const expireAfterSeconds = parseInt(
      process.env.AUTOMATION_DELIVERY_TTL_SECONDS || `${30 * 24 * 60 * 60}`,
      10,
    );
    deliveryIndexesPromise = Promise.all([
      dbi.collection('automation_deliveries').createIndex(
        { createdAt: 1 },
        { expireAfterSeconds: Number.isFinite(expireAfterSeconds) ? expireAfterSeconds : 30 * 24 * 60 * 60 },
      ),
      dbi.collection('automation_deliveries').createIndex(
        { expiresAt: 1 },
        { expireAfterSeconds: 0 },
      ),
      dbi.collection('automation_deliveries').createIndex({ automationId: 1, createdAt: -1 }),
    ]).catch((e) => {
      deliveryIndexesPromise = null;
      logAutomation('delivery', 'index setup failed', { error: e?.message });
    });
  }
  await deliveryIndexesPromise;
}

async function claimAutomationDelivery(dbi, {
  key,
  automationId,
  workspaceId,
  instagramAccountId,
  flow,
  sourceEventId,
  jobId,
}) {
  await ensureDeliveryIndexes(dbi);
  const now = new Date();
  try {
    await dbi.collection('automation_deliveries').insertOne({
      _id: key,
      automationId,
      workspaceId: workspaceId || null,
      instagramAccountId,
      flow,
      sourceEventId,
      jobId: jobId || null,
      status: 'claimed',
      createdAt: now,
      updatedAt: now,
    });
    return { claimed: true, key };
  } catch (e) {
    if (isDuplicateKeyError(e)) return { claimed: false, key };
    throw e;
  }
}

async function updateAutomationDelivery(dbi, key, set) {
  try {
    await dbi.collection('automation_deliveries').updateOne(
      { _id: key },
      { $set: { ...set, updatedAt: new Date() } },
    );
  } catch (e) {
    logAutomation('delivery', 'delivery update failed', {
      deliveryKey: key,
      error: e?.message,
    });
  }
}

async function markDeliverySent(dbi, key, sendResult) {
  await updateAutomationDelivery(dbi, key, {
    status: 'sent',
    sendResult,
    sentAt: new Date(),
  });
}

async function markDeliveryFailed(dbi, key, error) {
  await updateAutomationDelivery(dbi, key, {
    status: 'send_failed',
    sendError: serializeError(error),
  });
}

async function markDeliveryPlanLimited(dbi, key, quota) {
  await updateAutomationDelivery(dbi, key, {
    status: 'plan_limited',
    planLimit: quota?.details?.billing || null,
  });
}

async function consumeTriggerOrRecordLimit(dbi, {
  auto,
  acct,
  deliveryKey,
  flow,
  sourceEventId,
  jobId,
  commentText = null,
  fromUserId = null,
  fromUsername = null,
}) {
  const workspaceId = auto.workspaceId || acct.workspaceId || null;
  if (!auto.userId || !workspaceId) return { ok: true };
  const quota = await tryConsumeTriggerQuota(dbi, auto.userId, workspaceId);
  if (quota.ok) return quota;

  await markDeliveryPlanLimited(dbi, deliveryKey, quota);
  await dbi.collection('automation_runs').insertOne({
    _id: uuidv4(),
    automationId: auto._id,
    userId: auto.userId,
    workspaceId,
    instagramAccountId: auto.instagramAccountId || acct._id,
    commentText,
    fromUserId,
    fromUsername,
    flow: 'plan-limit',
    originalFlow: flow,
    sourceEventId,
    planLimit: quota.details?.billing || null,
    ranAt: new Date(),
  });
  logAutomation(flow, 'skipped by subscription trigger limit', {
    jobId,
    automationId: auto._id,
    workspaceId,
    current: quota.details?.billing?.current || null,
    limit: quota.details?.billing?.limit || null,
  });
  return quota;
}

async function claimCooldown(dbi, {
  key,
  automationId,
  workspaceId,
  instagramAccountId,
  flow,
  sourceEventId,
  seconds,
  jobId,
}) {
  await ensureDeliveryIndexes(dbi);
  const now = new Date();
  try {
    await dbi.collection('automation_deliveries').insertOne({
      _id: key,
      automationId,
      workspaceId: workspaceId || null,
      instagramAccountId,
      flow,
      sourceEventId: sourceEventId || null,
      jobId: jobId || null,
      status: 'cooldown',
      createdAt: now,
      updatedAt: now,
      expiresAt: new Date(now.getTime() + seconds * 1000),
    });
    return { claimed: true, key };
  } catch (e) {
    if (isDuplicateKeyError(e)) return { claimed: false, key };
    throw e;
  }
}

function accountPauseState(acct) {
  if (envFlag('AUTOMATIONS_PAUSED')) {
    return { paused: true, reason: 'global env AUTOMATIONS_PAUSED is enabled' };
  }
  if (acct?.metaRateLimitPausedUntil && new Date(acct.metaRateLimitPausedUntil) > new Date()) {
    return {
      paused: true,
      reason: acct.metaRateLimitPauseReason || 'Meta Graph API rate limit pause is active',
      pausedUntil: acct.metaRateLimitPausedUntil,
    };
  }
  if (acct?.automationPausedUntil && new Date(acct.automationPausedUntil) > new Date()) {
    return {
      paused: true,
      reason: acct.automationPauseReason || 'instagram account automations are temporarily paused',
      pausedUntil: acct.automationPausedUntil,
    };
  }
  return { paused: false };
}

function shouldPauseForGraphError(error) {
  return shouldPauseAccountForGraphError(error);
}

async function pauseAccountForGraphRisk(dbi, acct, error) {
  if (!acct?._id || !shouldPauseForGraphError(error)) return;
  const fallbackMinutes = parsePositiveInt(process.env.GRAPH_ERROR_PAUSE_MINUTES, 60);
  const rateLimit = error?.rateLimit || null;
  const pausedUntil = getMetaRateLimitPauseUntil(rateLimit, fallbackMinutes);
  const reason = rateLimit
    ? metaRateLimitReason({
        ...rateLimit,
        highestMetric: rateLimit.highestMetric,
        highestUsage: rateLimit.highestUsage,
      }, META_RATE_LIMIT_STATES.LIMITED)
    : (error?.message || 'Instagram Graph API rejected automation send');
  await dbi.collection('instagram_accounts').updateOne(
    { _id: acct._id },
    {
      $set: {
        automationPausedUntil: pausedUntil,
        automationPauseReason: reason,
        metaRateLimitPausedUntil: pausedUntil,
        metaRateLimitPauseReason: reason,
        updatedAt: new Date(),
      },
    },
  );
  acct.automationPausedUntil = pausedUntil;
  acct.automationPauseReason = reason;
  acct.metaRateLimitPausedUntil = pausedUntil;
  acct.metaRateLimitPauseReason = reason;
}

async function recordMetaRateLimitUsage(dbi, acct, result, flow, details = {}) {
  const rateLimit = result?.rateLimit;
  if (!acct?._id || !rateLimit) return;

  const state = classifyMetaRateLimitUsage(rateLimit, metaRateLimitThresholds());
  const observedAt = new Date();
  const usage = { ...rateLimit, state };
  const set = {
    metaRateLimitUsage: usage,
    metaRateLimitObservedAt: observedAt,
    updatedAt: observedAt,
  };

  if (state !== META_RATE_LIMIT_STATES.NORMAL) {
    const fallbackMinutes = state === META_RATE_LIMIT_STATES.NEAR_LIMIT
      ? META_RATE_LIMIT_NEAR_PAUSE_MINUTES
      : parsePositiveInt(process.env.GRAPH_ERROR_PAUSE_MINUTES, 60);
    const pausedUntil = getMetaRateLimitPauseUntil(rateLimit, fallbackMinutes);
    const reason = metaRateLimitReason(rateLimit, state);
    set.automationPausedUntil = pausedUntil;
    set.automationPauseReason = reason;
    set.metaRateLimitPausedUntil = pausedUntil;
    set.metaRateLimitPauseReason = reason;

    logAutomation(flow, 'account paused by Meta rate-limit header', {
      instagramAccountId: acct._id,
      state,
      reason,
      pausedUntil,
      rateLimit: usage,
      ...details,
    });
  }

  await dbi.collection('instagram_accounts').updateOne(
    { _id: acct._id },
    { $set: set },
  );
  Object.assign(acct, set);
}

function automationPauseState(auto) {
  if (auto?.automationPausedUntil && new Date(auto.automationPausedUntil) > new Date()) {
    return {
      paused: true,
      reason: auto.automationPauseReason || 'automation is temporarily paused',
      pausedUntil: auto.automationPausedUntil,
    };
  }
  return { paused: false };
}

function logIfAutomationPaused(auto, flow, details = {}) {
  const pause = automationPauseState(auto);
  if (!pause.paused) return false;
  logAutomation(flow, 'send skipped because automation is paused', {
    automationId: auto?._id || null,
    reason: pause.reason,
    pausedUntil: pause.pausedUntil || null,
    ...details,
  });
  return true;
}

async function pauseAutomationForObjectFailures(dbi, auto, acct, details = {}) {
  if (!auto?._id || !acct?._id) return false;
  const windowMinutes = parsePositiveInt(process.env.OBJECT_ERROR_GUARD_WINDOW_MINUTES, 10);
  const threshold = parsePositiveInt(process.env.OBJECT_ERROR_GUARD_THRESHOLD, 5);
  const pauseMinutes = parsePositiveInt(process.env.OBJECT_ERROR_AUTOMATION_PAUSE_MINUTES, 15);
  const since = new Date(Date.now() - windowMinutes * 60 * 1000);
  const count = await dbi.collection('automation_deliveries').countDocuments({
    automationId: auto._id,
    instagramAccountId: acct._id,
    status: 'send_failed',
    updatedAt: { $gte: since },
    $or: [
      { 'sendError.classification': GRAPH_ERROR_CLASSIFICATIONS.OBJECT_UNAVAILABLE },
      { 'sendError.graphDetails.classification': GRAPH_ERROR_CLASSIFICATIONS.OBJECT_UNAVAILABLE },
    ],
  });
  if (count < threshold) return false;

  await dbi.collection('automations').updateOne(
    { _id: auto._id },
    {
      $set: {
        automationPausedUntil: new Date(Date.now() + pauseMinutes * 60 * 1000),
        automationPauseReason: `${threshold}+ unavailable Instagram comment objects in ${windowMinutes} minutes`,
        updatedAt: new Date(),
      },
    },
  );
  logAutomation('comment-dm', 'automation paused by object-unavailable guard', {
    automationId: auto._id,
    instagramAccountId: acct._id,
    count,
    threshold,
    windowMinutes,
    pauseMinutes,
    ...details,
  });
  return true;
}

async function assertCanSendForAccount(dbi, acct, flow, details = {}) {
  const pause = accountPauseState(acct);
  if (pause.paused) {
    logAutomation(flow, 'send skipped because automations are paused', {
      instagramAccountId: acct?._id || null,
      reason: pause.reason,
      pausedUntil: pause.pausedUntil || null,
      ...details,
    });
    return false;
  }

  const windowSeconds = 60 * 60;
  const key = `rate:${acct._id}:${Math.floor(Date.now() / (windowSeconds * 1000))}`;
  const count = await redis.incr(key);
  if (count === 1) await redis.expire(key, windowSeconds + 60);
  if (count > ACCOUNT_SEND_LIMIT_PER_HOUR) {
    const minutes = parsePositiveInt(process.env.RATE_LIMIT_PAUSE_MINUTES, 60);
    await dbi.collection('instagram_accounts').updateOne(
      { _id: acct._id },
      {
        $set: {
          automationPausedUntil: new Date(Date.now() + minutes * 60 * 1000),
          automationPauseReason: `Per-account send limit exceeded (${ACCOUNT_SEND_LIMIT_PER_HOUR}/hour)`,
          updatedAt: new Date(),
        },
      },
    );
    logAutomation(flow, 'send skipped by per-account rate limit', {
      instagramAccountId: acct._id,
      limit: ACCOUNT_SEND_LIMIT_PER_HOUR,
      count,
      ...details,
    });
    return false;
  }
  return true;
}

function logIfAutomationsPaused(acct, flow, details = {}) {
  const pause = accountPauseState(acct);
  if (!pause.paused) return false;
  logAutomation(flow, 'send skipped because automations are paused', {
    instagramAccountId: acct?._id || null,
    reason: pause.reason,
    pausedUntil: pause.pausedUntil || null,
    ...details,
  });
  return true;
}

async function recordDeliveryPostProcessError(dbi, key, error) {
  await updateAutomationDelivery(dbi, key, {
    postProcessError: serializeError(error),
  });
}

async function findConnectedAccountForMessaging(dbi, ids) {
  const candidates = [...new Set(ids.filter(Boolean).map(String))];
  if (candidates.length === 0) return null;

  return dbi.collection('instagram_accounts').findOne({
    $or: [
      { instagramBusinessAccountId: { $in: candidates } },
      { instagramUserId: { $in: candidates } },
      { instagramWebhookIds: { $in: candidates } },
    ],
  });
}

async function findConnectedAccountForEntry(dbi, ids) {
  return findConnectedAccountForMessaging(dbi, ids);
}

async function isWorkspaceActive(dbi, workspaceId) {
  if (!workspaceId) return true;
  const workspace = await dbi.collection('workspaces').findOne({ _id: workspaceId });
  return !!workspace && (workspace.status || 'active') === 'active';
}

async function rememberWebhookIds(dbi, accountId, ids) {
  const candidates = [...new Set(ids.filter(Boolean).map(String))];
  if (!accountId || candidates.length === 0) return;

  await dbi.collection('instagram_accounts').updateOne(
    { _id: accountId },
    {
      $addToSet: { instagramWebhookIds: { $each: candidates } },
      $set: { updatedAt: new Date() },
    },
  );
}

async function ensureAudienceIndexes(dbi) {
  if (!audienceIndexesPromise) {
    audienceIndexesPromise = Promise.all([
      dbi.collection('audience_members').createIndex({ workspaceId: 1, instagramScopedUserId: 1 }, { unique: true }),
      dbi.collection('audience_members').createIndex({ userId: 1, workspaceId: 1, lastTriggeredAt: -1 }),
    ]).catch((e) => {
      audienceIndexesPromise = null;
      logAutomation('audience', 'index setup failed', { error: e?.message });
    });
  }
  await audienceIndexesPromise;
}

async function upsertAudienceMember(dbi, {
  auto,
  acct,
  instagramScopedUserId,
  username = null,
  displayName = null,
  triggerType,
  text,
  at = new Date(),
}) {
  const scopedId = instagramScopedUserId
    ? String(instagramScopedUserId)
    : (username ? `username:${String(username).toLowerCase()}` : null);
  if (!scopedId || !auto?.userId || !acct?._id || !(auto.workspaceId || acct.workspaceId)) {
    return null;
  }
  await ensureAudienceIndexes(dbi);
  const inc = { triggerCount: 1 };
  if (triggerType === 'comment') inc.commentTriggerCount = 1;
  if (triggerType === 'dm') inc.dmTriggerCount = 1;
  const setOnInsert = {
    _id: uuidv4(),
    firstSeenAt: at,
  };
  if (!inc.commentTriggerCount) setOnInsert.commentTriggerCount = 0;
  if (!inc.dmTriggerCount) setOnInsert.dmTriggerCount = 0;

  const set = {
    userId: auto.userId,
    workspaceId: auto.workspaceId || acct.workspaceId,
    instagramAccountId: auto.instagramAccountId || acct._id,
    instagramScopedUserId: scopedId,
    lastSeenAt: at,
    lastTriggeredAt: at,
    lastAutomationId: auto._id,
    lastAutomationName: auto.name || (auto.keywords && auto.keywords[0]) || auto.triggerWord || 'Automation',
    lastMessageText: String(text || '').slice(0, 1000),
    updatedAt: at,
  };
  if (username) set.username = String(username).replace(/^@/, '');
  if (displayName) set.displayName = displayName;

  const result = await dbi.collection('audience_members').findOneAndUpdate(
    { workspaceId: set.workspaceId, instagramScopedUserId: scopedId },
    {
      $setOnInsert: setOnInsert,
      $set: set,
      $inc: inc,
    },
    { upsert: true, returnDocument: 'after' },
  );
  return result.value || result;
}

async function processInstagramPostShare({ dbi, job, msg, igUserId, senderId, recipientId, shares }) {
  if (!senderId || shares.length === 0) return false;

  const accountLookupIds = [recipientId, igUserId];
  const acct = await findConnectedAccountForMessaging(dbi, accountLookupIds);
  if (!acct) {
    logAutomation('post-share-dm', 'no connected instagram account found for shared post', {
      jobId: job.id,
      senderId,
      lookupIds: accountLookupIds.filter(Boolean),
    });
    return true;
  }
  await rememberWebhookIds(dbi, acct._id, accountLookupIds);
  if (!(await isWorkspaceActive(dbi, acct.workspaceId))) {
    logAutomation('post-share-dm', 'skipped disabled workspace', {
      jobId: job.id,
      workspaceId: acct.workspaceId || null,
      instagramAccountId: acct._id,
    });
    return true;
  }

  const automations = await dbi.collection('automations').find({
    instagramAccountId: acct._id,
    workspaceId: acct.workspaceId,
    type: 'comment_dm',
    isActive: true,
    respondToPostShares: true,
  }).sort({ createdAt: 1 }).toArray();
  const match = findMatchingInstagramPostShare(automations, shares);
  if (!match) {
    logAutomation('post-share-dm', 'shared post did not match an enabled automation', {
      jobId: job.id,
      instagramAccountId: acct._id,
      senderId,
      postKeys: shares.map(share => share.postKey),
      candidates: automations.length,
    });
    return false;
  }
  const { automation: auto, share } = match;
  const dmText = String(auto.dmText || auto.dmMessage || '').trim();
  if (!dmText) {
    logAutomation('post-share-dm', 'skipped matched automation with no dm message', {
      jobId: job.id,
      automationId: auto._id,
    });
    return true;
  }
  if (logIfAutomationsPaused(acct, 'post-share-dm', { automationId: auto._id, senderId })) return true;
  if (logIfAutomationPaused(auto, 'post-share-dm', {
    instagramAccountId: acct._id,
    senderId,
  })) return true;

  const canSend = await assertCanSendForAccount(dbi, acct, 'post-share-dm', {
    jobId: job.id,
    automationId: auto._id,
    senderId,
  });
  if (!canSend) return true;

  const sourceEventId = dmSourceEventId(msg, senderId, recipientId, share.url);
  const deliveryKey = `post_share_dm:${auto._id}:${sourceEventId}`;
  const delivery = await claimAutomationDelivery(dbi, {
    key: deliveryKey,
    automationId: auto._id,
    workspaceId: auto.workspaceId || acct.workspaceId || null,
    instagramAccountId: auto.instagramAccountId,
    flow: 'post-share-dm',
    sourceEventId,
    jobId: job.id,
  });
  if (!delivery.claimed) {
    logAutomation('post-share-dm', 'duplicate delivery skipped', {
      jobId: job.id,
      automationId: auto._id,
      deliveryKey,
    });
    return true;
  }

  const quota = await consumeTriggerOrRecordLimit(dbi, {
    auto,
    acct,
    deliveryKey,
    flow: 'post-share-dm',
    sourceEventId,
    jobId: job.id,
    fromUserId: senderId,
  });
  if (!quota.ok) return true;

  const buttons = (auto.dmButtons || []).filter(button => button.title && button.url).slice(0, 3);
  let dmResult = null;
  try {
    if (auto.askToFollow) {
      dmResult = await sendFollowPrompt(
        acct.accessToken,
        { id: senderId },
        auto.followMessage || `Follow @${acct.username || ''} first to unlock this!`,
        auto.followButtonText || 'I Followed',
        auto._id,
        acct.username,
      );
    } else {
      dmResult = buttons.length > 0
        ? await sendDMButtons(acct.accessToken, { id: senderId }, dmText, buttons)
        : await sendDMText(acct.accessToken, { id: senderId }, dmText);
    }
    await recordMetaRateLimitUsage(dbi, acct, dmResult, 'post-share-dm', {
      jobId: job.id,
      automationId: auto._id,
      senderId,
      stage: auto.askToFollow ? 'follow_prompt' : 'shared_post_dm',
    });
    const sendError = graphSendError(dmResult, 'Instagram rejected the shared-post DM');
    if (sendError) throw sendError;
    await markDeliverySent(dbi, deliveryKey, { dmResult, sharedPostUrl: share.url });
  } catch (e) {
    await markDeliveryFailed(dbi, deliveryKey, e);
    await pauseAccountForGraphRisk(dbi, acct, e);
    logAutomation('post-share-dm', 'send failed after delivery claim', {
      jobId: job.id,
      automationId: auto._id,
      deliveryKey,
      error: e?.message,
    });
    return true;
  }

  try {
    const profile = await getUserProfile(acct.accessToken, senderId);
    await recordMetaRateLimitUsage(dbi, acct, profile, 'post-share-dm', {
      jobId: job.id,
      automationId: auto._id,
      senderId,
      stage: 'user_profile',
    });
    const audienceMember = await upsertAudienceMember(dbi, {
      auto,
      acct,
      instagramScopedUserId: senderId,
      username: profile.ok ? profile.username : null,
      displayName: profile.ok ? profile.displayName : null,
      triggerType: 'dm',
      text: `Shared post: ${share.url}`,
    });
    await dbi.collection('automation_runs').insertOne({
      _id: uuidv4(),
      automationId: auto._id,
      userId: auto.userId,
      workspaceId: auto.workspaceId || acct.workspaceId || null,
      instagramAccountId: auto.instagramAccountId,
      audienceMemberId: audienceMember?._id || null,
      fromUserId: senderId,
      fromUsername: profile.ok ? profile.username : null,
      fromDisplayName: profile.ok ? profile.displayName : null,
      sourceMessageId: sourceEventId,
      sharedPostUrl: share.url,
      sharedPostKey: share.postKey,
      replyUsed: dmText,
      dmResult,
      flow: 'post-share-dm',
      ranAt: new Date(),
    });
    logAutomation('post-share-dm', 'automation run recorded', {
      jobId: job.id,
      automationId: auto._id,
      senderId,
      sharedPostKey: share.postKey,
    });
  } catch (e) {
    await recordDeliveryPostProcessError(dbi, deliveryKey, e);
    logAutomation('post-share-dm', 'post-send persistence failed', {
      jobId: job.id,
      automationId: auto._id,
      deliveryKey,
      error: e?.message,
    });
  }
  return true;
}

// ---- Job processor ----
async function processJob(job) {
  const body = job.data;
  const dbi = await db();
  logAutomation('job', 'received', {
    jobId: job.id,
    object: body?.object,
    entries: Array.isArray(body?.entry) ? body.entry.length : 0,
  });

  if (body.object !== 'instagram' || !Array.isArray(body.entry)) {
    logAutomation('job', 'ignored unsupported webhook payload', {
      jobId: job.id,
      object: body?.object,
      hasEntryArray: Array.isArray(body?.entry),
    });
    return;
  }

  for (const entry of body.entry) {
    const igUserId = String(entry.id);
    logAutomation('entry', 'processing instagram entry', {
      jobId: job.id,
      igUserId,
      changes: (entry.changes || []).length,
      messaging: (entry.messaging || []).length,
    });

    // Comments
    for (const change of entry.changes || []) {
      if (change.field !== 'comments') continue;
      const v = change.value || {};
      const commentText = (v.text || '').toLowerCase();
      const commentId = v.id;
      const mediaId = v.media?.id || v.media_id;
      const parentId = v.parent_id || null;
      const mediaProductType = v.media?.media_product_type || v.media_product_type || null;
      const fromId = v.from?.id;
      const fromUsername = v.from?.username || null;
      if (!commentId || !mediaId) {
        logAutomation('comment-dm', 'skipped comment event missing ids', {
          jobId: job.id,
          commentId: commentId || null,
          mediaId: mediaId || null,
        });
        continue;
      }

      logAutomation('comment-dm', 'comment event received', {
        jobId: job.id,
        mediaId,
        parentId,
        mediaProductType,
        commentId,
        fromId: fromId || null,
        fromUsername,
        text: textPreview(v.text),
      });

      const acct = await findConnectedAccountForEntry(dbi, [igUserId]);
      if (!acct) {
        logAutomation('comment-dm', 'skipped because connected instagram account was not found', {
          jobId: job.id,
          igUserId,
          mediaId,
        });
        continue;
      }
      await rememberWebhookIds(dbi, acct._id, [igUserId]);

      if (isOwnAccountComment({ acct, entryId: igUserId, fromId, fromUsername })) {
        logAutomation('comment-dm', 'skipped own account comment', {
          jobId: job.id,
          commentId,
          fromId: fromId || null,
          fromUsername,
          instagramAccountId: acct._id,
        });
        continue;
      }

      if (!(await isWorkspaceActive(dbi, acct.workspaceId))) {
        logAutomation('comment-dm', 'skipped disabled workspace', {
          jobId: job.id,
          workspaceId: acct.workspaceId || null,
          instagramAccountId: acct._id,
        });
        continue;
      }

      const automations = await dbi.collection('automations').find({
        instagramAccountId: acct._id,
        workspaceId: acct.workspaceId,
        postId: mediaId,
        isActive: true,
      }).sort({ createdAt: -1 }).toArray();
      logAutomation('comment-dm', 'active automations loaded for post', {
        jobId: job.id,
        mediaId,
        instagramAccountId: acct._id,
        workspaceId: acct.workspaceId || null,
        count: automations.length,
      });
      if (automations.length === 0) continue;

      for (const auto of automations) {
        const keywords = auto.keywords?.length ? auto.keywords : (auto.triggerWord ? [auto.triggerWord] : []);
        const matchType = auto.matchType || 'contains';
        const matched = matchesKeyword(commentText, keywords, matchType);
        logAutomation('comment-dm', 'automation keyword check', {
          jobId: job.id,
          automationId: auto._id,
          automationName: auto.name || null,
          keywords,
          matchType,
          matched,
        });
        if (!matched) continue;

        const replies = auto.replyMessages?.length ? auto.replyMessages : [auto.replyMessage];
        if (!replies.filter(Boolean).length) {
          logAutomation('comment-dm', 'skipped matched automation with no reply messages', {
            jobId: job.id,
            automationId: auto._id,
          });
          continue;
        }
        if (logIfAutomationsPaused(acct, 'comment-dm', {
          jobId: job.id,
          automationId: auto._id,
          commentId,
        })) {
          break;
        }
        if (logIfAutomationPaused(auto, 'comment-dm', {
          jobId: job.id,
          instagramAccountId: acct._id,
          commentId,
        })) {
          break;
        }

        const deliveryKey = `comment_dm:${auto._id}:${commentId}`;
        const delivery = await claimAutomationDelivery(dbi, {
          key: deliveryKey,
          automationId: auto._id,
          workspaceId: auto.workspaceId || acct.workspaceId || null,
          instagramAccountId: auto.instagramAccountId,
          flow: 'comment_dm',
          sourceEventId: commentId,
          jobId: job.id,
        });
        if (!delivery.claimed) {
          logAutomation('comment-dm', 'duplicate delivery skipped', {
            jobId: job.id,
            automationId: auto._id,
            deliveryKey,
          });
          continue;
        }
        const quota = await consumeTriggerOrRecordLimit(dbi, {
          auto,
          acct,
          deliveryKey,
          flow: auto.askToFollow ? 'follow-gated' : 'direct',
          sourceEventId: commentId,
          jobId: job.id,
          commentText: v.text,
          fromUserId: fromId,
          fromUsername,
        });
        if (!quota.ok) break;
        const canSend = await assertCanSendForAccount(dbi, acct, 'comment-dm', {
          jobId: job.id,
          automationId: auto._id,
          commentId,
        });
        if (!canSend) break;

        const reply = replies[Math.floor(Math.random() * replies.length)];
        let r1 = null;
        let rDM = null;
        let publicReplyError = null;
        try {
        r1 = await replyToComment(acct.accessToken, commentId, reply);
        await recordMetaRateLimitUsage(dbi, acct, r1, 'comment-dm', {
          jobId: job.id,
          automationId: auto._id,
          stage: 'public_reply',
          commentId,
        });
        logAutomation('comment-dm', 'public reply attempted', {
          jobId: job.id,
          automationId: auto._id,
          stage: 'public_reply',
          ok: r1.ok,
          error: graphError(r1),
          graphError: graphErrorDetails(r1),
        });
        const replyError = graphSendError(r1, 'Instagram rejected the public comment reply');
        if (replyError) {
          replyError.stage = 'public_reply';
          const classification = replyError.graphClassification || classifyGraphError(replyError);
          if (classification === GRAPH_ERROR_CLASSIFICATIONS.OBJECT_UNAVAILABLE) {
            publicReplyError = replyError;
            await updateAutomationDelivery(dbi, deliveryKey, {
              publicReplyFailed: true,
              publicReplyError: serializeError(replyError),
            });
            logAutomation('comment-dm', 'continuing to private reply after public reply object unavailable', {
              jobId: job.id,
              automationId: auto._id,
              deliveryKey,
              commentId,
              graphError: graphErrorDetails(replyError),
            });
          } else {
            throw replyError;
          }
        }

        if (auto.askToFollow) {
          rDM = await sendFollowPrompt(
            acct.accessToken, { comment_id: commentId },
            auto.followMessage || `Follow @${acct.username} first to unlock 🎁`,
            auto.followButtonText || 'I Followed ✓', auto._id, acct.username,
          );
        } else {
          const dmText = auto.dmText || auto.dmMessage || '';
          const buttons = (auto.dmButtons || []).filter(b => b.title && b.url).slice(0, 3);
          rDM = buttons.length > 0
            ? await sendDMButtons(acct.accessToken, { comment_id: commentId }, dmText, buttons)
            : await sendDMText(acct.accessToken, { comment_id: commentId }, dmText);
        }
        await recordMetaRateLimitUsage(dbi, acct, rDM, 'comment-dm', {
          jobId: job.id,
          automationId: auto._id,
          stage: 'private_reply',
          commentId,
        });
        logAutomation('comment-dm', 'dm attempted', {
          jobId: job.id,
          automationId: auto._id,
          stage: 'private_reply',
          flow: auto.askToFollow ? 'follow-gated' : 'direct',
          ok: rDM?.ok,
          error: graphError(rDM),
          graphError: graphErrorDetails(rDM),
        });
          const dmError = graphSendError(rDM, 'Instagram rejected the private reply DM');
          if (dmError) {
            dmError.stage = 'private_reply';
            throw dmError;
          }
          if (publicReplyError) {
            await updateAutomationDelivery(dbi, deliveryKey, {
              status: 'sent_with_public_reply_failed',
              sendResult: {
                replyResult: r1,
                dmResult: rDM,
                publicReplyError: serializeError(publicReplyError),
                flow: auto.askToFollow ? 'follow-gated' : 'direct',
              },
              sentAt: new Date(),
            });
          } else {
            await markDeliverySent(dbi, deliveryKey, {
              replyResult: r1,
              dmResult: rDM,
              flow: auto.askToFollow ? 'follow-gated' : 'direct',
            });
          }
        } catch (e) {
          await markDeliveryFailed(dbi, deliveryKey, e);
          await pauseAccountForGraphRisk(dbi, acct, e);
          if ((e?.graphClassification || classifyGraphError(e)) === GRAPH_ERROR_CLASSIFICATIONS.OBJECT_UNAVAILABLE) {
            await pauseAutomationForObjectFailures(dbi, auto, acct, {
              jobId: job.id,
              deliveryKey,
              commentId,
              stage: e?.stage || null,
            });
          }
          logAutomation('comment-dm', 'send failed after delivery claim', {
            jobId: job.id,
            automationId: auto._id,
            deliveryKey,
            stage: e?.stage || null,
            error: e?.message,
            graphError: graphErrorDetails(e),
          });
          break;
        }

        try {
        const audienceMember = await upsertAudienceMember(dbi, {
          auto,
          acct,
          instagramScopedUserId: fromId,
          username: fromUsername,
          triggerType: 'comment',
          text: v.text,
        });

        await dbi.collection('automation_runs').insertOne({
          _id: uuidv4(),
          automationId: auto._id,
          userId: auto.userId,
          workspaceId: auto.workspaceId || acct.workspaceId || null,
          instagramAccountId: auto.instagramAccountId,
          audienceMemberId: audienceMember?._id || null,
          commentId, fromUserId: fromId, fromUsername, fromDisplayName: null, commentText: v.text,
          replyUsed: reply, replyResult: r1, dmResult: rDM,
          flow: auto.askToFollow ? 'follow-gated' : 'direct',
          publicReplyFailed: !!publicReplyError,
          publicReplyError: publicReplyError ? serializeError(publicReplyError) : null,
          ranAt: new Date(),
        });
        console.log(`[worker] processed comment match for automation ${auto._id}`);
        } catch (e) {
          await recordDeliveryPostProcessError(dbi, deliveryKey, e);
          logAutomation('comment-dm', 'post-send persistence failed', {
            jobId: job.id,
            automationId: auto._id,
            deliveryKey,
            error: e?.message,
          });
        }
        break;
      }
    }

    // Postbacks (I Followed) and DM auto-replies
    for (const msg of entry.messaging || []) {
      // Skip echoes (our own outgoing messages re-delivered as webhooks)
      if (msg.message?.is_echo) {
        logAutomation('messaging', 'skipped echo message', {
          jobId: job.id,
          igUserId,
          mid: msg.message?.mid || null,
        });
        continue;
      }

      const senderId = msg.sender?.id;
      const recipientId = msg.recipient?.id;
      const postShares = extractInstagramPostShares(msg.message);
      logAutomation('messaging', 'message event received', {
        jobId: job.id,
        igUserId,
        senderId: senderId || null,
        recipientId: recipientId || null,
        hasText: !!msg.message?.text,
        text: textPreview(msg.message?.text),
        hasPostback: !!msg.postback?.payload,
        postbackPayload: msg.postback?.payload || null,
        postShares: postShares.map(share => share.postKey),
      });

      // 1) Handle "I Followed" postback button
      if (msg.postback?.payload?.startsWith('RP_FOLLOW:') && senderId) {
        const automationId = msg.postback.payload.slice('RP_FOLLOW:'.length);
        const auto = await dbi.collection('automations').findOne({ _id: automationId });
        if (!auto || !auto.isActive) {
          logAutomation('follow-gate', 'skipped inactive or missing automation', {
            jobId: job.id,
            automationId,
            found: !!auto,
            isActive: !!auto?.isActive,
          });
          continue;
        }
        const acct = await dbi.collection('instagram_accounts').findOne({ _id: auto.instagramAccountId });
        if (!acct) {
          logAutomation('follow-gate', 'skipped because instagram account was not found', {
            jobId: job.id,
            automationId,
            instagramAccountId: auto.instagramAccountId,
          });
          continue;
        }
        if (!(await isWorkspaceActive(dbi, auto.workspaceId || acct.workspaceId))) {
          logAutomation('follow-gate', 'skipped disabled workspace', {
            jobId: job.id,
            automationId,
            workspaceId: auto.workspaceId || acct.workspaceId || null,
          });
          continue;
        }

        const followCheck = await checkUserFollowsBusiness(acct.accessToken, senderId);
        await recordMetaRateLimitUsage(dbi, acct, followCheck, 'follow-gate', {
          jobId: job.id,
          automationId,
          senderId,
          stage: 'follow_check',
        });
        logAutomation('follow-gate', 'follow check completed', {
          jobId: job.id,
          automationId,
          senderId,
          isFollowing: followCheck.isFollowing,
          ok: followCheck.ok,
        });
        if (!followCheck.ok) {
          logAutomation('follow-gate', 'skipped send because follow check failed', {
            jobId: job.id,
            automationId,
            senderId,
            error: followCheck.error || followCheck.raw?.error?.message || null,
          });
          continue;
        }
        if (!followCheck.isFollowing) {
          const sourceEventId = postbackSourceEventId(msg, senderId, recipientId);
          const canSend = await assertCanSendForAccount(dbi, acct, 'follow-gate', {
            jobId: job.id,
            automationId,
            senderId,
            flow: 'follow-not-verified',
          });
          if (!canSend) continue;

          const cooldownKey = `follow_retry:${automationId}:${senderId}`;
          const cooldown = await claimCooldown(dbi, {
            key: cooldownKey,
            automationId: auto._id,
            workspaceId: auto.workspaceId || acct.workspaceId || null,
            instagramAccountId: auto.instagramAccountId,
            flow: 'follow-retry-cooldown',
            sourceEventId: senderId,
            seconds: FOLLOW_RETRY_COOLDOWN_SECONDS,
            jobId: job.id,
          });
          if (!cooldown.claimed) {
            logAutomation('follow-gate', 'retry prompt skipped by cooldown', {
              jobId: job.id,
              automationId,
              senderId,
              cooldownSeconds: FOLLOW_RETRY_COOLDOWN_SECONDS,
            });
            continue;
          }

          const deliveryKey = `follow:${automationId}:${senderId}:${sourceEventId}`;
          const delivery = await claimAutomationDelivery(dbi, {
            key: deliveryKey,
            automationId: auto._id,
            workspaceId: auto.workspaceId || acct.workspaceId || null,
            instagramAccountId: auto.instagramAccountId,
            flow: 'follow-not-verified',
            sourceEventId,
            jobId: job.id,
          });
          if (!delivery.claimed) {
            logAutomation('follow-gate', 'duplicate delivery skipped', {
              jobId: job.id,
              automationId,
              deliveryKey,
            });
            continue;
          }
          const quota = await consumeTriggerOrRecordLimit(dbi, {
            auto,
            acct,
            deliveryKey,
            flow: 'follow-not-verified',
            sourceEventId,
            jobId: job.id,
            fromUserId: senderId,
          });
          if (!quota.ok) continue;
          let retry = null;
          try {
          retry = await sendFollowPrompt(
            acct.accessToken, { id: senderId },
            `Almost there! 🙏 We don't see your follow yet. Please follow @${acct.username} first, then tap below.`,
            auto.followButtonText || 'I Followed ✓', auto._id, acct.username,
          );
          await recordMetaRateLimitUsage(dbi, acct, retry, 'follow-gate', {
            jobId: job.id,
            automationId,
            senderId,
            stage: 'follow_retry_prompt',
          });
          const retryError = graphSendError(retry, 'Instagram rejected the follow retry prompt');
          if (retryError) throw retryError;
          await markDeliverySent(dbi, deliveryKey, { retryResult: retry, followCheck });
          } catch (e) {
            await markDeliveryFailed(dbi, deliveryKey, e);
            await pauseAccountForGraphRisk(dbi, acct, e);
            logAutomation('follow-gate', 'send failed after delivery claim', {
              jobId: job.id,
              automationId,
              deliveryKey,
              error: e?.message,
            });
            continue;
          }
          try {
          await dbi.collection('automation_runs').insertOne({
            _id: uuidv4(), automationId: auto._id, userId: auto.userId,
            workspaceId: auto.workspaceId || acct.workspaceId || null,
            instagramAccountId: auto.instagramAccountId,
            fromUserId: senderId, flow: 'follow-not-verified',
            followCheck, retryResult: retry, ranAt: new Date(),
          });
          } catch (e) {
            await recordDeliveryPostProcessError(dbi, deliveryKey, e);
            logAutomation('follow-gate', 'post-send persistence failed', {
              jobId: job.id,
              automationId,
              deliveryKey,
              error: e?.message,
            });
          }
          continue;
        }

        const dmText = auto.dmText || auto.dmMessage || '';
        const buttons = (auto.dmButtons || []).filter(b => b.title && b.url).slice(0, 3);
        const sourceEventId = postbackSourceEventId(msg, senderId, recipientId);
        const canSend = await assertCanSendForAccount(dbi, acct, 'follow-gate', {
          jobId: job.id,
          automationId,
          senderId,
          flow: 'follow-confirmed',
        });
        if (!canSend) continue;

        const cooldownKey = `follow_confirmed:${automationId}:${senderId}`;
        const cooldown = await claimCooldown(dbi, {
          key: cooldownKey,
          automationId: auto._id,
          workspaceId: auto.workspaceId || acct.workspaceId || null,
          instagramAccountId: auto.instagramAccountId,
          flow: 'follow-confirmed-cooldown',
          sourceEventId: senderId,
          seconds: FOLLOW_RETRY_COOLDOWN_SECONDS,
          jobId: job.id,
        });
        if (!cooldown.claimed) {
          logAutomation('follow-gate', 'confirmed follow DM skipped by cooldown', {
            jobId: job.id,
            automationId,
            senderId,
            cooldownSeconds: FOLLOW_RETRY_COOLDOWN_SECONDS,
          });
          continue;
        }

        const deliveryKey = `follow:${automationId}:${senderId}:${sourceEventId}`;
        const delivery = await claimAutomationDelivery(dbi, {
          key: deliveryKey,
          automationId: auto._id,
          workspaceId: auto.workspaceId || acct.workspaceId || null,
          instagramAccountId: auto.instagramAccountId,
          flow: 'follow-confirmed',
          sourceEventId,
          jobId: job.id,
        });
        if (!delivery.claimed) {
          logAutomation('follow-gate', 'duplicate delivery skipped', {
            jobId: job.id,
            automationId,
            deliveryKey,
          });
          continue;
        }
        const quota = await consumeTriggerOrRecordLimit(dbi, {
          auto,
          acct,
          deliveryKey,
          flow: 'follow-confirmed',
          sourceEventId,
          jobId: job.id,
          fromUserId: senderId,
        });
        if (!quota.ok) continue;
        let rDM = null;
        try {
        rDM = buttons.length > 0
          ? await sendDMButtons(acct.accessToken, { id: senderId }, dmText, buttons)
          : await sendDMText(acct.accessToken, { id: senderId }, dmText);
        await recordMetaRateLimitUsage(dbi, acct, rDM, 'follow-gate', {
          jobId: job.id,
          automationId,
          senderId,
          stage: 'follow_confirmed_dm',
        });
        const dmError = graphSendError(rDM, 'Instagram rejected the follow-confirmed DM');
        if (dmError) throw dmError;

        await markDeliverySent(dbi, deliveryKey, { dmResult: rDM, followCheck });
        } catch (e) {
          await markDeliveryFailed(dbi, deliveryKey, e);
          await pauseAccountForGraphRisk(dbi, acct, e);
          logAutomation('follow-gate', 'send failed after delivery claim', {
            jobId: job.id,
            automationId,
            deliveryKey,
            error: e?.message,
          });
          continue;
        }
        try {
        await dbi.collection('automation_runs').insertOne({
          _id: uuidv4(), automationId: auto._id, userId: auto.userId,
          workspaceId: auto.workspaceId || acct.workspaceId || null,
          instagramAccountId: auto.instagramAccountId,
          fromUserId: senderId, dmResult: rDM,
          flow: 'follow-confirmed', followCheck, ranAt: new Date(),
        });
        console.log(`[worker] post-follow DM sent for ${automationId}`);
        } catch (e) {
          await recordDeliveryPostProcessError(dbi, deliveryKey, e);
          logAutomation('follow-gate', 'post-send persistence failed', {
            jobId: job.id,
            automationId,
            deliveryKey,
            error: e?.message,
          });
        }
        continue;
      }

      // 2) SHARED POST DM: the selected post or reel was sent to this inbox.
      if (postShares.length > 0 && senderId) {
        const handled = await processInstagramPostShare({
          dbi,
          job,
          msg,
          igUserId,
          senderId,
          recipientId,
          shares: postShares,
        });
        if (handled) continue;
      }

      // 3) DM AUTO-REPLY: a regular incoming DM with text
      const incomingText = msg.message?.text;
      if (incomingText && senderId) {
        logAutomation('dm-auto-reply', 'checking incoming dm text', {
          jobId: job.id,
          igUserId,
          senderId,
          recipientId: recipientId || null,
          text: textPreview(incomingText),
        });

        // Per Meta's messaging payload, recipient.id identifies the professional
        // account receiving the message. entry.id is kept as a fallback because
        // webhook examples and login modes can vary.
        const accountLookupIds = [recipientId, igUserId];
        const acct = await findConnectedAccountForMessaging(dbi, accountLookupIds);
        if (!acct) {
          logAutomation('dm-auto-reply', 'no connected instagram account found for messaging entry', {
            jobId: job.id,
            igUserId,
            recipientId: recipientId || null,
            lookupIds: accountLookupIds.filter(Boolean),
            senderId,
          });
          continue;
        }
        await rememberWebhookIds(dbi, acct._id, accountLookupIds);
        if (!(await isWorkspaceActive(dbi, acct.workspaceId))) {
          logAutomation('dm-auto-reply', 'skipped disabled workspace', {
            jobId: job.id,
            workspaceId: acct.workspaceId || null,
            instagramAccountId: acct._id,
          });
          continue;
        }
        logAutomation('dm-auto-reply', 'connected account matched', {
          jobId: job.id,
          igUserId,
          recipientId: recipientId || null,
          lookupIds: accountLookupIds.filter(Boolean),
          instagramAccountId: acct._id,
          username: acct.username || null,
        });

        const automations = await dbi.collection('automations').find({
          instagramAccountId: acct._id,
          workspaceId: acct.workspaceId,
          type: 'dm_reply',
          isActive: true,
        }).sort({ createdAt: 1 }).toArray();
        logAutomation('dm-auto-reply', 'active dm automations loaded', {
          jobId: job.id,
          instagramAccountId: acct._id,
          count: automations.length,
        });
        if (automations.length === 0) continue;

        for (const auto of automations) {
          const keywords = auto.keywords || [];
          const matchType = auto.matchType || 'contains';
          const matched = matchesKeyword(incomingText.toLowerCase(), keywords, matchType);
          logAutomation('dm-auto-reply', 'automation keyword check', {
            jobId: job.id,
            automationId: auto._id,
            automationName: auto.name || null,
            keywords,
            matchType,
            matched,
          });
          if (!matched) continue;

          const replies = auto.replyMessages || [];
          if (!replies.filter(Boolean).length) {
            logAutomation('dm-auto-reply', 'skipped matched automation with no reply messages', {
              jobId: job.id,
              automationId: auto._id,
            });
            continue;
          }
          const reply = replies[Math.floor(Math.random() * replies.length)];
          const replyButtons = (auto.replyButtons || []).filter(b => b.title && b.url).slice(0, 3);
          const sourceEventId = dmSourceEventId(msg, senderId, recipientId, incomingText);
          const canSend = await assertCanSendForAccount(dbi, acct, 'dm-auto-reply', {
            jobId: job.id,
            automationId: auto._id,
            senderId,
          });
          if (!canSend) break;

          const cooldownKey = `dm_cooldown:${auto._id}:${senderId}`;
          const cooldown = await claimCooldown(dbi, {
            key: cooldownKey,
            automationId: auto._id,
            workspaceId: auto.workspaceId || acct.workspaceId || null,
            instagramAccountId: auto.instagramAccountId,
            flow: 'dm-reply-cooldown',
            sourceEventId: senderId,
            seconds: DM_COOLDOWN_SECONDS,
            jobId: job.id,
          });
          if (!cooldown.claimed) {
            logAutomation('dm-auto-reply', 'reply skipped by sender cooldown', {
              jobId: job.id,
              automationId: auto._id,
              senderId,
              cooldownSeconds: DM_COOLDOWN_SECONDS,
            });
            break;
          }

          const deliveryKey = `dm_reply:${auto._id}:${sourceEventId}`;
          const delivery = await claimAutomationDelivery(dbi, {
            key: deliveryKey,
            automationId: auto._id,
            workspaceId: auto.workspaceId || acct.workspaceId || null,
            instagramAccountId: auto.instagramAccountId,
            flow: 'dm_reply',
            sourceEventId,
            jobId: job.id,
          });
          if (!delivery.claimed) {
            logAutomation('dm-auto-reply', 'duplicate delivery skipped', {
              jobId: job.id,
              automationId: auto._id,
              senderId,
              deliveryKey,
            });
            break;
          }
          const quota = await consumeTriggerOrRecordLimit(dbi, {
            auto,
            acct,
            deliveryKey,
            flow: 'dm-reply',
            sourceEventId,
            jobId: job.id,
            commentText: incomingText,
            fromUserId: senderId,
          });
          if (!quota.ok) break;

          let r = null;
          try {
          r = replyButtons.length > 0
            ? await sendDMButtons(acct.accessToken, { id: senderId }, reply, replyButtons)
            : await sendDMText(acct.accessToken, { id: senderId }, reply);
        await recordMetaRateLimitUsage(dbi, acct, r, 'dm-auto-reply', {
          jobId: job.id,
          automationId: auto._id,
          senderId,
          stage: 'dm_auto_reply',
        });
        logAutomation('dm-auto-reply', 'reply send attempted', {
          jobId: job.id,
          automationId: auto._id,
            senderId,
            ok: r.ok,
            error: graphError(r),
            buttons: replyButtons.length,
          });
          const dmError = graphSendError(r, 'Instagram rejected the DM auto-reply');
          if (dmError) throw dmError;
          await markDeliverySent(dbi, deliveryKey, { dmResult: r });
          } catch (e) {
            await markDeliveryFailed(dbi, deliveryKey, e);
            await pauseAccountForGraphRisk(dbi, acct, e);
            logAutomation('dm-auto-reply', 'send failed after delivery claim', {
              jobId: job.id,
              automationId: auto._id,
              senderId,
              deliveryKey,
              error: e?.message,
            });
            break;
          }

          try {
          const profile = await getUserProfile(acct.accessToken, senderId);
          await recordMetaRateLimitUsage(dbi, acct, profile, 'dm-auto-reply', {
            jobId: job.id,
            automationId: auto._id,
            senderId,
            stage: 'user_profile',
          });
          const audienceMember = await upsertAudienceMember(dbi, {
            auto,
            acct,
            instagramScopedUserId: senderId,
            username: profile.ok ? profile.username : null,
            displayName: profile.ok ? profile.displayName : null,
            triggerType: 'dm',
            text: incomingText,
          });

          await dbi.collection('automation_runs').insertOne({
            _id: uuidv4(),
            automationId: auto._id,
            userId: auto.userId,
            workspaceId: auto.workspaceId || acct.workspaceId || null,
            instagramAccountId: auto.instagramAccountId,
            audienceMemberId: audienceMember?._id || null,
            fromUserId: senderId,
            fromUsername: profile.ok ? profile.username : null,
            fromDisplayName: profile.ok ? profile.displayName : null,
            commentText: incomingText, // re-use field for analytics
            replyUsed: reply,
            dmResult: r,
            flow: 'dm-reply',
            ranAt: new Date(),
          });
          logAutomation('dm-auto-reply', 'automation run recorded', {
            jobId: job.id,
            automationId: auto._id,
            senderId,
          });
          } catch (e) {
            await recordDeliveryPostProcessError(dbi, deliveryKey, e);
            logAutomation('dm-auto-reply', 'post-send persistence failed', {
              jobId: job.id,
              automationId: auto._id,
              senderId,
              deliveryKey,
              error: e?.message,
            });
          }
          break;
        }
      } else if (!incomingText) {
        logAutomation('dm-auto-reply', 'skipped messaging event without text', {
          jobId: job.id,
          igUserId,
          senderId: senderId || null,
        });
      } else if (!senderId) {
        logAutomation('dm-auto-reply', 'skipped messaging event without sender id', {
          jobId: job.id,
          igUserId,
          text: textPreview(incomingText),
        });
      }
    }
  }
}

const worker = new Worker(QUEUE_NAME, processJob, {
  connection: redis,
  concurrency: parseInt(process.env.WORKER_CONCURRENCY || '8', 10),
});

worker.on('completed', (job) => console.log(`[worker] job ${job.id} done`));
worker.on('failed', (job, err) => console.error(`[worker] job ${job?.id} failed:`, err.message));
worker.on('error', (e) => console.error('[worker] error', e?.message));

console.log('[worker] started, concurrency =', worker.opts.concurrency, JSON.stringify({
  automationsPaused: envFlag('AUTOMATIONS_PAUSED'),
  dmCooldownSeconds: DM_COOLDOWN_SECONDS,
  followRetryCooldownSeconds: FOLLOW_RETRY_COOLDOWN_SECONDS,
  accountSendLimitPerHour: ACCOUNT_SEND_LIMIT_PER_HOUR,
}));
