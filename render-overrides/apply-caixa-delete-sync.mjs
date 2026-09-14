import fs from 'node:fs';
import path from 'node:path';

const target = process.argv[2];
if (!target || !fs.existsSync(target)) throw new Error('apply-caixa-delete-sync: target missing');

const apiPath = path.join(target, 'src/lib/api.ts');
if (!fs.existsSync(apiPath)) throw new Error('apply-caixa-delete-sync: api.ts missing');

let s = fs.readFileSync(apiPath, 'utf8');

const before = `export const deleteReport = createServerFn({ method: "POST" })
  .validator(z.object({ id: z.string().min(1) }))
  .handler(async ({ data }) => {
    await requireManagement();
    const sql = await getSql();
    await sql\`delete from reports where id = \${data.id}\`;
    return { ok: true };
  });`;

const after = `export const deleteReport = createServerFn({ method: "POST" })
  .validator(z.object({ id: z.string().min(1) }))
  .handler(async ({ data }) => {
    await requireManagement();
    const sql = await getSql();

    // Caixa e Viagens precisam ser uma única fonte lógica. Se o lançamento já
    // virou viagem, apagar no Caixa também remove a viagem vinculada. O CTE faz
    // as duas exclusões na mesma instrução para não deixar registros órfãos.
    await sql\`
      with removed_report as (
        delete from reports
        where id = \${data.id}
        returning trip_id
      )
      delete from trips t
      using removed_report r
      where r.trip_id is not null
        and t.id = r.trip_id
    \`;

    return { ok: true };
  });`;

if (s.includes(after)) {
  console.log('[caixa-delete-sync] already applied');
  process.exit(0);
}
if (!s.includes(before)) throw new Error('apply-caixa-delete-sync: deleteReport block not found');

s = s.replace(before, after);
fs.writeFileSync(apiPath, s);
console.log('[caixa-delete-sync] deleting from Caixa also deletes linked trip');
