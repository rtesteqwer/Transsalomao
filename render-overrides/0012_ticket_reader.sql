create table if not exists tickets_balanca (
  id bigserial primary key,
  numero_ticket text unique not null,
  placa_veiculo text,
  placa_carreta text,
  produto text,
  pesagem_inicial_kg integer,
  pesagem_final_kg integer,
  peso_liquido_kg integer not null,
  data_pesagem text,
  numero_nf text,
  transportadora text,
  motorista text,
  km_carreta integer,
  driver_id text,
  fleet_id text,
  report_id text,
  viagem_id text,
  criado_em timestamptz not null default now()
);

create index if not exists tickets_balanca_report_idx on tickets_balanca(report_id);
create index if not exists tickets_balanca_viagem_idx on tickets_balanca(viagem_id);
create index if not exists tickets_balanca_driver_idx on tickets_balanca(driver_id);
