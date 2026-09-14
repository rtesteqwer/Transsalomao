import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

const root = process.cwd();
const source = path.join(root, '.render-version-for-vercel');
const pinnedRenderCommit = '5e668f68b64b6ac925af0e36594cc65f4091f294';
const repoUrl = 'https://github.com/rtesteqwer/Transsalomao.git';

fs.rmSync(source, { recursive: true, force: true });
fs.mkdirSync(source, { recursive: true });

console.log(`[vercel] preparing exact Render version ${pinnedRenderCommit}`);
execSync('git init', { cwd: source, stdio: 'inherit' });
execSync(`git remote add origin ${repoUrl}`, { cwd: source, stdio: 'inherit' });
execSync(`git fetch --depth 1 origin ${pinnedRenderCommit}`, { cwd: source, stdio: 'inherit' });
execSync('git checkout --detach FETCH_HEAD', { cwd: source, stdio: 'inherit' });

execSync('node render-build.mjs', {
  cwd: source,
  stdio: 'inherit',
  env: {
    ...process.env,
    RENDER_SERVICE_ID: '',
    RENDER_EXTERNAL_HOSTNAME: '',
  },
});

const app = path.join(source, '.transteste_app');
if (!fs.existsSync(path.join(app, 'package.json'))) {
  throw new Error('Render source reconstruction did not produce the application');
}

const configCandidates = [
  'vite.config.ts','vite.config.js','vite.config.mts','vite.config.mjs',
  'nitro.config.ts','nitro.config.js','nitro.config.mts','nitro.config.mjs',
];
for (const rel of configCandidates) {
  const file = path.join(app, rel);
  if (!fs.existsSync(file)) continue;
  const before = fs.readFileSync(file, 'utf8');
  const after = before.replace(/preset\s*:\s*(['"`])node-server\1/g, 'preset: "vercel"');
  if (after !== before) fs.writeFileSync(file, after);
}

fs.rmSync(path.join(app, '.output'), { recursive: true, force: true });
fs.rmSync(path.join(app, '.vercel'), { recursive: true, force: true });

console.log('[vercel] rebuilding identical Render application for Vercel preset');
execSync('npm run build', {
  cwd: app,
  stdio: 'inherit',
  env: {
    ...process.env,
    NODE_ENV: 'production',
    NITRO_PRESET: 'vercel',
  },
});

const from = path.join(app, '.vercel', 'output');
const to = path.join(root, '.vercel', 'output');
if (!fs.existsSync(from)) {
  throw new Error('Vercel build output was not generated from the Render version');
}
fs.rmSync(to, { recursive: true, force: true });
fs.mkdirSync(path.dirname(to), { recursive: true });
fs.cpSync(from, to, { recursive: true });

console.log('[vercel] READY: exact Render application packaged for Vercel');
