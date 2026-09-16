import fs from 'node:fs';
import path from 'node:path';

const target = process.argv[2];
if (!target) throw new Error('request-20260916: target missing');
const file = (rel) => path.join(target, rel);
const read = (rel) => fs.readFileSync(file(rel), 'utf8');
const write = (rel, text) => { fs.mkdirSync(path.dirname(file(rel)), { recursive: true }); fs.writeFileSync(file(rel), text); };
function required(text, needle, replacement, label) {
  if (text.includes(replacement)) return text;
  if (!text.includes(needle)) throw new Error(`request-20260916: pattern not found (${label})`);
  return text.replace(needle, replacement);
}
function regexRequired(text, re, replacement, label) {
  const next = text.replace(re, replacement);
  if (next === text) throw new Error(`request-20260916: regex pattern not found (${label})`);
  return next;
}

// 1) Persist fuel type. Existing records remain Diesel, except an unambiguous historical
// paired low-price fill (typical ARLA) where the same driver/fleet/station/date also has fuel.
write('migrations/0011_fueling_type.sql', `alter table fuelings add column if not exists fuel_type text not null default 'diesel';
update fuelings set fuel_type = 'diesel' where fuel_type is null or fuel_type not in ('diesel','arla','gasolina');
update fuelings f
set fuel_type = 'arla'
where f.fuel_type = 'diesel'
  and f.price_per_liter > 0 and f.price_per_liter < 4
  and f.liters > 0 and f.liters < 100
  and exists (
    select 1 from fuelings f2
    where f2.id <> f.id
      and f2.date = f.date
      and f2.fleet_id = f.fleet_id
      and coalesce(f2.driver_id, '') = coalesce(f.driver_id, '')
      and lower(trim(coalesce(f2.station,''))) = lower(trim(coalesce(f.station,'')))
      and f2.price_per_liter >= 4.5
  );
`);

// 2) Types.
{
  let s = read('src/lib/types.ts');
  if (!s.includes('export type FuelType =')) {
    s = s.replace('export type Fueling = {', 'export type FuelType = "diesel" | "arla" | "gasolina";\n\nexport type Fueling = {');
  }
  if (!s.includes('  fuelType: FuelType;')) {
    s = required(s, '  station: string;\n  km: number;', '  station: string;\n  fuelType: FuelType;\n  km: number;', 'fueling type field');
  }
  write('src/lib/types.ts', s);
}

// 3) API: map, validate and save fuel type; make ton-mode validation explicit.
{
  let s = read('src/lib/api.ts');
  if (!s.includes('fuelType: str(r.fuel_type)')) {
    s = required(s, '    station: str(r.station),\n    km: num(r.km),', '    station: str(r.station),\n    fuelType: str(r.fuel_type) === "arla" ? "arla" : str(r.fuel_type) === "gasolina" ? "gasolina" : "diesel",\n    km: num(r.km),', 'map fueling type');
  }
  if (!s.includes('fuelType: z.enum(["diesel", "arla", "gasolina"])')) {
    s = required(s, '  station: z.string().trim(),\n  km: z.number().min(0),', '  station: z.string().trim(),\n  fuelType: z.enum(["diesel", "arla", "gasolina"]).default("diesel"),\n  km: z.number().min(0),', 'fueling schema type');
  }
  s = required(s,
    'insert into fuelings (id, date, driver_id, fleet_id, station, km, liters, price_per_liter, notes)\n      values (${id}, ${data.date}, ${driverId}, ${data.fleetId}, ${data.station}, ${data.km}, ${data.liters}, ${data.pricePerLiter}, ${data.notes})',
    'insert into fuelings (id, date, driver_id, fleet_id, station, fuel_type, km, liters, price_per_liter, notes)\n      values (${id}, ${data.date}, ${driverId}, ${data.fleetId}, ${data.station}, ${data.fuelType}, ${data.km}, ${data.liters}, ${data.pricePerLiter}, ${data.notes})',
    'fueling insert type');
  if (!s.includes('fuel_type = excluded.fuel_type')) {
    s = required(s, '        station = excluded.station,\n        km = excluded.km,', '        station = excluded.station,\n        fuel_type = excluded.fuel_type,\n        km = excluded.km,', 'fueling update type');
  }
  if (!s.includes('No modo por tonelada, informe um peso líquido maior que zero.')) {
    s = required(s, '    const usesGlobalPrice = data.freightMode !== "ton";', `    if (data.freightMode === "ton" && data.netWeight <= 0) {
      throw new Error("No modo por tonelada, informe um peso líquido maior que zero.");
    }
    if (data.freightMode === "ton" && data.pricePerTon <= 0) {
      throw new Error("No modo por tonelada, informe o valor em R$/t antes de lançar no painel.");
    }
    const usesGlobalPrice = data.freightMode !== "ton";`, 'ton server validation');
  }
  write('src/lib/api.ts', s);
}

