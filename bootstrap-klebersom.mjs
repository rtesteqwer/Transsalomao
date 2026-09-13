import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

// Este build deve manter a versão estável anterior ao fundo e acrescentar
// somente o acesso exclusivo do Klebersom. O diretório vazio impede o overlay
// visual mais recente de ser aplicado pelo bootstrap principal.
const emptyOverlay = path.resolve('deploy/klebersom-empty-overlay');
fs.mkdirSync(emptyOverlay, { recursive: true });
process.env.TRANS_OVERLAY_DIR = emptyOverlay;
process.env.TRANS_KLEBERSOM_PATCH = '1';

const sourcePath = path.resolve('bootstrap.mjs');
const source = fs.readFileSync(sourcePath, 'utf8');
const marker = '// REMOÇÃO DEFINITIVA DA BIOMETRIA';
if (!source.includes(marker)) throw new Error('bootstrap marker not found');

const injection = String.raw`
// PÁGINA EXCLUSIVA DO KLEBERSOM — aplicada sobre a versão estável anterior ao fundo.
if (process.env.TRANS_KLEBERSOM_PATCH === '1') {
  const originalStylesPath = path.join(work, 'src/styles.css');
  const originalStyles = fs.existsSync(originalStylesPath) ? fs.readFileSync(originalStylesPath) : null;
  const klebersomPatchPath = path.join(deploy, 'klebersom-readable.patch');
  if (!fs.existsSync(klebersomPatchPath)) throw new Error('Klebersom patch not found');
  const patchFileK = path.join(os.tmpdir(), 'klebersom-' + Date.now() + '.patch');
  fs.copyFileSync(klebersomPatchPath, patchFileK);
  console.log('[bootstrap] applying Klebersom partner access patch');
  try {
    execFileSync('git', ['apply', '--reject', '--whitespace=nowarn', patchFileK], { cwd: work, stdio: 'inherit' });
  } catch {
    console.log('[bootstrap] Klebersom patch had rejected hunks; validating required changes');
  }

  // O patch original mudava a cor global para azul. A versão restaurada deve
  // manter exatamente o tema anterior ao fundo; azul fica somente na página exclusiva.
  if (originalStyles) fs.writeFileSync(originalStylesPath, originalStyles);

  const klebCopies = [
    ['klebersom-overlay/socio-klebersom.tsx', 'src/routes/socio-klebersom.tsx'],
    ['klebersom-overlay/0006_klebersom_partner.sql', 'migrations/0006_klebersom_partner.sql'],
  ];
  for (const [src, dest] of klebCopies) {
    const from = path.join(deploy, src);
    if (!fs.existsSync(from)) throw new Error('Missing Klebersom overlay: ' + src);
    const to = path.join(work, dest);
    fs.mkdirSync(path.dirname(to), { recursive: true });
    fs.copyFileSync(from, to);
    console.log('[bootstrap] Klebersom overlay ' + dest);
  }

  const required = [
    ['src/lib/api.ts', 'getKlebersomFleetState'],
    ['src/lib/management-auth.server.ts', 'klebersomDutra'],
    ['src/lib/management-auth.server.ts', 'assertAdminSession'],
    ['src/lib/management-auth.ts', 'role: session.role'],
    ['src/routes/dono/route.tsx', '/socio-klebersom'],
    ['src/routes/socio-klebersom.tsx', 'Klebersom Dutra'],
  ];
  for (const [rel, token] of required) {
    const p = path.join(work, rel);
    if (!fs.existsSync(p) || !fs.readFileSync(p, 'utf8').includes(token)) {
      throw new Error('Klebersom integration check failed: ' + rel + ' -> ' + token);
    }
  }
  console.log('[bootstrap] Klebersom access integrated and validated');
}
`;

const generated = source.replace(marker, `${injection}\n${marker}`);
const generatedPath = path.join(os.tmpdir(), `bootstrap-klebersom-${Date.now()}.mjs`);
fs.writeFileSync(generatedPath, generated);
execFileSync(process.execPath, [generatedPath], { cwd: process.cwd(), stdio: 'inherit', env: process.env });
