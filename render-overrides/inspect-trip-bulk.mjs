import fs from 'node:fs';
import path from 'node:path';

const target = process.argv[2];
if (!target) throw new Error('target missing');
const files = [
  'src/routes/dono/viagens.tsx',
  'src/lib/api.ts',
  'src/lib/use-fleet.ts',
  'src/components/owner/trip-form.tsx',
  'src/routes/dono/cadastros.tsx',
];
const rx = /(removeTrip|delete.*trip|upsertTrip|trip\.mutate|TripForm|viagens|Editar|Excluir|checkbox|selected|freightPrices|pricePerTon|pricePerTrip|freightMode)/i;
for (const rel of files) {
  const p = path.join(target, rel);
  if (!fs.existsSync(p)) continue;
  const lines = fs.readFileSync(p, 'utf8').split('\n');
  const hit = new Set();
  lines.forEach((line, i) => {
    if (rx.test(line)) for (let j = Math.max(0, i - 5); j <= Math.min(lines.length - 1, i + 10); j++) hit.add(j);
  });
  console.log(`[trip-bulk-inspect] FILE ${rel}`);
  let prev = -2;
  for (const i of [...hit].sort((a,b)=>a-b)) {
    if (i > prev + 1) console.log('[trip-bulk-inspect] ---');
    console.log(`[trip-bulk-inspect] ${i+1}: ${lines[i]}`);
    prev = i;
  }
}
