import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const target = process.argv[2];
if (!target) throw new Error('excel-trip-details: target missing');
const folder = path.dirname(fileURLToPath(import.meta.url));
fs.copyFileSync(path.join(folder, 'excel-trip-details.ts'), path.join(target, 'src/lib/excel-trip-details.ts'));
for (const [rel, start, marker, call] of [
  ['src/routes/dono/totais.tsx', '  async function exportExcelColorido(', '    const buffer = await workbook.xlsx.writeBuffer();', '    addTripDetailsWorksheet(workbook, excelTrips, `${excelPeriodLabel} • Operador: ${excelOperator}`);\n'],
  ['src/routes/dono/viagens.tsx', '  async function exportTripsExcel(', '    const buffer = await workbook.xlsx.writeBuffer();', '    addTripDetailsWorksheet(workbook, rows, "Viagens do filtro selecionado");\n'],
]) {
  const file = path.join(target, rel);
  let source = fs.readFileSync(file, 'utf8');
  if (rel.endsWith('/viagens.tsx')) {
    source = source.replace('onClick={exportTripsExcel} disabled={compactRows.length === 0}', 'onClick={exportTripsExcel} disabled={rows.length === 0}');
  }
  if (!source.includes('addTripDetailsWorksheet(workbook,')) {
    const from = source.indexOf(start);
    const point = source.indexOf(marker, from);
    if (from < 0 || point < 0) throw new Error(`excel-trip-details: export function not found in ${rel}`);
    source = 'import { addTripDetailsWorksheet } from "@/lib/excel-trip-details";\n' + source.slice(0, point) + call + source.slice(point);
  }
  fs.writeFileSync(file, source);
}
console.log('[excel-trip-details] complete trip detail included in report and trip Excel exports');
