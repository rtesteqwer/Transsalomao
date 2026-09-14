import fs from 'node:fs';
import path from 'node:path';

const target = process.argv[2];
if (!target) throw new Error('general-download-pdf-fuelings: target missing');
const repo = process.cwd();

function requiredReplace(text, needle, replacement, label) {
  if (text.includes(replacement)) return text;
  if (!text.includes(needle)) throw new Error(`general-download-pdf-fuelings: pattern not found (${label})`);
  return text.replace(needle, replacement);
}

// 1) Corrige o Excel geral: a ultima ampliacao deixou D2:G2 e G2:I2
// sobrepostos. ExcelJS interrompe a geracao ao tentar mesclar G2 duas vezes.
{
  const p = path.join(repo, 'render-overrides', 'admin-excel.snippet.ts');
  let s = fs.readFileSync(p, 'utf8');
  s = s.replaceAll('worksheet.mergeCells("D2:G2")', 'worksheet.mergeCells("D2:F2")');
  s = s.replaceAll('link.download = `Relatorio_', 'link.download = `Planilha_Geral_');
  if (s.includes('worksheet.mergeCells("D2:G2")') && s.includes('worksheet.mergeCells("G2:I2")')) {
    throw new Error('general-download-pdf-fuelings: overlapping Excel header merges remain');
  }
  fs.writeFileSync(p, s);
}

// 2) Renomeia o botao de exportacao na tela de Relatorios/Totais.
{
  const p = path.join(target, 'src/routes/dono/totais.tsx');
  let s = fs.readFileSync(p, 'utf8');
  s = s.replaceAll('Excel colorido (.xlsx)', 'Download Planilha Geral');
  s = s.replaceAll('Excel colorido', 'Download Planilha Geral');
  fs.writeFileSync(p, s);
}

