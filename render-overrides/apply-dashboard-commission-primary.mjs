import fs from 'node:fs';
import path from 'node:path';

const target = process.argv[2];
if (!target) throw new Error('dashboard-commission-primary: target missing');
const file = path.join(target, 'src/routes/dono/index.tsx');
let s = fs.readFileSync(file, 'utf8');

const primaryCard = `        <Kpi\n          label="Faturamento"\n          value={brl(effectiveKpis.revenue)}\n          delta={deltaOf(effectiveKpis, prevEffectiveKpis, "revenue")}\n          large\n        />`;
const commissionCard = `        <Kpi\n          label="Comissão total"\n          value={brl(kpis.commissions)}\n          delta={deltaOf(kpis, prevKpis, "commissions")}\n          large\n        />`;

if (!s.includes(commissionCard)) {
  if (!s.includes(primaryCard)) throw new Error('dashboard-commission-primary: faturamento principal não encontrado');
  s = s.replace(primaryCard, `${primaryCard}\n${commissionCard}`);
}

s = s.replace(
  '<div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">',
  '<div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">',
);

// Evita mostrar a mesma comissão duas vezes: o valor passa a ficar apenas no bloco principal.
s = s.replace('        <Kpi label="Comissão total" value={brl(kpis.commissions)} />\n', '');
s = s.replace('        <Kpi label="Comissões" value={brl(kpis.commissions)} />\n', '');

if (!s.includes('label="Comissão total"') || !s.includes('deltaOf(kpis, prevKpis, "commissions")')) {
  throw new Error('dashboard-commission-primary: comissão principal não aplicada');
}
fs.writeFileSync(file, s);
console.log('[dashboard-commission-primary] Comissão total destacada ao lado do Faturamento no Painel');
