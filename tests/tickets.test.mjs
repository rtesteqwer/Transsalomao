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
compile('ocr-prompts');
compile('ticket-provider.server', { '@/lib/ticket-core': './ticket-core.mjs' });
writeFileSync(path.join(tmp, 'salomao-ai.mjs'), 'export const getSalomaoOpenAIKeys = async () => []; export const salomaoModel = () => "test-model";');
compile('salomao-ticket-reader.server', { '@/lib/ticket-core': './ticket-core.mjs', '@/lib/salomao-ai.server': './salomao-ai.mjs', '@/lib/ocr-prompts': './ocr-prompts.mjs', '@/lib/db': './db-stub.mjs' });
writeFileSync(path.join(tmp, 'sessions.mjs'), 'export const managementSession = () => null; export const klebersomSession = () => null;');
compile('ticket-auth.server', { '@/lib/ticket-core': './ticket-core.mjs', '@/lib/management-auth.server': './sessions.mjs', '@/lib/klebersom-access.server': './sessions.mjs' });
const { normalizeTicket, validateSave, validateImage, saveTicket, TicketError } = await import(pathToFileURL(path.join(tmp, 'ticket-core.mjs')));
const { ticketAccess, allowTicketRead } = await import(pathToFileURL(path.join(tmp, 'ticket-auth.server.mjs')));
const { readWithProvider } = await import(pathToFileURL(path.join(tmp, 'ticket-provider.server.mjs')));
const { readTicketFromSalomaoOcr } = await import(pathToFileURL(path.join(tmp, 'salomao-ticket-reader.server.mjs')));
const pg = new PGlite();
await pg.exec(`create table drivers(id text primary key, name text, status text);
create table fleets(id text primary key, status text);
create table trips(id text primary key, code text);
create table reports(id text primary key, ticket text, driver_id text references drivers(id), fleet_id text references fleets(id), km numeric, tons numeric, daily_value numeric, freight_mode text, status text);
insert into drivers values ('d1','Motorista teste','ativo'),('inactive','Inativo','inativo');
insert into fleets values ('f1','ativo');`);
await pg.exec(readFileSync(path.join(source, 'migrations/0012_ticket_reader.sql'), 'utf8'));
await pg.exec(readFileSync(path.join(source, 'migrations/0015_ticket_safety.sql'), 'utf8'));
await pg.exec(readFileSync(path.join(source, 'migrations/0016_ticket_modes_metadata.sql'), 'utf8'));
const sql = async (strings, ...values) => (await pg.query(strings.reduce((text, part, i) => text + (i ? '$' + i : '') + part, ''), values)).rows;
const input = (ticket, other = {}) => ({ numero_ticket: ticket, peso_liquido_kg: 35810, pesagem_inicial_kg: 57810, pesagem_final_kg: 22000, transportadora:'Trans Salomão', operadora:'LOG CONSULTING', contratante:'Empresa contratante', destinatario:'Cliente destino', driverId:'d1', fleetId:'f1', km_carreta:123456, conferido:true, freightMode:'ton', dailyValue:0, ...other });
const expectStatus = status => error => error instanceof TicketError && error.status === status;

after(async () => { await pg.close(); rmSync(tmp, { recursive:true, force:true }); });

test('preserves kg, handles Brazilian thousands, keeps handwritten/origin values separate', () => {
 const d = normalizeTicket({ numero_ticket:'901', peso_liquido_kg:'35.810', peso_origem_kg:36000, pesagem_inicial_kg:57810, pesagem_final_kg:22000, placa_veiculo:'qwe-1a23', anotacoes_manuscritas:'40.000' });
 assert.equal(d.peso_liquido_kg,35810); assert.equal(d.placa_veiculo,'QWE1A23'); assert.equal(d.alertas.length,0);
 assert.equal(normalizeTicket({ peso_origem_kg:40000 }).peso_liquido_kg,null);
 assert(normalizeTicket({ peso_liquido_kg:35810, pesagem_inicial_kg:57000, pesagem_final_kg:22000 }).alertas.some(x=>x.includes('diferente')));
});

