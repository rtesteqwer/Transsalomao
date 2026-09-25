import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { existsSync, mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { pathToFileURL } from 'node:url';

const source = path.resolve(process.env.TRANS_TEST_APP || '../app');
const require = createRequire(path.join(source, 'package.json'));
const ts = require('typescript');
const tmp = mkdtempSync(path.join(os.tmpdir(), 'ticket-reader-'));

for (const name of ['ticket-core', 'ticket-parser']) {
  let sourceText = readFileSync(path.join(source, 'src/lib', name + '.ts'), 'utf8');
  sourceText = sourceText.replaceAll('@/lib/ticket-core', './ticket-core.mjs');
  writeFileSync(path.join(tmp, name + '.mjs'), ts.transpileModule(sourceText, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 }
  }).outputText);
}

const { parseTicketOcr, finishTicketReading } = await import(pathToFileURL(path.join(tmp, 'ticket-parser.mjs')));
after(() => rmSync(tmp, { recursive: true, force: true }));

test('ticket reader build is OCR-only and contains no vision provider modules', () => {
  assert.equal(existsSync(path.join(source, 'src/lib/ticket-provider.server.ts')), false);
  assert.equal(existsSync(path.join(source, 'src/lib/salomao-ticket-reader.server.ts')), false);
});

test('MULTILIFT photo model: ticket 0534063, exact net kg and selected fleet plates', () => {
  const ocr = `MULTILIFT LOGISTICA LTDA
TICKET DE PESAGEM 0534063 - Encerrado
Carreta Veic/Cavalo NAVIO
MQP-SD98 OVH-4 13 PACIFIC VIRTUE
Transportadora
130 - Multilift logistica ltda
Pesagem Inicial
Peso: 20.580 kg
Pesagem Final
Peso: 44.090 kg
Peso Liquido Nº NF Diferenças Origem
[23510 kg
Dados Motorista
NOME: Clovis Salomao Garcia`;
  const d = parseTicketOcr(ocr, 'ton', { tractorPlate: 'OVH4J13', trailerPlate: 'MQP5D98' });
  assert.equal(d.model_type, 'multilift');
  assert.equal(d.numero_ticket, '0534063');
  assert.equal(d.peso_liquido_kg, 23510);
  assert.equal(d.pesagem_inicial_kg, 20580);
  assert.equal(d.pesagem_final_kg, 44090);
  assert.equal(d.placa_veiculo, 'OVH4J13');
  assert.equal(d.placa_carreta, 'MQP5D98');
  assert.equal(d.transportadora, 'Multilift Logística Ltda');
});

test('ADUBOS REAL photo model corrects common leading ticket OCR error', () => {
  const ocr = `Ticket nº 4039012868
Operação: Entrada
Data: 10.09.2026
Placa: QWS3E13
Motorista: KLEBERSON DUTRA
PESAGEM
Tara: 18.500,000 -10.09.2026 11:08:36 ADRDIV-004
Bruto: 48.460,000 -10.09.2026 10:49:52 ADRDIV-004
Liquido: 29.960,000
21.437.447/0039-75
ADUBOS REAL S.A.`;
  const d = parseTicketOcr(ocr, 'ton', { tractorPlate: 'QWS3E13', trailerPlate: 'FYW7J05' });
  assert.equal(d.model_type, 'adubos_real');
  assert.equal(d.numero_ticket, '1039012868');
  assert.equal(d.peso_liquido_kg, 29960);
  assert.equal(d.pesagem_inicial_kg, 48460);
  assert.equal(d.pesagem_final_kg, 18500);
  assert.equal(d.placa_veiculo, 'QWS3E13');
  assert.equal(d.placa_carreta, 'FYW7J05');
  assert.equal(d.destinatario, 'ADUBOS REAL S.A.');
});

test('VPORTS receipt model ignores scheduled ticket and fixes OCR-confused plates', () => {
  const ocr = `VPORTS - Tiquoto de Pesagem
BALANÇA 1
Pesagem de Saida
Tiquete 72416
Ticket Agend 2026607600
Navio BELISLAND
Operador LOG CONSULTING
Transportadora
GIZELE APARECIDA DA
ROCHA GARCIA
Motorista LUIS ANTONIO FELIX DOS SANTOS
Produto FERTILIZANTE
Peso Entrada 17.230 kg
Peso Saida 55.700 kg
Peso Liquido 38.470 kg
Placas
MQX5F96 NZE6152`;
  const d = parseTicketOcr(ocr, 'ton', { tractorPlate: 'NZE8I52', trailerPlate: 'MQX5F98' });
  assert.equal(d.model_type, 'vports_recibo');
  assert.equal(d.numero_ticket, '72416');
  assert.equal(d.peso_liquido_kg, 38470);
  assert.equal(d.placa_veiculo, 'NZE8I52');
  assert.equal(d.placa_carreta, 'MQX5F98');
  assert.equal(d.transportadora, 'GIZELE APARECIDA DA ROCHA GARCIA');
  assert.equal(d.operadora, 'LOG CONSULTING');
});

