import fs from "node:fs";
import path from "node:path";

const target = path.resolve(process.argv[2] || "");
if (!process.argv[2] || !fs.existsSync(path.join(target, "src"))) {
  throw new Error("qwen3-vl: expected reconstructed application directory");
}

const repo = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const dst = (rel) => path.join(target, rel);
const src = (rel) => path.join(repo, rel);
const read = (rel) => fs.readFileSync(dst(rel), "utf8");
const write = (rel, value) => {
  fs.mkdirSync(path.dirname(dst(rel)), { recursive: true });
  fs.writeFileSync(dst(rel), value);
};
const copy = (from, to) => {
  fs.mkdirSync(path.dirname(dst(to)), { recursive: true });
  fs.copyFileSync(src(from), dst(to));
};

function addImport(text) {
  const marker = 'from "@/lib/qwen3-vl.server"';
  if (text.includes(marker)) return text;
  const line = 'import { qwen3VlModel, qwen3VlResponsesUrl, qwen3VlToken } from "@/lib/qwen3-vl.server";';
  const matches = [...text.matchAll(/^import .*;\s*$/gm)];
  if (!matches.length) throw new Error("qwen3-vl: import block not found");
  const last = matches[matches.length - 1];
  const end = (last.index || 0) + last[0].length;
  return text.slice(0, end) + "\n" + line + text.slice(end);
}

function required(text, before, after, label) {
  if (text.includes(after)) return text;
  if (!text.includes(before)) throw new Error("qwen3-vl: pattern not found (" + label + ")");
  return text.replace(before, after);
}

function regexRequired(text, regex, replacement, label) {
  const next = text.replace(regex, replacement);
  if (next === text) throw new Error("qwen3-vl: regex pattern not found (" + label + ")");
  return next;
}

function common(text) {
  text = text.replaceAll('"https://api.openai.com/v1/responses"', "qwen3VlResponsesUrl()");
  text = text.replace(/\n\s*reasoning:\s*\{\s*effort:\s*"(?:low|medium|high)"\s*\},/g, "");
  return text;
}

copy("render-overrides/qwen3-vl-20261004.server.ts", "src/lib/qwen3-vl.server.ts");

// 1) Tickets/pesagem.
{
  const rel = "src/routes/api/ler-ticket.ts";
  let s = addImport(read(rel));
  s = required(s, 'engine: "chatgpt-vision+local-ocr-fallback"', 'engine: "qwen3-vl+local-ocr-fallback"', "ticket engine");
  s = required(s, 'provider: "openai"', 'provider: "qwen3-vl"', "ticket provider");
  s = required(s, 'const key = process.env.OPENAI_API_KEY?.trim() || "";', 'const key = qwen3VlToken();', "ticket key");
  s = required(
    s,
    'if (!key) throw new TicketError(503, "Leitor ChatGPT não configurado. Falta OPENAI_API_KEY.");',
    'if (!key) throw new TicketError(503, "Qwen3-VL não configurado no AI Gateway. A leitura local será usada quando disponível.");',
    "ticket key error"
  );
  s = regexRequired(
    s,
    /const model =\n\s*process\.env\.OPENAI_TICKET_MODEL\?\.trim\(\) \|\|\n\s*process\.env\.OPENAI_WHATSAPP_MODEL\?\.trim\(\) \|\|\n\s*"gpt-5\.6-sol";/,
    'const model = qwen3VlModel();',
    "ticket model"
  );
  s = common(s);
  s = s.replaceAll("[ticket-chatgpt] OpenAI error", "[ticket-qwen3-vl] Qwen3-VL error");
  s = s.replaceAll("O ChatGPT demorou para ler a foto. Tente novamente.", "O Qwen3-VL demorou para ler a foto. Tente novamente.");
  s = s.replaceAll("O ChatGPT não conseguiu ler o ticket agora. Tente novamente.", "O Qwen3-VL não conseguiu ler o ticket agora. Tente novamente.");
  s = s.replaceAll("O ChatGPT retornou a leitura vazia. Tente outra foto.", "O Qwen3-VL retornou a leitura vazia. Tente outra foto.");
  s = s.replaceAll("A leitura do ChatGPT veio incompleta. Tente outra foto.", "A leitura do Qwen3-VL veio incompleta. Tente outra foto.");
  s = s.replaceAll("quando ChatGPT Vision está sem crédito, em timeout ou indisponível", "quando o Qwen3-VL está em timeout ou indisponível");
  write(rel, s);
}

// 2) Abastecimentos.
{
  const rel = "src/lib/fueling-photo-reader.server.ts";
  let s = read(rel);
  s = s.replace('import { getSalomaoOpenAIKeys, salomaoModel } from "@/lib/salomao-ai.server";\n', "");
  s = addImport(s);
  s = required(
    s,
    "const keys = await getSalomaoOpenAIKeys();",
    "const qwenKey = qwen3VlToken();\n  const keys = qwenKey ? [qwenKey] : [];",
    "fueling key list"
  );
  s = regexRequired(
    s,
    /const model =\n\s*process\.env\.OPENAI_FUELING_MODEL\?\.trim\(\) \|\|\n\s*process\.env\.OPENAI_TICKET_MODEL\?\.trim\(\) \|\|\n\s*salomaoModel\(\);/,
    "const model = qwen3VlModel();",
    "fueling model"
  );
  s = common(s);
  s = s.replaceAll("[fueling-photo] OpenAI error", "[fueling-photo] Qwen3-VL error");
  write(rel, s);
}

