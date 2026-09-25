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

// Injeta a correção de 17/09 no final da reconstrução da aplicação, antes do build final.
const originalPath = path.join(repo, 'bootstrap.original.mjs');
let original = fs.readFileSync(originalPath, 'utf8');
const marker = "const ticketPerformancePatch = path.join(repo, 'render-overrides', 'apply-ticket-performance.mjs');";
if (!original.includes("apply-request-20260917.mjs")) {
  if (!original.includes(marker)) throw new Error('Ponto de injeção 20260917 não encontrado');
  original = original.replace(marker, `const request20260917 = path.join(repo, 'render-overrides', 'apply-request-20260917.mjs');\nif (!fs.existsSync(request20260917)) throw new Error('Missing 2026-09-17 request patch');\nexecFileSync(process.execPath, [request20260917, work], { cwd: repo, stdio: 'inherit' });\n\n${marker}`);
}

// A reforma de Diária/relatórios deve rodar DEPOIS do patch de performance,
// pois ele altera API e caixa de lançamentos.
const dailyMarker = "const biometricGatePath = path.join(work, 'src/components/biometric-gate.tsx');";
if (!original.includes("apply-daily-and-report-reform-20260917.mjs")) {
  if (!original.includes(dailyMarker)) throw new Error('Ponto de injeção da reforma de Diária não encontrado');
  original = original.replace(dailyMarker, `const dailyReportReform = path.join(repo, 'render-overrides', 'apply-daily-and-report-reform-20260917.mjs');\nif (!fs.existsSync(dailyReportReform)) throw new Error('Missing daily/report reform patch');\nexecFileSync(process.execPath, [dailyReportReform, work], { cwd: repo, stdio: 'inherit' });\n\n${dailyMarker}`);
}

// Reforma visual dos relatórios roda por último, já sobre a estrutura final de Diária.
if (!original.includes("apply-report-visual-20260917b.mjs")) {
  if (!original.includes(dailyMarker)) throw new Error('Ponto de injeção da reforma visual não encontrado');
  original = original.replace(dailyMarker, `const reportVisualReform = path.join(repo, 'render-overrides', 'apply-report-visual-20260917b.mjs');\nif (!fs.existsSync(reportVisualReform)) throw new Error('Missing report visual reform patch');\nexecFileSync(process.execPath, [reportVisualReform, work], { cwd: repo, stdio: 'inherit' });\n\n${dailyMarker}`);
}

// Ajuste final do Excel: fundo azul-claro, logo maior e Excel individual por motorista.
if (!original.includes("apply-excel-blue-driver-20260917.mjs")) {
  if (!original.includes(dailyMarker)) throw new Error('Ponto de injeção do Excel por motorista não encontrado');
  original = original.replace(dailyMarker, `const excelBlueDriver = path.join(repo, 'render-overrides', 'apply-excel-blue-driver-20260917.mjs');\nif (!fs.existsSync(excelBlueDriver)) throw new Error('Missing blue Excel / driver export patch');\nexecFileSync(process.execPath, [excelBlueDriver, work], { cwd: repo, stdio: 'inherit' });\n\n${dailyMarker}`);
}

// Recuperação não destrutiva dos lançamentos aceitos durante a colisão de tickets de 19/09.
if (!original.includes("apply-sep19-recovery.mjs")) {
  if (!original.includes(dailyMarker)) throw new Error('Ponto de injeção da recuperação 19/09 não encontrado');
  original = original.replace(dailyMarker, `const sep19Recovery = path.join(repo, 'render-overrides', 'apply-sep19-recovery.mjs');\nif (!fs.existsSync(sep19Recovery)) throw new Error('Missing Sep 19 recovery patch');\nexecFileSync(process.execPath, [sep19Recovery, work], { cwd: repo, stdio: 'inherit' });\n\n${dailyMarker}`);
}

