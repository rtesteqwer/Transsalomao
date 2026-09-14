import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { execFileSync, execSync } from 'node:child_process';

const cwd = process.cwd();
const repo = fs.existsSync(path.join(cwd, 'deploy')) ? cwd : path.resolve(cwd, '..');
const deploy = path.join(repo, 'deploy');
const work = fs.mkdtempSync(path.join(os.tmpdir(), 'transsalomao-build-'));

function sha(data) { return crypto.createHash('sha256').update(data).digest('hex'); }
function read(rel) { return fs.readFileSync(path.join(deploy, rel), 'utf8'); }
function layer(parts, b64Hash, xzHash, xzSize, name) {
  const b64 = parts.map((p) => typeof p === 'string' ? read(p) : read(p.file).slice(0, p.take)).join('');
  if (sha(b64) !== b64Hash) throw new Error(`${name}: base64 hash mismatch`);
  const xz = Buffer.from(b64, 'base64');
  if (xz.length !== xzSize || sha(xz) !== xzHash) throw new Error(`${name}: xz hash mismatch`);
  const archive = path.join(os.tmpdir(), `${name}-${Date.now()}.tar.xz`);
  fs.writeFileSync(archive, xz);
  execFileSync('xz', ['-t', archive], { stdio: 'inherit' });
  execFileSync('tar', ['-xJf', archive, '-C', work], { stdio: 'inherit' });
}
function replaceFile(rel, fn) {
  const p = path.join(work, rel);
  if (!fs.existsSync(p)) return;
  const before = fs.readFileSync(p, 'utf8');
  fs.writeFileSync(p, fn(before));
}

layer([
  'release-exact-20260911/part-00.txt','release-exact-20260911/part-01.txt','release-exact-20260911/part-02.txt','release-exact-20260911/part-03.txt','release-exact-20260911/part-04.txt','release-exact-20260911/part-05a.txt','release-exact-20260911/part-05b.txt','release-exact-20260911/part-05c.txt','release-exact-20260911/part-06.txt','release-exact-20260911/part-07.txt','release-exact-20260911/part-08.txt','release-exact-20260911/part-09.txt','release-exact-20260911/part-10.txt','release-exact-20260911/part-11a.txt',{file:'release-exact-20260911/part-11b.txt',take:5000},'release-exact-20260911/part-11c.txt','release-exact-20260911/part-12a.txt','release-exact-20260911/part-12b.txt'
], '8135125e22be35abc6c8269aa2b9262982e0b3a016759e30d7a33b5495440fab', '5e82558aae1e340041952bacfe7e34ccbd25d779a8ff8ad167cefd3c4c609272', 141284, 'base');
layer(['reform-20260911-viagens-kml/part-00.txt','reform-20260911-viagens-kml/part-01.txt','reform-20260911-viagens-kml/part-02.txt','reform-20260911-viagens-kml/part-03.txt','reform-20260911-viagens-kml/part-04.txt','reform-20260911-viagens-kml/part-05.txt','reform-20260911-viagens-kml/part-06.txt'], '6cbf727ad86e43397d70344a2dc553e06d7c4f9c7397c0a919ea9e170e6fb9ae', 'bd0173a9b373c4883d3e6593928e9e785ac5e98b07f511fa94bb9e16f872be30', 23384, 'reform');
layer(['reform-fix2-20260911/part-00.txt','reform-fix2-20260911/part-01.txt','reform-fix2-20260911/part-02.txt'], '19307bcf4c0e772c7acc73321b05331a2e3a1757140f2c92e736299a72274803', '7db6a17595058a84d39f68328c5e741d3149c8cc636e6d60ba90ea36586c3aeb', 9356, 'fix2');
layer(['reform-final2-20260911/part-00.txt','reform-final2-20260911/part-01.txt','reform-final2-20260911/part-02.txt','reform-final2-20260911/part-03.txt'], 'af9d4bc77acbc9618017c6370a4875c30f5b30638be935c9960cc85c2930d0af', '2c6d85831cfd378c249f007ca20c5aba255fe004d0bf4d10a0e9b6bf2b09fb36', 21968, 'final2');

const patchB64 = read('update-patch-20260913/update.patch.xz.b64');
if (patchB64.length !== 19208 || sha(patchB64) !== '916a9e465494455256ab8fac76acc76c8b34140325f3815103c16bf4c37133f6') throw new Error('update patch integrity mismatch');
const patchArchive = path.join(os.tmpdir(), `update-patch-${Date.now()}.xz`);
fs.writeFileSync(patchArchive, Buffer.from(patchB64, 'base64'));
const patch = execFileSync('xz', ['-dc', patchArchive]);
const patchFile = path.join(os.tmpdir(), `update-patch-${Date.now()}.patch`);
fs.writeFileSync(patchFile, patch);
console.log('[bootstrap] applying 2026-09-13 update; rejected hunks are treated as already-newer/conflicting source');
try { execFileSync('git', ['apply', '--reject', '--whitespace=nowarn', patchFile], { cwd: work, stdio: 'inherit' }); }
catch { console.log('[bootstrap] continuing after rejected hunks'); }

