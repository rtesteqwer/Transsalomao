import { neon } from "@neondatabase/serverless";
import { createHash } from "node:crypto";

const url = process.env.DATABASE_URL?.trim();
if (!url) throw new Error("Klebersom Volvo import: DATABASE_URL missing");
const sql = neon(url);
const source = "1-82543|2026-09-08|0|cegonha|846|Transilva|Cegonha|\n1-82457|2026-09-08|0|cegonha|846|Transilva|Cegonha|\n1-82405|2026-09-08|0|cegonha|846|Transilva|Cegonha|\n1-82500|2026-09-08|0|cegonha|846|Transilva|Cegonha|\nVOLVO-IMG-20260912-WA0004|2026-09-12|27.16|ton|35|Papaléguas|Uréia|Adubos Real\n001533/000013|2026-09-09|32.72|ton|17|Rota do Sol|Eco|\nVOLVO-IMG-20260912-WA0008|2026-09-11|26.48|ton|35|Papaléguas|Uréia|Adubos Real\nVOLVO-IMG-20260912-WA0009|2026-09-10|32.7|ton|33|Papaléguas / Rota do Sol|MAP|\nVOLVO-IMG-20260912-WA0010|2026-09-10|29.96|ton|33|Papaléguas / Rota do Sol|MAP|\nVOLVO-IMG-20260912-WA0011|2026-09-09|30.44|ton|33|Papaléguas / Rota do Sol|MAP|\n5192|2026-09-11|38.42|ton|41|Papaléguas|Eco|Festipar\n5047|2026-09-10|37.4|ton|40|Rota do Sol|Eco|Festipar\nVOLVO-IMG-20260912-WA0015|2026-09-12|24.88|ton|35|Papaléguas|Uréia|Adubos Real\n000024234|2026-09-13|34.7|ton|14|RAS||\n000024275|2026-09-13|33.3|ton|14|RAS||\n000024192|2026-09-12|33.76|ton|14|RAS||\n000024321|2026-09-13|34.48|ton|14|RAS||\n000024367|2026-09-13|37.62|ton|14|RAS||\n5604|2026-09-15|33.32|ton|40|Sportos|Eco|Festipar\n5755|2026-09-16|34.14|ton|40|Sportos|Base|Festipar\n5819|2026-09-16|33.06|ton|40|Sportos|Base|Festipar\n1039013373|2026-09-17|24.08|ton|33|Sportos|Eco|Adubos Real\n000024847|2026-09-21|33.86|ton|14|RAS||\n000024824|2026-09-20|33.98|ton|14|RAS||\n000024735|2026-09-19|34.58|ton|14|RAS||\n000024793|2026-09-20|33.7|ton|14|RAS||\n000024784|2026-09-20|34.78|ton|14|RAS||\n000024774|2026-09-20|33.78|ton|14|RAS||\n000024762|2026-09-20|34.44|ton|14|RAS||\n000024750|2026-09-20|35.48|ton|14|RAS||\n000024722|2026-09-19|33.58|ton|14|RAS||\n1-82826|2026-09-17|0|cegonha|846|Transilva|Cegonha|\n1-83088|2026-09-18|0|cegonha|846|Transilva|Cegonha|\n1-82917|2026-09-18|0|cegonha|846|Transilva|Cegonha|\n1-82779|2026-09-17|0|cegonha|846|Transilva|Cegonha|\n1-82999|2026-09-18|0|cegonha|846|Transilva|Cegonha|\n1-83045|2026-09-18|0|cegonha|846|Transilva|Cegonha|\n1-83101|2026-09-18|0|cegonha|846|Transilva|Cegonha|\n1-82873|2026-09-17|0|cegonha|846|Transilva|Cegonha|\n0023829|2026-09-21|35.05|ton|26|RAS - Heringer||\n0023800|2026-09-21|33.16|ton|26|RAS||\n0023933|2026-09-22|36.96|ton|26|RAS||\n0023978|2026-09-22|38.48|ton|26|RAS||\n0024012|2026-09-22|36.54|ton|26|RAS||\n0024037|2026-09-22|37.3|ton|26|RAS||\n0024060|2026-09-23|36.05|ton|26|RAS||\n0024090|2026-09-23|35.81|ton|26|RAS||\n0024125|2026-09-23|34.45|ton|26|RAS||\n3544724|2026-09-29|25.81|ton|11|Buaiz|Galpão|Vitória\n3544717|2026-09-29|25.42|ton|11|Buaiz|Galpão|Vitória\n3544720|2026-09-29|24.49|ton|11|Buaiz|Galpão|Vitória\n3544631|2026-09-26|25.8|ton|11|Buaiz|Galpão|Vitória\n3544628|2026-09-26|25.12|ton|11|Buaiz|Galpão|Vitória\n3544626|2026-09-26|25.54|ton|11|Buaiz|Galpão|Vitória\n3544581|2026-09-24|24.99|ton|11|Buaiz|Galpão|Vitória\n3544606|2026-09-25|25.62|ton|11|Buaiz|Galpão|Vitória\n3544585|2026-09-25|25.45|ton|11|Buaiz|Galpão|Vitória\n3544584|2026-09-24|25.16|ton|11|Buaiz|Galpão|Vitória\n3544610|2026-09-25|25.14|ton|11|Buaiz|Galpão|Vitória\n3544578|2026-09-24|25.34|ton|11|Buaiz|Galpão|Vitória\n3544617|2026-09-26|25.37|ton|11|Buaiz|Galpão|Vitória\n3544614|2026-09-25|25.24|ton|11|Buaiz|Galpão|Vitória\n3544623|2026-09-26|25.27|ton|11|Buaiz|Galpão|Vitória\n3544620|2026-09-26|24.9|ton|11|Buaiz|Galpão|Vitória\n3544571|2026-09-24|26.02|ton|11|Buaiz|Galpão|Vitória\n3544574|2026-09-24|24.74|ton|11|Buaiz|Galpão|Vitória\n3544569|2026-09-24|25.55|ton|11|Buaiz|Galpão|Vitória\n3544566|2026-09-24|25.69|ton|11|Buaiz|Galpão|Vitória\n3544600|2026-09-25|24.93|ton|11|Buaiz|Galpão|Vitória\n3544595|2026-09-25|24.62|ton|11|Buaiz|Galpão|Vitória\n3544592|2026-09-25|24.24|ton|11|Buaiz|Galpão|Vitória\n3544714|2026-09-29|24.7|ton|11|Buaiz|Galpão|Vitória\n3544711|2026-09-29|25.55|ton|11|Buaiz|Galpão|Vitória\n3544707|2026-09-29|25.69|ton|11|Buaiz|Galpão|Vitória\n3544703|2026-09-28|25.76|ton|11|Buaiz|Galpão|Vitória\n3544699|2026-09-28|25.52|ton|11|Buaiz|Galpão|Vitória\n3544696|2026-09-28|26.15|ton|11|Buaiz|Galpão|Vitória\n3544688|2026-09-28|25.75|ton|11|Buaiz|Galpão|Vitória\n3544692|2026-09-28|26.01|ton|11|Buaiz|Galpão|Vitória\n3544577|2026-09-28|24.94|ton|11|Buaiz|Galpão|Vitória\n3544680|2026-09-28|26.06|ton|11|Buaiz|Galpão|Vitória\n3544676|2026-09-28|25.28|ton|11|Buaiz|Galpão|Vitória\n3544668|2026-09-26|25.82|ton|11|Buaiz|Galpão|Vitória\n3544672|2026-09-28|25.8|ton|11|Buaiz|Galpão|Vitória\n3544634|2026-09-26|25.55|ton|11|Buaiz|Galpão|Vitória\n3544646|2026-09-26|25.13|ton|11|Buaiz|Galpão|Vitória\n3544641|2026-09-26|24.16|ton|11|Buaiz|Galpão|Vitória\n3544656|2026-09-26|26.37|ton|11|Buaiz|Galpão|Vitória\n3544637|2026-09-26|25.99|ton|11|Buaiz|Galpão|Vitória\n3544651|2026-09-26|25.56|ton|11|Buaiz|Galpão|Vitória\n3544661|2026-09-26|26.04|ton|11|Buaiz|Galpão|Vitória\n7267|2026-09-30|22.16|ton|40|Viafort (Suedson)||\n001551/000216|2026-09-30|25.08|ton|17|Viafort||\nMULTILIFT-20260916|2026-09-16|0|trip|3200|Multilift|Interno|Interno";
const rows = source.trim().split("\n").map((line) => {
  const [code,date,tons,mode,price,client,origin,destination] = line.split("|");
  return { code,date,tons:Number(tons),mode,price:Number(price),client,origin,destination };
});
const norm = (v) => String(v || "").toUpperCase().replace(/[^A-Z0-9]/g, "");

