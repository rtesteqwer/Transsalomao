import { createHash } from 'node:crypto';

// Google sub is immutable; an email address is not an account identifier.
export function googleAccount(profile, account) {
  if (account?.provider !== 'google' || !profile?.sub ||
      profile.sub !== account.providerAccountId || profile.email_verified !== true ||
      typeof profile.email !== 'string' || !profile.email.includes('@')) {
    throw new Error('Identidade Google inválida ou e-mail não verificado.');
  }
  return {
    id: 'google_' + createHash('sha256').update(String(profile.sub)).digest('hex'),
    name: String(profile.name || profile.email).slice(0, 200),
    email: profile.email.slice(0, 320)
  };
}

export function googleSignupReady(env = process.env) {
  return Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET &&
    (env.AUTH_SECRET || env.PLUGIN_SESSION_SECRET) && env.BLOB_READ_WRITE_TOKEN);
}

export function ownsPlugin(credential, userId) {
  return (credential?.ownerId || 'guest') === (userId || 'guest');
}
