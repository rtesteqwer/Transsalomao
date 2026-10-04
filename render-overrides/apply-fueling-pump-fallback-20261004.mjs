import fs from "node:fs";
import path from "node:path";

const target = path.resolve(process.argv[2] || "");
if (!process.argv[2] || !fs.existsSync(path.join(target, "src"))) {
  throw new Error("fueling-pump-fallback: expected reconstructed application directory");
}

const rel = "src/lib/fueling-photo-reader.server.ts";
const file = path.join(target, rel);
if (!fs.existsSync(file)) throw new Error("fueling-pump-fallback: missing " + rel);
let s = fs.readFileSync(file, "utf8");

function rep(before, after, label) {
  if (s.includes(after)) return;
  if (!s.includes(before)) throw new Error("fueling-pump-fallback: pattern not found (" + label + ")");
  s = s.replace(before, after);
}

rep(
`      for (const token of raw) {
        const value = ocrRoleNumber(token, role);
        if (value) return value;
      }`,
`      for (const token of raw) {
        const value = ocrRoleNumber(token, role);
        if (!value) continue;
        const numeric = Number(value);
        // Em visor de bomba de carreta, fragmentos isolados como 1, 7 e 7
        // podem fechar matematicamente (1 × 7 = 7) e ainda serem apenas ruído
        // do teclado/legendas. Exija um mínimo físico antes de aceitar rótulos.
        if (role === "liters" && numeric < 5) continue;
        if (role === "money" && numeric < 20) continue;
        return value;
      }`,
"pump labeled minimums");

rep(
`  if (orderedRaw.length >= 3) {
    for (let i = 0; i <= orderedRaw.length - 3; i += 1) {
      const top = ocrRoleNumber(orderedRaw[i], "money");
      const middle = ocrRoleNumber(orderedRaw[i + 1], "liters");
      const bottom = ocrRoleNumber(orderedRaw[i + 2], "price");
      if (!top || !middle || !bottom) continue;
      const expected = Number(middle) * Number(bottom);
      if (Math.abs(expected - Number(top)) <= Math.max(0.20, expected * 0.004)) {
        total = total || top;
        liters = liters || middle;
        price = price || bottom;
        break;
      }
    }
  }`,
`  // Antes de preservar o que veio dos rótulos, descarte o falso trio clássico
  // de OCR de bomba (ex.: 1 L / R$ 7 / R$ 7). Isso libera o parser para procurar
  // os três visores reais na ordem física: cima=total, meio=litros, baixo=preço/L.
  if (total && liters && price) {
    const currentTotal = Number(total);
    const currentLiters = Number(liters);
    const currentPrice = Number(price);
    const expected = currentLiters * currentPrice;
    const closes = Math.abs(expected - currentTotal) <= Math.max(0.20, expected * 0.004);
    if (!closes || currentLiters < 5 || currentTotal < 20 || currentPrice < 2 || currentPrice > 20) {
      total = null;
      liters = null;
      price = null;
    }
  }

  if (orderedRaw.length >= 3) {
    for (let i = 0; i <= orderedRaw.length - 3; i += 1) {
      const top = ocrRoleNumber(orderedRaw[i], "money");
      const middle = ocrRoleNumber(orderedRaw[i + 1], "liters");
      const bottom = ocrRoleNumber(orderedRaw[i + 2], "price");
      if (!top || !middle || !bottom) continue;
      if (Number(top) < 20 || Number(middle) < 5) continue;
      const expected = Number(middle) * Number(bottom);
      if (Math.abs(expected - Number(top)) <= Math.max(0.20, expected * 0.004)) {
        total = top;
        liters = middle;
        price = bottom;
        break;
      }
    }
  }`,
"ordered pump triple sanity");

rep(
`    for (const l of candidates.map((x) => x.liters).filter((v): v is string => !!v)) {
      for (const p of candidates.map((x) => x.price).filter((v): v is string => !!v)) {
        for (const t of candidates.map((x) => x.total).filter((v): v is string => !!v)) {
          const expected = Number(l) * Number(p);
          if (Math.abs(expected - Number(t)) <= Math.max(0.20, expected * 0.004)) {
            liters = liters || l;
            price = price || p;
            total = total || t;
            break outer;
          }
        }
      }
    }`,
`    for (const l of candidates.map((x) => x.liters).filter((v): v is string => !!v)) {
      if (Number(l) < 5) continue;
      for (const p of candidates.map((x) => x.price).filter((v): v is string => !!v)) {
        for (const t of candidates.map((x) => x.total).filter((v): v is string => !!v)) {
          if (Number(t) < 20) continue;
          const expected = Number(l) * Number(p);
          if (Math.abs(expected - Number(t)) <= Math.max(0.20, expected * 0.004)) {
            liters = liters || l;
            price = price || p;
            total = total || t;
            break outer;
          }
        }
      }
    }`,
"unordered pump triple sanity");

rep(
`  if (liters && price && total) {
    const l = Number(liters);
    const p = Number(price);
    const t = Number(total);
    const d = Number(discount || 0);
    const expected = l * p - d;`,
`  if (liters && price && total) {
    const l = Number(liters);
    const p = Number(price);
    const t = Number(total);
    const d = Number(discount || 0);

    // Nunca confirme como abastecimento de bomba um trio fisicamente absurdo.
    // O OCR antigo podia transformar ruído do teclado em 1 L × R$7 = R$7.
    if ((display.detected || display.standalone) && (l < 5 || t < 20)) {
      liters = null;
      price = null;
      total = null;
      consistency = "partial";
      confidence = Math.min(confidence, 0.72);
      alerts.push("Números pequenos demais para um abastecimento de carreta foram descartados; confira os visores da bomba.");
    }

    const expected = l * p - d;`,
"final pump sanity");

fs.writeFileSync(file, s);
console.log("[fueling-pump-fallback] pump OCR rejects false 1x7=7 and prefers physical top/middle/bottom triplet");
