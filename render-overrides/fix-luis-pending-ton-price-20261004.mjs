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
