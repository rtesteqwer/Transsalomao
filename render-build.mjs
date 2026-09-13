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

// Keep ticket numbering strictly numeric and shared between trips/reports.
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
  if (after === before && before.includes('LCT-')) throw new Error('Legacy LCT ticket generator still present');
  if (after !== before) fs.writeFileSync(apiPath, after);
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

// Site-wide display rule: every weight/tonnage uses exactly two decimal places.
// The original numeric value remains untouched for storage and freight calculations.
const formatPath = path.join(target, 'src', 'lib', 'format.ts');
if (fs.existsSync(formatPath)) {
  const before = fs.readFileSync(formatPath, 'utf8');
  let after = before
    .replace(/minimumFractionDigits\s*:\s*1\s*,\s*\n\s*maximumFractionDigits\s*:\s*1\s*,/m, 'minimumFractionDigits: 2,\n  maximumFractionDigits: 2,')
    .replace(/minimumFractionDigits\s*:\s*0\s*,\s*\n\s*maximumFractionDigits\s*:\s*20\s*,/m, 'minimumFractionDigits: 2,\n  maximumFractionDigits: 2,');
  if (after === before && !/minimumFractionDigits\s*:\s*2[\s\S]{0,80}maximumFractionDigits\s*:\s*2/.test(before)) {
    throw new Error('Tonnage formatter precision block not found');
  }
  fs.writeFileSync(formatPath, after);
  console.log('[render] site-wide weight formatter fixed at exactly 2 decimal places');
}

// Caixa has its own tonnage formatter, so enforce exactly two decimals there too.
const caixaPath = path.join(target, 'src', 'routes', 'dono', 'lancamentos.tsx');
if (fs.existsSync(caixaPath)) {
  const before = fs.readFileSync(caixaPath, 'utf8');
  let replacements = 0;
  const after = before.replace(/\{num\(([^,)]+\.tons),\s*\d+\)\}\s*t/g, (_match, expression) => {
    replacements += 1;
    return `{new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(${expression})} t`;
  });
  if (replacements === 0 && !before.includes('minimumFractionDigits: 2, maximumFractionDigits: 2')) {
    throw new Error('Caixa tonnage display pattern not found');
  }
  fs.writeFileSync(caixaPath, after);
  console.log(`[render] Caixa weight formatter fixed at 2 decimals in ${replacements} display(s)`);
}

