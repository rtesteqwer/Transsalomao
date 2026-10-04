import fs from "node:fs";
import path from "node:path";

const target = process.argv[2];
if (!target || !fs.existsSync(target)) throw new Error("mobile-report-download: target missing");

function patchPdf() {
  const file = path.join(target, "src/lib/pdf.ts");
  if (!fs.existsSync(file)) throw new Error("mobile-report-download: pdf.ts missing");
  let s = fs.readFileSync(file, "utf8");
  if (s.includes("[mobile-report-download] PDF")) return;

  const start = s.indexOf('  const blob = doc.output("blob");');
  const marker = '    throw new Error("Não foi possível iniciar o download do PDF.");\n  }';
  const markerPos = s.indexOf(marker, start);
  if (start < 0 || markerPos < 0) throw new Error("mobile-report-download: PDF delivery block not found");
  const end = markerPos + marker.length;

  const replacement = `  const blob = doc.output("blob");
  const isMobileReportDevice =
    typeof navigator !== "undefined" &&
    /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);

  // [mobile-report-download] PDF
  // Android/WebView can silently ignore <a download> for blob: URLs. On mobile,
  // hand the real File to the OS first. This produces a visible native sheet where
  // the user can save to Files/Downloads. If Web Share is unavailable, open the
  // blob directly instead of pretending a hidden link was downloaded.
  if (isMobileReportDevice && typeof navigator.share === "function") {
    const mobileFile = new File([blob], fileName, { type: "application/pdf" });
    const sharePayload = { files: [mobileFile], title: fileName };
    const canShareFile =
      typeof navigator.canShare !== "function" || navigator.canShare(sharePayload);
    if (canShareFile) {
      try {
        await navigator.share(sharePayload);
        return;
      } catch (shareError) {
        const errorName = shareError instanceof DOMException ? shareError.name : "";
        if (errorName === "AbortError") return;
        console.warn("[pdf-report] mobile share failed; using viewer fallback", shareError);
      }
    }
  }

  const downloadUrl = URL.createObjectURL(blob);
  if (isMobileReportDevice) {
    // Navigation is intentionally used on mobile: it is handled by Chrome/WebView
    // even when the download attribute on a synthetic anchor is ignored.
    window.location.assign(downloadUrl);
    window.setTimeout(() => URL.revokeObjectURL(downloadUrl), 120_000);
    return;
  }

  const link = document.createElement("a");
  link.href = downloadUrl;
  link.download = fileName;
  link.rel = "noopener";
  link.style.position = "fixed";
  link.style.left = "-9999px";
  document.body.appendChild(link);
  link.click();
  window.setTimeout(() => {
    link.remove();
    URL.revokeObjectURL(downloadUrl);
  }, 120_000);`;

  s = s.slice(0, start) + replacement + s.slice(end);
  fs.writeFileSync(file, s);
}

function patchExcel() {
  const file = path.join(target, "src/lib/excel-report.ts");
  if (!fs.existsSync(file)) throw new Error("mobile-report-download: excel-report.ts missing");
  let s = fs.readFileSync(file, "utf8");
  if (s.includes("[mobile-report-download] EXCEL")) return;

  const start = s.lastIndexOf('    const blob = new Blob([buffer], { type: mime });');
  if (start < 0) throw new Error("mobile-report-download: Excel blob block start missing");
  const closeMarker = '    }, 60_000);';
  const closePos = s.indexOf(closeMarker, start);
  if (closePos < 0) throw new Error("mobile-report-download: Excel blob block end missing");
  const end = closePos + closeMarker.length;

  const replacement = `    const blob = new Blob([buffer], { type: mime });
    const isMobileReportDevice =
      typeof navigator !== "undefined" &&
      /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);

    // [mobile-report-download] EXCEL
    // Synthetic blob downloads are often ignored by Android/WebView. Prefer the
    // native share/save sheet, then fall back to direct blob navigation.
    if (isMobileReportDevice && typeof navigator.share === "function") {
      const mobileFile = new File([blob], fileName, { type: mime });
      const sharePayload = { files: [mobileFile], title: fileName };
      const canShareFile =
        typeof navigator.canShare !== "function" || navigator.canShare(sharePayload);
      if (canShareFile) {
        try {
          await navigator.share(sharePayload);
          return "shared" as const;
        } catch (shareError) {
          const errorName = shareError instanceof DOMException ? shareError.name : "";
          if (errorName === "AbortError") return "cancelled" as const;
          console.warn("[excel-report] mobile share failed; using navigation fallback", shareError);
        }
      }
    }

    const url = URL.createObjectURL(blob);
    if (isMobileReportDevice) {
      window.location.assign(url);
      window.setTimeout(() => URL.revokeObjectURL(url), 120_000);
      return "opened" as const;
    }

    const link = document.createElement("a");
    link.href = url;
    link.download = fileName;
    link.rel = "noopener";
    link.style.position = "fixed";
    link.style.left = "-9999px";
    link.style.top = "0";
    document.body.appendChild(link);
    link.click();
    window.setTimeout(() => {
      link.remove();
      URL.revokeObjectURL(url);
    }, 120_000);
    return "downloaded" as const;`;

  s = s.slice(0, start) + replacement + s.slice(end);
  fs.writeFileSync(file, s);
}

function patchToast() {
  const file = path.join(target, "src/routes/dono/totais.tsx");
  if (!fs.existsSync(file)) throw new Error("mobile-report-download: totais.tsx missing");
  let s = fs.readFileSync(file, "utf8");
  if (s.includes("Planilha pronta. Escolha onde salvar")) return;

  const old = `      await downloadFleetExcel({ data, computed, fuelings, period, driverScope });
      toast.success("Excel gerado. Verifique seus downloads.");`;
  const replacement = `      const delivery = await downloadFleetExcel({ data, computed, fuelings, period, driverScope });
      if (delivery === "cancelled") {
        toast.info("Salvamento cancelado.");
      } else if (delivery === "shared") {
        toast.success("Planilha pronta. Escolha onde salvar no celular.");
      } else if (delivery !== "opened") {
        toast.success("Excel baixado.");
      }`;
  if (!s.includes(old)) throw new Error("mobile-report-download: Excel toast block missing");
  s = s.replace(old, replacement);
  fs.writeFileSync(file, s);
}

patchPdf();
patchExcel();
patchToast();
console.log("[mobile-report-download] PDF and Excel use native mobile save/share with reliable fallbacks");
