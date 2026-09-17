import fs from 'node:fs';
import path from 'node:path';

const target = process.argv[2];
if (!target) throw new Error('report-visual-20260917b: target missing');

const fp = (rel) => path.join(target, rel);
function read(rel) {
  const p = fp(rel);
  if (!fs.existsSync(p)) throw new Error(`report-visual-20260917b: missing ${rel}`);
  return fs.readFileSync(p, 'utf8');
}
function write(rel, before, after) {
  if (after === before) throw new Error(`report-visual-20260917b: no changes in ${rel}`);
  fs.writeFileSync(fp(rel), after);
}
function mustReplace(text, before, after, label) {
  if (!text.includes(before)) throw new Error(`report-visual-20260917b: pattern not found (${label})`);
  return text.replace(before, after);
}
function replaceBetween(text, startMarker, endMarker, replacement, label) {
  const start = text.indexOf(startMarker);
  if (start < 0) throw new Error(`report-visual-20260917b: start not found (${label})`);
  const end = text.indexOf(endMarker, start);
  if (end < 0) throw new Error(`report-visual-20260917b: end not found (${label})`);
  return text.slice(0, start) + replacement + text.slice(end);
}

// Shared PDF generator: A3 landscape, readable 16pt typography, black text,
// large logo, real logged operator, exact period range and financial hierarchy.
{
  const rel = 'src/lib/pdf.ts';
  const before = read(rel);
  let s = before;
  s = mustReplace(
    s,
    '  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4", compress: true });',
    '  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a3", compress: true });',
    'PDF A3',
  );
  s = s.replace('  const totalGrossResult = totalFreight - totalDiesel;\n', '');

  const insertAfter = '  const black = [17, 17, 17] as [number, number, number];\n';
  const operatorPeriod = `\n  let resolvedOperatorName = String(operatorName ?? "").trim();\n  if (!resolvedOperatorName || resolvedOperatorName.toLocaleLowerCase("pt-BR") === "admin") {\n    try {\n      const { getManagementSession } = await import("@/lib/management-auth");\n      const session = await getManagementSession();\n      if (session.authenticated && session.username) resolvedOperatorName = session.username;\n    } catch {}\n  }\n  if (!resolvedOperatorName) resolvedOperatorName = "Gerência";\n\n  const localIso = (date: Date) => \`${'${date.getFullYear()}'}-${'${String(date.getMonth() + 1).padStart(2, "0")}'}-${'${String(date.getDate()).padStart(2, "0")}'}\`;\n  const today = new Date();\n  const todayIso = localIso(today);\n  const shiftedIso = (days: number) => { const d = new Date(today.getFullYear(), today.getMonth(), today.getDate()); d.setDate(d.getDate() + days); return localIso(d); };\n  const sourceDates = [\n    ...trips.map((item: any) => String(item.date ?? "").slice(0, 10)),\n    ...fuelings.map((item: any) => String(item.date ?? "").slice(0, 10)),\n    ...advances.map((item: any) => String(item.date ?? "").slice(0, 10)),\n    ...expenses.map((item: any) => String(item.date ?? "").slice(0, 10)),\n  ].filter((value) => /^\\d{4}-\\d{2}-\\d{2}$/.test(value)).sort();\n  const basePeriodLabel = String(periodLabel || "Período selecionado");\n  const detailedPeriodLabel = (() => {\n    if (/\\(.*\\d{2}\\/\\d{2}\\/\\d{4}.*\\)/.test(basePeriodLabel)) return basePeriodLabel;\n    if (/este mês|mensal/i.test(basePeriodLabel)) {\n      const first = localIso(new Date(today.getFullYear(), today.getMonth(), 1));\n      const last = localIso(new Date(today.getFullYear(), today.getMonth() + 1, 0));\n      return \`${'${basePeriodLabel}'} (${'${formatDate(first)}'} a ${'${formatDate(last)}'})\`;\n    }\n    if (/7 dias|semanal/i.test(basePeriodLabel)) return \`${'${basePeriodLabel}'} (${'${formatDate(shiftedIso(-6))}'} a ${'${formatDate(todayIso)}'})\`;\n    if (/30 dias/i.test(basePeriodLabel)) return \`${'${basePeriodLabel}'} (${'${formatDate(shiftedIso(-29))}'} a ${'${formatDate(todayIso)}'})\`;\n    if (/diário|diario/i.test(basePeriodLabel)) return \`${'${basePeriodLabel}'} (${'${formatDate(todayIso)}'})\`;\n    if (/tudo|completo/i.test(basePeriodLabel) && sourceDates.length > 0) return \`${'${basePeriodLabel}'} (${'${formatDate(sourceDates[0])}'} a ${'${formatDate(sourceDates[sourceDates.length - 1])}'})\`;\n    return basePeriodLabel;\n  })();\n`;
  s = mustReplace(s, insertAfter, insertAfter + operatorPeriod, 'operator and period');

  const headerBlock = `  const pageWidth = doc.internal.pageSize.getWidth();\n  const pageHeight = doc.internal.pageSize.getHeight();\n  const reportMargin = 10;\n  const headerBottom = 54;\n  const lightHeader = [232, 238, 244] as [number, number, number];\n  const totalHighlight = [255, 247, 214] as [number, number, number];\n\n  const drawHeader = () => {\n    doc.setFillColor(255, 255, 255);\n    doc.rect(0, 0, pageWidth, headerBottom, "F");\n    doc.addImage(REPORT_LOGO_JPEG, "JPEG", 8, 2, 92, 47, undefined, "FAST");\n    doc.setTextColor(...black);\n    doc.setFont("helvetica", "bold");\n    doc.setFontSize(22);\n    doc.text(driverName || "Motorista", pageWidth / 2 + 20, 15, { align: "center" });\n    doc.setFontSize(18);\n    doc.text(reportTitle || "Relatório operacional por motorista", pageWidth / 2 + 20, 27, { align: "center" });\n    doc.setFont("helvetica", "normal");\n    doc.setFontSize(16);\n    doc.text(\`${'${detailedPeriodLabel}'}  •  ${'${sourceLabel || "Relatórios"}'}  •  Operador: ${'${resolvedOperatorName}'}\`, pageWidth / 2 + 20, 40, { align: "center" });\n    doc.setDrawColor(0, 0, 0);\n    doc.setLineWidth(0.35);\n    doc.line(reportMargin, 51, pageWidth - reportMargin, 51);\n  };\n\n`;
  s = replaceBetween(s, '  const drawHeader = () => {', '  autoTable(doc, {', headerBlock, 'drawHeader');

  const firstTableStart = s.indexOf('  autoTable(doc, {', s.indexOf(headerBlock));
  const tripStartMarker = '  const tripStartY =';
  const firstTableEnd = s.indexOf(tripStartMarker, firstTableStart);
  if (firstTableStart < 0 || firstTableEnd < 0) throw new Error('report-visual-20260917b: PDF summary block not found');
  const summaryTable = `  autoTable(doc, {\n    head: [["Faturamento total", "Custo diesel", "Comissão total", "Faturamento líquido", "Fretes"]],\n    body: [[brl(totalFreight), brl(totalDiesel), brl(totalCommission), brl(totalNetRevenue), String(trips.length)]],\n    startY: 56,\n    margin: { top: 56, right: reportMargin, bottom: 16, left: reportMargin },\n    theme: "grid",\n    styles: { font: "helvetica", fontSize: 16, cellPadding: 2.4, textColor: black, fillColor: [255, 255, 255], lineColor: black, lineWidth: 0.18, halign: "center", valign: "middle" },\n    headStyles: { fillColor: lightHeader, textColor: black, fontStyle: "bold", fontSize: 16, halign: "center", minCellHeight: 12 },\n    bodyStyles: { fillColor: totalHighlight, textColor: black, fontStyle: "bold", fontSize: 16, minCellHeight: 13 },\n    columnStyles: { 0: { cellWidth: 80 }, 1: { cellWidth: 80 }, 2: { cellWidth: 80 }, 3: { cellWidth: 80 }, 4: { cellWidth: 80 } },\n    didDrawPage: drawHeader,\n  });\n`;
  s = s.slice(0, firstTableStart) + summaryTable + s.slice(firstTableEnd);

  const tripStart = s.indexOf(tripStartMarker);
  const commissionMarker = '  const commissionRows =';
  const tripEnd = s.indexOf(commissionMarker, tripStart);
  if (tripStart < 0 || tripEnd < 0) throw new Error('report-visual-20260917b: PDF trip table block not found');
  const tripTable = `  const tripStartY = Number((doc as any).lastAutoTable?.finalY ?? 56) + 5;\n  autoTable(doc, {\n    head: [["Data", "Ticket / modalidade", "Motorista", "Detalhes do frete", "Frete", "Comissão", "Após comissão"]],\n    body: rows,\n    startY: tripStartY,\n    margin: { top: 56, right: reportMargin, bottom: 16, left: reportMargin },\n    theme: "grid",\n    showHead: "everyPage",\n    rowPageBreak: "avoid",\n    styles: { font: "helvetica", fontSize: 16, cellPadding: 2.2, textColor: black, fillColor: [255, 255, 255], lineColor: black, lineWidth: 0.16, valign: "middle", overflow: "linebreak", minCellHeight: 10, halign: "center" },\n    headStyles: { fillColor: lightHeader, textColor: black, fontStyle: "bold", fontSize: 16, lineColor: black, lineWidth: 0.2, halign: "center", minCellHeight: 12 },\n    alternateRowStyles: { fillColor: [248, 250, 252] },\n    columnStyles: {\n      0: { cellWidth: 36 }, 1: { cellWidth: 68 }, 2: { cellWidth: 66 }, 3: { cellWidth: 100 },\n      4: { cellWidth: 42, fontStyle: "bold" }, 5: { cellWidth: 42, fontStyle: "bold" }, 6: { cellWidth: 46, fontStyle: "bold" },\n    },\n    didDrawPage: drawHeader,\n  });\n\n`;
  s = s.slice(0, tripStart) + tripTable + s.slice(tripEnd);

  const commissionStart = s.indexOf(commissionMarker);
  const summaryYMarker = '  let summaryY =';
  const commissionEnd = s.indexOf(summaryYMarker, commissionStart);
  if (commissionStart < 0 || commissionEnd < 0) throw new Error('report-visual-20260917b: commission rows not found');
  const commissionRows = `  const normalizeDriverName = (value: any) => String(value ?? "").normalize("NFD").replace(/[\\u0300-\\u036f]/g, "").trim().toLocaleLowerCase("pt-BR");\n  const dieselByDriverName = new Map<string, number>();\n  fuelings.forEach((fueling: any) => {\n    const key = normalizeDriverName(fueling.driverName);\n    if (!key) return;\n    dieselByDriverName.set(key, (dieselByDriverName.get(key) ?? 0) + Number(fueling.liters ?? 0) * Number(fueling.pricePerLiter ?? 0));\n  });\n  const commissionRows = Array.from(driverTotals.values())\n    .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"))\n    .map((item) => {\n      const diesel = dieselByDriverName.get(normalizeDriverName(item.name)) ?? 0;\n      return [item.name, String(item.trips), brl(item.billing), brl(item.commission), brl(diesel), brl(item.advances), brl(item.billing - item.commission - diesel)];\n    });\n\n`;
  s = s.slice(0, commissionStart) + commissionRows + s.slice(commissionEnd);

  const summaryTableStart = s.indexOf(summaryYMarker);
  const detailMarker = '  const addDetailTable =';
  const summaryTableEnd = s.indexOf(detailMarker, summaryTableStart);
  if (summaryTableStart < 0 || summaryTableEnd < 0) throw new Error('report-visual-20260917b: driver totals table not found');
  const driverSummary = `  let summaryY = Number((doc as any).lastAutoTable?.finalY ?? 56) + 7;\n  if (summaryY > pageHeight - 45) {\n    doc.addPage("a3", "landscape");\n    summaryY = 58;\n  }\n\n  autoTable(doc, {\n    head: [["Motorista", "Fretes", "Faturamento", "Comissão", "Custo diesel", "Adiantamentos", "Faturamento líquido"]],\n    body: commissionRows,\n    startY: summaryY,\n    margin: { top: 56, right: reportMargin, bottom: 16, left: reportMargin },\n    theme: "grid",\n    showHead: "everyPage",\n    rowPageBreak: "avoid",\n    styles: { font: "helvetica", fontSize: 16, cellPadding: 2.2, textColor: black, fillColor: [255, 255, 255], lineColor: black, lineWidth: 0.16, overflow: "linebreak", halign: "center", valign: "middle" },\n    headStyles: { fillColor: lightHeader, textColor: black, fontStyle: "bold", fontSize: 16, halign: "center", lineColor: black, lineWidth: 0.2, minCellHeight: 12 },\n    columnStyles: {\n      0: { cellWidth: 80 }, 1: { cellWidth: 32 },\n      2: { cellWidth: 60, halign: "right", fontStyle: "bold" },\n      3: { cellWidth: 55, halign: "right", fontStyle: "bold" },\n      4: { cellWidth: 55, halign: "right", fontStyle: "bold" },\n      5: { cellWidth: 52, halign: "right" },\n      6: { cellWidth: 60, halign: "right", fontStyle: "bold" },\n    },\n    didDrawPage: drawHeader,\n  });\n\n`;
  s = s.slice(0, summaryTableStart) + driverSummary + s.slice(summaryTableEnd);

  const detailStart = s.indexOf(detailMarker);
  const detailCallsMarker = '  addDetailTable("ABASTECIMENTOS / CUSTO DIESEL"';
  const detailEnd = s.indexOf(detailCallsMarker, detailStart);
  if (detailStart < 0 || detailEnd < 0) throw new Error('report-visual-20260917b: detail table helper not found');
  const detailHelper = `  const addDetailTable = (title: string, head: string[], body: any[][]) => {\n    if (body.length === 0) return;\n    let y = Number((doc as any).lastAutoTable?.finalY ?? 56) + 9;\n    if (y > pageHeight - 42) { doc.addPage("a3", "landscape"); y = 58; }\n    doc.setFont("helvetica", "bold");\n    doc.setFontSize(18);\n    doc.setTextColor(...black);\n    doc.text(title, pageWidth / 2, y - 3, { align: "center" });\n    autoTable(doc, {\n      head: [head], body, startY: y,\n      margin: { top: 56, right: reportMargin, bottom: 16, left: reportMargin },\n      theme: "grid", showHead: "everyPage", rowPageBreak: "avoid",\n      styles: { font: "helvetica", fontSize: 16, cellPadding: 2.2, textColor: black, fillColor: [255,255,255], lineColor: black, lineWidth: 0.16, halign: "center", valign: "middle", overflow: "linebreak" },\n      headStyles: { fillColor: lightHeader, textColor: black, fontStyle: "bold", fontSize: 16, halign: "center", lineColor: black },\n      didDrawPage: drawHeader,\n    });\n  };\n\n`;
  s = s.slice(0, detailStart) + detailHelper + s.slice(detailEnd);

  const footerStartMarker = '  const pages = doc.getNumberOfPages();';
  const footerEndMarker = '  const blob = doc.output("blob");';
  const footerStart = s.indexOf(footerStartMarker);
  const footerEnd = s.indexOf(footerEndMarker, footerStart);
  if (footerStart < 0 || footerEnd < 0) throw new Error('report-visual-20260917b: footer not found');
  const footer = `  const pages = doc.getNumberOfPages();\n  for (let page = 1; page <= pages; page += 1) {\n    doc.setPage(page);\n    doc.setFont("helvetica", "bold");\n    doc.setFontSize(16);\n    doc.setTextColor(...black);\n    doc.text(\`Faturamento: ${'${brl(totalFreight)}'}  •  Comissão: ${'${brl(totalCommission)}'}  •  Diesel: ${'${brl(totalDiesel)}'}  •  Líquido: ${'${brl(totalNetRevenue)}'}\`, reportMargin, pageHeight - 7);\n    doc.text(\`Página ${'${page}'}/${'${pages}'}\`, pageWidth - reportMargin, pageHeight - 7, { align: "right" });\n  }\n\n`;
  s = s.slice(0, footerStart) + footer + s.slice(footerEnd);
  write(rel, before, s);
}

