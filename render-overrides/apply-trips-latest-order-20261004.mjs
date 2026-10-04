import fs from "node:fs";
import path from "node:path";

const target = path.resolve(process.argv[2] || "");
if (!process.argv[2] || !fs.existsSync(path.join(target, "src"))) {
  throw new Error("trips-latest-order: expected reconstructed application directory");
}
const read = (rel) => fs.readFileSync(path.join(target, rel), "utf8");
const write = (rel, value) => fs.writeFileSync(path.join(target, rel), value);
const must = (s, before, after, label) => {
  if (s.includes(after)) return s;
  if (!s.includes(before)) throw new Error("trips-latest-order: pattern not found (" + label + ")");
  return s.replace(before, after);
};

// O banco devolve viagens pela hora real em que foram lançadas, não pela data
// informada no ticket. Registros antigos sem created_at continuam ordenados por data/ticket.
{
  const rel = "src/lib/api.ts";
  let s = read(rel);
  s = must(
    s,
    "sql<Record<string, unknown>>\`select * from trips order by date desc, code desc\`",
    "sql<Record<string, unknown>>\`select * from trips order by created_at desc nulls last, date desc, code desc\`",
    "management trips latest first",
  );
  s = must(
    s,
    "sql<Record<string, unknown>>\`select * from trips where driver_id=\${driverId} order by date desc, code desc\`",
    "sql<Record<string, unknown>>\`select * from trips where driver_id=\${driverId} order by created_at desc nulls last, date desc, code desc\`",
    "driver trips latest first",
  );
  write(rel, s);
}

// Na aba Viagens, os cartões agrupados (Cegonha/Caixinha/Diária) também seguem
// a ordem do lançamento mais recente. O Map já é preenchido percorrendo rows,
// portanto basta preservar a ordem de inserção e não reordenar alfabeticamente.
{
  const rel = "src/routes/dono/viagens.tsx";
  let s = read(rel);
  s = must(
    s,
    "  ).sort((a, b) => a.driverName.localeCompare(b.driverName) || a.mode.localeCompare(b.mode));",
    "  );",
    "grouped trips preserve latest order",
  );
  write(rel, s);
}

console.log("[trips-latest-order] Viagens ordered by newest launch first");
