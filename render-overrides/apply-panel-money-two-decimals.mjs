import fs from 'node:fs';
import path from 'node:path';

const work = process.argv[2];
if (!work) throw new Error('Usage: node apply-panel-money-two-decimals.mjs <workdir>');

const file = path.join(work, 'src/routes/dono/index.tsx');
if (!fs.existsSync(file)) throw new Error(`Painel file not found: ${file}`);

let s = fs.readFileSync(file, 'utf8');

// Keep database/calculation precision intact. Only the owner dashboard money presentation
// is constrained to exactly two decimal places after the comma.
if (!s.includes('function painelBrl(')) {
  const anchor = 'const PERIODS: { key: PeriodKey; label: string }[] = [';
  const idx = s.indexOf(anchor);
  if (idx < 0) throw new Error('PERIODS anchor not found in painel');
  const helper = `function painelBrl(n: number) {\n  if (!Number.isFinite(n)) return "—";\n  return "R$ " + new Intl.NumberFormat("pt-BR", {\n    useGrouping: true,\n    minimumFractionDigits: 2,\n    maximumFractionDigits: 2,\n  }).format(n);\n}\n\n`;
  s = s.slice(0, idx) + helper + s.slice(idx);
}

// Restrict the change to money values rendered on this dashboard page.
s = s.replace(/\bbrl\(/g, 'painelBrl(');

fs.writeFileSync(file, s);
console.log('[panel-money-two-decimals] painel monetary values fixed to exactly 2 decimals');
