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

// Tickets strictly numeric.
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

// Every displayed weight uses exactly two decimals. Stored/calculated values stay exact.
const formatPath = path.join(target, 'src', 'lib', 'format.ts');
if (fs.existsSync(formatPath)) {
  const before = fs.readFileSync(formatPath, 'utf8');
  const after = before
    .replace(/minimumFractionDigits\s*:\s*1\s*,\s*\n\s*maximumFractionDigits\s*:\s*1\s*,/m, 'minimumFractionDigits: 2,\n  maximumFractionDigits: 2,')
    .replace(/minimumFractionDigits\s*:\s*0\s*,\s*\n\s*maximumFractionDigits\s*:\s*20\s*,/m, 'minimumFractionDigits: 2,\n  maximumFractionDigits: 2,');
  if (after === before && !/minimumFractionDigits\s*:\s*2[\s\S]{0,80}maximumFractionDigits\s*:\s*2/.test(before)) {
    throw new Error('Tonnage formatter precision block not found');
  }
  fs.writeFileSync(formatPath, after);
  console.log('[render] site-wide weights fixed at exactly 2 decimals');
}

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
}

// Real XLSX writer for mobile Excel compatibility.
execSync('npm install xlsx-js-style@1.2.0 --no-save --ignore-scripts --no-audit --no-fund', {
  cwd: target,
  stdio: 'inherit',
  env: process.env,
});

// Admin Relatórios: PDF + genuine XLSX only.
const totalsPath = path.join(target, 'src', 'routes', 'dono', 'totais.tsx');
if (fs.existsSync(totalsPath)) {
  let totals = fs.readFileSync(totalsPath, 'utf8');
  const exportStart = totals.indexOf('  function exportCurrent() {');
  const returnStart = exportStart >= 0 ? totals.indexOf('\n\n  return (', exportStart) : -1;
  if (exportStart < 0 || returnStart < 0) throw new Error('Relatórios export block not found');

  const excelFn = [
    '  async function exportExcelColorido() {',
    '    const XLSX = await import("xlsx-js-style");',
    '    const headers = ["Ticket", "Data", "Motorista", "Conjunto", "Modalidade", "Peso líquido", "KM", "Faturamento", "Comissão", "Diesel", "Resultado"];',
    '    const modeLabel = (mode: unknown) => {',
    '      const value = String(mode ?? "");',
    '      if (value === "ton") return "Por tonelada";',
    '      if (value === "trip") return "Por viagem";',
    '      if (value === "cegonha") return "Cegonha";',
    '      if (value === "caixinha") return "Caixinha";',
    '      return value || "—";',
    '    };',
    '    const rows = computed.map((trip: any) => [',
    '      trip.code ?? trip.ticket ?? trip.id ?? "—",',
    '      trip.date ? formatDate(trip.date) : "—",',
    '      trip.driverName ?? "—",',
    '      trip.fleetName ?? "—",',
    '      modeLabel(trip.freightMode),',
    '      tons(Number(trip.netWeight ?? 0)),',
    '      `${integer(Number(trip.kmDriven ?? 0))} km`,',
    '      brl(Number(trip.freight ?? 0)),',
    '      brl(Number(trip.commissionValue ?? trip.commission ?? 0)),',
    '      brl(Number(trip.dieselCost ?? 0)),',
    '      brl(Number(trip.grossResult ?? 0)),',
    '    ]);',
    '    const aoa = [["TRANS SALOMÃO — RELATÓRIO DE FRETES"], [], headers, ...rows];',
    '    const ws = XLSX.utils.aoa_to_sheet(aoa);',
    '    ws["!merges"] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: headers.length - 1 } }];',
    '    ws["!cols"] = [10, 12, 28, 22, 16, 15, 11, 16, 16, 15, 16].map((wch) => ({ wch }));',
    '    ws["!rows"] = [{ hpt: 27 }, { hpt: 8 }, { hpt: 22 }];',
    '    const dark = "07111F";',
    '    const white = "FFFFFF";',
    '    const black = "111111";',
    '    const blue = "008CFF";',
    '    const border = { style: "thin", color: { rgb: blue } };',
    '    for (let c = 0; c < headers.length; c += 1) {',
    '      const titleCell = XLSX.utils.encode_cell({ r: 0, c });',
    '      if (!ws[titleCell]) ws[titleCell] = { t: "s", v: "" };',
    '      ws[titleCell].s = { fill: { fgColor: { rgb: dark } }, font: { color: { rgb: white }, bold: true, sz: c === 0 ? 18 : 11 }, alignment: { horizontal: "left", vertical: "center" }, border: { bottom: { style: "medium", color: { rgb: blue } } } };',
    '      const headerCell = XLSX.utils.encode_cell({ r: 2, c });',
    '      ws[headerCell].s = { fill: { fgColor: { rgb: dark } }, font: { color: { rgb: white }, bold: true }, alignment: { horizontal: "center", vertical: "center" }, border: { top: border, bottom: border, left: border, right: border } };',
    '    }',
    '    for (let r = 3; r < rows.length + 3; r += 1) {',
    '      for (let c = 0; c < headers.length; c += 1) {',
    '        const address = XLSX.utils.encode_cell({ r, c });',
    '        if (!ws[address]) continue;',
    '        ws[address].s = { fill: { fgColor: { rgb: white } }, font: { color: { rgb: black } }, alignment: { vertical: "center" }, border: { top: border, bottom: border, left: border, right: border } };',
    '      }',
    '    }',
    '    ws["!autofilter"] = { ref: `A3:${XLSX.utils.encode_col(headers.length - 1)}${rows.length + 3}` };',
    '    const wb = XLSX.utils.book_new();',
    '    XLSX.utils.book_append_sheet(wb, ws, "Fretes");',
    '    (wb as any).Workbook = { Views: [{ RTL: false }] };',
    '    const out = XLSX.write(wb, { bookType: "xlsx", type: "array", cellStyles: true });',
    '    const blob = new Blob([out], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });',
    '    const url = URL.createObjectURL(blob);',
    '    const a = document.createElement("a");',
    '    a.href = url;',
    '    a.download = "relatorio-fretes-trans-salomao.xlsx";',
    '    document.body.appendChild(a);',
    '    a.click();',
    '    a.remove();',
    '    URL.revokeObjectURL(url);',
    '  }',
  ].join('\n');

  totals = totals.slice(0, exportStart) + excelFn + totals.slice(returnStart);
  const csvButton = /<button type="button" onClick=\{exportCurrent\} className="h-11 rounded-md border border-border px-4 text-sm text-fg hover:bg-surface-2">\s*Exportar CSV\s*<\/button>/m;
  const existingExcelButton = /<button type="button" onClick=\{exportExcelColorido\} className="h-11 rounded-md border border-border px-4 text-sm font-semibold text-fg hover:bg-surface-2">[\s\S]*?Excel colorido[\s\S]*?<\/button>/m;
  if (csvButton.test(totals)) {
    totals = totals.replace(csvButton, '<button type="button" onClick={exportExcelColorido} className="h-11 rounded-md border border-accent bg-bg px-4 text-sm font-semibold text-fg hover:bg-surface-2">\n            Excel colorido (.xlsx)\n          </button>');
  } else if (existingExcelButton.test(totals)) {
    totals = totals.replace(existingExcelButton, '<button type="button" onClick={exportExcelColorido} className="h-11 rounded-md border border-accent bg-bg px-4 text-sm font-semibold text-fg hover:bg-surface-2">\n            Excel colorido (.xlsx)\n          </button>');
  } else {
    throw new Error('Relatórios Excel button not found');
  }
  totals = totals.replace(/Gere PDF ou Excel colorido\.[^<]*/g, 'Gere PDF ou Excel colorido (.xlsx). Cada frete ocupa uma única linha e todo peso é exibido com 2 casas decimais.');
  fs.writeFileSync(totalsPath, totals);
  console.log('[render] Relatórios now export genuine mobile-compatible XLSX');
}

