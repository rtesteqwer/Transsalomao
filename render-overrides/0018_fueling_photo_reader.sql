create table if not exists fueling_photo_files (
  id text primary key,
  source_hash text unique not null,
  file_name text not null,
  mime_type text not null,
  image_base64 text not null,
  created_at timestamptz not null default now()
);

create table if not exists fueling_photo_reads (
  id text primary key,
  file_id text unique not null references fueling_photo_files(id),
  fueling_id text,
  driver_id text,
  fleet_id text,
  document_type text,
  confidence numeric,
  status text not null,
  read_json jsonb not null,
  created_at timestamptz not null default now(),
  confirmed_at timestamptz
);

create index if not exists fueling_photo_reads_fueling_idx
  on fueling_photo_reads(fueling_id);

create table if not exists fueling_photo_memory (
  memory_key text primary key,
  station_name text,
  station_cnpj text,
  fuel_type text,
  pump_number text,
  document_type text,
  uses integer not null default 1,
  last_seen_at timestamptz not null default now()
);
