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
  if (after === before && before.includes('LCT-')) throw new Error('Legacy LCT ticket generator still present and could not be patched safely');
  if (after !== before) {
    fs.writeFileSync(apiPath, after);
    console.log('[render] legacy LCT ticket generator replaced by shared numeric sequence');
  }
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

// Preserve exact tonnage throughout the app instead of forcing one decimal.
const formatPath = path.join(target, 'src', 'lib', 'format.ts');
if (fs.existsSync(formatPath)) {
  const before = fs.readFileSync(formatPath, 'utf8');
  const tonPrecisionPattern = /minimumFractionDigits\s*:\s*1\s*,\s*\n\s*maximumFractionDigits\s*:\s*1\s*,/m;
  const after = before.replace(
    tonPrecisionPattern,
    'minimumFractionDigits: 0,\n  maximumFractionDigits: 20,',
  );
  if (after === before) throw new Error('Tonnage formatter precision block not found; refusing to deploy a rounding regression');
  fs.writeFileSync(formatPath, after);
  console.log('[render] tonnage formatter now preserves exact decimal precision');
}

// Caixa has its own number formatter. Replace every tonnage rendering there with
// exact locale formatting so 38.47 is never rendered as 38.5/38.50 by a fixed-digit helper.
const caixaPath = path.join(target, 'src', 'routes', 'dono', 'lancamentos.tsx');
if (fs.existsSync(caixaPath)) {
  const before = fs.readFileSync(caixaPath, 'utf8');
  let replacements = 0;
  const after = before.replace(/\{num\(([^,)]+\.tons),\s*\d+\)\}\s*t/g, (_match, expression) => {
    replacements += 1;
    return `{new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 20 }).format(${expression})} t`;
  });
  if (replacements === 0) throw new Error('Caixa tonnage display pattern not found; refusing to keep rounded values');
  fs.writeFileSync(caixaPath, after);
  console.log(`[render] Caixa exact tonnage enabled in ${replacements} display(s)`);
}

// Install the isolated, read-only Klebersom dashboard. Credentials and driver id
// stay in protected Render environment variables, never in the public repository source.
const overrides = [
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

const configCandidates = ['vite.config.ts','vite.config.js','vite.config.mts','vite.config.mjs','nitro.config.ts','nitro.config.js','nitro.config.mts','nitro.config.mjs'];
for (const rel of configCandidates) {
  const file = path.join(target, rel);
  if (!fs.existsSync(file)) continue;
  const before = fs.readFileSync(file, 'utf8');
  const after = before.replace(/preset\s*:\s*(['"`])vercel\1/g, 'preset: "node-server"').replace(/preset\s*:\s*(['"`])vercel-edge\1/g, 'preset: "node-server"');
  if (after !== before) {
    fs.writeFileSync(file, after);
    console.log(`[render] patched ${rel}: Nitro preset -> node-server`);
  }
}

const stylesPath = path.join(target, 'src', 'styles.css');
if (fs.existsSync(stylesPath)) {
  let styles = fs.readFileSync(stylesPath, 'utf8');
  styles = styles.replace(/background-attachment\s*:\s*fixed\s*;/gi, 'background-attachment: scroll;');
  styles += `\n\n/* transteste: maximum-speed visual mode */\nhtml { background: #07111f; }\nbody { background-image: none !important; background-attachment: scroll !important; background-color: #07111f; }\nbody::before, body::after { background-image: none !important; background-attachment: scroll !important; }\n@media (max-width: 900px) { body, body::before, body::after { background-attachment: scroll !important; } [class*=\"backdrop-blur\"] { -webkit-backdrop-filter: none !important; backdrop-filter: none !important; } }\n`;
  fs.writeFileSync(stylesPath, styles);
  console.log('[render] fast visual mode applied: no global heavy background');
}

fs.rmSync(path.join(target, '.output'), { recursive: true, force: true });
execSync('npm run build', { cwd: target, stdio: 'inherit', env: { ...process.env, NITRO_PRESET: 'node-server' } });
console.log('[render] Render-native production bundle rebuilt');

const pkgPath = path.join(target, 'package.json');
if (!fs.existsSync(pkgPath)) throw new Error('Render build failed: reconstructed app package.json not found');
const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
pkg.scripts = pkg.scripts || {};
const nativeEntry = path.join(target, '.output', 'server', 'index.mjs');
if (fs.existsSync(nativeEntry)) {
  pkg.scripts.start = 'node .output/server/index.mjs';
  console.log('[render] native Nitro Node server enabled');
} else {
  pkg.scripts.start = 'vite preview --host 0.0.0.0 --port $PORT';
  console.log('[render] native entry missing; falling back to Vite Preview');
}
fs.writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`);
console.log('[render] production SSR mode enabled');
console.log('[render] transteste source reconstructed at .transteste_app');
