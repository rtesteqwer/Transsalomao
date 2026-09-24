import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { pathToFileURL } from 'node:url';

// Run against reconstructed production source (TRANS_SOURCE_DUMP), with its installed dependencies.
const source = path.resolve(process.env.TRANS_TEST_APP || '../app');
const require = createRequire(path.join(source, 'package.json'));
const ts = require('typescript');
const { PGlite } = require('@electric-sql/pglite');
const tmp = mkdtempSync(path.join(os.tmpdir(), 'ticket-tests-'));
function compile(name, imports = {}) {
  let text = readFileSync(path.join(source, 'src/lib', name + '.ts'), 'utf8');
  for (const [from, to] of Object.entries(imports)) text = text.replaceAll(from, to);
  const js = ts.transpileModule(text, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } }).outputText;
  writeFileSync(path.join(tmp, name + '.mjs'), js);
}
compile('ticket-core');
compile('ticket-provider.server', { '@/lib/ticket-core': './ticket-core.mjs' });
writeFileSync(path.join(tmp, 'sessions.mjs'), 'export const managementSession = () => null; export const klebersomSession = () => null;');
compile('ticket-auth.server', { '@/lib/ticket-core': './ticket-core.mjs', '@/lib/management-auth.server': './sessions.mjs', '@/lib/klebersom-access.server': './sessions.mjs' });
const { normalizeTicket, validateSave, validateImage, saveTicket, TicketError } = await import(pathToFileURL(path.join(tmp, 'ticket-core.mjs')));
const { ticketAccess, allowTicketRead } = await import(pathToFileURL(path.join(tmp, 'ticket-auth.server.mjs')));
const { readWithProvider } = await import(pathToFileURL(path.join(tmp, 'ticket-provider.server.mjs')));
const pg = new PGlite();
await pg.exec(`create table drivers(id text primary key, name text, status text);
create table fleets(id text primary key, status text);
create table trips(id text primary key, code text);
create table reports(id text primary key, ticket text, driver_id text references drivers(id), fleet_id text references fleets(id), km numeric, tons numeric, daily_value numeric, freight_mode text, status text);
insert into drivers values ('d1','Motorista teste','ativo'),('inactive','Inativo','inativo');
insert into fleets values ('f1','ativo');`);
await pg.exec(readFileSync(path.join(source, 'migrations/0012_ticket_reader.sql'), 'utf8'));
await pg.exec(readFileSync(path.join(source, 'migrations/0015_ticket_safety.sql'), 'utf8'));
const sql = async (strings, ...values) => (await pg.query(strings.reduce((text, part, i) => text + (i ? '$' + i : '') + part, ''), values)).rows;
const input = (ticket, other = {}) => ({ numero_ticket: ticket, peso_liquido_kg: 35810, pesagem_inicial_kg: 57810, pesagem_final_kg: 22000, driverId:'d1', fleetId:'f1', km_carreta:123456, conferido:true, ...other });
const expectStatus = status => error => error instanceof TicketError && error.status === status;

after(async () => { await pg.close(); rmSync(tmp, { recursive:true, force:true }); });

test('preserves kg, handles Brazilian thousands, keeps handwritten/origin values separate', () => {
 const d = normalizeTicket({ numero_ticket:'901', peso_liquido_kg:'35.810', peso_origem_kg:36000, pesagem_inicial_kg:57810, pesagem_final_kg:22000, placa_veiculo:'qwe-1a23', anotacoes_manuscritas:'40.000' });
 assert.equal(d.peso_liquido_kg,35810); assert.equal(d.placa_veiculo,'QWE1A23'); assert.equal(d.alertas.length,0);
 assert.equal(normalizeTicket({ peso_origem_kg:40000 }).peso_liquido_kg,null);
 assert(normalizeTicket({ peso_liquido_kg:35810, pesagem_inicial_kg:57000, pesagem_final_kg:22000 }).alertas.some(x=>x.includes('diferente')));
});

test('requires explicit review and rejects malformed/non-integer/negative weights', () => {
 for (const peso of [0,-100,35.81,'35.810',true,Infinity,2147483648]) assert.throws(()=>validateSave(input('bad',{peso_liquido_kg:peso})),expectStatus(400));
 assert.throws(()=>validateSave(input('bad',{conferido:false})),expectStatus(400));
 assert.throws(()=>validateSave(input('bad',{km_carreta:-1})),expectStatus(400));
 assert.equal(validateSave(input(' ab123 ')).ticket.numero_ticket,'AB123');
});

test('refuses unauthenticated same-origin headers and unset/incorrect tokens', () => {
 delete process.env.TICKET_TOKEN;
 const request = headers => new Request('https://example.com/api/ler-ticket', {headers});
 assert.throws(()=>ticketAccess(request({'origin':'https://example.com','sec-fetch-site':'same-origin'})),expectStatus(401));
 process.env.TICKET_TOKEN='x'.repeat(32);
 assert.throws(()=>ticketAccess(request({'x-app-token':'wrong'})),expectStatus(401));
 assert.equal(ticketAccess(request({'x-app-token':process.env.TICKET_TOKEN})).role,'service');
 assert.throws(()=>ticketAccess(request({'origin':'https://evil.example'})),expectStatus(403));
 delete process.env.TICKET_TOKEN;
});

