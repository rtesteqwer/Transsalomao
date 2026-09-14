import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const target = process.argv[2];
if (!target) throw new Error('apply-driver-advances-safe: target missing');

const repo = process.cwd();
const originalPath = path.join(repo, 'render-overrides', 'apply-driver-advances.mjs');
let source = fs.readFileSync(originalPath, 'utf8');

const marker1 = source.indexOf("'quick pdf advance rows'");
const marker2 = source.indexOf("'quick pdf advances'", marker1 + 1);
if (marker1 < 0 || marker2 < 0) throw new Error('apply-driver-advances-safe: quick PDF markers missing');

const start = source.lastIndexOf('  s = replaceRequired(', marker1);
const secondStart = source.lastIndexOf('  s = replaceRequired(', marker2);
const secondEndMarker = source.indexOf('\n  );', marker2);
if (start < 0 || secondStart < 0 || secondEndMarker < 0) {
  throw new Error('apply-driver-advances-safe: quick PDF patch block not found');
}
const end = secondEndMarker + '\n  );'.length;

const robustQuickPatch = `  {
    const quickStart = s.indexOf('  function quickPdf(');
    if (quickStart < 0) throw new Error('apply-driver-advances: quickPdf function not found');
    const nextFunction = s.indexOf('\\n  function ', quickStart + 20);
    const quickEnd = nextFunction < 0 ? s.length : nextFunction;
    let quick = s.slice(quickStart, quickEnd);
    quick = replaceRequired(
      quick,
      '\\n    downloadDriverReportPdf({',
      '\\n    const advanceRows = data.expenses\\n      .filter((e) => {\\n        if (e.category !== "Adiantamento" || !e.driverId) return false;\\n        if (kind === "day") return e.date === new Date().toISOString().slice(0, 10);\\n        if (kind === "week") return inPeriod(e.date, "7d");\\n        if (kind === "month") return inPeriod(e.date, "month");\\n        return true;\\n      })\\n      .map((e) => ({ driverId: e.driverId!, driverName: data.drivers.find((d) => d.id === e.driverId)?.name ?? "Motorista removido", date: e.date, amount: e.amount, description: e.description }));\\n    downloadDriverReportPdf({',
      'quick pdf advance rows',
    );
    quick = replaceRequired(
      quick,
      '      fuelings: fuelRows,\\n',
      '      fuelings: fuelRows,\\n      advances: advanceRows,\\n',
      'quick pdf advances',
    );
    s = s.slice(0, quickStart) + quick + s.slice(quickEnd);
  }`;

source = source.slice(0, start) + robustQuickPatch + source.slice(end);

const temp = path.join(os.tmpdir(), `apply-driver-advances-${Date.now()}.mjs`);
fs.writeFileSync(temp, source);
execFileSync(process.execPath, [temp, target], { cwd: repo, stdio: 'inherit' });
fs.rmSync(temp, { force: true });

function replaceStable(text, needle, replacement, label) {
  if (text.includes(replacement)) return text;
  if (!text.includes(needle)) throw new Error(`apply-driver-advances-safe: pattern not found (${label})`);
  return text.replace(needle, replacement);
}

function patchOverride(name, mutator) {
  const p = path.join(repo, 'render-overrides', name);
  const before = fs.readFileSync(p, 'utf8');
  const after = mutator(before);
  fs.writeFileSync(p, after);
}

// O painel exclusivo do motorista tem um backend e geradores próprios.
// Adiantamento é pagamento antecipado de comissão: não deve ser contado de novo
// como despesa operacional e precisa reduzir somente a comissão ainda a pagar.
patchOverride('klebersom-access.server.ts', (input) => {
  let s = input;
  s = replaceStable(
    s,
    `    const billing = trips.reduce((total, trip) => total + trip.freight, 0);\n    const commission = trips.reduce((total, trip) => total + trip.commission, 0);\n    const explicitExpenses = expenses.reduce((total, expense) => total + expense.amount, 0);\n    const fuelExpenses = fuelings.reduce((total, fueling) => total + fueling.amount, 0);\n    const totalExpenses = explicitExpenses + fuelExpenses;\n    const result = billing - commission - totalExpenses;`,
    `    const billing = trips.reduce((total, trip) => total + trip.freight, 0);\n    const commission = trips.reduce((total, trip) => total + trip.commission, 0);\n    const advances = expenses\n      .filter((expense) => expense.category === "Adiantamento")\n      .reduce((total, expense) => total + expense.amount, 0);\n    const commissionPayable = commission - advances;\n    const explicitExpenses = expenses\n      .filter((expense) => expense.category !== "Adiantamento")\n      .reduce((total, expense) => total + expense.amount, 0);\n    const fuelExpenses = fuelings.reduce((total, fueling) => total + fueling.amount, 0);\n    const totalExpenses = explicitExpenses + fuelExpenses;\n    const result = billing - commission - totalExpenses;`,
    'driver dashboard commission/advances totals',
  );
  s = replaceStable(
    s,
    `        billing,\n        commission,\n        explicitExpenses,`,
    `        billing,\n        commission,\n        advances,\n        commissionPayable,\n        explicitExpenses,`,
    'driver dashboard totals payload',
  );
  return s;
});