test('VPORTS report model reads standalone split ticket, exact net kg and company roles', () => {
  const ocr = `Número
0024125
Ticket:
Status: Encerrado
Placa
Carreta
Veiculo
FYW7J05 QWS3E13
Pesagem Inicial: 52920 kg
Pesagem Final: 18470 kg
Peso Liquido: 34450 kg
Peso Origem: 34580 kg
Transportadora
CNPJ: 49544417000104
Razão Social: RAS TRANSPORTES E SERVICOS LTDA
Destinatário
CNPJ: VPORTS AUTORIDADE POR
Razão Social: 27316538000409
Número NF: Nro Nota: 000006596-007`;
  const d = parseTicketOcr(ocr, 'ton', { tractorPlate: 'QWS3E13', trailerPlate: 'FYW7J05' });
  assert.equal(d.model_type, 'vports_relatorio');
  assert.equal(d.numero_ticket, '0024125');
  assert.equal(d.peso_liquido_kg, 34450);
  assert.equal(d.placa_veiculo, 'QWS3E13');
  assert.equal(d.placa_carreta, 'FYW7J05');
  assert.equal(d.transportadora, 'RAS TRANSPORTES E SERVICOS LTDA');
  assert.equal(d.destinatario, 'VPORTS AUTORIDADE PORTUARIA');
});

test('LOG CONSULTING model fixes common plate OCR mistakes and keeps company roles separate', () => {
  const ocr = `TICKET DE PESAGEM
LOG CONSULTING
RODOVIA DARLY SANTOS, S/N - VILA VELHA - ES
Data de entrada 21/09/2026
Data de saida 21/09/2026
Tiquete 000024847
Placa do Veiculo QUS3E13
Placa da Carreta FYW7305
Motorista KLEBERSON DUTRA
Operação Descarga
Transportadora RAS TRANSP
Empresa HERINGER MANH
Produto NPK 19-04-19 + MICROS
Peso liquido de entrada 52500 kg
Peso liquido de Saida 18640 kg
Peso liquido..: 33860 kg`;
  const d = parseTicketOcr(ocr, 'ton', { tractorPlate: 'QWS3E13', trailerPlate: 'FYW7J05' });
  assert.equal(d.model_type, 'log_consulting');
  assert.equal(d.numero_ticket, '000024847');
  assert.equal(d.peso_liquido_kg, 33860);
  assert.equal(d.placa_veiculo, 'QWS3E13');
  assert.equal(d.placa_carreta, 'FYW7J05');
  assert.equal(d.transportadora, 'RAS TRANSPORTES');
  assert.equal(d.contratante, 'HERINGER MANHUACU - MG');
});

test('second ADUBOS REAL model keeps exact printed kg', () => {
  const ocr = `Ticket n° 1039013373
Operação: Entrada
Data: 16.09.2026
Placa: QWS3E13
Motorista: KLEBERSON DUTRA
PESAGEM
Tara: 18.660,000 -17.09.2026 00:41:01 ADR-DIV-004
Bruto: 42.740,000 -17.09.2026 00:29:55 ADR-DIV-004
Liquido: 24.080,000
ADUBOS REAL S.A.`;
  const d = parseTicketOcr(ocr, 'ton', { tractorPlate: 'QWS3E13', trailerPlate: 'FYW7J05' });
  assert.equal(d.numero_ticket, '1039013373');
  assert.equal(d.peso_liquido_kg, 24080);
  assert.equal(d.pesagem_inicial_kg, 42740);
  assert.equal(d.pesagem_final_kg, 18660);
  assert.equal(d.placa_veiculo, 'QWS3E13');
  assert.equal(d.placa_carreta, 'FYW7J05');
});

test('tonne separators and arithmetic fallback preserve exact kilograms', () => {
  assert.equal(parseTicketOcr('Ticket: 123\nPeso líquido: 35,810 t', 'ton').peso_liquido_kg, 35810);
  for (const [gross, tare, net] of [[48460,18500,29960],[42740,18660,24080],[52920,18470,34450]]) {
    assert.equal(parseTicketOcr(`Ticket: 123\nBruto: ${gross} kg\nTara: ${tare} kg\nLíquido: 50 kg`, 'ton').peso_liquido_kg, net);
  }
});

test('non-ton modes suppress all weights and preserve OCR metadata', () => {
  const raw = 'Tiquete 000024847\nPlaca do Veiculo QWS3E13\nPlaca da Carreta FYW7J05\nTransportadora RAS TRANSPORTES\nEmpresa HERINGER MANHUACU - MG\nPeso liquido..: 33860 kg';
  for (const mode of ['trip','cegonha','caixinha']) {
    const d = parseTicketOcr(raw, mode, { tractorPlate:'QWS3E13', trailerPlate:'FYW7J05' });
    assert.equal(d.peso_liquido_kg, null);
    assert.equal(d.pesagem_inicial_kg, null);
    assert.equal(d.pesagem_final_kg, null);
  }
});

test('selected fleet is only used to correct/complete a plate when OCR has matching evidence', () => {
  const d = finishTicketReading({
    numero_ticket:'1',
    placa_veiculo:'QUS3E13',
    placas_detectadas:['QUS3E13']
  }, 'ton', { tractorPlate:'QWS3E13', trailerPlate:'FYW7J05' });
  assert.equal(d.placa_veiculo,'QWS3E13');
  assert.equal(d.placa_carreta,null);
});
