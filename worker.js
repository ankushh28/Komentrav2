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
      const fromId = v.from?.id;
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
        commentId,
        fromId: fromId || null,
        text: textPreview(v.text),
      });

      const automations = await dbi.collection('automations').find({
        postId: mediaId, isActive: true,
      }).toArray();
      logAutomation('comment-dm', 'active automations loaded for post', {
        jobId: job.id,
        mediaId,
        count: automations.length,
      });
      if (automations.length === 0) continue;

      const acct = await dbi.collection('instagram_accounts').findOne({ _id: automations[0].instagramAccountId });
      if (!acct) {
        logAutomation('comment-dm', 'skipped because instagram account was not found', {
          jobId: job.id,
          instagramAccountId: automations[0].instagramAccountId,
        });
        continue;
      }

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
        const reply = replies[Math.floor(Math.random() * replies.length)];
        const r1 = await replyToComment(acct.accessToken, commentId, reply);
        logAutomation('comment-dm', 'public reply attempted', {
          jobId: job.id,
          automationId: auto._id,
          ok: r1.ok,
          error: graphError(r1),
        });

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
        logAutomation('comment-dm', 'dm attempted', {
          jobId: job.id,
          automationId: auto._id,
          flow: auto.askToFollow ? 'follow-gated' : 'direct',
          ok: rDM?.ok,
          error: graphError(rDM),
        });

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
      logAutomation('messaging', 'message event received', {
        jobId: job.id,
        igUserId,
        senderId: senderId || null,
        recipientId: recipientId || null,
        hasText: !!msg.message?.text,
        text: textPreview(msg.message?.text),
        hasPostback: !!msg.postback?.payload,
        postbackPayload: msg.postback?.payload || null,
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

        const followCheck = await checkUserFollowsBusiness(acct.accessToken, senderId);
        logAutomation('follow-gate', 'follow check completed', {
          jobId: job.id,
          automationId,
          senderId,
          isFollowing: followCheck.isFollowing,
          ok: followCheck.ok,
        });
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
        continue;
      }

      // 2) DM AUTO-REPLY: a regular incoming DM with text
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
          type: 'dm_reply',
          isActive: true,
        }).toArray();
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

          const r = replyButtons.length > 0
            ? await sendDMButtons(acct.accessToken, { id: senderId }, reply, replyButtons)
            : await sendDMText(acct.accessToken, { id: senderId }, reply);
          logAutomation('dm-auto-reply', 'reply send attempted', {
            jobId: job.id,
            automationId: auto._id,
            senderId,
            ok: r.ok,
            error: graphError(r),
            buttons: replyButtons.length,
          });

          await dbi.collection('automation_runs').insertOne({
            _id: uuidv4(),
            automationId: auto._id,
            userId: auto.userId,
            instagramAccountId: auto.instagramAccountId,
            fromUserId: senderId,
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

console.log('[worker] started, concurrency =', worker.opts.concurrency);
