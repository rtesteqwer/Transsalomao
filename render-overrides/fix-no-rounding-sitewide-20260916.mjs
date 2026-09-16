import fs from 'node:fs';
import path from 'node:path';

const target = process.argv[2];
if (!target || !fs.existsSync(target)) throw new Error('fix-no-rounding-sitewide: target missing');

const formatPath = path.join(target, 'src/lib/format.ts');
if (!fs.existsSync(formatPath)) throw new Error('fix-no-rounding-sitewide: format.ts missing');
let s = fs.readFileSync(formatPath, 'utf8');

function replaceFunction(name, body) {
  const re = new RegExp(`export function ${name}\\(([^)]*)\\)\\s*\\{[\\s\\S]*?\\n\\}`, 'm');
  const match = s.match(re);
  if (!match) throw new Error(`fix-no-rounding-sitewide: function ${name} not found`);
  s = s.replace(re, `export function ${name}(${match[1]}) {\n${body}\n}`);
}

const helper = `const preciseNumberFmt = new Intl.NumberFormat("pt-BR", {\n  useGrouping: true,\n  minimumFractionDigits: 0,\n  maximumFractionDigits: 20,\n});\n\nfunction exactNumber(n: number) {\n  if (!Number.isFinite(n)) return "—";\n  return preciseNumberFmt.format(n);\n}\n\n`;

if (!s.includes('const preciseNumberFmt = new Intl.NumberFormat')) {
  const anchor = s.indexOf('export function brl');
  if (anchor < 0) throw new Error('fix-no-rounding-sitewide: brl anchor missing');
  s = s.slice(0, anchor) + helper + s.slice(anchor);
}

replaceFunction('brl', `  if (!Number.isFinite(n)) return "—";\n  return "R$ " + new Intl.NumberFormat("pt-BR", {\n    useGrouping: true,\n    minimumFractionDigits: 2,\n    maximumFractionDigits: 20,\n  }).format(n);`);
replaceFunction('num', `  return exactNumber(n);`);
replaceFunction('numLoose', `  return exactNumber(n);`);
replaceFunction('num1', `  return exactNumber(n);`);
replaceFunction('integer', `  return exactNumber(n);`);
replaceFunction('compact', `  return exactNumber(n);`);
replaceFunction('pct', `  if (!Number.isFinite(fraction)) return "—";\n  return exactNumber(fraction * 100) + "%";`);
replaceFunction('kmL', `  return n === null || !Number.isFinite(n) ? "—" : \`${'${exactNumber(n)}'} km/L\`;`);
replaceFunction('tons', `  return \`${'${exactNumber(n)}'} t\`;`);
replaceFunction('liters', `  return \`${'${exactNumber(n)}'} L\`;`);
replaceFunction('km', `  return \`${'${exactNumber(n)}'} km\`;`);

fs.writeFileSync(formatPath, s);

// The dashboard had its own money formatter forcing exactly two decimal places.
// Keep at least two for currency readability, but display any additional stored precision.
const panelPath = path.join(target, 'src/routes/dono/index.tsx');
if (fs.existsSync(panelPath)) {
  let panel = fs.readFileSync(panelPath, 'utf8');
  const start = panel.indexOf('function painelBrl(');
  if (start >= 0) {
    const end = panel.indexOf('\n}', start);
    if (end >= 0) {
      const block = panel.slice(start, end + 2);
      const next = block.replace('maximumFractionDigits: 2', 'maximumFractionDigits: 20');
      panel = panel.slice(0, start) + next + panel.slice(end + 2);
      fs.writeFileSync(panelPath, panel);
    }
  }
}

// Audit explicit rounding outside the centralized format helper.
const findings = [];
function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full);
    else if (/\.(ts|tsx)$/.test(entry.name) && full !== formatPath) {
      const text = fs.readFileSync(full, 'utf8');
      const lines = text.split(/\r?\n/);
      lines.forEach((line, idx) => {
        if (/Math\.round\(|\.toFixed\(|maximumFractionDigits\s*:\s*[0-6](?:\D|$)/.test(line)) {
          findings.push(`${path.relative(target, full)}:${idx + 1}: ${line.trim().slice(0, 180)}`);
        }
      });
    }
  }
}
walk(path.join(target, 'src'));
console.log(`[no-rounding-sitewide] exact formatters applied; residual rounding candidates=${findings.length}`);
for (const finding of findings.slice(0, 60)) console.log(`[no-rounding-audit] ${finding}`);