// Remove all hard-coded "admin" operator arguments. The shared PDF resolves the
// currently authenticated management session at export time.
for (const rel of ['src/routes/dono/index.tsx', 'src/routes/dono/totais.tsx', 'src/routes/dono/viagens.tsx']) {
  const p = fp(rel);
  if (!fs.existsSync(p)) continue;
  const before = fs.readFileSync(p, 'utf8');
  const after = before.replace(/^\s*operatorName:\s*"admin",\s*$/gm, '');
  if (after !== before) fs.writeFileSync(p, after);
}

// Dashboard balloons: one consistent Total líquido = faturamento - diesel - comissão.
{
  const rel = 'src/routes/dono/index.tsx';
  const before = read(rel);
  let s = before;
  s = s.replace('xl:grid-cols-5', 'xl:grid-cols-4');
  s = s.replace(/^\s*<Kpi label="Total líquido" value=\{brl\(effectiveKpis\.revenue - kpis\.commissions\)\} large \/>\s*$/m, '');
  write(rel, before, s);
}

// General Excel: larger logo, A3 landscape, all text black, body/header >=16,
// exact period range + logged operator and highlighted financial totals.
{
  const rel = 'src/routes/dono/totais.tsx';
  const before = read(rel);
  let s = before;
  const fnMarker = '  async function exportExcelColorido() {\n';
  const excelMeta = `  async function exportExcelColorido() {\n    const { getManagementSession } = await import("@/lib/management-auth");\n    const management = await getManagementSession().catch(() => ({ authenticated: false as const, username: null, role: null }));\n    const excelOperator = management.authenticated && management.username ? management.username : "Gerência";\n    const now = new Date();\n    const toIso = (date: Date) => \`${'${date.getFullYear()}'}-${'${String(date.getMonth() + 1).padStart(2, "0")}'}-${'${String(date.getDate()).padStart(2, "0")}'}\`;\n    const todayIso = toIso(now);\n    const shift = (days: number) => { const d = new Date(now.getFullYear(), now.getMonth(), now.getDate()); d.setDate(d.getDate() + days); return toIso(d); };\n    const allDates = [\n      ...(data?.trips ?? []).map((x: any) => String(x.date ?? "").slice(0, 10)),\n      ...(data?.fuelings ?? []).map((x: any) => String(x.date ?? "").slice(0, 10)),\n      ...(data?.expenses ?? []).map((x: any) => String(x.date ?? "").slice(0, 10)),\n    ].filter((value: string) => /^\\d{4}-\\d{2}-\\d{2}$/.test(value)).sort();\n    const excelPeriodLabel = (() => {\n      if (period === "month") { const first = toIso(new Date(now.getFullYear(), now.getMonth(), 1)); const last = toIso(new Date(now.getFullYear(), now.getMonth() + 1, 0)); return \`Este mês (${'${formatDate(first)}'} a ${'${formatDate(last)}'})\`; }\n      if (period === "7d") return \`7 dias (${'${formatDate(shift(-6))}'} a ${'${formatDate(todayIso)}'})\`;\n      if (period === "30d") return \`30 dias (${'${formatDate(shift(-29))}'} a ${'${formatDate(todayIso)}'})\`;\n      if (allDates.length > 0) return \`Tudo (${'${formatDate(allDates[0])}'} a ${'${formatDate(allDates[allDates.length - 1])}'})\`;\n      return "Tudo";\n    })();\n`;
  s = mustReplace(s, fnMarker, excelMeta, 'Excel operator metadata');
  s = s.replace('paperSize: 9', 'paperSize: 8');
  s = s.replace(/const blue = "159EFF", dark = "073763", white = "FFFFFF", black = "111827", pale = "EAF6FF";/, 'const blue = "C9D7E3", dark = "E8EEF3", white = "111111", black = "111111", pale = "F7F9FB", totalFill = "FFF2CC";');
  s = s.replace(/sheet\.addImage\(logoId, \{ tl: \{ col: 0\.08, row: 0\.02 \}, ext: \{ width: 305, height: 155 \} \}\);/, 'sheet.addImage(logoId, { tl: { col: 0.04, row: 0.01 }, ext: { width: 390, height: 195 } });');
  s = s.replace('sheet.mergeCells("D1:H2"); sheet.getCell("D1").value = "PLANILHA GERAL - TRANS SALOMÃO"; sheet.getCell("D1").font = { bold: true, size: 24, color: { argb: white } };', 'sheet.mergeCells("D1:H2"); sheet.getCell("D1").value = "PLANILHA GERAL - TRANS SALOMÃO"; sheet.getCell("D1").font = { bold: true, size: 26, color: { argb: black } };');
  s = s.replace('sheet.mergeCells("D3:H3"); sheet.getCell("D3").value = `Período: ${periodLabel}`; sheet.getCell("D3").font = { bold: true, color: { argb: black } };', 'sheet.mergeCells("D3:H4"); sheet.getCell("D3").value = `${excelPeriodLabel} • Relatórios • Operador: ${excelOperator}`; sheet.getCell("D3").font = { bold: true, size: 16, color: { argb: black } };');
  s = s.replace('sheet.getRow(1).height = 58; sheet.getRow(2).height = 54; sheet.getRow(3).height = 30;', 'sheet.getRow(1).height = 72; sheet.getRow(2).height = 66; sheet.getRow(3).height = 36; sheet.getRow(4).height = 36;');
  s = s.replace(/const styleHeader = \(row: any\) => row\.eachCell\(\(cell: any\) => \{ cell\.font = \{ bold: true, color: \{ argb: white \}, size: 12 \}; cell\.fill = \{ type: "pattern", pattern: "solid", fgColor: \{ argb: blue \} \}; cell\.alignment = \{ horizontal: "center", vertical: "middle", wrapText: true \}; cell\.border = border; \}\);/, 'const styleHeader = (row: any) => row.eachCell((cell: any) => { cell.font = { bold: true, color: { argb: black }, size: 16 }; cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: blue } }; cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true }; cell.border = border; });');
  s = s.replace(/const styleRow = \(row: any, index: number\) => row\.eachCell\(\(cell: any\) => \{ cell\.font = \{ color: \{ argb: black \}, size: 11 \};/, 'const styleRow = (row: any, index: number) => row.eachCell((cell: any) => { cell.font = { color: { argb: black }, size: 16 };');
  s = s.replace(/const addSection = \(title: string, headers: string\[\]\) => \{ sheet\.addRow\(\[\]\); const titleRow = sheet\.addRow\(\[title\]\); sheet\.mergeCells\(titleRow\.number, 1, titleRow\.number, 8\); titleRow\.height = 24; const cell = sheet\.getCell\(titleRow\.number, 1\); cell\.font = \{ bold: true, size: 14, color: \{ argb: white \} \};/, 'const addSection = (title: string, headers: string[]) => { sheet.addRow([]); const titleRow = sheet.addRow([title]); sheet.mergeCells(titleRow.number, 1, titleRow.number, 8); titleRow.height = 34; const cell = sheet.getCell(titleRow.number, 1); cell.font = { bold: true, size: 18, color: { argb: black } };');
  s = s.replace('const header = sheet.addRow(headers); header.height = 26; styleHeader(header);', 'const header = sheet.addRow(headers); header.height = 38; styleHeader(header);');
  s = s.replace('summary.height = 28;', 'summary.height = 42;');
  s = s.replace(/summary\.eachCell\(\(cell: any, col: number\) => \{ cell\.font = \{ bold: true, color: \{ argb: col % 2 \? dark : black \}, size: 10 \}; cell\.fill = \{ type: "pattern", pattern: "solid", fgColor: \{ argb: col % 2 \? pale : white \} \};/, 'summary.eachCell((cell: any, col: number) => { cell.font = { bold: true, color: { argb: black }, size: 16 }; cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: totalFill } };');
  s = s.replace('tripHeader.height = 32;', 'tripHeader.height = 42;');
  s = s.replace(/for \(let c = 4; c <= 8; c \+= 1\) row\.getCell\(c\)\.numFmt = 'R\$ #,##0\.00';/, 'for (let c = 4; c <= 8; c += 1) { row.getCell(c).numFmt = \'R$ #,##0.00\'; row.getCell(c).font = { bold: true, color: { argb: black }, size: 16 }; }');
  s = s.replace('[34, 23, 18, 24, 24, 24, 24, 27]', '[40, 30, 20, 28, 28, 28, 28, 32]');
  write(rel, before, s);
}

// Viagens Excel: same black 16pt standard and a larger logo.
{
  const rel = 'src/routes/dono/viagens.tsx';
  const before = read(rel);
  let s = before;
  s = s.replace(/sheet\.addImage\(logoId,\s*\{[\s\S]*?\}\);/, 'sheet.addImage(logoId, { tl: { col: 0.04, row: 0.01 }, ext: { width: 390, height: 195 } });');
  s = s.replace(/size: 18, color: \{ argb: "FFFFFF" \}/g, 'size: 26, color: { argb: "111111" }');
  s = s.replace(/cell\.font = \{ bold: true, color: \{ argb: "FFFFFF" \} \}/g, 'cell.font = { bold: true, size: 16, color: { argb: "111111" } }');
  s = s.replace(/cell\.font = \{ color: \{ argb: "111827" \} \}/g, 'cell.font = { color: { argb: "111111" }, size: 16 }');
  s = s.replace(/fgColor: \{ argb: "073763" \}/g, 'fgColor: { argb: "E8EEF3" }');
  s = s.replace(/fgColor: \{ argb: "159EFF" \}/g, 'fgColor: { argb: "DDE6EE" }');
  write(rel, before, s);
}

// Driver-only exports also use black text and readable 16px tables.
{
  const rel = 'src/routes/klebersom.tsx';
  const p = fp(rel);
  if (fs.existsSync(p)) {
    const before = fs.readFileSync(p, 'utf8');
    let s = before;
    s = s.replace('body{font-family:Arial,sans-serif;color:#132033} h1{font-size:20px;margin:0 0 4px} p{margin:0 0 12px;color:#546173}', 'body{font-family:Arial,sans-serif;color:#000} h1{font-size:24px;margin:0 0 6px;color:#000} p{margin:0 0 12px;color:#000;font-size:16px}');
    s = s.replace('table{border-collapse:collapse;width:100%;font-size:11px} th{background:#102a43;color:white;font-weight:700;padding:7px;border:1px solid #7c8da0;text-align:left}', 'table{border-collapse:collapse;width:100%;font-size:16px;color:#000} th{background:#e8eef3;color:#000;font-weight:700;padding:9px;border:1px solid #000;text-align:left}');
    s = s.replace('@page{size:A4 landscape;margin:8mm} *{box-sizing:border-box} body{font-family:Arial,sans-serif;color:#111827;margin:0} h1{font-size:16px;margin:0 0 3px} .meta{font-size:9px;color:#4b5563;margin-bottom:8px}', '@page{size:A3 landscape;margin:10mm} *{box-sizing:border-box} body{font-family:Arial,sans-serif;color:#000;margin:0} h1{font-size:24px;margin:0 0 6px;color:#000} .meta{font-size:16px;color:#000;margin-bottom:10px}');
    s = s.replace('table{width:100%;border-collapse:collapse;table-layout:auto;font-size:7.7px} thead{display:table-header-group} th{background:#102a43;color:#fff;padding:4px 3px;border:1px solid #8492a6;white-space:nowrap;text-align:left}', 'table{width:100%;border-collapse:collapse;table-layout:auto;font-size:16px;color:#000} thead{display:table-header-group} th{background:#e8eef3;color:#000;padding:7px 5px;border:1px solid #000;white-space:nowrap;text-align:left}');
    s = s.replace('.summary{margin-top:8px;font-size:8px}.summary td{background:#e8f1fb;font-weight:700}', '.summary{margin-top:10px;font-size:16px;color:#000}.summary td{background:#fff2cc;font-weight:700;color:#000}');
    s = s.replace('.note{font-size:8px;margin-top:5px;color:#52606d}', '.note{font-size:16px;margin-top:7px;color:#000}');
    if (s !== before) fs.writeFileSync(p, s);
  }
}

console.log('[report-visual-20260917b] A3 + logo + 16pt black text + operator/date ranges + totals hierarchy applied');
