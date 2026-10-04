-- Pagamentos de motoristas separados das despesas operacionais.
-- Adiantamentos continuam em expenses(category='Adiantamento') e são consolidados
-- junto com estes pagamentos na nova aba de acertos.
create table if not exists driver_payments (
  id text primary key,
  driver_id text not null references drivers(id) on delete cascade,
  payment_date date not null,
  amount double precision not null check (amount > 0),
  note text not null default '',
  period_start date not null,
  period_end date not null,
  created_by text,
  created_at timestamptz not null default now()
);

create index if not exists driver_payments_driver_period_idx
  on driver_payments(driver_id, period_start, period_end, payment_date);

create index if not exists driver_payments_created_at_idx
  on driver_payments(created_at desc);