// Ajustes operacionais finais: ticket automático, edição/seleção da Caixa,
// detalhes por tonelada nos cartões e simplificação dos abastecimentos.
if (!original.includes("apply-operational-ui-20260917c.mjs")) {
  if (!original.includes(dailyMarker)) throw new Error('Ponto de injeção dos ajustes operacionais não encontrado');
  original = original.replace(dailyMarker, `const operationalUiPatch = path.join(repo, 'render-overrides', 'apply-operational-ui-20260917c.mjs');\nif (!fs.existsSync(operationalUiPatch)) throw new Error('Missing operational UI patch');\nexecFileSync(process.execPath, [operationalUiPatch, work], { cwd: repo, stdio: 'inherit' });\n\n${dailyMarker}`);
}

// Instala o endpoint de dados do Salomão IA depois de todas as reformas da aplicação.
if (!original.includes("apply-assistant-data-agent-v3.mjs")) {
  if (!original.includes(dailyMarker)) throw new Error('Ponto de injeção do Salomão IA não encontrado');
  original = original.replace(dailyMarker, `const assistantDataAgentV3 = path.join(repo, 'render-overrides', 'apply-assistant-data-agent-v3.mjs');\nif (!fs.existsSync(assistantDataAgentV3)) throw new Error('Missing assistant data agent v3 patch');\nexecFileSync(process.execPath, [assistantDataAgentV3, work], { cwd: repo, stdio: 'inherit' });\n\n${dailyMarker}`);
}


// Salomão IA v4: autenticação independente, roteamento de intenção e ações do sistema.
if (!original.includes("apply-salomao-v4-actions.mjs")) {
  if (!original.includes(dailyMarker)) throw new Error('Ponto de injeção do Salomão v4 não encontrado');
  original = original.replace(dailyMarker, `const salomaoV4 = path.join(repo, 'render-overrides', 'apply-salomao-v4-actions.mjs');\nif (!fs.existsSync(salomaoV4)) throw new Error('Missing Salomao v4 patch');\nexecFileSync(process.execPath, [salomaoV4, work], { cwd: repo, stdio: 'inherit' });\n\n${dailyMarker}`);
}

// Integração segura do Meu Capital PF: 3% do faturamento bruto + 20% das viagens de Felipe.
if (!original.includes("apply-pf-sync.mjs")) {
  if (!original.includes(dailyMarker)) throw new Error('Ponto de injeção do Meu Capital PF não encontrado');
  original = original.replace(dailyMarker, `const pfSync = path.join(repo, 'render-overrides', 'apply-pf-sync.mjs');\nif (!fs.existsSync(pfSync)) throw new Error('Missing Meu Capital PF sync patch');\nexecFileSync(process.execPath, [pfSync, work], { cwd: repo, stdio: 'inherit' });\n\n${dailyMarker}`);
}

// Aba societária exclusiva do Felipe: 3% do faturamento bruto.
// O repositório também atende outro projeto Vercel; esta aba pertence somente ao Trans Salomão.
const ownerShareProductionUrl = String(process.env.VERCEL_PROJECT_PRODUCTION_URL || '').toLowerCase();
const installOwnerShare = process.env.VERCEL !== '1' || ownerShareProductionUrl.includes('transsalomao.vercel.app');
if (installOwnerShare && !original.includes("apply-owner-share-tab.mjs")) {
  if (!original.includes(dailyMarker)) throw new Error('Ponto de injeção da participação do Felipe não encontrado');
  original = original.replace(dailyMarker, `const ownerShareTab = path.join(repo, 'render-overrides', 'apply-owner-share-tab.mjs');\nif (!fs.existsSync(ownerShareTab)) throw new Error('Missing Felipe 3% share tab patch');\nexecFileSync(process.execPath, [ownerShareTab, work], { cwd: repo, stdio: 'inherit' });\n\n${dailyMarker}`);
} else if (!installOwnerShare) {
  console.log('[owner-share-tab] skipped: Vercel project is not Trans Salomao');
}

