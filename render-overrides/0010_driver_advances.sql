alter table expenses
  add column if not exists driver_id text;

alter table expenses
  alter column fleet_id drop not null;

alter table expenses
  alter column asset_type drop not null;

create index if not exists expenses_driver_id_idx on expenses (driver_id);
create index if not exists expenses_date_idx on expenses (date);
