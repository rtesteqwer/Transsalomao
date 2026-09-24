alter table tickets_balanca add column if not exists ticket_data jsonb;

create table if not exists ticket_read_limits (
  identity_hash text primary key,
  window_start timestamptz not null,
  used integer not null check (used > 0)
);
