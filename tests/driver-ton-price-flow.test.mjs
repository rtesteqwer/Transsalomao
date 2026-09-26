import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { pathToFileURL } from 'node:url';

const source = path.resolve(process.env.TRANS_TEST_APP || '../app');
const require = createRequire(path.join(source, 'package.json'));
const ts = require('typescript');
const { PGlite } = require('@electric-sql/pglite');
const tmp = mkdtempSync(path.join(os.tmpdir(), 'driver-ton-flow-'));
writeFileSync(path.join(tmp, 'boundary.mjs'), `
  export let sql;
  export const setSql = value => { sql = value; };
  export const getSql = async () => sql;
  export const createFileRoute = () => options => options;
  export const createServerFn = () => ({
    validator(schema) { this.schema = schema; return this; },
    handler(fn) { const schema = this.schema; return input => fn({ data: schema ? schema.parse(input.data) : input?.data }); }
  });
  export const managementSession = () => ({ username: 'Felipe' });
  export const assertManagementSession = async () => ({ username: 'Felipe' });
  export const ticketAccess = () => ({ role: 'driver', username: 'motorista-teste', driverId: 'd1' });
`);
function compile(relative, name) {
  let text = readFileSync(path.join(source, relative), 'utf8');
  for (const key of ['@tanstack/react-start', '@tanstack/react-router', '@/lib/db', '@/lib/management-auth.server', '@/lib/ticket-auth.server']) {
    text = text.replaceAll('"' + key + '"', '"./boundary.mjs"');
  }
  text = text.replaceAll('"zod"', JSON.stringify(pathToFileURL(require.resolve('zod')).href));
  text = text.replaceAll('"@/lib/ticket-core"', '"./core.mjs"');
  writeFileSync(path.join(tmp, name + '.mjs'), ts.transpileModule(text, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 },
  }).outputText);
  return import(pathToFileURL(path.join(tmp, name + '.mjs')));
}
const boundary = await import(pathToFileURL(path.join(tmp, 'boundary.mjs')));
const { validateSave, saveTicket } = await compile('src/lib/ticket-core.ts', 'core');
const { acceptReports } = await compile('src/lib/api.ts', 'api');
const { Route: photos } = await compile('src/routes/api/photo-intake.ts', 'photos');
const { Route: metadata } = await compile('src/routes/api/ticket-meta.ts', 'meta');
const pg = new PGlite();
await pg.exec(`
 create table drivers(id text primary key, name text, status text);
 create table fleets(id text primary key, status text);
 create table reports(id text primary key,ticket text,driver_id text,fleet_id text,km numeric,tons numeric,daily_value numeric,freight_mode text,status text,created_at timestamptz default now(),trip_id text);
 create table trips(id text primary key,code text,date date,client text,origin text,destination text,driver_id text,fleet_id text,loaded_tons numeric,gross_weight numeric,net_weight numeric,freight_mode text,price_per_ton numeric,price_per_trip numeric,km_start numeric,km_end numeric,diesel_liters numeric,diesel_price numeric);
 insert into drivers values ('d1','Motorista teste','ativo');
 insert into fleets values ('f1','ativo');
`);
for (const name of ['0012_ticket_reader.sql', '0015_ticket_safety.sql', '0016_ticket_modes_metadata.sql', '0017_driver_ticket_photos.sql']) {
  await pg.exec(readFileSync(path.join(source, 'migrations', name), 'utf8'));
}
const sql = async (parts, ...values) => (await pg.query(parts.reduce((text, part, i) => text + (i ? '$' + i : '') + part, ''), values)).rows;
boundary.setSql(sql);
after(async () => { await pg.close(); rmSync(tmp, { recursive: true, force: true }); });
const input = (ticket, extra = {}) => ({ numero_ticket: ticket, peso_liquido_kg: 41340, driverId: 'd1', fleetId: 'f1', km_carreta: 0, conferido: true, freightMode: 'ton', pricePerTon: 14.125, ...extra });

test('Caixa receives proposed price and batch closure preserves each exact weight and price', async () => {
  const saved = [];
  for (const [i, weight] of [41340, 42520, 41960, 42400, 43660].entries()) {
    saved.push(await saveTicket(sql, validateSave(input('FLOW-'+i, { peso_liquido_kg: weight }))));
  }
  const response = await metadata.server.handlers.GET({ request: new Request('https://example.test/api/ticket-meta?reportId=' + saved[0].reportId) });
  assert.equal((await response.json()).ticket.pricePerTon, 14.125);
  const result = await acceptReports({ data: { ids: saved.map(item => item.reportId) } });
  assert.deepEqual(result, { ok: true, accepted: 5, needsReview: 0 });
  const rows = (await pg.query('select net_weight,price_per_ton from trips order by net_weight')).rows;
  assert.equal(rows.length, 5);
  assert.deepEqual(rows.map(row => Number(row.net_weight)), [41.34, 41.96, 42.4, 42.52, 43.66]);
  assert.ok(rows.every(row => Number(row.price_per_ton) === 14.125));
  assert.equal((await acceptReports({ data: { ids: saved.map(item => item.reportId) } })).accepted, 0);
});

test('ton trips without a price remain pending for management review', async () => {
  const saved = await saveTicket(sql, validateSave(input('FLOW-NO-PRICE', { pricePerTon: undefined })));
  const result = await acceptReports({ data: { ids: [saved.reportId] } });
  assert.equal(result.accepted, 0);
  assert.equal(result.needsReview, 1);
  assert.equal((await pg.query('select status from reports where id=$1', [saved.reportId])).rows[0].status, 'pendente');
});

test('linking an uploaded photo by ID preserves image bytes and rejects another owner or a missing photo', async () => {
  await pg.exec(`insert into trip_ticket_photos(id,relation_type,relation_id,trip_code,file_name,mime_type,image_data,created_by)
    values ('own-photo','unlinked','pending','pending','ticket.png','image/png','original-photo-bytes','motorista-teste'),
           ('other-photo','unlinked','pending','pending','ticket.png','image/png','other-photo-bytes','outro-motorista');`);
  const post = photoId => photos.server.handlers.POST({ request: new Request('https://example.test/api/photo-intake', {
    method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'https://example.test' },
    body: JSON.stringify({ photoId, relationType: 'report', relationId: 'saved-report', tripCode: 'FLOW-0', driverId: 'd1', fleetId: 'f1' }),
  }) });
  assert.equal((await post('own-photo')).status, 200);
  const row = (await pg.query("select * from trip_ticket_photos where id='own-photo'")).rows[0];
  assert.equal(row.relation_id, 'saved-report');
  assert.equal(row.image_data, 'original-photo-bytes');
  assert.equal((await post('other-photo')).status, 403);
  assert.equal((await post('missing-photo')).status, 404);
  assert.equal((await pg.query("select relation_id from trip_ticket_photos where id='other-photo'")).rows[0].relation_id, 'pending');
});
