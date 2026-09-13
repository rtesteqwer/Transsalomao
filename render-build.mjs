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
  // bootstrap.mjs finishes by copying Vercel Build Output. On Render we need
  // the regular Nitro/Node output that remains inside .trasteste_app instead.
  if (String(src).includes(`${path.sep}.vercel${path.sep}output`) && !fs.existsSync(src)) {
    console.log('[render] skipping Vercel-only output copy');
    return;
  }
  return originalCpSync(src, dest, options);
};

process.env.NITRO_PRESET = process.env.NITRO_PRESET || 'node-server';
process.env.NODE_ENV = process.env.NODE_ENV || 'production';

await import('./bootstrap.mjs');

const pkgPath = path.join(target, 'package.json');
if (!fs.existsSync(pkgPath)) {
  throw new Error('Render build failed: reconstructed app package.json not found');
}

console.log('[render] trasteste source reconstructed at .trasteste_app');
