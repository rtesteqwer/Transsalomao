-- WhatsApp Groups API context
alter table whatsapp_messages
  add column if not exists group_id text;

create index if not exists whatsapp_messages_group_idx
  on whatsapp_messages(group_id, created_at desc)
  where group_id is not null;
