import fs from 'node:fs';
import path from 'node:path';

const target = process.argv[2];
if (!target || !fs.existsSync(target)) throw new Error('fix-daily-api-import: target missing');
const p = path.join(target, 'src/lib/use-fleet.ts');
let s = fs.readFileSync(p, 'utf8');

// Remove an accidental insertion into unrelated import blocks.
s = s.replace(
  /import\s*\{([^}]*)\}\s*from\s*["']@tanstack\/react-query["'];/,
  (block, names) => block.replace(names, String(names).replace(/\s*upsertDailyReport\s*,?\s*/g, ' ')),
);

if (!/import\s*\{[^}]*\bupsertDailyReport\b[^}]*\}\s*from\s*["'](?:@\/lib\/api|\.\/api)["'];/.test(s)) {
  const apiImport = /import\s*\{([^}]*)\}\s*from\s*["'](?:@\/lib\/api|\.\/api)["'];/;
  const match = s.match(apiImport);
  if (!match) throw new Error('fix-daily-api-import: API import block missing');
  const next = match[0].replace('{', '{\n  upsertDailyReport,');
  s = s.replace(match[0], next);
}

fs.writeFileSync(p, s);
console.log('[fix-daily-api-import] upsertDailyReport imported from app API');
