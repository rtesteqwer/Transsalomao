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

  // Sincroniza o login KlebersomDutra com o cadastro já existente
  // "Klebersom Dutra Da Silva". A leitura passa a seguir o driver_id do cadastro,
  // incluindo todas as viagens, lançamentos e abastecimentos vinculados a ele.
  const apiPath = path.join(work, 'src/lib/api.ts');
  const syncFunctionPath = path.join(deploy, 'klebersom-sync-function.txt');
  if (!fs.existsSync(apiPath) || !fs.existsSync(syncFunctionPath)) {
    throw new Error('Klebersom sync source missing');
  }
  let apiSource = fs.readFileSync(apiPath, 'utf8');
  const syncStart = apiSource.indexOf('async function readKlebersomFleetState');
  const syncEnd = apiSource.indexOf('const driverSchema =', syncStart);
  if (syncStart < 0 || syncEnd < 0) throw new Error('Klebersom sync markers not found in api.ts');
  const syncFunction = fs.readFileSync(syncFunctionPath, 'utf8').trimEnd();
  apiSource = apiSource.slice(0, syncStart) + syncFunction + '\n\n' + apiSource.slice(syncEnd);
  fs.writeFileSync(apiPath, apiSource);

  // Ajusta os textos da área exclusiva para refletir o vínculo pelo motorista,
  // e não apenas por um conjunto específico.
  const partnerRoutePath = path.join(work, 'src/routes/socio-klebersom.tsx');
  let partnerRoute = fs.readFileSync(partnerRoutePath, 'utf8');
  partnerRoute = partnerRoute
    .replace('Nenhuma viagem do Klebersom com o VOLVO KLEBERSOM foi registrada ainda.', 'Nenhuma viagem vinculada a Klebersom Dutra Da Silva foi registrada ainda.')
    .replace('Nenhum abastecimento vinculado ao VOLVO KLEBERSOM.', 'Nenhum abastecimento vinculado a Klebersom Dutra Da Silva.')
    .replace('Esta área é somente leitura e mostra exclusivamente dados vinculados a Klebersom Dutra + VOLVO KLEBERSOM.', 'Esta área é somente leitura e espelha os dados vinculados ao cadastro de Klebersom Dutra Da Silva.');
  fs.writeFileSync(partnerRoutePath, partnerRoute);

  const required = [
    ['src/lib/api.ts', 'drv_d0d50a32b1'],
    ['src/lib/api.ts', 'klebersom dutra da silva'],
    ['src/lib/api.ts', 'where driver_id = '],
    ['src/lib/management-auth.server.ts', 'klebersomDutra'],
    ['src/lib/management-auth.server.ts', 'assertAdminSession'],
    ['src/lib/management-auth.ts', 'role: session.role'],
    ['src/routes/dono/route.tsx', '/socio-klebersom'],
    ['src/routes/socio-klebersom.tsx', 'Klebersom Dutra Da Silva'],
  ];
  for (const [rel, token] of required) {
    const p = path.join(work, rel);
    if (!fs.existsSync(p) || !fs.readFileSync(p, 'utf8').includes(token)) {
      throw new Error('Klebersom integration check failed: ' + rel + ' -> ' + token);
    }
  }
  console.log('[bootstrap] Klebersom access integrated, synced and validated');
}
`;

const generated = source.replace(marker, `${injection}\n${marker}`);
const generatedPath = path.join(os.tmpdir(), `bootstrap-klebersom-${Date.now()}.mjs`);
fs.writeFileSync(generatedPath, generated);
execFileSync(process.execPath, [generatedPath], { cwd: process.cwd(), stdio: 'inherit', env: process.env });