const drivers = await sql`
  select id,name from drivers
  where lower(name) like 'kleber%'
  order by case when lower(name) like 'klebersom%' then 0 when lower(name) like 'kleberson%' then 1 else 2 end, name
`;
if (!drivers.length) throw new Error("Klebersom Volvo import: driver not found");
const driver = drivers[0];
if (drivers.length > 1) console.log("[klebersom-volvo-import] driver candidates=" + drivers.map(x => x.name).join(", ") + "; using=" + driver.name);

let fleets = await sql`
  select id,name,tractor_plate,trailer_plate from fleets
  where status='ativo'
    and regexp_replace(upper(coalesce(tractor_plate,'')), '[^A-Z0-9]', '', 'g')='QWS3E13'
  order by name
`;
if (!fleets.length) {
  fleets = await sql`
    select f.id,f.name,f.tractor_plate,f.trailer_plate
    from trips t join fleets f on f.id=t.fleet_id
    where t.driver_id=${driver.id}
    order by t.date desc,t.created_at desc nulls last limit 1
  `;
}
if (!fleets.length) throw new Error("Klebersom Volvo import: fleet QWS3E13 not found");
const fleet = fleets[0];
console.log("[klebersom-volvo-import] driver=" + driver.name + " fleet=" + fleet.name + " rows=" + rows.length);

