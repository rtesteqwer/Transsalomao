import fs from 'node:fs';
import path from 'node:path';

const target = path.resolve(process.argv[2] || '');
if (!target || !fs.existsSync(target)) throw new Error('Expected reconstructed application directory');

const cssPath = path.join(target, 'src', 'styles.css');
if (!fs.existsSync(cssPath)) throw new Error('styles.css not found');

const marker = '--transsalomao-release-css: 20260926-2308;';
let css = fs.readFileSync(cssPath, 'utf8');
if (!css.includes(marker)) {
  css += '\n:root { --transsalomao-release-css: 20260926-2308; }\n';
  fs.writeFileSync(cssPath, css);
}
console.log('[css-cache-bust] final stylesheet changed so browsers receive a fresh hashed asset');
