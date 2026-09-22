import fs from "node:fs";
import path from "node:path";

const target = process.argv[2];
if (!target || !fs.existsSync(target)) throw new Error("pf-sync: target missing");

const src = path.join(process.cwd(), "render-overrides", "pf-sync-route.ts");
const dest = path.join(target, "src", "routes", "api", "pf-sync.ts");
if (!fs.existsSync(src)) throw new Error("pf-sync: source route missing");
fs.mkdirSync(path.dirname(dest), { recursive: true });
fs.copyFileSync(src, dest);
console.log("[pf-sync] /api/pf-sync installed for Meu Capital PF");
