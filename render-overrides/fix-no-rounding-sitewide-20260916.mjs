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

// Valores monetários em Reais: sempre exatamente duas casas decimais.
replaceFunction('brl', `  if (!Number.isFinite(n)) return "—";\n  return "R$ " + new Intl.NumberFormat("pt-BR", {\n    useGrouping: true,\n    minimumFractionDigits: 2,\n    maximumFractionDigits: 2,\n  }).format(n);`);

// Quantidades: preservar a precisão cadastrada, sem arredondar.
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

// Painel possui formatador monetário próprio: exatamente 2 casas.
const panelPath = path.join(target, 'src/routes/dono/index.tsx');
if (fs.existsSync(panelPath)) {
  let panel = fs.readFileSync(panelPath, 'utf8');
  const start = panel.indexOf('function painelBrl(');
  if (start >= 0) {
    const end = panel.indexOf('\n}', start);
    if (end >= 0) {
      let block = panel.slice(start, end + 2);
      block = block.replace(/minimumFractionDigits:\s*\d+/, 'minimumFractionDigits: 2');
      block = block.replace(/maximumFractionDigits:\s*\d+/, 'maximumFractionDigits: 2');
      panel = panel.slice(0, start) + block + panel.slice(end + 2);
      fs.writeFileSync(panelPath, panel);
    }
  }
}

// PDFs: litragem deve preservar toda a precisão cadastrada.
const pdfPath = path.join(target, 'src/lib/pdf.ts');
if (fs.existsSync(pdfPath)) {
  let pdf = fs.readFileSync(pdfPath, 'utf8');
  pdf = pdf.replaceAll('minimumFractionDigits: 2, maximumFractionDigits: 3', 'minimumFractionDigits: 0, maximumFractionDigits: 20');
  fs.writeFileSync(pdfPath, pdf);
}

// Cadastro de motorista: comissão não pode ser arredondada para percentual inteiro.
const cadPath = path.join(target, 'src/routes/dono/cadastros.tsx');
if (fs.existsSync(cadPath)) {
  let cad = fs.readFileSync(cadPath, 'utf8');
  cad = cad.replaceAll('String(Math.round((value.commissionPct ?? 0.1) * 100))', 'String((value.commissionPct ?? 0.1) * 100)');
  cad = cad.replaceAll('String(((value.commissionPct ?? 0.1) * 100).toFixed(0))', 'String((value.commissionPct ?? 0.1) * 100)');
  fs.writeFileSync(cadPath, cad);
}

// Normaliza qualquer Intl.NumberFormat monetário em BRL no site inteiro para 2 casas.
// Formatadores não monetários continuam podendo usar até 20 casas para preservar os dados.
function normalizeIntlBlocks(text) {
  return text.replace(/new Intl\.NumberFormat\("pt-BR",\s*\{[\s\S]*?\}\)/g, (block) => {
    const isBrl = /currency\s*:\s*["']BRL["']/.test(block) || /style\s*:\s*["']currency["']/.test(block);
    if (isBrl) {
      let next = block;
      if (/minimumFractionDigits\s*:\s*\d+/.test(next)) next = next.replace(/minimumFractionDigits\s*:\s*\d+/, 'minimumFractionDigits: 2');
      else next = next.replace(/\}\)$/, '  , minimumFractionDigits: 2\n})');
      if (/maximumFractionDigits\s*:\s*\d+/.test(next)) next = next.replace(/maximumFractionDigits\s*:\s*\d+/, 'maximumFractionDigits: 2');
      else next = next.replace(/\}\)$/, '  , maximumFractionDigits: 2\n})');
      return next;
    }
    return block;
  });
}

function walkAndNormalizeCurrency(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walkAndNormalizeCurrency(full);
    else if (/\.(ts|tsx)$/.test(entry.name)) {
      const before = fs.readFileSync(full, 'utf8');
      const after = normalizeIntlBlocks(before);
      if (after !== before) fs.writeFileSync(full, after);
    }
  }
}
walkAndNormalizeCurrency(path.join(target, 'src'));

// Portal Klebersom: dinheiro com 2 casas; toneladas/KM preservam precisão.
const kleberPath = path.join(target, 'src/routes/klebersom.tsx');
if (fs.existsSync(kleberPath)) {
  let kleber = fs.readFileSync(kleberPath, 'utf8');
  kleber = kleber.replace(/const tonsFmt = new Intl\.NumberFormat\("pt-BR", \{[\s\S]*?\}\);/, `const tonsFmt = new Intl.NumberFormat("pt-BR", {\n  minimumFractionDigits: 0,\n  maximumFractionDigits: 20,\n});`);
  kleber = kleber.replace(/const numFmt = new Intl\.NumberFormat\("pt-BR", \{[\s\S]*?\}\);/, `const numFmt = new Intl.NumberFormat("pt-BR", {\n  minimumFractionDigits: 0,\n  maximumFractionDigits: 20,\n});`);
  kleber = normalizeIntlBlocks(kleber);
  fs.writeFileSync(kleberPath, kleber);
}

// Auditoria: identifica candidatos de arredondamento em dados de negócio e formatos monetários.
const findings = [];
const moneyFindings = [];
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
      for (const match of text.matchAll(/new Intl\.NumberFormat\("pt-BR",\s*\{[\s\S]*?\}\)/g)) {
        const block = match[0];
        if ((/currency\s*:\s*["']BRL["']/.test(block) || /style\s*:\s*["']currency["']/.test(block)) && !/maximumFractionDigits\s*:\s*2/.test(block)) {
          moneyFindings.push(path.relative(target, full));
        }
      }
    }
  }
}
walk(path.join(target, 'src'));
console.log(`[no-rounding-sitewide] quantity precision preserved; residual rounding candidates=${findings.length}; BRL formatter issues=${moneyFindings.length}`);
for (const finding of findings.slice(0, 60)) console.log(`[no-rounding-audit] ${finding}`);
for (const finding of moneyFindings.slice(0, 20)) console.log(`[brl-audit] ${finding}`);
