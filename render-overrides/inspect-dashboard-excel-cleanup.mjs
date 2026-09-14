import fs from 'node:fs';
import path from 'node:path';

const target = process.argv[2];
if (!target) throw new Error('inspect-dashboard-excel-cleanup: target missing');

const files = [
  path.join(target, 'src/routes/dono/index.tsx'),
  path.join(process.cwd(), 'render-overrides', 'admin-excel.snippet.ts'),
];
const terms = ['KM total', 'Peso bruto', 'Preço médio por litro', 'Preço médio por litros', 'Média KM/L', 'Frete × diesel', 'TOTAL DE COMISSÃO POR MOTORISTA', 'const headers ='];
for (const file of files) {
  const s = fs.readFileSync(file, 'utf8');
  console.log(`\n[inspect-dashboard-excel-cleanup] FILE ${file}`);
  for (const term of terms) {
    let i = s.indexOf(term);
    if (i < 0) continue;
    console.log(`\n--- ${term} ---\n${s.slice(Math.max(0, i - 700), Math.min(s.length, i + 1200))}\n--- end ${term} ---`);
  }
}
