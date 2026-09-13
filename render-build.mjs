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
process.env.NITRO_PRESET = process.env.NITRO_PRESET || 'node-server';
process.env.NODE_ENV = 'production';
process.env.NPM_CONFIG_PRODUCTION = 'false';
process.env.npm_config_production = 'false';
process.env.NPM_CONFIG_INCLUDE = 'dev';
process.env.npm_config_include = 'dev';

await import('./bootstrap.mjs');

// Fast mode for the Render test environment.
// Internal screens must not repaint/download a large global truck background.
// The home page keeps its own route-specific visual; only the global body layer
// is neutralized. Fixed backgrounds and mobile backdrop blur are also removed.
const stylesPath = path.join(target, 'src', 'styles.css');
if (fs.existsSync(stylesPath)) {
  let styles = fs.readFileSync(stylesPath, 'utf8');
  styles = styles.replace(/background-attachment\s*:\s*fixed\s*;/gi, 'background-attachment: scroll;');
  styles += `\n\n/* transteste: maximum-speed visual mode */\nhtml { background: #07111f; }\nbody {\n  background-image: none !important;\n  background-attachment: scroll !important;\n  background-color: #07111f;\n}\nbody::before, body::after {\n  background-image: none !important;\n  background-attachment: scroll !important;\n}\n@media (max-width: 900px) {\n  body, body::before, body::after { background-attachment: scroll !important; }\n  [class*="backdrop-blur"] {\n    -webkit-backdrop-filter: none !important;\n    backdrop-filter: none !important;\n  }\n}\n`;
  fs.writeFileSync(stylesPath, styles);
  console.log('[render] fast visual mode applied: no global heavy background');

  // bootstrap already built once. Rebuild only after the speed patch so the
  // files served by Vite Preview include the optimized CSS.
  execSync('npm run build', {
    cwd: target,
    stdio: 'inherit',
    env: process.env,
  });
  console.log('[render] optimized client/server bundle rebuilt');
}

const pkgPath = path.join(target, 'package.json');
if (!fs.existsSync(pkgPath)) {
  throw new Error('Render build failed: reconstructed app package.json not found');
}

// The original package is designed for Vercel and has no start script.
// Use Vite preview to serve the prebuilt SSR bundle on Render.
const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
pkg.scripts = pkg.scripts || {};
pkg.scripts.start = 'vite preview --host 0.0.0.0 --port $PORT';
fs.writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`);
console.log('[render] start script configured for Render');
console.log('[render] production SSR mode enabled');
console.log('[render] transteste source reconstructed at .transteste_app');
