import fs from 'node:fs';
import path from 'node:path';

const target = process.argv[2];
if (!target) throw new Error('inspect target missing');

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const name of fs.readdirSync(dir)) {
    const p = path.join(dir, name);
    const st = fs.statSync(p);
    if (st.isDirectory()) walk(p, out);
    else if (/\.(tsx|ts)$/.test(name)) out.push(p);
  }
  return out;
}

function snippet(text, needle, radius = 2400) {
  const i = text.toLowerCase().indexOf(needle.toLowerCase());
  if (i < 0) return null;
  return text.slice(Math.max(0, i - radius), Math.min(text.length, i + radius));
}

const viagens = path.join(target, 'src/routes/dono/viagens.tsx');
if (fs.existsSync(viagens)) {
  const text = fs.readFileSync(viagens, 'utf8');
  console.log('[inspect-ui] VIAGENS_START');
  for (const key of ['const filtered', 'filteredTrips', 'visibleTrips', 'data.trips', '<table', 'TripForm']) {
    const s = snippet(text, key, 3200);
    if (s) console.log(`[inspect-ui] viagens:${key}\n${s}\n[inspect-ui] viagens:${key}:END`);
  }
  console.log('[inspect-ui] VIAGENS_END');
}

const donoDir = path.join(target, 'src/routes/dono');
for (const p of walk(donoDir)) {
  const text = fs.readFileSync(p, 'utf8');
  if (!/caixa/i.test(text)) continue;
  console.log(`[inspect-ui] CAIXA_FILE ${path.relative(target, p)}`);
  for (const key of ['Caixa', 'caixa', 'driver', 'motorista', 'useFleet']) {
    const s = snippet(text, key, 3200);
    if (s) console.log(`[inspect-ui] caixa:${key}\n${s}\n[inspect-ui] caixa:${key}:END`);
  }
}
