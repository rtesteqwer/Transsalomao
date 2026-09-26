import fs from "node:fs";
import path from "node:path";

const target = path.resolve(process.argv[2] || "");
if (!process.argv[2] || !fs.existsSync(path.join(target, "src"))) {
  throw new Error("exact-fueling-liters: expected reconstructed application directory");
}

const rel = "src/routes/dono/abastecimentos.tsx";
const file = path.join(target, rel);
if (!fs.existsSync(file)) throw new Error("exact-fueling-liters: missing " + rel);

const before = fs.readFileSync(file, "utf8");
if (before.includes("const exactLiters =")) {
  console.log("[exact-fueling-liters] already applied");
  process.exit(0);
}

let after = before;
after = after.replace(
  'import { brl, formatDate, integer, liters } from "@/lib/format";',
  'import { brl, formatDate, integer } from "@/lib/format";',
);

const routeMarker = 'export const Route =';
if (!after.includes(routeMarker)) {
  throw new Error("exact-fueling-liters: route marker not found");
}

const helper = `const exactLiters = (value: unknown) => {
  const numeric = Number(value ?? 0);
  if (!Number.isFinite(numeric)) return "0 L";
  return new Intl.NumberFormat("pt-BR", {
    useGrouping: true,
    maximumFractionDigits: 3,
  }).format(numeric) + " L";
};

`;

after = after.replace(routeMarker, helper + routeMarker);
after = after.replace(/\bliters\(/g, "exactLiters(");

if (after === before) throw new Error("exact-fueling-liters: no changes applied");
if (/\bliters\(/.test(after)) throw new Error("exact-fueling-liters: rounded liters formatter still present");
if (!after.includes("exactLiters(totalLiters)") || !after.includes("exactLiters(row.liters)")) {
  throw new Error("exact-fueling-liters: expected total/card liters calls not found");
}

fs.writeFileSync(file, after);
console.log("[exact-fueling-liters] Abastecimentos now shows stored liters without display rounding");
