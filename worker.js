// Background worker that consumes webhook events from the BullMQ queue
// and processes them (matching automations, posting reply, sending DM).
//
// Run with:  node worker.js
//
// In production, run multiple worker instances behind your queue for horizontal scaling.

import fs from 'fs';
import path from 'path';
import { Worker } from 'bullmq';
import IORedis from 'ioredis';
import { MongoClient } from 'mongodb';
import { v4 as uuidv4 } from 'uuid';

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

const redis = new IORedis(process.env.REDIS_URL || 'redis://localhost:6379', {
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
});

const mongo = new MongoClient(process.env.MONGO_URL);
let dbPromise = mongo.connect().then(() => mongo.db(process.env.DB_NAME || 'ig_automation'));

async function db() { return dbPromise; }

// ---- Instagram API helpers ----
async function replyToComment(accessToken, commentId, message) {
  const url = `https://graph.instagram.com/${API_VERSION}/${commentId}/replies`;
  const form = new URLSearchParams();
  form.set('message', message);
  form.set('access_token', accessToken);
  const r = await fetch(url, { method: 'POST', body: form });
  return { ok: r.ok, data: await r.json() };
}
async function sendDMText(accessToken, recipient, message) {
  const url = `https://graph.instagram.com/v22.0/me/messages?access_token=${encodeURIComponent(accessToken)}`;
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ recipient, message: { text: message } }),
  });
  return { ok: r.ok, data: await r.json() };
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
  return { ok: r.ok, data: await r.json() };
}
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
      message: { attachment: { type: 'template', payload: { template_type: 'button', text, buttons } } },
    }),
  });
  return { ok: r.ok, data: await r.json() };
}
async function checkUserFollowsBusiness(accessToken, igsid) {
  const url = `https://graph.instagram.com/v22.0/${igsid}?fields=is_user_follow_business,follower_count,name,username&access_token=${encodeURIComponent(accessToken)}`;
  try {
    const r = await fetch(url);
    const d = await r.json();
    return { ok: r.ok, isFollowing: d.is_user_follow_business === true, raw: d };
  } catch (e) { return { ok: false, isFollowing: false, error: e.message }; }
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

// ---- Job processor ----
async function processJob(job) {
  const body = job.data;
  const dbi = await db();
  if (body.object !== 'instagram' || !Array.isArray(body.entry)) return;

  for (const entry of body.entry) {
    const igUserId = String(entry.id);

    // Comments
    for (const change of entry.changes || []) {
      if (change.field !== 'comments') continue;
      const v = change.value || {};
      const commentText = (v.text || '').toLowerCase();
      const commentId = v.id;
      const mediaId = v.media?.id || v.media_id;
      const fromId = v.from?.id;
      if (!commentId || !mediaId) continue;

      const automations = await dbi.collection('automations').find({
        postId: mediaId, isActive: true,
      }).toArray();
      if (automations.length === 0) continue;

      const acct = await dbi.collection('instagram_accounts').findOne({ _id: automations[0].instagramAccountId });
      if (!acct) continue;

      for (const auto of automations) {
        const keywords = auto.keywords?.length ? auto.keywords : (auto.triggerWord ? [auto.triggerWord] : []);
        const matchType = auto.matchType || 'contains';
        if (!matchesKeyword(commentText, keywords, matchType)) continue;

        const replies = auto.replyMessages?.length ? auto.replyMessages : [auto.replyMessage];
        const reply = replies[Math.floor(Math.random() * replies.length)];
        const r1 = await replyToComment(acct.accessToken, commentId, reply);

        let rDM = null;
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

        await dbi.collection('automation_runs').insertOne({
          _id: uuidv4(),
          automationId: auto._id,
          userId: auto.userId,
          instagramAccountId: auto.instagramAccountId,
          commentId, fromUserId: fromId, commentText: v.text,
          replyUsed: reply, replyResult: r1, dmResult: rDM,
          flow: auto.askToFollow ? 'follow-gated' : 'direct',
          ranAt: new Date(),
        });
        console.log(`[worker] processed comment match for automation ${auto._id}`);
      }
    }

    // Postbacks (I Followed)
    for (const msg of entry.messaging || []) {
      if (!msg.postback?.payload?.startsWith('RP_FOLLOW:')) continue;
      const automationId = msg.postback.payload.slice('RP_FOLLOW:'.length);
      const senderId = msg.sender?.id;
      if (!senderId) continue;

      const auto = await dbi.collection('automations').findOne({ _id: automationId });
      if (!auto || !auto.isActive) continue;
      const acct = await dbi.collection('instagram_accounts').findOne({ _id: auto.instagramAccountId });
      if (!acct) continue;

      const followCheck = await checkUserFollowsBusiness(acct.accessToken, senderId);
      if (!followCheck.isFollowing) {
        const retry = await sendFollowPrompt(
          acct.accessToken, { id: senderId },
          `Almost there! 🙏 We don't see your follow yet. Please follow @${acct.username} first, then tap below.`,
          auto.followButtonText || 'I Followed ✓', auto._id, acct.username,
        );
        await dbi.collection('automation_runs').insertOne({
          _id: uuidv4(), automationId: auto._id, userId: auto.userId,
          instagramAccountId: auto.instagramAccountId,
          fromUserId: senderId, flow: 'follow-not-verified',
          followCheck, retryResult: retry, ranAt: new Date(),
        });
        continue;
      }

      const dmText = auto.dmText || auto.dmMessage || '';
      const buttons = (auto.dmButtons || []).filter(b => b.title && b.url).slice(0, 3);
      const rDM = buttons.length > 0
        ? await sendDMButtons(acct.accessToken, { id: senderId }, dmText, buttons)
        : await sendDMText(acct.accessToken, { id: senderId }, dmText);

      await dbi.collection('automation_runs').insertOne({
        _id: uuidv4(), automationId: auto._id, userId: auto.userId,
        instagramAccountId: auto.instagramAccountId,
        fromUserId: senderId, dmResult: rDM,
        flow: 'follow-confirmed', followCheck, ranAt: new Date(),
      });
      console.log(`[worker] post-follow DM sent for ${automationId}`);
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

console.log('[worker] started, concurrency =', worker.opts.concurrency);
