import test from 'node:test';
import assert from 'node:assert/strict';
import {
  canonicalInstagramPostKey,
  extractInstagramPostShares,
  findMatchingInstagramPostShare,
} from '../lib/instagram-post-share.js';

test('canonicalizes supported Instagram post permalinks', () => {
  assert.equal(canonicalInstagramPostKey('https://www.instagram.com/p/ABC_123/'), 'p:ABC_123');
  assert.equal(canonicalInstagramPostKey('https://instagram.com/reel/Reel-123/?igsh=abc#x'), 'reel:Reel-123');
  assert.equal(canonicalInstagramPostKey('https://m.instagram.com/tv/TV123'), 'tv:TV123');
});

test('rejects unrelated and malformed URLs', () => {
  assert.equal(canonicalInstagramPostKey('https://example.com/p/ABC123'), null);
  assert.equal(canonicalInstagramPostKey('https://instagram.com/stories/user/123'), null);
  assert.equal(canonicalInstagramPostKey('not a URL'), null);
  assert.equal(canonicalInstagramPostKey(null), null);
});

test('extracts documented post-share attachment types', () => {
  const shares = extractInstagramPostShares({
    attachments: [
      { type: 'share', payload: { url: 'https://instagram.com/p/POST1/?x=1' } },
      { type: 'ig_reel', payload: { url: 'https://www.instagram.com/reel/REEL1/' } },
      { type: 'reel', payload: { url: 'https://instagram.com/reel/REEL2/' } },
    ],
  });

  assert.deepEqual(shares, [
    { type: 'share', url: 'https://instagram.com/p/POST1/?x=1', postKey: 'p:POST1' },
    { type: 'ig_reel', url: 'https://www.instagram.com/reel/REEL1/', postKey: 'reel:REEL1' },
    { type: 'reel', url: 'https://instagram.com/reel/REEL2/', postKey: 'reel:REEL2' },
  ]);
});

test('ignores non-share, invalid, and missing attachments', () => {
  assert.deepEqual(extractInstagramPostShares({
    attachments: [
      { type: 'image', payload: { url: 'https://instagram.com/p/POST1/' } },
      { type: 'story_mention', payload: { url: 'https://instagram.com/p/POST1/' } },
      { type: 'share', payload: { url: 'https://example.com/p/POST1/' } },
      { type: 'share', payload: {} },
    ],
  }), []);
  assert.deepEqual(extractInstagramPostShares({}), []);
});

test('matches an automation by stored or legacy permalink key', () => {
  const shares = extractInstagramPostShares({
    attachments: [{ type: 'share', payload: { url: 'https://instagram.com/p/MATCH/?igsh=1' } }],
  });
  const stored = { _id: 'stored', postShareKey: 'p:MATCH' };
  const legacy = { _id: 'legacy', postPermalink: 'https://www.instagram.com/p/MATCH/' };

  assert.deepEqual(findMatchingInstagramPostShare([stored], shares), { automation: stored, share: shares[0] });
  assert.deepEqual(findMatchingInstagramPostShare([legacy], shares), { automation: legacy, share: shares[0] });
  assert.equal(findMatchingInstagramPostShare([{ postShareKey: 'p:OTHER' }], shares), null);
});