// 4) Consumption intervals must never mix Diesel/ARLA/Gasolina.
{
  let s = read('src/lib/calc.ts');
  if (!s.includes('const consumptionKey =')) {
    s = required(s,
      '  for (const fueling of fuelings) {\n    const list = byFleet.get(fueling.fleetId) ?? [];\n    list.push(fueling);\n    byFleet.set(fueling.fleetId, list);\n  }',
      '  for (const fueling of fuelings) {\n    const consumptionKey = `${fueling.fleetId}|${fueling.fuelType ?? "diesel"}`;\n    const list = byFleet.get(consumptionKey) ?? [];\n    list.push(fueling);\n    byFleet.set(consumptionKey, list);\n  }',
      'fuel consumption grouping');
  }
  write('src/lib/calc.ts', s);
}

// 5) Abastecimentos: internal tabs for Diesel, ARLA and Gasolina, and type field in editor.
{
  let s = read('src/routes/dono/abastecimentos.tsx');
  s = s.replace('import { fuelingConsumptionRows, fuelingConsumptionStats } from "@/lib/calc";', 'import { fuelingConsumptionRows } from "@/lib/calc";');
  s = s.replace('import { brl, formatDate, integer, km, kmL, liters } from "@/lib/format";', 'import { brl, formatDate, integer, liters } from "@/lib/format";');
  s = s.replace('import type { Fueling } from "@/lib/types";', 'import type { FuelType, Fueling } from "@/lib/types";');
  if (!s.includes('const [fuelTab, setFuelTab]')) {
    s = required(s, '  const [fleetFilter, setFleetFilter] = useState("all");', '  const [fleetFilter, setFleetFilter] = useState("all");\n  const [fuelTab, setFuelTab] = useState<FuelType>("diesel");', 'fuel tab state');
  }
  s = regexRequired(s,
    /  const rows = useMemo\(\(\) => \{[\s\S]*?\n  \}, \[consumptionRows, fleetFilter\]\);/,
    `  const rows = useMemo(() => {
    return consumptionRows.filter((f) =>
      (fleetFilter === "all" || f.fleetId === fleetFilter) &&
      (f.fuelType ?? "diesel") === fuelTab,
    );
  }, [consumptionRows, fleetFilter, fuelTab]);`,
    'fuel tab rows');
  s = s.replace(/\n  const avgPrice =[^\n]*\n  const consumption = fuelingConsumptionStats\(rows\);/, '');
  if (!s.includes('fuelType: fuelTab,')) {
    s = required(s, '              station: "",\n              km: 0,', '              station: "",\n              fuelType: fuelTab,\n              km: 0,', 'new fueling default type');
  }
  if (!s.includes('setFuelTab("diesel")')) {
    const marker = '      <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">';
    const tabs = `      <div className="mt-6 flex flex-wrap gap-2 rounded-lg border border-border bg-surface p-2 sm:w-fit">
        {(["diesel", "arla", "gasolina"] as FuelType[]).map((type) => (
          <button
            key={type}
            type="button"
            onClick={() => setFuelTab(type)}
            className={\`h-10 rounded-md px-4 text-sm font-semibold ${'${fuelTab === type ? "bg-accent text-accent-fg" : "text-muted hover:text-fg"}'}\`}
          >
            {type === "diesel" ? "Diesel" : type === "arla" ? "ARLA" : "Gasolina"}
          </button>
        ))}
      </div>

      <div className="mt-6 grid gap-3 sm:grid-cols-2">`;
    if (!s.includes(marker)) throw new Error('request-20260916: abastecimentos metric block marker missing');
    s = s.replace(marker, tabs);
    s = s.replace('        <Metric label="KM entre abastecimentos" value={km(consumption.kmDriven)} />\n', '');
  }
  if (!s.includes('value={row.fuelType === "arla"')) {
    s = required(s,
      '                  <Metric label="Odômetro" value={`${integer(row.km)} km`} compact />',
      '                  <Metric label="Combustível" value={row.fuelType === "arla" ? "ARLA" : row.fuelType === "gasolina" ? "Gasolina" : "Diesel"} compact />\n                  <Metric label="Odômetro" value={`${integer(row.km)} km`} compact />',
      'fuel type card');
  }
  if (!s.includes('const [fuelType, setFuelType]')) {
    s = required(s, '  const [station, setStation] = useState("");', '  const [station, setStation] = useState("");\n  const [fuelType, setFuelType] = useState<FuelType>("diesel");', 'dialog type state');
  }
  if (!s.includes('setFuelType(value.fuelType ?? "diesel")')) {
    s = required(s, '    setStation(value.station ?? "");\n    setKmValue', '    setStation(value.station ?? "");\n    setFuelType(value.fuelType ?? "diesel");\n    setKmValue', 'dialog reset type');
  }
  if (!s.includes('fuelType,\n                  km:')) {
    s = required(s, '                  station,\n                  km:', '                  station,\n                  fuelType,\n                  km:', 'dialog submit type');
  }
  if (!s.includes('<Field label="Combustível">')) {
    s = required(s,
      '            <Field label="Conjunto">',
      `            <Field label="Combustível">
              <Select value={fuelType} onChange={(e) => setFuelType(e.target.value as FuelType)} required>
                <option value="diesel">Diesel</option>
                <option value="arla">ARLA</option>
                <option value="gasolina">Gasolina</option>
              </Select>
            </Field>
            <Field label="Conjunto">`,
      'dialog fuel select');
  }
  write('src/routes/dono/abastecimentos.tsx', s);
}

