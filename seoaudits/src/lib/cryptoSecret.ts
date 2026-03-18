import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

const ALGO = 'aes-256-gcm';

function getKey(): Buffer {
  const raw = process.env.APP_ENCRYPTION_KEY;
  if (!raw || raw.trim().length < 16) {
    throw new Error('APP_ENCRYPTION_KEY is not configured.');
  }
  return createHash('sha256').update(raw).digest();
}

export function encryptSecret(plainText: string): string {
  const key = getKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGO, key, iv);
  const encrypted = Buffer.concat([cipher.update(plainText, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv.toString('base64url'), tag.toString('base64url'), encrypted.toString('base64url')].join('.');
}

export function decryptSecret(payload: string): string {
  const key = getKey();
  const [ivRaw, tagRaw, dataRaw] = payload.split('.');
  if (!ivRaw || !tagRaw || !dataRaw) {
    throw new Error('Invalid encrypted payload.');
  }

  const iv = Buffer.from(ivRaw, 'base64url');
  const tag = Buffer.from(tagRaw, 'base64url');
  const data = Buffer.from(dataRaw, 'base64url');

  const decipher = createDecipheriv(ALGO, key, iv);
  decipher.setAuthTag(tag);
  const plain = Buffer.concat([decipher.update(data), decipher.final()]);
  return plain.toString('utf8');
}
