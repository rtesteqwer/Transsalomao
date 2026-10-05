import { createHash } from 'node:crypto';
import NextAuth from 'next-auth';
import Google from 'next-auth/providers/google';
import { googleAccount, googleSignupReady } from './lib/account-policy.js';
import { saveAccount } from './lib/accounts.js';

const secret = process.env.AUTH_SECRET || (process.env.PLUGIN_SESSION_SECRET
  ? createHash('sha256').update('felipe-account-session:' + process.env.PLUGIN_SESSION_SECRET).digest('hex')
  : undefined);

export const { handlers, auth, signIn, signOut } = NextAuth({
  secret,
  trustHost: true,
  session: { strategy: 'jwt', maxAge: 60 * 60 * 24 * 7 },
  pages: { signIn: '/login', error: '/login' },
  providers: googleSignupReady() ? [Google({
    clientId: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    authorization: { params: { scope: 'openid email profile', prompt: 'select_account' } },
    checks: ['pkce', 'state', 'nonce']
  })] : [],
  callbacks: {
    async signIn({ profile, account }) {
      try {
        await saveAccount(googleAccount(profile, account));
        return true;
      } catch {
        // Do not log OAuth tokens, profile data, or storage credentials.
        return false;
      }
    },
    async jwt({ token, account, profile }) {
      if (account) {
        const user = googleAccount(profile, account);
        token.sub = user.id;
        token.name = user.name;
        token.email = user.email;
        delete token.picture;
      }
      return token;
    },
    async session({ session, token }) {
      session.user = { id: token.sub, name: token.name, email: token.email };
      return session;
    }
  }
});

export async function currentUser() {
  if (!secret) return null;
  return (await auth())?.user || null;
}
