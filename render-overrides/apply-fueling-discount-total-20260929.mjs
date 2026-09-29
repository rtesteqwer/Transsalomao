import fs from 'node:fs';
import path from 'node:path';

const target = path.resolve(process.argv[2] || '');
if (!process.argv[2] || !fs.existsSync(path.join(target, 'src'))) {
  throw new Error('fueling-discount-total: expected reconstructed app directory');
}
const file = (rel) => path.join(target, rel);
const patch = (rel, transform) => {
  const p = file(rel);
  if (!fs.existsSync(p)) throw new Error('fueling-discount-total: missing ' + rel);
  const before = fs.readFileSync(p, 'utf8');
  const after = transform(before);
  if (after === before) console.log('[fueling-discount-total] unchanged ' + rel);
  else fs.writeFileSync(p, after);
};
const must = (text, before, after, label) => {
  if (text.includes(after)) return text;
  if (!text.includes(before)) throw new Error('fueling-discount-total: pattern not found (' + label + ')');
  return text.replace(before, after);
};

patch('src/lib/types.ts', (s) => must(
  s,
  '  pricePerLiter: number;\n  notes: string;',
  '  pricePerLiter: number;\n  discountAmount: number;\n  totalAmount: number | null;\n  notes: string;',
  'Fueling type',
));

patch('src/lib/api.ts', (source) => {
  let s = source;
  s = must(
    s,
    '    pricePerLiter: num(r.price_per_liter),\n    notes: str(r.notes),',
    '    pricePerLiter: num(r.price_per_liter),\n    discountAmount: num(r.discount_amount),\n    totalAmount: r.total_amount == null ? null : num(r.total_amount),\n    notes: str(r.notes),',
    'mapFueling totals',
  );
  s = must(
    s,
    '  pricePerLiter: z.number().min(0),\n  notes: z.string().trim(),',
    '  pricePerLiter: z.number().min(0),\n  discountAmount: z.number().min(0).optional(),\n  totalAmount: z.number().min(0).nullable().optional(),\n  notes: z.string().trim(),',
    'fueling schema totals',
  );
  s = must(
    s,
    '    const driverId = data.driverId?.trim() || null;\n    await sql`\n      insert into fuelings (id, date, driver_id, fleet_id, station, km, liters, price_per_liter, notes)
      values (${id}, ${data.date}, ${driverId}, ${data.fleetId}, ${data.station}, ${data.km}, ${data.liters}, ${data.pricePerLiter}, ${data.notes})\n      on conflict (id) do update set',
    '    const driverId = data.driverId?.trim() || null;\n    const discountAmount = Number(data.discountAmount ?? 0);\n    const computedTotal = Math.max(0, Number(data.liters) * Number(data.pricePerLiter) - discountAmount);\n    const totalAmount = data.totalAmount == null ? computedTotal : Number(data.totalAmount);\n    await sql`\n      insert into fuelings (id, date, driver_id, fleet_id, station, km, liters, price_per_liter, discount_amount, total_amount, notes)
      values (${id}, ${data.date}, ${driverId}, ${data.fleetId}, ${data.station}, ${data.km}, ${data.liters}, ${data.pricePerLiter}, ${discountAmount}, ${totalAmount}, ${data.notes})\n      on conflict (id) do update set',
    'upsert fueling insert totals',
  );
  s = must(
    s,
    '        price_per_liter = excluded.price_per_liter,\n        notes = excluded.notes',
    '        price_per_liter = excluded.price_per_liter,\n        discount_amount = excluded.discount_amount,\n        total_amount = excluded.total_amount,\n        notes = excluded.notes',
    'upsert fueling update totals',
  );
  return s;
});