// Entrada operacional via WhatsApp: só pertence ao projeto Trans Salomão.
// O mesmo repositório também está conectado a outro projeto Vercel; nele o patch é ignorado.
const vercelProductionUrl = String(process.env.VERCEL_PROJECT_PRODUCTION_URL || '').toLowerCase();
const installWhatsApp = process.env.VERCEL !== '1' || vercelProductionUrl.includes('transsalomao.vercel.app');
if (installWhatsApp && !original.includes("apply-whatsapp-ingestion-v1.mjs")) {
  if (!original.includes(dailyMarker)) throw new Error('Ponto de injeção do WhatsApp não encontrado');
  original = original.replace(dailyMarker, `const whatsappIngestionV1 = path.join(repo, 'render-overrides', 'apply-whatsapp-ingestion-v1.mjs');\nif (!fs.existsSync(whatsappIngestionV1)) throw new Error('Missing WhatsApp ingestion v1 patch');\nexecFileSync(process.execPath, [whatsappIngestionV1, work], { cwd: repo, stdio: 'inherit' });\n\n${dailyMarker}`);
} else if (!installWhatsApp) {
  console.log('[whatsapp-ingestion-v1] skipped: Vercel project is not Trans Salomao');
}

if (installWhatsApp && !original.includes("apply-whatsapp-management-mode.mjs")) {
  if (!original.includes(dailyMarker)) throw new Error('Ponto de injeção da decisão de modalidade WhatsApp não encontrado');
  original = original.replace(dailyMarker, `const whatsappManagementMode = path.join(repo, 'render-overrides', 'apply-whatsapp-management-mode.mjs');\nif (!fs.existsSync(whatsappManagementMode)) throw new Error('Missing WhatsApp management mode patch');\nexecFileSync(process.execPath, [whatsappManagementMode, work], { cwd: repo, stdio: 'inherit' });\n\n${dailyMarker}`);
}

// Exibe o peso real no histórico da aba Lançamentos, com precisão de kg (3 casas).
if (!original.includes("apply-lancamentos-real-weight.mjs")) {
  if (!original.includes(dailyMarker)) throw new Error('Ponto de injeção do peso real em Lançamentos não encontrado');
  original = original.replace(dailyMarker, `const lancamentosRealWeight = path.join(repo, 'render-overrides', 'apply-lancamentos-real-weight.mjs');\nif (!fs.existsSync(lancamentosRealWeight)) throw new Error('Missing real-weight display patch');\nexecFileSync(process.execPath, [lancamentosRealWeight, work], { cwd: repo, stdio: 'inherit' });\n\n${dailyMarker}`);
}

// Peso exato no app do motorista + aba Fotos IA para leitura de tickets e lançamento na Caixa.
const installPhotoAi = process.env.VERCEL !== '1' || String(process.env.VERCEL_PROJECT_PRODUCTION_URL || '').toLowerCase().includes('transsalomao.vercel.app');
if (installPhotoAi && !original.includes("apply-photo-intake-ai-20260923.mjs")) {
  if (!original.includes(dailyMarker)) throw new Error('Ponto de injeção da aba Fotos IA não encontrado');
  original = original.replace(dailyMarker, `const photoIntakeAi = path.join(repo, 'render-overrides', 'apply-photo-intake-ai-20260923.mjs');\nif (!fs.existsSync(photoIntakeAi)) throw new Error('Missing photo intake AI patch');\nexecFileSync(process.execPath, [photoIntakeAi, work], { cwd: repo, stdio: 'inherit' });\n\n${dailyMarker}`);
}

// Relatórios individuais por motorista: cada viagem por tonelada deve sair completa no Excel e PDF.
if (!original.includes("apply-driver-tonnage-report-details-20260923.mjs")) {
  if (!original.includes(dailyMarker)) throw new Error('Ponto de injeção do detalhamento por tonelada não encontrado');
  original = original.replace(dailyMarker, `const driverTonnageReports = path.join(repo, 'render-overrides', 'apply-driver-tonnage-report-details-20260923.mjs');\nif (!fs.existsSync(driverTonnageReports)) throw new Error('Missing driver tonnage report detail patch');\nexecFileSync(process.execPath, [driverTonnageReports, work], { cwd: repo, stdio: 'inherit' });\n\n${dailyMarker}`);
}

