import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const target = process.argv[2];
if (!target || !fs.existsSync(target)) throw new Error('fix-daily-reports-commission: target missing');
const file = (rel) => path.join(target, rel);
const read = (rel) => fs.readFileSync(file(rel), 'utf8');
const write = (rel, text) => fs.writeFileSync(file(rel), text);

function replaceAllVisible(rel) {
  if (!fs.existsSync(file(rel))) return;
  let s = read(rel);
  s = s.replaceAll('Modos por viagem', 'Modos fixos');
  s = s.replaceAll('Preço automático — Por viagem', 'Valor da diária');
  s = s.replaceAll('Valor por viagem', 'Valor da diária');
  s = s.replaceAll('Preço por viagem', 'Valor da diária');
  s = s.replaceAll('Por viagem', 'Diárias');
  write(rel, s);
}

// Site-wide user-facing terminology. Internal key `trip` is retained for backwards compatibility.
for (const rel of [
  'src/lib/calc.ts',
  'src/lib/pdf.ts',
  'src/components/owner/trip-form.tsx',
  'src/routes/motorista.tsx',
  'src/routes/dono/index.tsx',
  'src/routes/dono/lancamentos.tsx',
  'src/routes/dono/viagens.tsx',
  'src/routes/dono/totais.tsx',
  'src/routes/dono/cadastros.tsx',
  'src/routes/klebersom.tsx',
]) replaceAllVisible(rel);

// Commission must always be freight × the registered driver percentage, for every freight mode.
{
  const rel = 'src/lib/calc.ts';
  let s = read(rel);
  const universalCommission = /commissionValue\s*=\s*freight\s*\*\s*commissionPct/;
  if (!universalCommission.test(s)) {
    throw new Error('fix-daily-reports-commission: universal commission formula not found in calc.ts');
  }
  // Guard against mode-specific commission overrides in the central calculator.
  const suspicious = /freightMode[^\n]{0,120}commission(?:Pct|Value)|commission(?:Pct|Value)[^\n]{0,120}freightMode/g;
  const hits = s.match(suspicious) ?? [];
  if (hits.length > 0) {
    throw new Error(`fix-daily-reports-commission: mode-specific commission logic detected: ${hits.join(' | ')}`);
  }
  console.log('[daily-commission-audit] commissionValue = freight * registered commissionPct for all modes');
}

