-- WhatsApp AI ingestion v1
create table if not exists whatsapp_messages (
  id text primary key,
  provider_message_id text not null unique,
  sender_phone text not null default '',
  sender_name text not null default '',
  message_type text not null default 'text',
  raw_text text not null default '',
  media_id text,
  raw_payload jsonb not null default '{}'::jsonb,
  parsed_action jsonb,
  confidence numeric,
  status text not null default 'received',
  error_message text,
  created_entity_type text,
  created_entity_id text,
  created_at timestamptz not null default now(),
  processed_at timestamptz
);

create index if not exists whatsapp_messages_status_idx
  on whatsapp_messages(status, created_at desc);

create index if not exists whatsapp_messages_sender_idx
  on whatsapp_messages(sender_phone, created_at desc);