const fixedGroups = new Map();
for (const r of rows.filter(x => x.mode !== "ton")) {
  const key = r.date + "|" + r.mode + "|" + r.price;
  if (!fixedGroups.has(key)) fixedGroups.set(key, []);
  fixedGroups.get(key).push(r);
}
const fixedFallback = new Map();
for (const [key, group] of fixedGroups) {
  const r = group[0];
  const ex = await sql`select count(*)::int as n from trips where driver_id=${driver.id} and date=${r.date}::date and freight_mode=${r.mode} and abs(coalesce(price_per_trip,0)::float8-${r.price})<0.01`;
  let exact = 0;
  for (const s of group) {
    const n = norm(s.code);
    const m = await sql`select 1 from trips where driver_id=${driver.id} and (regexp_replace(upper(coalesce(code,'')), '[^A-Z0-9]', '', 'g')=${n} or regexp_replace(upper(coalesce(code,'')), '[^A-Z0-9]', '', 'g')=${"VOLVO"+n}) limit 1`;
    if (m[0]) exact++;
  }
  fixedFallback.set(key, Math.max(0, Number(ex[0]?.n || 0) - exact));
}

const result = { inserted:0, duplicateTrip:0, duplicateReport:0, duplicateTicket:0, duplicateFallback:0, errors:[] };
const inserted=[]; const skipped=[];
for (const r of rows) {
  try {
    const codeNorm = norm(r.code);
    const generated = String(r.code).startsWith("VOLVO-");
    let duplicate = null;
    const byCode = await sql`select id from trips where driver_id=${driver.id} and (regexp_replace(upper(coalesce(code,'')), '[^A-Z0-9]', '', 'g')=${codeNorm} or regexp_replace(upper(coalesce(code,'')), '[^A-Z0-9]', '', 'g')=${"VOLVO"+codeNorm}) limit 1`;
    if (byCode[0]) duplicate="trip-code";

    if (!duplicate && r.mode === "ton") {
      const byTrip = await sql`select id from trips where driver_id=${driver.id} and date=${r.date}::date and abs(coalesce(net_weight,loaded_tons,0)::float8-${r.tons})<0.011 limit 1`;
      if (byTrip[0]) duplicate="trip-date-weight";
    }
    if (!duplicate && r.mode === "ton") {
      const byReport = await sql`select id from reports where driver_id=${driver.id} and (case when loading_date::text ~ '^\\d{2}/\\d{2}/\\d{4}' then to_date(substr(loading_date::text,1,10),'DD/MM/YYYY') when loading_date::text ~ '^\\d{4}-\\d{2}-\\d{2}' then substr(loading_date::text,1,10)::date else null end)=${r.date}::date and abs(coalesce(tons,0)::float8-${r.tons})<0.011 limit 1`;
      if (byReport[0]) duplicate="report-date-weight";
    }
    if (!duplicate && r.mode === "ton") {
      const byTicketWeight = await sql`select numero_ticket from tickets_balanca where driver_id=${driver.id} and (case when data_pesagem::text ~ '^\\d{2}/\\d{2}/\\d{4}' then to_date(substr(data_pesagem::text,1,10),'DD/MM/YYYY') when data_pesagem::text ~ '^\\d{4}-\\d{2}-\\d{2}' then substr(data_pesagem::text,1,10)::date else null end)=${r.date}::date and abs(coalesce(peso_liquido_kg,0)::float8-${r.tons*1000})<11 limit 1`;
      if (byTicketWeight[0]) duplicate="ticket-date-weight";
    }
    if (!duplicate && r.mode === "ton" && !generated) {
      const byTicket = await sql`select numero_ticket from tickets_balanca where driver_id=${driver.id} and regexp_replace(upper(coalesce(numero_ticket,'')), '[^A-Z0-9]', '', 'g')=${codeNorm} limit 1`;
      if (byTicket[0]) duplicate="ticket-code";
    }
    if (!duplicate && r.mode !== "ton") {
      const key = r.date + "|" + r.mode + "|" + r.price;
      let slots = fixedFallback.get(key) || 0;
      if (slots > 0) { duplicate="fixed-count"; fixedFallback.set(key, slots-1); }
    }
    if (duplicate) {
      if (duplicate.startsWith("trip")) result.duplicateTrip++;
      else if (duplicate.startsWith("report")) result.duplicateReport++;
      else if (duplicate.startsWith("ticket")) result.duplicateTicket++;
      else result.duplicateFallback++;
      skipped.push({code:r.code,reason:duplicate});
      continue;
    }

    const suffix = createHash("sha256").update([r.code,r.date,r.tons,r.price,r.client].join("|")).digest("hex").slice(0,16);
    const id = "trip_volvo_" + suffix;
    const storedCode = "VOLVO-" + String(r.code).replace(/^VOLVO-/,"").slice(0,60);
    if (r.mode === "ton") {
      await sql`insert into trips (id,code,date,client,origin,destination,driver_id,fleet_id,loaded_tons,gross_weight,net_weight,freight_mode,price_per_ton,price_per_trip,km_start,km_end,diesel_liters,diesel_price)
        values (${id},${storedCode},${r.date}::date,${r.client},${r.origin},${r.destination},${driver.id},${fleet.id},${r.tons},0,${r.tons},'ton',${r.price},0,0,0,0,0)
        on conflict (id) do nothing`;
    } else {
      await sql`insert into trips (id,code,date,client,origin,destination,driver_id,fleet_id,loaded_tons,gross_weight,net_weight,freight_mode,price_per_ton,price_per_trip,km_start,km_end,diesel_liters,diesel_price)
        values (${id},${storedCode},${r.date}::date,${r.client},${r.origin},${r.destination},${driver.id},${fleet.id},0,0,0,${r.mode},0,${r.price},0,0,0,0)
        on conflict (id) do nothing`;
    }
    result.inserted++;
    inserted.push({code:r.code,date:r.date,tons:r.tons,mode:r.mode,price:r.price});
  } catch (e) {
    result.errors.push({code:r.code,error:e instanceof Error ? e.message : String(e)});
  }
}

