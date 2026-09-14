import fs from 'node:fs';
import path from 'node:path';

const target = process.argv[2];
if (!target) throw new Error('pdf-advances-sync: target missing');

function read(rel) {
  const p = path.join(target, rel);
  if (!fs.existsSync(p)) throw new Error(`pdf-advances-sync: missing ${rel}`);
  return fs.readFileSync(p, 'utf8');
}
function write(rel, text) {
  fs.writeFileSync(path.join(target, rel), text);
}
function replaceRequired(text, needle, replacement, label) {
  if (text.includes(replacement)) return text;
  if (!text.includes(needle)) throw new Error(`pdf-advances-sync: pattern not found (${label})`);
  return text.replace(needle, replacement);
}

// O gerador principal de PDF estava ignorando completamente `advances`, apesar
// de a tela de Relatórios já calcular corretamente os adiantamentos por driver.
{
  const rel = 'src/lib/pdf.ts';
  let s = read(rel);

  s = replaceRequired(
    s,
    `  trips,\n  fuelings = [],\n  periodLabel,`,
    `  trips,\n  fuelings = [],\n  advances = [],\n  periodLabel,`,
    'pdf advances argument',
  );

  s = replaceRequired(
    s,
    `  trips: ComputedTrip[];\n  fuelings?: ReportFueling[];\n  periodLabel?: string;`,
    `  trips: ComputedTrip[];\n  fuelings?: ReportFueling[];\n  advances?: Array<{ driverId: string; driverName?: string; date: string; amount: number; description?: string }>;\n  periodLabel?: string;`,
    'pdf advances type',
  );

  s = replaceRequired(
    s,
    `  const pages: PdfPage[] = [];\n  const generatedAt = new Date().toLocaleString("pt-BR");`,
    `  const pages: PdfPage[] = [];\n  const generatedAt = new Date().toLocaleString("pt-BR");\n  const normalizedAdvances = advances\n    .filter((item) => Number(item.amount ?? 0) > 0)\n    .map((item) => ({\n      driverId: String(item.driverId ?? ""),\n      driverName: String(item.driverName ?? driverName ?? "Motorista"),\n      date: String(item.date ?? ""),\n      amount: Number(item.amount ?? 0),\n      description: String(item.description ?? "Adiantamento"),\n    }))\n    .sort((a, b) => a.date.localeCompare(b.date) || a.driverName.localeCompare(b.driverName, "pt-BR"));\n  const totalAdvances = normalizedAdvances.reduce((sum, item) => sum + item.amount, 0);\n  const grossCommissionForAdvance = trips.reduce((sum, trip: any) => sum + Number(trip.commissionValue ?? trip.commission ?? 0), 0);\n  const commissionPayableForAdvance = grossCommissionForAdvance - totalAdvances;`,
    'pdf normalize advances',
  );

  s = replaceRequired(
    s,
    `  const blob = buildPdf(pages.map((item) => item.ops.join("\\n")));`,
    `  if (normalizedAdvances.length > 0) {\n    let advancePageNumber = pages.length + 1;\n    let advancePage = new PdfPage();\n\n    const startAdvancePage = (pageItem: PdfPage, pageNumber: number, continuation = false) => {\n      drawPageShell(pageItem, pageNumber);\n      drawHeaderCard(\n        pageItem,\n        driverName,\n        periodLabel ?? "Selecionado",\n        sourceLabel ?? "Gerência",\n        generatedAt,\n        reportTitle ?? "Relatório operacional por motorista",\n        operatorName,\n      );\n      pageItem.text(continuation ? "Adiantamentos - continuação" : "Adiantamentos e comissão", MARGIN, topToY(214), {\n        size: 13, bold: true, color: colors.fg,\n      });\n      if (continuation) return 246;\n\n      pageItem.rect(MARGIN, PAGE_H - 246 - 72, CONTENT_W, 72, colors.surface, colors.border);\n      pageItem.text("COMISSÃO BRUTA", MARGIN + 16, topToY(266), { size: 8, bold: true, color: colors.muted });\n      pageItem.text(brl(grossCommissionForAdvance), MARGIN + 16, topToY(290), { size: 14, bold: true, color: colors.fg });\n      pageItem.text("ADIANTAMENTOS", MARGIN + 250, topToY(266), { size: 8, bold: true, color: colors.muted });\n      pageItem.text(brl(totalAdvances), MARGIN + 250, topToY(290), { size: 14, bold: true, color: colors.danger });\n      pageItem.text("COMISSÃO A PAGAR", MARGIN + 500, topToY(266), { size: 8, bold: true, color: colors.muted });\n      pageItem.text(brl(commissionPayableForAdvance), MARGIN + 500, topToY(290), { size: 14, bold: true, color: colors.ok });\n      return 338;\n    };\n\n    let advanceTop = startAdvancePage(advancePage, advancePageNumber);\n    for (const item of normalizedAdvances) {\n      if (advanceTop + 58 > 754) {\n        pages.push(advancePage);\n        advancePageNumber += 1;\n        advancePage = new PdfPage();\n        advanceTop = startAdvancePage(advancePage, advancePageNumber, true);\n      }\n      advancePage.rect(MARGIN, PAGE_H - advanceTop - 50, CONTENT_W, 50, colors.surface, colors.border);\n      advancePage.text(formatDate(item.date), MARGIN + 12, topToY(advanceTop + 19), { size: 8.2, bold: true, color: colors.fg });\n      advancePage.text(item.driverName, MARGIN + 105, topToY(advanceTop + 19), { size: 8.2, bold: true, color: colors.fg });\n      advancePage.text(item.description, MARGIN + 320, topToY(advanceTop + 19), { size: 7.8, color: colors.muted });\n      advancePage.text(brl(item.amount), MARGIN + 650, topToY(advanceTop + 19), { size: 9, bold: true, color: colors.danger });\n      advanceTop += 58;\n    }\n    pages.push(advancePage);\n  }\n\n  const blob = buildPdf(pages.map((item) => item.ops.join("\\n")));`,
    'pdf advances pages',
  );

  write(rel, s);
}

// Todas as formas de gerar PDF devem enviar os mesmos adiantamentos que a tela
// usa para exibir o valor e calcular a comissão a pagar.
{
  const rel = 'src/routes/dono/totais.tsx';
  let s = read(rel);

  s = replaceRequired(
    s,
    `              trips: computed,\n              fuelings,\n              periodLabel,`,
    `              trips: computed,\n              fuelings,\n              advances: periodAdvances,\n              periodLabel,`,
    'general pdf advances',
  );

  s = replaceRequired(
    s,
    `                    trips: computed.filter((t) => t.driverId === d.driverId),\n                    fuelings: fuelForDriver(d.driverId),\n                    periodLabel,`,
    `                    trips: computed.filter((t) => t.driverId === d.driverId),\n                    fuelings: fuelForDriver(d.driverId),\n                    advances: advancesForDriver(d.driverId),\n                    periodLabel,`,
    'driver card pdf advances',
  );

  s = replaceRequired(
    s,
    `        if (kind === "day") return e.date === new Date().toISOString().slice(0, 10);`,
    `        if (kind === "day") return e.date === isoToday;`,
    'quick daily advances local date',
  );

  write(rel, s);
}

console.log('[pdf-advances-sync] admin PDFs now use site advances by driver/period and subtract them from commission');
