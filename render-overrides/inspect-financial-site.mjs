import fs from 'node:fs';
import path from 'node:path';

const target = process.argv[2];
if (!target) throw new Error('inspect-financial-site: target missing');

const files = [
  'src/routes/dono/index.tsx',
  'src/routes/dono/despesas.tsx',
  'src/routes/dono/cadastros.tsx',
  'src/routes/dono/viagens.tsx',
  'src/lib/calc.ts',
  'src/lib/api.ts',
  'src/lib/types.ts',
];
const needles = ['commission','comissão','Despesas','tractorTotal','trailerTotal','Adiantamento','freightPrices','Preços','groupedModeRows','grossResult','dieselCost','totalExpenses','billing'];
for (const rel of files) {
  const p = path.join(target, rel);
  if (!fs.existsSync(p)) continue;
  const lines = fs.readFileSync(p, 'utf8').split('\n');
  console.log(`=== FINANCIAL INSPECT ${rel} ===`);
  const hit = new Set();
  lines.forEach((line, i) => {
    if (needles.some((n) => line.toLowerCase().includes(n.toLowerCase()))) {
      for (let j = Math.max(0, i - 4); j <= Math.min(lines.length - 1, i + 8); j++) hit.add(j);
    }
  });
  let prev = -2;
  for (const i of [...hit].sort((a,b)=>a-b)) {
    if (i > prev + 1) console.log(`--- around ${i+1} ---`);
    console.log(`${i+1}: ${lines[i]}`);
    prev = i;
  }
}
