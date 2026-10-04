import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";
import zlib from "node:zlib";
import { execFileSync } from "node:child_process";

const work = process.argv[2];
if (!work) throw new Error("Usage: node apply-security-hardening-20260928.mjs <source-dir>");

const repo = process.cwd();
const payloadPath = path.join(repo, "render-overrides", "security-hardening-20260928.patch.gz.b64");
if (!fs.existsSync(payloadPath)) throw new Error("Missing security hardening payload");

const archive = Buffer.from(fs.readFileSync(payloadPath, "utf8").replace(/\s+/g, ""), "base64");
const digest = crypto.createHash("sha256").update(archive).digest("hex");
if (digest !== "e97a1f80e627d6fa4be2be1e6855cd4178adbb14643c49b54ac4e071a0f4151b") {
  throw new Error("Security hardening payload hash mismatch");
}

const patchText = zlib.gunzipSync(archive);
const patchPath = path.join(os.tmpdir(), "transsalomao-security-hardening-20260928.patch");
fs.writeFileSync(patchPath, patchText);

const assistantFilesNowManagedByCurrentSource = [
  "src/lib/salomao-ai.server.ts",
  "src/routes/api/assistant.ts",
  "src/routes/api/assistant/status.ts",
];

try {
  execFileSync("git", ["apply", "--no-index", "--check", "-p1", patchPath], { cwd: work, stdio: "pipe" });
  execFileSync("git", ["apply", "--no-index", "-p1", patchPath], { cwd: work, stdio: "inherit" });
} catch {
  // The Felipe IA Cloud/Qwen migration evolved these three assistant files after the
  // original hardening patch was frozen. Keep their current hardened implementations
  // and still apply every other security hunk.
  const excludes = assistantFilesNowManagedByCurrentSource.flatMap((rel) => ["--exclude", rel]);
  execFileSync("git", ["apply", "--no-index", "--check", "-p1", ...excludes, patchPath], { cwd: work, stdio: "inherit" });
  execFileSync("git", ["apply", "--no-index", "-p1", ...excludes, patchPath], { cwd: work, stdio: "inherit" });

  const assistant = fs.readFileSync(path.join(work, "src/routes/api/assistant.ts"), "utf8");
  const assistantStatus = fs.readFileSync(path.join(work, "src/routes/api/assistant/status.ts"), "utf8");
  const salomaoAi = fs.readFileSync(path.join(work, "src/lib/salomao-ai.server.ts"), "utf8");

  if (!assistant.includes("authenticateAssistantRequest") || !assistant.includes('x-salomao-app')) {
    throw new Error("Security hardening fallback refused: assistant authentication markers are missing");
  }
  if (/api\.openai\.com|process\.env\.OPENAI_API_KEY/i.test(salomaoAi + "\n" + assistant + "\n" + assistantStatus)) {
    throw new Error("Security hardening fallback refused: direct legacy OpenAI dependency remains");
  }
}

console.log("[security-hardening] protected fleet reads, driver writes, passwords, sessions, login throttling, tickets and Salomao IA");

// Final validation marker: async ticket-auth tests updated on 2026-09-28.
