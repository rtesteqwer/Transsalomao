-- Persistent WhatsApp group -> driver binding.
-- A group is bound only from an explicit configured mapping or from the
-- phone number of an active driver who actually sends a message in that group.
create table if not exists whatsapp_group_drivers (
  group_id text primary key,
  driver_id text not null references drivers(id),
  source text not null default 'sender_phone',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists whatsapp_group_drivers_driver_idx
  on whatsapp_group_drivers(driver_id);
