import fs from "node:fs";
import path from "node:path";

const target = process.argv[2];
if (!target || !fs.existsSync(target)) throw new Error("trip-data-integrity: target missing");

function edit(rel, fn) {
  const file = path.join(target, rel);
  if (!fs.existsSync(file)) return;
  const before = fs.readFileSync(file, "utf8");
  const after = fn(before);
  if (after !== before) fs.writeFileSync(file, after);
}

// Preserve the entered precision everywhere. Formatting must never reduce a
// tonnage value to one decimal or an integer.
for (const rel of [
  "src/routes/dono/lancamentos.tsx",
  "src/routes/motorista.tsx",
  "src/routes/dono/viagens.tsx",
  "src/routes/dono/totais.tsx",
]) {
  edit(rel, (s) => s.replace(/num\(r\.tons,\s*1\)/g, "num(r.tons, 2)"));
}

edit("src/lib/format.ts", (s) => s.replace(
  /const numFmt = new Intl\.NumberFormat\("pt-BR", \{[\s\S]*?\}\);/m,
  'const numFmt = new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });',
));

// A valid driver launch without an explicit mode must still be closable when
// it contains a weight. Treat it as tonnage mode without changing the saved
// weight; the manager can set its R$/t in the trip editor.
edit("src/lib/api.ts", (s) => s.replace(
  'const reportFreightMode = nullableFreightMode(report.freight_mode);\n      if (!reportFreightMode) {\n        needsReview += 1;\n        continue;\n      }',
  'const reportFreightMode = nullableFreightMode(report.freight_mode) ?? (tons > 0 ? "ton" : null);\n      if (!reportFreightMode) {\n        needsReview += 1;\n        continue;\n      }',
));

// A retry from Caixa must update the trip previously linked to the report
// instead of creating a second row with the same ticket.
edit("src/lib/api.ts", (s) => s.replace(
  '    const id = data.id?.trim() || newId("trip");\n    const code = data.code.toUpperCase();',
  '    const code = data.code.toUpperCase();\n    const linked = data.reportId\n      ? await sql<{ trip_id: string | null }>`select trip_id from reports where id = ${data.reportId} limit 1`\n      : [];\n    const linkedTripId = String(linked[0]?.trip_id ?? "").trim();\n    const sameTicket = data.reportId\n      ? await sql<{ id: string }>`select id from trips where code = ${code} limit 1`\n      : [];\n    const sameTicketId = String(sameTicket[0]?.id ?? "").trim();\n    const id = data.id?.trim() || linkedTripId || sameTicketId || newId("trip");',
));

// Never leave the user without feedback when the server rejects a close.
edit("src/routes/dono/lancamentos.tsx", (s) => s.replace(
  '              onSubmit={async (payload) => {\n                await trip.mutateAsync(payload);\n                toast.success(`Viagem ${payload.code} lançada.`);\n                setOpen(null);\n              }}',
  '              onSubmit={async (payload) => {\n                try {\n                  await trip.mutateAsync(payload);\n                  toast.success(`Viagem ${payload.code} lançada.`);\n                  setOpen(null);\n                } catch (err) {\n                  toast.error(err instanceof Error ? err.message : "Não foi possível lançar a viagem no painel.");\n                }\n              }}',
));

// Closing a Caixa launch must persist the operational trip even when the
// driver did not provide a price per ton. Keep zero as an explicit pending
// financial value instead of rejecting the whole trip; management can edit
// the R$/t later without losing the launch.
edit("src/lib/api.ts", (s) => s.replace(
  '    if (data.freightMode === "ton" && data.pricePerTon <= 0) {\n      throw new Error("Informe o preço R$/t desta viagem.");\n    }\n',
  '    // R$/t pode ser preenchido posteriormente pela Gerência; não bloquear o fechamento da Caixa.\n',
));

console.log("[trip-data-integrity] exact tonnage display + robust trip closing applied");
