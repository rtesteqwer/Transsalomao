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
);

CREATE INDEX IF NOT EXISTS idx_channel_snapshots_channel_captured
ON channel_snapshots(channel_id, captured_at DESC);

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
);

CREATE INDEX IF NOT EXISTS idx_video_snapshots_snapshot_score
ON video_snapshots(channel_snapshot_id, score DESC);
