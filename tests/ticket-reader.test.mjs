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
const tmp = mkdtempSync(path.join(os.tmpdir(), 'ticket-reader-'));
for (const name of ['ticket-core', 'ticket-parser', 'salomao-ticket-reader.server']) {
  let sourceText = readFileSync(path.join(source, 'src/lib', name + '.ts'), 'utf8');
  sourceText = sourceText.replaceAll('@/lib/ticket-core', './ticket-core.mjs').replaceAll('@/lib/ticket-parser', './ticket-parser.mjs').replaceAll('@/lib/salomao-ai.server', './keys.mjs');
  writeFileSync(path.join(tmp, name + '.mjs'), ts.transpileModule(sourceText, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } }).outputText);
}
writeFileSync(path.join(tmp, 'keys.mjs'), 'export async function getSalomaoOpenAIKeys() { return ["test-key"]; }');
const { parseTicketOcr, finishTicketReading } = await import(pathToFileURL(path.join(tmp, 'ticket-parser.mjs')));
const { readTicketWithSalomaoIA, readTicketFromSalomaoOcr, SalomaoVisionUnavailable } = await import(pathToFileURL(path.join(tmp, 'salomao-ticket-reader.server.mjs')));
after(() => rmSync(tmp, { recursive: true, force: true }));

const logTicket = `TICKET DE PESAGEM
LOG CONSULTING
Tiquete........: 000024847
Placa do Veículo..: QWS3E13
Placa da Carreta..: FYW7J05
Transportadora....: RAS TRANSPORTES
Empresa...........: HERINGER MANHUACU - MG
Peso líquido de entrada...: 52500 kg Peso líquido de saída...: 18640 kg
Peso líquido..: 33860 kg
Número da ordem.: 832885`;

test('real LOG CONSULTING layout: zero-padded ticket, net weight, company roles', () => {
  const d = readTicketFromSalomaoOcr(logTicket, 'ton', '46384.jpg');
  assert.equal(d.numero_ticket, '000024847');
  assert.equal(d.peso_liquido_kg, 33860);
  assert.equal(d.pesagem_inicial_kg, 52500);
  assert.equal(d.pesagem_final_kg, 18640);
  assert.equal(d.placa_veiculo, 'QWS3E13');
  assert.equal(d.placa_carreta, 'FYW7J05');
  assert.equal(d.transportadora, 'RAS TRANSPORTES');
  assert.equal(d.contratante, 'HERINGER MANHUACU - MG');
  assert.deepEqual(d.campos_ausentes, []);
});

test('real ADUBOS REAL photo: covered ticket is not replaced by NF or filename', () => {
  const d = readTicketFromSalomaoOcr(`ADUBOS REAL S.A.\nNF-e N 000008044\nPlaca: QWS3E13\nTara: 18.420,000 -12.09.2026 09:56:11\nBruto: 43.300,000 -12.09.2026 09:46:36\nLíquido: 24.880,000\n61.870,80 35,00`, 'ton', '46385.jpg');
  assert.equal(d.numero_ticket, null);
  assert.equal(d.peso_liquido_kg, 24880);
  assert.equal(d.destinatario, 'ADUBOS REAL S.A.');
  assert.equal(d.transportadora, null);
  assert(d.campos_ausentes.includes('numero_ticket'));
});

test('VPORTS receipt ignores scheduled ticket and assigns boxed plates only with evidence', () => {
  const text = 'VPORTS - Tiquete de Pesagem\nTicket Agend.: 2026087600\nTiquete: 72416\nOperador: LOG CONSULTING\nTransportadora: GIZELE APARECIDA DA ROCHA GARCIA\nPeso Entrada: 17.230 kg\nPeso Saída: 55.700 kg\nPeso Líquido: 38.470 kg\nPlacas\nMQX-5F98 NZE-8I52';
  const d = parseTicketOcr(text, 'ton');
  assert.equal(d.numero_ticket, '72416');
  assert.equal(d.peso_liquido_kg, 38470);
  assert.equal(d.placa_veiculo, null); assert.equal(d.placa_carreta, null);
  const matched = parseTicketOcr(text, 'ton', { tractorPlate: 'NZE8I52', trailerPlate: 'MQX5F98' });
  assert.equal(matched.placa_veiculo, 'NZE8I52'); assert.equal(matched.placa_carreta, 'MQX5F98');
  assert.equal(d.operadora, 'LOG CONSULTING'); assert.equal(d.destinatario, null);
});

test('MULTILIFT labeled plates remain distinct; scale operator is not an operating company', () => {
  const d = parseTicketOcr('MULTILIFT LOGISTICA LTDA\nTICKET DE PESAGEM: 0534063\nCarreta: MQP-5D98\nVeíc/Cavalo: OVH-4J13\nTransportadora: 130 - Multilift Logística Ltda\nOperador: Pessoa da balança\nPesagem Inicial\nPeso: 20.580 kg\nPesagem Final\nPeso: 44.090 kg\nPeso Líquido: 23.510 kg', 'ton');
  assert.equal(d.numero_ticket, '0534063');
  assert.equal(d.placa_carreta, 'MQP5D98'); assert.equal(d.placa_veiculo, 'OVH4J13');
  assert.equal(d.peso_liquido_kg, 23510);
  assert.equal(d.pesagem_inicial_kg, 20580); assert.equal(d.pesagem_final_kg, 44090);
  assert.equal(d.transportadora, 'Multilift Logística Ltda');
  assert.equal(d.operadora, null); assert.equal(d.operador_pesagem, 'Pessoa da balança');
});

