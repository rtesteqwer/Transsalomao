import fs from 'node:fs';
import path from 'node:path';

const target = process.argv[2];
if (!target || !fs.existsSync(target)) throw new Error('fix-daily-caixa: target missing');
const p = path.join(target, 'src/routes/dono/lancamentos.tsx');
let s = fs.readFileSync(p, 'utf8');

// The Daily card displays brl(report.dailyValue); make sure brl is imported from format.ts.
if (!/import\s*\{[^}]*\bbrl\b[^}]*\}\s*from\s*["']@\/lib\/format["'];/.test(s)) {
  const re = /import\s*\{([^}]*)\}\s*from\s*["']@\/lib\/format["'];/;
  const m = s.match(re);
  if (!m) throw new Error('fix-daily-caixa: format import missing');
  s = s.replace(m[0], m[0].replace('{', '{ brl,'));
}

// If management closes a Daily item individually, preserve the rate entered by the driver.
if (!s.includes('pricePerTrip: Number(open?.dailyValue ?? 0)')) {
  const before = '                    await trip.mutateAsync(payload);';
  const after = '                    await trip.mutateAsync(open?.freightMode === "trip" ? { ...payload, pricePerTrip: Number(open?.dailyValue ?? 0) } : payload);';
  if (!s.includes(before)) throw new Error('fix-daily-caixa: individual close marker missing');
  s = s.replace(before, after);
}

fs.writeFileSync(p, s);
console.log('[fix-daily-caixa] Daily value display and individual close flow fixed');

// Temporary inspection to verify the bulk accept path before hardening Daily mode.
const apiPath = path.join(target, 'src/lib/api.ts');
const api = fs.readFileSync(apiPath, 'utf8');
const acceptStart = api.indexOf('export const acceptReports');
if (acceptStart >= 0) {
  const acceptEnd = api.indexOf('\nexport const ', acceptStart + 20);
  console.log('\n--- ACCEPT_REPORTS_SOURCE_START ---\n');
  console.log(api.slice(acceptStart, acceptEnd > acceptStart ? acceptEnd : acceptStart + 12000));
  console.log('\n--- ACCEPT_REPORTS_SOURCE_END ---\n');
}
