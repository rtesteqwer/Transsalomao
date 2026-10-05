import { createHash } from 'node:crypto';
import { EncryptJWT, jwtDecrypt } from 'jose';
import { cookies } from 'next/headers';
import { currentUser } from '../auth.js';
import { ownsPlugin } from './account-policy.js';

const VALID_PROVIDERS = new Set(['gmail', 'youtube', 'github', 'vercel', 'neon']);
const COOKIE_PREFIX = 'felipe_plugin_';

function providerCookie(provider) {
  if (!VALID_PROVIDERS.has(provider)) throw new Error('Plugin inválido.');
  return COOKIE_PREFIX + provider;
}

function sessionKey() {
  const secret = process.env.PLUGIN_SESSION_SECRET || process.env.AUTH_SECRET;
  if (!secret) return null;
  return createHash('sha256').update(secret).digest();
}

async function encryptPayload(payload) {
  const key = sessionKey();
  if (!key) throw new Error('PLUGIN_SESSION_SECRET não configurado.');
  return new EncryptJWT(payload)
    .setProtectedHeader({ alg: 'dir', enc: 'A256GCM' })
    .setIssuedAt()
    .setExpirationTime('30d')
    .encrypt(key);
}

async function decryptPayload(token) {
  const key = sessionKey();
  if (!key || !token) return null;
  try {
    const { payload } = await jwtDecrypt(token, key);
    return payload;
  } catch {
    return null;
  }
}

export function pluginSessionReady() {
  return Boolean(sessionKey());
}

export function googleOAuthReady() {
  return Boolean(
    process.env.GOOGLE_CLIENT_ID &&
    process.env.GOOGLE_CLIENT_SECRET &&
    sessionKey()
  );
}

export function githubOAuthReady() {
  return Boolean(
    process.env.GITHUB_OAUTH_CLIENT_ID &&
    process.env.GITHUB_OAUTH_CLIENT_SECRET &&
    sessionKey()
  );
}

export async function readPluginCredential(provider) {
  if (!VALID_PROVIDERS.has(provider)) return null;
  const store = await cookies();
  const encrypted = store.get(providerCookie(provider))?.value;
  const decoded = await decryptPayload(encrypted);
  if ((decoded?.accessToken || decoded?.refreshToken) && ownsPlugin(decoded, (await currentUser())?.id)) {
    return decoded;
  }
  return null;
}

export async function writePluginCredential(provider, payload) {
  if (!VALID_PROVIDERS.has(provider)) throw new Error('Plugin inválido.');
  const store = await cookies();
  const value = await encryptPayload({ provider, ...payload, ownerId: (await currentUser())?.id || 'guest' });
  store.set(providerCookie(provider), value, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 30
  });
}

export async function clearPluginCredential(provider) {
  if (!VALID_PROVIDERS.has(provider)) return;
  const store = await cookies();
  store.set(providerCookie(provider), '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 0
  });
}

export async function getGoogleAccessToken(provider) {
  if (provider !== 'gmail' && provider !== 'youtube') return null;
  const credential = await readPluginCredential(provider);
  if (!credential) return null;

  const now = Date.now();
  const expiresAt = Number(credential.expiresAt || 0);
  if (credential.accessToken && (!expiresAt || expiresAt > now + 60_000)) {
    return String(credential.accessToken);
  }

  if (!credential.refreshToken || !process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
    return credential.accessToken ? String(credential.accessToken) : null;
  }

  const body = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID,
    client_secret: process.env.GOOGLE_CLIENT_SECRET,
    refresh_token: String(credential.refreshToken),
    grant_type: 'refresh_token'
  });

  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
    cache: 'no-store'
  });

  if (!response.ok) return null;
  const data = await response.json();
  const accessToken = String(data.access_token || '');
  if (!accessToken) return null;

  await writePluginCredential(provider, {
    accessToken,
    refreshToken: String(credential.refreshToken),
    expiresAt: Date.now() + Number(data.expires_in || 3600) * 1000,
    scope: String(data.scope || credential.scope || '')
  });

  return accessToken;
}