// Leitura do ticket por foto no app do motorista: Anthropic -> conferência -> Neon/Caixa.
const installDriverTicketReader = process.env.VERCEL !== '1' || String(process.env.VERCEL_PROJECT_PRODUCTION_URL || '').toLowerCase().includes('transsalomao.vercel.app');
if (installDriverTicketReader && !original.includes("apply-driver-ticket-reader-20260924.mjs")) {
  if (!original.includes(dailyMarker)) throw new Error('Ponto de injeção do leitor de ticket do motorista não encontrado');
  original = original.replace(dailyMarker, `const driverTicketReader = path.join(repo, 'render-overrides', 'apply-driver-ticket-reader-20260924.mjs');\nif (!fs.existsSync(driverTicketReader)) throw new Error('Missing driver ticket reader patch');\nexecFileSync(process.execPath, [driverTicketReader, work], { cwd: repo, stdio: 'inherit' });\n\n${dailyMarker}`);
}

if (!original.includes("apply-release-fixes-20260925.mjs")) {
  if (!original.includes(dailyMarker)) throw new Error('Ponto de correção final não encontrado');
  original = original.replace(dailyMarker, `execFileSync(process.execPath, [path.join(repo, 'render-overrides', 'apply-release-fixes-20260925.mjs'), work], { cwd: repo, stdio: 'inherit' });\n\n${dailyMarker}`);
}

// Preenche o formulário de fechamento da Caixa com os dados captados da foto do ticket.
if (!original.includes("apply-caixa-ticket-prefill-20260925.mjs")) {
  if (!original.includes(dailyMarker)) throw new Error('Ponto de preenchimento automático da Caixa não encontrado');
  original = original.replace(dailyMarker, `const caixaTicketPrefill = path.join(repo, 'render-overrides', 'apply-caixa-ticket-prefill-20260925.mjs');\nif (!fs.existsSync(caixaTicketPrefill)) throw new Error('Missing Caixa ticket prefill patch');\nexecFileSync(process.execPath, [caixaTicketPrefill, work], { cwd: repo, stdio: 'inherit' });\n\n${dailyMarker}`);
}

// Padroniza todos os Excel por data da viagem, modalidade e cor, por último para não ser sobrescrito.
if (!original.includes("apply-excel-date-mode-style-20260925.mjs")) {
  if (!original.includes(dailyMarker)) throw new Error('Ponto de padronização dos Excel não encontrado');
  original = original.replace(dailyMarker, `const excelDateModeStyle = path.join(repo, 'render-overrides', 'apply-excel-date-mode-style-20260925.mjs');\nif (!fs.existsSync(excelDateModeStyle)) throw new Error('Missing Excel date/mode style patch');\nexecFileSync(process.execPath, [excelDateModeStyle, work], { cwd: repo, stdio: 'inherit' });\n\n${dailyMarker}`);
}

// Cegonha/Caixinha: várias fotos, sem dados de ticket obrigatórios e agrupamento por modalidade na Caixa.
if (!original.includes("apply-fixed-photo-batch-20260925.mjs")) {
  if (!original.includes(dailyMarker)) throw new Error('Ponto de lote de fotos Cegonha/Caixinha não encontrado');
  original = original.replace(dailyMarker, `const fixedPhotoBatch = path.join(repo, 'render-overrides', 'apply-fixed-photo-batch-20260925.mjs');\nif (!fs.existsSync(fixedPhotoBatch)) throw new Error('Missing fixed photo batch patch');\nexecFileSync(process.execPath, [fixedPhotoBatch, work], { cwd: repo, stdio: 'inherit' });\n\n${dailyMarker}`);
}

fs.writeFileSync(originalPath, original);

execFileSync(process.execPath, [originalPath], { cwd: repo, stdio: 'inherit', env: process.env });