test('real noisy Multilift fallback recovers net weight, fleet plates and carrier', () => {
  const noisy = `MULTILAFT LOGISTICA LTDA
TICKET DE PESAGEM 0534063 - Encerrado
Carreta Veic/Cavalo NAVIO
MQP-SD98 OVH-4 13 PACIFIC VIRTUE
Transportadora
130 - Multilifi
Emissor
77 - CX-M20
Peso Liqui
{23.510 kg
Dados Motorista`;
  const d = parseTicketOcr(noisy, 'ton', { tractorPlate: 'OVH4J13', trailerPlate: 'MQP5D98' });
  assert.equal(d.numero_ticket, '0534063');
  assert.equal(d.peso_liquido_kg, 23510);
  assert.equal(d.placa_veiculo, 'OVH4J13');
  assert.equal(d.placa_carreta, 'MQP5D98');
  assert.equal(d.transportadora, 'Multilift Logística Ltda');
});

test('Multilift fallback replaces short carrier garbage and completes fleet pair from one observed plate', () => {
  const noisy = `MULTILAFT LOGISTICA LTDA
TICKET DE PESAGEM 0534063
Carreta Veic/Cavalo NAVIO
MOQP-SD98 PACIFIC VIRTUE
Transportadora
TAM P
Peso Liquido`;
  const d = parseTicketOcr(noisy, 'ton', { tractorPlate: 'OVH4J13', trailerPlate: 'MQP5D98' });
  assert.equal(d.transportadora, 'Multilift Logística Ltda');
  assert.equal(d.placa_carreta, 'MQP5D98');
  assert.equal(d.placa_veiculo, 'OVH4J13');
  assert(d.alertas.some(a => a.includes('conjunto selecionado')));
});

test('actual Multilift OCR bands recover 23.510 kg and both plates from noisy text', () => {
  const ocr = `MULTILAFT LOGISTICA LTDA
TICKET DE PESAGEM 0534063 - Encerrado
Carreta Veic/Cavalo NAVIO
MQP-SD98 | OVH PACIFIC VIRTUE
Transportadora
130 - Multilift logistica
Peso Liquido N NF Diferencas Origem
123510 kg
Peso Liquido
23.510 kg`;
  const d = parseTicketOcr(ocr, 'ton', { tractorPlate: 'OVH4J13', trailerPlate: 'MQP5D98' });
  assert.equal(d.numero_ticket, '0534063');
  assert.equal(d.peso_liquido_kg, 23510);
  assert.equal(d.placa_carreta, 'MQP5D98');
  assert.equal(d.placa_veiculo, 'OVH4J13');
  assert.equal(d.transportadora, 'Multilift Logística Ltda');
});

test('VPORTS report companies use their own blocks, including inverted CNPJ labels', () => {
  const d = parseTicketOcr('Número Ticket: 0024090\nPlaca Carreta: FYW7J05\nPlaca Veículo: QWS3E13\nPesagem Inicial: 54270 kg\nPesagem Final: 18460 kg\nPeso Líquido: 35810 kg\nTransportadora\nCNPJ: 49544417000104\nRazão Social: RAS TRANSPORTES E SERVICOS LTDA\nDestinatário\nCNPJ: VPORTS AUTORIDADE PORTUARIA\nRazão Social: 27316538000409', 'ton');
  assert.equal(d.numero_ticket, '0024090'); assert.equal(d.peso_liquido_kg, 35810);
  assert.equal(d.transportadora, 'RAS TRANSPORTES E SERVICOS LTDA');
  assert.equal(d.destinatario, 'VPORTS AUTORIDADE PORTUARIA');
});

test('tonne decimal separators, arithmetic fallback and conflicts preserve exact kg', () => {
  assert.equal(parseTicketOcr('Ticket: 123\nPeso líquido: 35,810 t', 'ton').peso_liquido_kg, 35810);
  for (const [gross, tare, net] of [[48460,18500,29960],[42740,18660,24080],[52920,18470,34450]]) {
    assert.equal(parseTicketOcr(`Ticket: 123\nBruto: ${gross} kg\nTara: ${tare} kg\nLíquido: 50 kg`, 'ton').peso_liquido_kg, net);
  }
  const conflict = parseTicketOcr('Ticket: 123\nBruto: 55000 kg\nTara: 20000 kg\nPeso líquido: 34000 kg', 'ton');
  assert.equal(conflict.peso_liquido_kg, 34000); assert(conflict.alertas.some(a => a.includes('diferente')));
});

