import fs from "node:fs";
import path from "node:path";

const target = process.argv[2];
if (!target || !fs.existsSync(target)) throw new Error("mobile-report-download: target missing");

function installDownloadEndpoint() {
  const file = path.join(target, "src/routes/api/baixar-relatorio.ts");
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `import { Buffer } from "node:buffer";
import { createFileRoute } from "@tanstack/react-router";

const MAX_BASE64_LENGTH = 16_000_000;
const ALLOWED_MIME = new Set([
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
]);

function safeFilename(value: unknown) {
  const raw = String(value || "Relatorio_Trans_Salomao.pdf")
    .replace(/[\\r\\n\\t]/g, " ")
    .replace(/[\\\\/:*?"<>|]+/g, "-")
    .replace(/\\s+/g, " ")
    .trim()
    .slice(0, 180);
  return raw || "Relatorio_Trans_Salomao.pdf";
}

export const Route = createFileRoute("/api/baixar-relatorio")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const requestUrl = new URL(request.url);
          const origin = request.headers.get("origin");
          if (origin && origin !== requestUrl.origin) {
            return new Response("Origem não permitida.", { status: 403 });
          }

          const form = await request.formData();
          const fileName = safeFilename(form.get("fileName"));
          const mime = String(form.get("mime") || "");
          const base64 = String(form.get("base64") || "").replace(/\\s+/g, "");

          if (!ALLOWED_MIME.has(mime)) {
            return new Response("Tipo de arquivo não permitido.", { status: 400 });
          }
          if (!base64 || base64.length > MAX_BASE64_LENGTH || !/^[A-Za-z0-9+/]*={0,2}$/.test(base64)) {
            return new Response("Arquivo inválido ou muito grande.", { status: 413 });
          }

          const bytes = Buffer.from(base64, "base64");
          if (!bytes.length) return new Response("Arquivo vazio.", { status: 400 });

          const asciiName = fileName
            .normalize("NFD")
            .replace(/[\\u0300-\\u036f]/g, "")
            .replace(/[^A-Za-z0-9._ -]+/g, "")
            .replace(/\\s+/g, "_")
            .slice(0, 150) || "relatorio";

          return new Response(bytes, {
            status: 200,
            headers: {
              "Content-Type": mime,
              "Content-Length": String(bytes.length),
              "Content-Disposition": "attachment; filename=" + JSON.stringify(asciiName) + "; filename*=UTF-8''" + encodeURIComponent(fileName),
              "Cache-Control": "no-store, max-age=0",
              "X-Content-Type-Options": "nosniff",
            },
          });
        } catch (error) {
          console.error("[report-download-endpoint]", error);
          return new Response("Não foi possível preparar o arquivo.", { status: 500 });
        }
      },
    },
  },
});
`);
}

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

  const submitMobileDownload = async (mobileBlob: Blob, mobileFileName: string, mime: string) => {
    const bytes = new Uint8Array(await mobileBlob.arrayBuffer());
    let binary = "";
    const chunkSize = 0x8000;
    for (let offset = 0; offset < bytes.length; offset += chunkSize) {
      const chunk = bytes.subarray(offset, Math.min(offset + chunkSize, bytes.length));
      binary += String.fromCharCode(...Array.from(chunk));
    }
    const base64 = btoa(binary);
    const form = document.createElement("form");
    form.method = "POST";
    form.action = "/api/baixar-relatorio";
    form.enctype = "multipart/form-data";
    form.style.display = "none";
    const append = (name: string, value: string) => {
      const input = document.createElement("input");
      input.type = "hidden";
      input.name = name;
      input.value = value;
      form.appendChild(input);
    };
    append("fileName", mobileFileName);
    append("mime", mime);
    append("base64", base64);
    document.body.appendChild(form);
    form.submit();
    window.setTimeout(() => form.remove(), 5_000);
  };

  // [mobile-report-download] PDF
  // On Android/WebView, navigating to blob: URLs produces "Não foi possível abrir este link".
  // Prefer the native share sheet when file sharing is supported. Otherwise submit
  // the generated PDF back to a same-origin HTTPS download endpoint, which Android
  // handles as a normal attachment instead of a blob: navigation.
  if (isMobileReportDevice) {
    if (typeof navigator.share === "function" && typeof File !== "undefined") {
      try {
        const mobileFile = new File([blob], fileName, { type: "application/pdf" });
        const sharePayload = { files: [mobileFile], title: fileName };
        const canShareFile =
          typeof navigator.canShare !== "function" || navigator.canShare(sharePayload);
        if (canShareFile) {
          await navigator.share(sharePayload);
          return;
        }
      } catch (shareError) {
        const errorName = shareError instanceof DOMException ? shareError.name : "";
        if (errorName === "AbortError") return;
        console.warn("[pdf-report] mobile share failed; using HTTPS download", shareError);
      }
    }
    await submitMobileDownload(blob, fileName, "application/pdf");
    return;
  }

  const downloadUrl = URL.createObjectURL(blob);
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

    const submitMobileDownload = async (mobileBlob: Blob, mobileFileName: string, mobileMime: string) => {
      const bytes = new Uint8Array(await mobileBlob.arrayBuffer());
      let binary = "";
      const chunkSize = 0x8000;
      for (let offset = 0; offset < bytes.length; offset += chunkSize) {
        const chunk = bytes.subarray(offset, Math.min(offset + chunkSize, bytes.length));
        binary += String.fromCharCode(...Array.from(chunk));
      }
      const base64 = btoa(binary);
      const form = document.createElement("form");
      form.method = "POST";
      form.action = "/api/baixar-relatorio";
      form.enctype = "multipart/form-data";
      form.style.display = "none";
      const append = (name: string, value: string) => {
        const input = document.createElement("input");
        input.type = "hidden";
        input.name = name;
        input.value = value;
        form.appendChild(input);
      };
      append("fileName", mobileFileName);
      append("mime", mobileMime);
      append("base64", base64);
      document.body.appendChild(form);
      form.submit();
      window.setTimeout(() => form.remove(), 5_000);
    };

    // [mobile-report-download] EXCEL
    if (isMobileReportDevice) {
      if (typeof navigator.share === "function" && typeof File !== "undefined") {
        try {
          const mobileFile = new File([blob], fileName, { type: mime });
          const sharePayload = { files: [mobileFile], title: fileName };
          const canShareFile =
            typeof navigator.canShare !== "function" || navigator.canShare(sharePayload);
          if (canShareFile) {
            await navigator.share(sharePayload);
            return "shared" as const;
          }
        } catch (shareError) {
          const errorName = shareError instanceof DOMException ? shareError.name : "";
          if (errorName === "AbortError") return "cancelled" as const;
          console.warn("[excel-report] mobile share failed; using HTTPS download", shareError);
        }
      }
      await submitMobileDownload(blob, fileName, mime);
      return "downloaded" as const;
    }

    const url = URL.createObjectURL(blob);
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

installDownloadEndpoint();
patchPdf();
patchExcel();
patchToast();
console.log("[mobile-report-download] mobile reports use native share or same-origin HTTPS attachment download");
