import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const target = process.argv[2];
if (!target) throw new Error('compact-reports-safe: target missing');

const repo = process.cwd();
const original = path.join(repo, 'render-overrides', 'apply-compact-fixed-mode-reports.mjs');
let source = fs.readFileSync(original, 'utf8');

const buggy = `      const driverName = String(trip.driverName ?? driverName ?? "Motorista").trim() || "Motorista";\n      const driverKey = String(trip.driverId ?? driverName);\n      const key = driverKey + "|" + mode;\n      const current = grouped.get(key) ?? {\n        kind: "group", mode, label: modeLabelCompact(mode), count: 0, driverName,`;
const fixed = `      const rowDriverName = String(trip.driverName ?? "Motorista").trim() || "Motorista";\n      const driverKey = String(trip.driverId ?? rowDriverName);\n      const key = driverKey + "|" + mode;\n      const current = grouped.get(key) ?? {\n        kind: "group", mode, label: modeLabelCompact(mode), count: 0, driverName: rowDriverName,`;
if (!source.includes(buggy)) throw new Error('compact-reports-safe: driver grouping fix marker missing');
source = source.replace(buggy, fixed);

const temp = path.join(os.tmpdir(), `compact-reports-${Date.now()}.mjs`);
fs.writeFileSync(temp, source);
execFileSync(process.execPath, [temp, target], { cwd: repo, stdio: 'inherit' });
fs.rmSync(temp, { force: true });

const simplifyUi = path.join(repo, 'render-overrides', 'apply-simplify-viagens-caixa.mjs');
if (!fs.existsSync(simplifyUi)) throw new Error('compact-reports-safe: missing simplify Viagens/Caixa patch');
execFileSync(process.execPath, [simplifyUi, target], { cwd: repo, stdio: 'inherit' });

const caixaDeleteSync = path.join(repo, 'render-overrides', 'apply-caixa-delete-sync.mjs');
if (!fs.existsSync(caixaDeleteSync)) throw new Error('compact-reports-safe: missing Caixa delete sync patch');
execFileSync(process.execPath, [caixaDeleteSync, target], { cwd: repo, stdio: 'inherit' });

const pdfAdvancesSync = path.join(repo, 'render-overrides', 'apply-pdf-advances-sync.mjs');
if (!fs.existsSync(pdfAdvancesSync)) throw new Error('compact-reports-safe: missing PDF advances sync patch');
execFileSync(process.execPath, [pdfAdvancesSync, target], { cwd: repo, stdio: 'inherit' });

const excelDieselLogoSync = path.join(repo, 'render-overrides', 'apply-excel-diesel-logo-sync.mjs');
if (!fs.existsSync(excelDieselLogoSync)) throw new Error('compact-reports-safe: missing Excel diesel/logo sync patch');
execFileSync(process.execPath, [excelDieselLogoSync, target], { cwd: repo, stdio: 'inherit' });

const financialUxAuditSafe = path.join(repo, 'render-overrides', 'apply-financial-ux-audit-safe.mjs');
if (!fs.existsSync(financialUxAuditSafe)) throw new Error('compact-reports-safe: missing safe financial UX/audit patch');
execFileSync(process.execPath, [financialUxAuditSafe, target], { cwd: repo, stdio: 'inherit' });

const dashboardCommissionPrimary = path.join(repo, 'render-overrides', 'apply-dashboard-commission-primary.mjs');
if (!fs.existsSync(dashboardCommissionPrimary)) throw new Error('compact-reports-safe: missing dashboard commission primary patch');
execFileSync(process.execPath, [dashboardCommissionPrimary, target], { cwd: repo, stdio: 'inherit' });

const reportPolishFuelings = path.join(repo, 'render-overrides', 'apply-report-polish-fuelings.mjs');
if (!fs.existsSync(reportPolishFuelings)) throw new Error('compact-reports-safe: missing report polish/fuelings patch');
execFileSync(process.execPath, [reportPolishFuelings, target], { cwd: repo, stdio: 'inherit' });

const dashboardDieselNetOrder = path.join(repo, 'render-overrides', 'apply-dashboard-diesel-net-order.mjs');
if (!fs.existsSync(dashboardDieselNetOrder)) throw new Error('compact-reports-safe: missing dashboard diesel/net order patch');
execFileSync(process.execPath, [dashboardDieselNetOrder, target], { cwd: repo, stdio: 'inherit' });

const inspector = path.join(repo, 'render-overrides', 'inspect-dashboard-excel-cleanup.mjs');
if (fs.existsSync(inspector)) execFileSync(process.execPath, [inspector, target], { cwd: repo, stdio: 'inherit' });
