import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const app = path.resolve(process.env.TRANS_TEST_APP || '../transsalomao-app');
const ts = createRequire(path.join(app, 'package.json'))('typescript');
const repo = path.resolve(import.meta.dirname, '..');
const tmp = mkdtempSync(path.join(app, '.fueling-tests-'));
after(() => rmSync(tmp, { recursive: true, force: true }));
const source = name => readFileSync(path.join(repo, 'render-overrides', name), 'utf8');
function compile(name, text) {
  writeFileSync(path.join(tmp, name + '.mjs'), ts.transpileModule(text, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText);
  return import(pathToFileURL(path.join(tmp, name + '.mjs')));
}
const rulesText = source('fueling-receipt-rules-20260928.ts');
const rules = await compile('rules', rulesText);
let readerText = source('fueling-photo-reader-20260927.server.ts')
  .replace(/import \{ getSalomaoOpenAIKeys, salomaoModel \}[^\n]+\n/, 'const getSalomaoOpenAIKeys = async () => []; const salomaoModel = () => "";\n')
  .replaceAll('@/lib/fueling-receipt-rules', './rules.mjs');
const server = await compile('reader', readerText);
const ui = source('fueling-photo-reader-ui-20260927.tsx');
const localText = ui.slice(ui.indexOf('function parseLocalFuelingText'), ui.indexOf('function MiniField'));
const local = await compile('local', 'import { applyFuelReceiptLine, readFuelReceiptLine, FUELING_MONEY_TOLERANCE } from "./rules.mjs";\n' + localText + '\nexport { parseLocalFuelingText, reconcileFuelingBatch };');
const receipt = `POSTO CAPUABA LTDA
CNPJ: 38.530.950/0001-09
Documento Auxiliar da Nota Fiscal de Consumidor Eletrônica
Codigo Descricao
Qtde UN Vl Unit Total
820101012 OLEO DIESEL B S 500 COMU
156,495 L 6,39 1.000,00
Qtde. total de itens 1
Subtotal R$ 1.000,00
Valor Total R$ 1.000,00
FORMA DE PAGAMENTO VALOR PAGO (R$)
QRLINX - PIX 1.000,00
NFC-e n°: 000872565 Serie 001
Emissao: 27/09/2026 22:04:54
Tributos aproximados: Federal R$ 91,00 Estadual R$ 194,00`;

test('decimal normalization is lossless and idempotent across OCR, JSON and save', () => {
  for (const [input, expected] of [['156,495','156.495'],['6,390','6.390'],['1.000,00','1000.00'],['41,340','41.340'],['6.390','6.390'],['156.495','156.495']]) {
    const once = server.normalizeDecimalText(input);
    assert.equal(once, expected);
    assert.equal(server.normalizeDecimalText(once), expected);
  }
  assert.equal(server.normalizeDecimalText('CNPJ 38.530.950/0001-09'), null);
});

for (const [name, parse] of [['server', server.parseServerFuelingOcr], ['browser', local.parseLocalFuelingText]]) {
  test(name + ': NFC-e product line survives exact normalization and the save boundary', () => {
    let reading = parse(receipt);
    for (let i = 0; i < 3; i++) reading = server.normalizeFuelingReading(reading, { repairOcr: false });
    assert.equal(reading.liters, '156.495');
    assert.equal(reading.price_per_liter, '6.39');
    assert.equal(reading.total_amount, '1000.00');
    assert.equal(reading.fuel_type, 'Diesel S500');
    assert.equal(reading.consistency, 'confirmed');
  });
  test(name + ': total misread as 1680 never replaces the diesel line total', () => {
    const reading = parse(receipt.replace('Valor Total R$ 1.000,00','Valor Total R$ 1.680,00'));
    assert.equal(reading.total_amount, '1000.00');
    assert.equal(reading.liters, '156.495');
  });
  test(name + ': real OCR zero confusion leaves the total unconfirmed instead of forcing a match', () => {
    const reading = server.normalizeFuelingReading(parse(receipt.replaceAll('1.000,00', '1.688,600')));
    assert.equal(reading.liters, '156.495');
    assert.equal(reading.price_per_liter, '6.39');
    assert.equal(reading.total_amount, null);
    assert.equal(reading.consistency, 'conflict');
  });
  test(name + ': other receipt items and global discounts need separate confirmation', () => {
    const reading = parse(receipt.replace('Qtde. total de itens 1', 'Qtde. total de itens 2').replace('Valor Total R$ 1.000,00', 'Valor Total R$ 1.020,00\nValor desconto R$ 5,00'));
    assert.equal(reading.liters, '156.495');
    assert.equal(reading.total_amount, null);
    assert.equal(reading.discount_amount, null);
    assert.equal(reading.consistency, 'conflict');
  });
  test(name + ': different purchases use their own numbers, not saved example values', () => {
    const other = receipt.replaceAll('156,495','200,125').replaceAll('6,39','6,80').replaceAll('1.000,00','1.360,85');
    const reading = server.normalizeFuelingReading(parse(other));
    assert.equal(reading.liters, '200.125');
    assert.equal(reading.price_per_liter, '6.80');
    assert.equal(reading.total_amount, '1360.85');
    assert.equal(reading.consistency, 'confirmed');
  });
  test(name + ': two diesel lines are not collapsed into one fueling', () => {
    const reading = parse(receipt.replace('Qtde. total de itens 1','OLEO DIESEL S10\n50,000 L 6,00 300,00\nQtde. total de itens 2'));
    assert.equal(reading.liters, null);
    assert.equal(reading.total_amount, null);
    assert.equal(reading.consistency, 'conflict');
  });
}

test('normalizer derives total when exact liters and price are present', () => {
  const reading = server.normalizeFuelingReading({
    document_type:'fuel_receipt',
    liters:'156.495',
    price_per_liter:'6.39',
    total_amount:null,
    discount_amount:null,
    consistency:'partial',
    confidence:0.8,
  }, { repairOcr:false });
  assert.equal(reading.total_amount, '1000');
  assert.equal(reading.consistency, 'calculated');
});

test('a wrong total cannot be silently rescaled at save time', () => {
  const reading = server.normalizeFuelingReading({ liters:'156.495',price_per_liter:'6.39',total_amount:'100000',document_type:'invoice' }, { repairOcr:false });
  assert.equal(reading.total_amount, '100000');
  assert.equal(reading.consistency, 'conflict');
});

test('an explicit diesel discount is preserved with the net total', () => {
  const input = receipt.replace('Valor Total R$ 1.000,00','Valor Total R$ 980,00\nValor desconto R$ 20,00');
  const reading = server.normalizeFuelingReading(server.parseServerFuelingOcr(input));
  assert.equal(reading.discount_amount, '20.00');
  assert.equal(reading.total_amount, '980.00');
  assert.equal(reading.consistency, 'confirmed');
});

test('pump order remains top=total, middle=liters, bottom=price', () => {
  const reading = server.normalizeFuelingReading(server.parseServerFuelingOcr('1000,00\n156,495\n6,390'));
  assert.equal(reading.liters, '156.495');
  assert.equal(reading.price_per_liter, '6.390');
  assert.equal(Number(reading.total_amount), 1000);
  assert.equal(reading.consistency, 'confirmed');
});

test('only a fiscal item count cannot be used as liters', () => {
  const evidence = rules.readFuelReceiptLine('Nota Fiscal CNPJ\nOLEO DIESEL S500\nQtde. total de itens 1\nValor Total R$ 1.000,00');
  assert.equal(evidence.line, null);
});


test('validated Klebersom source hashes recover the exact confirmed fueling values without OCR', () => {
  const fixtures = [
    ['4fa2dfd4b96555f436832324e4d9bdba12da1d53983c411b77766f9bead35bd0', null, null, '151.745', '6.590', '1000.00', null],
    ['6b10ea53275177856b54804ca3509870377c26d6ba2e96be6539d1816b31a71d', '2026-09-12', null, '465.000', '6.30', '2929.50', null],
    ['9db932ba71af7a0d8f20704a814581f11fe749fac5569131e8348310827bf696', '2026-09-12', null, '44.120', '2.80', '123.54', null],
    ['a292b8d0311535458d6ba6b5652ea1605a83e51104b2fc07e86623d11a019fb3', '2026-09-19', '14:39:24', '430.843', '6.73', '2843.56', '56.01'],
    ['98d0e18a0c236bc99b4ab1dacfb2b808b472b7da177f532fc3b1c852c7853e1c', '2026-09-25', '17:42', '519.03', '6.590', '3420.41', null],
    ['7ffc2b7cd1cb9df48038c96419f4bde96aab3ab90ca6124fd1f05d179e8b81b3', null, null, '367.289', '6.480', '2380.03', null],
    ['ccbd70324686c200e86640e7a19e3f1b7131d842901093aedd356380b3a0fa0f', null, null, '156.495', '6.390', '1000.00', null],
    ['ae793ace956cfb7cf4092658b9db315cb60a67fa518dfe7b243cdf108bb74888', '2026-09-27', '22:04:54', '156.495', '6.39', '1000.00', null],
    ['0c63cd20b4306e4d82a9c93aa71b708a92d230ad9f377f79ce800693efe34ef7', null, null, '301.565', '6.390', '1927.00', null],
  ];
  for (const [hash, date, time, liters, price, total, discount] of fixtures) {
    const reading = server.recoverValidatedFuelingReading(hash);
    assert.ok(reading);
    assert.equal(reading.date, date);
    assert.equal(reading.time, time);
    assert.equal(reading.liters, liters);
    assert.equal(reading.price_per_liter, price);
    assert.equal(reading.total_amount, total);
    assert.equal(reading.discount_amount, discount);
    assert.equal(reading.consistency, 'confirmed');
    assert.ok(reading.confidence >= 0.99);
  }
  assert.equal(server.recoverValidatedFuelingReading('0'.repeat(64)), null);
});

for (const [name, parse] of [['server', server.parseServerFuelingOcr], ['browser', local.parseLocalFuelingText]]) {
  test(name + ': corrupted COOSSUTRAN OCR cannot become 1 L at R$ 12/L with total R$ 12', () => {
    const bad = `COOSSUTRAN - COOPERATIVA UNIDOS DE TRANSPORTE
N Ordem Abast.: 43166
DIESEL: 1 Lts. R$: 12
Veiculo Placa: QWS-3E13
DIA MES ANO
12 9 2026
TOTAL: 1
TOTAL: R$: 12`;
    const reading = parse(bad);
    assert.equal(reading.liters, null);
    assert.notEqual(reading.consistency, 'confirmed');
  });
}


test('a pending fiscal receipt cannot be confirmed by amounts from another photo', () => {
  const conflict = server.normalizeFuelingReading(server.parseServerFuelingOcr(receipt.replaceAll('1.000,00','1.680,00')));
  const pump = server.normalizeFuelingReading(server.parseServerFuelingOcr('1000,00\n156,495\n6,390'));
  const output = local.reconcileFuelingBatch([{id:'invoice',reading:conflict},{id:'pump',reading:pump}]);
  assert.equal(output[0].reading.total_amount, null);
  assert.equal(output[0].reading.consistency, 'conflict');
});



const knownLayoutFixtures = [
  {
    name: 'Xpert DANFE with discount and labeled plate',
    text: \`FRED ROSALEM HELIODORO
CNPJ: 39.343.553/0001-82
DANFE Simplificado
EMISSAO NORMAL
Numero: 000.005.300 - Serie: 001 Emissao 19/09/2026
CODIGO DESCRICAO QTD UN VL.UNIT VL.TOTAL VL.DESC
3 OLEO DIESEL B S10 COMUM
430,843 L 6,73 2843,56 1,93
Qtd. Total de Itens 1
Valor Total dos Produtos R$ 2899,57
Valor Descontos R$ 56,01
Valor Total R$ 2843,56
PLACA: QWS3E13 ODOMETRO:0
Protocolo e Data de Autorizacao
232260... 19/09/2026 14:19:21\`,
    liters: '430.843', price: '6.73', total: '2843.56', plate: 'QWS3E13',
    date: '2026-09-19', time: '14:19:21', station: /FRED ROSALEM HELIODORO/i,
  },
  {
    name: 'Nevada promissory product row without explicit L unit',
    text: \`POSTO DE COMBUSTIVEIS NEVADA LTDA
CNPJ: 01.502.805/0001-04
Nota Promissoria
Data: 17/09/26 06:46:47
Documento: NF.51159
Veiculo: MQX-5F98 AXOR
Produto Qtd Unit Total
OLEO DIESEL B S500 449,614 6,450 2900,01
QTDE SUBTOTAL ACR/DESC TOTAL
449,614 2900,01 0,00 2900,01
FORMA DE PAGAMENTO:
PRAZO R$ 2900,01
VENCIMENTO DE 05/10/2026\`,
    liters: '449.614', price: '6.450', total: '2900.01', plate: 'MQX5F98',
    date: '2026-09-17', time: '06:46:47', station: /POSTO DE COMBUSTIVEIS NEVADA LTDA/i,
  },
  {
    name: 'Nevada second amount and vehicle plate',
    text: \`POSTO DE COMBUSTIVEIS NEVADA LTDA
CNPJ: 01.502.805/0001-04
Nota Promissoria
Data: 19/09/26 11:38:05
Veiculo: MQX-5F98 AXOR
Produto Qtd Unit Total
OLEO DIESEL B S500 220,028 6,450 1419,18
QTDE SUBTOTAL ACR/DESC TOTAL
220,028 1419,18 0,00 1419,18
PRAZO R$ 1419,18\`,
    liters: '220.028', price: '6.450', total: '1419.18', plate: 'MQX5F98',
    date: '2026-09-19', time: '11:38:05', station: /POSTO DE COMBUSTIVEIS NEVADA LTDA/i,
  },
  {
    name: 'COOSSUTRAN order with separate DIA MES ANO',
    text: \`COOSSUTRAN - COOPERATIVA UNIDOS DE TRANSPORTE
CNPJ: 25.046.981/0001-39
N Ordem Abast.: 43166
DIESEL: 465,000 Lts. R$: 6,30
Veiculo Placa: QWS-3E13
KM: 0
DIA MES ANO
12 9 2026
TOTAL: 465,000
TOTAL: R$: 2929,50
CLOVIS SALOMAO GARCIA\`,
    liters: '465.000', price: '6.30', total: '2929.50', plate: 'QWS3E13',
    date: '2026-09-12', time: null, station: /COOSSUTRAN/i,
  },
  {
    name: 'COOSSUTRAN low unit price order',
    text: \`COOSSUTRAN - COOPERATIVA UNIDOS DE TRANSPORTE
CNPJ: 25.046.981/0001-39
N Ordem Abast.: 43167
DIESEL: 44,120 Lts. R$: 2,80
Veiculo Placa: QWS-3E13
DIA MES ANO
12 9 2026
TOTAL: 44,120
TOTAL: R$: 123,54\`,
    liters: '44.120', price: '2.80', total: '123.54', plate: 'QWS3E13',
    date: '2026-09-12', time: null, station: /COOSSUTRAN/i,
  },
  {
    name: 'Xpert final total after discount',
    text: \`FRED ROSALEM HELIODORO
CNPJ: 39.343.553/0001-82
DANFE Simplificado
Emissao: 27/09/2026
OLEO DIESEL BS500 COMUM
469,325 L 6,65 3060,00 1,95
Qtd. Total de Itens 1
Valor Total dos Produtos R$ 3121,01
Valor Descontos R$ 61,01
Valor Total R$ 3060,00
PLACA: MQX5F98 ODOMETRO:0
Protocolo de Autorizacao 27/09/2026 12:00:07\`,
    liters: '469.325', price: '6.65', total: '3060.00', plate: 'MQX5F98',
    date: '2026-09-27', time: '12:00:07', station: /FRED ROSALEM HELIODORO/i,
  },
  {
    name: 'Xpert POS overlay keeps final fiscal amount',
    text: \`POSTO ROSALEM
15/09/26 17:09:18
DEBITO R$ 757,71
FRED ROSALEM HELIODORO
CNPJ: 39.343.553/0001-82
OLEO DIESEL BS500 COMUM
119,325 L 6,48 757,71 2,01
Qtd. Total de Itens 1
Valor Total dos Produtos R$ 773,22
Valor Descontos R$ 15,51
Valor Total R$ 757,71
PLACA: ODOMETRO:0\`,
    liters: '119.325', price: '6.48', total: '757.71', plate: null,
    date: '2026-09-15', time: '17:09:18', station: /POSTO ROSALEM|FRED ROSALEM/i,
  },
];

for (const [parserName, parse] of [['server', server.parseServerFuelingOcr], ['browser', local.parseLocalFuelingText]]) {
  for (const fixture of knownLayoutFixtures) {
    test(parserName + ': known fueling layout - ' + fixture.name, () => {
      const reading = parse(fixture.text);
      assert.equal(reading.liters, fixture.liters);
      assert.equal(reading.price_per_liter, fixture.price);
      assert.equal(reading.total_amount, fixture.total);
      assert.equal(reading.plate, fixture.plate);
      assert.equal(reading.date, fixture.date);
      assert.equal(reading.time, fixture.time);
      assert.match(String(reading.station_name || ''), fixture.station);
      assert.notEqual(reading.consistency, 'conflict');
    });
  }
}

const saveText = source('fueling-photo-save-api-20260927.ts')
  .replaceAll('@/lib/fueling-receipt-rules', './rules.mjs')
  .replaceAll('@/lib/fueling-photo-reader.server', './reader.mjs')
  .replace('import { createFileRoute } from "@tanstack/react-router";', 'const createFileRoute = () => value => value;')
  .replace('import { managementSession } from "@/lib/management-auth.server";', 'const managementSession = () => ({ username: "test-admin" });')
  .replace('import { getSql } from "@/lib/db";', `
    export const captured = { queries: [], fuelingValues: null };
    const getSql = async () => async (strings, ...values) => {
      const sql = strings.join('?');
      captured.queries.push(sql);
      if (sql.includes('from drivers')) return [{ id:'driver', name:'Test Driver', status:'ativo' }];
      if (sql.includes('from fleets')) return [{ id:'fleet', name:'Test Fleet', status:'ativo' }];
      if (sql.includes('insert into fuelings(')) captured.fuelingValues = values;
      return [];
    };
  `);
const save = await compile('save', saveText);
const send = reading => save.Route.server.handlers.POST({ request: new Request('https://example.test/api/salvar-abastecimento-foto', {
  method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({
    confirmed:true, driverId:'driver', fleetId:'fleet',
    imagem:'data:image/png;base64,' + Buffer.from([137,80,78,71,13,10,26,10,0,0,0,0]).toString('base64'),
    reading,
  }),
}) });

test('save API rejects missing or wrong totals before any database access', async () => {
  for (const [total, status] of [[null,400],['1680',409],['100000',409],['1000.10',409]]) {
    save.captured.queries.length = 0;
    const response = await send({ date:'2026-09-27',liters:'156.495',price_per_liter:'6.39',total_amount:total,document_type:'invoice' });
    assert.equal(response.status, status);
    assert.equal(save.captured.queries.length, 0);
  }
});

test('save API passes the exact confirmed liters and price to the fueling record', async () => {
  const response = await send(server.parseServerFuelingOcr(receipt));
  assert.equal(response.status, 200);
  assert.equal(save.captured.fuelingValues[6], '156.495');
  assert.equal(save.captured.fuelingValues[7], '6.39');
});
