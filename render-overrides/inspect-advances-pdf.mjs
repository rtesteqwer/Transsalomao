import fs from 'node:fs';
import path from 'node:path';

const target = process.argv[2];
if (!target) throw new Error('inspect-advances-pdf: target missing');

function dump(rel, start, end) {
  const p = path.join(target, rel);
  if (!fs.existsSync(p)) return;
  const lines = fs.readFileSync(p, 'utf8').split('\n');
  console.log(`=== ADVANCE DETAIL ${rel} ${start}-${end} ===`);
  for (let i = start - 1; i < Math.min(lines.length, end); i += 1) console.log(`${i + 1}: ${lines[i]}`);
}

dump('src/lib/pdf.ts', 436, 700);
dump('src/routes/dono/totais.tsx', 80, 190);