test('rejects malformed, oversized and mismatched images before calling AI', () => {
 assert.throws(()=>validateImage({imagem:'invalid'}),expectStatus(400));
 assert.throws(()=>validateImage({imagem:'a'.repeat(3500004)}),expectStatus(413));
 assert.throws(()=>validateImage({imagem:Buffer.from('not an image at all').toString('base64')}),expectStatus(415));
});

test('writes exact tons and creates a single pending Caixa report', async () => {
 const result=await saveTicket(sql,validateSave(input('T-100')));
 assert.equal(result.tons,35.81);
 const rows=(await pg.query("select tons,status,ticket from reports where id=$1",[result.reportId])).rows;
 assert.equal(Number(rows[0].tons),35.81); assert.equal(rows[0].status,'pendente');
 await assert.rejects(()=>saveTicket(sql,validateSave(input(' t-100 '))),expectStatus(409));
});

test('concurrent duplicate submissions create exactly one ticket and report', async () => {
 const results=await Promise.allSettled(Array.from({length:5},()=>saveTicket(sql,validateSave(input('T-101')))));
 assert.equal(results.filter(x=>x.status==='fulfilled').length,1);
 for(const item of results.filter(x=>x.status==='rejected')) assert.equal(item.reason.status,409);
 assert.equal(Number((await pg.query("select count(*) from reports where ticket='T-101'")).rows[0].count),1);
});

test('checks legacy tickets in Caixa and trips; refuses inactive drivers', async () => {
 await pg.exec("insert into trips values ('legacy','T-102'); insert into reports(id,ticket,status) values ('rep-old',' t-103 ','pendente')");
 for (const code of ['T-102','T-103']) await assert.rejects(()=>saveTicket(sql,validateSave(input(code))),expectStatus(409));
 await assert.rejects(()=>saveTicket(sql,validateSave(input('T-104',{driverId:'inactive'}))),expectStatus(400));
});

test('a report insert failure rolls back the ticket automatically', async () => {
 await pg.exec("alter table reports add constraint test_failure check (ticket <> 'T-FAIL')");
 await assert.rejects(()=>saveTicket(sql,validateSave(input('T-FAIL'))));
 assert.equal(Number((await pg.query("select count(*) from tickets_balanca where numero_ticket='T-FAIL'")).rows[0].count),0);
 await pg.exec('alter table reports drop constraint test_failure');
 assert.equal((await saveTicket(sql,validateSave(input('T-FAIL')))).ok,true);
});

test('rate limit is shared through the database and resets after one minute', async () => {
 for(let i=0;i<20;i++) await allowTicketRead(sql,'driver:test');
 await assert.rejects(()=>allowTicketRead(sql,'driver:test'),expectStatus(429));
 await pg.exec("update ticket_read_limits set window_start=now()-interval '2 minutes'");
 await allowTicketRead(sql,'driver:test');
});

test('uses OpenAI when Anthropic is absent; does not expose provider secrets on failure', async () => {
 const fetchBefore=globalThis.fetch;
 const before={OPENAI_API_KEY:process.env.OPENAI_API_KEY,ANTHROPIC_API_KEY:process.env.ANTHROPIC_API_KEY,TICKET_AI_PROVIDER:process.env.TICKET_AI_PROVIDER};
 try {
  process.env.OPENAI_API_KEY='test-key'; delete process.env.ANTHROPIC_API_KEY; delete process.env.TICKET_AI_PROVIDER;
  globalThis.fetch=async (url,options)=>{assert.equal(url,'https://api.openai.com/v1/chat/completions'); const b=JSON.parse(options.body); assert.equal(b.store,false); assert.equal(options.headers.Authorization,'Bearer test-key'); return Response.json({choices:[{finish_reason:'stop',message:{content:JSON.stringify(input('OCR-1'))}}]})};
  assert.equal((await readWithProvider({mime:'image/jpeg',base64:'test'})).peso_liquido_kg,35810);
  process.env.ANTHROPIC_API_KEY='test-claude';
  globalThis.fetch=async (url,options)=>{assert.equal(url,'https://api.anthropic.com/v1/messages');assert.equal(options.headers['x-api-key'],'test-claude');return Response.json({stop_reason:'end_turn',content:[{type:'text',text:JSON.stringify(input('OCR-2'))}]})};
  assert.equal((await readWithProvider({mime:'image/jpeg',base64:'test'})).numero_ticket,'OCR-2');
  globalThis.fetch=async()=>Response.json({error:{message:'secret=test-claude'}},{status:401});
  await assert.rejects(()=>readWithProvider({mime:'image/jpeg',base64:'test'}), e=>e.status===503 && !e.message.includes('test-claude'));
 } finally {globalThis.fetch=fetchBefore; for(const [key,value] of Object.entries(before)) {if(value===undefined) delete process.env[key];else process.env[key]=value;}}
});
