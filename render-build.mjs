import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

const cwd = process.cwd();
const target = path.join(cwd, '.transteste_app');

fs.rmSync(target, { recursive: true, force: true });
fs.mkdirSync(target, { recursive: true });

// Reuse the exact production bootstrap, but keep the reconstructed app in a
// stable folder that Render can start after the build finishes.
fs.mkdtempSync = () => target;

const originalCpSync = fs.cpSync.bind(fs);
fs.cpSync = (src, dest, options) => {
  if (String(src).includes(`${path.sep}.vercel${path.sep}output`) && !fs.existsSync(src)) {
    console.log('[render] skipping Vercel-only output copy');
    return;
  }
  return originalCpSync(src, dest, options);
};

// Keep production React/SSR semantics, but explicitly include devDependencies
// because Vite/Nitro build plugins live there.
process.env.NITRO_PRESET = 'node-server';
process.env.NODE_ENV = 'production';
process.env.NPM_CONFIG_PRODUCTION = 'false';
process.env.npm_config_production = 'false';
process.env.NPM_CONFIG_INCLUDE = 'dev';
process.env.npm_config_include = 'dev';

await import('./bootstrap.mjs');

// The reconstructed source was originally prepared for Vercel. Force every
// explicit Nitro preset in local config files to a native Node server for Render.
const configCandidates = [
  'vite.config.ts',
  'vite.config.js',
  'vite.config.mts',
  'vite.config.mjs',
  'nitro.config.ts',
  'nitro.config.js',
  'nitro.config.mts',
  'nitro.config.mjs',
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

// Fast mode for the Render test environment.
// Internal screens do not repaint/download a large global truck background.
const stylesPath = path.join(target, 'src', 'styles.css');
if (fs.existsSync(stylesPath)) {
  let styles = fs.readFileSync(stylesPath, 'utf8');
  styles = styles.replace(/background-attachment\s*:\s*fixed\s*;/gi, 'background-attachment: scroll;');
  styles += `\n\n/* transteste: maximum-speed visual mode */\nhtml { background: #07111f; }\nbody {\n  background-image: none !important;\n  background-attachment: scroll !important;\n  background-color: #07111f;\n}\nbody::before, body::after {\n  background-image: none !important;\n  background-attachment: scroll !important;\n}\n@media (max-width: 900px) {\n  body, body::before, body::after { background-attachment: scroll !important; }\n  [class*=\"backdrop-blur\"] {\n    -webkit-backdrop-filter: none !important;\n    backdrop-filter: none !important;\n  }\n}\n`;
  fs.writeFileSync(stylesPath, styles);
  console.log('[render] fast visual mode applied: no global heavy background');
}

// Rebuild after the Render-specific patches. Remove stale native output first.
fs.rmSync(path.join(target, '.output'), { recursive: true, force: true });
execSync('npm run build', {
  cwd: target,
  stdio: 'inherit',
  env: { ...process.env, NITRO_PRESET: 'node-server' },
});
console.log('[render] Render-native production bundle rebuilt');

const pkgPath = path.join(target, 'package.json');
if (!fs.existsSync(pkgPath)) {
  throw new Error('Render build failed: reconstructed app package.json not found');
}

const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
pkg.scripts = pkg.scripts || {};
const nativeEntry = path.join(target, '.output', 'server', 'index.mjs');
if (fs.existsSync(nativeEntry)) {
  pkg.scripts.start = 'node .output/server/index.mjs';
  console.log('[render] native Nitro Node server enabled');
} else {
  // Safe fallback so a preset incompatibility cannot take the test site offline.
  pkg.scripts.start = 'vite preview --host 0.0.0.0 --port $PORT';
  console.log('[render] native entry missing; falling back to Vite Preview');
}
fs.writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`);
console.log('[render] production SSR mode enabled');
console.log('[render] transteste source reconstructed at .transteste_app');
