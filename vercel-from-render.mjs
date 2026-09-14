import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

const root = process.cwd();
const source = path.join(root, '.render-version-for-vercel');
const pinnedRenderCommit = 'e558e947aee2a76629f1a47cc67be32b70ff1156';
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

// Painel Viagens (Vercel): diesel fica apenas nas áreas de combustível/relatórios.
// Na listagem de viagens, mostramos toneladas quando houver peso líquido informado.
const tripsPath = path.join(app, 'src', 'routes', 'dono', 'viagens.tsx');
if (!fs.existsSync(tripsPath)) throw new Error('Painel Viagens source not found');
{
  let trips = fs.readFileSync(tripsPath, 'utf8');

  // O CSV gerado dentro da aba Viagens também deixa de carregar a coluna diesel.
  trips = trips.replace(/\n\s*diesel\s*:\s*[A-Za-z_$][\w$]*\.dieselCost\s*,?/g, '');

  // Desktop: nome explícito da coluna.
  if (/(["'])Peso\1/.test(trips)) {
    trips = trips.replace(/(["'])Peso\1/, (_m, quote) => `${quote}Toneladas${quote}`);
  }

  // Tentativa no source; uma garantia adicional é aplicada no bundle final abaixo.
  const dieselCard = /<div>\s*<dt([^>]*)>Diesel<\/dt>\s*<dd([^>]*)>\{[^{}]*?\b([A-Za-z_$][\w$]*)\.dieselCost[^{}]*\}<\/dd>\s*<\/div>/m;
  if (dieselCard.test(trips)) {
    trips = trips.replace(dieselCard, (_match, dtAttrs, ddAttrs, item) => [
      '<div>',
      `  <dt${dtAttrs}>Toneladas</dt>`,
      '  <dd' + ddAttrs + '>{Number(' + item + '.netWeight) > 0 ? `${new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(' + item + '.netWeight))} t` : "—"}</dd>',
      '</div>',
    ].join('\n'));
  }

  if (!trips.includes('Toneladas')) throw new Error('Toneladas label missing from Painel Viagens');

  fs.writeFileSync(tripsPath, trips);
  console.log('[vercel] Painel Viagens source: diesel removido do CSV e toneladas adicionadas');
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

// Garantia no bundle final: o cartão mobile de Viagens não pode voltar a exibir diesel.
function patchBuiltTrips(dir) {
  if (!fs.existsSync(dir)) return;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      patchBuiltTrips(file);
      continue;
    }
    if (!/^viagens-.*\.(?:js|mjs)$/.test(entry.name)) continue;

    let text = fs.readFileSync(file, 'utf8');
    const before = text;

    text = text.replaceAll('children:`Diesel`', 'children:`Toneladas`');
    text = text.replace(
      /children:([A-Za-z_$][\w$]*)\(([A-Za-z_$][\w$]*)\.dieselCost\)/g,
      (_match, _moneyFn, item) =>
        'children:Number(' + item + '.netWeight)>0?`${new Intl.NumberFormat("pt-BR",{minimumFractionDigits:2,maximumFractionDigits:2}).format(Number(' + item + '.netWeight))} t`:`—`',
    );

    if (text.includes('children:`Diesel`') || text.includes('.dieselCost')) {
      throw new Error(`Diesel still visible in built Painel Viagens: ${entry.name}`);
    }
    if (!text.includes('Toneladas')) {
      throw new Error(`Toneladas missing in built Painel Viagens: ${entry.name}`);
    }
    if (text !== before) fs.writeFileSync(file, text);
  }
}
patchBuiltTrips(from);
console.log('[vercel] Painel Viagens bundle: diesel removido; toneladas garantidas no desktop e celular');

// Mobile/PWA hardening. Installed PWA opens in standalone mode, while
// vertical touch scrolling stays native in browsers and Android WebView.
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
html {
  width: 100%;
  min-height: 100%;
  min-height: 100dvh;
  height: auto !important;
  max-height: none !important;
  overflow-x: hidden !important;
  overflow-y: auto !important;
  overscroll-behavior-y: auto !important;
  touch-action: pan-y pinch-zoom !important;
  -webkit-overflow-scrolling: touch;
  background: #07111f;
}
body {
  width: 100%;
  min-height: 100%;
  min-height: 100dvh;
  height: auto !important;
  max-height: none !important;
  margin: 0;
  overflow-x: hidden !important;
  overflow-y: auto !important;
  overscroll-behavior-y: auto !important;
  touch-action: pan-y pinch-zoom !important;
  -webkit-overflow-scrolling: touch;
  -webkit-text-size-adjust: 100%;
  -webkit-tap-highlight-color: transparent;
}
body > main {
  height: auto !important;
  max-height: none !important;
  overflow: visible !important;
  touch-action: pan-y pinch-zoom !important;
}
img, svg, video, canvas { max-width: 100%; }
.overflow-x-auto { -webkit-overflow-scrolling: touch; scrollbar-width: thin; }
.overflow-y-auto { -webkit-overflow-scrolling: touch; touch-action: pan-y pinch-zoom !important; }
@media (max-width: 767px) {
  html, body { max-width: 100vw; }
  input, select, textarea, button { font-size: 16px !important; }
  button, a, input, select, textarea { min-height: 44px; }
  main, section, header, nav, aside { max-width: 100vw; }
  main { height: auto !important; max-height: none !important; overflow-y: visible !important; }
  table { font-size: 11px; }
  .min-h-dvh { min-height: 100dvh !important; height: auto !important; }
  .fixed.inset-x-0.bottom-0 { padding-bottom: env(safe-area-inset-bottom); }
}
@media (display-mode: standalone), (display-mode: fullscreen) {
  html, body { background: #07111f !important; overflow-y: auto !important; touch-action: pan-y pinch-zoom !important; }
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
console.log('[vercel] mobile layout + standalone PWA + vertical scroll configured');

fs.rmSync(to, { recursive: true, force: true });
fs.mkdirSync(path.dirname(to), { recursive: true });
fs.cpSync(from, to, { recursive: true });

console.log('[vercel] READY: exact Render application packaged for Vercel');
