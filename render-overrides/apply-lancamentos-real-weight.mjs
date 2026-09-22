import fs from 'node:fs';
import path from 'node:path';

const target = process.argv[2];
if (!target || !fs.existsSync(target)) throw new Error('lancamentos-real-weight: target missing');

const rel = 'src/routes/dono/lancamentos.tsx';
const file = path.join(target, rel);
if (!fs.existsSync(file)) throw new Error(`lancamentos-real-weight: missing ${rel}`);

let s = fs.readFileSync(file, 'utf8');
const before = s;

// Peso de carga é controlado em toneladas com precisão de 3 casas (kg).
// Não usar 2 casas no histórico, porque isso arredonda o valor real salvo.
const exactTons = 'new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 3, maximumFractionDigits: 3 }).format(Number(r.tons ?? 0))';

s = s.replace(/num\(r\.tons,\s*\d+\)/g, exactTons);
s = s.replace(/Math\.round\(r\.tons\)/g, exactTons);
s = s.replace(/Number\(r\.tons\)\.toFixed\(\d+\)/g, exactTons);
s = s.replace(/r\.tons\.toFixed\(\d+\)/g, exactTons);

if (s === before) {
  throw new Error('lancamentos-real-weight: tons display pattern not found');
}

fs.writeFileSync(file, s);
console.log('[lancamentos-real-weight] histórico e lançamentos exibem toneladas com 3 casas decimais, sem arredondamento para 2 casas');
