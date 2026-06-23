import test from 'node:test';
import assert from 'node:assert/strict';
import {
  AUDIENCE_PAGE_SIZE,
  audienceCursorQuery,
  audiencePageCapacity,
  decodeAudienceCursor,
  encodeAudienceCursor,
} from '../lib/audience-pagination.js';

const first = {
  _id: 'member-b',
  instagramScopedUserId: 'instagram-b',
  lastTriggeredAt: new Date('2026-06-22T10:00:00.000Z'),
  updatedAt: new Date('2026-06-22T09:59:00.000Z'),
};

test('round trips an audience cursor and its consumed offset', () => {
  const decoded = decodeAudienceCursor(encodeAudienceCursor(first, AUDIENCE_PAGE_SIZE));
  assert.deepEqual(decoded, {
    lastTriggeredAt: first.lastTriggeredAt,
    updatedAt: first.updatedAt,
    instagramScopedUserId: first.instagramScopedUserId,
    offset: AUDIENCE_PAGE_SIZE,
  });
});

test('rejects malformed and incomplete audience cursors', () => {
  assert.equal(decodeAudienceCursor('not-json'), null);
  assert.equal(decodeAudienceCursor(Buffer.from(JSON.stringify({ instagramScopedUserId: 'member' })).toString('base64url')), null);
});

test('cursor query applies every descending sort tie-break', () => {
  const cursor = decodeAudienceCursor(encodeAudienceCursor(first, 25));
  assert.deepEqual(audienceCursorQuery(cursor), {
    $or: [
      { lastTriggeredAt: { $lt: first.lastTriggeredAt } },
      { lastTriggeredAt: first.lastTriggeredAt, updatedAt: { $lt: first.updatedAt } },
      {
        lastTriggeredAt: first.lastTriggeredAt,
        updatedAt: first.updatedAt,
        instagramScopedUserId: { $lt: first.instagramScopedUserId },
      },
    ],
  });
});

test('page capacity handles first, middle, final, empty, and capped pages', () => {
  assert.equal(audiencePageCapacity(100, 0), 25);
  assert.equal(audiencePageCapacity(100, 25), 25);
  assert.equal(audiencePageCapacity(60, 50), 10);
  assert.equal(audiencePageCapacity(0, 0), 0);
  assert.equal(audiencePageCapacity(10, 10), 0);
  assert.equal(audiencePageCapacity(10, 999), 0);
});