patchOverride('driver-pdf.snippet.ts', (input) => {
  let s = input;
  s = replaceStable(
    s,
    `  const netBilling = Number(data.totals.billing ?? 0) - Number(data.totals.commission ?? 0);`,
    `  const commissionGross = Number(data.totals.commission ?? 0);\n  const advanceRows = (data.expenses ?? []).filter((item: any) => item.category === "Adiantamento");\n  const advanceTotal = Number(data.totals.advances ?? advanceRows.reduce((sum: number, item: any) => sum + Number(item.amount ?? 0), 0));\n  const commissionPayable = Number(data.totals.commissionPayable ?? (commissionGross - advanceTotal));\n  const netBilling = Number(data.totals.billing ?? 0) - commissionGross;`,
    'driver pdf advance totals',
  );
  s = replaceStable(s, '    doc.text("COMISSÃO TOTAL", 254, 8, { align: "center" });', '    doc.text("COMISSÃO A PAGAR", 254, 8, { align: "center" });', 'driver pdf header label');
  s = replaceStable(s, '    doc.text(money(data.totals.commission), 254, 14.7, { align: "center" });', '    doc.text(money(commissionPayable), 254, 14.7, { align: "center" });', 'driver pdf header value');
  s = replaceStable(
    s,
    '    head: [["Motorista", "Faturamento", "Comissão", "Faturamento líquido", "Despesas", "Resultado"]],',
    '    head: [["Motorista", "Faturamento", "Comissão bruta", "Adiantamentos", "Comissão a pagar", "Despesas", "Resultado"]],',
    'driver pdf summary headers',
  );
  s = replaceStable(
    s,
    `      money(data.totals.billing),\n      money(data.totals.commission),\n      money(netBilling),\n      money(data.totals.totalExpenses),\n      money(data.totals.result),`,
    `      money(data.totals.billing),\n      money(commissionGross),\n      money(advanceTotal),\n      money(commissionPayable),\n      money(data.totals.totalExpenses),\n      money(data.totals.result),`,
    'driver pdf summary values',
  );
  s = replaceStable(
    s,
    `      0: { cellWidth: 72 },\n      1: { cellWidth: 42, halign: "right" },\n      2: { cellWidth: 42, halign: "right" },\n      3: { cellWidth: 46, halign: "right" },\n      4: { cellWidth: 38, halign: "right" },\n      5: { cellWidth: 38, halign: "right" },`,
    `      0: { cellWidth: 58 },\n      1: { cellWidth: 40, halign: "right" },\n      2: { cellWidth: 38, halign: "right" },\n      3: { cellWidth: 36, halign: "right" },\n      4: { cellWidth: 40, halign: "right" },\n      5: { cellWidth: 35, halign: "right" },\n      6: { cellWidth: 35, halign: "right" },`,
    'driver pdf summary widths',
  );
  s = replaceStable(
    s,
    `    didDrawPage: drawHeader,\n  });\n\n  const pages = doc.getNumberOfPages();`,
    `    didDrawPage: drawHeader,\n  });\n\n  if (advanceRows.length > 0) {\n    let advanceY = Number((doc as any).lastAutoTable?.finalY ?? summaryY) + 5;\n    if (advanceY > 176) {\n      doc.addPage("a4", "landscape");\n      advanceY = 29;\n    }\n    autoTable(doc, {\n      head: [["Data", "Descrição do adiantamento", "Valor adiantado"]],\n      body: advanceRows.map((item: any) => [date(String(item.date ?? "")), String(item.description ?? "Adiantamento"), money(Number(item.amount ?? 0))]),\n      startY: advanceY,\n      margin: { top: 25, right: 7, bottom: 8, left: 7 },\n      theme: "grid",\n      styles: { font: "helvetica", fontSize: 7, cellPadding: 1.2, textColor: black, fillColor: [255, 255, 255], lineColor: blue, lineWidth: 0.16 },\n      headStyles: { fillColor: dark, textColor: [255, 255, 255], fontStyle: "bold", fontSize: 7 },\n      columnStyles: { 0: { cellWidth: 32 }, 1: { cellWidth: 185 }, 2: { cellWidth: 60, halign: "right" } },\n      didDrawPage: drawHeader,\n    });\n  }\n\n  const pages = doc.getNumberOfPages();`,
    'driver pdf advance detail table',
  );
  s = replaceStable(
    s,
    '    doc.text(`Fretes: ${data.totals.trips}  •  Peso: ${exactTons(data.totals.totalTons)}  •  Faturamento: ${money(data.totals.billing)}  •  Comissão: ${money(data.totals.commission)}  •  Líquido: ${money(netBilling)}`, 7, 205);',
    '    doc.text(`Fretes: ${data.totals.trips}  •  Comissão bruta: ${money(commissionGross)}  •  Adiantamentos: ${money(advanceTotal)}  •  Comissão a pagar: ${money(commissionPayable)}`, 7, 205);',
    'driver pdf footer advances',
  );
  return s;
});

