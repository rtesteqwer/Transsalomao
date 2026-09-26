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

// Some historical records can have an empty date. The report formatters must not
// call .split() directly on undefined/null values.
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

// Android/WebView may start a Blob download asynchronously. Revoking the URL
// immediately makes PDF downloads fail with "Erro ao salvar relatório".
{
  const rel = "src/lib/pdf.ts";
  const before = read(rel);
  let after = before;

  after = after.replace(
    /URL\.revokeObjectURL\(url\);/g,
    "window.setTimeout(() => URL.revokeObjectURL(url), 60_000);",
  );

  if (after.includes("link.click();") && after.includes("link.remove();")) {
    after = after.replace(
      /link\.click\(\);\s*link\.remove\(\);/g,
      "link.click();\n  window.setTimeout(() => link.remove(), 60_000);",
    );
  }

  if (after === before && !before.includes("60_000")) {
    throw new Error("report-download-repair: PDF Blob cleanup pattern not found");
  }
  write(rel, after);
}

console.log("[report-download-repair] safe dates + Android PDF download handoff applied");
