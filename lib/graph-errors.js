export const GRAPH_ERROR_CLASSIFICATIONS = Object.freeze({
  TOKEN_OR_PERMISSION: 'token_or_permission',
  RATE_OR_PLATFORM_BLOCK: 'rate_or_platform_block',
  OBJECT_UNAVAILABLE: 'object_unavailable',
  UNKNOWN: 'unknown',
});

export function normalizeGraphError(errorLike) {
  const graph = errorLike?.graph || errorLike?.data?.error || errorLike?.error || errorLike || {};
  const message = String(errorLike?.message || graph?.message || '').trim();
  return {
    message,
    type: graph?.type || null,
    code: graph?.code ?? null,
    error_subcode: graph?.error_subcode ?? null,
    fbtrace_id: graph?.fbtrace_id || null,
  };
}

export function classifyGraphError(errorLike) {
  const normalized = normalizeGraphError(errorLike);
  const code = Number(normalized.code);
  const subcode = Number(normalized.error_subcode);
  const type = String(normalized.type || '').toLowerCase();
  const message = String(normalized.message || '').toLowerCase();

  if (
    code === 100
    && (subcode === 33 || type.includes('graphmethodexception'))
    && (
      message.includes('unsupported post request')
      || message.includes('unsupported get request')
      || message.includes('object with id')
      || message.includes('does not exist')
      || message.includes('cannot be loaded')
      || message.includes('does not support this operation')
    )
  ) {
    return GRAPH_ERROR_CLASSIFICATIONS.OBJECT_UNAVAILABLE;
  }

  if (
    [4, 17, 32, 613].includes(code)
    || [
      'rate limit',
      'too many',
      'throttl',
      'temporarily blocked',
      'temporarily restricted',
      'platform block',
      'spam',
    ].some(term => message.includes(term))
  ) {
    return GRAPH_ERROR_CLASSIFICATIONS.RATE_OR_PLATFORM_BLOCK;
  }

  if (
    [10, 102, 104, 190, 200, 2500].includes(code)
    || type.includes('oauthexception')
    || [
      'access token',
      'session has expired',
      'invalid oauth',
      'missing permission',
      'permissions error',
      'permission or capability',
      'does not have permission',
      'does not have the capability',
      'app access',
    ].some(term => message.includes(term))
  ) {
    return GRAPH_ERROR_CLASSIFICATIONS.TOKEN_OR_PERMISSION;
  }

  return GRAPH_ERROR_CLASSIFICATIONS.UNKNOWN;
}

export function shouldPauseAccountForGraphError(errorLike) {
  const classification = classifyGraphError(errorLike);
  return classification === GRAPH_ERROR_CLASSIFICATIONS.TOKEN_OR_PERMISSION
    || classification === GRAPH_ERROR_CLASSIFICATIONS.RATE_OR_PLATFORM_BLOCK;
}