// 6) Painel: real Diesel comes only from Diesel fuelings; remove duplicate Total líquido and show math hints.
{
  let s = read('src/routes/dono/index.tsx');
  if (!s.includes('const dieselFuelings = fuelings.filter')) {
    s = required(s,
      '  const kpis = useMemo(() => aggregateKpis(computed), [computed]);\n  const fuelLiters = fuelings.reduce((acc, f) => acc + f.liters, 0);\n  const fuelCost = fuelings.reduce((acc, f) => acc + f.liters * f.pricePerLiter, 0);\n  const fuelConsumption = useMemo(() => fuelingConsumptionStats(fuelings), [fuelings]);\n  const hasFuelings = fuelings.length > 0;\n  const effectiveKpis: DashboardKpis = {\n    ...kpis,\n    dieselLiters: hasFuelings ? fuelLiters : kpis.dieselLiters,\n    dieselCost: hasFuelings ? fuelCost : kpis.dieselCost,\n    grossResult: hasFuelings ? kpis.revenue - fuelCost : kpis.grossResult,\n    afterCommission: hasFuelings ? kpis.revenue - fuelCost - kpis.commissions : kpis.afterCommission,\n    avgKmL: fuelConsumption.kmPerLiter,\n  };',
      `  const kpis = useMemo(() => aggregateKpis(computed), [computed]);
  const dieselFuelings = fuelings.filter((f) => (f.fuelType ?? "diesel") === "diesel");
  const fuelLiters = dieselFuelings.reduce((acc, f) => acc + f.liters, 0);
  const fuelCost = dieselFuelings.reduce((acc, f) => acc + f.liters * f.pricePerLiter, 0);
  const fuelConsumption = useMemo(() => fuelingConsumptionStats(dieselFuelings), [dieselFuelings]);
  const effectiveKpis: DashboardKpis = {
    ...kpis,
    dieselLiters: fuelLiters,
    dieselCost: fuelCost,
    grossResult: kpis.revenue - fuelCost,
    afterCommission: kpis.revenue - fuelCost - kpis.commissions,
    avgKmL: fuelConsumption.kmPerLiter,
  };`,
      'panel diesel current');
  }
  if (!s.includes('const prevDieselFuelings = prevFuelings.filter')) {
    s = required(s,
      '    if (prevFuelings.length === 0) return { ...prevKpis, avgKmL: null };\n    const litersTotal = prevFuelings.reduce((acc, f) => acc + f.liters, 0);\n    const cost = prevFuelings.reduce((acc, f) => acc + f.liters * f.pricePerLiter, 0);\n    const consumption = fuelingConsumptionStats(prevFuelings);',
      '    const prevDieselFuelings = prevFuelings.filter((f) => (f.fuelType ?? "diesel") === "diesel");\n    const litersTotal = prevDieselFuelings.reduce((acc, f) => acc + f.liters, 0);\n    const cost = prevDieselFuelings.reduce((acc, f) => acc + f.liters * f.pricePerLiter, 0);\n    const consumption = fuelingConsumptionStats(prevDieselFuelings);',
      'panel diesel previous');
  }
  if (!s.includes('hint="Soma: frete de todas as viagens do período"')) {
    s = required(s,
      '          delta={deltaOf(effectiveKpis, prevEffectiveKpis, "revenue")}\n          large',
      '          delta={deltaOf(effectiveKpis, prevEffectiveKpis, "revenue")}\n          hint="Soma: frete de todas as viagens do período"\n          large',
      'faturamento hint');
  }
  if (!s.includes('hint="Soma: comissão calculada de cada viagem"')) {
    s = required(s,
      '          delta={deltaOf(kpis, prevKpis, "commissions")}\n          large',
      '          delta={deltaOf(kpis, prevKpis, "commissions")}\n          hint="Soma: comissão calculada de cada viagem"\n          large',
      'commission hint');
  }
  if (!s.includes('hint="Soma: litros × preço/L apenas dos abastecimentos Diesel"')) {
    s = required(s,
      '          delta={deltaOf(effectiveKpis, prevEffectiveKpis, "dieselCost")}\n          large',
      '          delta={deltaOf(effectiveKpis, prevEffectiveKpis, "dieselCost")}\n          hint="Soma: litros × preço/L apenas dos abastecimentos Diesel"\n          large',
      'diesel hint');
  }
  if (s.includes('          label="Total líquido"')) {
    s = regexRequired(s,
      /        <Kpi\n          label="Total líquido"[\s\S]*?        \/>/,
      `        <Kpi
          label="Após comissões"
          value={painelBrl(effectiveKpis.revenue - kpis.commissions)}
          hint="Cálculo: faturamento − comissão total"
          large
        />`,
      'remove total liquido KPI');
  }
  s = s.replaceAll('>Total líquido<', '>Após comissão<');
  if (!s.includes('hint?: string;')) {
    s = required(s, '  delta,\n  large,\n}: {\n  label: string;\n  value: string;\n  delta?: number | null;\n  large?: boolean;', '  delta,\n  large,\n  hint,\n}: {\n  label: string;\n  value: string;\n  delta?: number | null;\n  large?: boolean;\n  hint?: string;', 'Kpi hint props');
    s = required(s, '        {value}\n      </p>\n      {delta != null ? (', '        {value}\n      </p>\n      {hint ? <p className="mt-2 text-[11px] leading-relaxed text-subtle">{hint}</p> : null}\n      {delta != null ? (', 'Kpi hint render');
  }
  if (!s.includes('"Combustível", "Posto"')) {
    s = s.replace('["Data", "Motorista", "Conjunto", "Posto", "KM", "Litros", "Preço/L", "Custo"]', '["Data", "Motorista", "Combustível", "Conjunto", "Posto", "KM", "Litros", "Preço/L", "Custo"]');
    s = required(s, '<td className="px-3 py-3">{fleet?.name ?? "Conjunto removido"}</td>\n                      <td className="px-3 py-3">{f.station || "—"}</td>', '<td className="px-3 py-3">{f.fuelType === "arla" ? "ARLA" : f.fuelType === "gasolina" ? "Gasolina" : "Diesel"}</td>\n                      <td className="px-3 py-3">{fleet?.name ?? "Conjunto removido"}</td>\n                      <td className="px-3 py-3">{f.station || "—"}</td>', 'panel fueling type cell');
  }
  write('src/routes/dono/index.tsx', s);
}

