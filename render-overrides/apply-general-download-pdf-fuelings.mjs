import fs from 'node:fs';
import path from 'node:path';

const target = process.argv[2];
if (!target) throw new Error('general-download-pdf-fuelings: target missing');
const repo = process.cwd();

// O Render substitui os motores de Excel/PDF depois do bootstrap. Por isso,
// nesta ultima etapa dos patches, gravamos os snippets finais que o render-build
// realmente injeta no aplicativo.
{
  const unifiedExcel = path.join(repo, 'render-overrides', 'admin-excel-unified.snippet.ts');
  const activeExcel = path.join(repo, 'render-overrides', 'admin-excel.snippet.ts');
  if (!fs.existsSync(unifiedExcel)) throw new Error('general-download-pdf-fuelings: unified Excel snippet missing');
  fs.copyFileSync(unifiedExcel, activeExcel);

  // Garante uma única folha no arquivo e impressão/exportação em uma única página.
  let excel = fs.readFileSync(activeExcel, 'utf8');
  const worksheetNeedle = '  const worksheet = workbook.addWorksheet("Planilha Geral", { views: [{ state: "frozen", ySplit: 6 }] });';
  const worksheetReplacement = `${worksheetNeedle}\n  worksheet.pageSetup = {\n    orientation: "landscape",\n    paperSize: 9,\n    fitToPage: true,\n    fitToWidth: 1,\n    fitToHeight: 1,\n    horizontalCentered: true,\n    verticalCentered: false,\n    margins: { left: 0.2, right: 0.2, top: 0.3, bottom: 0.3, header: 0.1, footer: 0.1 },\n  };`;
  if (!excel.includes('fitToWidth: 1')) {
    if (!excel.includes(worksheetNeedle)) throw new Error('general-download-pdf-fuelings: worksheet setup anchor missing');
    excel = excel.replace(worksheetNeedle, worksheetReplacement);
  }
  const worksheetCount = (excel.match(/addWorksheet\(/g) ?? []).length;
  if (worksheetCount !== 1) throw new Error(`general-download-pdf-fuelings: expected 1 worksheet, found ${worksheetCount}`);
  fs.writeFileSync(activeExcel, excel);
}

{
  const finalPdf = path.join(repo, 'render-overrides', 'pdf-export-final.snippet.ts');
  const activePdf = path.join(repo, 'render-overrides', 'pdf-export.snippet.ts');
  if (!fs.existsSync(finalPdf)) throw new Error('general-download-pdf-fuelings: final PDF snippet missing');

  // Ordena todas as categorias datadas do PDF do mais recente para o mais antigo.
  // Também ordena os grupos de fretes usando a data mais recente do grupo.
  let pdf = fs.readFileSync(finalPdf, 'utf8');
  const tripRowsNeedle = '  const tripRows = [...singles, ...grouped.values()].map((item: any) => {';
  const tripRowsReplacement = `  const tripRows = [...singles, ...grouped.values()]\n    .sort((a: any, b: any) => {\n      const aDate = a.kind === "single" ? reportDateKey(a.trip?.date) : String(a.lastDate ?? a.firstDate ?? "");\n      const bDate = b.kind === "single" ? reportDateKey(b.trip?.date) : String(b.lastDate ?? b.firstDate ?? "");\n      return bDate.localeCompare(aDate);\n    })\n    .map((item: any) => {`;
  if (!pdf.includes('return bDate.localeCompare(aDate);')) {
    if (!pdf.includes(tripRowsNeedle)) throw new Error('general-download-pdf-fuelings: trip PDF sort anchor missing');
    pdf = pdf.replace(tripRowsNeedle, tripRowsReplacement);
  }

  const fuelNeedle = '  const fuelingRows = fuelings.map((fueling: any) => {';
  const fuelReplacement = `  const fuelingRows = [...fuelings]\n    .sort((a: any, b: any) => reportDateKey(b?.date).localeCompare(reportDateKey(a?.date)))\n    .map((fueling: any) => {`;
  if (!pdf.includes('reportDateKey(b?.date).localeCompare(reportDateKey(a?.date))')) {
    if (!pdf.includes(fuelNeedle)) throw new Error('general-download-pdf-fuelings: fueling PDF sort anchor missing');
    pdf = pdf.replace(fuelNeedle, fuelReplacement);
  }

  const advanceNeedle = '  const advanceRows = advances.map((item: any) => [';
  const advanceReplacement = `  const advanceRows = [...advances]\n    .sort((a: any, b: any) => reportDateKey(b?.date).localeCompare(reportDateKey(a?.date)))\n    .map((item: any) => [`;
  if (!pdf.includes('const advanceRows = [...advances]')) {
    if (!pdf.includes(advanceNeedle)) throw new Error('general-download-pdf-fuelings: advance PDF sort anchor missing');
    pdf = pdf.replace(advanceNeedle, advanceReplacement);
  }

  fs.writeFileSync(activePdf, pdf);
}

// Mantem os dois downloads visiveis: geral conforme o periodo selecionado e
// mensal para o mes corrente. O botao CSV original fica oculto somente como
// ancora para a etapa posterior do render-build, que ainda procura esse padrao.
{
  const p = path.join(target, 'src/routes/dono/totais.tsx');
  let s = fs.readFileSync(p, 'utf8');
  const csvButton = /<button type="button" onClick=\{exportCurrent\} className="h-11 rounded-md border border-border px-4 text-sm text-fg hover:bg-surface-2">\s*Exportar CSV\s*<\/button>/m;
  if (!s.includes('Download Planilha Mensal')) {
    if (!csvButton.test(s)) throw new Error('general-download-pdf-fuelings: CSV anchor button not found');
    const original = s.match(csvButton)?.[0];
    if (!original) throw new Error('general-download-pdf-fuelings: CSV anchor capture failed');
    const buttons = `<div className="flex flex-wrap gap-2">\n          <button type="button" onClick={() => exportExcelColorido("current")} className="h-11 rounded-md border border-accent bg-bg px-4 text-sm font-semibold text-fg hover:bg-surface-2">\n            Download Planilha Geral\n          </button>\n          <button type="button" onClick={() => exportExcelColorido("month")} className="h-11 rounded-md border border-accent bg-accent px-4 text-sm font-semibold text-bg hover:opacity-90">\n            Download Planilha Mensal\n          </button>\n          <div className="hidden">\n            ${original}\n          </div>\n        </div>`;
    s = s.replace(csvButton, buttons);
  }
  fs.writeFileSync(p, s);
}

console.log('[general-download-pdf-fuelings] PDF datas desc + abastecimentos + Excel em uma única folha/página + downloads geral/mensal');
