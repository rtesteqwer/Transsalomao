import { getSession, setSessionCookie } from '../../lib/session.js';

export default async function handler(req, res) {
  const base = '/?oauth=';
  try {
    const session = getSession(req);
    const { code, state, error } = req.query;
    if (error) return res.redirect(302, `${base}error&message=${encodeURIComponent(error)}`);
    if (!code || !state || !session?.oauthState || state !== session.oauthState) {
      return res.redirect(302, `${base}error&message=${encodeURIComponent('Estado OAuth inválido')}`);
    }

    const body = new URLSearchParams({
      code,
      client_id: process.env.GOOGLE_CLIENT_ID,
      client_secret: process.env.GOOGLE_CLIENT_SECRET,
      redirect_uri: process.env.GOOGLE_REDIRECT_URI,
      grant_type: 'authorization_code'
    });

    const response = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body
    });
    const token = await response.json();
    if (!response.ok) throw new Error(token.error_description || token.error || 'Falha ao obter token');

    setSessionCookie(res, {
      accessToken: token.access_token,
      refreshToken: token.refresh_token,
      expiresAt: Date.now() + (Number(token.expires_in || 3600) * 1000),
      createdAt: Date.now()
    });
    res.redirect(302, `${base}success`);
  } catch (e) {
    res.redirect(302, `${base}error&message=${encodeURIComponent(e.message)}`);
  }
}