patch('src/routes/dono/abastecimentos.tsx', (source) => {
  let s = source;
  if (!s.includes('const paidFuelingTotal =')) {
    s = must(
      s,
      'type Draft = Partial<Fueling>;\n',
      'type Draft = Partial<Fueling>;\n\nconst paidFuelingTotal = (row: Pick<Fueling, "liters" | "pricePerLiter" | "discountAmount" | "totalAmount">) => {\n  if (row.totalAmount != null && Number.isFinite(Number(row.totalAmount))) return Number(row.totalAmount);\n  return Math.max(0, Number(row.liters ?? 0) * Number(row.pricePerLiter ?? 0) - Number(row.discountAmount ?? 0));\n};\n',
      'abastecimentos paid total helper',
    );
  }
  s = must(
    s,
    '  const totalCost = rows.reduce((sum, row) => sum + row.liters * row.pricePerLiter, 0);\n  const avgPrice = totalLiters > 0 ? totalCost / totalLiters : 0;',
    '  const totalCost = rows.reduce((sum, row) => sum + paidFuelingTotal(row), 0);\n  const grossCost = rows.reduce((sum, row) => sum + row.liters * row.pricePerLiter, 0);\n  const avgPrice = totalLiters > 0 ? grossCost / totalLiters : 0;',
    'abastecimentos totals',
  );
  s = must(
    s,
     '              pricePerLiter: 0,\n              notes: "",',
     '              pricePerLiter: 0,\n              discountAmount: 0,\n              totalAmount: null,\n              notes: "",',
    'new fueling defaults',
  );
  s = must(
    s,
     '                <dl className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">',
     '                <dl className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">',
     'fueling card grid',
  );
  s = must(
    s,
    '                  <Metric label="Preço/L" value={brl(row.pricePerLiter)} compact />\n                  <Metric label="Total" value={brl(row.liters * row.pricePerLiter)} compact />',
    '                  <Metric label="Preço/L" value={brl(row.pricePerLiter)} compact />\n                  <Metric label="Desconto" value={brl(row.discountAmount ?? 0)} compact />\n                  <Metric label="Total após desconto" value={brl(paidFuelingTotal(row))} compact />',
    'fueling card fiscal values',
  );
  s = must(
    s,
     '  const [priceValue, setPriceValue] = useState("");\n  const [notes, setNotes] = useState("");',
    '  const [priceValue, setPriceValue] = useState("");\n  const [discountValue, setDiscountValue] = useState("");\n  const [totalValue, setTotalValue] = useState("");\n  const [notes, setNotes] = useState("");',
    'dialog fiscal state',
  );
  s = must(
    s,
    '    setPriceValue(value.pricePerLiter ? String(value.pricePerLiter) : "");\n    setNotes(value.notes ?? "");',
    '    setPriceValue(value.pricePerLiter ? String(value.pricePerLiter) : "");\n    setDiscountValue(value.discountAmount ? String(value.discountAmount) : "");\n    setTotalValue(value.totalAmount != null ? String(value.totalAmount) : "");\n    setNotes(value.notes ?? "");',
    'dialog fiscal reset',
  );
  s = must(
    s,
    '                  pricePerLiter: parseLocaleNumberOrZero(priceValue),\n                  notes,',
     '                  pricePerLiter: parseLocaleNumberOrZero(priceValue),\n                  discountAmount: parseLocaleNumberOrZero(discountValue),\n                  totalAmount: totalValue.trim() ? parseLocaleNumberOrZero(totalValue) : null,\n                  notes,',
    'dialog fiscal submit',
  );
  s = must(
    s,
     '            <div className="grid grid-cols-3 gap-3">\n              <Field label="KM"><Input inputMode="numeric" value={kmValue} onChange={(e) => setKmValue(e.target.value)} /></Field>\n              <Field label="Litros"><Input inputMode="decimal" value={litersValue} onChange={(e) => setLitersValue(e.target.value)} required /></Field>\n              <Field label="Preço/L"><Input inputMode="decimal" value={priceValue} onChange={(e) => setPriceValue(e.target.value)} /></Field>\n            </div>',
     '            <div className="grid gap-3 sm:grid-cols-2">\n              <Field label="Desconto"><Input inputMode="decimal" value={discountValue} onChange={(e) => setDiscountValue(e.target.value)} placeholder="0,00" /></Field>\n              <Field label="Total após desconto"><Input inputMode="decimal" value={totalValue} onChange={(e) => setTotalValue(e.target.value)} placeholder="Valor final pago" /></Field>\n            </div>',
    'dialog fiscal fields',
  );
  return s;
});

