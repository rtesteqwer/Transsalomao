ALTER TABLE reports
  ADD COLUMN IF NOT EXISTS daily_value double precision NOT NULL DEFAULT 0;
