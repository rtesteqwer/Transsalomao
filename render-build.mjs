import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

const cwd = process.cwd();
const target = path.join(cwd, '.transteste_app');
const readOverride = (name) => fs.readFileSync(path.join(cwd, 'render-overrides', name), 'utf8');

// The canonical Render domain has no duplicated secrets. It securely proxies the
// existing tested service while keeping transsalomao.onrender.com visible to users.
const canonicalDomainProxy =
  process.env.RENDER_SERVICE_ID === 'srv-dajjl98ae00c73a81v20' ||
  process.env.RENDER_EXTERNAL_HOSTNAME === 'transsalomao.onrender.com';
if (canonicalDomainProxy) {
  fs.rmSync(target, { recursive: true, force: true });
  fs.mkdirSync(target, { recursive: true });
  fs.copyFileSync(path.join(cwd, 'render-overrides', 'domain-proxy.mjs'), path.join(target, 'server.mjs'));
  fs.writeFileSync(
    path.join(target, 'package.json'),
    `${JSON.stringify({ name: 'transsalomao-domain-proxy', private: true, type: 'module', scripts: { start: 'node server.mjs' } }, null, 2)}\n`,
  );
  console.log('[render] canonical domain proxy prepared: transsalomao.onrender.com -> transteste.onrender.com');
  process.exit(0);
}

fs.rmSync(target, { recursive: true, force: true });
fs.mkdirSync(target, { recursive: true });
fs.mkdtempSync = () => target;

const originalCpSync = fs.cpSync.bind(fs);
fs.cpSync = (src, dest, options) => {
  if (String(src).includes(`${path.sep}.vercel${path.sep}output`) && !fs.existsSync(src)) {
    console.log('[render] skipping Vercel-only output copy');
    return;
  }
  return originalCpSync(src, dest, options);
};

process.env.NITRO_PRESET = 'node-server';
process.env.NODE_ENV = 'production';
process.env.NPM_CONFIG_PRODUCTION = 'false';
process.env.npm_config_production = 'false';
process.env.NPM_CONFIG_INCLUDE = 'dev';
process.env.npm_config_include = 'dev';

await import('./bootstrap.mjs');

// Tickets strictly numeric.
const apiPath = path.join(target, 'src', 'lib', 'api.ts');
if (fs.existsSync(apiPath)) {
  const before = fs.readFileSync(apiPath, 'utf8');
  const legacyLine = '    const autoTicket = `LCT-${new Date().toISOString().replace(/\\D/g, "").slice(2, 14)}-${id.slice(-4).toUpperCase()}`;';
  const numericGenerator = [
    '    const tripCodes = await sql<{ code: string }>`select code from trips`;',
    '    const reportTickets = await sql<{ ticket: string }>`select ticket from reports where status <> \'recusado\'`;',
    '    const numericTickets = [',
    '      ...tripCodes.map((row) => Number(row.code)),',
    '      ...reportTickets.map((row) => Number(row.ticket)),',
    '    ].filter((value) => Number.isFinite(value) && value > 0);',
    '    const autoTicket = String((numericTickets.length ? Math.max(...numericTickets) : 0) + 1);',
  ].join('\n');
  const after = before.replace(legacyLine, numericGenerator);
  if (after === before && before.includes('LCT-')) throw new Error('Legacy LCT ticket generator still present');
  if (after !== before) fs.writeFileSync(apiPath, after);
}

function assertNoLegacyTicketGenerators(dir) {
  if (!fs.existsSync(dir)) return;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      assertNoLegacyTicketGenerators(full);
      continue;
    }
    if (!/\.(?:ts|tsx|js|jsx|mjs|cjs)$/.test(entry.name)) continue;
    const text = fs.readFileSync(full, 'utf8');
    if (text.includes('LCT-') || text.includes('VG-')) throw new Error(`Legacy ticket generator still present in ${path.relative(target, full)}`);
  }
}
assertNoLegacyTicketGenerators(path.join(target, 'src'));

