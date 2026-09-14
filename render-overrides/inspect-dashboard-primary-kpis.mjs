import fs from 'node:fs';
import path from 'node:path';

const target = process.argv[2];
if (!target) throw new Error('inspect-dashboard-primary-kpis: target missing');
const rel = 'src/routes/dono/index.tsx';
const file = path.join(target, rel);
const s = fs.readFileSync(file, 'utf8');
const lines = s.split('\n');
for (let i = 0; i < lines.length; i += 1) {
  if (/Faturamento|Comiss|Resultado bruto|Após comiss|Custo diesel/.test(lines[i])) {
    const start = Math.max(0, i - 8);
    const end = Math.min(lines.length, i + 10);
    console.log(`=== DASHBOARD KPI CONTEXT ${start + 1}-${end} ===`);
    for (let j = start; j < end; j += 1) console.log(`${j + 1}: ${lines[j]}`);
  }
}
