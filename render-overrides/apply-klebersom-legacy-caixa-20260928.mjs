import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const target = process.argv[2];
if (!target) throw new Error("klebersom-legacy-caixa: target missing");

const here = path.dirname(fileURLToPath(import.meta.url));
const source = path.join(here, "0023_klebersom_legacy_caixa.sql");
const destination = path.join(target, "migrations", "0023_klebersom_legacy_caixa.sql");

if (!fs.existsSync(source)) throw new Error("klebersom-legacy-caixa: migration missing");
fs.mkdirSync(path.dirname(destination), { recursive: true });
fs.copyFileSync(source, destination);
console.log("[klebersom-legacy-caixa] reconciliation migration installed; restored rows remain pending in Caixa");
