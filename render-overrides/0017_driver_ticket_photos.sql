create table if not exists trip_ticket_photos (
  id text primary key,
  relation_type text not null,
  relation_id text not null,
  trip_code text not null,
  driver_id text,
  driver_name text,
  fleet_id text,
  fleet_name text,
  trip_date date,
  freight_mode text,
  net_weight double precision,
  report_status text,
  file_name text not null,
  mime_type text not null,
  image_data text not null,
  created_at timestamptz not null default now(),
  created_by text
);

create index if not exists trip_ticket_photos_relation_idx
  on trip_ticket_photos (relation_type, relation_id);

create index if not exists trip_ticket_photos_created_idx
  on trip_ticket_photos (created_at desc);
