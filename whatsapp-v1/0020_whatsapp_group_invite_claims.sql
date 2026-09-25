-- Pending WhatsApp invite -> driver claims.
-- The invite code is registered now; it is resolved to a group_id later when
-- WhatsApp Business credentials are available and Meta exposes the group.
create table if not exists whatsapp_group_invite_claims (
  invite_code text primary key,
  invite_url text not null,
  driver_id text not null references drivers(id),
  status text not null default 'pending',
  group_id text,
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

create index if not exists whatsapp_group_invite_claims_driver_idx
  on whatsapp_group_invite_claims(driver_id);

insert into whatsapp_group_invite_claims(invite_code,invite_url,driver_id,status)
select
  'EDDKxm4IZ7VFFVFhCP88rf',
  'https://chat.whatsapp.com/EDDKxm4IZ7VFFVFhCP88rf?s=cl&p=a&mlu=4&ilr=4',
  d.id,
  'pending'
from drivers d
where d.status='ativo'
  and lower(regexp_replace(trim(d.name), '\s+', ' ', 'g')) =
      lower('Murillo Rocha Garcia')
on conflict (invite_code) do update
set invite_url=excluded.invite_url,
    driver_id=excluded.driver_id,
    status=case
      when whatsapp_group_invite_claims.status='resolved' then 'resolved'
      else 'pending'
    end;
