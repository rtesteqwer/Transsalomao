import fs from "node:fs";
import path from "node:path";

const target = path.resolve(process.argv[2] || "");
if (!process.argv[2] || !fs.existsSync(path.join(target, "src"))) {
  throw new Error("ai-cleanup: expected reconstructed application directory");
}

const srcRoot = path.join(target, "src");
const textExtensions = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".json", ".html"]);

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

function edit(rel, fn) {
  const file = path.join(target, rel);
  if (!fs.existsSync(file)) return;
  const before = fs.readFileSync(file, "utf8");
  const after = fn(before);
  if (after !== before) fs.writeFileSync(file, after);
}

function addImport(text, line, marker) {
  if (text.includes(marker)) return text;
  const matches = [...text.matchAll(/^import .*;\s*$/gm)];
  if (!matches.length) return line + "\n" + text;
  const last = matches[matches.length - 1];
  const end = (last.index || 0) + last[0].length;
  return text.slice(0, end) + "\n" + line + text.slice(end);
}

// Remove the Android/browser share-to-ChatGPT feature entirely.
for (const rel of [
  "src/components/operational-file-reader.tsx",
  "src/components/financial-document-reader.tsx",
  "src/routes/motorista.tsx",
]) {
  edit(rel, (s) =>
    s
      .replace(/^import\s+\{\s*ShareToChatGPT\s*\}\s+from\s+["']@\/components\/share-to-chatgpt["'];\s*\n/gm, "")
      .replace(/\s*<ShareToChatGPT\b[^>]*\/>\s*/g, "\n"),
  );
}
for (const rel of [
  "src/components/share-to-chatgpt.tsx",
  "src/routes/api/share-to-chatgpt.ts",
]) {
  const file = path.join(target, rel);
  if (fs.existsSync(file)) fs.rmSync(file, { force: true });
}

// Keep the existing assistant contract, but route its model/key through Qwen3-VL + Vercel AI Gateway.
// The compatibility export name is preserved only so older generated imports keep compiling.
const salomaoAi = path.join(target, "src/lib/salomao-ai.server.ts");
fs.writeFileSync(
  salomaoAi,
  [
    'import { qwen3VlModel, qwen3VlToken } from "@/lib/qwen3-vl.server";',
    "",
    "export function salomaoModel() {",
    "  return qwen3VlModel();",
    "}",
    "",
    "export async function getSalomaoOpenAIKeys() {",
    "  const token = qwen3VlToken();",
    "  return token ? [token] : [];",
    "}",
    "",
  ].join("\n"),
);

edit("src/routes/api/assistant.ts", (s) => {
  s = addImport(
    s,
    'import { qwen3VlResponsesUrl } from "@/lib/qwen3-vl.server";',
    'from "@/lib/qwen3-vl.server"',
  );
  s = s.replaceAll("openAI(", "gatewayAI(");
  s = s.replace("async function openAI(", "async function gatewayAI(");
  s = s.replaceAll('"https://api.openai.com/v1/responses"', "qwen3VlResponsesUrl()");
  s = s.replace(/,?\s*reasoning:\s*\{\s*effort:\s*"high"\s*\}/g, "");
  s = s.replaceAll("A OpenAI retornou argumentos inválidos.", "A IA retornou argumentos inválidos.");
  s = s.replaceAll("OpenAI ", "IA ");
  s = s.replaceAll("OpenAI saiu do caminho normal.", "O provedor antigo saiu do caminho normal.");
  return s;
});

edit("src/routes/api/assistant/status.ts", (s) => {
  s = addImport(
    s,
    'import { qwen3VlModel, qwen3VlToken } from "@/lib/qwen3-vl.server";',
    'from "@/lib/qwen3-vl.server"',
  );
  s = s.replaceAll("process.env.OPENAI_API_KEY?.trim()", "qwen3VlToken()");
  s = s.replaceAll('process.env.OPENAI_ASSISTANT_MODEL?.trim() || "gpt-5.6-sol"', "qwen3VlModel()");
  s = s.replaceAll("OpenAI", "IA");
  return s;
});

// Neutral product copy and legacy environment names.
for (const file of walk(srcRoot)) {
  if (!textExtensions.has(path.extname(file))) continue;
  let s = fs.readFileSync(file, "utf8");
  const before = s;
  s = s.replaceAll("ChatGPT", "IA");
  s = s.replaceAll("OPENAI_ASSISTANT_MODEL", "QWEN3_VL_MODEL");
  s = s.replaceAll("OPENAI_TICKET_MODEL", "QWEN3_VL_MODEL");
  s = s.replaceAll("OPENAI_WHATSAPP_MODEL", "QWEN3_VL_MODEL");
  s = s.replaceAll("OPENAI_FUELING_MODEL", "QWEN3_VL_MODEL");
  s = s.replaceAll("OPENAI_API_KEY", "AI_GATEWAY_API_KEY");
  s = s.replaceAll("https://api.openai.com/v1/responses", "https://ai-gateway.vercel.sh/v1/responses");
  s = s.replaceAll('"gpt-5.6-sol"', '"alibaba/qwen3-vl-instruct"');
  s = s.replaceAll('provider: "openai"', 'provider: "qwen3-vl"');
  s = s.replaceAll("[ticket-chatgpt]", "[ticket-qwen3-vl]");
  s = s.replaceAll("O Qwen3-VL precisa do AI Gateway ativo para ler este comprovante.", "Leitura inteligente temporariamente indisponível. Tente novamente.");
  s = s.replaceAll("O Qwen3-VL precisa do AI Gateway ativo para ler o arquivo.", "Leitura inteligente temporariamente indisponível. Tente novamente.");
  s = s.replaceAll("A leitura de documentos precisa do Qwen3-VL no AI Gateway.", "Leitura inteligente temporariamente indisponível. Tente novamente.");
  if (s !== before) fs.writeFileSync(file, s);
}

// Fail the build rather than accidentally publishing a direct OpenAI/ChatGPT dependency again.
const forbidden = [
  "api.openai.com",
  "Enviar ao ChatGPT",
  "Escolha o ChatGPT",
  "Leitor ChatGPT",
];
const leftovers = [];
for (const file of walk(srcRoot)) {
  if (!textExtensions.has(path.extname(file))) continue;
  const s = fs.readFileSync(file, "utf8");
  for (const needle of forbidden) {
    if (s.includes(needle)) leftovers.push(path.relative(target, file) + ": " + needle);
  }
}
if (leftovers.length) {
  throw new Error("ai-cleanup: forbidden legacy references remain: " + leftovers.join(", "));
}

console.log("[ai-cleanup] ChatGPT share UI removed; assistant and document readers use Qwen3-VL through Vercel AI Gateway");
