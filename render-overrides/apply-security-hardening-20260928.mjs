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

execFileSync("patch", ["--batch", "--forward", "--dry-run", "-p1", "-d", work, "-i", patchPath], { stdio: "inherit" });
execFileSync("patch", ["--batch", "--forward", "-p1", "-d", work, "-i", patchPath], { stdio: "inherit" });

console.log("[security-hardening] protected fleet reads, driver writes, passwords, sessions, login throttling, tickets and Salomao IA");