// 3) Comprovantes financeiros.
{
  const rel = "src/lib/financial-document-reader.server.ts";
  let s = read(rel);
  s = s.replace('import { getSalomaoOpenAIKeys, salomaoModel } from "@/lib/salomao-ai.server";\n', "");
  s = addImport(s);
  s = required(
    s,
    "const keys = await getSalomaoOpenAIKeys();",
    "const qwenKey = qwen3VlToken();\n  const keys = qwenKey ? [qwenKey] : [];",
    "financial key list"
  );
  s = s.replaceAll("A Salomão IA precisa da API OpenAI ativa para ler o comprovante.", "O Qwen3-VL precisa do AI Gateway ativo para ler este comprovante.");
  s = s.replaceAll("model: salomaoModel(),", "model: qwen3VlModel(),");
  s = common(s);
  s = s.replaceAll("OpenAI ", "Qwen3-VL ");
  write(rel, s);
}

// 4) Importação mensal/universal (foto/PDF/ZIP).
{
  const rel = "src/lib/operation-import-ai.server.ts";
  let s = read(rel);
  s = s.replace('import { getSalomaoOpenAIKeys, salomaoModel } from "@/lib/salomao-ai.server";\n', "");
  s = addImport(s);
  s = required(
    s,
    "const keys = await getSalomaoOpenAIKeys();",
    "const qwenKey = qwen3VlToken();\n  const keys = qwenKey ? [qwenKey] : [];",
    "operation import key list"
  );
  s = s.replaceAll("A Salomão IA precisa da API OpenAI ativa para ler o arquivo.", "O Qwen3-VL precisa do AI Gateway ativo para ler o arquivo.");
  s = s.replaceAll("model: salomaoModel(),", "model: qwen3VlModel(),");
  s = common(s);
  s = s.replaceAll("OpenAI ", "Qwen3-VL ");
  write(rel, s);
}

// 5) Intake unificado da Trans Salomão IA.
{
  const rel = "src/routes/api/assistant/document-intake.ts";
  let s = read(rel);
  s = s.replace('import { getSalomaoOpenAIKeys, salomaoModel } from "@/lib/salomao-ai.server";\n', "");
  s = addImport(s);
  s = required(
    s,
    "const keys = await getSalomaoOpenAIKeys();",
    "const qwenKey = qwen3VlToken();\n        const keys = qwenKey ? [qwenKey] : [];",
    "assistant intake key list"
  );
  s = s.replace(
    'if (!keys.length) return json({ ok: false, code: "OPENAI_REQUIRED", message: "A leitura de documentos precisa da API OpenAI ativa." }, 503);',
    'if (!keys.length) return json({ ok: false, code: "QWEN3_VL_REQUIRED", message: "A leitura de documentos precisa do Qwen3-VL no AI Gateway." }, 503);'
  );
  s = s.replaceAll("model: salomaoModel(),", "model: qwen3VlModel(),");
  s = common(s);
  s = s.replaceAll("OpenAI ", "Qwen3-VL ");
  write(rel, s);
}

// 6) Fotos recebidas pelo WhatsApp.
{
  const rel = "src/routes/api/whatsapp/webhook.ts";
  let s = addImport(read(rel));
  s = required(s, 'const key = process.env.OPENAI_API_KEY?.trim() || "";', 'const key = qwen3VlToken();', "whatsapp key");
  s = required(s, 'if (!key) throw new Error("OPENAI_API_KEY não configurada.");', 'if (!key) throw new Error("Qwen3-VL/AI Gateway não configurado.");', "whatsapp key error");
  s = regexRequired(
    s,
    /const model =\n\s*process\.env\.OPENAI_WHATSAPP_MODEL\?\.trim\(\) \|\|\n\s*process\.env\.OPENAI_TICKET_MODEL\?\.trim\(\) \|\|\n\s*process\.env\.OPENAI_ASSISTANT_MODEL\?\.trim\(\) \|\|\n\s*"gpt-5\.6-sol";/,
    "const model = qwen3VlModel();",
    "whatsapp model"
  );
  s = common(s);
  s = s.replaceAll("OpenAI ", "Qwen3-VL ");
  write(rel, s);
}

const visualTargets = [
  "src/routes/api/ler-ticket.ts",
  "src/lib/fueling-photo-reader.server.ts",
  "src/lib/financial-document-reader.server.ts",
  "src/lib/operation-import-ai.server.ts",
  "src/routes/api/assistant/document-intake.ts",
  "src/routes/api/whatsapp/webhook.ts",
];
for (const rel of visualTargets) {
  const s = read(rel);
  if (s.includes("https://api.openai.com/v1/responses")) {
    throw new Error("qwen3-vl: direct OpenAI visual endpoint remains in " + rel);
  }
  if (!s.includes('from "@/lib/qwen3-vl.server"')) {
    throw new Error("qwen3-vl: helper import missing in " + rel);
  }
}

console.log("[qwen3-vl] visual identification switched to Qwen3-VL for tickets, fuelings, financial docs, universal imports, assistant intake and WhatsApp images");
