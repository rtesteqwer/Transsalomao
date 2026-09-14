import fs from 'node:fs';
import path from 'node:path';

const root = process.argv[2];
if (!root) process.exit(0);

function read(rel) {
  const p = path.join(root, rel);
  return fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : '';
}
function emit(label, text, size = 2200) {
  const flat = text.replace(/\r/g, '').replace(/\n/g, ' ⏎ ');
  for (let i = 0, n = 0; i < flat.length; i += size, n++) {
    console.log(`[INSPECT:${label}:${n}] ${flat.slice(i, i + size)}`);
  }
}
function around(rel, needle, before = 1200, after = 2800) {
  const s = read(rel);
  const i = s.indexOf(needle);
  if (i < 0) return `NOT_FOUND ${needle}`;
  return s.slice(Math.max(0, i - before), Math.min(s.length, i + needle.length + after));
}

emit('DESPESAS', read('src/routes/dono/despesas.tsx'));
emit('EXPENSE_SCHEMA', around('src/lib/api.ts', 'const expenseSchema', 200, 3600));
emit('UPSERT_EXPENSE', around('src/lib/api.ts', 'export const upsertExpense', 300, 5200));
emit('TYPES_EXPENSE', around('src/lib/types.ts', 'export interface Expense', 1800, 2600));
emit('CALC_EXPENSE_LABEL', around('src/lib/calc.ts', 'export function expenseLabel', 500, 2200));
emit('TOTAIS_DRIVER_AGG', around('src/routes/dono/totais.tsx', 'commissionSum', 2600, 6500));
emit('TOTAIS_EXPENSES', around('src/routes/dono/totais.tsx', 'expenses', 2600, 6500));
emit('TOTAIS_PDF', around('src/routes/dono/totais.tsx', 'download', 2200, 6500));
emit('PDF_TRIP', around('src/lib/pdf.ts', 'commissionValue', 2200, 4200));
console.log('[inspect-expenses] refined done');
