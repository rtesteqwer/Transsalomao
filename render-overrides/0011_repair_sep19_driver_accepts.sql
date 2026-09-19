-- Recuperação cirúrgica dos 7 lançamentos Cegonha aceitos em 19/09/2026
-- durante a janela em que a rotina antiga reutilizava viagens por colisão de ticket.
-- Não apaga nem altera viagens históricas; cria apenas a viagem que faltou e religa o report.
-- Idempotente: se o report já aponta para uma viagem compatível de 19/09, nada é feito.

lock table trips in share row exclusive mode;

with repair_candidates as (
  select
    r.*,
    row_number() over (order by r.created_at, r.id) as rn
  from reports r
  left join trips linked on linked.id = r.trip_id
  where r.created_at >= timestamptz '2026-09-19 11:33:50+00'
    and r.created_at <  timestamptz '2026-09-19 11:34:10+00'
    and r.status = 'aceito'
    and r.freight_mode = 'cegonha'
    and not (
      linked.id is not null
      and linked.date = (r.created_at at time zone 'America/Sao_Paulo')::date
      and linked.driver_id = r.driver_id
      and linked.fleet_id = r.fleet_id
      and linked.freight_mode = 'cegonha'
      and abs(coalesce(linked.loaded_tons, 0) - coalesce(r.tons, 0)) < 0.000001
      and abs(coalesce(linked.km_end, 0) - coalesce(r.km, 0)) < 0.000001
    )
),
base_code as (
  select coalesce(max(code::int), 0) as max_code
  from trips
  where code ~ '^[0-9]+$'
),
inserted as (
  insert into trips (
    id, code, date, client, origin, destination,
    driver_id, fleet_id,
    loaded_tons, gross_weight, net_weight,
    freight_mode, price_per_ton, price_per_trip,
    km_start, km_end, diesel_liters, diesel_price
  )
  select
    'trip_recovery_20260919_' || rc.id,
    ((select max_code from base_code) + rc.rn)::text,
    (rc.created_at at time zone 'America/Sao_Paulo')::date,
    '', '', '',
    rc.driver_id,
    rc.fleet_id,
    coalesce(rc.tons, 0),
    0,
    coalesce(rc.tons, 0),
    'cegonha',
    0,
    coalesce(
      nullif((select fp.price from freight_prices fp where fp.mode = 'cegonha'), 0),
      nullif((select old.price_per_trip from trips old where old.id = rc.trip_id), 0),
      (
        select t.price_per_trip
        from trips t
        where t.freight_mode = 'cegonha' and t.price_per_trip > 0
        order by t.date desc, t.code desc
        limit 1
      ),
      0
    ),
    coalesce((
      select prev.km_end
      from trips prev
      where prev.fleet_id = rc.fleet_id
        and prev.id is distinct from rc.trip_id
        and prev.km_end <= coalesce(rc.km, 0)
      order by prev.km_end desc
      limit 1
    ), 0),
    coalesce(rc.km, 0),
    0,
    0
  from repair_candidates rc
  on conflict (id) do nothing
  returning id
)
update reports r
set
  trip_id = fixed.id,
  ticket = fixed.code,
  status = 'aceito'
from trips fixed
where fixed.id = 'trip_recovery_20260919_' || r.id
  and r.created_at >= timestamptz '2026-09-19 11:33:50+00'
  and r.created_at <  timestamptz '2026-09-19 11:34:10+00'
  and r.freight_mode = 'cegonha';
