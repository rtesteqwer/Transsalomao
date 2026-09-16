import fs from 'node:fs';
import path from 'node:path';

const target = process.argv[2];
if (!target) throw new Error('request-20260916-finish: target missing');
const file = (rel) => path.join(target, rel);
const read = (rel) => fs.readFileSync(file(rel), 'utf8');
const write = (rel, text) => fs.writeFileSync(file(rel), text);

// Finish dashboard changes without depending on the exact JSX layout produced by older patches.
{
  let s = read('src/routes/dono/index.tsx');
  const revenueAt = s.indexOf('label="Faturamento"');
  if (revenueAt < 0) throw new Error('request-20260916-finish: Faturamento KPI not found');
  const blockStart = s.lastIndexOf('      <div className="mt-6 grid', revenueAt);
  const blockEnd = s.indexOf('\n      </div>', revenueAt);
  if (blockStart < 0 || blockEnd < 0) throw new Error('request-20260916-finish: KPI block bounds not found');
  const mainBlock = `      <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi
          label="Faturamento"
          value={painelBrl(effectiveKpis.revenue)}
          delta={deltaOf(effectiveKpis, prevEffectiveKpis, "revenue")}
          hint="Soma: frete de todas as viagens do período"
          large
        />
        <Kpi
          label="Comissão total"
          value={painelBrl(kpis.commissions)}
          delta={deltaOf(kpis, prevKpis, "commissions")}
          hint="Soma: comissão calculada de cada viagem"
          large
        />
        <Kpi
          label="Custo diesel"
          value={painelBrl(effectiveKpis.dieselCost)}
          delta={deltaOf(effectiveKpis, prevEffectiveKpis, "dieselCost")}
          hint="Soma: litros × preço/L apenas dos abastecimentos Diesel"
          large
        />
        <Kpi
          label="Após comissões"
          value={painelBrl(effectiveKpis.revenue - kpis.commissions)}
          hint="Cálculo: faturamento − comissão total"
          large
        />
      </div>`;
  s = s.slice(0, blockStart) + mainBlock + s.slice(blockEnd + '\n      </div>'.length);

  if (!s.includes('hint?: string;')) {
    s = s.replace('  delta,\n  large,\n}: {', '  delta,\n  large,\n  hint,\n}: {');
    s = s.replace('  delta?: number | null;\n  large?: boolean;\n}) {', '  delta?: number | null;\n  large?: boolean;\n  hint?: string;\n}) {');
    s = s.replace('        {value}\n      </p>\n      {delta != null ? (', '        {value}\n      </p>\n      {hint ? <p className="mt-2 text-[11px] leading-relaxed text-subtle">{hint}</p> : null}\n      {delta != null ? (');
    if (!s.includes('hint?: string;') || !s.includes('{hint ? <p')) throw new Error('request-20260916-finish: Kpi hint support not inserted');
  }

  if (!s.includes('"Combustível", "Conjunto"')) {
    s = s.replace('["Data", "Motorista", "Conjunto", "Posto", "KM", "Litros", "Preço/L", "Custo"]', '["Data", "Motorista", "Combustível", "Conjunto", "Posto", "KM", "Litros", "Preço/L", "Custo"]');
  }
  if (!s.includes('f.fuelType === "arla" ? "ARLA"')) {
    const fleetCell = '<td className="px-3 py-3">{fleet?.name ?? "Conjunto removido"}</td>';
    const at = s.indexOf(fleetCell);
    if (at < 0) throw new Error('request-20260916-finish: dashboard fueling fleet cell not found');
    const fuelCell = '<td className="px-3 py-3">{f.fuelType === "arla" ? "ARLA" : f.fuelType === "gasolina" ? "Gasolina" : "Diesel"}</td>\n                      ';
    s = s.slice(0, at) + fuelCell + s.slice(at);
  }
  write('src/routes/dono/index.tsx', s);
}

// Make ton-mode submit explicit and visible instead of silently doing nothing.
{
  let s = read('src/components/owner/trip-form.tsx');
  if (!s.includes('import { toast } from "sonner";')) {
    s = s.replace('import { useEffect, useMemo, useState } from "react";', 'import { useEffect, useMemo, useState } from "react";\nimport { toast } from "sonner";');
  }
  if (!s.includes('Informe o valor em R$/t antes de lançar no painel.')) {
    const start = '  async function handleSubmit(e: React.FormEvent) {\n    e.preventDefault();\n    await onSubmit({';
    if (!s.includes(start)) throw new Error('request-20260916-finish: trip submit handler not found');
    s = s.replace(start, `  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const netWeight = parseLocaleNumberOrZero(form.netWeight);
    const pricePerTon = parseLocaleNumberOrZero(form.pricePerTon);
    if (!form.driverId) { toast.error("Escolha o motorista."); return; }
    if (!form.fleetId) { toast.error("Escolha o conjunto."); return; }
    if (form.freightMode === "ton" && netWeight <= 0) { toast.error("Informe o peso líquido em toneladas."); return; }
    if (form.freightMode === "ton" && pricePerTon <= 0) { toast.error("Informe o valor em R$/t antes de lançar no painel."); return; }
    await onSubmit({`);
    s = s.replace('      netWeight: parseLocaleNumberOrZero(form.netWeight),\n      freightMode: form.freightMode,\n      tripBillingType: form.tripBillingType,\n      pricePerTon: parseLocaleNumberOrZero(form.pricePerTon),', '      netWeight,\n      freightMode: form.freightMode,\n      tripBillingType: form.freightMode === "ton" ? "weight" : form.tripBillingType,\n      pricePerTon,');
  }
  write('src/components/owner/trip-form.tsx', s);
}

console.log('[request-20260916-finish] dashboard formulas and ton submit finalized');
