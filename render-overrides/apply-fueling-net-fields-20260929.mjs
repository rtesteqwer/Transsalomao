import fs from 'node:fs';
import path from 'node:path';

const target = path.resolve(process.argv[2] || '');
if (!process.argv[2] || !fs.existsSync(path.join(target, 'src'))) throw new Error('fueling-net-fields: expected reconstructed app');
const patch = (rel, fn) => {
  const p = path.join(target, rel);
  if (!fs.existsSync(p)) throw new Error('fueling-net-fields: missing ' + rel);
  const before = fs.readFileSync(p, 'utf8');
  const after = fn(before);
  if (after !== before) fs.writeFileSync(p, after);
};
const must = (s, before, after, label) => {
  if (s.includes(after)) return s;
  if (!s.includes(before)) throw new Error('fueling-net-fields: pattern not found (' + label + ')');
  return s.replace(before, after);
};

patch('src/lib/types.ts', (s) => must(
  s,
  '  pricePerLiter: number;\n  notes: string;',
  '  pricePerLiter: number;\n  discountAmount: number;\n  totalAmount: number | null;\n  notes: string;',
  'Fueling type',
));

patch('src/lib/api.ts', (source) => {
  let s = source;
  s = must(s,
    '    pricePerLiter: num(r.price_per_liter),\n    notes: str(r.notes),',
    '    pricePerLiter: num(r.price_per_liter),\n    discountAmount: num(r.discount_amount),\n    totalAmount: r.total_amount == null ? null : num(r.total_amount),\n    notes: str(r.notes),',
    'mapFueling fiscal fields');
  s = must(s,
    '  pricePerLiter: z.number().min(0),\n  notes: z.string().trim(),',
    '  pricePerLiter: z.number().min(0),\n  discountAmount: z.number().min(0).optional(),\n  totalAmount: z.number().min(0).nullable().optional(),\n  notes: z.string().trim(),',
    'fueling schema fiscal fields');
  s = must(s,
    '    const driverId = data.driverId?.trim() || null;\n    await sql`\n      insert into fuelings (id, date, driver_id, fleet_id, station, km, liters, price_per_liter, notes)\n      values (${id}, ${data.date}, ${driverId}, ${data.fleetId}, ${data.station}, ${data.km}, ${data.liters}, ${data.pricePerLiter}, ${data.notes})',
    '    const driverId = data.driverId?.trim() || null;\n    const discountAmount = Number(data.discountAmount ?? 0);\n    const computedTotal = Math.max(0, Number(data.liters) * Number(data.pricePerLiter) - discountAmount);\n    const totalAmount = data.totalAmount == null ? computedTotal : Number(data.totalAmount);\n    await sql`\n      insert into fuelings (id, date, driver_id, fleet_id, station, km, liters, price_per_liter, discount_amount, total_amount, notes)\n      values (${id}, ${data.date}, ${driverId}, ${data.fleetId}, ${data.station}, ${data.km}, ${data.liters}, ${data.pricePerLiter}, ${discountAmount}, ${totalAmount}, ${data.notes})',
    'upsert fueling insert fiscal fields');
  s = must(s,
    '        liters = excluded.liters,\n        price_per_liter = excluded.price_per_liter,\n        notes = excluded.notes',
    '        liters = excluded.liters,\n        price_per_liter = excluded.price_per_liter,\n        discount_amount = excluded.discount_amount,\n        total_amount = excluded.total_amount,\n        notes = excluded.notes',
    'upsert fueling update fiscal fields');
  return s;
});

patch('src/routes/dono/abastecimentos.tsx', (source) => {
  let s = source;
  if (!s.includes('const paidFuelingTotal =')) {
    s = must(s,
      'type Draft = Partial<Fueling>;\n',
      'type Draft = Partial<Fueling>;\n\nconst paidFuelingTotal = (row: Pick<Fueling, "liters" | "pricePerLiter" | "discountAmount" | "totalAmount">) => {\n  if (row.totalAmount != null && Number.isFinite(Number(row.totalAmount))) return Number(row.totalAmount);\n  return Math.max(0, Number(row.liters ?? 0) * Number(row.pricePerLiter ?? 0) - Number(row.discountAmount ?? 0));\n};\n',
      'paid total helper');
  }
  s = must(s,
    '  const totalCost = rows.reduce((sum, row) => sum + row.liters * row.pricePerLiter, 0);\n  const avgPrice = totalLiters > 0 ? totalCost / totalLiters : 0;',
    '  const totalCost = rows.reduce((sum, row) => sum + paidFuelingTotal(row), 0);\n  const grossCost = rows.reduce((sum, row) => sum + row.liters * row.pricePerLiter, 0);\n  const avgPrice = totalLiters > 0 ? grossCost / totalLiters : 0;',
    'fueling totals');
  s = must(s,
    '              pricePerLiter: 0,\n              notes: "",',
    '              pricePerLiter: 0,\n              discountAmount: 0,\n              totalAmount: null,\n              notes: "",',
    'new fueling defaults');
  s = must(s,
    '                <dl className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">',
    '                <dl className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">',
    'fueling metrics grid');
  s = must(s,
    '                  <Metric label="Preço/L" value={brl(row.pricePerLiter)} compact />\n                  <Metric label="Total" value={brl(row.liters * row.pricePerLiter)} compact />',
    '                  <Metric label="Preço/L" value={brl(row.pricePerLiter)} compact />\n                  <Metric label="Desconto" value={brl(row.discountAmount ?? 0)} compact />\n                  <Metric label="Total após desconto" value={brl(paidFuelingTotal(row))} compact />',
    'fueling card fiscal metrics');
  s = must(s,
    '  const [priceValue, setPriceValue] = useState("");\n  const [notes, setNotes] = useState("");',
    '  const [priceValue, setPriceValue] = useState("");\n  const [discountValue, setDiscountValue] = useState("");\n  const [totalValue, setTotalValue] = useState("");\n  const [notes, setNotes] = useState("");',
    'dialog fiscal state');
  s = must(s,
    '    setPriceValue(value.pricePerLiter ? String(value.pricePerLiter) : "");\n    setNotes(value.notes ?? "");',
    '    setPriceValue(value.pricePerLiter ? String(value.pricePerLiter) : "");\n    setDiscountValue(value.discountAmount ? String(value.discountAmount) : "");\n    setTotalValue(value.totalAmount != null ? String(value.totalAmount) : "");\n    setNotes(value.notes ?? "");',
    'dialog fiscal reset');
  s = must(s,
    '                  pricePerLiter: parseLocaleNumberOrZero(priceValue),\n                  notes,',
    '                  pricePerLiter: parseLocaleNumberOrZero(priceValue),\n                  discountAmount: parseLocaleNumberOrZero(discountValue),\n                  totalAmount: totalValue.trim() ? parseLocaleNumberOrZero(totalValue) : null,\n                  notes,',
    'dialog fiscal submit');
  s = must(s,
    '            <Field label="Observação"><Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Opcional" /></Field>',
    '            <div className="grid gap-3 sm:grid-cols-2">\n              <Field label="Desconto"><Input inputMode="decimal" value={discountValue} onChange={(e) => setDiscountValue(e.target.value)} placeholder="0,00" /></Field>\n              <Field label="Total após desconto"><Input inputMode="decimal" value={totalValue} onChange={(e) => setTotalValue(e.target.value)} placeholder="Valor final pago" /></Field>\n            </div>\n            <Field label="Observação"><Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Opcional" /></Field>',
    'dialog fiscal fields');
  return s;
});

console.log('[fueling-net-fields] discount + final paid total enabled in main fueling model/API/UI');
