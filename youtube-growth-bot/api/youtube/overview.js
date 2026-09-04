import { getSession, setSessionCookie } from '../../lib/session.js';
import { saveSnapshot } from '../../lib/db.js';

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

function isoDate(d) { return d.toISOString().slice(0, 10); }

async function googleJson(url, accessToken) {
  const r = await fetch(url, { headers: { authorization: `Bearer ${accessToken}` } });
  const json = await r.json();
  if (!r.ok) throw new Error(json?.error?.message || `Erro Google API ${r.status}`);
  return json;
}

function score(v) {
  const conv = v.views > 0 ? (v.subscribersGained / v.views) * 1000 : 0;
  const retention = Math.min(100, Math.max(0, v.averageViewPercentage || 0));
  const engagement = v.views > 0 ? ((v.likes + v.comments * 2 + v.shares * 3) / v.views) * 100 : 0;
  return Math.round(Math.min(100, retention * 0.45 + Math.min(100, conv * 18) * 0.35 + Math.min(100, engagement * 10) * 0.20));
}

export default async function handler(req, res) {
  try {
    let session = getSession(req);
    if (!session?.accessToken && !session?.refreshToken) return res.status(401).json({ connected: false });
    session = await refresh(session);
    setSessionCookie(res, session);

    const channelData = await googleJson('https://www.googleapis.com/youtube/v3/channels?part=snippet,statistics&mine=true', session.accessToken);
    const channel = channelData.items?.[0];
    if (!channel) throw new Error('Nenhum canal do YouTube encontrado nesta conta.');

    const end = new Date();
    const start = new Date(end);
    start.setDate(start.getDate() - 27);
    const metrics = 'views,estimatedMinutesWatched,averageViewDuration,averageViewPercentage,subscribersGained,subscribersLost,likes,comments,shares';
    const params = new URLSearchParams({
      ids: 'channel==MINE',
      startDate: isoDate(start),
      endDate: isoDate(end),
      metrics,
      dimensions: 'video',
      sort: '-views',
      maxResults: '50'
    });
    const analytics = await googleJson(`https://youtubeanalytics.googleapis.com/v2/reports?${params.toString()}`, session.accessToken);

    const headers = (analytics.columnHeaders || []).map(h => h.name);
    const rows = analytics.rows || [];
    const mapped = rows.map(row => Object.fromEntries(headers.map((h, i) => [h, row[i]])));
    const ids = mapped.map(v => v.video).filter(Boolean);

    let titles = {};
    if (ids.length) {
      const vr = await googleJson(`https://www.googleapis.com/youtube/v3/videos?part=snippet,contentDetails&id=${encodeURIComponent(ids.join(','))}`, session.accessToken);
      titles = Object.fromEntries((vr.items || []).map(v => [v.id, v.snippet?.title || v.id]));
    }

    const videos = mapped.map((v) => {
      const item = {
        id: v.video,
        title: titles[v.video] || v.video,
        views: Number(v.views || 0),
        estimatedMinutesWatched: Number(v.estimatedMinutesWatched || 0),
        averageViewDuration: Number(v.averageViewDuration || 0),
        averageViewPercentage: Number(v.averageViewPercentage || 0),
        subscribersGained: Number(v.subscribersGained || 0),
        subscribersLost: Number(v.subscribersLost || 0),
        likes: Number(v.likes || 0),
        comments: Number(v.comments || 0),
        shares: Number(v.shares || 0)
      };
      return { ...item, score: score(item) };
    }).sort((a, b) => b.score - a.score);

    const responseData = {
      connected: true,
      period: { start: isoDate(start), end: isoDate(end) },
      channel: {
        id: channel.id,
        title: channel.snippet?.title,
        thumbnail: channel.snippet?.thumbnails?.default?.url,
        subscribers: Number(channel.statistics?.subscriberCount || 0),
        totalViews: Number(channel.statistics?.viewCount || 0),
        totalVideos: Number(channel.statistics?.videoCount || 0)
      },
      videos
    };

    let database = { enabled: false, saved: false };
    try {
      database = await saveSnapshot(responseData);
    } catch (dbError) {
      database = { enabled: Boolean(process.env.DATABASE_URL), saved: false, error: dbError.message };
    }

    res.status(200).json({ ...responseData, database });
  } catch (e) {
    res.status(500).json({ connected: true, error: e.message });
  }
}