const buaiz = await sql`select count(*)::int as n, coalesce(sum(net_weight),0)::float8 as tons, coalesce(sum(net_weight*price_per_ton),0)::float8 as gross from trips where driver_id=${driver.id} and client='Buaiz' and origin='Galpão' and destination='Vitória' and price_per_ton=11 and date between '2026-09-24'::date and '2026-09-29'::date`;
console.log("[klebersom-volvo-import] RESULT " + JSON.stringify(result));
console.log("[klebersom-volvo-import] INSERTED " + JSON.stringify(inserted));
console.log("[klebersom-volvo-import] SKIPPED " + JSON.stringify(skipped));
// Segunda passada: ticket existente nao equivale a viagem existente.
// Garante uma viagem real para cada um dos 94 registros, sem duplicar.
const reconcile = { inserted: 0, alreadyTrip: 0, fixedInserted: 0, errors: [] };
const reconcileInserted = [];

for (const r of rows.filter((x) => x.mode === "ton")) {
  try {
    const codeNorm = norm(r.code);
    const byTrip = await sql`
      select id from trips
      where driver_id=${driver.id}
        and (
          regexp_replace(upper(coalesce(code,'')), '[^A-Z0-9]', '', 'g')=${codeNorm}
          or regexp_replace(upper(coalesce(code,'')), '[^A-Z0-9]', '', 'g')=${"VOLVO"+codeNorm}
          or (date=${r.date}::date and abs(coalesce(net_weight,loaded_tons,0)::float8-${r.tons})<0.011)
        )
      limit 1
    `;
    if (byTrip[0]) { reconcile.alreadyTrip++; continue; }
    const suffix = createHash("sha256").update(["reconcile",r.code,r.date,r.tons,r.price,r.client].join("|")).digest("hex").slice(0,16);
    const id = "trip_volvo_rec_" + suffix;
    const storedCode = "VOLVO-" + String(r.code).replace(/^VOLVO-/,"").slice(0,60);
    await sql`
      insert into trips (id,code,date,client,origin,destination,driver_id,fleet_id,loaded_tons,gross_weight,net_weight,freight_mode,price_per_ton,price_per_trip,km_start,km_end,diesel_liters,diesel_price)
      values (${id},${storedCode},${r.date}::date,${r.client},${r.origin},${r.destination},${driver.id},${fleet.id},${r.tons},0,${r.tons},'ton',${r.price},0,0,0,0,0)
      on conflict (id) do nothing
    `;
    reconcile.inserted++;
    reconcileInserted.push({code:r.code,date:r.date,tons:r.tons,mode:r.mode,price:r.price});
  } catch (e) {
    reconcile.errors.push({code:r.code,error:e instanceof Error ? e.message : String(e)});
  }
}

