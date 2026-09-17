import fs from 'node:fs';
import path from 'node:path';

const target = process.argv[2];
if (!target) throw new Error('request-20260917: target missing');

const textExt = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.json', '.html']);
const files = [];
function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (['node_modules', '.git', '.vercel'].includes(entry.name)) continue;
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(p);
    else if (textExt.has(path.extname(entry.name))) files.push(p);
  }
}
walk(target);

let renderRefs = 0;
let dieselPrecision = 0;
let authChanges = 0;

for (const p of files) {
  let s = fs.readFileSync(p, 'utf8');
  const before = s;

  // Remove qualquer URL antiga do Render usada pelo app em runtime/logout.
  const renderMatches = s.match(/https?:\/\/transteste\.onrender\.com\/?/g);
  if (renderMatches) renderRefs += renderMatches.length;
  s = s.replace(/https?:\/\/transteste\.onrender\.com\/?/g, 'https://transsalomao.vercel.app/');
  s = s.replace(/transteste\.onrender\.com/g, 'transsalomao.vercel.app');

  // Diesel/preço por litro: somente 3 casas decimais na exibição.
  if (/diesel|abastec|fuel|litro/i.test(s)) {
    const reps = [
      [/((?:pricePerLiter|fuelPrice|dieselPrice|priceLiter|literPrice|price_per_liter)\b[^\n;]{0,120}\.toFixed\()2(\))/gi, '$13$2'],
      [/(\.toLocaleString\([^\n]{0,160}(?:minimumFractionDigits\s*:\s*))2([^\n]{0,160}(?:maximumFractionDigits\s*:\s*))2/gi, '$13$23'],
      [/((?:brl|money|formatCurrency|formatNumber|num|decimal)\([^\n]{0,100}(?:pricePerLiter|fuelPrice|dieselPrice|priceLiter|literPrice)[^,)]*,\s*)2(\s*\))/gi, '$13$2'],
    ];
    for (const [re, repl] of reps) {
      const old = s;
      s = s.replace(re, repl);
      if (s !== old) dieselPrecision++;
    }
  }

  // Troca credencial legada admin/admin por Felipe e adiciona Emanuel/Murillo em validadores hardcoded comuns.
  const authPatterns = [
    [/username\s*===\s*["']admin["']\s*&&\s*password\s*===\s*["']admin["']/g,
      '(username === "Felipe" && password === "159753") || (username === "Emanuel" && password === "8554") || (username === "Murillo" && password === "10203040")'],
    [/user\s*===\s*["']admin["']\s*&&\s*pass\s*===\s*["']admin["']/g,
      '(user === "Felipe" && pass === "159753") || (user === "Emanuel" && pass === "8554") || (user === "Murillo" && pass === "10203040")'],
    [/\{\s*(?:username|user)\s*:\s*["']admin["']\s*,\s*(?:password|pass|senha)\s*:\s*["']admin["']\s*\}/g,
      '{ username: "Felipe", password: "159753" }, { username: "Emanuel", password: "8554" }, { username: "Murillo", password: "10203040" }'],
  ];
  for (const [re, repl] of authPatterns) {
    const old = s;
    s = s.replace(re, repl);
    if (s !== old) authChanges++;
  }

  // Literais simples muito específicos do login legado.
  if (/login|auth|senha|password|ger[eê]ncia/i.test(s) && s.includes('admin')) {
    const old = s;
    s = s.replace(/(["'])admin\1\s*:\s*(["'])admin\2/g, '"Felipe": "159753", "Emanuel": "8554", "Murillo": "10203040"');
    if (s !== old) authChanges++;
  }

  if (s !== before) fs.writeFileSync(p, s);
}

console.log(`[request-20260917] render refs replaced=${renderRefs}, diesel precision patches=${dieselPrecision}, auth patches=${authChanges}`);

// Segurança: o código final não pode manter o domínio antigo do Render.
const leftovers = [];
for (const p of files) {
  const s = fs.readFileSync(p, 'utf8');
  if (s.includes('transteste.onrender.com')) leftovers.push(path.relative(target, p));
}
if (leftovers.length) throw new Error(`request-20260917: Render URL still present: ${leftovers.join(', ')}`);