// 3) Adiciona a categoria Abastecimentos ao gerador central de PDF.
// Como diario/semanal/mensal/completo usam este mesmo gerador, a categoria
// passa a existir em todos os tipos de PDF com os abastecimentos do periodo.
{
  const p = path.join(target, 'src/lib/pdf.ts');
  let s = fs.readFileSync(p, 'utf8');

  if (!s.includes('const normalizedFuelingsForPdf = fuelings')) {
    s = requiredReplace(
      s,
      '  const commissionPayableForAdvance = grossCommissionForAdvance - totalAdvances;',
      `  const commissionPayableForAdvance = grossCommissionForAdvance - totalAdvances;\n  const normalizedFuelingsForPdf = fuelings\n    .filter((item: any) => Number(item?.liters ?? 0) > 0)\n    .map((item: any) => {\n      const litersValue = Number(item?.liters ?? 0);\n      const priceValue = Number(item?.pricePerLiter ?? 0);\n      const relatedTrip = trips.find((trip: any) =>\n        String(trip?.driverId ?? "") === String(item?.driverId ?? "") ||\n        String(trip?.fleetId ?? "") === String(item?.fleetId ?? ""),\n      ) as any;\n      return {\n        date: String(item?.date ?? ""),\n        driverName: String(item?.driverName ?? relatedTrip?.driverName ?? driverName ?? "Motorista"),\n        fleetName: String(item?.fleetName ?? relatedTrip?.fleetName ?? "Conjunto não informado"),\n        liters: litersValue,\n        pricePerLiter: priceValue,\n        total: litersValue * priceValue,\n      };\n    })\n    .sort((a, b) => a.date.localeCompare(b.date) || a.driverName.localeCompare(b.driverName, "pt-BR"));\n  const totalFuelingsForPdf = normalizedFuelingsForPdf.reduce((sum, item) => sum + item.total, 0);`,
      'normalize fuelings',
    );
  }

  if (!s.includes('Abastecimentos - continuação')) {
    s = requiredReplace(
      s,
      '  const blob = buildPdf(pages.map((item) => item.ops.join("\\n")));',
      `  if (normalizedFuelingsForPdf.length > 0) {\n    let fuelingPageNumber = pages.length + 1;\n    let fuelingPage = new PdfPage();\n\n    const startFuelingPage = (pageItem: PdfPage, pageNumber: number, continuation = false) => {\n      drawPageShell(pageItem, pageNumber);\n      drawHeaderCard(\n        pageItem,\n        driverName,\n        periodLabel ?? "Selecionado",\n        sourceLabel ?? "Gerência",\n        generatedAt,\n        reportTitle ?? "Relatório operacional por motorista",\n        operatorName,\n      );\n      pageItem.text(continuation ? "Abastecimentos - continuação" : "Abastecimentos", MARGIN, topToY(214), {\n        size: 13, bold: true, color: colors.fg,\n      });\n      if (continuation) return 246;\n\n      pageItem.rect(MARGIN, PAGE_H - 246 - 72, CONTENT_W, 72, colors.surface, colors.border);\n      pageItem.text("CATEGORIA", MARGIN + 16, topToY(266), { size: 8, bold: true, color: colors.muted });\n      pageItem.text("ABASTECIMENTOS", MARGIN + 16, topToY(290), { size: 13, bold: true, color: colors.fg });\n      pageItem.text("LANÇAMENTOS", MARGIN + 285, topToY(266), { size: 8, bold: true, color: colors.muted });\n      pageItem.text(String(normalizedFuelingsForPdf.length), MARGIN + 285, topToY(290), { size: 13, bold: true, color: colors.fg });\n      pageItem.text("CUSTO TOTAL", MARGIN + 545, topToY(266), { size: 8, bold: true, color: colors.muted });\n      pageItem.text(brl(totalFuelingsForPdf), MARGIN + 545, topToY(290), { size: 13, bold: true, color: colors.danger });\n      pageItem.text("DATA", MARGIN + 12, topToY(326), { size: 7.4, bold: true, color: colors.muted });\n      pageItem.text("MOTORISTA", MARGIN + 104, topToY(326), { size: 7.4, bold: true, color: colors.muted });\n      pageItem.text("CONJUNTO", MARGIN + 300, topToY(326), { size: 7.4, bold: true, color: colors.muted });\n      pageItem.text("LITROS", MARGIN + 500, topToY(326), { size: 7.4, bold: true, color: colors.muted });\n      pageItem.text("PREÇO/L", MARGIN + 585, topToY(326), { size: 7.4, bold: true, color: colors.muted });\n      pageItem.text("TOTAL", MARGIN + 680, topToY(326), { size: 7.4, bold: true, color: colors.muted });\n      return 346;\n    };\n\n    let fuelingTop = startFuelingPage(fuelingPage, fuelingPageNumber);\n    for (const item of normalizedFuelingsForPdf) {\n      if (fuelingTop + 50 > 754) {\n        pages.push(fuelingPage);\n        fuelingPageNumber += 1;\n        fuelingPage = new PdfPage();\n        fuelingTop = startFuelingPage(fuelingPage, fuelingPageNumber, true);\n      }\n      fuelingPage.rect(MARGIN, PAGE_H - fuelingTop - 42, CONTENT_W, 42, colors.surface, colors.border);\n      fuelingPage.text(formatDate(item.date), MARGIN + 12, topToY(fuelingTop + 17), { size: 7.7, bold: true, color: colors.fg });\n      fuelingPage.text(item.driverName, MARGIN + 104, topToY(fuelingTop + 17), { size: 7.7, bold: true, color: colors.fg });\n      fuelingPage.text(item.fleetName, MARGIN + 300, topToY(fuelingTop + 17), { size: 7.5, color: colors.fg });\n      fuelingPage.text(item.liters.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " L", MARGIN + 500, topToY(fuelingTop + 17), { size: 7.7, color: colors.fg });\n      fuelingPage.text(brl(item.pricePerLiter), MARGIN + 585, topToY(fuelingTop + 17), { size: 7.7, color: colors.fg });\n      fuelingPage.text(brl(item.total), MARGIN + 680, topToY(fuelingTop + 17), { size: 8, bold: true, color: colors.danger });\n      fuelingTop += 50;\n    }\n    pages.push(fuelingPage);\n  }\n\n  const blob = buildPdf(pages.map((item) => item.ops.join("\\n")));`,
      'fuelings pages',
    );
  }

  fs.writeFileSync(p, s);
}

console.log('[general-download-pdf-fuelings] Excel download fixed + button renamed + Abastecimentos added to PDFs');
