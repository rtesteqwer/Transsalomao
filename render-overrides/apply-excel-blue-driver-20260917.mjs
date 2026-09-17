import fs from 'node:fs';
import path from 'node:path';

const target = process.argv[2];
if (!target) throw new Error('excel-blue-driver-20260917: target missing');

const fp = (rel) => path.join(target, rel);
const read = (rel) => fs.readFileSync(fp(rel), 'utf8');
const write = (rel, before, after) => {
  if (before === after) throw new Error(`excel-blue-driver-20260917: no changes in ${rel}`);
  fs.writeFileSync(fp(rel), after);
};
const must = (text, before, after, label) => {
  if (!text.includes(before)) throw new Error(`excel-blue-driver-20260917: pattern not found (${label})`);
  return text.replace(before, after);
};

// Planilha geral + Excel individual por motorista.
{
  const rel = 'src/routes/dono/totais.tsx';
  const before = read(rel);
  let s = before;

  s = must(
    s,
    'import { Calendar, CalendarDays, CalendarRange, FileDown, FileText, Files, UsersRound } from "lucide-react";',
    'import { Calendar, CalendarDays, CalendarRange, FileDown, FileSpreadsheet, FileText, Files, UsersRound } from "lucide-react";',
    'FileSpreadsheet import',
  );

  s = must(
    s,
    '  async function exportExcelColorido() {',
    '  async function exportExcelColorido(driverScope?: { id: string; name: string }) {',
    'Excel scope signature',
  );

  s = must(
    s,
    '    const excelOperator = management.authenticated && management.username ? management.username : "Gerência";\n    const now = new Date();',
    '    const excelOperator = management.authenticated && management.username ? management.username : "Gerência";\n    const excelTrips = driverScope ? computed.filter((t: any) => String(t.driverId) === String(driverScope.id)) : computed;\n    const excelFuelings = driverScope ? fuelings.filter((f: any) => String(f.driverId) === String(driverScope.id)) : fuelings;\n    const excelExpensesSource = (data?.expenses ?? []).filter((e: any) => inPeriod(e.date, period) && (!driverScope || String(e.driverId ?? "") === String(driverScope.id)));\n    const now = new Date();',
    'Excel scoped data',
  );

  s = s.replace('...(data?.trips ?? []).map((x: any) => String(x.date ?? "").slice(0, 10)),', '...excelTrips.map((x: any) => String(x.date ?? "").slice(0, 10)),');
  s = s.replace('...(data?.fuelings ?? []).map((x: any) => String(x.date ?? "").slice(0, 10)),', '...excelFuelings.map((x: any) => String(x.date ?? "").slice(0, 10)),');
  s = s.replace('...(data?.expenses ?? []).map((x: any) => String(x.date ?? "").slice(0, 10)),', '...excelExpensesSource.map((x: any) => String(x.date ?? "").slice(0, 10)),');

  s = must(
    s,
    '    const blue = "C9D7E3", dark = "E8EEF3", white = "111111", black = "111111", pale = "F7F9FB", totalFill = "FFF2CC";',
    '    const lightBlue = "DCEEFF", blue = "A9CBEA", dark = lightBlue, white = lightBlue, black = "111111", pale = lightBlue, totalFill = lightBlue;',
    'Excel light blue palette',
  );

  s = s.replace(
    'sheet.addImage(logoId, { tl: { col: 0.04, row: 0.01 }, ext: { width: 390, height: 195 } });',
    'sheet.addImage(logoId, { tl: { col: 0.02, row: 0.01 }, ext: { width: 520, height: 260 } });',
  );
  s = s.replace(
    'sheet.mergeCells("D1:H2"); sheet.getCell("D1").value = "PLANILHA GERAL - TRANS SALOMÃO";',
    'sheet.mergeCells("D1:H2"); sheet.getCell("D1").value = driverScope ? `PLANILHA ${driverScope.name.toLocaleUpperCase("pt-BR")} - TRANS SALOMÃO` : "PLANILHA GERAL - TRANS SALOMÃO";',
  );
  s = s.replace(
    'sheet.getRow(1).height = 72; sheet.getRow(2).height = 66; sheet.getRow(3).height = 36; sheet.getRow(4).height = 36;',
    'sheet.getRow(1).height = 104; sheet.getRow(2).height = 92; sheet.getRow(3).height = 40; sheet.getRow(4).height = 40;',
  );

  s = s.replace('    computed.forEach((trip: any) => {', '    excelTrips.forEach((trip: any) => {');
  s = s.replace(
    '    (data?.expenses ?? []).filter((e: any) => e.category === "Adiantamento" && inPeriod(e.date, period)).forEach((e: any) => {',
    '    excelExpensesSource.filter((e: any) => e.category === "Adiantamento").forEach((e: any) => {',
  );
  s = s.replace('    const totalFueling = fuelings.reduce((sum: number, f: any) =>', '    const totalFueling = excelFuelings.reduce((sum: number, f: any) =>');
  s = s.replace('    fuelings.forEach((f: any) => {', '    excelFuelings.forEach((f: any) => {');
  s = s.replace('    fuelings.forEach((f: any, index: number) => {', '    excelFuelings.forEach((f: any, index: number) => {');
  s = s.replace('    const periodExpenses = (data?.expenses ?? []).filter((e: any) => inPeriod(e.date, period));', '    const periodExpenses = excelExpensesSource;');

  s = must(
    s,
    '    (data?.drivers ?? []).forEach((d: any, index: number) => { const row = sheet.addRow(["Motorista", d.name, d.cpf ?? "—", d.phone ?? "—", d.cnh ?? "—", d.cnhCategory ?? d.category ?? "—", Number(d.commissionPct ?? 0), d.status]); styleRow(row, index); row.getCell(7).numFmt = \'0.0%\'; });',
    '    (data?.drivers ?? []).filter((d: any) => !driverScope || String(d.id) === String(driverScope.id)).forEach((d: any, index: number) => { const row = sheet.addRow(["Motorista", d.name, d.cpf ?? "—", d.phone ?? "—", d.cnh ?? "—", d.cnhCategory ?? d.category ?? "—", Number(d.commissionPct ?? 0), d.status]); styleRow(row, index); row.getCell(7).numFmt = \'0.0%\'; });',
    'driver registration scope',
  );
  s = must(
    s,
    '    (data?.fleets ?? []).forEach((f: any, index: number) => { const row = sheet.addRow(["Conjunto", f.name, f.tractorPlate ?? "—", f.trailerPlate ?? "—", f.model ?? f.type ?? "—", "—", "—", f.status]); styleRow(row, index); });',
    '    (data?.fleets ?? []).filter((f: any) => !driverScope || excelTrips.some((t: any) => String(t.fleetId ?? "") === String(f.id))).forEach((f: any, index: number) => { const row = sheet.addRow(["Conjunto", f.name, f.tractorPlate ?? "—", f.trailerPlate ?? "—", f.model ?? f.type ?? "—", "—", "—", f.status]); styleRow(row, index); });',
    'fleet registration scope',
  );

  const uniformMarker = '    [40, 30, 20, 28, 28, 28, 28, 32].forEach((width, i) => { sheet.getColumn(i + 1).width = width; });';
  s = must(
    s,
    uniformMarker,
    '    for (let r = 1; r <= sheet.rowCount; r += 1) { for (let c = 1; c <= 8; c += 1) { const cell = sheet.getRow(r).getCell(c); cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: lightBlue } }; cell.font = { ...(cell.font ?? {}), color: { argb: black } }; } }\n' + uniformMarker,
    'uniform light blue sheet',
  );

  s = must(
    s,
    'link.download = "Planilha_Geral_Trans_Salomao.xlsx";',
    'const safeDriverName = driverScope?.name ? driverScope.name.normalize("NFD").replace(/[\\u0300-\\u036f]/g, "").replace(/[^a-zA-Z0-9_-]+/g, "_") : "Geral"; link.download = driverScope ? `Planilha_${safeDriverName}_Trans_Salomao.xlsx` : "Planilha_Geral_Trans_Salomao.xlsx";',
    'driver Excel filename',
  );

  s = must(
    s,
    '<button type="button" onClick={exportExcelColorido} className="h-11 rounded-md border border-accent bg-bg px-4 text-sm font-semibold text-fg hover:bg-surface-2" title="Baixar Excel colorido">Planilha Geral</button>',
    '<button type="button" onClick={() => void exportExcelColorido()} className="h-11 rounded-md border border-accent bg-bg px-4 text-sm font-semibold text-fg hover:bg-surface-2" title="Baixar Excel colorido">Planilha Geral</button>',
    'general Excel click',
  );

  const pdfButton = `                <Button\n                  size="sm"\n                  variant="ghost"\n                  title={\`Gerar PDF de ${'${d.driverName}'}\`}\n                  onClick={() => downloadDriverReportPdf({\n                    driverName: d.driverName,\n                    trips: computed.filter((t) => t.driverId === d.driverId),\n                    fuelings: fuelForDriver(d.driverId),\n                    advances: advancesForDriver(d.driverId),\n                    expenses: periodExpenses.filter((e) => e.driverId === d.driverId),\n                    periodLabel,\n                    sourceLabel: "Relatórios",\n\n                  })}\n                >\n                  <FileDown className="size-4" /> PDF\n                </Button>`;
  const pdfExcelButtons = `                <div className="flex items-center gap-2">\n                  <Button\n                    size="sm"\n                    variant="ghost"\n                    title={\`Gerar PDF de ${'${d.driverName}'}\`}\n                    onClick={() => downloadDriverReportPdf({\n                      driverName: d.driverName,\n                      trips: computed.filter((t) => t.driverId === d.driverId),\n                      fuelings: fuelForDriver(d.driverId),\n                      advances: advancesForDriver(d.driverId),\n                      expenses: periodExpenses.filter((e) => e.driverId === d.driverId),\n                      periodLabel,\n                      sourceLabel: "Relatórios",\n\n                    })}\n                  >\n                    <FileDown className="size-4" /> PDF\n                  </Button>\n                  <Button\n                    size="sm"\n                    variant="ghost"\n                    title={\`Gerar Excel de ${'${d.driverName}'}\`}\n                    onClick={() => void exportExcelColorido({ id: d.driverId, name: d.driverName })}\n                  >\n                    <FileSpreadsheet className="size-4" /> Excel\n                  </Button>\n                </div>`;
  s = must(s, pdfButton, pdfExcelButtons, 'per-driver Excel button');

  write(rel, before, s);
}