patchOverride('driver-excel.snippet.ts', (input) => {
  let s = input;
  s = replaceStable(
    s,
    `  const lightGray = "F7FAFC";`,
    `  const lightGray = "F7FAFC";\n  const commissionGross = Number(data.totals.commission ?? 0);\n  const advanceRows = (data.expenses ?? []).filter((item: any) => item.category === "Adiantamento");\n  const advanceTotal = Number(data.totals.advances ?? advanceRows.reduce((sum: number, item: any) => sum + Number(item.amount ?? 0), 0));\n  const commissionPayable = Number(data.totals.commissionPayable ?? (commissionGross - advanceTotal));`,
    'driver excel advance totals',
  );
  s = replaceStable(s, '  worksheet.getCell("G2").value = `COMISSÃO TOTAL: ${money(data.totals.commission)}`;', '  worksheet.getCell("G2").value = `COMISSÃO A PAGAR: ${money(commissionPayable)}`;', 'driver excel header');
  s = replaceStable(
    s,
    `  const summaryItems = [\n    ["FATURAMENTO", money(data.totals.billing)],\n    ["DESPESAS", money(data.totals.explicitExpenses)],\n    ["DIESEL", money(data.totals.fuelExpenses)],\n    ["COMISSÃO", money(data.totals.commission)],\n    ["RESULTADO", money(data.totals.result)],\n  ];`,
    `  const summaryItems = [\n    ["FATURAMENTO", money(data.totals.billing)],\n    ["COMISSÃO BRUTA", money(commissionGross)],\n    ["ADIANTAMENTOS", money(advanceTotal)],\n    ["COMISSÃO A PAGAR", money(commissionPayable)],\n    ["RESULTADO", money(data.totals.result)],\n  ];`,
    'driver excel top summary',
  );
  s = replaceStable(
    s,
    `    ["Faturamento total", money(data.totals.billing)],\n    ["Comissão total", money(data.totals.commission)],\n    ["Despesas lançadas", money(data.totals.explicitExpenses)],`,
    `    ["Faturamento total", money(data.totals.billing)],\n    ["Comissão bruta", money(commissionGross)],\n    ["Adiantamentos", money(advanceTotal)],\n    ["Comissão a pagar", money(commissionPayable)],\n    ["Despesas lançadas", money(data.totals.explicitExpenses)],`,
    'driver excel summary sheet totals',
  );
  s = replaceStable(
    s,
    `  const buffer = await workbook.xlsx.writeBuffer();`,
    `  if (advanceRows.length > 0) {\n    const advancesSheet = workbook.addWorksheet("Adiantamentos");\n    advancesSheet.addRow(["Data", "Motorista", "Descrição", "Valor", "Observação"]);\n    advanceRows.forEach((item: any) => advancesSheet.addRow([date(String(item.date ?? "")), data.driver.name, String(item.description ?? "Adiantamento"), money(Number(item.amount ?? 0)), String(item.notes ?? "")]));\n    const advanceHeader = advancesSheet.getRow(1);\n    advanceHeader.font = { bold: true, color: { argb: white } };\n    advanceHeader.fill = { type: "pattern", pattern: "solid", fgColor: { argb: dark } };\n    advanceHeader.alignment = { horizontal: "center" };\n    [14, 28, 42, 18, 42].forEach((width, index) => { advancesSheet.getColumn(index + 1).width = width; });\n    advancesSheet.eachRow((row: any, rowNumber: number) => {\n      row.eachCell((cell: any) => {\n        cell.border = { top: { style: "thin", color: { argb: blue } }, bottom: { style: "thin", color: { argb: blue } }, left: { style: "thin", color: { argb: blue } }, right: { style: "thin", color: { argb: blue } } };\n        if (rowNumber > 1) cell.font = { color: { argb: black } };\n      });\n    });\n  }\n\n  const buffer = await workbook.xlsx.writeBuffer();`,
    'driver excel advance details sheet',
  );
  return s;
});

console.log('[driver-advances-safe] dedicated driver PDF/Excel now subtract advances from commission');
