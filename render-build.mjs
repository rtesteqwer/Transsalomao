import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

const cwd = process.cwd();
const target = path.join(cwd, '.transteste_app');

fs.rmSync(target, { recursive: true, force: true });
fs.mkdirSync(target, { recursive: true });
fs.mkdtempSync = () => target;

const originalCpSync = fs.cpSync.bind(fs);
fs.cpSync = (src, dest, options) => {
  if (String(src).includes(`${path.sep}.vercel${path.sep}output`) && !fs.existsSync(src)) {
    console.log('[render] skipping Vercel-only output copy');
    return;
  }
  return originalCpSync(src, dest, options);
};

process.env.NITRO_PRESET = 'node-server';
process.env.NODE_ENV = 'production';
process.env.NPM_CONFIG_PRODUCTION = 'false';
process.env.npm_config_production = 'false';
process.env.NPM_CONFIG_INCLUDE = 'dev';
process.env.npm_config_include = 'dev';

await import('./bootstrap.mjs');

// Tickets strictly numeric.
const apiPath = path.join(target, 'src', 'lib', 'api.ts');
if (fs.existsSync(apiPath)) {
  const before = fs.readFileSync(apiPath, 'utf8');
  const legacyLine = '    const autoTicket = `LCT-${new Date().toISOString().replace(/\\D/g, "").slice(2, 14)}-${id.slice(-4).toUpperCase()}`;';
  const numericGenerator = [
    '    const tripCodes = await sql<{ code: string }>`select code from trips`;',
    '    const reportTickets = await sql<{ ticket: string }>`select ticket from reports where status <> \'recusado\'`;',
    '    const numericTickets = [',
    '      ...tripCodes.map((row) => Number(row.code)),',
    '      ...reportTickets.map((row) => Number(row.ticket)),',
    '    ].filter((value) => Number.isFinite(value) && value > 0);',
    '    const autoTicket = String((numericTickets.length ? Math.max(...numericTickets) : 0) + 1);',
  ].join('\n');
  const after = before.replace(legacyLine, numericGenerator);
  if (after === before && before.includes('LCT-')) throw new Error('Legacy LCT ticket generator still present');
  if (after !== before) fs.writeFileSync(apiPath, after);
}

function assertNoLegacyTicketGenerators(dir) {
  if (!fs.existsSync(dir)) return;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      assertNoLegacyTicketGenerators(full);
      continue;
    }
    if (!/\.(?:ts|tsx|js|jsx|mjs|cjs)$/.test(entry.name)) continue;
    const text = fs.readFileSync(full, 'utf8');
    if (text.includes('LCT-') || text.includes('VG-')) throw new Error(`Legacy ticket generator still present in ${path.relative(target, full)}`);
  }
}
assertNoLegacyTicketGenerators(path.join(target, 'src'));

// Every displayed weight uses exactly two decimals. Stored/calculated values stay exact.
const formatPath = path.join(target, 'src', 'lib', 'format.ts');
if (fs.existsSync(formatPath)) {
  const before = fs.readFileSync(formatPath, 'utf8');
  const after = before
    .replace(/minimumFractionDigits\s*:\s*1\s*,\s*\n\s*maximumFractionDigits\s*:\s*1\s*,/m, 'minimumFractionDigits: 2,\n  maximumFractionDigits: 2,')
    .replace(/minimumFractionDigits\s*:\s*0\s*,\s*\n\s*maximumFractionDigits\s*:\s*20\s*,/m, 'minimumFractionDigits: 2,\n  maximumFractionDigits: 2,');
  if (after === before && !/minimumFractionDigits\s*:\s*2[\s\S]{0,80}maximumFractionDigits\s*:\s*2/.test(before)) {
    throw new Error('Tonnage formatter precision block not found');
  }
  fs.writeFileSync(formatPath, after);
  console.log('[render] site-wide weights fixed at exactly 2 decimals');
}

const caixaPath = path.join(target, 'src', 'routes', 'dono', 'lancamentos.tsx');
if (fs.existsSync(caixaPath)) {
  const before = fs.readFileSync(caixaPath, 'utf8');
  let replacements = 0;
  const after = before.replace(/\{num\(([^,)]+\.tons),\s*\d+\)\}\s*t/g, (_match, expression) => {
    replacements += 1;
    return `{new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(${expression})} t`;
  });
  if (replacements === 0 && !before.includes('minimumFractionDigits: 2, maximumFractionDigits: 2')) {
    throw new Error('Caixa tonnage display pattern not found');
  }
  fs.writeFileSync(caixaPath, after);
}

