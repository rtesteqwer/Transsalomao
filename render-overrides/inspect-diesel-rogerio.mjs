import fs from 'node:fs';
import path from 'node:path';

const target = process.argv[2];
if (!target) throw new Error('inspect-diesel-rogerio: target missing');

const files = [
  'src/routes/dono/totais.tsx',
  'src/routes/dono/viagens.tsx',
  'src/lib/use-fleet.ts',
  'src/lib/calc.ts',
];
const needles = [
  'computed', 'periodTrips', 'inPeriod', 'driverFilter', 'exportExcelColorido', 'fuelings',
  'groupedModeRows', 'compactRows', 'useQuery', 'queryKey', 'staleTime', 'refetch',
];
for (const rel of files) {
  const p = path.join(target, rel);
  if (!fs.existsSync(p)) continue;
  const lines = fs.readFileSync(p, 'utf8').split('\n');
  console.log(`=== SYNC INSPECT ${rel} ===`);
  const hits = new Set();
  for (let i = 0; i < lines.length; i += 1) {
    if (needles.some((n) => lines[i].includes(n))) {
      for (let j = Math.max(0, i - 10); j <= Math.min(lines.length - 1, i + 22); j += 1) hits.add(j);
    }
  }
  let last = -2;
  for (const i of [...hits].sort((a,b)=>a-b)) {
    if (i > last + 1) console.log(`--- around line ${i + 1} ---`);
    console.log(`${i + 1}: ${lines[i]}`);
    last = i;
  }
}
