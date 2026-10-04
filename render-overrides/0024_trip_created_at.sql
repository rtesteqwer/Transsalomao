alter table if exists trips
  add column if not exists created_at timestamptz;

update trips
set created_at = coalesce(
  created_at,
  case
    when date is not null then (date::date + time '12:00') at time zone 'America/Sao_Paulo'
    else now()
  end
)
where created_at is null;

alter table if exists trips
  alter column created_at set default now();

create index if not exists trips_created_at_idx
  on trips (created_at desc);