// Report libraries: true XLSX with images + robust PDF table pagination.
execSync('npm install exceljs@4.4.0 jspdf@3.0.1 jspdf-autotable@5.0.2 --no-save --ignore-scripts --no-audit --no-fund', {
  cwd: target,
  stdio: 'inherit',
  env: process.env,
});

// Install the exact logo supplied by the user as a source constant.
const reportLogoSource = path.join(cwd, 'render-overrides', 'report-logo.ts');
if (!fs.existsSync(reportLogoSource)) throw new Error('Missing report logo override');
const reportLogoTarget = path.join(target, 'src', 'lib', 'report-logo.ts');
fs.copyFileSync(reportLogoSource, reportLogoTarget);

// Admin Relatórios: only PDF + real mobile-compatible XLSX with the official logo.
const totalsPath = path.join(target, 'src', 'routes', 'dono', 'totais.tsx');
if (fs.existsSync(totalsPath)) {
  let totals = fs.readFileSync(totalsPath, 'utf8');
  if (!totals.includes('REPORT_LOGO_JPEG')) {
    totals = `import { REPORT_LOGO_JPEG } from "@/lib/report-logo";\n${totals}`;
  }

  const exportStart = totals.indexOf('  function exportCurrent() {');
  const returnStart = exportStart >= 0 ? totals.indexOf('\n\n  return (', exportStart) : -1;
  if (exportStart < 0 || returnStart < 0) throw new Error('Relatórios export block not found');

  const excelFn = [
    '  async function exportExcelColorido() {',
    '    const ExcelJSModule: any = await import("exceljs");',
    '    const ExcelJS: any = ExcelJSModule.default ?? ExcelJSModule;',
    '    const workbook = new ExcelJS.Workbook();',
    '    const worksheet = workbook.addWorksheet("Fretes", { views: [{ state: "frozen", ySplit: 5 }] });',
    '    const blue = "008CFF";',
    '    const dark = "07111F";',
    '    const white = "FFFFFF";',
    '    const black = "111111";',
    '    const uniqueDrivers = Array.from(new Set(computed.map((trip: any) => String(trip.driverName ?? "").trim()).filter(Boolean)));',
    '    const driverLabel = uniqueDrivers.length === 1 ? uniqueDrivers[0] : "Todos os motoristas";',
    '    const totalCommission = computed.reduce((sum: number, trip: any) => sum + Number(trip.commissionValue ?? trip.commission ?? 0), 0);',
    '    const logoId = workbook.addImage({ base64: REPORT_LOGO_JPEG, extension: "jpeg" });',
    '    worksheet.addImage(logoId, { tl: { col: 0, row: 0 }, ext: { width: 158, height: 82 } });',
    '    worksheet.mergeCells("C1:K1");',
    '    worksheet.getCell("C1").value = "RELATÓRIO DE FRETES";',
    '    worksheet.getCell("C1").font = { bold: true, size: 18, color: { argb: white } };',
    '    worksheet.getCell("C1").fill = { type: "pattern", pattern: "solid", fgColor: { argb: dark } };',
    '    worksheet.getCell("C1").alignment = { vertical: "middle" };',
    '    worksheet.mergeCells("C2:G2");',
    '    worksheet.getCell("C2").value = `Motorista: ${driverLabel}`;',
    '    worksheet.getCell("C2").font = { bold: true, size: 13, color: { argb: black } };',
    '    worksheet.getCell("C2").fill = { type: "pattern", pattern: "solid", fgColor: { argb: white } };',
    '    worksheet.mergeCells("H2:K2");',
    '    worksheet.getCell("H2").value = `COMISSÃO TOTAL: ${brl(totalCommission)}`;',
    '    worksheet.getCell("H2").font = { bold: true, size: 13, color: { argb: blue } };',
    '    worksheet.getCell("H2").fill = { type: "pattern", pattern: "solid", fgColor: { argb: dark } };',
    '    worksheet.getCell("H2").alignment = { horizontal: "center" };',
    '    worksheet.getRow(1).height = 34;',
    '    worksheet.getRow(2).height = 24;',
    '    worksheet.getRow(3).height = 8;',
    '    const headers = ["Ticket", "Data", "Motorista", "Conjunto", "Modalidade", "Peso líquido", "KM", "Faturamento", "Comissão", "Diesel", "Resultado"];',
    '    const headerRow = worksheet.getRow(5);',
    '    headerRow.values = headers;',
    '    headerRow.height = 22;',
    '    headerRow.eachCell((cell: any) => {',
    '      cell.font = { bold: true, color: { argb: white } };',
    '      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: dark } };',
    '      cell.alignment = { horizontal: "center", vertical: "middle" };',
    '      cell.border = { top: { style: "thin", color: { argb: blue } }, bottom: { style: "thin", color: { argb: blue } }, left: { style: "thin", color: { argb: blue } }, right: { style: "thin", color: { argb: blue } } };',
    '    });',
    '    const modeLabel = (mode: unknown) => {',
    '      const value = String(mode ?? "");',
    '      if (value === "ton") return "Por tonelada";',
    '      if (value === "trip") return "Por viagem";',
    '      if (value === "cegonha") return "Cegonha";',
    '      if (value === "caixinha") return "Caixinha";',
    '      return value || "—";',
    '    };',
    '    computed.forEach((trip: any) => {',
    '      const row = worksheet.addRow([',
    '        trip.code ?? trip.ticket ?? trip.id ?? "—", trip.date ? formatDate(trip.date) : "—", trip.driverName ?? "—", trip.fleetName ?? "—", modeLabel(trip.freightMode),',
    '        tons(Number(trip.netWeight ?? 0)), `${integer(Number(trip.kmDriven ?? 0))} km`, brl(Number(trip.freight ?? 0)),',
    '        brl(Number(trip.commissionValue ?? trip.commission ?? 0)), brl(Number(trip.dieselCost ?? 0)), brl(Number(trip.grossResult ?? 0)),',
    '      ]);',
    '      row.height = 19;',
    '      row.eachCell((cell: any) => {',
    '        cell.font = { color: { argb: black }, size: 10 };',
    '        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: white } };',
    '        cell.alignment = { vertical: "middle" };',
    '        cell.border = { top: { style: "thin", color: { argb: blue } }, bottom: { style: "thin", color: { argb: blue } }, left: { style: "thin", color: { argb: blue } }, right: { style: "thin", color: { argb: blue } } };',
    '      });',
    '    });',
    '    const widths = [10, 12, 28, 22, 16, 15, 11, 16, 16, 15, 16];',
    '    widths.forEach((width, index) => { worksheet.getColumn(index + 1).width = width; });',
    '    worksheet.autoFilter = { from: "A5", to: `K${Math.max(5, worksheet.rowCount)}` };',
    '    const buffer = await workbook.xlsx.writeBuffer();',
    '    const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });',
    '    const url = URL.createObjectURL(blob);',
    '    const a = document.createElement("a");',
    '    a.href = url;',
    '    a.download = "relatorio-fretes-trans-salomao.xlsx";',
    '    document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);',
    '  }',
  ].join('\n');

  totals = totals.slice(0, exportStart) + excelFn + totals.slice(returnStart);
  const csvButton = /<button type="button" onClick=\{exportCurrent\} className="h-11 rounded-md border border-border px-4 text-sm text-fg hover:bg-surface-2">\s*Exportar CSV\s*<\/button>/m;
  const existingExcelButton = /<button type="button" onClick=\{exportExcelColorido\} className="h-11 rounded-md[^>]*>[\s\S]*?Excel colorido[\s\S]*?<\/button>/m;
  if (csvButton.test(totals)) {
    totals = totals.replace(csvButton, '<button type="button" onClick={exportExcelColorido} className="h-11 rounded-md border border-accent bg-bg px-4 text-sm font-semibold text-fg hover:bg-surface-2">\n            Excel colorido (.xlsx)\n          </button>');
  } else if (existingExcelButton.test(totals)) {
    totals = totals.replace(existingExcelButton, '<button type="button" onClick={exportExcelColorido} className="h-11 rounded-md border border-accent bg-bg px-4 text-sm font-semibold text-fg hover:bg-surface-2">\n            Excel colorido (.xlsx)\n          </button>');
  } else {
    throw new Error('Relatórios Excel button not found');
  }
  fs.writeFileSync(totalsPath, totals);
  console.log('[render] Admin Excel uses official logo, true XLSX and mobile-compatible layout');
}

