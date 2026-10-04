import fs from "node:fs";
import path from "node:path";

const target = process.argv[2];
if (!target || !fs.existsSync(target)) throw new Error("photo-intake-ai: target missing");
const repo = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");

function copy(relSource, relTarget) {
  const src = path.join(repo, relSource);
  const dst = path.join(target, relTarget);
  fs.mkdirSync(path.dirname(dst), { recursive: true });
  fs.copyFileSync(src, dst);
}

// 1) App do motorista: mostrar o peso real gravado, sem arredondar para 1 casa decimal.
{
  const rel = "src/routes/motorista.tsx";
  const p = path.join(target, rel);
  let s = fs.readFileSync(p, "utf8");
  const before = s;
  s = s.replace(
    /num\(([^,\n]+\.tons),\s*1\)/g,
    'new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 3 }).format($1)',
  );
  if (s === before && !s.includes('maximumFractionDigits: 3 }).format(r.tons)')) {
    throw new Error("photo-intake-ai: driver tons display pattern not found");
  }
  fs.writeFileSync(p, s);
}

// 2) Nova rota visual Fotos IA.
copy("render-overrides/photo-intake-page-20260923.tsx", "src/routes/dono/fotos.tsx");

// 3) Endpoints de fotos: arquivo da Gerência + upload em blocos com conversão no servidor.
copy("render-overrides/photo-ticket-api-20260924.ts", "src/routes/api/photo-intake.ts");
copy("render-overrides/photo-upload-api-20260926.ts", "src/routes/api/photo-upload.ts");

// O upload em blocos converte fotos grandes/HEIC no servidor para JPEG antes da leitura.
{
  const packagePath = path.join(target, "package.json");
  const pkg = JSON.parse(fs.readFileSync(packagePath, "utf8"));
  pkg.dependencies = pkg.dependencies || {};
  pkg.dependencies.sharp = pkg.dependencies.sharp || "^0.34.4";
  pkg.dependencies["heic-convert"] = pkg.dependencies["heic-convert"] || "^2.1.0";
  fs.writeFileSync(packagePath, JSON.stringify(pkg, null, 2) + "\n");
}

// 4) Acrescenta a aba Fotos dos Tickets à navegação da Gerência.
function walk(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    else if (/\.(tsx|ts)$/.test(entry.name)) out.push(full);
  }
  return out;
}

let navPatched = false;
for (const p of walk(path.join(target, "src"))) {
  let s = fs.readFileSync(p, "utf8");
  if (!s.includes('/dono/totais') || !s.includes('Relatórios') || !s.includes('mobileLabel')) continue;
  if (s.includes('/dono/fotos')) {
    navPatched = true;
    break;
  }

  const re = /(\{\s*to:\s*"\/dono\/totais",\s*label:\s*"Relatórios",\s*mobileLabel:\s*"Relatórios",\s*icon:\s*([A-Za-z0-9_]+),\s*exact:\s*false\s*\})/;
  const match = s.match(re);
  if (!match) continue;

  s = s.replace(
    re,
    '$1,\n  { to: "/dono/fotos", label: "Fotos de Tickets", mobileLabel: "Tickets", icon: $2, exact: false }',
  );
  s = s.replace(/grid-cols-7/g, "grid-cols-8");
  fs.writeFileSync(p, s);
  navPatched = true;
  break;
}

if (!navPatched) throw new Error("photo-intake-ai: management navigation not found");

console.log("[photo-intake] exact tons + arquivo de fotos dos tickets da Gerência applied");
