import fs from 'node:fs';
import path from 'node:path';

const target = process.argv[2];
if (!target) throw new Error('fix-dashboard-faturamento-liquido: target missing');
const p = path.join(target, 'src/routes/dono/index.tsx');
let s = fs.readFileSync(p, 'utf8');

const oldBlock = `        <Kpi
          label="Após comissões"
          value={painelBrl(effectiveKpis.revenue - kpis.commissions)}
          hint="Cálculo: faturamento − comissão total"
          large
        />`;

const newBlock = `        <Kpi
          label="Faturamento líquido"
          value={painelBrl(
            effectiveKpis.revenue -
              kpis.commissions -
              effectiveKpis.dieselCost -
              (data?.expenses ?? [])
                .filter(
                  (expense) =>
                    expense.category !== "Adiantamento" &&
                    inPeriod(expense.date, period) &&
                    (driverFilter === "all" || expense.driverId === driverFilter),
                )
                .reduce((total, expense) => total + expense.amount, 0),
          )}
          hint="Cálculo: faturamento − comissão total − diesel − despesas"
          large
        />`;

if (!s.includes(newBlock)) {
  if (!s.includes(oldBlock)) throw new Error('fix-dashboard-faturamento-liquido: KPI block not found');
  s = s.replace(oldBlock, newBlock);
}

fs.writeFileSync(p, s);
console.log('[fix-dashboard-faturamento-liquido] Faturamento líquido = faturamento - comissões - diesel - despesas');