for (const [key, group] of fixedGroups) {
  try {
    const sample = group[0];
    const existing = await sql`
      select count(*)::int as n from trips
      where driver_id=${driver.id}
        and date=${sample.date}::date
        and freight_mode=${sample.mode}
        and abs(coalesce(price_per_trip,0)::float8-${sample.price})<0.01
    `;
    let need = Math.max(0, group.length - Number(existing[0]?.n || 0));
    if (!need) { reconcile.alreadyTrip += group.length; continue; }
    for (const r of group) {
      if (need <= 0) break;
      const codeNorm = norm(r.code);
      const exact = await sql`
        select id from trips
        where driver_id=${driver.id}
          and (
            regexp_replace(upper(coalesce(code,'')), '[^A-Z0-9]', '', 'g')=${codeNorm}
            or regexp_replace(upper(coalesce(code,'')), '[^A-Z0-9]', '', 'g')=${"VOLVO"+codeNorm}
          )
        limit 1
      `;
      if (exact[0]) continue;
      const suffix = createHash("sha256").update(["reconcile",r.code,r.date,r.mode,r.price,r.client].join("|")).digest("hex").slice(0,16);
      const id = "trip_volvo_rec_" + suffix;
      const storedCode = "VOLVO-" + String(r.code).replace(/^VOLVO-/,"").slice(0,60);
      await sql`
        insert into trips (id,code,date,client,origin,destination,driver_id,fleet_id,loaded_tons,gross_weight,net_weight,freight_mode,price_per_ton,price_per_trip,km_start,km_end,diesel_liters,diesel_price)
        values (${id},${storedCode},${r.date}::date,${r.client},${r.origin},${r.destination},${driver.id},${fleet.id},0,0,0,${r.mode},0,${r.price},0,0,0,0)
        on conflict (id) do nothing
      `;
      reconcile.inserted++; reconcile.fixedInserted++; need--;
      reconcileInserted.push({code:r.code,date:r.date,tons:0,mode:r.mode,price:r.price});
    }
  } catch (e) {
    reconcile.errors.push({group:key,error:e instanceof Error ? e.message : String(e)});
  }
}