// Replace the old hand-positioned PDF renderer with jsPDF + AutoTable. This removes
// all overlapping, repeats a compact header/logo on every page, and fits many trips.
const pdfPath = path.join(target, 'src', 'lib', 'pdf.ts');
if (fs.existsSync(pdfPath)) {
  let pdf = fs.readFileSync(pdfPath, 'utf8');
  if (!pdf.includes('REPORT_LOGO_JPEG')) {
    pdf = `import { REPORT_LOGO_JPEG } from "@/lib/report-logo";\n${pdf}`;
  }
  const modernPdf = `export async function downloadDriverReportPdf({\n  driverName,\n  trips,\n  fuelings = [],\n  periodLabel,\n  sourceLabel,\n  reportTitle,\n  operatorName,\n}: {\n  driverName: string;\n  trips: ComputedTrip[];\n  fuelings?: ReportFueling[];\n  periodLabel?: string;\n  sourceLabel?: string;\n  reportTitle?: string;\n  operatorName?: string;\n}) {\n  const { jsPDF } = await import("jspdf");\n  const autoTableModule: any = await import("jspdf-autotable");\n  const autoTable: any = autoTableModule.default ?? autoTableModule.autoTable;\n  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4", compress: true });\n  const blue = [0, 140, 255] as [number, number, number];\n  const dark = [7, 17, 31] as [number, number, number];\n  const black = [17, 17, 17] as [number, number, number];\n  const totalCommission = trips.reduce((sum, trip) => sum + Number((trip as any).commissionValue ?? (trip as any).commission ?? 0), 0);\n  const totalFreight = trips.reduce((sum, trip) => sum + Number((trip as any).freight ?? 0), 0);\n  const totalTons = trips.reduce((sum, trip) => sum + Number((trip as any).netWeight ?? 0), 0);\n  const rows = trips.map((trip) => [\n    formatDate((trip as any).date),\n    String((trip as any).code ?? "—"),\n    String((trip as any).fleetName ?? "—"),\n    tons(Number((trip as any).netWeight ?? 0)),\n    brl(Number((trip as any).freight ?? 0)),\n    brl(Number((trip as any).commissionValue ?? (trip as any).commission ?? 0)),\n    brl(Number((trip as any).dieselCost ?? 0)),\n    brl(Number((trip as any).grossResult ?? 0)),\n  ]);\n\n  const drawHeader = () => {\n    doc.setFillColor(255, 255, 255);\n    doc.rect(0, 0, 297, 24, "F");\n    doc.addImage(REPORT_LOGO_JPEG, "JPEG", 7, 3.1, 34, 17.7, undefined, "FAST");\n    doc.setTextColor(...black);\n    doc.setFont("helvetica", "bold");\n    doc.setFontSize(14);\n    doc.text(driverName || "Motorista", 45, 9);\n    doc.setFont("helvetica", "normal");\n    doc.setFontSize(6.8);\n    doc.setTextColor(70, 78, 90);\n    doc.text(reportTitle || "Relatório operacional por motorista", 45, 13.5);\n    doc.text(`${periodLabel || "Período selecionado"}  •  ${sourceLabel || "Gerência"}  •  Operador: ${operatorName || "admin"}`, 45, 17.2);\n    doc.setFillColor(...dark);\n    doc.roundedRect(218, 3.2, 72, 16.5, 1.4, 1.4, "F");\n    doc.setFont("helvetica", "bold");\n    doc.setFontSize(6.5);\n    doc.setTextColor(255, 255, 255);\n    doc.text("COMISSÃO TOTAL", 254, 8, { align: "center" });\n    doc.setFontSize(12);\n    doc.setTextColor(...blue);\n    doc.text(brl(totalCommission), 254, 14.7, { align: "center" });\n    doc.setDrawColor(...blue);\n    doc.setLineWidth(0.5);\n    doc.line(7, 22.3, 290, 22.3);\n  };\n\n  autoTable(doc, {\n    head: [["Data", "Ticket", "Conjunto", "Peso líquido", "Frete", "Comissão", "Diesel", "Resultado"]],\n    body: rows,\n    startY: 25,\n    margin: { top: 25, right: 7, bottom: 8, left: 7 },\n    theme: "grid",\n    showHead: "everyPage",\n    rowPageBreak: "avoid",\n    styles: { font: "helvetica", fontSize: 6.6, cellPadding: 1.15, textColor: black, fillColor: [255, 255, 255], lineColor: blue, lineWidth: 0.16, valign: "middle", overflow: "ellipsize", minCellHeight: 4.4 },\n    headStyles: { fillColor: dark, textColor: [255, 255, 255], fontStyle: "bold", fontSize: 6.8, lineColor: blue, lineWidth: 0.2, halign: "center", minCellHeight: 5.2 },\n    alternateRowStyles: { fillColor: [255, 255, 255] },\n    columnStyles: {\n      0: { cellWidth: 20, halign: "center" }, 1: { cellWidth: 15, halign: "center" }, 2: { cellWidth: 58 }, 3: { cellWidth: 25, halign: "right" },\n      4: { cellWidth: 34, halign: "right" }, 5: { cellWidth: 34, halign: "right" }, 6: { cellWidth: 34, halign: "right" }, 7: { cellWidth: 34, halign: "right" },\n    },\n    didDrawPage: () => drawHeader(),\n  });\n\n  const pages = doc.getNumberOfPages();\n  for (let page = 1; page <= pages; page += 1) {\n    doc.setPage(page);\n    doc.setFont("helvetica", "normal");\n    doc.setFontSize(6.2);\n    doc.setTextColor(95, 105, 118);\n    doc.text(`Fretes: ${trips.length}  •  Peso: ${tons(totalTons)}  •  Faturamento: ${brl(totalFreight)}`, 7, 205);\n    doc.text(`Página ${page}/${pages}`, 290, 205, { align: "right" });\n  }\n\n  const blob = doc.output("blob");\n  const url = URL.createObjectURL(blob);\n  const a = document.createElement("a");\n  a.href = url;\n  a.download = `relatorio-trans-salomao-${normalizeFilename(driverName) || "motorista"}.pdf`;\n  document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);\n}\n`;
  const exportStart = pdf.indexOf('export function downloadDriverReportPdf({');
  if (exportStart < 0) throw new Error('PDF export function not found');
  pdf = pdf.slice(0, exportStart) + modernPdf;
  fs.writeFileSync(pdfPath, pdf);
  console.log('[render] PDF rebuilt with AutoTable: no overlap, compact headers, max trips/page, logo on every page');
}

