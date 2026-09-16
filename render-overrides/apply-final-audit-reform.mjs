import fs from 'node:fs';
import path from 'node:path';

const target = process.argv[2];
if (!target) throw new Error('final-audit-reform: target missing');

function edit(rel, transform) {
  const file = path.join(target, rel);
  const before = fs.readFileSync(file, 'utf8');
  const after = transform(before);
  if (after === before) console.log(`[final-audit-reform] no changes: ${rel}`);
  fs.writeFileSync(file, after);
}

edit('src/lib/format.ts', (s) => {
  const start = s.indexOf('const brlFmt =');
  const end = s.indexOf('export function formatDate(');
  if (start < 0 || end < 0) throw new Error('format anchors missing');
  const exact = `function exactNumber(n: number, minimumFractionDigits = 0) {\n  if (!Number.isFinite(n)) return "—";\n  return new Intl.NumberFormat("pt-BR", {\n    useGrouping: true,\n    minimumFractionDigits,\n    maximumFractionDigits: 12,\n  }).format(n);\n}\n\nexport function brl(n: number) { return "R$ " + exactNumber(n, 2); }\nexport function num(n: number, digits = 0) { return exactNumber(n, digits); }\nexport function numLoose(n: number) { return exactNumber(n); }\nexport function num1(n: number) { return exactNumber(n); }\nexport function integer(n: number) { return exactNumber(n); }\nexport function compact(n: number) { return exactNumber(n); }\nexport function pct(fraction: number) { return exactNumber(fraction * 100) + "%"; }\nexport function kmL(n: number | null) { return n == null ? "—" : exactNumber(n) + " km/L"; }\nexport function tons(n: number) { return exactNumber(n) + " t"; }\nexport function liters(n: number) { return exactNumber(n) + " L"; }\nexport function km(n: number) { return exactNumber(n) + " km"; }\n\n`;
  return s.slice(0, start) + exact + s.slice(end);
});

edit('src/routes/dono/abastecimentos.tsx', (s) => s
  .replace(/\s*<div className="[^\n]*">\s*KM\/L calculado[\s\S]*?<\/div>/m, '')
  .replace(/\s*<Metric label="Preço médio\/L"[^\n]*\/>/g, '')
  .replace(/\s*<Metric label="Média KM\/L"[^\n]*\/>/g, '')
  .replace(/\s*<Metric label="KM rodado"[^\n]*\/>/g, '')
  .replace(/\s*<Metric label="KM\/L"[^\n]*\/>/g, '')
);

for (const rel of ['src/routes/dono/index.tsx', 'src/routes/dono/totais.tsx']) {
  edit(rel, (s) => s
    .replace(/\s*<Stat label="Preço médio\/L"[^\n]*\/>/g, '')
    .replace(/\s*<Stat label="KM\/L abastecimentos"[^\n]*\/>/g, '')
    .replace(/\s*<Summary label="Preço médio\/L"[^\n]*\/>/g, '')
    .replace(/\s*<Summary label="KM pelos abastecimentos"[^\n]*\/>/g, '')
    .replace(/\s*<Summary label="KM\/L"[^\n]*\/>/g, '')
    .replace('["Data", "Motorista", "Conjunto", "Posto", "KM", "KM rodado", "Litros", "KM/L", "Preço/L", "Custo"]', '["Data", "Motorista", "Conjunto", "Posto", "KM", "Litros", "Preço/L", "Custo"]')
    .replace('["Data", "Motorista", "Conjunto", "Placas", "Posto", "KM", "KM rodado", "Litros", "KM/L", "Preço/L", "Custo"]', '["Data", "Motorista", "Conjunto", "Placas", "Posto", "KM", "Litros", "Preço/L", "Custo"]')
    .replace(/\s*<td className="px-3 py-3 tabular">\{f\.kmSincePrevious[^\n]*<\/td>/g, '')
    .replace(/\s*<td className="px-3 py-3 tabular">\{kmL\(f\.kmPerLiter\)\}<\/td>/g, '')
    .replace('colSpan={11}', 'colSpan={9}')
  );
}

console.log('[final-audit-reform] exact values + simplified fueling screens applied');
