import fs from 'node:fs';
import path from 'node:path';

const target = process.argv[2];
if (!target || !fs.existsSync(target)) throw new Error('fix-no-rounding-sitewide: target missing');

const formatPath = path.join(target, 'src/lib/format.ts');
if (!fs.existsSync(formatPath)) throw new Error('fix-no-rounding-sitewide: format.ts missing');
let s = fs.readFileSync(formatPath, 'utf8');
console.log('[format-source-start]');
console.log(s.slice(0, 12000));
console.log('[format-source-end]');
throw new Error('fix-no-rounding-sitewide: inspection build only');
