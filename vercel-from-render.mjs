import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

const root = process.cwd();
const source = path.join(root, '.render-version-for-vercel');
const pinnedRenderCommit = '572bf6b97a3671dd62c22524679574e31da7970f';
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

// Mobile/PWA hardening. The installed PWA opens in standalone mode (no browser address bar),
// while a normal browser tab keeps the browser UI as required by Android/iOS security rules.
const staticDir = path.join(from, 'static');
const manifestPath = path.join(staticDir, '__grok', 'manifest.webmanifest');
fs.mkdirSync(path.dirname(manifestPath), { recursive: true });
fs.writeFileSync(manifestPath, `${JSON.stringify({
  name: 'Trans Salomão',
  short_name: 'Trans Salomão',
  description: 'Gestão de viagens, abastecimentos, despesas e relatórios da Trans Salomão.',
  lang: 'pt-BR',
  id: '/',
  start_url: '/',
  scope: '/',
  display: 'standalone',
  display_override: ['standalone', 'fullscreen'],
  orientation: 'portrait-primary',
  background_color: '#07111f',
  theme_color: '#07111f',
  icons: [
    { src: '/favicon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any maskable' },
    { src: '/__grok/icon-180.png', sizes: '180x180', type: 'image/png', purpose: 'any' },
  ],
}, null, 2)}\n`);

const mobileCss = `
/* Trans Salomão mobile/PWA */
html { width: 100%; min-height: 100%; min-height: 100dvh; overflow-x: hidden; background: #07111f; }
body { width: 100%; min-height: 100%; min-height: 100dvh; margin: 0; overflow-x: hidden; overscroll-behavior-y: none; -webkit-text-size-adjust: 100%; -webkit-tap-highlight-color: transparent; touch-action: manipulation; }
img, svg, video, canvas { max-width: 100%; }
.overflow-x-auto { -webkit-overflow-scrolling: touch; scrollbar-width: thin; }
@media (max-width: 767px) {
  html, body { max-width: 100vw; }
  input, select, textarea, button { font-size: 16px !important; }
  button, a, input, select, textarea { min-height: 44px; }
  main, section, header, nav, aside { max-width: 100vw; }
  table { font-size: 11px; }
  .min-h-dvh { min-height: 100dvh !important; }
  .fixed.inset-x-0.bottom-0 { padding-bottom: env(safe-area-inset-bottom); }
}
@media (display-mode: standalone), (display-mode: fullscreen) {
  html, body { background: #07111f !important; }
  body { padding-top: env(safe-area-inset-top); padding-left: env(safe-area-inset-left); padding-right: env(safe-area-inset-right); padding-bottom: env(safe-area-inset-bottom); }
}
`;

const assetsDir = path.join(staticDir, 'assets');
if (fs.existsSync(assetsDir)) {
  for (const name of fs.readdirSync(assetsDir)) {
    if (/^styles-.*\.css$/.test(name)) {
      fs.appendFileSync(path.join(assetsDir, name), mobileCss);
    }
  }
}

function patchOutputTree(dir) {
  if (!fs.existsSync(dir)) return;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      patchOutputTree(file);
      continue;
    }
    if (!/\.(?:mjs|js|html)$/.test(entry.name)) continue;
    const before = fs.readFileSync(file, 'utf8');
    const after = before.replaceAll(
      'width=device-width, initial-scale=1',
      'width=device-width, initial-scale=1, viewport-fit=cover, interactive-widget=resizes-content',
    );
    if (after !== before) fs.writeFileSync(file, after);
  }
}
patchOutputTree(from);
console.log('[vercel] mobile layout + standalone PWA configured');

fs.rmSync(to, { recursive: true, force: true });
fs.mkdirSync(path.dirname(to), { recursive: true });
fs.cpSync(from, to, { recursive: true });

console.log('[vercel] READY: exact Render application packaged for Vercel');
