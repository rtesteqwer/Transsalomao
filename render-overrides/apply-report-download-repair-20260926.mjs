import fs from "node:fs";
import path from "node:path";

const target = path.resolve(process.argv[2] || "");
if (!process.argv[2] || !fs.existsSync(path.join(target, "src"))) {
  throw new Error("report-download-repair: expected reconstructed application directory");
}

function read(rel) {
  const file = path.join(target, rel);
  if (!fs.existsSync(file)) throw new Error("report-download-repair: missing " + rel);
  return fs.readFileSync(file, "utf8");
}

function write(rel, value) {
  fs.writeFileSync(path.join(target, rel), value);
}

// Registros históricos podem ter data vazia. Nenhum relatório deve quebrar
// tentando executar .split() em undefined/null.
{
  const rel = "src/lib/format.ts";
  const before = read(rel);
  const after = before.replace(
    /([A-Za-z_$][A-Za-z0-9_$]*)\.split\((["'])-\2\)/g,
    'String($1 ?? "").split("-")',
  );

  if (after === before && !before.includes('String(date ?? "").split("-")')) {
    throw new Error("report-download-repair: date formatter pattern not found");
  }
  write(rel, after);
}

// PDF: no Android/WebView, download de URL blob: pode ser interceptado pelo
// gerenciador nativo e falhar. Preferimos Web Share com arquivo PDF; quando a
// API não existe, abrimos o PDF no visualizador. Desktop usa jsPDF.save().
{
  const rel = "src/lib/pdf.ts";
  const before = read(rel);

  if (before.includes("navigator.canShare") && before.includes('output("bloburl")')) {
    // Já corrigido por uma execução anterior.
    write(rel, before);
  } else {
    const blobMatch = before.match(/const\s+blob\s*=\s*([A-Za-z_$][A-Za-z0-9_$]*)\.output\(\s*["']blob["']\s*\)\s*;/m);
    if (!blobMatch || blobMatch.index == null) {
      const marker = before.indexOf('output("blob")');
      const altMarker = marker >= 0 ? marker : before.indexOf("output('blob')");
      const sample = altMarker >= 0 ? before.slice(Math.max(0, altMarker - 350), altMarker + 1200) : "output(blob) not present";
      console.error("[report-download-repair] pdf sample:", sample);
      throw new Error("report-download-repair: PDF blob output not found");
    }

    const startIndex = blobMatch.index;
    const revokeIndex = before.indexOf("URL.revokeObjectURL(url)", startIndex);
    if (revokeIndex < 0) {
      const sample = before.slice(startIndex, startIndex + 1800);
      console.error("[report-download-repair] pdf download sample:", sample);
      throw new Error("report-download-repair: PDF cleanup marker not found");
    }
    const endIndex = before.indexOf(";", revokeIndex);
    if (endIndex < 0) throw new Error("report-download-repair: PDF cleanup terminator not found");

    const oldBlock = before.slice(startIndex, endIndex + 1);
    const fileMatch = oldBlock.match(/[A-Za-z_$][A-Za-z0-9_$]*\.download\s*=\s*([^;]+);/m);
    if (!fileMatch) {
      console.error("[report-download-repair] pdf download block:", oldBlock);
      throw new Error("report-download-repair: PDF filename expression not found");
    }

    const docVar = blobMatch[1];
    const fileNameExpr = fileMatch[1];
    const replacement = `const fileName = ${fileNameExpr};
  const blob = ${docVar}.output("blob");
  const isAndroid = typeof navigator !== "undefined" && /Android/i.test(navigator.userAgent || "");
  let downloadStarted = false;
  let downloadUrl = "";

  // Caminho principal: download direto. Mantemos a URL viva porque Chrome/Android
  // e WebViews podem entregar o Blob ao gerenciador de downloads de forma assíncrona.
  try {
    downloadUrl = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = downloadUrl;
    link.download = fileName;
    link.rel = "noopener";
    link.style.display = "none";
    document.body.appendChild(link);
    link.click();
    downloadStarted = true;
    window.setTimeout(() => link.remove(), 60_000);
    window.setTimeout(() => URL.revokeObjectURL(downloadUrl), 120_000);
  } catch (downloadError) {
    console.warn("[pdf-report] direct download failed", downloadError);
  }

  // Fallback do próprio jsPDF.
  if (!downloadStarted) {
    try {
      ${docVar}.save(fileName);
      downloadStarted = true;
    } catch (saveError) {
      console.warn("[pdf-report] jsPDF save failed", saveError);
    }
  }

  // Em Android, tente compartilhamento de arquivo somente como fallback. Alguns
  // WebViews expõem canShare mas lançam exceção; por isso toda a checagem fica protegida.
  if (!downloadStarted && isAndroid && typeof navigator !== "undefined" && typeof navigator.share === "function") {
    try {
      const pdfFile = new File([blob], fileName, { type: "application/pdf" });
      const canSharePdf =
        typeof navigator.canShare !== "function" ||
        navigator.canShare({ files: [pdfFile] });
      if (canSharePdf) {
        await navigator.share({
          files: [pdfFile],
          title: fileName,
          text: "Relatório Trans Salomão",
        });
        downloadStarted = true;
      }
    } catch (shareError) {
      const errorName = shareError instanceof Error ? shareError.name : "";
      if (errorName === "AbortError") downloadStarted = true;
      else console.warn("[pdf-report] share failed", shareError);
    }
  }

  // Último fallback: abre o PDF no visualizador do navegador.
  if (!downloadStarted) {
    const viewerUrl = ${docVar}.output("bloburl");
    try {
      const viewer = window.open(viewerUrl, "_blank");
      if (viewer) downloadStarted = true;
      else {
        window.location.href = viewerUrl;
        downloadStarted = true;
      }
      window.setTimeout(() => URL.revokeObjectURL(viewerUrl), 120_000);
    } catch (viewerError) {
      console.error("[pdf-report] viewer fallback failed", viewerError);
    }
  }

  if (!downloadStarted) {
    throw new Error("Não foi possível iniciar o download do PDF.");
  }`

    write(rel, before.slice(0, startIndex) + replacement + before.slice(endIndex + 1));
  }
}

console.log("[report-download-repair] safe dates + Android PDF share/viewer fallback applied");
