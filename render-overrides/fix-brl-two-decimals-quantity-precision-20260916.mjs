import fs from 'node:fs';
import path from 'node:path';

const target = process.argv[2];
if (!target || !fs.existsSync(target)) throw new Error('fix-brl-two-decimals-quantity-precision: target missing');

function normalizeIntlBlock(block) {
  const isCurrency = /currency\s*:\s*["']BRL["']/.test(block) || /style\s*:\s*["']currency["']/.test(block);
  let next = block;
  if (isCurrency) {
    if (/minimumFractionDigits\s*:\s*\d+/.test(next)) next = next.replace(/minimumFractionDigits\s*:\s*\d+/, 'minimumFractionDigits: 2');
    else next = next.replace(/\}\)$/, ', minimumFractionDigits: 2 })');
    if (/maximumFractionDigits\s*:\s*\d+/.test(next)) next = next.replace(/maximumFractionDigits\s*:\s*\d+/, 'maximumFractionDigits: 2');
    else next = next.replace(/\}\)$/, ', maximumFractionDigits: 2 })');
  } else {
    if (/maximumFractionDigits\s*:\s*\d+/.test(next)) next = next.replace(/maximumFractionDigits\s*:\s*\d+/, 'maximumFractionDigits: 20');
  }
  return next;
}

function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full);
    else if (/\.(ts|tsx)$/.test(entry.name)) {
      const before = fs.readFileSync(full, 'utf8');
      let after = before.replace(/new Intl\.NumberFormat\("pt-BR",\s*\{[\s\S]*?\}\)/g, normalizeIntlBlock);
      if (full.endsWith(path.join('src','routes','dono','index.tsx'))) {
        const start = after.indexOf('function painelBrl(');
        if (start >= 0) {
          const end = after.indexOf('\n}', start);
          if (end >= 0) {
            let block = after.slice(start, end + 2);
            block = block.replace(/minimumFractionDigits:\s*\d+/, 'minimumFractionDigits: 2');
            block = block.replace(/maximumFractionDigits:\s*\d+/, 'maximumFractionDigits: 2');
            after = after.slice(0, start) + block + after.slice(end + 2);
          }
        }
      }
      if (after !== before) fs.writeFileSync(full, after);
    }
  }
}
walk(path.join(target, 'src'));

let brlIssues = 0;
let quantityCaps = 0;
function audit(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) audit(full);
    else if (/\.(ts|tsx)$/.test(entry.name)) {
      const text = fs.readFileSync(full, 'utf8');
      for (const match of text.matchAll(/new Intl\.NumberFormat\("pt-BR",\s*\{[\s\S]*?\}\)/g)) {
        const block = match[0];
        const isCurrency = /currency\s*:\s*["']BRL["']/.test(block) || /style\s*:\s*["']currency["']/.test(block);
        if (isCurrency && (!/minimumFractionDigits\s*:\s*2/.test(block) || !/maximumFractionDigits\s*:\s*2/.test(block))) brlIssues++;
        if (!isCurrency) {
          const m = block.match(/maximumFractionDigits\s*:\s*(\d+)/);
          if (m && Number(m[1]) < 20) quantityCaps++;
        }
      }
    }
  }
}
audit(path.join(target, 'src'));
console.log(`[brl-two-decimals] BRL formatter issues=${brlIssues}; quantity precision caps=${quantityCaps}`);
if (brlIssues > 0) throw new Error('BRL formatter still allows a value other than exactly 2 decimal places');
