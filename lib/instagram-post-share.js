const INSTAGRAM_HOSTS = new Set([
  'instagram.com',
  'www.instagram.com',
  'm.instagram.com',
]);

const POST_PATH_TYPES = new Set(['p', 'reel', 'tv']);
const SHARE_ATTACHMENT_TYPES = new Set(['share', 'ig_reel', 'reel']);

export function canonicalInstagramPostKey(value) {
  if (!value) return null;

  try {
    const url = new URL(String(value).trim());
    const hostname = url.hostname.toLowerCase().replace(/\.$/, '');
    if (!INSTAGRAM_HOSTS.has(hostname)) return null;

    const parts = url.pathname.split('/').filter(Boolean);
    const pathType = String(parts[0] || '').toLowerCase();
    const shortcode = String(parts[1] || '').trim();
    if (!POST_PATH_TYPES.has(pathType) || !shortcode || !/^[A-Za-z0-9_-]+$/.test(shortcode)) {
      return null;
    }

    return `${pathType}:${shortcode}`;
  } catch {
    return null;
  }
}

export function extractInstagramPostShares(message) {
  const attachments = Array.isArray(message?.attachments) ? message.attachments : [];
  return attachments.flatMap((attachment) => {
    const type = String(attachment?.type || '').toLowerCase();
    if (!SHARE_ATTACHMENT_TYPES.has(type)) return [];

    const url = String(attachment?.payload?.url || '').trim();
    const postKey = canonicalInstagramPostKey(url);
    return postKey ? [{ type, url, postKey }] : [];
  });
}

export function findMatchingInstagramPostShare(automations, shares) {
  const shareByKey = new Map((shares || []).map(share => [share.postKey, share]));
  for (const automation of automations || []) {
    const postKey = automation?.postShareKey || canonicalInstagramPostKey(automation?.postPermalink);
    if (postKey && shareByKey.has(postKey)) {
      return { automation, share: shareByKey.get(postKey) };
    }
  }
  return null;
}
