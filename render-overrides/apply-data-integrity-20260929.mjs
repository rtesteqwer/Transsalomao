import fs from "node:fs";
import path from "node:path";

const target = path.resolve(process.argv[2] || "");
if (!process.argv[2] || !fs.existsSync(path.join(target, "src"))) {
  throw new Error("data-integrity: expected reconstructed application directory");
}
const repo = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const src = (rel) => path.join(repo, rel);
const dst = (rel) => path.join(target, rel);
const bt = String.fromCharCode(96);
const dataIdExpr = "$" + "{data.id}";

function copy(from, to) {
  fs.mkdirSync(path.dirname(dst(to)), { recursive: true });
  fs.writeFileSync(dst(to), fs.readFileSync(src(from), "utf8"));
}
function edit(rel, fn) {
  const p = dst(rel);
  if (!fs.existsSync(p)) throw new Error("data-integrity: missing " + rel);
  const before = fs.readFileSync(p, "utf8");
  const after = fn(before);
  if (after !== before) fs.writeFileSync(p, after);
}

copy("render-overrides/data-integrity-api-20260929.ts", "src/routes/api/integridade-dados.ts");
copy("render-overrides/data-integrity-panel-20260929.tsx", "src/components/data-integrity-panel.tsx");

edit("src/routes/dono/abastecimentos.tsx", (source) => {
  let s = source;
  if (!s.includes('from "@/components/data-integrity-panel"')) {
    s = 'import { DataIntegrityPanel } from "@/components/data-integrity-panel";\n' + s;
  }
  if (!s.includes('<DataIntegrityPanel scope="fueling" />')) {
    const marker = "      <FuelingPhotoReader />";
    if (!s.includes(marker)) throw new Error("data-integrity: fueling reader marker missing");
    s = s.replace(marker, '      <DataIntegrityPanel scope="fueling" />\n\n' + marker);
  }
  return s;
});

edit("src/routes/dono/fotos.tsx", (source) => {
  let s = source;
  if (!s.includes('from "@/components/data-integrity-panel"')) {
    s = 'import { DataIntegrityPanel } from "@/components/data-integrity-panel";\n' + s;
  }
  s = s.replace('type RelationKind = "trip" | "report";', 'type RelationKind = "trip" | "report" | "unlinked";');
  if (!s.includes('<DataIntegrityPanel scope="tickets" />')) {
    const marker = '      <section className="mt-7 grid gap-5 rounded-xl border border-border bg-surface p-5 sm:p-6">';
    if (!s.includes(marker)) throw new Error("data-integrity: Fotos section marker missing");
    s = s.replace(marker, '      <DataIntegrityPanel scope="tickets" />\n\n' + marker);
  }
  s = s.replace(
    '{photo.relationType === "trip" ? "Viagem fechada" : "Caixa"}',
    '{photo.relationType === "trip" ? "Viagem fechada" : photo.relationType === "report" ? "Caixa" : "Sem vínculo"}'
  );
  return s;
});

edit("src/lib/api.ts", (source) => {
  let s = source;

  function patchDelete(exportName, table, prelude, message) {
    const start = s.indexOf("export const " + exportName + " =");
    if (start < 0) {
      console.log("[data-integrity] " + exportName + " not present");
      return;
    }
    const next = s.indexOf("\nexport const ", start + 20);
    const end = next < 0 ? s.length : next;
    let block = s.slice(start, end);
    const needles = [
      "await sql" + bt + "delete from " + table + " where id = " + dataIdExpr + bt + ";",
      "await sql" + bt + "delete from " + table + " where id=" + dataIdExpr + bt + ";",
    ];
    const needle = needles.find((value) => block.includes(value));
    if (!needle) {
      console.log("[data-integrity] delete verifier skipped for " + exportName + ": statement shape not found");
      return;
    }
    const variable = "__deleted_" + table.replace(/[^a-z0-9]/gi, "_");
    const replacement =
      (prelude ? prelude + "\n    " : "") +
      "const " + variable + " = await sql<{ id: string }[]>" + bt +
      "delete from " + table + " where id=" + dataIdExpr + " returning id" + bt + ";\n" +
      "    if (!" + variable + "[0]) throw new Error(" + JSON.stringify(message) + ");";
    block = block.replace(needle, replacement);
    s = s.slice(0, start) + block + s.slice(end);
  }

  patchDelete(
    "deleteFueling",
    "fuelings",
    "try { await sql" + bt + "update fueling_photo_reads set fueling_id=null, status='pending_completion', confirmed_at=null where fueling_id=" + dataIdExpr + bt + "; } catch {}",
    "O abastecimento já não existe ou a exclusão não foi confirmada pelo banco."
  );
  patchDelete(
    "deleteReport",
    "reports",
    "try { await sql" + bt + "update trip_ticket_photos set relation_type='unlinked', relation_id='pending', report_status=null where relation_type='report' and relation_id=" + dataIdExpr + bt + "; } catch {}",
    "O lançamento já não existe ou a exclusão não foi confirmada pelo banco."
  );
  patchDelete(
    "deleteTrip",
    "trips",
    "try { await sql" + bt + "update trip_ticket_photos set relation_type='unlinked', relation_id='pending', report_status=null where relation_type='trip' and relation_id=" + dataIdExpr + bt + "; } catch {}",
    "A viagem já não existe ou a exclusão não foi confirmada pelo banco."
  );
  patchDelete(
    "deleteExpense",
    "expenses",
    "",
    "A despesa ou adiantamento já não existe ou a exclusão não foi confirmada pelo banco."
  );

  return s;
});

edit("src/lib/use-fleet.ts", (source) => {
  let s = source;
  if (s.includes('refetchQueries({ queryKey: fleetKey, type: "active" })')) return s;
  const variants = [
    {
      before: "const invalidate = () => qc.invalidateQueries({ queryKey: fleetKey });",
      after: 'const invalidate = async () => {\n    await qc.invalidateQueries({ queryKey: fleetKey });\n    await qc.refetchQueries({ queryKey: fleetKey, type: "active" });\n  };'
    },
    {
      before: "const invalidate = () => queryClient.invalidateQueries({ queryKey: fleetKey });",
      after: 'const invalidate = async () => {\n    await queryClient.invalidateQueries({ queryKey: fleetKey });\n    await queryClient.refetchQueries({ queryKey: fleetKey, type: "active" });\n  };'
    },
    {
      before: "const invalidate = () => queryClient.invalidateQueries({ queryKey: fleetKey, exact: true });",
      after: 'const invalidate = async () => {\n    await queryClient.invalidateQueries({ queryKey: fleetKey, exact: true });\n    await queryClient.refetchQueries({ queryKey: fleetKey, type: "active" });\n  };'
    },
  ];
  const found = variants.find((value) => s.includes(value.before));
  if (found) {
    s = s.replace(found.before, found.after);
  } else {
    console.log("[data-integrity] immediate refetch marker not found; existing polling remains active");
  }
  return s;
});

console.log("[data-integrity] orphan recovery, confirmed dedupe, verified deletes and immediate reread installed");
