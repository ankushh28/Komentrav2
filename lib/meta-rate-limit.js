export const META_RATE_LIMIT_STATES = Object.freeze({
  NORMAL: 'normal',
  NEAR_LIMIT: 'near_limit',
  LIMITED: 'limited',
});

export const DEFAULT_META_RATE_LIMIT_THRESHOLDS = Object.freeze({
  nearLimitPercent: 80,
  limitedPercent: 100,
});

const META_RATE_LIMIT_HEADERS = [
  'x-app-usage',
  'x-business-use-case-usage',
  'x-page-usage',
];

const USAGE_KEYS = [
  'call_count',
  'total_cputime',
  'total_time',
  'estimated_time_to_regain_access',
];

function headerValue(headers, name) {
  if (!headers) return null;
  if (typeof headers.get === 'function') return headers.get(name);

  const direct = headers[name] || headers[name.toLowerCase()] || headers[name.toUpperCase()];
  if (direct !== undefined) return direct;

  const found = Object.keys(headers).find(key => key.toLowerCase() === name.toLowerCase());
  return found ? headers[found] : null;
}

function parseJsonHeader(value) {
  if (!value) return null;
  try {
    const parsed = JSON.parse(String(value));
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

function finiteNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function hasUsageShape(value) {
  return value && typeof value === 'object' && USAGE_KEYS.some(key => finiteNumber(value[key]) !== null);
}

function collectUsageObjects(value, output = []) {
  if (!value || typeof value !== 'object') return output;
  if (hasUsageShape(value)) output.push(value);

  if (Array.isArray(value)) {
    value.forEach(item => collectUsageObjects(item, output));
    return output;
  }

  Object.values(value).forEach(item => collectUsageObjects(item, output));
  return output;
}

function mergeUsage(base, next) {
  const merged = { ...base };

  for (const key of ['call_count', 'total_cputime', 'total_time']) {
    const value = finiteNumber(next[key]);
    if (value !== null) merged[key] = Math.max(merged[key] || 0, value);
  }

  const regainAccess = finiteNumber(next.estimated_time_to_regain_access);
  if (regainAccess !== null && regainAccess > 0) {
    merged.estimated_time_to_regain_access = Math.max(merged.estimated_time_to_regain_access || 0, regainAccess);
  }

  return merged;
}

function highestMetric(usage) {
  let metric = null;
  let value = 0;
  for (const key of ['call_count', 'total_cputime', 'total_time']) {
    const current = finiteNumber(usage?.[key]);
    if (current !== null && current >= value) {
      metric = key;
      value = current;
    }
  }
  return { metric, value };
}

export function parseMetaRateLimitHeaders(headers) {
  const raw = {};
  const sourceHeaders = [];
  let usage = {};

  for (const header of META_RATE_LIMIT_HEADERS) {
    const value = headerValue(headers, header);
    const parsed = parseJsonHeader(value);
    if (!parsed) continue;

    raw[header] = parsed;
    sourceHeaders.push(header);
    for (const item of collectUsageObjects(parsed)) {
      usage = mergeUsage(usage, item);
    }
  }

  const { metric, value } = highestMetric(usage);
  if (sourceHeaders.length === 0 || metric === null) return null;

  return {
    ...usage,
    highestMetric: metric,
    highestUsage: value,
    sourceHeaders,
    raw,
  };
}

export function classifyMetaRateLimitUsage(usage, thresholds = DEFAULT_META_RATE_LIMIT_THRESHOLDS) {
  if (!usage) return META_RATE_LIMIT_STATES.NORMAL;

  const { value } = highestMetric(usage);
  const nearLimitPercent = finiteNumber(thresholds.nearLimitPercent) ?? DEFAULT_META_RATE_LIMIT_THRESHOLDS.nearLimitPercent;
  const limitedPercent = finiteNumber(thresholds.limitedPercent) ?? DEFAULT_META_RATE_LIMIT_THRESHOLDS.limitedPercent;

  if (value >= limitedPercent) return META_RATE_LIMIT_STATES.LIMITED;
  if (value >= nearLimitPercent) return META_RATE_LIMIT_STATES.NEAR_LIMIT;
  return META_RATE_LIMIT_STATES.NORMAL;
}

export function getMetaRateLimitPauseUntil(usage, fallbackMinutes = 60) {
  const minutes = finiteNumber(usage?.estimated_time_to_regain_access) ?? finiteNumber(fallbackMinutes) ?? 60;
  const safeMinutes = Math.max(1, minutes);
  return new Date(Date.now() + safeMinutes * 60 * 1000);
}
