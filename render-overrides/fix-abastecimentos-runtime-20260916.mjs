import fs from 'node:fs';
import path from 'node:path';

const target = process.argv[2];
if (!target) throw new Error('fix-abastecimentos-runtime: target missing');
const file = path.join(target, 'src/routes/dono/abastecimentos.tsx');
let s = fs.readFileSync(file, 'utf8');

s = s.replace(
  '        <p className="mt-2 max-w-xl text-sm text-muted">KM/L calculado somente pelos abastecimentos: diferença de odômetro entre abastecimentos consecutivos do mesmo conjunto ÷ litros do abastecimento atual.</p>',
  '        <p className="mt-2 max-w-xl text-sm text-muted">Registre Diesel, ARLA e Gasolina separadamente, mantendo os valores exatamente como informados.</p>'
);

s = s.replace(/\n\s*<Metric label="Preço médio\/L"[^\n]*\/?>/g, '');
s = s.replace(/\n\s*<Metric label="Média KM\/L"[^\n]*\/?>/g, '');
s = s.replace(/\n\s*<Metric label="KM rodado"[^\n]*\/?>/g, '');
s = s.replace(/\n\s*<Metric label="KM\/L"[^\n]*\/?>/g, '');

if (s.includes('avgPrice') || s.includes('consumption.kmPerLiter') || s.includes('km(row.kmSincePrevious)') || s.includes('kmL(row.kmPerLiter)')) {
  throw new Error('fix-abastecimentos-runtime: stale runtime references remain');
}

fs.writeFileSync(file, s);
console.log('[fix-abastecimentos-runtime] stale KM/L and average-price references removed');