// Same Gerência login form; drivers redirect to isolated dashboard.
const managementRoutePath = path.join(target, 'src', 'routes', 'dono', 'route.tsx');
if (fs.existsSync(managementRoutePath)) {
  let route = fs.readFileSync(managementRoutePath, 'utf8');
  if (!route.includes('window.location.assign("/klebersom")')) {
    const successNeedle = 'toast.success("Acesso liberado para a Gerência.");';
    if (route.includes(successNeedle)) {
      route = route.replace(successNeedle, [
        'if (result.role === "driver") {',
        '                    window.location.assign("/klebersom");',
        '                    return;',
        '                  }',
        '                  toast.success("Acesso liberado para a Gerência.");',
      ].join('\n'));
    } else {
      const genericSuccess = /toast\.success\([^;]+\);/;
      if (!genericSuccess.test(route)) throw new Error('Management success notification hook not found');
      route = route.replace(genericSuccess, (match) => [
        'if (result.role === "driver") {',
        '                    window.location.assign("/klebersom");',
        '                    return;',
        '                  }',
        `                  ${match}`,
      ].join('\n'));
    }
  }
  fs.writeFileSync(managementRoutePath, route);
}

// Only admin/admin can own a management session; drivers use isolated driver_id sessions.
const overrides = [
  ['render-overrides/management-auth.server.ts', 'src/lib/management-auth.server.ts'],
  ['render-overrides/management-auth.ts', 'src/lib/management-auth.ts'],
  ['render-overrides/klebersom-access.server.ts', 'src/lib/klebersom-access.server.ts'],
  ['render-overrides/klebersom-access.ts', 'src/lib/klebersom-access.ts'],
  ['render-overrides/klebersom.tsx', 'src/routes/klebersom.tsx'],
  ['render-overrides/report-logo.ts', 'src/lib/report-logo.ts'],
];
for (const [sourceRel, targetRel] of overrides) {
  const source = path.join(cwd, sourceRel);
  if (!fs.existsSync(source)) throw new Error(`Missing Render override: ${sourceRel}`);
  const destination = path.join(target, targetRel);
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.copyFileSync(source, destination);
}

