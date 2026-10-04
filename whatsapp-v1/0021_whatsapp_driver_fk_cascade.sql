-- Allow deleting/updating a driver without stale WhatsApp bindings blocking it.
-- Operational trip/history tables are intentionally untouched; only WhatsApp
-- association tables cascade with the driver record.
alter table if exists whatsapp_group_drivers
  drop constraint if exists whatsapp_group_drivers_driver_id_fkey;

alter table if exists whatsapp_group_drivers
  add constraint whatsapp_group_drivers_driver_id_fkey
  foreign key (driver_id)
  references drivers(id)
  on delete cascade
  on update cascade;

alter table if exists whatsapp_group_invite_claims
  drop constraint if exists whatsapp_group_invite_claims_driver_id_fkey;

alter table if exists whatsapp_group_invite_claims
  add constraint whatsapp_group_invite_claims_driver_id_fkey
  foreign key (driver_id)
  references drivers(id)
  on delete cascade
  on update cascade;