// Excel da aba Viagens: fundo azul-claro uniforme, letras pretas e logo ainda maior.
{
  const rel = 'src/routes/dono/viagens.tsx';
  const before = read(rel);
  let s = before;
  s = s.replace(
    'sheet.addImage(logoId, { tl: { col: 0.04, row: 0.01 }, ext: { width: 390, height: 195 } });',
    'sheet.addImage(logoId, { tl: { col: 0.02, row: 0.01 }, ext: { width: 520, height: 260 } }); sheet.getRow(1).height = 104; sheet.getRow(2).height = 92;',
  );
  const widthMarker = '    [29, 18, 11, 15, 18, 18, 18, 18].forEach((w, i) => { sheet.getColumn(i + 1).width = w; });';
  s = must(
    s,
    widthMarker,
    '    const excelLightBlue = "DCEEFF"; for (let r = 1; r <= sheet.rowCount; r += 1) { for (let c = 1; c <= 8; c += 1) { const cell = sheet.getRow(r).getCell(c); cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: excelLightBlue } }; cell.font = { ...(cell.font ?? {}), color: { argb: "111111" } }; } }\n' + widthMarker,
    'Viagens blue background',
  );
  write(rel, before, s);
}

console.log('[excel-blue-driver-20260917] light-blue Excel + larger logo + per-driver Excel buttons applied');
