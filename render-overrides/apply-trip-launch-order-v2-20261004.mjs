import fs from "node:fs";
import path from "node:path";

const target = path.resolve(process.argv[2] || "");
if (!process.argv[2] || !fs.existsSync(path.join(target, "src"))) {
  throw new Error("trip-launch-order-v2: expected reconstructed application directory");
}

const read = (rel) => fs.readFileSync(path.join(target, rel), "utf8");
const write = (rel, value) => fs.writeFileSync(path.join(target, rel), value);

function replaceRequired(s, before, after, label) {
  if (s.includes(after)) return s;
  if (!s.includes(before)) throw new Error("trip-launch-order-v2: pattern not found (" + label + ")");
  return s.replace(before, after);
}

// Carry the real database creation time all the way to the browser.
{
  const rel = "src/lib/types.ts";
  let s = read(rel);
  const tripStart = s.indexOf("export type Trip = {");
  if (tripStart < 0) throw new Error("trip-launch-order-v2: Trip type missing");
  const tripEnd = s.indexOf("\n};", tripStart);
  if (tripEnd < 0) throw new Error("trip-launch-order-v2: Trip type end missing");
  const block = s.slice(tripStart, tripEnd);
  if (!block.includes("createdAt?: string;") && !block.includes("createdAt: string;")) {
    const idPos = s.indexOf("  id: string;", tripStart);
    if (idPos < 0 || idPos > tripEnd) throw new Error("trip-launch-order-v2: Trip id field missing");
    const insertAt = idPos + "  id: string;".length;
    s = s.slice(0, insertAt) + "\n  createdAt?: string;" + s.slice(insertAt);
  }
  write(rel, s);
}

{
  const rel = "src/lib/api.ts";
  let s = read(rel);

  // mapTrip previously discarded created_at even though the SQL query ordered by it.
  const mapNeedle = "    dieselPrice: num(r.diesel_price),\n  };";
  const mapReplacement = "    dieselPrice: num(r.diesel_price),\n    createdAt: r.created_at instanceof Date ? r.created_at.toISOString() : str(r.created_at),\n  };";
  s = replaceRequired(s, mapNeedle, mapReplacement, "mapTrip createdAt");

  // Accepted Caixa reports get the acceptance moment as the trip launch time.
  const acceptCols = "insert into trips (id, code, date, client, origin, destination, driver_id, fleet_id, loaded_tons, gross_weight, net_weight, freight_mode, price_per_ton, price_per_trip, km_start, km_end, diesel_liters, diesel_price)";
  const acceptColsNew = "insert into trips (id, code, date, client, origin, destination, driver_id, fleet_id, loaded_tons, gross_weight, net_weight, freight_mode, price_per_ton, price_per_trip, km_start, km_end, diesel_liters, diesel_price, created_at)";
  s = replaceRequired(s, acceptCols, acceptColsNew, "accepted trip created_at column");

  const acceptVals = "values (${tripId}, ${ticket}, ${date}, '', '', '', ${str(report.driver_id)}, ${fleetId}, ${tons}, 0, ${tons}, ${mode}, ${pricePerTon}, ${price}, ${kmStart}, ${kmEnd}, 0, 0)";
  const acceptValsNew = "values (${tripId}, ${ticket}, ${date}, '', '', '', ${str(report.driver_id)}, ${fleetId}, ${tons}, 0, ${tons}, ${mode}, ${pricePerTon}, ${price}, ${kmStart}, ${kmEnd}, 0, 0, now())";
  s = replaceRequired(s, acceptVals, acceptValsNew, "accepted trip created_at value");

  // Direct management creation also gets now(); edits keep the existing timestamp
  // because created_at is intentionally absent from ON CONFLICT DO UPDATE.
  const upsertCols = "        km_start, km_end, diesel_liters, diesel_price\n      ) values (";
  const upsertColsNew = "        km_start, km_end, diesel_liters, diesel_price, created_at\n      ) values (";
  s = replaceRequired(s, upsertCols, upsertColsNew, "direct trip created_at column");

  const upsertVals = "        ${data.kmStart}, ${data.kmEnd}, ${data.dieselLiters}, ${data.dieselPrice}\n      )";
  const upsertValsNew = "        ${data.kmStart}, ${data.kmEnd}, ${data.dieselLiters}, ${data.dieselPrice}, now()\n      )";
  s = replaceRequired(s, upsertVals, upsertValsNew, "direct trip created_at value");

  write(rel, s);
}

{
  const rel = "src/routes/dono/viagens.tsx";
  let s = read(rel);

  // Never trust incidental array order for the default option: explicitly sort
  // by the timestamp that was persisted when the trip was launched.
  const oldOrder = `    if (tripOrder === "oldest_launch") {
      all = [...all].reverse();
    } else if (tripOrder === "date_desc" || tripOrder === "date_asc") {`;
  const newOrder = `    const launchTime = (trip: any) => {
      const parsed = Date.parse(String(trip.createdAt ?? ""));
      return Number.isFinite(parsed) ? parsed : 0;
    };
    if (tripOrder === "latest_launch" || tripOrder === "oldest_launch") {
      const direction = tripOrder === "latest_launch" ? -1 : 1;
      all = [...all].sort((a, b) => {
        const byLaunch = launchTime(a) - launchTime(b);
        if (byLaunch !== 0) return byLaunch * direction;
        return 0;
      });
    } else if (tripOrder === "date_desc" || tripOrder === "date_asc") {`;
  s = replaceRequired(s, oldOrder, newOrder, "explicit launch timestamp ordering");

  // The Map is filled from already-ordered rows. Sorting it alphabetically here
  // destroyed "latest launch" order for Diária/Cegonha/Caixinha.
  const groupedSort = "  ).sort((a, b) => a.driverName.localeCompare(b.driverName) || a.mode.localeCompare(b.mode));";
  const groupedNoSort = "  );";
  s = replaceRequired(s, groupedSort, groupedNoSort, "grouped mode launch order");

  write(rel, s);
}

console.log("[trip-launch-order-v2] explicit createdAt ordering + grouped-mode latest-launch order enabled");
