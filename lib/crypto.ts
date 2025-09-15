import crypto from 'crypto';

const VERSION = 'v1';

function getKey() {
  const b64 = process.env.APP_ENCRYPTION_KEY;
  if (!b64) throw new Error('APP_ENCRYPTION_KEY not set');
  const key = Buffer.from(b64, 'base64');
  if (key.length !== 32) throw new Error('APP_ENCRYPTION_KEY must be 32 bytes base64');
  return key;
}

export function encryptString(plaintext: string): string {
  const key = getKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const enc = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [VERSION, iv.toString('base64'), enc.toString('base64'), tag.toString('base64')].join(':');
}

export function decryptString(serialized: string): string {
  const [ver, ivB64, dataB64, tagB64] = serialized.split(':');
  if (ver !== VERSION) throw new Error('Unsupported cipher version');
  const key = getKey();
  const iv = Buffer.from(ivB64, 'base64');
  const data = Buffer.from(dataB64, 'base64');
  const tag = Buffer.from(tagB64, 'base64');
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  const dec = Buffer.concat([decipher.update(data), decipher.final()]);
  return dec.toString('utf8');
}