// Normaliza os romaneios de modalidades fixas que ja existem por codigo.
// Nao cria novas viagens; apenas corrige modalidade, data e valor unitario.
let fixedNormalized = 0;
for (const r of rows.filter((x) => x.mode !== "ton")) {
  const codeNorm = norm(r.code);
  const updated = await sql`
    update trips
    set date=${r.date}::date,
        client=${r.client},
        origin=${r.origin},
        destination=${r.destination},
        freight_mode=${r.mode},
        price_per_ton=0,
        price_per_trip=${r.price},
        loaded_tons=0,
        net_weight=0
    where driver_id=${driver.id}
      and (
        regexp_replace(upper(coalesce(code,'')), '[^A-Z0-9]', '', 'g')=${codeNorm}
        or regexp_replace(upper(coalesce(code,'')), '[^A-Z0-9]', '', 'g')=${"VOLVO"+codeNorm}
      )
    returning id
  `;
  fixedNormalized += updated.length;
}
console.log("[klebersom-volvo-fixed-normalize] updated=" + fixedNormalized);
let buaizEnforced = 0;
for (const r of rows.filter((x) => x.mode === "ton" && x.client === "Buaiz" && x.origin === "Galpão" && x.destination === "Vitória")) {
  const codeNorm = norm(r.code);
  const updated = await sql`
    update trips
    set client='Buaiz', origin='Galpão', destination='Vitória', date=${r.date}::date, loaded_tons=${r.tons}, net_weight=${r.tons}, freight_mode='ton', price_per_ton=11
    where driver_id=${driver.id}
      and (
        regexp_replace(upper(coalesce(code,'')), '[^A-Z0-9]', '', 'g')=${codeNorm}
        or regexp_replace(upper(coalesce(code,'')), '[^A-Z0-9]', '', 'g')=${"VOLVO"+codeNorm}
        or (date=${r.date}::date and abs(coalesce(net_weight,loaded_tons,0)::float8-${r.tons})<0.011)
      )
    returning id
  `;
  buaizEnforced += updated.length;
}

