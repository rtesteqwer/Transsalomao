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


test('a pending fiscal receipt cannot be confirmed by amounts from another photo', () => {
  const conflict = server.normalizeFuelingReading(server.parseServerFuelingOcr(receipt.replaceAll('1.000,00','1.680,00')));
  const pump = server.normalizeFuelingReading(server.parseServerFuelingOcr('1000,00\n156,495\n6,390'));
  const output = local.reconcileFuelingBatch([{id:'invoice',reading:conflict},{id:'pump',reading:pump}]);
  assert.equal(output[0].reading.total_amount, null);
  assert.equal(output[0].reading.consistency, 'conflict');
});


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