test('non-ton modes suppress all weights while preserving ticket and company roles', () => {
  for (const mode of ['trip','cegonha','caixinha']) {
    const d = parseTicketOcr(logTicket, mode);
    assert.equal(d.peso_liquido_kg, null); assert.equal(d.pesagem_inicial_kg, null); assert.equal(d.pesagem_final_kg, null);
    assert.equal(d.contratante, 'HERINGER MANHUACU - MG');
    assert(!d.campos_ausentes.includes('peso_liquido_kg'));
  }
});

test('Anthropic vision is used before local OCR when configured', async () => {
  const beforeFetch = globalThis.fetch;
  const beforeKey = process.env.ANTHROPIC_API_KEY;
  const beforeModel = process.env.CLAUDE_MODEL;
  try {
    process.env.ANTHROPIC_API_KEY = 'anthropic-test-key';
    process.env.CLAUDE_MODEL = 'claude-test-model';
    globalThis.fetch = async (url, options) => {
      assert.match(String(url), /api\.anthropic\.com\/v1\/messages/);
      const body = JSON.parse(options.body);
      assert.equal(body.model, 'claude-test-model');
      assert.equal(options.headers['x-api-key'], 'anthropic-test-key');
      return Response.json({
        stop_reason: 'end_turn',
        content: [{ type: 'text', text: JSON.stringify({
          numero_ticket: '0534063',
          peso_liquido_kg: 23510,
          placa_veiculo: 'OVH4J13',
          placa_carreta: 'MQP5D98',
          transportadora: 'Multilift Logística Ltda',
          navio: 'PACIFIC VIRTUE'
        }) }]
      });
    };
    const d = await readTicketWithSalomaoIA(null, { mime:'image/jpeg', base64:'test' }, 'ton');
    assert.equal(d.numero_ticket, '0534063');
    assert.equal(d.peso_liquido_kg, 23510);
    assert.equal(d.placa_veiculo, 'OVH4J13');
    assert.equal(d.placa_carreta, 'MQP5D98');
    assert.equal(d.transportadora, 'Multilift Logística Ltda');
  } finally {
    globalThis.fetch = beforeFetch;
    if (beforeKey == null) delete process.env.ANTHROPIC_API_KEY; else process.env.ANTHROPIC_API_KEY = beforeKey;
    if (beforeModel == null) delete process.env.CLAUDE_MODEL; else process.env.CLAUDE_MODEL = beforeModel;
  }
});

test('incomplete vision triggers focused second read without replacing valid first-read fields', async () => {
  const before = globalThis.fetch; const beforeAnthropic = process.env.ANTHROPIC_API_KEY; let calls = 0;
  try {
    delete process.env.ANTHROPIC_API_KEY;
    globalThis.fetch = async (_url, options) => {
      const body = JSON.parse(options.body); calls++;
      assert.equal(body.store, false); assert.equal(body.text.format.type, 'json_object');
      assert.equal(body.reasoning, undefined);
      const data = calls === 1 ? { numero_ticket:'72416', peso_liquido_kg:38470 } : { numero_ticket:'99999', peso_liquido_kg:50, placa_veiculo:'NZE8I52', placa_carreta:'MQX5F98', transportadora:'Trans Salomão', operadora:'LOG CONSULTING' };
      return Response.json({ output:[{ content:[{ type:'output_text', text:JSON.stringify(data) }] }] });
    };
    const d = await readTicketWithSalomaoIA(null, { mime:'image/jpeg', base64:'test' }, 'ton');
    assert.equal(calls,2); assert.equal(d.numero_ticket,'72416'); assert.equal(d.peso_liquido_kg,38470);
    assert.equal(d.placa_veiculo,'NZE8I52'); assert.deepEqual(d.campos_ausentes,[]);
  } finally {
    globalThis.fetch = before;
    if (beforeAnthropic == null) delete process.env.ANTHROPIC_API_KEY; else process.env.ANTHROPIC_API_KEY = beforeAnthropic;
  }
});

test('rejected credentials, network errors and malformed JSON all enable local OCR safely', async () => {
  const before = globalThis.fetch; const beforeAnthropic = process.env.ANTHROPIC_API_KEY;
  try {
    delete process.env.ANTHROPIC_API_KEY;
    for (const mock of [
      async () => Response.json({error:{message:'secret-test-value'}},{status:401}),
      async () => { throw new TypeError('network failed'); },
      async () => Response.json({output:[{content:[{type:'output_text',text:'invalid json'}]}]}),
    ]) {
      globalThis.fetch = mock;
      await assert.rejects(() => readTicketWithSalomaoIA(null,{mime:'image/jpeg',base64:'test'},'ton'), e => e instanceof SalomaoVisionUnavailable && e.ocrFallback && !e.message.includes('secret-test-value'));
    }
  } finally {
    globalThis.fetch = before;
    if (beforeAnthropic == null) delete process.env.ANTHROPIC_API_KEY; else process.env.ANTHROPIC_API_KEY = beforeAnthropic;
  }
});

test('unknown plates and unobserved fleet values are never invented', () => {
  const d = finishTicketReading({ numero_ticket:'1',placa_veiculo:'invalid',placas_detectadas:['MQX5F98'] }, 'ton', {tractorPlate:'NZE8I52'});
  assert.equal(d.placa_veiculo,null); assert.equal(d.placa_carreta,null);
});
