import crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_BYTES = 12;

function keyFromEnv() {
  const raw = process.env.TOKEN_ENCRYPTION_KEY;
  if (!raw) return null;

  if (/^[A-Fa-f0-9]{64}$/.test(raw)) {
    return Buffer.from(raw, 'hex');
  }

  const base64 = Buffer.from(raw, 'base64');
  if (base64.length === 32) return base64;

  return crypto.createHash('sha256').update(String(raw)).digest();
}

export function hasTokenEncryptionKey() {
  return !!keyFromEnv();
}

export function encryptSecret(value) {
  const key = keyFromEnv();
  if (!key) {
    throw new Error('TOKEN_ENCRYPTION_KEY is required before storing connected account tokens.');
  }

  const iv = crypto.randomBytes(IV_BYTES);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([cipher.update(String(value), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();

  return [
    'v1',
    iv.toString('base64url'),
    tag.toString('base64url'),
    ciphertext.toString('base64url'),
  ].join('.');
}

export function decryptSecret(value) {
  const key = keyFromEnv();
  if (!key) {
    throw new Error('TOKEN_ENCRYPTION_KEY is required before reading connected account tokens.');
  }
  const parts = String(value || '').split('.');
  if (parts.length !== 4 || parts[0] !== 'v1') {
    throw new Error('Unsupported encrypted token format.');
  }

  const [, ivPart, tagPart, ciphertextPart] = parts;
  const decipher = crypto.createDecipheriv(ALGORITHM, key, Buffer.from(ivPart, 'base64url'));
  decipher.setAuthTag(Buffer.from(tagPart, 'base64url'));
  return Buffer.concat([
    decipher.update(Buffer.from(ciphertextPart, 'base64url')),
    decipher.final(),
  ]).toString('utf8');
}