test('reads Multilift ticket layout and keeps operator person separate from operadora', () => {
 const ocr = [
  'MULTILIFT LOGISTICA LTDA',
  'TICKET DE PESAGEM 0534063 - Encerrado',
  'Carreta MQP-5D98 Veic/Cavalo OVH-4J13',
  'NAVIO PACIFIC VIRTUE',
  'Transportadora 130 - Multilift Logistica Ltda',
  'Emissor 77 - CX-M20',
  'Item 138 - Saida de Espudomenio (LOW GRADE)',
  'Pesagem Inicial',
  'Peso: 20.580 kg',
  'Pesagem Final',
  'Data / Hora: 11/09/2026 23:13:26',
  'Operador: Maycon Richard Nascimento Lima',
  'Peso: 44.090 kg',
  'Peso Liquido 23.510 kg',
  'Dados Motorista',
  'NOME: Clovis Salomao Garcia'
 ].join('\n');
 const d = readTicketFromSalomaoOcr(ocr, 'ton', '46260.jpg');
 assert.equal(d.numero_ticket,'0534063');
 assert.equal(d.placa_carreta,'MQP5D98');
 assert.equal(d.placa_veiculo,'OVH4J13');
 assert.equal(d.pesagem_inicial_kg,20580);
 assert.equal(d.pesagem_final_kg,44090);
 assert.equal(d.peso_liquido_kg,23510);
 assert.equal(d.transportadora,'Multilift Logistica Ltda');
 assert.equal(d.motorista,'Clovis Salomao Garcia');
 assert.equal(d.navio,'PACIFIC VIRTUE');
 assert.equal(d.emissor,'CX-M20');
 assert.equal(d.item_codigo,'138');
 assert.equal(d.operador_pesagem,'Maycon Richard Nascimento Lima');
 assert.equal(d.operadora,null);
 assert.match(d.produto,/Espudomenio/i);
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

test('does not confuse internal trip/report codes with a physical ticket; refuses inactive drivers', async () => {
 await pg.exec("insert into trips values ('legacy','265'); insert into reports(id,ticket,status) values ('rep-old','266','pendente')");
 assert.equal((await saveTicket(sql,validateSave(input('265')))).ticket,'265');
 assert.equal((await saveTicket(sql,validateSave(input('266')))).ticket,'266');
 await assert.rejects(()=>saveTicket(sql,validateSave(input('T-104',{driverId:'inactive'}))),expectStatus(400));
});

test('non-ton modes keep ticket metadata but never persist weight', async () => {
 const data=validateSave(input('CX-1',{freightMode:'caixinha',peso_liquido_kg:35810,pesagem_inicial_kg:57810,pesagem_final_kg:22000}));
 assert.equal(data.tons,0); assert.equal(data.ticket.peso_liquido_kg,null);
 const result=await saveTicket(sql,data);
 const report=(await pg.query("select tons,freight_mode,status from reports where id=$1",[result.reportId])).rows[0];
 assert.equal(Number(report.tons),0); assert.equal(report.freight_mode,'caixinha'); assert.equal(report.status,'pendente');
 const ticket=(await pg.query("select peso_liquido_kg,transportadora,destinatario,freight_mode,ticket_data from tickets_balanca where report_id=$1",[result.reportId])).rows[0];
 assert.equal(ticket.peso_liquido_kg,null); assert.equal(ticket.transportadora,'Trans Salomão'); assert.equal(ticket.destinatario,'Cliente destino'); assert.equal(ticket.freight_mode,'caixinha');
 assert.equal(ticket.ticket_data.operadora,'LOG CONSULTING'); assert.equal(ticket.ticket_data.contratante,'Empresa contratante');
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

test('prefers configured OpenAI Responses vision and falls back to Anthropic in auto mode', async () => {
 const fetchBefore=globalThis.fetch;
 const before={OPENAI_API_KEY:process.env.OPENAI_API_KEY,ANTHROPIC_API_KEY:process.env.ANTHROPIC_API_KEY,TICKET_AI_PROVIDER:process.env.TICKET_AI_PROVIDER,TICKET_OPENAI_MODEL:process.env.TICKET_OPENAI_MODEL,OPENAI_ASSISTANT_MODEL:process.env.OPENAI_ASSISTANT_MODEL};
 try {
  process.env.OPENAI_API_KEY='test-openai';
  process.env.ANTHROPIC_API_KEY='test-claude';
  delete process.env.TICKET_AI_PROVIDER;
  process.env.TICKET_OPENAI_MODEL='gpt-5.6-sol';
  let calls=0;
  globalThis.fetch=async (url,options)=>{
    calls++;
    assert.equal(url,'https://api.openai.com/v1/responses');
    const b=JSON.parse(options.body);
    assert.equal(b.store,false);
    assert.equal(b.model,'gpt-5.6-sol');
    assert.equal(options.headers.Authorization,'Bearer test-openai');
    return Response.json({output:[{type:'message',content:[{type:'output_text',text:JSON.stringify(input('0024090',{placa_veiculo:'QWS3E13',placa_carreta:'FYWRJ05',transportadora:'RAS TRANSPORTES E SERVICOS LTDA',destinatario:'VPORTS AUTORIDADE PORTUARIA'}))}]}]});
  };
  const read=await readWithProvider({mime:'image/jpeg',base64:'test'},'ton');
  assert.equal(read.numero_ticket,'0024090');
  assert.equal(read.peso_liquido_kg,35810);
  assert.equal(read.placa_veiculo,'QWS3E13');
  assert.equal(calls,1);

  globalThis.fetch=async (url,options)=>{
    if(url==='https://api.openai.com/v1/responses') return Response.json({error:{code:'insufficient_quota',message:'billing'}},{status:429});
    assert.equal(url,'https://api.anthropic.com/v1/messages');
    assert.equal(options.headers['x-api-key'],'test-claude');
    return Response.json({stop_reason:'end_turn',content:[{type:'text',text:JSON.stringify(input('OCR-FALLBACK'))}]});
  };
  assert.equal((await readWithProvider({mime:'image/jpeg',base64:'test'},'ton')).numero_ticket,'OCR-FALLBACK');

  globalThis.fetch=async (url)=>{
    if(url==='https://api.openai.com/v1/responses') return Response.json({error:{message:'secret=test-openai'}},{status:401});
    return Response.json({error:{message:'secret=test-claude'}},{status:401});
  };
  await assert.rejects(()=>readWithProvider({mime:'image/jpeg',base64:'test'},'ton'), e=>e.status===503 && !e.message.includes('test-openai') && !e.message.includes('test-claude'));
 } finally {
  globalThis.fetch=fetchBefore;
  for(const [key,value] of Object.entries(before)) { if(value===undefined) delete process.env[key]; else process.env[key]=value; }
 }
});
