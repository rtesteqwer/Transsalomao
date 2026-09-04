import { getSession, setSessionCookie } from '../../lib/session.js';
import { getHistory } from '../../lib/db.js';

async function refresh(session) {
  if (session.accessToken && session.expiresAt > Date.now() + 60_000) return session;
  if (!session.refreshToken) throw new Error('Sessão expirada. Conecte o YouTube novamente.');

  const body = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID,
    client_secret: process.env.GOOGLE_CLIENT_SECRET,
    refresh_token: session.refreshToken,
    grant_type: 'refresh_token'
  });
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body
  });
  const t = await r.json();
  if (!r.ok) throw new Error(t.error_description || 'Não foi possível renovar a sessão.');
  return { ...session, accessToken: t.access_token, expiresAt: Date.now() + Number(t.expires_in || 3600) * 1000 };
}

async function googleJson(url, accessToken) {
  const r = await fetch(url, { headers: { authorization: `Bearer ${accessToken}` } });
  const json = await r.json();
  if (!r.ok) throw new Error(json?.error?.message || `Erro Google API ${r.status}`);
  return json;
}

export default async function handler(req, res) {
  try {
    let session = getSession(req);
    if (!session?.accessToken && !session?.refreshToken) return res.status(401).json({ connected: false });
    session = await refresh(session);
    setSessionCookie(res, session);

    const channelData = await googleJson('https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true', session.accessToken);
    const channel = channelData.items?.[0];
    if (!channel) throw new Error('Nenhum canal do YouTube encontrado nesta conta.');

    const history = await getHistory(channel.id, req.query?.limit || 30);
    res.status(200).json({ connected: true, channelId: channel.id, ...history });
  } catch (e) {
    res.status(500).json({ connected: true, error: e.message });
  }
}
