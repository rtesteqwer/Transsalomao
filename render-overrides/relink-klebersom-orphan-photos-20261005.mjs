import { neon } from "@neondatabase/serverless";

const url = process.env.DATABASE_URL?.trim();
if (!url) throw new Error("orphan-photo-relink: DATABASE_URL missing");
const sql = neon(url);
const norm = (v) => String(v || "").toUpperCase().replace(/[^A-Z0-9]/g, "");

const drivers = await sql`
  select id,name from drivers
  where lower(name) like 'kleber%'
  order by case when lower(name) like 'klebersom%' then 0 when lower(name) like 'kleberson%' then 1 else 2 end, name
`;
if (!drivers[0]) throw new Error("orphan-photo-relink: Klebersom driver not found");
const driver = drivers[0];

const orphans = await sql`
  select p.id,p.relation_type,p.relation_id,p.trip_code,p.driver_id,p.driver_name,
         p.trip_date,p.net_weight,p.freight_mode,p.file_name
  from trip_ticket_photos p
  where (p.driver_id=${driver.id} or lower(coalesce(p.driver_name,'')) like 'kleber%')
    and p.relation_type in ('trip','report')
    and (
      (p.relation_type='trip' and not exists(select 1 from trips t where t.id=p.relation_id))
      or
      (p.relation_type='report' and not exists(select 1 from reports r where r.id=p.relation_id))
    )
  order by p.created_at
`;

const result={driver:driver.name,orphans:orphans.length,relinked:0,unresolved:0,ambiguous:0};
const details=[];

for (const p of orphans) {
  const codeNorm=norm(p.trip_code);
  let candidates=[];

  if (codeNorm) {
    candidates = await sql`
      select id,code,date,client,origin,destination,driver_id,fleet_id,
             freight_mode,net_weight,loaded_tons
      from trips
      where driver_id=${driver.id}
        and (
          regexp_replace(upper(coalesce(code,'')), '[^A-Z0-9]', '', 'g')=${codeNorm}
          or regexp_replace(upper(coalesce(code,'')), '[^A-Z0-9]', '', 'g')=${"VOLVO"+codeNorm}
          or regexp_replace(upper(coalesce(code,'')), '[^A-Z0-9]', '', 'g')=
             regexp_replace(upper(${"VOLVO-"+String(p.trip_code||"")}), '[^A-Z0-9]', '', 'g')
        )
      order by date desc
      limit 3
    `;
  }

  if (candidates.length !== 1 && p.trip_date && p.net_weight != null) {
    candidates = await sql`
      select id,code,date,client,origin,destination,driver_id,fleet_id,
             freight_mode,net_weight,loaded_tons
      from trips
      where driver_id=${driver.id}
        and date=${p.trip_date}::date
        and abs(coalesce(net_weight,loaded_tons,0)::float8-${Number(p.net_weight)})<0.011
      order by code
      limit 3
    `;
  }

  if (candidates.length !== 1) {
    if (candidates.length > 1) result.ambiguous++; else result.unresolved++;
    details.push({photoId:p.id,fileName:p.file_name,tripCode:p.trip_code,status:candidates.length>1?"ambiguous":"unresolved",candidateCount:candidates.length});
    continue;
  }

  const t=candidates[0];
  const updated=await sql`
    update trip_ticket_photos
    set relation_type='trip',
        relation_id=${t.id},
        trip_code=${t.code},
        driver_id=${driver.id},
        driver_name=${driver.name},
        fleet_id=${t.fleet_id},
        trip_date=${t.date}::date,
        freight_mode=${t.freight_mode},
        net_weight=coalesce(t.net_weight,t.loaded_tons)
    from trips t
    where trip_ticket_photos.id=${p.id}
      and t.id=${t.id}
    returning trip_ticket_photos.id
  `;
  if (updated[0]) {
    result.relinked++;
    details.push({photoId:p.id,fileName:p.file_name,oldTripCode:p.trip_code,newTripCode:t.code,tripId:t.id,status:"relinked"});
  } else {
    result.unresolved++;
    details.push({photoId:p.id,fileName:p.file_name,tripCode:p.trip_code,status:"update-failed"});
  }
}

const remaining = await sql`
  select count(*)::int as n
  from trip_ticket_photos p
  where (p.driver_id=${driver.id} or lower(coalesce(p.driver_name,'')) like 'kleber%')
    and p.relation_type in ('trip','report')
    and (
      (p.relation_type='trip' and not exists(select 1 from trips t where t.id=p.relation_id))
      or
      (p.relation_type='report' and not exists(select 1 from reports r where r.id=p.relation_id))
    )
`;

console.log("[orphan-photo-relink] RESULT "+JSON.stringify({...result,remaining:Number(remaining[0]?.n||0)}));
console.log("[orphan-photo-relink] DETAILS "+JSON.stringify(details));
if (result.ambiguous || result.unresolved) {
  console.log("[orphan-photo-relink] unresolved photos left intentionally for manual review");
}
