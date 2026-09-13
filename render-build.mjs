import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

const cwd = process.cwd();
const target = path.join(cwd, '.transteste_app');

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

// Keep ticket numbering strictly numeric and shared between trips/reports.
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

// Site-wide rule: every displayed weight/tonnage uses exactly two decimal places.
// Calculations and stored values remain untouched; only presentation is formatted.
const formatPath = path.join(target, 'src', 'lib', 'format.ts');
if (fs.existsSync(formatPath)) {
  const before = fs.readFileSync(formatPath, 'utf8');
  const pattern = /minimumFractionDigits\s*:\s*1\s*,\s*\n\s*maximumFractionDigits\s*:\s*1\s*,/m;
  let after = before.replace(pattern, 'minimumFractionDigits: 2,\n  maximumFractionDigits: 2,');
  after = after.replace(/minimumFractionDigits\s*:\s*0\s*,\s*\n\s*maximumFractionDigits\s*:\s*20\s*,/m, 'minimumFractionDigits: 2,\n  maximumFractionDigits: 2,');
  if (after === before) throw new Error('Tonnage formatter precision block not found');
  fs.writeFileSync(formatPath, after);
  console.log('[render] site-wide weight formatter fixed at exactly 2 decimal places');
}

// Caixa has its own formatter, so enforce two decimals there too.
const caixaPath = path.join(target, 'src', 'routes', 'dono', 'lancamentos.tsx');
if (fs.existsSync(caixaPath)) {
  const before = fs.readFileSync(caixaPath, 'utf8');
  let replacements = 0;
  const after = before.replace(/\{num\(([^,)]+\.tons),\s*\d+\)\}\s*t/g, (_match, expression) => {
    replacements += 1;
    return `{new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(${expression})} t`;
  });
  if (replacements === 0) throw new Error('Caixa tonnage display pattern not found');
  fs.writeFileSync(caixaPath, after);
  console.log(`[render] Caixa weight formatter fixed at 2 decimals in ${replacements} display(s)`);
}

// Temporary targeted diagnostics for the report implementation. Only source-code lines
// around report/export/PDF keywords are logged; no credentials or database data are printed.
function logReportSource(rel) {
  const file = path.join(target, rel);
  if (!fs.existsSync(file)) return;
  const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/);
  const wanted = new Set();
  for (let i = 0; i < lines.length; i += 1) {
    if (/(csv|excel|xlsx|pdf|relat|download|export|generate|print|tons\(|netWeight|peso)/i.test(lines[i])) {
      for (let j = Math.max(0, i - 2); j <= Math.min(lines.length - 1, i + 3); j += 1) wanted.add(j);
    }
  }
  console.log(`[report-diagnostic] BEGIN ${rel}`);
  for (const index of [...wanted].sort((a, b) => a - b).slice(0, 240)) {
    console.log(`[report-diagnostic] ${rel}:${index + 1}: ${lines[index]}`);
  }
  console.log(`[report-diagnostic] END ${rel}`);
}
logReportSource('src/routes/dono/totais.tsx');
logReportSource('src/lib/pdf.ts');
logReportSource('src/lib/format.ts');

// The same Gerência login form accepts admin and driver credentials. Insert the
// driver redirect at the stable success-notification point; authorization itself is
// enforced server-side by the admin-only management override below.
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
  console.log('[render] Gerência login is role-aware: drivers redirect to isolated dashboard');
}

// Security overrides: only literal admin can own a management session. Every other
// configured account uses a separate signed driver session tied to one driver_id.
const overrides = [
  ['render-overrides/management-auth.server.ts', 'src/lib/management-auth.server.ts'],
  ['render-overrides/management-auth.ts', 'src/lib/management-auth.ts'],
  ['render-overrides/klebersom-access.server.ts', 'src/lib/klebersom-access.server.ts'],
  ['render-overrides/klebersom-access.ts', 'src/lib/klebersom-access.ts'],
  ['render-overrides/klebersom.tsx', 'src/routes/klebersom.tsx'],
];
for (const [sourceRel, targetRel] of overrides) {
  const source = path.join(cwd, sourceRel);
  if (!fs.existsSync(source)) throw new Error(`Missing Render override: ${sourceRel}`);
  const destination = path.join(target, targetRel);
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.copyFileSync(source, destination);
  console.log(`[render] installed ${targetRel}`);
}

const finalManagementAuth = fs.readFileSync(path.join(target, 'src', 'lib', 'management-auth.server.ts'), 'utf8');
if (!finalManagementAuth.includes('username !== "admin"')) {
  throw new Error('Admin-only management invariant missing');
}
if (!finalManagementAuth.includes('return "admin";')) {
  throw new Error('admin/admin invariant missing');
}
const finalDriverAuth = fs.readFileSync(path.join(target, 'src', 'lib', 'klebersom-access.server.ts'), 'utf8');
if (finalDriverAuth.includes('managementSession')) {
  throw new Error('Driver auth must never fall back to a management session');
}
console.log('[render] security invariant OK: admin/admin only for Gerência, driver_id isolated sessions');

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

const stylesPath = path.join(target, 'src', 'styles.css');
if (fs.existsSync(stylesPath)) {
  let styles = fs.readFileSync(stylesPath, 'utf8');
  styles = styles.replace(/background-attachment\s*:\s*fixed\s*;/gi, 'background-attachment: scroll;');
  styles += `\n\n/* transteste: maximum-speed visual mode */\nhtml { background: #07111f; }\nbody { background-image: none !important; background-attachment: scroll !important; background-color: #07111f; }\nbody::before, body::after { background-image: none !important; background-attachment: scroll !important; }\n@media (max-width: 900px) { body, body::before, body::after { background-attachment: scroll !important; } [class*=\"backdrop-blur\"] { -webkit-backdrop-filter: none !important; backdrop-filter: none !important; } }\n`;
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
console.log('[render] production SSR mode enabled');
console.log('[render] transteste source reconstructed at .transteste_app');
