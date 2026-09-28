-- Reconciliacao idempotente do relatorio antigo de Klebersom (setembro/2026).
-- Regra de seguranca: nunca aceita uma viagem automaticamente e nunca apaga dados atuais.
-- So cria no Caixa (reports.status='pendente') viagens por tonelada/diaria comprovadas pelo PDF
-- que nao possuem equivalente no banco atual. Cegonha agregada nao e inventada sem data individual.

create table if not exists legacy_reconciliation_audit (
  reconciliation_key text primary key,
  source_name text not null,
  driver_id text,
  expected jsonb not null,
  result jsonb not null,
  updated_at timestamptz not null default now()
);

with driver as (
  select id
  from drivers
  where lower(trim(name)) = 'klebersom dutra da silva'
  limit 1
),
expected(legacy_ticket, trip_date, tons, price_per_ton) as (
  values
    ('190',date '2026-09-16',27.16::double precision,35::double precision),
    ('191',date '2026-09-16',32.72,17),('192',date '2026-09-16',26.48,35),
    ('193',date '2026-09-16',32.70,33),('194',date '2026-09-16',29.96,33),
    ('195',date '2026-09-16',30.44,33),('196',date '2026-09-16',38.42,41),
    ('197',date '2026-09-16',37.40,40),('198',date '2026-09-16',24.88,35),
    ('199',date '2026-09-16',34.70,14),('200',date '2026-09-16',33.30,14),
    ('201',date '2026-09-16',33.76,14),('202',date '2026-09-16',34.48,14),
    ('203',date '2026-09-16',37.62,14),('204',date '2026-09-16',33.32,40),
    ('205',date '2026-09-16',34.14,40),('207',date '2026-09-16',33.06,40),
    ('250',date '2026-09-22',33.58,14),('251',date '2026-09-22',34.40,14),
    ('252',date '2026-09-22',33.78,14),('253',date '2026-09-22',34.78,14),
    ('254',date '2026-09-22',33.70,14),('255',date '2026-09-22',34.58,14),
    ('256',date '2026-09-22',33.98,14),('257',date '2026-09-22',33.86,14),
    ('258',date '2026-09-22',35.48,14),('261',date '2026-09-22',33.16,26),
    ('262',date '2026-09-22',35.50,26),('264',date '2026-09-22',36.96,26),
    ('266',date '2026-09-22',38.48,26),('270',date '2026-09-23',37.30,26),
    ('271',date '2026-09-23',36.54,26),('272',date '2026-09-23',36.07,26)
),
resolved as (
  select e.*, d.id as driver_id,
    coalesce(
      (
        select min(x.fleet_id)
        from (
          select t.fleet_id from trips t where t.driver_id=d.id and t.date=e.trip_date
          union all
          select r.fleet_id from reports r
          where r.driver_id=d.id
            and coalesce(r.loading_date,(r.created_at at time zone 'America/Sao_Paulo')::date)=e.trip_date
        ) x
        where x.fleet_id is not null
        having count(distinct x.fleet_id)=1
      ),
      (
        select min(x.fleet_id)
        from (
          select t.fleet_id from trips t where t.driver_id=d.id and t.date between date '2026-09-01' and date '2026-09-30'
          union all
          select r.fleet_id from reports r
          where r.driver_id=d.id
            and coalesce(r.loading_date,(r.created_at at time zone 'America/Sao_Paulo')::date)
                between date '2026-09-01' and date '2026-09-30'
        ) x
        where x.fleet_id is not null
        having count(distinct x.fleet_id)=1
      )
    ) as fleet_id
  from expected e cross join driver d
),
missing as (
  select x.*
  from resolved x
  where x.fleet_id is not null
    and not exists (
      select 1 from trips t
      where t.driver_id=x.driver_id
        and t.date=x.trip_date
        and coalesce(t.freight_mode,'ton')='ton'
        and abs(coalesce(nullif(t.net_weight,0),t.loaded_tons,0)-x.tons) < 0.006
    )
    and not exists (
      select 1 from reports r
      where r.driver_id=x.driver_id
        and r.status='pendente'
        and coalesce(r.freight_mode,'ton')='ton'
        and coalesce(r.loading_date,(r.created_at at time zone 'America/Sao_Paulo')::date)=x.trip_date
        and abs(coalesce(r.tons,0)-x.tons) < 0.006
    )
)
insert into reports(id,ticket,driver_id,fleet_id,km,tons,daily_value,freight_mode,status,loading_date,created_at)
select
  'rep_legacy_kleb_pdf_'||m.legacy_ticket,
  m.legacy_ticket,
  m.driver_id,
  m.fleet_id,
  0,
  m.tons,
  0,
  'ton',
  'pendente',
  m.trip_date,
  (m.trip_date + time '12:00') at time zone 'America/Sao_Paulo'
