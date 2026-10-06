import fs from 'node:fs';
import path from 'node:path';

const work = process.argv[2];
if (!work || !fs.existsSync(work)) throw new Error('Paid-over label patch: reconstructed work directory is required');

const rel = 'src/routes/dono/pagamentos.tsx';
const file = path.join(work, rel);
if (!fs.existsSync(file)) throw new Error('Paid-over label patch: missing ' + rel);

const original = fs.readFileSync(file, 'utf8');
let next = original
  .replaceAll('PAGO A MAIOR', 'PAGO A MAIS')
  .replaceAll('Pago a maior', 'Pago a mais')
  .replaceAll('pago a maior', 'pago a mais');

if (next === original) throw new Error('Paid-over label patch: target text not found');
fs.writeFileSync(file, next);

console.log('[paid-over-label] "Pago a maior" corrected to "Pago a mais"');