patch('src/routes/dono/totais.tsx', (source) => {
  let s = source;
  if (!s.includes('const fuelingPaidTotal =')) {
    const marker = 'export const Route =';
    if (!s.includes(marker)) throw new Error('fueling-discount-total: totals route marker missing');
    s = s.replace(marker, 'const fuelingPaidTotal = (f: any) => f?.totalAmount != null ? Number(f.totalAmount) : Math.max(0, Number(f?.liters ?? 0) * Number(f?.pricePerLiter ?? 0) - Number(f?.discountAmount ?? 0));\n\n' + marker);
  }
  s = s.replaceAll('f.liters * f.pricePerLiter', 'fuelingPaidTotal(f)');
  s = s.replaceAll('row.liters * row.pricePerLiter', 'fuelingPaidTotal(row)');
  s = s.replace(
    '    const cost = fuelings.reduce((acc, f) => acc + fuelingPaidTotal(f), 0);\n    const consumption = fuelingConsumptionStats(fuelings);',
    '    const cost = fuelings.reduce((acc, f) => acc + fuelingPaidTotal(f), 0);\n    const grossCost = fuelings.reduce((acc, f) => acc + Number(f.liters ?? 0) * Number(f.pricePerLiter ?? 0), 0);\n    const consumption = fuelingConsumptionStats(fuelings);',
  );
  s = s.replaceAll('      avgPrice: litersTotal > 0 ? cost / litersTotal : null,', '      avgPrice: litersTotal > 0 ? grossCost / litersTotal : null,');
  s = s.replace(
    '    const cost = rows.reduce((acc, f) => acc + fuelingPaidTotal(f), 0);\n    const consumption = fuelingConsumptionStats(rows);',
    '    const cost = rows.reduce((acc, f) => acc + fuelingPaidTotal(f), 0);\n    const grossCost = rows.reduce((acc, f) => acc + Number(f.liters ?? 0) * Number(f.pricePerLiter ?? 0), 0);\n    consumption = fuelingConsumptionStats(rows);',
  );
  const oldHead = '["Data", "Motorista", "Conjunto", "Placas", "Posto", "KM", "KM rodado", "Litros", "KM/L", "Preço/L", "Custo"]';
  const newHead = '["Data", "Motorista", "Conjunto", "Placas", "Posto", "KM", "KM rodado", "Litros", "KM/L", "Preço/L", "Desconto", "Total após desconto"]';
  if (s.includes(oldHead)) s = s.replace(oldHead, newHead);
  s = s.replace('colSpan={11}', 'colSpan={12}');
  const priceCell = '<td className="px-3 py-3 tabular">{brl(f.pricePerLiter)}</td>\n                    <td className="px-3 py-3 tabular">{brl(fuelingPaidTotal(f))}</td>';
  if (s.includes(priceCell)) {
    s = s.replace(priceCell, '<td className="px-3 py-3 tabular">{brl(f.pricePerLiter)}</td>\n                    <td className="px-3 py-3 py-3 tabular">{brl(f.discountAmount ?? 0)}</td>\n                    <td className="px-3 py-3 tabular">{brl(fuelingPaidTotal(f))}</td>');
  }
  return s;
});

patch('src/lib/pdf.ts', (source) => {
  let s = source;
  if (!s.includes('function fuelingPaidTotal(')) {
    const marker = 'function drawSummary(page: PdfPage, trips: ComputedTrip[], fuelings: ReportFueling[]) {';
    if (!s.includes(marker)) throw new Error('fueling-discount-total: pdf summary marker missing');
    s = s.replace(marker, 'function fuelingPaidTotal(f: any) {\n  return f?.totalAmount != null ? Number(f.totalAmount) : Math.max(0, Number(f?.liters ?? 0) * Number(f?.pricePerLiter ?? 0) - Number(f?.discountAmount ?? 0));\n}\n\n' + marker);
  }
  s = s.replaceAll('f.liters * f.pricePerLiter', 'fuelingPaidTotal(f)');
  s = s.replaceAll('fueling.liters * fueling.pricePerLiter', 'fuelingPaidTotal(fueling)');
  s = s.replaceAll('Number(item.liters ?? 0) * Number(item.pricePerLiter ?? 0)', 'fuelingPaidTotal(item)');
  s = s.replaceAll('Number(fueling.liters ?? 0) * Number(fueling.pricePerLiter ?? 0)', 'fuelingPaidTotal(fueling)');
  s = s.replaceAll('Number(f.liters ?? 0) * Number(f.pricePerLiter ?? 0)', 'fuelingPaidTotal(f)');
  s = s.replace(
    'addDetailTable("ABASTECIMENTOS / CUSTO DIESEL", ["Data", "Motorista", "Posto", "Litros", "Preço/L", "Custo diesel"], fuelings.map((f: any) => [formatDate(f.date), f.driverName ?? "Sem motorista", f.station ?? "—", liters(Number(f.liters ?? 0)), brl(Number(f.pricePerLiter ?? 0)), brl(fuelingPaidTotal(f))]));',
    'addDetailTable("ABASTECIMENTOS / CUSTO DIESEL", ["Data", "Motorista", "Posto", "Litros", "Preço/L", "Desconto", "Total após desconto"], fuelings.map((f: any) => [formatDate(f.date), f.driverName ?? "Sem motorista", f.station ?? "—", liters(Number(f.liters ?? 0)), brl(Number(f.pricePerLiter ?? 0)), brl(Number(f.discountAmount ?? 0)), brl(fuelingPaidTotal(f))]));',
  );
  return s;
});

