import assert from 'node:assert/strict';
import test from 'node:test';
import { addTripDetailsWorksheet, tripDetailRows } from './excel-trip-details.ts';

const makeTrip = (overrides = {}) => ({
  id: 'a', code: '10', date: '2026-09-01', driverName: 'Motorista exemplo',
  freightMode: 'ton', client: 'Empresa exemplo', origin: 'Origem', destination: 'Destino',
  netWeight: 30.123, pricePerTon: 20, pricePerTrip: 0,
  freight: 602.46, commissionPct: 0.2, commissionValue: 120.492,
  ...overrides,
});

test('exports each source record, including equal tickets and fixed freights', () => {
  const input = [makeTrip(), makeTrip({ id: 'b' }),
    ...['trip', 'cegonha', 'caixinha'].map((mode, i) => makeTrip({
      id: mode, code: String(i + 1), freightMode: mode,
      netWeight: 0, pricePerTon: 0, pricePerTrip: 500, freight: 500, commissionValue: 100,
    }))];
  const original = JSON.stringify(input);
  const rows = tripDetailRows(input);
  assert.equal(rows.length, 5);
  assert.equal(rows.filter(row => row[1] === '10').length, 2);
  assert.deepEqual(rows.map(row => row[3]), ['Diária', 'Cegonha', 'Caixinha', 'Por tonelada', 'Por tonelada']);
  assert.equal(rows[0][8], null);
  assert.equal(rows[0][9], 500);
  assert.equal(rows[3][7], 30.123);
  assert.equal(rows[3][8], 20);
  assert.equal(rows[3][9], null);
  assert.equal(rows[3][0].toISOString(), '2026-09-01T00:00:00.000Z');
  assert.ok(Math.abs(rows.reduce((sum, row) => sum + row[10], 0) - 2704.92) < 1e-8);
  assert.equal(JSON.stringify(input), original);
});

// ExcelJS surface used by the exporter, to check row addresses and cached totals.
function workbookDouble() {
  const rows = new Map();
  const columns = new Map();
  const sheet = {
    rowCount: 0, mergeCells() {},
    getRow(number) {
      this.rowCount = Math.max(this.rowCount, number);
      if (!rows.has(number)) {
        const cells = new Map();
        rows.set(number, { number, getCell(col) {
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

test('detail formulas reference each row and totals include the last record', () => {
  const sheet = addTripDetailsWorksheet(workbookDouble(), [makeTrip(), makeTrip({ id: 'b', code: '11' })], 'Teste');
  assert.equal(sheet.getCell('K7').value.formula, 'IF(D7="Por tonelada",H7*I7,J7)');
  assert.equal(sheet.getCell('M8').value.formula, 'K8*L8');
  assert.equal(sheet.getCell('N8').value.formula, 'K8-M8');
  assert.deepEqual(sheet.getCell('K9').value, { formula: 'SUM(K7:K8)', result: 1204.92 });
  assert.deepEqual(sheet.autoFilter, { from: 'A6', to: 'N8' });
  assert.equal(sheet.rowCount, 9);
});

test('empty scope has zero totals without a reversed range', () => {
  const sheet = addTripDetailsWorksheet(workbookDouble(), [], 'Nenhum frete');
  assert.deepEqual(sheet.getCell('K7').value, { formula: '0', result: 0 });
});
