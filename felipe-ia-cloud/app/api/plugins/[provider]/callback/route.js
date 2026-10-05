import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { writePluginCredential } from '../../../../../lib/plugin-auth.js';

export const runtime = 'nodejs';

export async function GET(request, context) {
  const { provider } = await context.params;
  const url = new URL(request.url);
  const origin = url.origin;
  const code = String(url.searchParams.get('code') || '');
  const state = String(url.searchParams.get('state') || '');

  if (provider !== 'gmail' && provider !== 'youtube') {
    return NextResponse.redirect(new URL('/plugins?error=unsupported_oauth', origin));
  }

  const store = await cookies();
  const expected = String(store.get('felipe_plugin_oauth_state')?.value || '');

  store.set('felipe_plugin_oauth_state', '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 0
  });

  if (!code || !state || expected !== provider + ':' + state) {
    return NextResponse.redirect(new URL('/plugins?error=oauth_state', origin));
  }

  try {
    const redirectUri = origin + '/api/plugins/' + provider + '/callback';
    const body = new URLSearchParams({
      code,
      client_id: process.env.GOOGLE_CLIENT_ID || '',
      client_secret: process.env.GOOGLE_CLIENT_SECRET || '',
      redirect_uri: redirectUri,
      grant_type: 'authorization_code'
    });

    const response = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
      cache: 'no-store'
    });

    if (!response.ok) throw new Error('Falha no OAuth do Google.');
    const data = await response.json();
    if (!data?.access_token) throw new Error('Google não retornou token de acesso.');

    await writePluginCredential(provider, {
      accessToken: String(data.access_token),
      refreshToken: String(data.refresh_token || ''),
      expiresAt: Date.now() + Number(data.expires_in || 3600) * 1000,
      scope: String(data.scope || '')
    });

    return NextResponse.redirect(new URL('/plugins?connected=' + encodeURIComponent(provider), origin));
  } catch {
    return NextResponse.redirect(new URL('/plugins?error=oauth_exchange', origin));
  }
}
