import { execFileSync } from 'node:child_process';

const work = process.argv[2];
if (!work) throw new Error('payments diagnostic: work directory required');

const code = `
import { Pool } from "@neondatabase/serverless";
const databaseUrl = String(process.env.DATABASE_URL || "").trim();
if (!databaseUrl) throw new Error("DATABASE_URL missing");
const pool = new Pool({ connectionString: databaseUrl });

const rowsResult = await pool.query(
  "select d.id,d.name,d.status,d.commission_pct," +
  "case when d.commission_pct is null then 0 when d.commission_pct > 1 and d.commission_pct <= 100 then d.commission_pct/100.0 when d.commission_pct < 0 then 0 when d.commission_pct > 1 then 1 else d.commission_pct end as normalized_pct," +
  "coalesce(m.trip_count,0)::int as month_trip_count,coalesce(m.freight,0)::numeric as month_freight,coalesce(a.month_advances,0)::numeric as month_advances," +
  "coalesce(allt.trip_count,0)::int as all_trip_count,coalesce(allt.freight,0)::numeric as all_freight,coalesce(alla.all_advances,0)::numeric as all_advances " +
  "from drivers d " +
  "left join lateral (select count(*) as trip_count,sum(case when t.freight_mode='ton' then coalesce(t.net_weight,0)*coalesce(t.price_per_ton,0) else coalesce(t.price_per_trip,0) end) as freight from trips t where t.driver_id=d.id and t.date>=date_trunc('month',current_date)::date and t.date<=current_date) m on true " +
  "left join lateral (select sum(e.amount) as month_advances from expenses e where e.driver_id=d.id and e.category='Adiantamento' and e.date>=date_trunc('month',current_date)::date and e.date<=current_date) a on true " +
  "left join lateral (select count(*) as trip_count,sum(case when t.freight_mode='ton' then coalesce(t.net_weight,0)*coalesce(t.price_per_ton,0) else coalesce(t.price_per_trip,0) end) as freight from trips t where t.driver_id=d.id) allt on true " +
  "left join lateral (select sum(e.amount) as all_advances from expenses e where e.driver_id=d.id and e.category='Adiantamento') alla on true " +
  "order by lower(d.name)"
);
const unlinkedResult = await pool.query("select count(*)::int as count,coalesce(sum(amount),0)::numeric as total from expenses where category='Adiantamento' and driver_id is null");
const duplicatesResult = await pool.query(
  "select driver_id,date::text as date,amount::numeric as amount,coalesce(transaction_time::text,'') as time,count(*)::int as count " +
  "from expenses where category='Adiantamento' group by driver_id,date,amount,coalesce(transaction_time::text,'') having count(*)>1 order by count(*) desc,date desc limit 25"
);
await pool.end();

const rows = rowsResult.rows || [];
console.log("[payments-diagnostic] " + JSON.stringify({
  drivers: rows.map((r) => ({
    id: String(r.id),
    name: String(r.name),
    status: String(r.status),
    rawPct: Number(r.commission_pct || 0),
    pct: Number(r.normalized_pct || 0),
    monthTrips: Number(r.month_trip_count || 0),
    monthFreight: Number(r.month_freight || 0),
    monthCommission: Number(r.month_freight || 0) * Number(r.normalized_pct || 0),
    monthAdvances: Number(r.month_advances || 0),
    allTrips: Number(r.all_trip_count || 0),
    allFreight: Number(r.all_freight || 0),
    allCommission: Number(r.all_freight || 0) * Number(r.normalized_pct || 0),
    allAdvances: Number(r.all_advances || 0),
  })),
  unlinkedAdvances: (unlinkedResult.rows || [])[0] || null,
  duplicateAdvanceKeys: duplicatesResult.rows || [],
}));
`;

execFileSync(process.execPath, ['--input-type=module', '-e', code], {
  cwd: work,
  stdio: 'inherit',
  env: process.env,
});
