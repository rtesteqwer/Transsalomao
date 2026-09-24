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

// 3) Endpoint da leitura visual com OpenAI/ChatGPT.
{
  const payload = fs.readFileSync(path.join(repo, "render-overrides", "photo-intake-api-20260923.b64"), "utf8").trim();
  const dst = path.join(target, "src/routes/api/photo-intake.ts");
  fs.mkdirSync(path.dirname(dst), { recursive: true });
  let apiSource = Buffer.from(payload, "base64").toString("utf8");
  // Corrige o cabeçalho HTTP da chamada OpenAI: o código original tinha "heaers" e enviava a requisição sem Authorization.
  apiSource = apiSource.replace(
    '    heaers: { Authorization: "Bearer " + key, "Content-Type": "application/json" },',
    '    headers: { Authorization: "Bearer " + key, "Content-Type": "application/json" },',
  );
  apiSource = apiSource.replace(
    'const model = process.env.OPENAI_WHATSAPP_MODEL?.trim() || process.env.OPENAI_ASSISTANT_MODEL?.trim() || "gpt-5.6-sol";',
    'const model = process.env.OPENAI_PHOTO_MODEL?.trim() || "gpt-5.6-luna";',
  );
  apiSource = apiSource.replace(
    "        const parsed = await readTicketWithAI(image);",
    `        let parsed: any;
        try {
          parsed = await readTicketWithAI(image);
        } catch (error) {
          const message = error instanceof Error ? error.message : "Falha ao acessar a IA.";
          if (message.includes("(401)")) {
            return json({ ok: false, message: "A IA do Fotos IA não está autorizada. A chave OpenAI da produção precisa ser renovada." }, 503);
          }
          return json({ ok: false, message: "Não foi possível ler a foto com IA. " + message }, 502);
        }`,
  );
  fs.writeFileSync(dst, apiSource);
}

// 4) Acrescenta a aba Fotos IA à navegação da Gerência.
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
    '$1,\n  { to: "/dono/fotos", label: "Fotos IA", mobileLabel: "Fotos", icon: $2, exact: false }',
  );
  s = s.replace(/grid-cols-7/g, "grid-cols-8");
  fs.writeFileSync(p, s);
  navPatched = true;
  break;
}

if (!navPatched) throw new Error("photo-intake-ai: management navigation not found");

console.log("[photo-intake-ai] exact tons + Fotos IA + AI photo-to-Caixa applied");