// Driver-only reports receive the same logo/layout and true XLSX format.
const driverRoutePath = path.join(target, 'src', 'routes', 'klebersom.tsx');
if (fs.existsSync(driverRoutePath)) {
  let driverRoute = fs.readFileSync(driverRoutePath, 'utf8');
  if (!driverRoute.includes('REPORT_LOGO_JPEG')) {
    driverRoute = `import { REPORT_LOGO_JPEG } from "@/lib/report-logo";\n${driverRoute}`;
  }
  const excelPattern = /function downloadColoredExcel\(data: any\) \{[\s\S]*?\n\}\nfunction generatePdf/;
  if (!excelPattern.test(driverRoute)) throw new Error('Driver Excel export function not found');
  const driverExcel = `async function downloadColoredExcel(data: any) {\n  const ExcelJSModule: any = await import("exceljs");\n  const ExcelJS: any = ExcelJSModule.default ?? ExcelJSModule;\n  const workbook = new ExcelJS.Workbook();\n  const worksheet = workbook.addWorksheet("Fretes", { views: [{ state: "frozen", ySplit: 5 }] });\n  const blue = "008CFF", dark = "07111F", white = "FFFFFF", black = "111111";\n  const logoId = workbook.addImage({ base64: REPORT_LOGO_JPEG, extension: "jpeg" });\n  worksheet.addImage(logoId, { tl: { col: 0, row: 0 }, ext: { width: 158, height: 82 } });\n  worksheet.mergeCells("C1:I1"); worksheet.getCell("C1").value = "RELATÓRIO DE FRETES";\n  worksheet.getCell("C1").font = { bold: true, size: 18, color: { argb: white } }; worksheet.getCell("C1").fill = { type: "pattern", pattern: "solid", fgColor: { argb: dark } };\n  worksheet.mergeCells("C2:F2"); worksheet.getCell("C2").value = data.driver.name; worksheet.getCell("C2").font = { bold: true, size: 13, color: { argb: black } };\n  worksheet.mergeCells("G2:I2"); worksheet.getCell("G2").value = `COMISSÃO TOTAL: ${money(data.totals.commission)}`; worksheet.getCell("G2").font = { bold: true, size: 13, color: { argb: blue } }; worksheet.getCell("G2").fill = { type: "pattern", pattern: "solid", fgColor: { argb: dark } }; worksheet.getCell("G2").alignment = { horizontal: "center" };\n  worksheet.getRow(1).height = 34; worksheet.getRow(2).height = 24; worksheet.getRow(3).height = 8;\n  const headers = ["Ticket", "Data", "Modalidade", "Peso líquido", "KM", "Conjunto", "Faturamento", "Comissão", "Após comissão"];\n  const headerRow = worksheet.getRow(5); headerRow.values = headers; headerRow.height = 22;\n  headerRow.eachCell((cell: any) => { cell.font = { bold: true, color: { argb: white } }; cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: dark } }; cell.alignment = { horizontal: "center", vertical: "middle" }; cell.border = { top: { style: "thin", color: { argb: blue } }, bottom: { style: "thin", color: { argb: blue } }, left: { style: "thin", color: { argb: blue } }, right: { style: "thin", color: { argb: blue } } }; });\n  reportRows(data).forEach((item: any) => { const row = worksheet.addRow([item.ticket, item.date, item.mode, item.weight, item.km, item.fleet, item.billing, item.commission, item.afterCommission]); row.height = 19; row.eachCell((cell: any) => { cell.font = { color: { argb: black }, size: 10 }; cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: white } }; cell.border = { top: { style: "thin", color: { argb: blue } }, bottom: { style: "thin", color: { argb: blue } }, left: { style: "thin", color: { argb: blue } }, right: { style: "thin", color: { argb: blue } } }; }); });\n  [10, 12, 16, 15, 11, 24, 16, 16, 16].forEach((width, index) => { worksheet.getColumn(index + 1).width = width; });\n  const buffer = await workbook.xlsx.writeBuffer(); const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }); const url = URL.createObjectURL(blob); const link = document.createElement("a"); link.href = url; link.download = `Relatorio_${safeFileName(data.driver.name)}.xlsx`; document.body.appendChild(link); link.click(); link.remove(); URL.revokeObjectURL(url);\n}\nfunction generatePdf`;
  driverRoute = driverRoute.replace(excelPattern, driverExcel);

  const pdfPattern = /function generatePdf\(data: any\) \{[\s\S]*?\n\}\n\ntype Tab/;
  if (!pdfPattern.test(driverRoute)) throw new Error('Driver PDF export function not found');
  const driverPdf = `async function generatePdf(data: any) {\n  const { jsPDF } = await import("jspdf");\n  const autoTableModule: any = await import("jspdf-autotable");\n  const autoTable: any = autoTableModule.default ?? autoTableModule.autoTable;\n  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4", compress: true });\n  const blue: [number, number, number] = [0, 140, 255]; const dark: [number, number, number] = [7, 17, 31]; const black: [number, number, number] = [17, 17, 17];\n  const rows = reportRows(data).map((row: any) => [row.date, row.ticket, row.fleet, row.weight, row.billing, row.commission, row.afterCommission]);\n  const drawHeader = () => { doc.setFillColor(255,255,255); doc.rect(0,0,297,24,"F"); doc.addImage(REPORT_LOGO_JPEG,"JPEG",7,3.1,34,17.7,undefined,"FAST"); doc.setTextColor(...black); doc.setFont("helvetica","bold"); doc.setFontSize(14); doc.text(data.driver.name,45,9); doc.setFont("helvetica","normal"); doc.setFontSize(6.8); doc.setTextColor(70,78,90); doc.text("Relatório operacional do motorista",45,13.5); doc.setFillColor(...dark); doc.roundedRect(218,3.2,72,16.5,1.4,1.4,"F"); doc.setFont("helvetica","bold"); doc.setFontSize(6.5); doc.setTextColor(255,255,255); doc.text("COMISSÃO TOTAL",254,8,{align:"center"}); doc.setFontSize(12); doc.setTextColor(...blue); doc.text(money(data.totals.commission),254,14.7,{align:"center"}); doc.setDrawColor(...blue); doc.setLineWidth(.5); doc.line(7,22.3,290,22.3); };\n  autoTable(doc, { head: [["Data","Ticket","Conjunto","Peso líquido","Faturamento","Comissão","Após comissão"]], body: rows, startY: 25, margin: { top:25,right:7,bottom:8,left:7 }, theme:"grid", showHead:"everyPage", rowPageBreak:"avoid", styles:{font:"helvetica",fontSize:6.6,cellPadding:1.15,textColor:black,fillColor:[255,255,255],lineColor:blue,lineWidth:.16,valign:"middle",overflow:"ellipsize",minCellHeight:4.4}, headStyles:{fillColor:dark,textColor:[255,255,255],fontStyle:"bold",fontSize:6.8,lineColor:blue,lineWidth:.2,halign:"center",minCellHeight:5.2}, alternateRowStyles:{fillColor:[255,255,255]}, columnStyles:{0:{cellWidth:22,halign:"center"},1:{cellWidth:16,halign:"center"},2:{cellWidth:68},3:{cellWidth:30,halign:"right"},4:{cellWidth:42,halign:"right"},5:{cellWidth:42,halign:"right"},6:{cellWidth:42,halign:"right"}}, didDrawPage:()=>drawHeader() });\n  const pages = doc.getNumberOfPages(); for (let page=1; page<=pages; page+=1) { doc.setPage(page); doc.setFontSize(6.2); doc.setTextColor(95,105,118); doc.text(`Fretes: ${data.totals.trips}  •  Peso: ${exactTons(data.totals.totalTons)}  •  Faturamento: ${money(data.totals.billing)}`,7,205); doc.text(`Página ${page}/${pages}`,290,205,{align:"right"}); }\n  const blob = doc.output("blob"); const url = URL.createObjectURL(blob); const link = document.createElement("a"); link.href = url; link.download = `Relatorio_${safeFileName(data.driver.name)}.pdf`; document.body.appendChild(link); link.click(); link.remove(); URL.revokeObjectURL(url);\n}\n\ntype Tab`;
  driverRoute = driverRoute.replace(pdfPattern, driverPdf);
  fs.writeFileSync(driverRoutePath, driverRoute);
  console.log('[render] Driver PDF/XLSX use official logo and non-overlapping compact layout');
}

