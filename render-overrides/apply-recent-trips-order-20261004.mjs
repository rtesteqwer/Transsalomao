import fs from "node:fs";
import path from "node:path";

const target=process.argv[2];
if(!target||!fs.existsSync(target)) throw new Error("recent-trips-order: target missing");
const file=path.join(target,"src/routes/dono/viagens.tsx");
let s=fs.readFileSync(file,"utf8");
if(s.includes("[recent-trips-order]")) process.exit(0);

const old=`    let all = data.trips.map((t) => enrichTrip(t, data.drivers, data.fleets));
    if (driverFilter !== "all") all = all.filter((t) => t.driverId === driverFilter);
    const s = q.trim().toLowerCase();
    if (!s) return all;
    return all.filter((t) =>`;
const neu=`    // [recent-trips-order] The Viagens screen represents launch recency, not
    // chronological ticket date. The backend returns trips in persistence order,
    // so reverse that order and keep it stable through filtering/enrichment.
    let all = data.trips
      .map((t, sourceIndex) => ({ trip: enrichTrip(t, data.drivers, data.fleets), sourceIndex }))
      .sort((a, b) => b.sourceIndex - a.sourceIndex)
      .map((item) => item.trip);
    if (driverFilter !== "all") all = all.filter((t) => t.driverId === driverFilter);
    const s = q.trim().toLowerCase();
    if (!s) return all;
    return all.filter((t) =>`;
if(!s.includes(old)) throw new Error("recent-trips-order: rows block missing");
s=s.replace(old,neu);
fs.writeFileSync(file,s);
console.log("[recent-trips-order] newest persisted launches shown first in Viagens");
