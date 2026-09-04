import { neon } from '@neondatabase/serverless';

let schemaReady = false;

function getSql() {
  const url = process.env.DATABASE_URL;
  if (!url) return null;
  return neon(url);
}

export async function ensureSchema() {
  const sql = getSql();
  if (!sql) return false;
  if (schemaReady) return true;

  await sql`
    CREATE TABLE IF NOT EXISTS channel_snapshots (
      id BIGSERIAL PRIMARY KEY,
      channel_id TEXT NOT NULL,
      channel_title TEXT NOT NULL,
      captured_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      period_start DATE NOT NULL,
      period_end DATE NOT NULL,
      subscribers BIGINT NOT NULL DEFAULT 0,
      total_views BIGINT NOT NULL DEFAULT 0,
      total_videos BIGINT NOT NULL DEFAULT 0
    )
  `;

  await sql`
    CREATE INDEX IF NOT EXISTS idx_channel_snapshots_channel_captured
    ON channel_snapshots(channel_id, captured_at DESC)
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS video_snapshots (
      id BIGSERIAL PRIMARY KEY,
      channel_snapshot_id BIGINT NOT NULL REFERENCES channel_snapshots(id) ON DELETE CASCADE,
      video_id TEXT NOT NULL,
      title TEXT NOT NULL,
      views BIGINT NOT NULL DEFAULT 0,
      average_view_percentage DOUBLE PRECISION NOT NULL DEFAULT 0,
      subscribers_gained BIGINT NOT NULL DEFAULT 0,
      subscribers_lost BIGINT NOT NULL DEFAULT 0,
      likes BIGINT NOT NULL DEFAULT 0,
      comments BIGINT NOT NULL DEFAULT 0,
      shares BIGINT NOT NULL DEFAULT 0,
      score INTEGER NOT NULL DEFAULT 0
    )
  `;

  await sql`
    CREATE INDEX IF NOT EXISTS idx_video_snapshots_snapshot_score
    ON video_snapshots(channel_snapshot_id, score DESC)
  `;

  schemaReady = true;
  return true;
}

export async function saveSnapshot({ period, channel, videos }) {
  const sql = getSql();
  if (!sql) return { enabled: false, saved: false };
  await ensureSchema();

  const rows = await sql`
    INSERT INTO channel_snapshots (
      channel_id, channel_title, period_start, period_end,
      subscribers, total_views, total_videos
    ) VALUES (
      ${channel.id}, ${channel.title}, ${period.start}, ${period.end},
      ${channel.subscribers}, ${channel.totalViews}, ${channel.totalVideos}
    ) RETURNING id
  `;

  const snapshotId = rows?.[0]?.id;
  if (!snapshotId) return { enabled: true, saved: false };

  for (const v of videos.slice(0, 50)) {
    await sql`
      INSERT INTO video_snapshots (
        channel_snapshot_id, video_id, title, views,
        average_view_percentage, subscribers_gained, subscribers_lost,
        likes, comments, shares, score
      ) VALUES (
        ${snapshotId}, ${v.id}, ${v.title}, ${v.views},
        ${v.averageViewPercentage}, ${v.subscribersGained}, ${v.subscribersLost},
        ${v.likes}, ${v.comments}, ${v.shares}, ${v.score}
      )
    `;
  }

  return { enabled: true, saved: true, snapshotId: String(snapshotId) };
}

export async function getHistory(channelId, limit = 30) {
  const sql = getSql();
  if (!sql) return { enabled: false, snapshots: [] };
  await ensureSchema();
  const safeLimit = Math.max(1, Math.min(90, Number(limit) || 30));
  const snapshots = await sql`
    SELECT id, channel_id, channel_title, captured_at,
           period_start, period_end, subscribers, total_views, total_videos
    FROM channel_snapshots
    WHERE channel_id = ${channelId}
    ORDER BY captured_at DESC
    LIMIT ${safeLimit}
  `;
  return { enabled: true, snapshots };
}
