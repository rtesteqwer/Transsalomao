export default function handler(req, res) {
  res.status(200).json({
    ok: true,
    service: 'youtube-growth-bot',
    youtubeOAuthConfigured: Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET && process.env.GOOGLE_REDIRECT_URI && process.env.YT_SESSION_SECRET),
    databaseConfigured: Boolean(process.env.DATABASE_URL)
  });
}
