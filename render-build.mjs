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

const sourceRoot = path.join(target, 'src');
function scanLegacyTicketCodes(dir) {
  if (!fs.existsSync(dir)) return;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      scanLegacyTicketCodes(full);
      continue;
    }
    if (!/\.(?:ts|tsx|js|jsx|mjs|cjs)$/.test(entry.name)) continue;
    const text = fs.readFileSync(full, 'utf8');
    if (!text.includes('LCT-') && !text.includes('VG-')) continue;
    const rel = path.relative(target, full);
    const lines = text.split(/\r?\n/);
    lines.forEach((line, index) => {
      if (line.includes('LCT-') || line.includes('VG-')) {
        const start = Math.max(0, index - 8);
        const end = Math.min(lines.length, index + 10);
        console.log(`[ticket-diagnostic-context] ${rel}:${index + 1}\n${lines.slice(start, end).map((value, offset) => `${start + offset + 1}: ${value}`).join('\n')}`);
      }
    });
  }
}
scanLegacyTicketCodes(sourceRoot);

const configCandidates = [
  'vite.config.ts','vite.config.js','vite.config.mts','vite.config.mjs',
  'nitro.config.ts','nitro.config.js','nitro.config.mts','nitro.config.mjs',
];
for (const rel of configCandidates) {
  const file = path.join(target, rel);
  if (!fs.existsSync(file)) continue;
  const before = fs.readFileSync(file, 'utf8');
  const after = before
    .replace(/preset\s*:\s*(['"`])vercel\1/g, 'preset: "node-server"')
    .replace(/preset\s*:\s*(['"`])vercel-edge\1/g, 'preset: "node-server"');
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
