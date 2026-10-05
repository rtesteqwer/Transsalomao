import { put } from '@vercel/blob';

// One deterministic, private object per Google subject. Repeated sign-ins update
// the same registration; Google access/refresh tokens are never persisted here.
export async function saveAccount(user) {
  if (!process.env.BLOB_READ_WRITE_TOKEN) throw new Error('Cadastro indisponível.');
  await put('felipe-accounts-v1/' + user.id + '.json', JSON.stringify({
    ...user, provider: 'google', lastSignInAt: new Date().toISOString()
  }), {
    token: process.env.BLOB_READ_WRITE_TOKEN,
    access: 'private',
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: 'application/json',
    cacheControlMaxAge: 0
  });
}
