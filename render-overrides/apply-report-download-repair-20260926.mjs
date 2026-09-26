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

  const downloadBlock =
    /const blob = ([A-Za-z_$][A-Za-z0-9_$]*)\.output\((?:["'])blob(?:["'])\);\s*const url = URL\.createObjectURL\(blob\);\s*const link = document\.createElement\((?:["'])a(?:["'])\);\s*link\.href = url;\s*link\.download = ([^;]+);\s*document\.body\.appendChild\(link\);\s*link\.click\(\);\s*(?:link\.remove\(\);|window\.setTimeout\(\(\) => link\.remove\(\),\s*[0-9_]+\);)\s*(?:URL\.revokeObjectURL\(url\);|window\.setTimeout\(\(\) => URL\.revokeObjectURL\(url\),\s*[0-9_]+\);)/m;

  const match = before.match(downloadBlock);
  if (!match) {
    if (!before.includes("navigator.canShare") || !before.includes('output("bloburl")')) {
      throw new Error("report-download-repair: PDF download block not found");
    }
  } else {
    const docVar = match[1];
    const fileNameExpr = match[2];
    const replacement = `const fileName = ${fileNameExpr};
  const blob = ${docVar}.output("blob");
  const pdfFile = new File([blob], fileName, { type: "application/pdf" });
  const isAndroid = typeof navigator !== "undefined" && /Android/i.test(navigator.userAgent || "");
  const canSharePdf =
    isAndroid &&
    typeof navigator.share === "function" &&
    typeof navigator.canShare === "function" &&
    navigator.canShare({ files: [pdfFile] });

  if (canSharePdf) {
    try {
      await navigator.share({
        files: [pdfFile],
        title: fileName,
        text: "Relatório Trans Salomão",
      });
    } catch (shareError) {
      const errorName = shareError instanceof Error ? shareError.name : "";
      if (errorName !== "AbortError") {
        const viewerUrl = ${docVar}.output("bloburl");
        const viewer = window.open(viewerUrl, "_blank");
        if (!viewer) window.location.href = viewerUrl;
        window.setTimeout(() => URL.revokeObjectURL(viewerUrl), 120_000);
      }
    }
  } else if (isAndroid) {
    const viewerUrl = ${docVar}.output("bloburl");
    const viewer = window.open(viewerUrl, "_blank");
    if (!viewer) window.location.href = viewerUrl;
    window.setTimeout(() => URL.revokeObjectURL(viewerUrl), 120_000);
  } else {
    ${docVar}.save(fileName);
  }`;

    write(rel, before.replace(downloadBlock, replacement));
  }
}

console.log("[report-download-repair] safe dates + Android PDF share/viewer fallback applied");
