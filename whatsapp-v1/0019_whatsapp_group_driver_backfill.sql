-- Safely backfill existing WhatsApp groups when historical messages identify
-- exactly one active driver by registered phone number.
with candidates as (
  select
    wm.group_id,
    d.id as driver_id,
    max(wm.created_at) as last_seen
  from whatsapp_messages wm
  join drivers d
    on d.status='ativo'
   and right(regexp_replace(coalesce(d.phone,''), '[^0-9]', '', 'g'), 11)
       = right(regexp_replace(coalesce(wm.sender_phone,''), '[^0-9]', '', 'g'), 11)
  where wm.group_id is not null
    and wm.group_id <> ''
    and length(regexp_replace(coalesce(d.phone,''), '[^0-9]', '', 'g')) >= 10
  group by wm.group_id, d.id
), unique_groups as (
  select group_id, min(driver_id) as driver_id
  from candidates
  group by group_id
  having count(*) = 1
)
insert into whatsapp_group_drivers(group_id,driver_id,source)
select group_id,driver_id,'history_phone'
from unique_groups
on conflict (group_id) do nothing;
