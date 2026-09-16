import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';

const repo = process.cwd();
const payloadDir = path.join(repo, 'backup-payload');
const parts = fs.readdirSync(payloadDir).filter((name) => /^part-\d+\.txt$/.test(name)).sort();
if (parts.length !== 4) throw new Error(`Backup payload incompleto: ${parts.length}/4 partes`);
const b64 = parts.map((name) => fs.readFileSync(path.join(payloadDir, name), 'utf8')).join('');
const archive = Buffer.from(b64, 'base64');
const archiveHash = crypto.createHash('sha256').update(archive).digest('hex');
if (archiveHash !== 'ac91058eece8cff51bafdd46d37b7a9a3bdc53e682a15e5954b3abf5acc95e36') throw new Error('Backup payload com hash inválido');
const archivePath = path.join(os.tmpdir(), `transsalomao-render-overrides-${Date.now()}.tar.xz`);
fs.writeFileSync(archivePath, archive);
execFileSync('xz', ['-t', archivePath], { stdio: 'inherit' });
execFileSync('tar', ['-xJf', archivePath, '-C', repo], { stdio: 'inherit' });
const checks = {
  'render-overrides/admin-excel.snippet.ts': 'a00f67eb173f05cb2fa7c8b43873ead357bbd3e754ec6eb8c619b199358dbf51',
  'render-overrides/driver-excel.snippet.ts': '71197d35a9d664137a1f1a72a2a63f14d6c586a2771b1d7526c0f5e3faf667c3',
  'render-overrides/driver-pdf.snippet.ts': 'ffa401e9a99e652599de03076e8925dba2f3438d707085f4baff9bf9213bc8bd',
  'render-overrides/klebersom-access.server.ts': 'b04f0912b19732badcc68da14568fba21a3984cc703e8852fc2b42711fd3a296',
  'render-overrides/pdf-export.snippet.ts': 'dbb7d168b46488e2f708f10a0f8ffc316b8432f77539417475ea57d7b34f64e7',
};
for (const [rel, expected] of Object.entries(checks)) {
  const actual = crypto.createHash('sha256').update(fs.readFileSync(path.join(repo, rel))).digest('hex');
  if (actual !== expected) throw new Error(`Arquivo restaurado divergente: ${rel}`);
}
console.log('[backup] 5 arquivos exclusivos do backup restaurados e verificados');

const originalBootstrapPath = path.join(repo, 'bootstrap.original.mjs');
let originalBootstrap = fs.readFileSync(originalBootstrapPath, 'utf8');
const marker = "const biometricGatePath = path.join(work, 'src/components/biometric-gate.tsx');";
if (!originalBootstrap.includes(marker)) throw new Error('Bootstrap marker for final patches not found');
const finalBlocks = [];
if (!originalBootstrap.includes('apply-panel-money-two-decimals.mjs')) {
  finalBlocks.push(`const panelMoneyTwoDecimalsPatch = path.join(repo, 'render-overrides', 'apply-panel-money-two-decimals.mjs');\nif (!fs.existsSync(panelMoneyTwoDecimalsPatch)) throw new Error('Missing panel money two-decimals patch');\nexecFileSync(process.execPath, [panelMoneyTwoDecimalsPatch, work], { cwd: repo, stdio: 'inherit' });\n`);
}
if (!originalBootstrap.includes('apply-request-20260916.mjs')) {
  finalBlocks.push(`const request20260916Patch = path.join(repo, 'render-overrides', 'apply-request-20260916.mjs');\nif (!fs.existsSync(request20260916Patch)) throw new Error('Missing 2026-09-16 request patch');\nexecFileSync(process.execPath, [request20260916Patch, work], { cwd: repo, stdio: 'inherit' });\n`);
}
if (finalBlocks.length) {
  originalBootstrap = originalBootstrap.replace(marker, `${finalBlocks.join('\n')}\n${marker}`);
  fs.writeFileSync(originalBootstrapPath, originalBootstrap);
  console.log('[backup] 2026-09-16 final patches injected before production build');
}

execFileSync(process.execPath, [originalBootstrapPath], { cwd: repo, stdio: 'inherit', env: process.env });