// Admin Relatórios: remove CSV from the UI and export a colored Excel-compatible
// spreadsheet with exactly one row per freight. PDF remains available separately.
const totalsPath = path.join(target, 'src', 'routes', 'dono', 'totais.tsx');
if (fs.existsSync(totalsPath)) {
  let totals = fs.readFileSync(totalsPath, 'utf8');
  const exportStart = totals.indexOf('  function exportCurrent() {');
  const returnStart = exportStart >= 0 ? totals.indexOf('\n\n  return (', exportStart) : -1;
  if (exportStart < 0 || returnStart < 0) throw new Error('Relatórios CSV export block not found');

  const excelFn = [
    '  function exportExcelColorido() {',
    '    const esc = (value: unknown) => String(value ?? "")',
    '      .replace(/&/g, "&amp;")',
    '      .replace(/</g, "&lt;")',
    '      .replace(/>/g, "&gt;")',
    '      .replace(/\\"/g, "&quot;");',
    '    const modeLabel = (mode: unknown) => {',
    '      const value = String(mode ?? "");',
    '      if (value === "ton") return "Por tonelada";',
    '      if (value === "trip") return "Por viagem";',
    '      if (value === "cegonha") return "Cegonha";',
    '      if (value === "caixinha") return "Caixinha";',
    '      return value || "—";',
    '    };',
    '    const body = computed.map((trip: any, index: number) => {',
    '      const bg = index % 2 === 0 ? "#EEF5FF" : "#FFFFFF";',
    '      const ticket = trip.code ?? trip.ticket ?? trip.id ?? "—";',
    '      const tripDate = trip.date ? formatDate(trip.date) : "—";',
    '      const commission = Number(trip.commissionValue ?? trip.commission ?? 0);',
    '      return "<tr style=\\"background:" + bg + ";height:22px\\">" +',
    '        "<td>" + esc(ticket) + "</td>" +',
    '        "<td>" + esc(tripDate) + "</td>" +',
    '        "<td>" + esc(trip.driverName ?? "—") + "</td>" +',
    '        "<td>" + esc(trip.fleetName ?? "—") + "</td>" +',
    '        "<td>" + esc(modeLabel(trip.freightMode)) + "</td>" +',
    '        "<td style=\\"background:#FFF4CC;font-weight:700\\">" + esc(tons(Number(trip.netWeight ?? 0))) + "</td>" +',
    '        "<td>" + esc(integer(Number(trip.kmDriven ?? 0)) + " km") + "</td>" +',
    '        "<td style=\\"background:#E8F7EC;font-weight:700\\">" + esc(brl(Number(trip.freight ?? 0))) + "</td>" +',
    '        "<td style=\\"background:#FFF0DF\\">" + esc(brl(commission)) + "</td>" +',
    '        "<td style=\\"background:#FDECEC\\">" + esc(brl(Number(trip.dieselCost ?? 0))) + "</td>" +',
    '        "<td style=\\"background:#E5F3FF;font-weight:700\\">" + esc(brl(Number(trip.grossResult ?? 0))) + "</td></tr>";',
    '    }).join("");',
    '    const html = "<!doctype html><html><head><meta charset=\\"utf-8\\"><style>" +',
    '      "body{font-family:Arial,sans-serif;color:#132033}h1{font-size:20px;margin:0 0 4px}p{margin:0 0 12px;color:#546173}" +',
    '      "table{border-collapse:collapse;width:100%;font-size:11px}th{background:#102A43;color:#fff;font-weight:700;padding:7px;border:1px solid #7C8DA0;text-align:left}" +',
    '      "td{padding:6px;border:1px solid #B8C4D0;white-space:nowrap}</style></head><body>" +',
    '      "<h1>Trans Salomão — Relatório de Fretes</h1><p>Uma linha por frete · pesos com 2 casas decimais</p>" +',
    '      "<table><thead><tr><th>Ticket</th><th>Data</th><th>Motorista</th><th>Conjunto</th><th>Modalidade</th><th>Peso líquido</th><th>KM</th><th>Faturamento</th><th>Comissão</th><th>Diesel</th><th>Resultado</th></tr></thead><tbody>" + body + "</tbody></table></body></html>";',
    '    const blob = new Blob(["\\ufeff", html], { type: "application/vnd.ms-excel;charset=utf-8" });',
    '    const url = URL.createObjectURL(blob);',
    '    const a = document.createElement("a");',
    '    a.href = url;',
    '    a.download = "relatorio-fretes-trans-salomao-colorido.xls";',
    '    document.body.appendChild(a);',
    '    a.click();',
    '    a.remove();',
    '    URL.revokeObjectURL(url);',
    '  }',
  ].join('\n');

  totals = totals.slice(0, exportStart) + excelFn + totals.slice(returnStart);
  const csvButton = /<button type="button" onClick=\{exportCurrent\} className="h-11 rounded-md border border-border px-4 text-sm text-fg hover:bg-surface-2">\s*Exportar CSV\s*<\/button>/m;
  if (!csvButton.test(totals)) throw new Error('Relatórios CSV button not found');
  totals = totals.replace(csvButton, '<button type="button" onClick={exportExcelColorido} className="h-11 rounded-md border border-border px-4 text-sm font-semibold text-fg hover:bg-surface-2">\n            Excel colorido\n          </button>');
  totals = totals.replace('Gere PDFs no padrão visual da Trans Salomão e consulte totais por motorista, conjunto e combustível.', 'Gere PDF ou Excel colorido. Cada frete ocupa uma única linha e todo peso é exibido com 2 casas decimais.');
  fs.writeFileSync(totalsPath, totals);
  console.log('[render] admin Relatórios: CSV removed; colored Excel + PDF only, one freight per Excel row');
}

// PDF: replace the former multi-line trip card by one compact line per freight.
// The report summary is preserved; only the freight history rows are compacted.
const pdfPath = path.join(target, 'src', 'lib', 'pdf.ts');
if (fs.existsSync(pdfPath)) {
  let pdf = fs.readFileSync(pdfPath, 'utf8');
  const tripCardPattern = /function drawTripCard\(page: PdfPage, trip: ComputedTrip, top: number\) \{[\s\S]*?\n\}\n\nfunction drawFuelingSectionTitle/;
  if (!tripCardPattern.test(pdf)) throw new Error('PDF trip card block not found');
  const compactTripCard = [
    'function drawTripCard(page: PdfPage, trip: ComputedTrip, top: number) {',
    '  const height = 22;',
    '  const y = PAGE_H - top - height;',
    '  page.rect(MARGIN, y, CONTENT_W, height, colors.surface, colors.border, 0.55);',
    '  const row = truncate(',
    '    `${formatDate(trip.date)} | ${trip.code} | ${trip.driverName} | ${trip.fleetName} | ${freightModeLabel(trip.freightMode)} | Peso ${tons(trip.netWeight)} | KM ${integer(trip.kmDriven)} | Frete ${brl(trip.freight)} | Diesel ${brl(trip.dieselCost)} | Resultado ${brl(trip.grossResult)}`,',
    '    150,',
    '  );',
    '  page.text(row, MARGIN + 7, topToY(top + 14), { size: 6.6, color: colors.fg });',
    '}',
    '',
    'function drawFuelingSectionTitle',
  ].join('\n');
  pdf = pdf.replace(tripCardPattern, compactTripCard);
  // Compact common legacy spacing/fit checks used by the trip-card loop.
  pdf = pdf
    .replace(/top \+ 74/g, 'top + 22')
    .replace(/top \+= 84;/g, 'top += 26;')
    .replace(/top \+= 82;/g, 'top += 26;')
    .replace(/top \+= 80;/g, 'top += 26;');
  fs.writeFileSync(pdfPath, pdf);
  console.log('[render] PDF freight history compacted to exactly one visual line per freight');
}

