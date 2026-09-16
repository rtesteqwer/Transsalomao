import fs from 'node:fs';
import path from 'node:path';

const target = process.argv[2];
if (!target || !fs.existsSync(target)) throw new Error('fix-brl-two-decimals-quantity-precision: target missing');

function repairLegacyFormatterSyntax(text) {
  return text
    .replace(/,\s*,\s*(minimumFractionDigits|maximumFractionDigits)/g, ', $1')
    .replace(/\{\s*,\s*(minimumFractionDigits|maximumFractionDigits)/g, '{ $1');
}

function normalizeCurrencyIntlBlock(block) {
  const isCurrency = /currency\s*:\s*["']BRL["']/.test(block) || /style\s*:\s*["']currency["']/.test(block);
  if (!isCurrency) return block;
  let next = block;
  if (/minimumFractionDigits\s*:\s*\d+/.test(next)) next = next.replace(/minimumFractionDigits\s*:\s*\d+/, 'minimumFractionDigits: 2');
  else next = next.replace(/\{/, '{\n  minimumFractionDigits: 2,');
  if (/maximumFractionDigits\s*:\s*\d+/.test(next)) next = next.replace(/maximumFractionDigits\s*:\s*\d+/, 'maximumFractionDigits: 2');
  else next = next.replace(/\{/, '{\n  maximumFractionDigits: 2,');
  return next;
}

function replaceFunctionBlock(text, name, mutate) {
  const re = new RegExp(`export function ${name}\\(([^)]*)\\)\\s*\\{[\\s\\S]*?\\n\\}`, 'm');
  const match = text.match(re);
  if (!match) return text;
  return text.replace(re, mutate(match[0]));
}

function forceTwoDecimalsInBlock(block) {
  let next = block;
  if (/minimumFractionDigits\s*:\s*\d+/.test(next)) next = next.replace(/minimumFractionDigits\s*:\s*\d+/, 'minimumFractionDigits: 2');
  if (/maximumFractionDigits\s*:\s*\d+/.test(next)) next = next.replace(/maximumFractionDigits\s*:\s*\d+/, 'maximumFractionDigits: 2');
  return next;
}

function walkCurrency(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walkCurrency(full);
    else if (/\.(ts|tsx)$/.test(entry.name)) {
      const raw = fs.readFileSync(full, 'utf8');
      let after = repairLegacyFormatterSyntax(raw);
      after = after.replace(/new Intl\.NumberFormat\("pt-BR",\s*\{[\s\S]*?\}\)/g, normalizeCurrencyIntlBlock);
      if (after !== raw) fs.writeFileSync(full, after);
    }
  }
}
walkCurrency(path.join(target, 'src'));

// O helper global brl usa prefixo "R$" sem style:"currency". Forçar 2 casas aqui.
const formatPath = path.join(target, 'src/lib/format.ts');
if (fs.existsSync(formatPath)) {
  let text = fs.readFileSync(formatPath, 'utf8');
  text = replaceFunctionBlock(text, 'brl', forceTwoDecimalsInBlock);
  fs.writeFileSync(formatPath, text);
}

// Painel possui helper monetário próprio, também exatamente 2 casas.
const panelPath = path.join(target, 'src/routes/dono/index.tsx');
if (fs.existsSync(panelPath)) {
  let panel = fs.readFileSync(panelPath, 'utf8');
  const start = panel.indexOf('function painelBrl(');
  if (start >= 0) {
    const end = panel.indexOf('\n}', start);
    if (end >= 0) {
      const block = forceTwoDecimalsInBlock(panel.slice(start, end + 2));
      panel = panel.slice(0, start) + block + panel.slice(end + 2);
    }
  }
  fs.writeFileSync(panelPath, panel);
}

// Portal Klebersom: moeda em 2 casas; demais NumberFormat preservam até 20 casas.
const kleberPath = path.join(target, 'src/routes/klebersom.tsx');
if (fs.existsSync(kleberPath)) {
  let kleber = fs.readFileSync(kleberPath, 'utf8');
  kleber = repairLegacyFormatterSyntax(kleber);
  kleber = kleber.replace(/new Intl\.NumberFormat\("pt-BR",\s*\{[\s\S]*?\}\)/g, (block) => {
    const isCurrency = /currency\s*:\s*["']BRL["']/.test(block) || /style\s*:\s*["']currency["']/.test(block);
    if (isCurrency) return normalizeCurrencyIntlBlock(block);
    if (/maximumFractionDigits\s*:\s*\d+/.test(block)) return block.replace(/maximumFractionDigits\s*:\s*\d+/, 'maximumFractionDigits: 20');
    return block;
  });
  fs.writeFileSync(kleberPath, kleber);
}

// Auditoria monetária: nenhum Intl BRL pode fugir de 2 casas e helpers R$ devem estar em 2 casas.
let brlIssues = 0;
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
      }
    }
  }
}
audit(path.join(target, 'src'));
const finalFormat = fs.readFileSync(formatPath, 'utf8');
const brlStart = finalFormat.indexOf('export function brl(');
const brlEnd = brlStart >= 0 ? finalFormat.indexOf('\n}', brlStart) : -1;
if (brlStart < 0 || brlEnd < 0 || !/maximumFractionDigits:\s*2/.test(finalFormat.slice(brlStart, brlEnd + 2))) brlIssues++;
console.log(`[brl-two-decimals] final BRL formatter issues=${brlIssues}`);
if (brlIssues > 0) throw new Error('BRL formatting is not fixed to exactly two decimal places');
