import fs from 'node:fs';
import path from 'node:path';

const cwd = process.cwd();
const target = path.join(cwd, '.trasteste_app');

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
console.log('[render] trasteste source reconstructed at .trasteste_app');