// Every displayed weight uses exactly two decimals.
const formatPath = path.join(target, 'src', 'lib', 'format.ts');
if (fs.existsSync(formatPath)) {
  const before = fs.readFileSync(formatPath, 'utf8');
  const after = before
    .replace(/minimumFractionDigits\s*:\s*1\s*,\s*\n\s*maximumFractionDigits\s*:\s*1\s*,/m, 'minimumFractionDigits: 2,\n  maximumFractionDigits: 2,')
    .replace(/minimumFractionDigits\s*:\s*0\s*,\s*\n\s*maximumFractionDigits\s*:\s*20\s*,/m, 'minimumFractionDigits: 2,\n  maximumFractionDigits: 2,');
  if (after === before && !/minimumFractionDigits\s*:\s*2[\s\S]{0,80}maximumFractionDigits\s*:\s*2/.test(before)) {
    throw new Error('Tonnage formatter precision block not found');
  }
  fs.writeFileSync(formatPath, after);
  console.log('[render] site-wide weights fixed at exactly 2 decimals');
}

const caixaPath = path.join(target, 'src', 'routes', 'dono', 'lancamentos.tsx');
if (fs.existsSync(caixaPath)) {
  const before = fs.readFileSync(caixaPath, 'utf8');
  let replacements = 0;
  const after = before.replace(/\{num\(([^,)]+\.tons),\s*\d+\)\}\s*t/g, (_match, expression) => {
    replacements += 1;
    return `{new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(${expression})} t`;
  });
  if (replacements === 0 && !before.includes('minimumFractionDigits: 2, maximumFractionDigits: 2')) {
    throw new Error('Caixa tonnage display pattern not found');
  }
  fs.writeFileSync(caixaPath, after);
}

// Libraries used by the new report engines.
execSync('npm install exceljs@4.4.0 jspdf@3.0.1 jspdf-autotable@5.0.2 --no-save --ignore-scripts --no-audit --no-fund', {
  cwd: target,
  stdio: 'inherit',
  env: process.env,
});

// Install the official user-supplied logo.
const reportLogoTarget = path.join(target, 'src', 'lib', 'report-logo.ts');
fs.mkdirSync(path.dirname(reportLogoTarget), { recursive: true });
fs.copyFileSync(path.join(cwd, 'render-overrides', 'report-logo.ts'), reportLogoTarget);

// Admin Excel: true XLSX with logo, radiant-blue borders and clear contrast.
const totalsPath = path.join(target, 'src', 'routes', 'dono', 'totais.tsx');
if (fs.existsSync(totalsPath)) {
  let totals = fs.readFileSync(totalsPath, 'utf8');
  if (!totals.includes('REPORT_LOGO_JPEG')) {
    totals = `import { REPORT_LOGO_JPEG } from "@/lib/report-logo";\n${totals}`;
  }
  const exportStart = totals.indexOf('  function exportCurrent() {');
  const returnStart = exportStart >= 0 ? totals.indexOf('\n\n  return (', exportStart) : -1;
  if (exportStart < 0 || returnStart < 0) throw new Error('Relatórios export block not found');
  const excelSnippet = readOverride('admin-excel.snippet.ts').trimEnd();
  totals = totals.slice(0, exportStart) + '  ' + excelSnippet.replace(/\n/g, '\n  ') + totals.slice(returnStart);

  const csvButton = /<button type="button" onClick=\{exportCurrent\} className="h-11 rounded-md border border-border px-4 text-sm text-fg hover:bg-surface-2">\s*Exportar CSV\s*<\/button>/m;
  const existingExcelButton = /<button type="button" onClick=\{exportExcelColorido\} className="h-11 rounded-md[^>]*>[\s\S]*?Excel colorido[\s\S]*?<\/button>/m;
  const newExcelButton = '<button type="button" onClick={exportExcelColorido} className="h-11 rounded-md border border-accent bg-bg px-4 text-sm font-semibold text-fg hover:bg-surface-2">\n            Excel colorido (.xlsx)\n          </button>';
  if (csvButton.test(totals)) totals = totals.replace(csvButton, newExcelButton);
  else if (existingExcelButton.test(totals)) totals = totals.replace(existingExcelButton, newExcelButton);
  else throw new Error('Relatórios Excel button not found');
  fs.writeFileSync(totalsPath, totals);
  console.log('[render] Admin Excel: official logo + true XLSX');
}