// 7) Ton-mode submit: never silently fail; tell the operator exactly what is missing.
{
  let s = read('src/components/owner/trip-form.tsx');
  if (!s.includes('import { toast } from "sonner";')) s = s.replace('import { useEffect, useMemo, useState } from "react";', 'import { useEffect, useMemo, useState } from "react";\nimport { toast } from "sonner";');
  if (!s.includes('Informe o valor em R$/t antes de lançar no painel.')) {
    s = required(s, '  async function handleSubmit(e: React.FormEvent) {\n    e.preventDefault();\n    await onSubmit({', `  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const netWeight = parseLocaleNumberOrZero(form.netWeight);
    const pricePerTon = parseLocaleNumberOrZero(form.pricePerTon);
    if (!form.driverId) { toast.error("Escolha o motorista."); return; }
    if (!form.fleetId) { toast.error("Escolha o conjunto."); return; }
    if (form.freightMode === "ton" && netWeight <= 0) { toast.error("Informe o peso líquido em toneladas."); return; }
    if (form.freightMode === "ton" && pricePerTon <= 0) { toast.error("Informe o valor em R$/t antes de lançar no painel."); return; }
    await onSubmit({`, 'trip form validation');
    s = s.replace('      netWeight: parseLocaleNumberOrZero(form.netWeight),\n      freightMode: form.freightMode,\n      tripBillingType: form.tripBillingType,\n      pricePerTon: parseLocaleNumberOrZero(form.pricePerTon),', '      netWeight,\n      freightMode: form.freightMode,\n      tripBillingType: form.freightMode === "ton" ? "weight" : form.tripBillingType,\n      pricePerTon,');
  }
  write('src/components/owner/trip-form.tsx', s);
}

console.log('[request-20260916] fuel types, reports, dashboard formulas and ton submit fixes applied');
