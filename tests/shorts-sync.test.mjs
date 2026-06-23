import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildShortsMetadata,
  canUseShortsSync,
  evaluateShortsEligibility,
  isLikelyInstagramReel,
  normalizeShortsSyncSettings,
} from '../lib/shorts-sync.js';
import { decryptSecret, encryptSecret, hasTokenEncryptionKey } from '../lib/token-crypto.js';

test('builds YouTube metadata from Instagram caption', () => {
  const metadata = buildShortsMetadata({
    caption: 'Launch day\n\nFull details in bio',
    permalink: 'https://instagram.com/reel/ABC/',
  }, new Date('2026-06-23T00:00:00Z'));

  assert.equal(metadata.title, 'Launch day');
  assert.match(metadata.description, /Full details in bio/);
  assert.match(metadata.description, /https:\/\/instagram\.com\/reel\/ABC\//);
  assert.equal(metadata.categoryId, '22');
});

test('falls back to dated title when caption is empty', () => {
  const metadata = buildShortsMetadata({}, new Date('2026-06-23T00:00:00Z'));
  assert.equal(metadata.title, 'Instagram Short - 2026-06-23');
});

test('evaluates shorts eligibility by duration and shape', () => {
  assert.deepEqual(evaluateShortsEligibility({ durationSeconds: 179, width: 1080, height: 1920 }), {
    ok: true,
    reason: null,
    code: null,
  });
  assert.equal(evaluateShortsEligibility({ durationSeconds: 181, width: 1080, height: 1920 }).code, 'duration_too_long');
  assert.equal(evaluateShortsEligibility({ durationSeconds: 60, width: 1920, height: 1080 }).code, 'not_square_or_vertical');
  assert.equal(evaluateShortsEligibility({ durationSeconds: 60, width: 0, height: 0 }).code, 'dimensions_unknown');
});

test('detects likely Instagram reels from media data', () => {
  assert.equal(isLikelyInstagramReel({ media_product_type: 'REELS' }), true);
  assert.equal(isLikelyInstagramReel({ permalink: 'https://instagram.com/reel/ABC/' }), true);
  assert.equal(isLikelyInstagramReel({ media_product_type: 'FEED', permalink: 'https://instagram.com/p/ABC/' }), false);
});

test('normalizes shorts sync settings defaults', () => {
  assert.deepEqual(normalizeShortsSyncSettings({ privacyStatus: 'public', enabled: true }).privacyStatus, 'public');
  assert.equal(normalizeShortsSyncSettings({ privacyStatus: 'friends' }).privacyStatus, 'private');
  assert.equal(normalizeShortsSyncSettings({}).metadataPolicy, 'smart_caption');
  assert.equal(normalizeShortsSyncSettings(null).enabled, false);
});

test('creator and higher plans can use shorts sync', () => {
  assert.equal(canUseShortsSync('free'), false);
  assert.equal(canUseShortsSync('creator'), true);
  assert.equal(canUseShortsSync('growth'), true);
  assert.equal(canUseShortsSync('agency'), true);
});

test('encrypts and decrypts refresh tokens', () => {
  const oldKey = process.env.TOKEN_ENCRYPTION_KEY;
  process.env.TOKEN_ENCRYPTION_KEY = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
  try {
    assert.equal(hasTokenEncryptionKey(), true);
    const encrypted = encryptSecret('refresh-token');
    assert.notEqual(encrypted, 'refresh-token');
    assert.equal(decryptSecret(encrypted), 'refresh-token');
  } finally {
    if (oldKey == null) delete process.env.TOKEN_ENCRYPTION_KEY;
    else process.env.TOKEN_ENCRYPTION_KEY = oldKey;
  }
});
