import fs from 'node:fs';
import path from 'node:path';

const target = path.resolve(process.argv[2] || '');
if (!target || !fs.existsSync(target)) throw new Error('Expected reconstructed application directory');

const cssPath = path.join(target, 'src', 'styles.css');
if (!fs.existsSync(cssPath)) throw new Error('styles.css not found');

const marker = '--transsalomao-release-css: 20260927-2152;';
const lightMarker = '/* transsalomao-force-light-20260927 */';
let css = fs.readFileSync(cssPath, 'utf8');

if (!css.includes(lightMarker)) {
  css += `
/* transsalomao-force-light-20260927 */
:root {
  --transsalomao-release-css: 20260927-2152;
  color-scheme: only light !important;
  supported-color-schemes: light !important;
}
html, body, .owner-app, .owner-main, .owner-content {
  background: #ffffff !important;
  color: #000000 !important;
  color-scheme: only light !important;
}
.owner-app {
  --color-bg: #ffffff !important;
  --color-surface: #ffffff !important;
  --color-surface-2: #f6f7f9 !important;
  --color-fg: #000000 !important;
  --color-muted: #1f2937 !important;
  --color-subtle: #374151 !important;
}
.owner-content,
.owner-content h1,
.owner-content h2,
.owner-content h3,
.owner-content p,
.owner-content label,
.owner-content dt,
.owner-content dd,
.owner-content th,
.owner-content td,
.owner-content input,
.owner-content select,
.owner-content textarea {
  color: #000000 !important;
}
.owner-content input,
.owner-content select,
.owner-content textarea,
.owner-content table,
.dashboard-panel,
.kpi-strip,
.kpi-cell,
.cash-summary,
.operation-details,
.share-panel,
.period-tabs {
  background: #ffffff !important;
}
.owner-mobile-header,
.owner-mobile-nav,
.owner-sidebar,
.owner-more-sheet {
  background: #ffffff !important;
  color: #000000 !important;
}
.owner-mobile-nav .mobile-nav-item,
.owner-nav-link,
.dashboard-subtitle,
.kpi-label,
.panel-heading > p,
.panel-heading > a,
.mobile-financials dt {
  color: #111827 !important;
}
.owner-nav-link.is-active,
.mobile-nav-item.is-active,
.period-tab.is-active,
.cash-link,
.text-accent {
  color: #1769f4 !important;
}
.text-danger {
  color: #c23737 !important;
}
.kpi-cell.is-emphasis {
  background: #edf4ff !important;
}
input::placeholder,
textarea::placeholder {
  color: #6b7280 !important;
  opacity: 1 !important;
}
`;
}

if (!css.includes(marker)) {
  css += '\n:root { ' + marker + ' }\n';
}
fs.writeFileSync(cssPath, css);

const rootPath = path.join(target, 'src', 'routes', '__root.tsx');
if (fs.existsSync(rootPath)) {
  let root = fs.readFileSync(rootPath, 'utf8');
  root = root.replace('{ name: "theme-color", content: "#f7f9fc" },', '{ name: "theme-color", content: "#ffffff" },\n      { name: "color-scheme", content: "light only" },');
  fs.writeFileSync(rootPath, root);
}

console.log('[css-cache-bust] forced light theme, black text and fresh hashed CSS asset');
