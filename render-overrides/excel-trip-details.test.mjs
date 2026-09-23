import assert from 'node:assert/strict';
import test from 'node:test';
import { addTripDetailsWorksheet, tripDetailRows } from './excel-trip-details.ts';

const makeTrip = (overrides = {}) => ({
  id: 'a', code: '10', date: '2026-09-01', driverName: 'Motorista exemplo', fleetName: 'Conjunto 01',
  freightMode: 'ton', client: 'Empresa exemplo', origin: 'Origem', destination: 'Destino',
  netWeight: 30.123, pricePerTon: 20, pricePerTrip: 0,
  freight: 602.46, commissionPct: 0.2, commissionValue: 120.492,
  ...overrides,
});

test('keeps ton and daily trips one per row and groups only cegonha/caixinha', () => {
  const input = [
    makeTrip({ id: 'ton-a', code: '190' }),
    makeTrip({ id: 'ton-b', code: '191', netWeight: 32.72, freight: 654.4, commissionValue: 130.88 }),
    makeTrip({ id: 'daily', code: '206', freightMode: 'trip', netWeight: 0, pricePerTon: 0, pricePerTrip: 500, freight: 500, commissionValue: 100 }),
    makeTrip({ id: 'ceg-a', code: '300', freightMode: 'cegonha', netWeight: 0, pricePerTon: 0, pricePerTrip: 400, freight: 400, commissionValue: 80 }),
    makeTrip({ id: 'ceg-b', code: '301', freightMode: 'cegonha', netWeight: 0, pricePerTon: 0, pricePerTrip: 400, freight: 400, commissionValue: 80 }),
    makeTrip({ id: 'cx-a', code: '400', freightMode: 'caixinha', netWeight: 0, pricePerTon: 0, pricePerTrip: 250, freight: 250, commissionValue: 50 }),
    makeTrip({ id: 'cx-b', code: '401', freightMode: 'caixinha', netWeight: 0, pricePerTon: 0, pricePerTrip: 250, freight: 250, commissionValue: 50 }),
    makeTrip({ id: 'cx-c', code: '402', freightMode: 'caixinha', netWeight: 0, pricePerTon: 0, pricePerTrip: 250, freight: 250, commissionValue: 50 }),
  ];
  const original = JSON.stringify(input);
  const rows = tripDetailRows(input);

  assert.equal(rows.length, 5);
  assert.deepEqual(rows.map(row => row[4]), ['Por tonelada', 'Por tonelada', 'Diária', 'Caixinha', 'Cegonha']);
  assert.equal(rows[0][1], '190');
  assert.equal(rows[1][1], '191');
  assert.equal(rows[0][8], 30.123);
  assert.equal(rows[0][9], 20);

  const caixinha = rows.find(row => row[4] === 'Caixinha');
  const cegonha = rows.find(row => row[4] === 'Cegonha');
  assert.equal(caixinha[1], '3 viagens agrupadas');
  assert.equal(caixinha[11], 750);
  assert.equal(caixinha[13], 150);
  assert.equal(cegonha[1], '2 viagens agrupadas');
  assert.equal(cegonha[11], 800);
  assert.equal(cegonha[13], 160);
  assert.equal(JSON.stringify(input), original);
});

function workbookDouble() {
  const rows = new Map();
  const columns = new Map();
  const sheet = {
    rowCount: 0, mergeCells() {},
    getRow(number) {
      this.rowCount = Math.max(this.rowCount, number);
      if (!rows.has(number)) {
        const cells = new Map();
        rows.set(number, { number, height: undefined, getCell(col) {
          if (!cells.has(col)) cells.set(col, {});
          return cells.get(col);
        }, set values(values) { values.forEach((value, i) => { this.getCell(i + 1).value = value; }); } });
      }
      return rows.get(number);
    },
    getCell(row, col) {
      if (typeof row === 'string') {
        const [,letter,number] = row.match(/^([A-Z])(\d+)$/);
        return this.getRow(Number(number)).getCell(letter.charCodeAt(0) - 64);
      }
      return this.getRow(row).getCell(col);
    },
    addRow(values) { const row = this.getRow(this.rowCount + 1); row.values = values; return row; },
    getColumn(number) { if (!columns.has(number)) columns.set(number, {}); return columns.get(number); },
  };
  return { addWorksheet() { return sheet; } };
}

test('worksheet stays compact and totals include displayed rows', () => {
  const sheet = addTripDetailsWorksheet(workbookDouble(), [
    makeTrip({ id: 'a', code: '190' }),
    makeTrip({ id: 'b', code: '191', freight: 654.4, commissionValue: 130.88 }),
  ], 'Teste');

  assert.equal(sheet.getRow(7).height, 24);
  assert.equal(sheet.getRow(8).height, 24);
  assert.deepEqual(sheet.getCell('L9').value, { formula: 'SUM(L7:L8)', result: 1256.86 });
  assert.deepEqual(sheet.getCell('N9').value, { formula: 'SUM(N7:N8)', result: 251.372 });
  assert.deepEqual(sheet.autoFilter, { from: 'A6', to: 'O8' });
  assert.equal(sheet.rowCount, 9);
});

test('empty scope has zero totals without a reversed range', () => {
  const sheet = addTripDetailsWorksheet(workbookDouble(), [], 'Nenhum frete');
  assert.deepEqual(sheet.getCell('L7').value, { formula: '0', result: 0 });
});
