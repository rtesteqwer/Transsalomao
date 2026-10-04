import fs from "node:fs";
import path from "node:path";

const target = path.resolve(process.argv[2] || "");
if (!process.argv[2] || !fs.existsSync(path.join(target, "src"))) {
  throw new Error("qwen-oidc-runtime: expected reconstructed application directory");
}

const helperPath = path.join(target, "src/lib/qwen3-vl.server.ts");
fs.mkdirSync(path.dirname(helperPath), { recursive: true });
fs.writeFileSync(
  helperPath,
  [
    'import { getVercelOidcToken } from "@vercel/oidc";',
    "",
    'const DEFAULT_QWEN3_VL_MODEL = "alibaba/qwen3-vl-instruct";',
    'const DEFAULT_QWEN3_VL_RESPONSES_URL = "https://ai-gateway.vercel.sh/v1/responses";',
    "",
    "export function qwen3VlModel() {",
    "  return process.env.QWEN3_VL_MODEL?.trim() || DEFAULT_QWEN3_VL_MODEL;",
    "}",
    "",
    "export function qwen3VlResponsesUrl() {",
    "  return process.env.QWEN3_VL_RESPONSES_URL?.trim() || DEFAULT_QWEN3_VL_RESPONSES_URL;",
    "}",
    "",
    "export async function qwen3VlToken() {",
    "  const configured =",
    "    process.env.QWEN3_VL_API_KEY?.trim() ||",
    "    process.env.AI_GATEWAY_API_KEY?.trim() ||",
    "    process.env.VERCEL_OIDC_TOKEN?.trim() ||",
    '    "";',
    "  if (configured) return configured;",
    "  try {",
    "    const token = await getVercelOidcToken();",
    '    return typeof token === "string" ? token.trim() : "";',
    "  } catch {",
    '    return "";',
    "  }",
    "}",
    "",
    "export async function qwen3VlConfigured() {",
    "  return Boolean(await qwen3VlToken());",
    "}",
    "",
  ].join("\n"),
);

const tokenUsers = [
  "src/routes/api/ler-ticket.ts",
  "src/lib/fueling-photo-reader.server.ts",
  "src/lib/financial-document-reader.server.ts",
  "src/lib/operation-import-ai.server.ts",
  "src/routes/api/assistant/document-intake.ts",
  "src/routes/api/whatsapp/webhook.ts",
  "src/lib/salomao-ai.server.ts",
  "src/routes/api/assistant/status.ts",
];

for (const rel of tokenUsers) {
  const file = path.join(target, rel);
  if (!fs.existsSync(file)) continue;
  let s = fs.readFileSync(file, "utf8");
  s = s.replace(/(?<!await\s)qwen3VlToken\(\)/g, "await qwen3VlToken()");
  fs.writeFileSync(file, s);
}

const pkgPath = path.join(target, "package.json");
const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
pkg.dependencies = pkg.dependencies || {};
pkg.dependencies["@vercel/oidc"] = pkg.dependencies["@vercel/oidc"] || "latest";
fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + "\n");

console.log("[qwen-oidc-runtime] runtime OIDC token retrieval enabled for Vercel AI Gateway");
