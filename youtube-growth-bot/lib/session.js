import crypto from 'node:crypto';

const COOKIE = 'yt_growth_session';

function key() {
  const secret = process.env.YT_SESSION_SECRET;
  if (!secret || secret.length < 32) throw new Error('YT_SESSION_SECRET ausente ou muito curta');
  return crypto.createHash('sha256').update(secret).digest();
}

export function seal(value) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key(), iv);
  const plaintext = Buffer.from(JSON.stringify(value), 'utf8');
  const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, encrypted]).toString('base64url');
}

export function unseal(token) {
  const raw = Buffer.from(token, 'base64url');
  const iv = raw.subarray(0, 12);
  const tag = raw.subarray(12, 28);
  const encrypted = raw.subarray(28);
  const decipher = crypto.createDecipheriv('aes-256-gcm', key(), iv);
  decipher.setAuthTag(tag);
  const plaintext = Buffer.concat([decipher.update(encrypted), decipher.final()]);
  return JSON.parse(plaintext.toString('utf8'));
}

export function setSessionCookie(res, session) {
  const token = seal(session);
  const secure = process.env.VERCEL || process.env.NODE_ENV === 'production';
  const cookie = `${COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=2592000${secure ? '; Secure' : ''}`;
  res.setHeader('Set-Cookie', cookie);
}

export function clearSessionCookie(res) {
  res.setHeader('Set-Cookie', `${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`);
}

export function getSession(req) {
  const cookieHeader = req.headers.cookie || '';
  const item = cookieHeader.split(';').map(v => v.trim()).find(v => v.startsWith(`${COOKIE}=`));
  if (!item) return null;
  try { return unseal(item.slice(COOKIE.length + 1)); } catch { return null; }
}
