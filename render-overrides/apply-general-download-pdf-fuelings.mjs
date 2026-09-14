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

// Mantem os downloads visiveis: geral conforme o periodo selecionado, mensal
// para o mes corrente e o PDF visual do Painel Geral. O botao CSV original fica
// oculto somente como ancora para a etapa posterior do render-build.
{
  const p = path.join(target, 'src/routes/dono/totais.tsx');
  let s = fs.readFileSync(p, 'utf8');

  // Gera um PDF que espelha visualmente a tela Painel Geral. A tela é aberta em
  // iframe same-origin, renderizada pelo html2canvas e inserida no PDF como imagem,
  // preservando cartões, textos, valores, bordas e organização visual do Painel.
  if (!s.includes('async function exportPainelGeralPdf()')) {
    const functionAnchor = 'async function exportExcelColorido(scope: "current" | "month" = "current") {';
    if (!s.includes(functionAnchor)) throw new Error('general-download-pdf-fuelings: Excel function anchor missing for dashboard PDF');
    const dashboardPdfFunction = `async function exportPainelGeralPdf() {\n  let frame: HTMLIFrameElement | null = null;\n  try {\n    frame = document.createElement("iframe");\n    frame.src = "/dono";\n    frame.setAttribute("aria-hidden", "true");\n    frame.style.position = "fixed";\n    frame.style.left = "-10000px";\n    frame.style.top = "0";\n    frame.style.width = "1440px";\n    frame.style.height = "1200px";\n    frame.style.border = "0";\n    frame.style.opacity = "0";\n    frame.style.pointerEvents = "none";\n    document.body.appendChild(frame);\n\n    await new Promise<void>((resolve, reject) => {\n      const timeout = window.setTimeout(() => reject(new Error("Tempo esgotado ao carregar o Painel Geral")), 12000);\n      frame!.addEventListener("load", () => {\n        window.clearTimeout(timeout);\n        resolve();\n      }, { once: true });\n    });\n\n    // Aguarda consultas e fontes terminarem para o espelhamento ficar igual à tela.\n    await new Promise((resolve) => window.setTimeout(resolve, 1800));\n    const frameDocument = frame.contentDocument;\n    if (!frameDocument) throw new Error("Não foi possível acessar o Painel Geral");\n    try { await (frameDocument as any).fonts?.ready; } catch {}\n\n    const panel = (frameDocument.querySelector("main") ?? frameDocument.body) as HTMLElement;\n    if (!panel) throw new Error("Painel Geral não encontrado");\n\n    const html2canvasModule: any = await import("html2canvas");\n    const html2canvas: any = html2canvasModule.default ?? html2canvasModule;\n    const canvas = await html2canvas(panel, {\n      scale: 1.6,\n      useCORS: true,\n      allowTaint: false,\n      backgroundColor: frameDocument.defaultView?.getComputedStyle(panel).backgroundColor || "#07111f",\n      width: Math.max(panel.scrollWidth, panel.clientWidth),\n      height: Math.max(panel.scrollHeight, panel.clientHeight),\n      windowWidth: Math.max(panel.scrollWidth, 1280),\n      windowHeight: Math.max(panel.scrollHeight, 900),\n      logging: false,\n    });\n\n    const jsPDFModule: any = await import("jspdf");\n    const JsPDF: any = jsPDFModule.jsPDF ?? jsPDFModule.default?.jsPDF ?? jsPDFModule.default;\n    const doc = new JsPDF({ orientation: "landscape", unit: "mm", format: "a4", compress: true });\n    const pageWidth = doc.internal.pageSize.getWidth();\n    const pageHeight = doc.internal.pageSize.getHeight();\n    const margin = 5;\n    const printableWidth = pageWidth - margin * 2;\n    const printableHeight = pageHeight - margin * 2;\n    const scaleToPdf = printableWidth / canvas.width;\n    const sliceHeightPx = Math.max(1, Math.floor(printableHeight / scaleToPdf));\n    let sourceY = 0;\n    let pageIndex = 0;\n\n    while (sourceY < canvas.height) {\n      const currentHeight = Math.min(sliceHeightPx, canvas.height - sourceY);\n      const slice = document.createElement("canvas");\n      slice.width = canvas.width;\n      slice.height = currentHeight;\n      const ctx = slice.getContext("2d");\n      if (!ctx) throw new Error("Falha ao montar página do PDF");\n      ctx.drawImage(canvas, 0, sourceY, canvas.width, currentHeight, 0, 0, canvas.width, currentHeight);\n      if (pageIndex > 0) doc.addPage("a4", "landscape");\n      const imgHeight = currentHeight * scaleToPdf;\n      doc.addImage(slice.toDataURL("image/jpeg", 0.94), "JPEG", margin, margin, printableWidth, imgHeight, undefined, "FAST");\n      sourceY += currentHeight;\n      pageIndex += 1;\n    }\n\n    const now = new Date();\n    const dateKey = [now.getFullYear(), String(now.getMonth() + 1).padStart(2, "0"), String(now.getDate()).padStart(2, "0")].join("-");\n    doc.save(`Painel_Geral_${dateKey}.pdf`);\n  } catch (error) {\n    console.error("[pdf-painel-geral]", error);\n    window.alert("Não foi possível gerar o PDF do Painel Geral. Tente novamente.");\n  } finally {\n    frame?.remove();\n  }\n}\n\n`;
    s = s.replace(functionAnchor, dashboardPdfFunction + functionAnchor);
  }

  const csvButton = /<button type="button" onClick=\{exportCurrent\} className="h-11 rounded-md border border-border px-4 text-sm text-fg hover:bg-surface-2">\s*Exportar CSV\s*<\/button>/m;
  if (!s.includes('Download Planilha Mensal')) {
    if (!csvButton.test(s)) throw new Error('general-download-pdf-fuelings: CSV anchor button not found');
    const original = s.match(csvButton)?.[0];
    if (!original) throw new Error('general-download-pdf-fuelings: CSV anchor capture failed');
    const buttons = `<div className="flex flex-wrap gap-2">\n          <button type="button" onClick={() => exportExcelColorido("current")} className="h-11 rounded-md border border-accent bg-bg px-4 text-sm font-semibold text-fg hover:bg-surface-2">\n            Download Planilha Geral\n          </button>\n          <button type="button" onClick={() => exportExcelColorido("month")} className="h-11 rounded-md border border-accent bg-accent px-4 text-sm font-semibold text-bg hover:opacity-90">\n            Download Planilha Mensal\n          </button>\n          <div className="hidden">\n            ${original}\n          </div>\n        </div>`;
    s = s.replace(csvButton, buttons);
  }

  if (!s.includes('PDF Painel geral')) {
    const monthlyButtonEnd = `          <button type="button" onClick={() => exportExcelColorido("month")} className="h-11 rounded-md border border-accent bg-accent px-4 text-sm font-semibold text-bg hover:opacity-90">\n            Download Planilha Mensal\n          </button>`;
    if (!s.includes(monthlyButtonEnd)) throw new Error('general-download-pdf-fuelings: monthly button anchor missing for dashboard PDF');
    const dashboardButton = `${monthlyButtonEnd}\n          <button type="button" onClick={exportPainelGeralPdf} className="inline-flex h-11 items-center gap-2 rounded-md border border-accent bg-bg px-4 text-sm font-semibold text-fg hover:bg-surface-2">\n            <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">\n              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />\n              <path d="M14 2v6h6" />\n              <path d="M8 13h2" />\n              <path d="M8 17h8" />\n              <path d="M14 13h2" />\n            </svg>\n            PDF Painel geral\n          </button>`;
    s = s.replace(monthlyButtonEnd, dashboardButton);
  }

  fs.writeFileSync(p, s);
}

console.log('[general-download-pdf-fuelings] PDF datas desc + abastecimentos + Excel uma folha + PDF Painel geral espelhado');