from missing m
on conflict(id) do nothing;

with expected(legacy_ticket, trip_date, tons, price_per_ton) as (
  values
    ('190',date '2026-09-16',27.16::double precision,35::double precision),
    ('191',date '2026-09-16',32.72,17),('192',date '2026-09-16',26.48,35),
    ('193',date '2026-09-16',32.70,33),('194',date '2026-09-16',29.96,33),
    ('195',date '2026-09-16',30.44,33),('196',date '2026-09-16',38.42,41),
    ('197',date '2026-09-16',37.40,40),('198',date '2026-09-16',24.88,35),
    ('199',date '2026-09-16',34.70,14),('200',date '2026-09-16',33.30,14),
    ('201',date '2026-09-16',33.76,14),('202',date '2026-09-16',34.48,14),
    ('203',date '2026-09-16',37.62,14),('204',date '2026-09-16',33.32,40),
    ('205',date '2026-09-16',34.14,40),('207',date '2026-09-16',33.06,40),
    ('250',date '2026-09-22',33.58,14),('251',date '2026-09-22',34.40,14),
    ('252',date '2026-09-22',33.78,14),('253',date '2026-09-22',34.78,14),
    ('254',date '2026-09-22',33.70,14),('255',date '2026-09-22',34.58,14),
    ('256',date '2026-09-22',33.98,14),('257',date '2026-09-22',33.86,14),
    ('258',date '2026-09-22',35.48,14),('261',date '2026-09-22',33.16,26),
    ('262',date '2026-09-22',35.50,26),('264',date '2026-09-22',36.96,26),
    ('266',date '2026-09-22',38.48,26),('270',date '2026-09-23',37.30,26),
    ('271',date '2026-09-23',36.54,26),('272',date '2026-09-23',36.07,26)
),
driver as (
  select id,name from drivers where lower(trim(name))='klebersom dutra da silva' limit 1
),
staged as (
  select e.*,d.id as driver_id,d.name as driver_name,r.id as report_id,r.fleet_id
  from expected e cross join driver d
  join reports r on r.id='rep_legacy_kleb_pdf_'||e.legacy_ticket
  where r.status='pendente'
)
insert into tickets_balanca(
  numero_ticket,peso_liquido_kg,data_pesagem,motorista,driver_id,fleet_id,report_id,freight_mode,ticket_data
)
select
  case
    when exists(
      select 1 from tickets_balanca old
      where old.numero_ticket=s.legacy_ticket and old.report_id is distinct from s.report_id
    ) then 'LEGACY-KLEB-'||s.legacy_ticket
    else s.legacy_ticket
  end,
  round(s.tons*1000)::integer,
  s.trip_date::text,
  s.driver_name,
  s.driver_id,
  s.fleet_id,
  s.report_id,
  'ton',
  jsonb_build_object(
    'source','DOC-20260923-WA0005.pdf',
    'source_type','legacy_operational_report',
    'legacy_ticket',s.legacy_ticket,
    'price_per_ton',s.price_per_ton,
    'expected_freight',round((s.tons*s.price_per_ton)::numeric,2),
    'data_ticket',s.trip_date::text,
    'confirmed_for_admin_review',true
  )
from staged s
where not exists(select 1 from tickets_balanca tb where tb.report_id=s.report_id)
on conflict(numero_ticket) do nothing;

