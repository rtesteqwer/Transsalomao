import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const repo = process.cwd();
const sourcePath = path.join(repo, 'bootstrap.mjs');
const source = fs.readFileSync(sourcePath, 'utf8');
const marker = 'fs.writeFileSync(originalPath, original);';
if (!source.includes(marker)) throw new Error('Payments bootstrap insertion marker not found');

const injection = `
// Final payments update: distinguish Pagamento/Acerto, include Adiantamentos,
// show remaining commission for every driver and provide a mobile-first view.
if (!original.includes("apply-payments-acertos-mobile-20261005.mjs")) {
  if (!original.includes(dailyMarker)) throw new Error("Missing payments/mobile insertion point");
  original = original.replace(
    dailyMarker,
    \`execFileSync(process.execPath, [path.join(repo, 'render-overrides', 'apply-payments-acertos-mobile-20261005.mjs'), work], { cwd: repo, stdio: 'inherit', env: process.env });\\n\\n\${dailyMarker}\`
  );
}

`;


const accountingInjection = `
// Final accounting fix: Adiantamentos live in Pagamentos; commission rates are
// normalized and arbitrary day ranges allocate prior payments without double counting.
if (!original.includes("apply-payments-advances-days-20261005.mjs")) {
  if (!original.includes(dailyMarker)) throw new Error("Missing payments/advances/days insertion point");
  original = original.replace(
    dailyMarker,
    \`execFileSync(process.execPath, [path.join(repo, 'render-overrides', 'apply-payments-advances-days-20261005.mjs'), work], { cwd: repo, stdio: 'inherit', env: process.env });\\n\\n\${dailyMarker}\`
  );
}

`;


const statementInjection = `
// Payment UX: Novo pagamento uses the same modal-button pattern as Novo adiantamento,
// and the bottom of the page shows the full payment/advance statement.
if (!original.includes("apply-payments-button-extract-20261006.mjs")) {
  if (!original.includes(dailyMarker)) throw new Error("Missing payments button/extract insertion point");
  original = original.replace(
    dailyMarker,
    \`execFileSync(process.execPath, [path.join(repo, 'render-overrides', 'apply-payments-button-extract-20261006.mjs'), work], { cwd: repo, stdio: 'inherit', env: process.env });\\n\\n\${dailyMarker}\`
  );
}

`;


const totalReaderInjection = `
// Payment period/report UX: add Total history mode and reuse the financial
// document reader for Novo pagamento without auto-launching as an advance.
if (!original.includes("apply-payments-total-reader-20261006.mjs")) {
  if (!original.includes(dailyMarker)) throw new Error("Missing payments total/reader insertion point");
  original = original.replace(
    dailyMarker,
    \`execFileSync(process.execPath, [path.join(repo, 'render-overrides', 'apply-payments-total-reader-20261006.mjs'), work], { cwd: repo, stdio: 'inherit', env: process.env });\\n\\n\${dailyMarker}\`
  );
}

`;


const paidOverLabelInjection = `
// Correct Portuguese label shown when advances/payments exceed commission due.
if (!original.includes("apply-paid-over-label-20261006.mjs")) {
  if (!original.includes(dailyMarker)) throw new Error("Missing paid-over label insertion point");
  original = original.replace(
    dailyMarker,
    \`execFileSync(process.execPath, [path.join(repo, 'render-overrides', 'apply-paid-over-label-20261006.mjs'), work], { cwd: repo, stdio: 'inherit', env: process.env });\\n\\n\${dailyMarker}\`
  );
}

`;


const sessionSecurityInjection = `
// Security hardening must run last, after every source/payment overlay.
if (!original.includes("apply-session-security-20261006.mjs")) {
  if (!original.includes(dailyMarker)) throw new Error("Missing session security insertion point");
  original = original.replace(
    dailyMarker,
    \`execFileSync(process.execPath, [path.join(repo, 'render-overrides', 'apply-session-security-20261006.mjs'), work], { cwd: repo, stdio: 'inherit', env: process.env });\\n\\n\${dailyMarker}\`
  );
}

`;


const auditIntegrityInjection = `
// Final audit hardening: freeze historical trip price/commission snapshots,
// make critical multi-write operations atomic and enforce full TLS verification.
// This must run AFTER session security so later auth patches cannot overwrite it.
if (!original.includes("apply-audit-integrity-20261006.mjs")) {
  if (!original.includes(dailyMarker)) throw new Error("Missing audit integrity insertion point");
  original = original.replace(
    dailyMarker,
    \`execFileSync(process.execPath, [path.join(repo, 'render-overrides', 'apply-audit-integrity-20261006.mjs'), work], { cwd: repo, stdio: 'inherit', env: process.env });\\n\\n\${dailyMarker}\`
  );
}

`;

const patched = source.replace(marker, injection + accountingInjection + statementInjection + totalReaderInjection + paidOverLabelInjection + sessionSecurityInjection + auditIntegrityInjection + marker);
const tempPath = path.join(os.tmpdir(), `transsalomao-bootstrap-payments-${process.pid}.mjs`);
fs.writeFileSync(tempPath, patched);
try {
  execFileSync(process.execPath, [tempPath], { cwd: repo, stdio: 'inherit', env: process.env });
} finally {
  fs.rmSync(tempPath, { force: true });
}
