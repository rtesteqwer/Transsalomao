import fs from 'node:fs';
import path from 'node:path';

const root = process.argv[2];
if (!root) process.exit(0);

function show(rel, matcher, pad = 10, maxBlocks = 30) {
  const p = path.join(root, rel);
  if (!fs.existsSync(p)) return;
  const lines = fs.readFileSync(p, 'utf8').split('\n');
  console.log(`=== INSPECT ${rel} ===`);
  let blocks = 0;
  for (let i = 0; i < lines.length && blocks < maxBlocks; i++) {
    if (!matcher.test(lines[i])) continue;
    const a = Math.max(0, i - pad), b = Math.min(lines.length, i + pad + 1);
    console.log(`--- lines ${a + 1}-${b} ---`);
    console.log(lines.slice(a, b).join('\n'));
    blocks++;
    i = b - 1;
  }
}

show('src/routes/dono/despesas.tsx', /./, 0, 1);
show('src/lib/types.ts', /Expense|expense|Despesa|despesa|commission|Commission|comissao|comissão|Driver|driver/, 12, 40);
show('src/lib/api.ts', /expense|Expense|despesa|Despesa|commission|Commission|comissao|comissão|report|Report/, 14, 50);
show('src/lib/calc.ts', /commission|Commission|comissao|comissão|expense|despesa|driver/, 14, 30);
show('src/routes/dono/totais.tsx', /commission|Commission|comissao|comissão|expense|despesa|driver|motorista/, 14, 35);
show('src/routes/dono/lancamentos.tsx', /commission|Commission|comissao|comissão|expense|despesa|report|relat/, 12, 30);
show('src/lib/pdf.ts', /commission|Commission|comissao|comissão|expense|despesa/, 12, 30);
console.log('[inspect-expenses] done');