-- Diaria de R$ 3.200,00 em 16/09/2026: data e valor sao explicitos no PDF.
with driver as (
  select id from drivers where lower(trim(name))='klebersom dutra da silva' limit 1
),
fleet as (
  select d.id as driver_id,
    coalesce(
      (
        select min(x.fleet_id) from (
          select t.fleet_id from trips t where t.driver_id=d.id and t.date=date '2026-09-16'
          union all
          select r.fleet_id from reports r
          where r.driver_id=d.id and coalesce(r.loading_date,(r.created_at at time zone 'America/Sao_Paulo')::date)=date '2026-09-16'
        ) x where x.fleet_id is not null having count(distinct x.fleet_id)=1
      ),
      (
        select min(x.fleet_id) from (
          select t.fleet_id from trips t where t.driver_id=d.id and t.date between date '2026-09-01' and date '2026-09-30'
          union all
          select r.fleet_id from reports r
          where r.driver_id=d.id and coalesce(r.loading_date,(r.created_at at time zone 'America/Sao_Paulo')::date) between date '2026-09-01' and date '2026-09-30'
        ) x where x.fleet_id is not null having count(distinct x.fleet_id)=1
      )
    ) as fleet_id
  from driver d
)
insert into reports(id,ticket,driver_id,fleet_id,km,tons,daily_value,freight_mode,status,loading_date,created_at)
select
  'rep_legacy_kleb_pdf_daily_20260916','LEGACY-DIARIA-1609',f.driver_id,f.fleet_id,
  0,0,3200,'trip','pendente',date '2026-09-16',timestamptz '2026-09-16 12:00:00-03'
from fleet f
where f.fleet_id is not null
  and not exists(
    select 1 from trips t
    where t.driver_id=f.driver_id and t.date=date '2026-09-16' and t.freight_mode='trip'
  )
  and not exists(
    select 1 from reports r
    where r.driver_id=f.driver_id and r.status='pendente' and r.freight_mode='trip'
      and coalesce(r.loading_date,(r.created_at at time zone 'America/Sao_Paulo')::date)=date '2026-09-16'
  )
on conflict(id) do nothing;

-- Auditoria: registra o estado apos a reconciliacao. Cegonha nao e criada sem datas individuais.
with d as (
  select id from drivers where lower(trim(name))='klebersom dutra da silva' limit 1
),
counts as (
  select
    d.id as driver_id,
    (select count(*) from reports r where r.driver_id=d.id and r.status='pendente' and r.id like 'rep_legacy_kleb_pdf_%')::int as staged_legacy,
    (
      select count(*) from trips t
      where t.driver_id=d.id and t.freight_mode='cegonha' and t.date between date '2026-09-16' and date '2026-09-22'
    )::int +
    (
      select count(*) from reports r
      where r.driver_id=d.id and r.status='pendente' and r.freight_mode='cegonha'
        and coalesce(r.loading_date,(r.created_at at time zone 'America/Sao_Paulo')::date) between date '2026-09-16' and date '2026-09-22'
    )::int as cegonha_found,
    (
      select count(*) from trips t
      where t.driver_id=d.id and t.date between date '2026-09-01' and date '2026-09-30'
    )::int as accepted_sep
  from d
)
insert into legacy_reconciliation_audit(reconciliation_key,source_name,driver_id,expected,result,updated_at)
select
  'klebersom-2026-09-pdf',
  'DOC-20260923-WA0005.pdf',
  c.driver_id,
  jsonb_build_object(
    'trips',46,'freight',40173.02,'commission',8034.60,'diesel',6020.14,'net',26118.28,
    'ton_trips',33,'ton_freight',26821.02,'cegonha_trips',12,'cegonha_freight',10152,'daily_trips',1,'daily_freight',3200
  ),
  jsonb_build_object(
    'accepted_september_trips',c.accepted_sep,
    'staged_legacy_reports',c.staged_legacy,
    'cegonha_found_16_to_22',c.cegonha_found,
    'cegonha_missing_without_individual_dates',greatest(0,12-c.cegonha_found),
    'policy','new legacy rows remain pending in Caixa; no automatic acceptance or deletion'
  ),
  now()
from counts c
on conflict(reconciliation_key) do update set
  driver_id=excluded.driver_id,
  expected=excluded.expected,
  result=excluded.result,
  updated_at=excluded.updated_at;
