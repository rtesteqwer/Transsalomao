import fs from "node:fs";
import path from "node:path";

const target = process.argv[2];
if (!target) throw new Error("daily-km-compat: target missing");

const file = path.join(target, "src/lib/api.ts");
if (!fs.existsSync(file)) throw new Error("daily-km-compat: src/lib/api.ts missing");

const before = fs.readFileSync(file, "utf8");
const oldText = `insert into reports (id,ticket,driver_id,fleet_id,tons,daily_value,freight_mode,status)
      values (${id},${ticket},${driverId},${data.fleetId},${data.tons},${data.dailyValue},${data.freightMode ?? null},'pendente')`;
const newText = `insert into reports (id,ticket,driver_id,fleet_id,km,tons,daily_value,freight_mode,status)
      values (${id},${ticket},${driverId},${data.fleetId},${data.km ?? 0},${data.tons},${data.dailyValue},${data.freightMode ?? null},'pendente')`;

if (!before.includes(oldText)) {
  if (before.includes(newText)) {
    console.log("[daily-km-compat] km compatibility already applied");
    process.exit(0);
  }
  throw new Error("daily-km-compat: final submitReport insert pattern not found");
}

fs.writeFileSync(file, before.replace(oldText, newText));
console.log("[daily-km-compat] daily reports now satisfy legacy reports.km NOT NULL constraint");