let matchedSource = 0;
for (const r of rows) {
  const codeNorm = norm(r.code);
  let hit;
  if (r.mode === "ton") {
    hit = await sql`
      select id from trips
      where driver_id=${driver.id}
        and (
          regexp_replace(upper(coalesce(code,'')), '[^A-Z0-9]', '', 'g')=${codeNorm}
          or regexp_replace(upper(coalesce(code,'')), '[^A-Z0-9]', '', 'g')=${"VOLVO"+codeNorm}
          or (date=${r.date}::date and abs(coalesce(net_weight,loaded_tons,0)::float8-${r.tons})<0.011)
        )
      limit 1
    `;
  } else {
    hit = await sql`
      select id from trips
      where driver_id=${driver.id}
        and (
          regexp_replace(upper(coalesce(code,'')), '[^A-Z0-9]', '', 'g')=${codeNorm}
          or regexp_replace(upper(coalesce(code,'')), '[^A-Z0-9]', '', 'g')=${"VOLVO"+codeNorm}
        )
      limit 1
    `;
  }
  if (hit?.[0]) matchedSource++;
}

const totalTripsAfter = await sql`select count(*)::int as n from trips where driver_id=${driver.id}`;
const buaizFinalAfter = await sql`
  select count(*)::int as n, coalesce(sum(net_weight),0)::float8 as tons, coalesce(sum(net_weight*price_per_ton),0)::float8 as gross
  from trips
  where driver_id=${driver.id} and client='Buaiz' and origin='Galpão' and destination='Vitória' and price_per_ton=11
    and date between '2026-09-24'::date and '2026-09-29'::date
`;
console.log("[klebersom-volvo-reconcile] RESULT " + JSON.stringify(reconcile));
console.log("[klebersom-volvo-reconcile] INSERTED " + JSON.stringify(reconcileInserted));
console.log("[klebersom-volvo-reconcile] SOURCE_COVERAGE " + JSON.stringify({matched:matchedSource,source:rows.length,totalTrips:Number(totalTripsAfter[0]?.n||0),buaizEnforced,buaiz11:buaizFinalAfter[0]||{}}));
const tonSourceRows = rows.filter((r) => r.mode === "ton");
let tonMatchedFinal = 0;
const tonMissingFinal = [];
for (const r of tonSourceRows) {
  const codeNorm = norm(r.code);
  const hit = await sql`
    select id from trips
    where driver_id=${driver.id}
      and (
        regexp_replace(upper(coalesce(code,'')), '[^A-Z0-9]', '', 'g')=${codeNorm}
        or regexp_replace(upper(coalesce(code,'')), '[^A-Z0-9]', '', 'g')=${"VOLVO"+codeNorm}
        or (date=${r.date}::date and abs(coalesce(net_weight,loaded_tons,0)::float8-${r.tons})<0.011)
      )
    limit 1
  `;
  if (hit[0]) tonMatchedFinal++; else tonMissingFinal.push({code:r.code,date:r.date,tons:r.tons});
}

let fixedSourceFinal = 0;
let fixedAccountedFinal = 0;
const fixedAuditFinal = [];
for (const [key, group] of fixedGroups) {
  const sample = group[0];
  const ex = await sql`
    select count(*)::int as n from trips
    where driver_id=${driver.id}
      and date=${sample.date}::date
      and freight_mode=${sample.mode}
      and abs(coalesce(price_per_trip,0)::float8-${sample.price})<0.01
  `;
  const n = Number(ex[0]?.n || 0);
  fixedSourceFinal += group.length;
  fixedAccountedFinal += Math.min(n, group.length);
  fixedAuditFinal.push({key,source:group.length,existing:n,ok:n>=group.length});
}

const buaizFinalAudit = await sql`
  select count(*)::int as n, coalesce(sum(net_weight),0)::float8 as tons, coalesce(sum(net_weight*price_per_ton),0)::float8 as gross
  from trips
  where driver_id=${driver.id} and client='Buaiz' and origin='Galpão' and destination='Vitória' and price_per_ton=11
    and date between '2026-09-24'::date and '2026-09-29'::date
`;
const totalTripsFinalAudit = await sql`select count(*)::int as n from trips where driver_id=${driver.id}`;
console.log("[klebersom-volvo-audit] FINAL " + JSON.stringify({
  source:rows.length,
  tonSource:tonSourceRows.length,
  tonMatched:tonMatchedFinal,
  tonMissing:tonMissingFinal,
  fixedSource:fixedSourceFinal,
  fixedAccounted:fixedAccountedFinal,
  fixedGroups:fixedAuditFinal,
  totalTrips:Number(totalTripsFinalAudit[0]?.n||0),
  buaiz11:buaizFinalAudit[0]||{}
}));

