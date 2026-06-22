import test from 'node:test';
import assert from 'node:assert/strict';
import {
  AUTOMATION_PAUSE_TYPES,
  accountPauseStatus,
  accountSendLimitKey,
  automationPauseStatus,
  publicPauseStatus,
} from '../lib/automation-pause.js';

const now = new Date('2026-06-22T08:00:00.000Z');

test('builds the same account send key throughout an hourly window', () => {
  const first = accountSendLimitKey('acct', new Date('2026-06-22T08:01:00Z'));
  assert.equal(accountSendLimitKey('acct', new Date('2026-06-22T08:59:59Z')), first);
  assert.notEqual(accountSendLimitKey('acct', new Date('2026-06-22T09:00:00Z')), first);
});

test('classifies an active internal send-limit pause as resettable', () => {
  const status = accountPauseStatus({
    automationPausedUntil: new Date('2026-06-22T09:00:00Z'),
    automationPauseReason: 'Per-account send limit exceeded (100/hour)',
  }, now);
  assert.equal(status.type, AUTOMATION_PAUSE_TYPES.INTERNAL_SEND_LIMIT);
  assert.equal(status.canReset, true);
  assert.equal(status.scope, 'account');
});

test('Meta pauses take precedence and cannot be manually reset', () => {
  const status = accountPauseStatus({
    automationPausedUntil: new Date('2026-06-22T09:00:00Z'),
    automationPauseReason: 'Per-account send limit exceeded (100/hour)',
    metaRateLimitPausedUntil: new Date('2026-06-22T09:30:00Z'),
    metaRateLimitPauseReason: 'Meta rate limit reached',
  }, now);
  assert.equal(status.type, AUTOMATION_PAUSE_TYPES.META_RATE_LIMIT);
  assert.equal(status.canReset, false);
});

test('explicit non-rate Graph pauses remain non-resettable', () => {
  const status = accountPauseStatus({
    automationPauseType: AUTOMATION_PAUSE_TYPES.OTHER,
    automationPausedUntil: new Date('2026-06-22T09:00:00Z'),
    automationPauseReason: 'Instagram permission was rejected',
    metaRateLimitPausedUntil: new Date('2026-06-22T09:00:00Z'),
    metaRateLimitPauseReason: 'Instagram permission was rejected',
  }, now);
  assert.equal(status.type, AUTOMATION_PAUSE_TYPES.OTHER);
  assert.equal(status.canReset, false);
});

test('expired pauses are not exposed as active', () => {
  assert.equal(accountPauseStatus({ automationPausedUntil: now }, now), null);
  assert.deepEqual(publicPauseStatus(null), {
    paused: false,
    type: null,
    reason: null,
    pausedUntil: null,
    scope: null,
    canReset: false,
  });
});

test('automation failure pauses are automation-scoped and non-resettable', () => {
  const status = automationPauseStatus({
    automationPausedUntil: new Date('2026-06-22T09:00:00Z'),
    automationPauseReason: '5+ unavailable Instagram comment objects in 10 minutes',
  }, now);
  assert.equal(status.type, AUTOMATION_PAUSE_TYPES.AUTOMATION_FAILURE);
  assert.equal(status.scope, 'automation');
  assert.equal(status.canReset, false);
});