// Main PDF: make Daily mode explicit and give it its own value column.
{
  const rel = 'src/lib/pdf.ts';
  let s = read(rel);

  // Mode label may have survived in a local report helper.
  s = s.replace(/String\(mode\) === "trip" \? "Por viagem"/g, 'String(mode) === "trip" ? "Diárias"');

  if (!s.includes('const isDaily = String(trip.freightMode ?? "ton") === "trip";')) {
    const marker = '      const isTon = String(trip.freightMode ?? "ton") === "ton";';
    if (!s.includes(marker)) throw new Error('fix-daily-reports-commission: PDF trip row marker missing');
    s = s.replace(marker, `${marker}\n      const isDaily = String(trip.freightMode ?? "ton") === "trip";`);
  }

  if (!s.includes('isDaily ? brl(Number(trip.pricePerTrip ?? 0)) : "—",')) {
    const marker = '        isTon ? brl(Number(trip.pricePerTon ?? 0)) : "—",\n        brl(Number(trip.freight ?? 0)),';
    if (!s.includes(marker)) throw new Error('fix-daily-reports-commission: PDF value/t row marker missing');
    s = s.replace(marker, '        isTon ? brl(Number(trip.pricePerTon ?? 0)) : "—",\n        isDaily ? brl(Number(trip.pricePerTrip ?? 0)) : "—",\n        brl(Number(trip.freight ?? 0)),');
  }

  s = s.replace(
    'tripRows.push(["TOTAL MOTORISTA", "", "", "", "", "", brl(driverFreight), brl(driverCommission)]);',
    'tripRows.push(["TOTAL MOTORISTA", "", "", "", "", "", "", brl(driverFreight), brl(driverCommission)]);',
  );
  s = s.replace(
    'head: [["Data", "Ticket", "Modalidade", "Descarga", "Toneladas", "Valor/t", "Frete total", "Comissão total"]],',
    'head: [["Data", "Ticket", "Modalidade", "Descarga", "Toneladas", "Valor/t", "Valor da diária", "Frete total", "Comissão total"]],',
  );
  s = s.replace(
    'columnStyles: { 0:{cellWidth:22},1:{cellWidth:20},2:{cellWidth:29},3:{cellWidth:64,halign:"left"},4:{cellWidth:28},5:{cellWidth:28},6:{cellWidth:40},7:{cellWidth:40} },',
    'columnStyles: { 0:{cellWidth:20},1:{cellWidth:16},2:{cellWidth:24},3:{cellWidth:45,halign:"left"},4:{cellWidth:24},5:{cellWidth:24},6:{cellWidth:28},7:{cellWidth:36},8:{cellWidth:36} },',
  );

  const oldHint = 'Comissão a pagar = comissão bruta − adiantamentos | Custo diesel = somente abastecimentos classificados como Diesel';
  const newHint = 'Comissão = frete × % cadastrado do motorista em todas as modalidades | A pagar = bruta − adiantamentos | Diesel = abastecimentos Diesel';
  s = s.replaceAll(oldHint, newHint);

  if (!s.includes('"Valor da diária", "Frete total", "Comissão total"')) {
    throw new Error('fix-daily-reports-commission: PDF Daily column was not applied');
  }
  write(rel, s);
}

// Totals page should not use the old "por viagem" wording for the aggregate of fixed modes.
{
  const rel = 'src/routes/dono/totais.tsx';
  let s = read(rel);
  s = s.replaceAll('Modos por viagem', 'Modos fixos');
  s = s.replaceAll('Por viagem', 'Diárias');
  write(rel, s);
}

// Final audit: no user-facing legacy wording is allowed in the principal screens/reports.
const auditFiles = [
  'src/lib/pdf.ts',
  'src/lib/calc.ts',
  'src/components/owner/trip-form.tsx',
  'src/routes/motorista.tsx',
  'src/routes/dono/lancamentos.tsx',
  'src/routes/dono/viagens.tsx',
  'src/routes/dono/totais.tsx',
  'src/routes/klebersom.tsx',
];
const leftovers = [];
for (const rel of auditFiles) {
  if (!fs.existsSync(file(rel))) continue;
  const s = read(rel);
  if (s.includes('Por viagem')) leftovers.push(`${rel}: Por viagem`);
  if (s.includes('Modos por viagem')) leftovers.push(`${rel}: Modos por viagem`);
}
if (leftovers.length) throw new Error(`fix-daily-reports-commission: legacy labels remain: ${leftovers.join(', ')}`);

console.log('[daily-reports] Diárias standardized in site/PDF; Daily value column added; universal commission audited');

// Excel must be finalized after Daily terminology/commission patches so the latest report structure wins.
const excelPatch = path.join(process.cwd(), 'render-overrides', 'fix-excel-consolidated-grouped-20260916.mjs');
if (!fs.existsSync(excelPatch)) throw new Error('fix-daily-reports-commission: consolidated Excel patch missing');
execFileSync(process.execPath, [excelPatch, target], { cwd: process.cwd(), stdio: 'inherit' });
const excelDriverTabsPatch = path.join(process.cwd(), 'render-overrides', 'fix-excel-driver-tabs-grouped-20260916.mjs');
if (!fs.existsSync(excelDriverTabsPatch)) throw new Error('fix-daily-reports-commission: driver-tab Excel patch missing');
execFileSync(process.execPath, [excelDriverTabsPatch, target], { cwd: process.cwd(), stdio: 'inherit' });
