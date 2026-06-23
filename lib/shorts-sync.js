import { Queue } from 'bullmq';
import { getRedis } from './redis.js';
import { isPaidPlan } from './plans.js';

export const SHORTS_SYNC_QUEUE = 'shorts-sync';
export const SHORTS_SYNC_PRIVACY = 'private';
export const SHORTS_SYNC_METADATA_POLICY = 'smart_caption';
export const SHORTS_SYNC_MAX_SECONDS = 180;

let shortsQueue;

export function getShortsSyncQueue() {
  if (!shortsQueue) {
    shortsQueue = new Queue(SHORTS_SYNC_QUEUE, {
      connection: getRedis(),
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: 'exponential', delay: 5000 },
        removeOnComplete: { age: 60 * 60 * 24 * 7, count: 5000 },
        removeOnFail: { age: 60 * 60 * 24 * 14 },
      },
    });
  }
  return shortsQueue;
}

export function canUseShortsSync(planId) {
  return isPaidPlan(planId);
}

export async function ensureShortsSyncIndexes(db) {
  await Promise.all([
    db.collection('youtube_channels').createIndex({ userId: 1, workspaceId: 1 }, { unique: true }),
    db.collection('youtube_oauth_states').createIndex({ state: 1 }, { unique: true }),
    db.collection('youtube_oauth_states').createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
    db.collection('shorts_sync_settings').createIndex({ userId: 1, workspaceId: 1 }, { unique: true }),
    db.collection('shorts_sync_media').createIndex(
      { workspaceId: 1, instagramAccountId: 1, instagramMediaId: 1 },
      { unique: true },
    ),
    db.collection('shorts_sync_runs').createIndex({ userId: 1, workspaceId: 1, createdAt: -1 }),
    db.collection('shorts_sync_runs').createIndex({ status: 1, updatedAt: -1 }),
  ]);
}

export function normalizeShortsSyncSettings(settings = {}) {
  return {
    enabled: !!settings.enabled,
    privacyStatus: ['private', 'unlisted', 'public'].includes(settings.privacyStatus)
      ? settings.privacyStatus
      : SHORTS_SYNC_PRIVACY,
    notifySubscribers: !!settings.notifySubscribers,
    metadataPolicy: settings.metadataPolicy || SHORTS_SYNC_METADATA_POLICY,
    baselineAt: settings.baselineAt || null,
    lastScanAt: settings.lastScanAt || null,
    lastScanStatus: settings.lastScanStatus || null,
    lastScanMessage: settings.lastScanMessage || null,
    updatedAt: settings.updatedAt || null,
  };
}

function cleanText(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

export function buildShortsMetadata(media, now = new Date()) {
  const caption = String(media?.caption || '').trim();
  const firstLine = caption.split(/\r?\n/).map(cleanText).find(Boolean);
  const fallbackDate = new Intl.DateTimeFormat('en-CA', { timeZone: 'UTC' }).format(now);
  const title = cleanText(firstLine || `Instagram Short - ${fallbackDate}`).slice(0, 100);
  const parts = [];
  if (caption) parts.push(caption.slice(0, 4800));
  if (media?.permalink) parts.push(`Original Instagram post: ${media.permalink}`);

  return {
    title: title || `Instagram Short - ${fallbackDate}`,
    description: parts.join('\n\n').slice(0, 5000),
    tags: ['shorts', 'instagram'],
    categoryId: '22',
  };
}

export function evaluateShortsEligibility(probe = {}) {
  const durationSeconds = Number(probe.durationSeconds || 0);
  const width = Number(probe.width || 0);
  const height = Number(probe.height || 0);

  if (!durationSeconds || durationSeconds > SHORTS_SYNC_MAX_SECONDS) {
    return {
      ok: false,
      reason: `Video must be ${SHORTS_SYNC_MAX_SECONDS} seconds or shorter to publish as a Short.`,
      code: 'duration_too_long',
    };
  }
  if (!width || !height) {
    return {
      ok: false,
      reason: 'Video dimensions could not be detected.',
      code: 'dimensions_unknown',
    };
  }
  if (width > height) {
    return {
      ok: false,
      reason: 'Only square or vertical videos are eligible for Shorts Sync.',
      code: 'not_square_or_vertical',
    };
  }
  return { ok: true, reason: null, code: null };
}

export function publicShortsSyncRun(run) {
  return {
    id: run._id,
    instagramMediaId: run.instagramMediaId || null,
    instagramPermalink: run.instagramPermalink || null,
    caption: run.caption || null,
    thumbnailUrl: run.thumbnailUrl || null,
    status: run.status,
    type: run.type || 'upload',
    message: run.message || null,
    failureReason: run.failureReason || null,
    youtubeVideoId: run.youtubeVideoId || null,
    youtubeUrl: run.youtubeVideoId ? `https://www.youtube.com/watch?v=${run.youtubeVideoId}` : null,
    createdAt: run.createdAt,
    updatedAt: run.updatedAt,
  };
}

export function publicYouTubeChannel(channel) {
  if (!channel) return null;
  return {
    id: channel._id,
    channelId: channel.channelId || null,
    title: channel.title || 'Connected YouTube channel',
    thumbnailUrl: channel.thumbnailUrl || null,
    connectedAt: channel.createdAt || null,
    tokenStatus: channel.tokenStatus || 'ok',
  };
}