if (reconcile.errors.length) throw new Error("Klebersom Volvo reconciliation had errors: " + JSON.stringify(reconcile.errors));


const buaizRows = rows.filter((r) => r.mode === "ton" && r.client === "Buaiz" && r.origin === "Galpão" && r.destination === "Vitória");
let buaizUpdated = 0;
const buaizAudit = { trip: 0, report: 0, ticket: 0, missing: 0 };
for (const r of buaizRows) {
  const codeNorm = norm(r.code);
  const tripMatches = await sql`
    select id
    from trips
    where driver_id=${driver.id}
      and (
        regexp_replace(upper(coalesce(code,'')), '[^A-Z0-9]', '', 'g')=${codeNorm}
        or (
          date=${r.date}::date
          and abs(coalesce(net_weight,loaded_tons,0)::float8-${r.tons})<0.011
        )
      )
  `;
  if (tripMatches.length) {
    const updated = await sql`
      update trips
      set client='Buaiz',
          origin='Galpão',
          destination='Vitória',
          date=${r.date}::date,
          loaded_tons=${r.tons},
          net_weight=${r.tons},
          freight_mode='ton',
          price_per_ton=11
      where driver_id=${driver.id}
        and (
          regexp_replace(upper(coalesce(code,'')), '[^A-Z0-9]', '', 'g')=${codeNorm}
          or (
            date=${r.date}::date
            and abs(coalesce(net_weight,loaded_tons,0)::float8-${r.tons})<0.011
          )
        )
      returning id
    `;
    buaizUpdated += updated.length;
    buaizAudit.trip++;
    continue;
  }

  const reportMatches = await sql`
    select id
    from reports
    where driver_id=${driver.id}
      and (
        regexp_replace(upper(coalesce(ticket,'')), '[^A-Z0-9]', '', 'g')=${codeNorm}
        or (
          (case
            when loading_date::text ~ '^\\d{2}/\\d{2}/\\d{4}' then to_date(substr(loading_date::text,1,10),'DD/MM/YYYY')
            when loading_date::text ~ '^\\d{4}-\\d{2}-\\d{2}' then substr(loading_date::text,1,10)::date
            else null
          end)=${r.date}::date
          and abs(coalesce(tons,0)::float8-${r.tons})<0.011
        )
      )
      limit 1
  `;
  if (reportMatches[0]) {
    buaizAudit.report++;
    continue;
  }

  const ticketMatches = await sql`
    select numero_ticket
    from tickets_balanca
    where driver_id=${driver.id}
      and (
        regexp_replace(upper(coalesce(numero_ticket,'')), '[^A-Z0-9]', '', 'g')=${codeNorm}
        or (
          (case
            when data_pesagem::text ~ '^\\d{2}/\\d{2}/\\d{4}' then to_date(substr(data_pesagem::text,1,10),'DD/MM/YYYY')
            when data_pesagem::text ~ '^\\d{4}-\\d{2}-\\d{2}' then substr(data_pesagem::text,1,10)::date
            else null
          end)=${r.date}::date
          and abs(coalesce(peso_liquido_kg,0)::float8-${r.tons*1000})<11
        )
      )
      limit 1
  `;
  if (ticketMatches[0]) buaizAudit.ticket++;
  else buaizAudit.missing++;
}
console.log("[klebersom-volvo-import] BUAIZ_CORRECTION " + JSON.stringify({source:buaizRows.length,updated:buaizUpdated,audit:buaizAudit}));

console.log("[klebersom-volvo-import] BUAIZ11 " + JSON.stringify(buaiz[0] || {}));
if (result.errors.length) throw new Error("Klebersom Volvo import had errors: " + JSON.stringify(result.errors));