const finalManagementAuth = fs.readFileSync(path.join(target, 'src', 'lib', 'management-auth.server.ts'), 'utf8');
if (!finalManagementAuth.includes('username !== "admin"')) throw new Error('Admin-only management invariant missing');
if (!finalManagementAuth.includes('return "admin";')) throw new Error('admin/admin invariant missing');
const finalDriverAuth = fs.readFileSync(path.join(target, 'src', 'lib', 'klebersom-access.server.ts'), 'utf8');
if (finalDriverAuth.includes('managementSession')) throw new Error('Driver auth must never fall back to a management session');
console.log('[render] security invariant OK: admin/admin only for Gerência');

const configCandidates = ['vite.config.ts','vite.config.js','vite.config.mts','vite.config.mjs','nitro.config.ts','nitro.config.js','nitro.config.mts','nitro.config.mjs'];
for (const rel of configCandidates) {
  const file = path.join(target, rel);
  if (!fs.existsSync(file)) continue;
  const before = fs.readFileSync(file, 'utf8');
  const after = before
    .replace(/preset\s*:\s*(['"`])vercel\1/g, 'preset: "node-server"')
    .replace(/preset\s*:\s*(['"`])vercel-edge\1/g, 'preset: "node-server"');
  if (after !== before) fs.writeFileSync(file, after);
}

// Site-wide dark/white contrast with radiant blue accents.
const stylesPath = path.join(target, 'src', 'styles.css');
if (fs.existsSync(stylesPath)) {
  let styles = fs.readFileSync(stylesPath, 'utf8');
  styles = styles.replace(/background-attachment\s*:\s*fixed\s*;/gi, 'background-attachment: scroll;');
  styles += `\n\n/* transteste: radiant blue visual system */\n:root {\n  --bg: #07111f !important; --color-bg: #07111f !important;\n  --fg: #f8fbff !important; --color-fg: #f8fbff !important;\n  --surface: #0b1828 !important; --color-surface: #0b1828 !important;\n  --surface-2: #10243a !important; --color-surface-2: #10243a !important;\n  --muted: #a9bdd0 !important; --color-muted: #a9bdd0 !important;\n  --border: #008cff !important; --color-border: #008cff !important;\n  --accent: #008cff !important; --color-accent: #008cff !important;\n  --primary: #008cff !important; --color-primary: #008cff !important;\n  --ring: #008cff !important; --color-ring: #008cff !important;\n}\nhtml, body { background: #07111f !important; color: #f8fbff !important; }\nbody { background-image: none !important; background-attachment: scroll !important; }\nbody::before, body::after { background-image: none !important; background-attachment: scroll !important; }\n.text-accent, [class*=\"text-accent\"] { color: #008cff !important; }\n.border-accent, [class*=\"border-accent\"], .border-border { border-color: #008cff !important; }\n.bg-accent { background: #008cff !important; color: #07111f !important; }\n.text-white:not([class*=\"bg-\"]), [class*=\"text-white\"]:not([class*=\"bg-\"]) { background-color: #07111f; }\n.text-black:not([class*=\"bg-\"]), [class*=\"text-black\"]:not([class*=\"bg-\"]) { background-color: #ffffff; }\nbutton:focus-visible, a:focus-visible, input:focus-visible, select:focus-visible { outline-color: #008cff !important; box-shadow: 0 0 0 2px rgba(0,140,255,.35) !important; }\n::selection { background: #008cff; color: #07111f; }\n@media (max-width: 900px) { body, body::before, body::after { background-attachment: scroll !important; } [class*=\"backdrop-blur\"] { -webkit-backdrop-filter: none !important; backdrop-filter: none !important; } }\n`;
  fs.writeFileSync(stylesPath, styles);
}

fs.rmSync(path.join(target, '.output'), { recursive: true, force: true });
execSync('npm run build', { cwd: target, stdio: 'inherit', env: { ...process.env, NITRO_PRESET: 'node-server' } });
console.log('[render] Render-native production bundle rebuilt');

const pkgPath = path.join(target, 'package.json');
if (!fs.existsSync(pkgPath)) throw new Error('Render build failed: package.json not found');
const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
pkg.scripts = pkg.scripts || {};
const nativeEntry = path.join(target, '.output', 'server', 'index.mjs');
pkg.scripts.start = fs.existsSync(nativeEntry)
  ? 'node .output/server/index.mjs'
  : 'vite preview --host 0.0.0.0 --port $PORT';
fs.writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`);
console.log('[render] transteste source reconstructed at .transteste_app');