replaceFile('src/lib/calc.ts', (s) => s
  .replace(/return `VG-\$\{String\(max \+ 1\)\.padStart\(4, "0"\)\}`;/g, 'return String(max + 1);')
  .replace(/return `LCT-[^;]+;/g, 'return String(max + 1);'));
fs.writeFileSync(path.join(work, 'migrations', '0005_renumber_tickets.sql'), '-- Tickets 1..79 já foram corrigidos no banco de produção e preservados em auditoria.\n-- Não renumerar novamente no deploy.\nSELECT 1;\n');

// Optional release overlay supplied by the deployment wrapper.
const overlay = process.env.TRANS_OVERLAY_DIR;
if (overlay && fs.existsSync(overlay)) {
  const copies = [
    ['index.tsx', 'src/routes/index.tsx'],
    ['styles.css', 'src/styles.css'],
    ['motorista.tsx', 'src/routes/motorista.tsx'],
    ['dono-route.tsx', 'src/routes/dono/route.tsx'],
    ['owner-shell.tsx', 'src/components/owner/shell.tsx'],
    ['trans-salomao-background.webp', 'public/trans-salomao-background.webp'],
  ];
  for (const [src, dest] of copies) {
    const from = path.join(overlay, src);
    if (!fs.existsSync(from)) continue;
    const to = path.join(work, dest);
    fs.mkdirSync(path.dirname(to), { recursive: true });
    fs.copyFileSync(from, to);
    console.log(`[bootstrap] overlay ${dest}`);
  }
}

// Base de preços globais para os modos fixos.
const freightPricesPatch = path.join(repo, 'render-overrides', 'run-freight-prices-safe.mjs');
if (!fs.existsSync(freightPricesPatch)) throw new Error('Missing safe freight price patch');
execFileSync(process.execPath, [freightPricesPatch, work], { cwd: repo, stdio: 'inherit' });

// Seleção/edição/exclusão em lote e regra final de preços:
// Por tonelada individual por viagem; Por viagem/Cegonha/Caixinha globais.
const tripBulkPricesPatch = path.join(repo, 'render-overrides', 'apply-trip-bulk-and-prices.mjs');
if (!fs.existsSync(tripBulkPricesPatch)) throw new Error('Missing trip bulk price patch');
execFileSync(process.execPath, [tripBulkPricesPatch, work], { cwd: repo, stdio: 'inherit' });

// UX do motorista e apresentação da aba Viagens.
const driverModeTripDisplayPatch = path.join(repo, 'render-overrides', 'apply-driver-mode-and-trip-display.mjs');
if (!fs.existsSync(driverModeTripDisplayPatch)) throw new Error('Missing driver mode / trip display patch');
execFileSync(process.execPath, [driverModeTripDisplayPatch, work], { cwd: repo, stdio: 'inherit' });

// Biometria removida de forma definitiva. Mantemos apenas um componente de
// compatibilidade que libera a tela imediatamente e apaga cadastros antigos do
// navegador. Nenhuma chamada a WebAuthn, digital, Face ID ou bridge nativa é feita.
const biometricGatePath = path.join(work, 'src/components/biometric-gate.tsx');
fs.mkdirSync(path.dirname(biometricGatePath), { recursive: true });
fs.writeFileSync(biometricGatePath, `import { useEffect, type ReactNode } from "react";\n\nexport function BiometricGate({ children }: { scope?: string; children: ReactNode }) {\n  useEffect(() => {\n    try {\n      for (let i = localStorage.length - 1; i >= 0; i -= 1) {\n        const key = localStorage.key(i);\n        if (key?.startsWith("transsalomao.biometric.")) localStorage.removeItem(key);\n      }\n      for (let i = sessionStorage.length - 1; i >= 0; i -= 1) {\n        const key = sessionStorage.key(i);\n        if (key?.startsWith("transsalomao.biometric.")) sessionStorage.removeItem(key);\n      }\n    } catch {}\n  }, []);\n  return <>{children}</>;\n}\n`);
for (const rel of [
  'native/android/BiometricBridge.kt',
  'native/android/biometric-webview-bridge.js',
]) {
  fs.rmSync(path.join(work, rel), { force: true });
}
console.log('[bootstrap] biometric authentication removed');

console.log('[bootstrap] installing and building final source');
execSync('npm install --ignore-scripts --no-audit --no-fund', { cwd: work, stdio: 'inherit', env: process.env });
execSync('npm run build', { cwd: work, stdio: 'inherit', env: process.env });
const from = path.join(work, '.vercel', 'output');
const to = path.join(cwd, '.vercel', 'output');
fs.rmSync(to, { recursive: true, force: true });
fs.mkdirSync(path.dirname(to), { recursive: true });
fs.cpSync(from, to, { recursive: true });
console.log('[bootstrap] Vercel output copied');
