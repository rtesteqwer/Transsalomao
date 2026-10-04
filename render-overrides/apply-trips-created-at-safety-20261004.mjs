import fs from "node:fs";
import path from "node:path";

const target = path.resolve(process.argv[2] || "");
if (!process.argv[2] || !fs.existsSync(path.join(target, "src"))) {
  throw new Error("trips-created-at-safety: expected reconstructed application directory");
}
const repo = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const rel = "src/lib/api.ts";
const file = path.join(target, rel);
let s = fs.readFileSync(file, "utf8");

const adminOld = "sql<Record<string, unknown>>`select * from trips order by created_at desc nulls last, date desc, code desc`";
const adminNew = "sql<Record<string, unknown>>`select * from trips order by nullif(to_jsonb(trips)->>'created_at','')::timestamptz desc nulls last, date desc, code desc`";
const driverOld = "sql<Record<string, unknown>>`select * from trips where driver_id=${driverId} order by created_at desc nulls last, date desc, code desc`";
const driverNew = "sql<Record<string, unknown>>`select * from trips where driver_id=${driverId} order by nullif(to_jsonb(trips)->>'created_at','')::timestamptz desc nulls last, date desc, code desc`";

if (!s.includes(adminNew)) {
  if (!s.includes(adminOld)) throw new Error("trips-created-at-safety: admin trip query not found");
  s = s.replace(adminOld, adminNew);
}
if (!s.includes(driverNew)) {
  if (!s.includes(driverOld)) throw new Error("trips-created-at-safety: driver trip query not found");
  s = s.replace(driverOld, driverNew);
}
fs.writeFileSync(file, s);

const migrationSrc = path.join(repo, "render-overrides", "0024_trip_created_at.sql");
const migrationDst = path.join(target, "migrations", "0024_trip_created_at.sql");
fs.mkdirSync(path.dirname(migrationDst), { recursive: true });
fs.copyFileSync(migrationSrc, migrationDst);

console.log("[trips-created-at-safety] trip ordering no longer breaks fleet loading when created_at is absent; migration installed");
