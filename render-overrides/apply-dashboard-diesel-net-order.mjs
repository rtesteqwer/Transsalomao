import fs from 'node:fs';
import path from 'node:path';

const target = process.argv[2];
if (!target) throw new Error('dashboard-diesel-net-order: target missing');

const file = path.join(target, 'src/routes/dono/index.tsx');
let s = fs.readFileSync(file, 'utf8');

const grossResultPattern = /\n\s*<Kpi\n\s*label="Resultado bruto"\n\s*value=\{brl\(effectiveKpis\.grossResult\)\}\n\s*delta=\{deltaOf\(effectiveKpis, prevEffectiveKpis, "grossResult"\)\}\n\s*large\n\s*\/>/;
s = s.replace(grossResultPattern, '');

const totalNet = `        <Kpi\n          label="Total líquido"\n          value={brl(effectiveKpis.afterCommission)}\n          delta={deltaOf(effectiveKpis, prevEffectiveKpis, "afterCommission")}\n          large\n        />`;
const diesel = `        <Kpi\n          label="Custo diesel"\n          value={brl(effectiveKpis.dieselCost)}\n          delta={deltaOf(effectiveKpis, prevEffectiveKpis, "dieselCost")}\n          large\n        />`;

if (!s.includes(totalNet)) throw new Error('dashboard-diesel-net-order: Total líquido não encontrado');
if (!s.includes(diesel)) throw new Error('dashboard-diesel-net-order: Custo diesel não encontrado');

const totalPos = s.indexOf(totalNet);
const dieselPos = s.indexOf(diesel);
if (totalPos < dieselPos) {
  s = s.replace(totalNet, '__TOTAL_LIQUIDO_KPI__');
  s = s.replace(diesel, totalNet);
  s = s.replace('__TOTAL_LIQUIDO_KPI__', diesel);
}

s = s.replace('xl:grid-cols-5', 'xl:grid-cols-4');

if (s.includes('label="Resultado bruto"')) throw new Error('dashboard-diesel-net-order: Resultado bruto ainda está visível');
if (s.indexOf('label="Custo diesel"') > s.indexOf('label="Total líquido"')) {
  throw new Error('dashboard-diesel-net-order: Custo diesel não ficou acima de Total líquido');
}

fs.writeFileSync(file, s);
console.log('[dashboard-diesel-net-order] Resultado bruto removido; Custo diesel acima de Total líquido');
