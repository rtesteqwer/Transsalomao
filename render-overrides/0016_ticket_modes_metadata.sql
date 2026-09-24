alter table tickets_balanca alter column peso_liquido_kg drop not null;
alter table tickets_balanca add column if not exists destinatario text;
alter table tickets_balanca add column if not exists freight_mode text;

create index if not exists tickets_balanca_freight_mode_idx on tickets_balanca(freight_mode);