// Admin/driver PDF: replace the old hand-positioned renderer completely.
const pdfPath = path.join(target, 'src', 'lib', 'pdf.ts');
if (fs.existsSync(pdfPath)) {
  let pdf = fs.readFileSync(pdfPath, 'utf8');
  if (!pdf.includes('REPORT_LOGO_JPEG')) {
    pdf = `import { REPORT_LOGO_JPEG } from "@/lib/report-logo";\n${pdf}`;
  }
  const exportStart = pdf.indexOf('export function downloadDriverReportPdf({');
  if (exportStart < 0) throw new Error('PDF export function not found');
  pdf = pdf.slice(0, exportStart) + readOverride('pdf-export.snippet.ts').trimEnd() + '\n';
  fs.writeFileSync(pdfPath, pdf);
  console.log('[render] PDF engine replaced with AutoTable: no overlap, compact header, logo every page');
}

// Same Gerência login form; drivers redirect to isolated dashboard.
const managementRoutePath = path.join(target, 'src', 'routes', 'dono', 'route.tsx');
if (fs.existsSync(managementRoutePath)) {
  let route = fs.readFileSync(managementRoutePath, 'utf8');
  if (!route.includes('window.location.assign("/klebersom")')) {
    const successNeedle = 'toast.success("Acesso liberado para a Gerência.");';
    if (route.includes(successNeedle)) {
      route = route.replace(successNeedle, [
        'if (result.role === "driver") {',
        '                    window.location.assign("/klebersom");',
        '                    return;',
        '                  }',
        '                  toast.success("Acesso liberado para a Gerência.");',
      ].join('\n'));
    } else {
      const genericSuccess = /toast\.success\([^;]+\);/;
      if (!genericSuccess.test(route)) throw new Error('Management success notification hook not found');
      route = route.replace(genericSuccess, (match) => [
        'if (result.role === "driver") {',
        '                    window.location.assign("/klebersom");',
        '                    return;',
        '                  }',
        `                  ${match}`,
      ].join('\n'));
    }
  }
  fs.writeFileSync(managementRoutePath, route);
}

// Security/session overrides.
const overrides = [
  ['render-overrides/management-auth.server.ts', 'src/lib/management-auth.server.ts'],
  ['render-overrides/management-auth.ts', 'src/lib/management-auth.ts'],
  ['render-overrides/klebersom-access.server.ts', 'src/lib/klebersom-access.server.ts'],
  ['render-overrides/klebersom-access.ts', 'src/lib/klebersom-access.ts'],
  ['render-overrides/klebersom.tsx', 'src/routes/klebersom.tsx'],
  ['render-overrides/report-logo.ts', 'src/lib/report-logo.ts'],
];
for (const [sourceRel, targetRel] of overrides) {
  const source = path.join(cwd, sourceRel);
  if (!fs.existsSync(source)) throw new Error(`Missing Render override: ${sourceRel}`);
  const destination = path.join(target, targetRel);
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.copyFileSync(source, destination);
}

// Driver-only report page: same logo, XLSX and PDF visual system.
const driverRoutePath = path.join(target, 'src', 'routes', 'klebersom.tsx');
if (fs.existsSync(driverRoutePath)) {
  let driverRoute = fs.readFileSync(driverRoutePath, 'utf8');
  if (!driverRoute.includes('REPORT_LOGO_JPEG')) {
    driverRoute = `import { REPORT_LOGO_JPEG } from "@/lib/report-logo";\n${driverRoute}`;
  }
  const excelPattern = /function downloadColoredExcel\(data: any\) \{[\s\S]*?\n\}\nfunction generatePdf/;
  if (!excelPattern.test(driverRoute)) throw new Error('Driver Excel export function not found');
  driverRoute = driverRoute.replace(excelPattern, `${readOverride('driver-excel.snippet.ts').trimEnd()}\nfunction generatePdf`);

  const pdfPattern = /function generatePdf\(data: any\) \{[\s\S]*?\n\}\n\ntype Tab/;
  if (!pdfPattern.test(driverRoute)) throw new Error('Driver PDF export function not found');
  driverRoute = driverRoute.replace(pdfPattern, `${readOverride('driver-pdf.snippet.ts').trimEnd()}\n\ntype Tab`);
  fs.writeFileSync(driverRoutePath, driverRoute);
  console.log('[render] Driver reports: official logo + XLSX/PDF compact layout');
}

