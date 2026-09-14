import fs from 'node:fs';
import path from 'node:path';

const target = process.argv[2];
if (!target) throw new Error('inspect-advances-pdf: target missing');

const candidates = [
  'src/lib/pdf.ts',
  'src/routes/dono/index.tsx',
  'src/routes/dono/totais.tsx',
  'src/lib/api.ts',
  'src/lib/use-fleet.ts',
];

const needles = ['Adiantamento', 'advances', 'advanceRows', 'quickPdf', 'downloadDriverReportPdf', 'expenses'];
for (const rel of candidates) {
  const p = path.join(target, rel);
  if (!fs.existsSync(p)) continue;
  const text = fs.readFileSync(p, 'utf8');
  console.log(`=== ADVANCE INSPECT ${rel} ===`);
  const lines = text.split('\n');
  const hits = new Set();
  for (let i = 0; i < lines.length; i += 1) {
    if (needles.some((needle) => lines[i].includes(needle))) {
      for (let j = Math.max(0, i - 8); j <= Math.min(lines.length - 1, i + 18); j += 1) hits.add(j);
    }
  }
  const sorted = [...hits].sort((a,b) => a-b);
  let last = -2;
  for (const i of sorted) {
    if (i > last + 1) console.log(`--- around line ${i + 1} ---`);
    console.log(`${i + 1}: ${lines[i]}`);
    last = i;
  }
}
