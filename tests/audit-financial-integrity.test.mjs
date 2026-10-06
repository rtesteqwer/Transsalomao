import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(process.env.TRANS_TEST_APP || process.env.TRANS_SOURCE_DUMP || ".");
const read = (rel) => fs.readFileSync(path.join(root, rel), "utf8");

test("historical freight prices and commissions are frozen and critical writes are atomic", () => {
  const api = read("src/lib/api.ts");
  const calc = read("src/lib/calc.ts");
  const types = read("src/lib/types.ts");
  const db = read("src/lib/db.ts");

  assert.equal(api.includes("update trips set price_per_trip = ${data.trip}"), false);
  assert.equal(api.includes("update trips set price_per_trip = ${data.cegonha}"), false);
  assert.equal(api.includes("update trips set price_per_trip = ${data.caixinha}"), false);

  assert.match(api, /commission_pct_snapshot/);
  assert.match(api, /select \* from reports where id = \$\{id\} and status = 'pendente' limit 1 for update/);
  assert.match(api, /await sql\.transaction\(async \(tx\) =>/);

  assert.match(calc, /trip\.commissionPctSnapshot \?\?/);
  assert.match(calc, /sum\(rows, \(t\) => t\.commissionValue\)/);
  assert.match(types, /commissionPctSnapshot: number \| null/);

  assert.match(db, /transaction<T>\(fn: \(sql: Sql\) => Promise<T>\): Promise<T>/);
  assert.match(db, /await client\.query\("BEGIN"\)/);
  assert.match(db, /await client\.query\("COMMIT"\)/);
  assert.match(db, /await client\.query\("ROLLBACK"\)/);
  assert.match(db, /url\.searchParams\.set\("sslmode", "verify-full"\)/);

  assert.equal(fs.existsSync(path.join(root, "migrations", "0026_trip_financial_snapshots.sql")), true);
});
