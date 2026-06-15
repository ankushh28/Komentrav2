import test from 'node:test';
import assert from 'node:assert/strict';
import {
  META_RATE_LIMIT_STATES,
  classifyMetaRateLimitUsage,
  getMetaRateLimitPauseUntil,
  parseMetaRateLimitHeaders,
} from '../lib/meta-rate-limit.js';

test('parses X-App-Usage with app usage metrics', () => {
  const usage = parseMetaRateLimitHeaders({
    'x-app-usage': JSON.stringify({
      call_count: 12,
      total_cputime: 34,
      total_time: 56,
    }),
  });

  assert.equal(usage.call_count, 12);
  assert.equal(usage.total_cputime, 34);
  assert.equal(usage.total_time, 56);
  assert.equal(usage.highestMetric, 'total_time');
  assert.equal(usage.highestUsage, 56);
  assert.deepEqual(usage.sourceHeaders, ['x-app-usage']);
});

test('missing and malformed Meta usage headers are ignored safely', () => {
  assert.equal(parseMetaRateLimitHeaders({}), null);
  assert.equal(parseMetaRateLimitHeaders({ 'x-app-usage': '{not json' }), null);
  assert.equal(classifyMetaRateLimitUsage(null), META_RATE_LIMIT_STATES.NORMAL);
});

test('parses nested X-Business-Use-Case-Usage including regain access estimate', () => {
  const usage = parseMetaRateLimitHeaders({
    'x-business-use-case-usage': JSON.stringify({
      '123456': [
        {
          type: 'instagram',
          call_count: 87,
          total_cputime: 22,
          total_time: 41,
          estimated_time_to_regain_access: 13,
        },
      ],
    }),
  });

  assert.equal(usage.call_count, 87);
  assert.equal(usage.estimated_time_to_regain_access, 13);
  assert.equal(usage.highestMetric, 'call_count');
  assert.equal(classifyMetaRateLimitUsage(usage), META_RATE_LIMIT_STATES.NEAR_LIMIT);
});

test('classifies highest usage metric across call, CPU, and wall time', () => {
  assert.equal(
    classifyMetaRateLimitUsage({ call_count: 79, total_cputime: 10, total_time: 20 }),
    META_RATE_LIMIT_STATES.NORMAL,
  );
  assert.equal(
    classifyMetaRateLimitUsage({ call_count: 12, total_cputime: 80, total_time: 20 }),
    META_RATE_LIMIT_STATES.NEAR_LIMIT,
  );
  assert.equal(
    classifyMetaRateLimitUsage({ call_count: 12, total_cputime: 20, total_time: 100 }),
    META_RATE_LIMIT_STATES.LIMITED,
  );
});

test('uses estimated regain access minutes when computing pause time', () => {
  const before = Date.now();
  const pauseUntil = getMetaRateLimitPauseUntil({ estimated_time_to_regain_access: 2 }, 60);
  const deltaMs = pauseUntil.getTime() - before;

  assert.ok(deltaMs >= 2 * 60 * 1000 - 1000);
  assert.ok(deltaMs < 3 * 60 * 1000);
});
