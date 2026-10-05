import { randomBytes } from 'node:crypto';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { googleOAuthReady } from '../../../../../lib/plugin-auth.js';

export const runtime = 'nodejs';

const GOOGLE_SCOPES = {
  gmail: [
    'openid',
    'email',
    'profile',
    'https://www.googleapis.com/auth/gmail.readonly'
  ],
  youtube: [
    'openid',
    'email',
    'profile',
    'https://www.googleapis.com/auth/youtube.readonly'
  ]
};

export async function GET(request, context) {
  const { provider } = await context.params;
  const origin = new URL(request.url).origin;

  if (!(provider in GOOGLE_SCOPES)) {
    return NextResponse.redirect(new URL('/plugins?error=unsupported_oauth', origin));
  }

  if (!googleOAuthReady()) {
    return NextResponse.redirect(new URL('/plugins?error=google_oauth_not_configured', origin));
  }

  const state = randomBytes(24).toString('hex');
  const store = await cookies();
  store.set('felipe_plugin_oauth_state', provider + ':' + state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 600
  });

  const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  url.searchParams.set('client_id', process.env.GOOGLE_CLIENT_ID);
  url.searchParams.set('redirect_uri', origin + '/api/plugins/' + provider + '/callback');
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', GOOGLE_SCOPES[provider].join(' '));
  url.searchParams.set('access_type', 'offline');
  url.searchParams.set('prompt', 'consent');
  url.searchParams.set('state', state);

  return NextResponse.redirect(url);
}