// PDF: remove "Por viagem" and "KM/L abastecimentos" summary metrics and use a
// real column grid for each freight so long names never overlap neighboring fields.
const pdfPath = path.join(target, 'src', 'lib', 'pdf.ts');
if (fs.existsSync(pdfPath)) {
  let pdf = fs.readFileSync(pdfPath, 'utf8');

  pdf = pdf
    .replace(/^\s*drawMetricCard\([^\n]*"Por viagem"[^\n]*\);\s*$/gm, '')
    .replace(/^\s*drawMetricCard\([^\n]*"KM\/L abastecimentos"[^\n]*\);\s*$/gm, '');

  const tripCardPattern = /function drawTripCard\(page: PdfPage, trip: ComputedTrip, top: number\) \{[\s\S]*?\n\}\n\nfunction drawFuelingSectionTitle/;
  if (!tripCardPattern.test(pdf)) throw new Error('PDF trip card block not found');
  const compactTripCard = [
    'function drawTripCard(page: PdfPage, trip: ComputedTrip, top: number) {',
    '  const height = 22;',
    '  const y = PAGE_H - top - height;',
    '  const blue: [number, number, number] = [0, 0.55, 1];',
    '  const white: [number, number, number] = [1, 1, 1];',
    '  const black: [number, number, number] = [0.04, 0.05, 0.07];',
    '  page.rect(MARGIN, y, CONTENT_W, height, white, blue, 0.7);',
    '  const columns = [',
    '    { x: MARGIN + 5, text: truncate(formatDate(trip.date), 10), size: 5.8 },',
    '    { x: MARGIN + 55, text: truncate(String(trip.code), 10), size: 5.8 },',
    '    { x: MARGIN + 102, text: truncate(trip.driverName, 20), size: 5.8 },',
    '    { x: MARGIN + 195, text: truncate(trip.fleetName, 16), size: 5.8 },',
    '    { x: MARGIN + 278, text: truncate(tons(trip.netWeight), 12), size: 5.8 },',
    '    { x: MARGIN + 338, text: truncate(brl(trip.freight), 15), size: 5.8 },',
    '    { x: MARGIN + 408, text: truncate(brl(trip.dieselCost), 14), size: 5.8 },',
    '    { x: MARGIN + 470, text: truncate(brl(trip.grossResult), 15), size: 5.8 },',
    '  ];',
    '  for (const col of columns) page.text(col.text, col.x, topToY(top + 14), { size: col.size, color: black });',
    '}',
    '',
    'function drawFuelingSectionTitle',
  ].join('\n');
  pdf = pdf.replace(tripCardPattern, compactTripCard);

  pdf = pdf
    .replace(/top \+ 74/g, 'top + 22')
    .replace(/top \+= 84;/g, 'top += 26;')
    .replace(/top \+= 82;/g, 'top += 26;')
    .replace(/top \+= 80;/g, 'top += 26;');

  // Radiant blue report accents while keeping black text on white content areas.
  pdf = pdf
    .replace(/(\bborder\s*:\s*)\[[^\]]+\]/, '$1[0, 0.55, 1]')
    .replace(/(\baccent\s*:\s*)\[[^\]]+\]/, '$1[0, 0.55, 1]');

  fs.writeFileSync(pdfPath, pdf);
  console.log('[render] PDF compacted: one non-overlapping line per freight; Por viagem and KM/L removed');
}

