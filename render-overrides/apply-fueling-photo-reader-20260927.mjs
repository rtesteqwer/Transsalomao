import fs from "node:fs";
import path from "node:path";

const target = path.resolve(process.argv[2] || "");
if (!process.argv[2] || !fs.existsSync(path.join(target, "src"))) {
  throw new Error("fueling-photo-reader: expected reconstructed application directory");
}
const repo = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const src = (rel) => path.join(repo, rel);
const dst = (rel) => path.join(target, rel);
const copy = (from, to) => {
  fs.mkdirSync(path.dirname(dst(to)), { recursive: true });
  fs.writeFileSync(dst(to), fs.readFileSync(src(from), "utf8"));
};

copy("render-overrides/fueling-photo-reader-20260927.server.ts", "src/lib/fueling-photo-reader.server.ts");
copy("render-overrides/fueling-photo-read-api-20260927.ts", "src/routes/api/ler-abastecimento.ts");
copy("render-overrides/fueling-photo-save-api-20260927.ts", "src/routes/api/salvar-abastecimento-foto.ts");
copy("render-overrides/fueling-photo-reader-ui-20260927.tsx", "src/components/fueling-photo-reader.tsx");
copy("render-overrides/0018_fueling_photo_reader.sql", "migrations/0018_fueling_photo_reader.sql");

{
  const packagePath = dst("package.json");
  const pkg = JSON.parse(fs.readFileSync(packagePath, "utf8"));
  pkg.dependencies = {
    ...(pkg.dependencies || {}),
    "tesseract.js": "^6.0.1",
    "@tesseract.js-data/por": "^1.0.0",
  };
  fs.writeFileSync(packagePath, JSON.stringify(pkg, null, 2) + "\n");
}

// Nitro v3 bundles dependencies by default. tesseract.js relies on CommonJS
// runtime globals such as __dirname and worker files, so it must be traced as
// an external dependency instead of being transformed into an ESM _libs chunk.
{
  const vitePath = dst("vite.config.ts");
  if (!fs.existsSync(vitePath)) throw new Error("fueling-photo-reader: vite.config.ts missing");
  let vite = fs.readFileSync(vitePath, "utf8");
  const nitroMarker = 'nitro({\n            preset: "vercel",';
  if (!vite.includes('traceDeps: ["tesseract.js*", "tesseract.js-core*"]')) {
    if (!vite.includes(nitroMarker)) throw new Error("fueling-photo-reader: nitro config marker missing");
    vite = vite.replace(
      nitroMarker,
      'nitro({\n            preset: "vercel",\n            traceDeps: ["tesseract.js*", "tesseract.js-core*"],'
    );
    fs.writeFileSync(vitePath, vite);
  }
}


const rel = "src/routes/dono/abastecimentos.tsx";
const file = dst(rel);
if (!fs.existsSync(file)) throw new Error("fueling-photo-reader: missing " + rel);
let s = fs.readFileSync(file, "utf8");

if (!s.includes('from "@/components/fueling-photo-reader"')) {
  const matches = [...s.matchAll(/^import .*;\s*$/gm)];
  if (!matches.length) throw new Error("fueling-photo-reader: no import block in Abastecimentos");
  const last = matches[matches.length - 1];
  const end = (last.index ?? 0) + last[0].length;
  s = s.slice(0, end) + '\nimport { FuelingPhotoReader } from "@/components/fueling-photo-reader";' + s.slice(end);
}

if (!s.includes("<FuelingPhotoReader />")) {
  const marker = '      <div className="mt-6 grid gap-3 sm:grid-cols-3">';
  if (!s.includes(marker)) throw new Error("fueling-photo-reader: metrics insertion point not found");
  s = s.replace(marker, '      <FuelingPhotoReader />\n\n' + marker);
}

fs.writeFileSync(file, s);
console.log("[fueling-photo-reader] specialized pump/receipt reader installed");
