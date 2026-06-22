export const AUTOMATION_PAUSE_TYPES = Object.freeze({
  INTERNAL_SEND_LIMIT: 'internal_send_limit',
  META_RATE_LIMIT: 'meta_rate_limit',
  AUTOMATION_FAILURE: 'automation_failure',
  OTHER: 'other',
});

export const ACCOUNT_SEND_WINDOW_SECONDS = 60 * 60;

export function accountSendLimitKey(accountId, at = Date.now()) {
  const timestamp = at instanceof Date ? at.getTime() : Number(at);
  return `rate:${accountId}:${Math.floor(timestamp / (ACCOUNT_SEND_WINDOW_SECONDS * 1000))}`;
}

export function isInternalSendLimitReason(reason) {
  return /^Per-account send limit exceeded \(\d+\/hour\)$/i.test(String(reason || '').trim());
}

function activeUntil(value, now) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) && date > now ? date : null;
}

export function accountPauseStatus(account, now = new Date()) {
  const metaUntil = activeUntil(account?.metaRateLimitPausedUntil, now);
  if (metaUntil) {
    const explicitType = Object.values(AUTOMATION_PAUSE_TYPES).includes(account?.automationPauseType)
      ? account.automationPauseType
      : AUTOMATION_PAUSE_TYPES.META_RATE_LIMIT;
    return {
      paused: true,
      type: explicitType,
      reason: account.metaRateLimitPauseReason || 'Meta Graph API rate-limit pause is active',
      pausedUntil: metaUntil,
      scope: 'account',
      canReset: false,
    };
  }

  const pausedUntil = activeUntil(account?.automationPausedUntil, now);
  if (!pausedUntil) return null;
  const reason = account.automationPauseReason || 'Instagram account automations are temporarily paused';
  const internal = isInternalSendLimitReason(reason);
  const explicitType = Object.values(AUTOMATION_PAUSE_TYPES).includes(account?.automationPauseType)
    ? account.automationPauseType
    : null;
  return {
    paused: true,
    type: explicitType || (internal ? AUTOMATION_PAUSE_TYPES.INTERNAL_SEND_LIMIT : AUTOMATION_PAUSE_TYPES.OTHER),
    reason,
    pausedUntil,
    scope: 'account',
    canReset: (explicitType === AUTOMATION_PAUSE_TYPES.INTERNAL_SEND_LIMIT) || (!explicitType && internal),
  };
}

export function automationPauseStatus(automation, now = new Date()) {
  const pausedUntil = activeUntil(automation?.automationPausedUntil, now);
  if (!pausedUntil) return null;
  return {
    paused: true,
    type: AUTOMATION_PAUSE_TYPES.AUTOMATION_FAILURE,
    reason: automation.automationPauseReason || 'Automation is temporarily paused',
    pausedUntil,
    scope: 'automation',
    canReset: false,
  };
}

export function publicPauseStatus(status) {
  if (!status) {
    return {
      paused: false,
      type: null,
      reason: null,
      pausedUntil: null,
      scope: null,
      canReset: false,
    };
  }
  return {
    ...status,
    pausedUntil: status.pausedUntil instanceof Date
      ? status.pausedUntil.toISOString()
      : status.pausedUntil,
  };
}