// The same Gerência login form accepts admin and driver credentials. Drivers are
// redirected before any administrative query can run.
const managementRoutePath = path.join(target, 'src', 'routes', 'dono', 'route.tsx');
if (fs.existsSync(managementRoutePath)) {
  let route = fs.readFileSync(managementRoutePath, 'utf8');
  if (!route.includes('window.location.assign("/klebersom")')) {
    const successNeedle = 'toast.success("Acesso liberado para a Gerência.");';
    if (route.includes(successNeedle)) {
      route = route.replace(successNeedle, [
        'if (result.role === "driver") {',
        '                    window.location.assign("/klebersom");',
        '                    return;',
        '                  }',
        '                  toast.success("Acesso liberado para a Gerência.");',
      ].join('\n'));
    } else {
      const genericSuccess = /toast\.success\([^;]+\);/;
      if (!genericSuccess.test(route)) throw new Error('Management success notification hook not found');
      route = route.replace(genericSuccess, (match) => [
        'if (result.role === "driver") {',
        '                    window.location.assign("/klebersom");',
        '                    return;',
        '                  }',
        `                  ${match}`,
      ].join('\n'));
    }
  }
  fs.writeFileSync(managementRoutePath, route);
  console.log('[render] Gerência login is role-aware: drivers redirect to isolated dashboard');
}

// Security overrides: only literal admin/admin can own a management session. Every
// driver account uses a separate signed driver session tied to exactly one driver_id.
const overrides = [
  ['render-overrides/management-auth.server.ts', 'src/lib/management-auth.server.ts'],
  ['render-overrides/management-auth.ts', 'src/lib/management-auth.ts'],
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

const finalManagementAuth = fs.readFileSync(path.join(target, 'src', 'lib', 'management-auth.server.ts'), 'utf8');
if (!finalManagementAuth.includes('username !== "admin"')) throw new Error('Admin-only management invariant missing');
if (!finalManagementAuth.includes('return "admin";')) throw new Error('admin/admin invariant missing');
const finalDriverAuth = fs.readFileSync(path.join(target, 'src', 'lib', 'klebersom-access.server.ts'), 'utf8');
if (finalDriverAuth.includes('managementSession')) throw new Error('Driver auth must never fall back to a management session');
console.log('[render] security invariant OK: admin/admin only for Gerência, driver_id isolated sessions');

const configCandidates = ['vite.config.ts','vite.config.js','vite.config.mts','vite.config.mjs','nitro.config.ts','nitro.config.js','nitro.config.mts','nitro.config.mjs'];
for (const rel of configCandidates) {
  const file = path.join(target, rel);
  if (!fs.existsSync(file)) continue;
  const before = fs.readFileSync(file, 'utf8');
  const after = before
    .replace(/preset\s*:\s*(['"`])vercel\1/g, 'preset: "node-server"')
    .replace(/preset\s*:\s*(['"`])vercel-edge\1/g, 'preset: "node-server"');
  if (after !== before) fs.writeFileSync(file, after);
}

const stylesPath = path.join(target, 'src', 'styles.css');
if (fs.existsSync(stylesPath)) {
  let styles = fs.readFileSync(stylesPath, 'utf8');
  styles = styles.replace(/background-attachment\s*:\s*fixed\s*;/gi, 'background-attachment: scroll;');
  styles += `\n\n/* transteste: maximum-speed visual mode */\nhtml { background: #07111f; }\nbody { background-image: none !important; background-attachment: scroll !important; background-color: #07111f; }\nbody::before, body::after { background-image: none !important; background-attachment: scroll !important; }\n@media (max-width: 900px) { body, body::before, body::after { background-attachment: scroll !important; } [class*=\"backdrop-blur\"] { -webkit-backdrop-filter: none !important; backdrop-filter: none !important; } }\n`;
  fs.writeFileSync(stylesPath, styles);
}

fs.rmSync(path.join(target, '.output'), { recursive: true, force: true });
execSync('npm run build', { cwd: target, stdio: 'inherit', env: { ...process.env, NITRO_PRESET: 'node-server' } });
console.log('[render] Render-native production bundle rebuilt');

const pkgPath = path.join(target, 'package.json');
if (!fs.existsSync(pkgPath)) throw new Error('Render build failed: package.json not found');
const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
pkg.scripts = pkg.scripts || {};
const nativeEntry = path.join(target, '.output', 'server', 'index.mjs');
pkg.scripts.start = fs.existsSync(nativeEntry)
  ? 'node .output/server/index.mjs'
  : 'vite preview --host 0.0.0.0 --port $PORT';
fs.writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`);
console.log('[render] production SSR mode enabled');
console.log('[render] transteste source reconstructed at .transteste_app');