patch('src/lib/excel-report.ts', (source) => {
  let s = source;
  if (!s.includes('const fuelingPaidTotal = (f: any) =>')) {
    const marker = 'export async function downloadFleetExcel';
    if (!s.includes(marker)) throw new Error('fueling-discount-total: excel marker missing');
    s = s.replace(marker, 'const fuelingPaidTotal = (f: any) => f?.totalAmount != null ? Number(f.totalAmount) : Math.max(0, Number(f?.liters ?? 0) * Number(f?.pricePerLiter ?? 0) - Number(f?.discountAmount ?? 0));\n\n' + marker);
  }
  s = s.replaceAll('Number(f.liters ?? 0) * Number(f.pricePerLiter ?? 0)', 'fuelingPaidTotal(f)');
  s = s.replaceAll('Number(fueling.liters ?? 0) * Number(fueling.pricePerLiter ?? 0)', 'fuelingPaidTotal(fueling)');
  s = s.replace(
    `addSection("ABASTECIMENTOS / CUSTO DIESELL", ["Data", "Motorista", "Posto", "Litros", "Preço/L", "Custo diesel"]);
    excelFuelings.forEach((f: any, index: number) => { const row = sheet.addRow([formatDate(f.date), f.driverName ?? (data?.drivers ?? []).find((d: any) => d.id === f.driverId)?.name ?? "Sem motorista", f.station ?? "—", Number(f.liters ?? 0), Number(f.pricePerLiter ?? 0), fuelingPaidTotal(f)]); styleRow(row, index); row.getCell(4).numFmt = '0.00 "L"s'; row.getCell(5).numFmt = row.getCell(6).numFmt = 'R$ #,##0.00'; });`,
    `addSection("ABASTECIMENTOS / CUSTO DIESEL", ["Data", "Motorista", "Posto", "Litros", "Preço/L", "Desconto", "Total após desconto"]);
    excelFuelings.forEach((f: any, index: number) => { const row = sheet.addRow([formatDate(f.date), f.driverName ?? (data?.drivers ?? []).find((d: any) => d.id === f.driverId)?.name ?? "Sem motorista", f.station ?? "—", Number(f.liters ?? 0), Number(f.pricePerLiter ?? 0), Number(f.discountAmount ?? 0), fuelingPaidTotal(f)]); styleRow(row, index); row.getCell(4).numFmt = '0.00 "L"'; row.getCell(5).numFmt = row.getCell(6).numFmt = row.getCell(7).numFmt = 'R$ #,##0.00'; });`,
  );
  return s;
});

patch('src/lib/klebersom-access.server.ts', (source) => {
  let s = source;
  s = must(
    s,
    '        pricePerLiter,\n        amount: liters * pricePerLiter,',
    '        pricePerLiter,\n        discountAmount: numberValue(row.discount_amount),\n        totalAmount: row.total_amount == null ? null : numberValue(row.total_amount),\n        amount: row.total_amount == null ? Math.max(0, liters * pricePerLiter - numberValue(row.discount_amount)) : numberValue(row.total_amount),',
    'driver fueling fiscal values',
  );
  return s;
});

console.log('[fueling-discount-total] discount + net total persisted and used across Abastecimentos/reports');
