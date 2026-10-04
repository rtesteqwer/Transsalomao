import { neon } from "@neondatabase/serverless";

const databaseUrl = String(process.env.DATABASE_URL || "").trim();
if (!databaseUrl) throw new Error("[fix-luis-ton-price] DATABASE_URL ausente");

const sql = neon(databaseUrl);
const candidates = await sql`
  select r.id, r.created_at
  from reports r
  join drivers d on d.id = r.driver_id
  where r.status = 'pendente'
    and r.freight_mode = 'ton'
    and lower(trim(d.name)) like 'lui%'
    and r.created_at >= timestamptz '2026-10-04 13:00:00-03'
    and r.created_at <  timestamptz '2026-10-05 00:00:00-03'
  order by r.created_at desc, r.id desc
`;

if (candidates.length > 60) {
  throw new Error("[fix-luis-ton-price] proteção acionada: candidatos demais (" + candidates.length + ")");
}

let updated = 0;
let missingMetadata = 0;
for (const row of candidates) {
  const changed = await sql`
    update tickets_balanca
    set ticket_data = jsonb_set(
      coalesce(ticket_data, '{}'::jsonb),
      '{price_per_ton}',
      to_jsonb(17::numeric),
      true
    )
    where report_id = ${row.id}
    returning report_id
  `;
  if (changed.length) updated += changed.length;
  else missingMetadata += 1;
}

console.log(
  "[fix-luis-ton-price] pending=" + candidates.length +
  " updated=" + updated +
  " missing_metadata=" + missingMetadata +
  " price_per_ton=17"
);

const luisDrivers = await sql`
  select id, name
  from drivers
  where lower(trim(name)) like 'luis%'
  order by name
`;
console.log("[audit-luis] drivers=" + JSON.stringify(luisDrivers));

if (luisDrivers.length === 1) {
  const driverId = luisDrivers[0].id;
  const modeSummary = await sql`
    select
      freight_mode,
      count(*)::int as trips,
      round(sum(
        case
          when freight_mode = 'ton' then coalesce(net_weight, loaded_tons, 0) * coalesce(price_per_ton, 0)
          else coalesce(price_per_trip, 0)
        end
      )::numeric, 3) as freight,
      round(sum(
        case
          when freight_mode = 'ton' then coalesce(net_weight, loaded_tons, 0) * coalesce(price_per_ton, 0)
          else coalesce(price_per_trip, 0)
        end
      )::numeric * 0.20, 3) as commission_20
    from trips
    where driver_id = ${driverId}
      and date between date '2026-09-15' and date '2026-10-04'
    group by freight_mode
    order by freight_mode
  `;

  const fixedSummary = await sql`
    select freight_mode, price_per_trip, count(*)::int as trips
    from trips
    where driver_id = ${driverId}
      and date between date '2026-09-15' and date '2026-10-04'
      and freight_mode in ('caixinha','cegonha','trip')
    group by freight_mode, price_per_trip
    order by freight_mode, price_per_trip
  `;

  const targetTonTrips = await sql`
    select id, code, date, net_weight, loaded_tons, price_per_ton, price_per_trip, fleet_id, created_at
    from trips
    where driver_id = ${driverId}
      and date between date '2026-09-15' and date '2026-10-04'
      and freight_mode = 'ton'
    order by date, code
  `;

  const advances = await sql`
    select id, date, transaction_time, amount, description, category, driver_id
    from expenses
    where driver_id = ${driverId}
      and category = 'Adiantamento'
      and date between date '2026-09-15' and date '2026-10-04'
    order by date, id
  `;

  console.log("[audit-luis] mode_summary=" + JSON.stringify(modeSummary));
  console.log("[audit-luis] fixed_summary=" + JSON.stringify(fixedSummary));
  console.log("[audit-luis] ton_trips=" + JSON.stringify(targetTonTrips));
  console.log("[audit-luis] advances=" + JSON.stringify(advances));
}