// Same Gerência login form; drivers redirect to isolated dashboard.
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
}

// Only admin/admin can own a management session; drivers use isolated driver_id sessions.
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
}

const finalManagementAuth = fs.readFileSync(path.join(target, 'src', 'lib', 'management-auth.server.ts'), 'utf8');
if (!finalManagementAuth.includes('username !== "admin"')) throw new Error('Admin-only management invariant missing');
if (!finalManagementAuth.includes('return "admin";')) throw new Error('admin/admin invariant missing');
const finalDriverAuth = fs.readFileSync(path.join(target, 'src', 'lib', 'klebersom-access.server.ts'), 'utf8');
if (finalDriverAuth.includes('managementSession')) throw new Error('Driver auth must never fall back to a management session');
console.log('[render] security invariant OK: admin/admin only for Gerência');

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

// Site-wide dark/white contrast with radiant blue accents.
const stylesPath = path.join(target, 'src', 'styles.css');
if (fs.existsSync(stylesPath)) {
  let styles = fs.readFileSync(stylesPath, 'utf8');
  styles = styles.replace(/background-attachment\s*:\s*fixed\s*;/gi, 'background-attachment: scroll;');
  styles += `\n\n/* transteste: radiant blue visual system */\n:root {\n  --bg: #07111f !important; --color-bg: #07111f !important;\n  --fg: #f8fbff !important; --color-fg: #f8fbff !important;\n  --surface: #0b1828 !important; --color-surface: #0b1828 !important;\n  --surface-2: #10243a !important; --color-surface-2: #10243a !important;\n  --muted: #a9bdd0 !important; --color-muted: #a9bdd0 !important;\n  --border: #008cff !important; --color-border: #008cff !important;\n  --accent: #008cff !important; --color-accent: #008cff !important;\n  --primary: #008cff !important; --color-primary: #008cff !important;\n  --ring: #008cff !important; --color-ring: #008cff !important;\n}\nhtml, body { background: #07111f !important; color: #f8fbff !important; }\nbody { background-image: none !important; background-attachment: scroll !important; }\nbody::before, body::after { background-image: none !important; background-attachment: scroll !important; }\n.text-accent, [class*=\"text-accent\"] { color: #008cff !important; }\n.border-accent, [class*=\"border-accent\"], .border-border { border-color: #008cff !important; }\n.bg-accent { background: #008cff !important; color: #07111f !important; }\n.text-white:not([class*=\"bg-\"]), [class*=\"text-white\"]:not([class*=\"bg-\"]) { background-color: #07111f; }\n.text-black:not([class*=\"bg-\"]), [class*=\"text-black\"]:not([class*=\"bg-\"]) { background-color: #ffffff; }\nbutton:focus-visible, a:focus-visible, input:focus-visible, select:focus-visible { outline-color: #008cff !important; box-shadow: 0 0 0 2px rgba(0,140,255,.35) !important; }\n::selection { background: #008cff; color: #07111f; }\n@media (max-width: 900px) { body, body::before, body::after { background-attachment: scroll !important; } [class*=\"backdrop-blur\"] { -webkit-backdrop-filter: none !important; backdrop-filter: none !important; } }\n`;
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
console.log('[render] transteste source reconstructed at .transteste_app');