const finalManagementAuth = fs.readFileSync(path.join(target, 'src', 'lib', 'management-auth.server.ts'), 'utf8');
if (!finalManagementAuth.includes('username !== "admin"')) throw new Error('Admin-only management invariant missing');
if (!finalManagementAuth.includes('return "admin";')) throw new Error('admin/admin invariant missing');
const finalDriverAuth = fs.readFileSync(path.join(target, 'src', 'lib', 'klebersom-access.server.ts'), 'utf8');
if (finalDriverAuth.includes('managementSession')) throw new Error('Driver auth must never fall back to a management session');
console.log('[render] security invariant OK: admin/admin only for Gerência');

const configCandidates = ['vite.config.ts','vite.config.js','vite.config.mts','vite.config.mjs','nitro.config.ts','nitro.config.js','nitro.config.mts','nitro.config.mjs'];
for (const rel of configCandidates) {
  const file = path.join(target, rel);
  if (!fs.existsSync(file)) continue;
  const before = fs.readFileSync(file, 'utf8');
  const after = before
    .replace(/preset\s*:\s*(['"`])vercel\1/g, 'preset: "node-server"')
    .replace(/preset\s*:\s*(['"`])vercel-edge\1/g, 'preset: "node-server"');
  if (after !== before) fs.writeFileSync(file, after);
}

// Site-wide dark/white contrast with radiant blue accents.
const stylesPath = path.join(target, 'src', 'styles.css');
if (fs.existsSync(stylesPath)) {
  let styles = fs.readFileSync(stylesPath, 'utf8');
  styles = styles.replace(/background-attachment\s*:\s*fixed\s*;/gi, 'background-attachment: scroll;');
  styles += `\n\n/* transteste: radiant blue visual system */\n:root {\n  --bg: #07111f !important; --color-bg: #07111f !important;\n  --fg: #f8fbff !important; --color-fg: #f8fbff !important;\n  --surface: #0b1828 !important; --color-surface: #0b1828 !important;\n  --surface-2: #10243a !important; --color-surface-2: #10243a !important;\n  --muted: #a9bdd0 !important; --color-muted: #a9bdd0 !important;\n  --border: #008cff !important; --color-border: #008cff !important;\n  --accent: #008cff !important; --color-accent: #008cff !important;\n  --primary: #008cff !important; --color-primary: #008cff !important;\n  --ring: #008cff !important; --color-ring: #008cff !important;\n}\nhtml, body { background: #07111f !important; color: #f8fbff !important; }\nbody { background-image: none !important; background-attachment: scroll !important; }\nbody::before, body::after { background-image: none !important; background-attachment: scroll !important; }\n.text-accent, [class*=\"text-accent\"] { color: #008cff !important; }\n.border-accent, [class*=\"border-accent\"], .border-border { border-color: #008cff !important; }\n.bg-accent { background: #008cff !important; color: #07111f !important; }\n.text-white:not([class*=\"bg-\"]), [class*=\"text-white\"]:not([class*=\"bg-\"]) { background-color: #07111f; }\n.text-black:not([class*=\"bg-\"]), [class*=\"text-black\"]:not([class*=\"bg-\"]) { background-color: #ffffff; }\nbutton:focus-visible, a:focus-visible, input:focus-visible, select:focus-visible { outline-color: #008cff !important; box-shadow: 0 0 0 2px rgba(0,140,255,.35) !important; }\n::selection { background: #008cff; color: #07111f; }\n@media (max-width: 900px) { body, body::before, body::after { background-attachment: scroll !important; } [class*=\"backdrop-blur\"] { -webkit-backdrop-filter: none !important; backdrop-filter: none !important; } }\n`;
  fs.writeFileSync(stylesPath, styles);
}

fs.rmSync(path.join(target, '.output'), { recursive: true, force: true });
execSync('npm run build', { cwd: target, stdio: 'inherit', env: { ...process.env, NITRO_PRESET: 'node-server' } });
console.log('[render] Render-native production bundle rebuilt');

const pkgPath = path.join(target, 'package.json');
if (!fs.existsSync(pkgPath)) throw new Error('Render build failed: package.json not found');
const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
pkg.scripts = pkg.scripts || {};
const nativeEntry = path.join(target, '.output', 'server', 'index.mjs');
pkg.scripts.start = fs.existsSync(nativeEntry)
  ? 'node .output/server/index.mjs'
  : 'vite preview --host 0.0.0.0 --port $PORT';
fs.writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`);
console.log('[render] transteste source reconstructed at .transteste_app');
