export const AUDIENCE_PAGE_SIZE = 25;

export const AUDIENCE_SORT = Object.freeze({
  lastTriggeredAt: -1,
  updatedAt: -1,
  instagramScopedUserId: -1,
});

function validDate(value) {
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date : null;
}

export function encodeAudienceCursor(member, offset) {
  const lastTriggeredAt = validDate(member?.lastTriggeredAt);
  const updatedAt = validDate(member?.updatedAt);
  if (!lastTriggeredAt || !updatedAt || !member?.instagramScopedUserId || !Number.isInteger(offset) || offset < 1) {
    throw new Error('Unable to create audience cursor');
  }

  return Buffer.from(JSON.stringify({
    lastTriggeredAt: lastTriggeredAt.toISOString(),
    updatedAt: updatedAt.toISOString(),
    instagramScopedUserId: String(member.instagramScopedUserId),
    offset,
  })).toString('base64url');
}

export function decodeAudienceCursor(value) {
  if (!value || typeof value !== 'string') return null;

  try {
    const parsed = JSON.parse(Buffer.from(value, 'base64url').toString('utf8'));
    const lastTriggeredAt = validDate(parsed?.lastTriggeredAt);
    const updatedAt = validDate(parsed?.updatedAt);
    if (
      !lastTriggeredAt
      || !updatedAt
      || typeof parsed?.instagramScopedUserId !== 'string'
      || !parsed.instagramScopedUserId
      || !Number.isInteger(parsed?.offset)
      || parsed.offset < 1
    ) {
      return null;
    }

    return {
      lastTriggeredAt,
      updatedAt,
      instagramScopedUserId: parsed.instagramScopedUserId,
      offset: parsed.offset,
    };
  } catch {
    return null;
  }
}

export function audienceCursorQuery(cursor) {
  if (!cursor) return null;

  return {
    $or: [
      { lastTriggeredAt: { $lt: cursor.lastTriggeredAt } },
      {
        lastTriggeredAt: cursor.lastTriggeredAt,
        updatedAt: { $lt: cursor.updatedAt },
      },
      {
        lastTriggeredAt: cursor.lastTriggeredAt,
        updatedAt: cursor.updatedAt,
        instagramScopedUserId: { $lt: cursor.instagramScopedUserId },
      },
    ],
  };
}

export function audiencePageCapacity(visibleLimit, offset = 0) {
  const limit = Math.max(0, Number(visibleLimit) || 0);
  const consumed = Math.max(0, Number(offset) || 0);
  return Math.min(AUDIENCE_PAGE_SIZE, Math.max(0, limit - consumed));
}
