import fs from 'node:fs';
import path from 'node:path';

const target = process.argv[2];
if (!target || !fs.existsSync(target)) {
  throw new Error('apply-freight-prices: target source directory missing');
}
const repo = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');

function read(rel) {
  return fs.readFileSync(path.join(target, rel), 'utf8');
}
function write(rel, content) {
  const file = path.join(target, rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
}
function replaceOnce(text, before, after, label) {
  if (!text.includes(before)) throw new Error(`apply-freight-prices: pattern not found (${label})`);
  return text.replace(before, after);
}

// Types: use a complete, known-good type surface so the global prices are part
// of the same FleetState fetched by every management screen.
fs.copyFileSync(
  path.join(repo, 'render-overrides', 'freight-prices-types.ts'),
  path.join(target, 'src', 'lib', 'types.ts'),
);

// Database migration. Seed each mode from the newest existing non-zero trip so
// a deploy does not silently change existing accounting before Gerência saves.
fs.copyFileSync(
  path.join(repo, 'render-overrides', '0007_freight_prices.sql'),
  path.join(target, 'migrations', '0007_freight_prices.sql'),
);

// Server API: fetch prices with FleetState, allow admin to save them, enforce
// them on every Cegonha/Caixinha trip, and update existing trips so every KPI,
// PDF and Excel uses the same current configured value automatically.
{
  let s = read('src/lib/api.ts');
  s = replaceOnce(
    s,
    '  FleetState,\n  FreightMode,',
    '  FleetState,\n  FreightMode,\n  FreightPrices,',
    'api import FreightPrices',
  );
  s = replaceOnce(
    s,
    '\nfunction mapDriver(r: Record<string, unknown>): Driver {',
    `\nfunction mapFreightPrices(rows: Record<string, unknown>[]): FreightPrices {\n  const prices: FreightPrices = { cegonha: 0, caixinha: 0 };\n  for (const row of rows) {\n    const mode = str(row.mode);\n    if (mode === "cegonha" || mode === "caixinha") {\n      prices[mode] = num(row.price);\n    }\n  }\n  return prices;\n}\n\nasync function getConfiguredTripPrice(\n  sql: Awaited<ReturnType<typeof getSql>>,\n  mode: "cegonha" | "caixinha",\n) {\n  const rows = await sql<Record<string, unknown>>\`\n    select price from freight_prices where mode = \${mode} limit 1\n  \`;\n  return num(rows[0]?.price);\n}\n\nfunction mapDriver(r: Record<string, unknown>): Driver {`,
    'api price helpers',
  );
  s = replaceOnce(
    s,
    '    freightMode: freightMode(r.freight_mode),\n    pricePerTon:',
    '    freightMode: freightMode(r.freight_mode),\n    tripBillingType: str(r.trip_billing_type) === "weight" ? "weight" : "fixed",\n    pricePerTon:',
    'api mapTrip tripBillingType',
  );
  s = replaceOnce(
    s,
    `    const [drivers, fleets, trips, reports, fuelings, expenses] = await Promise.all([\n      sql<Record<string, unknown>>\`select * from drivers order by name\`,\n      sql<Record<string, unknown>>\`select * from fleets order by name\`,\n      sql<Record<string, unknown>>\`select * from trips order by date desc, code desc\`,\n      sql<Record<string, unknown>>\`select * from reports order by created_at desc\`,\n      sql<Record<string, unknown>>\`select * from fuelings order by date desc, created_at desc\`,\n      sql<Record<string, unknown>>\`select * from expenses order by date desc, created_at desc\`,\n    ]);`,
    `    const [drivers, fleets, trips, reports, fuelings, expenses, freightPriceRows] = await Promise.all([\n      sql<Record<string, unknown>>\`select * from drivers order by name\`,\n      sql<Record<string, unknown>>\`select * from fleets order by name\`,\n      sql<Record<string, unknown>>\`select * from trips order by date desc, code desc\`,\n      sql<Record<string, unknown>>\`select * from reports order by created_at desc\`,\n      sql<Record<string, unknown>>\`select * from fuelings order by date desc, created_at desc\`,\n      sql<Record<string, unknown>>\`select * from expenses order by date desc, created_at desc\`,\n      sql<Record<string, unknown>>\`select mode, price from freight_prices\`,\n    ]);`,
    'api getFleetState query',
  );
  s = replaceOnce(
    s,
    '      expenses: expenses.map(mapExpense),\n    };',
    '      expenses: expenses.map(mapExpense),\n      freightPrices: mapFreightPrices(freightPriceRows),\n    };',
    'api getFleetState return',
  );
  s = replaceOnce(
    s,
    '\nconst driverSchema = z.object({',
    `\nconst freightPricesSchema = z.object({\n  cegonha: z.number().positive("Informe um valor maior que zero para Cegonha"),\n  caixinha: z.number().positive("Informe um valor maior que zero para Caixinha"),\n});\n\nexport const upsertFreightPrices = createServerFn({ method: "POST" })\n  .validator(freightPricesSchema)\n  .handler(async ({ data }) => {\n    await requireManagement();\n    const sql = await getSql();\n\n    await sql\`\n      insert into freight_prices (mode, price, updated_at)\n      values ('cegonha', \${data.cegonha}, now())\n      on conflict (mode) do update set\n        price = excluded.price,\n        updated_at = excluded.updated_at\n    \`;\n    await sql\`\n      insert into freight_prices (mode, price, updated_at)\n      values ('caixinha', \${data.caixinha}, now())\n      on conflict (mode) do update set\n        price = excluded.price,\n        updated_at = excluded.updated_at\n    \`;\n\n    // Gerência definiu estes dois modos como preços globais atuais. Atualizar\n    // as viagens existentes faz painel, totais, PDF e Excel mudarem juntos.\n    await sql\`update trips set price_per_trip = \${data.cegonha} where freight_mode = 'cegonha'\`;\n    await sql\`update trips set price_per_trip = \${data.caixinha} where freight_mode = 'caixinha'\`;\n\n    return { ok: true, freightPrices: data };\n  });\n\nconst driverSchema = z.object({`,
    'api save price endpoint',
  );
  s = replaceOnce(
    s,
    '      const driverId = str(report.driver_id);\n\n      await sql`',
    `      const driverId = str(report.driver_id);\n      const configuredPrice =\n        reportFreightMode === "cegonha" || reportFreightMode === "caixinha"\n          ? await getConfiguredTripPrice(sql, reportFreightMode)\n          : 0;\n      if (\n        (reportFreightMode === "cegonha" || reportFreightMode === "caixinha") &&\n        configuredPrice <= 0\n      ) {\n        needsReview += 1;\n        continue;\n      }\n\n      await sql\``,
    'api accepted report global price',
  );
  s = replaceOnce(
    s,
    '${tons}, 0, ${tons}, ${reportFreightMode}, 0, 0,\n          ${kmStart}',
    '${tons}, 0, ${tons}, ${reportFreightMode}, 0, ${configuredPrice},\n          ${kmStart}',
    'api accepted report insert price',
  );
  s = replaceOnce(
    s,
    '  freightMode: z.enum(["ton", "trip", "cegonha", "caixinha"]),\n  pricePerTon:',
    '  freightMode: z.enum(["ton", "trip", "cegonha", "caixinha"]),\n  tripBillingType: z.enum(["weight", "fixed"]).optional().default("fixed"),\n  pricePerTon:',
    'api trip schema billing type',
  );
  s = replaceOnce(
    s,
    '    const code = data.code.toUpperCase();\n    await sql`',
    `    const code = data.code.toUpperCase();\n    const pricePerTrip =\n      data.freightMode === "cegonha" || data.freightMode === "caixinha"\n        ? await getConfiguredTripPrice(sql, data.freightMode)\n        : data.pricePerTrip;\n    if (\n      (data.freightMode === "cegonha" || data.freightMode === "caixinha") &&\n      pricePerTrip <= 0\n    ) {\n      throw new Error(\n        \`Configure o preço de \${data.freightMode === "cegonha" ? "Cegonha" : "Caixinha"} em Cadastros > Preços de frete antes de salvar a viagem.\`,\n      );\n    }\n    await sql\``,
    'api upsertTrip global price',
  );
  s = replaceOnce(
    s,
    '${data.netWeight}, ${data.freightMode}, ${data.tripBillingType}, ${data.pricePerTon}, ${data.pricePerTrip},',
    '${data.netWeight}, ${data.freightMode}, ${data.tripBillingType}, ${data.pricePerTon}, ${pricePerTrip},',
    'api trip insert global price',
  );
  write('src/lib/api.ts', s);
}

// React Query mutation: saving a price invalidates the same FleetState query so
// every open management screen refreshes within the existing shared data flow.
{
  let s = read('src/lib/use-fleet.ts');
  s = replaceOnce(
    s,
    '  upsertFleet,\n  upsertFueling,',
    '  upsertFleet,\n  upsertFreightPrices,\n  upsertFueling,',
    'use-fleet import',
  );
  s = replaceOnce(
    s,
    '  const removeFueling = useMutation({',
    `  const freightPrices = useMutation({\n    mutationFn: (data: Parameters<typeof upsertFreightPrices>[0]["data"]) =>\n      upsertFreightPrices({ data }),\n    onSuccess: invalidate,\n  });\n  const removeFueling = useMutation({`,
    'use-fleet mutation',
  );
  s = replaceOnce(
    s,
    '    fueling,\n    removeFueling,',
    '    fueling,\n    freightPrices,\n    removeFueling,',
    'use-fleet return',
  );
  write('src/lib/use-fleet.ts', s);
}

// Trip form: Cegonha/Caixinha become read-only automatic values tied to the
// Gerência setting. Generic "Por viagem" remains manually editable.
{
  let s = read('src/components/owner/trip-form.tsx');
  s = replaceOnce(s, 'import { useMemo, useState } from "react";', 'import { useEffect, useMemo, useState } from "react";', 'trip-form useEffect');
  s = replaceOnce(
    s,
    'import type { Driver, Fleet, FreightMode, Trip } from "@/lib/types";',
    'import type { Driver, Fleet, FreightMode, Trip, TripBillingType } from "@/lib/types";',
    'trip-form TripBillingType import',
  );
  s = replaceOnce(
    s,
    'import { cn } from "@/lib/utils";',
    'import { useFleet } from "@/lib/use-fleet";\nimport { cn } from "@/lib/utils";',
    'trip-form useFleet import',
  );
  s = replaceOnce(
    s,
    '  const [form, setForm] = useState<TripDraft>(initial);\n',
    `  const [form, setForm] = useState<TripDraft>(initial);\n  const { data: fleetState } = useFleet();\n  const globalPrices = fleetState?.freightPrices ?? { cegonha: 0, caixinha: 0 };\n\n  useEffect(() => {\n    if (form.freightMode !== "cegonha" && form.freightMode !== "caixinha") return;\n    const currentPrice = globalPrices[form.freightMode];\n    const nextValue = currentPrice > 0 ? String(currentPrice) : "";\n    setForm((current) =>\n      current.pricePerTrip === nextValue\n        ? current\n        : { ...current, pricePerTrip: nextValue },\n    );\n  }, [form.freightMode, globalPrices.cegonha, globalPrices.caixinha]);\n`,
    'trip-form global price state',
  );
  s = replaceOnce(
    s,
    '              onClick={() =>\n                setForm((f) => ({ ...f, freightMode: opt.key }))\n              }',
    `              onClick={() =>\n                setForm((f) => ({\n                  ...f,\n                  freightMode: opt.key,\n                  pricePerTrip:\n                    opt.key === "cegonha"\n                      ? String(globalPrices.cegonha || "")\n                      : opt.key === "caixinha"\n                        ? String(globalPrices.caixinha || "")\n                        : f.pricePerTrip,\n                }))\n              }`,
    'trip-form mode button',
  );
  s = replaceOnce(
    s,
    '              ? "Cegonha: valor bruto por viagem feita, independente das toneladas."\n              : form.freightMode === "caixinha"\n                ? "Caixinha: valor bruto por viagem feita, independente das toneladas."',
    '              ? `Cegonha: valor automático definido pela Gerência (${brl(globalPrices.cegonha)}) por viagem.`\n              : form.freightMode === "caixinha"\n                ? `Caixinha: valor automático definido pela Gerência (${brl(globalPrices.caixinha)}) por viagem.`',
    'trip-form helper copy',
  );
  s = replaceOnce(
    s,
    `        {form.freightMode !== "ton" ? (\n          <Field label={\`Valor por viagem\${form.freightMode === "trip" ? "" : \` — \${form.freightMode === "cegonha" ? "Cegonha" : "Caixinha"}\`}\`}>\n            <Input\n              inputMode="decimal"\n              value={form.pricePerTrip}\n              onChange={(e) => set("pricePerTrip", e.target.value)}\n              placeholder="0,00"\n            />\n          </Field>\n        ) : (`,
    `        {form.freightMode !== "ton" ? (\n          <Field\n            label={\n              form.freightMode === "trip"\n                ? "Valor por viagem"\n                : \`Preço automático — \${form.freightMode === "cegonha" ? "Cegonha" : "Caixinha"}\`\n            }\n          >\n            <Input\n              inputMode="decimal"\n              value={form.pricePerTrip}\n              onChange={(e) => set("pricePerTrip", e.target.value)}\n              placeholder="0,00"\n              readOnly={form.freightMode === "cegonha" || form.freightMode === "caixinha"}\n            />\n          </Field>\n        ) : (`,
    'trip-form automatic input',
  );
  write('src/components/owner/trip-form.tsx', s);
}

// Management UI: third Cadastros tab where admin enters both prices. Saving
// explicitly explains the automatic recalculation of existing records/reports.
{
  let s = read('src/routes/dono/cadastros.tsx');
  s = replaceOnce(
    s,
    'import type { Driver, Fleet } from "@/lib/types";',
    'import type { Driver, Fleet, FreightPrices } from "@/lib/types";',
    'cadastros type import',
  );
  s = replaceOnce(
    s,
    '  const [tab, setTab] = useState<"motoristas" | "conjuntos">("motoristas");',
    '  const [tab, setTab] = useState<"motoristas" | "conjuntos" | "fretes">("motoristas");',
    'cadastros tab type',
  );
  s = replaceOnce(
    s,
    '      <div className="mt-6 flex gap-1 rounded-lg border border-border bg-surface p-1 w-fit">',
    '      <div className="mt-6 flex w-full flex-wrap gap-1 rounded-lg border border-border bg-surface p-1 sm:w-fit">',
    'cadastros mobile tabs',
  );
  s = replaceOnce(
    s,
    '            ["motoristas", "Motoristas"],\n            ["conjuntos", "Conjuntos"],',
    '            ["motoristas", "Motoristas"],\n            ["conjuntos", "Conjuntos"],\n            ["fretes", "Preços frete"],',
    'cadastros price tab',
  );
  s = replaceOnce(
    s,
    '              "h-9 rounded-md px-4 text-sm",',
    '              "h-9 flex-1 rounded-md px-3 text-sm sm:flex-none sm:px-4",',
    'cadastros responsive tab button',
  );
  s = replaceOnce(s, '      ) : (\n        <section className="mt-6">', '      ) : tab === "conjuntos" ? (\n        <section className="mt-6">', 'cadastros nested tab');
  s = replaceOnce(
    s,
    '          </ul>\n        </section>\n      )}\n\n      <DriverDialog',
    '          </ul>\n        </section>\n      ) : (\n        <FreightPricesPanel current={data?.freightPrices} />\n      )}\n\n      <DriverDialog',
    'cadastros price panel render',
  );
  s = replaceOnce(
    s,
    '\nfunction DriverDialog({',
    `\nfunction FreightPricesPanel({\n  current,\n}: {\n  current?: FreightPrices;\n}) {\n  const { freightPrices } = useFleetMutations();\n  const [cegonha, setCegonha] = useState("");\n  const [caixinha, setCaixinha] = useState("");\n\n  useEffect(() => {\n    if (!current) return;\n    setCegonha(current.cegonha > 0 ? String(current.cegonha) : "");\n    setCaixinha(current.caixinha > 0 ? String(current.caixinha) : "");\n  }, [current?.cegonha, current?.caixinha]);\n\n  return (\n    <section className="mt-6 max-w-3xl">\n      <div className="rounded-xl border border-accent bg-surface p-5">\n        <p className="text-[11px] uppercase tracking-[0.16em] text-muted">\n          Valores automáticos\n        </p>\n        <h2 className="mt-1 font-display text-2xl font-semibold">\n          Preços por viagem\n        </h2>\n        <p className="mt-2 text-sm text-muted">\n          Defina aqui o valor atual de Cegonha e Caixinha. Ao salvar, o sistema\n          aplica os valores automaticamente nas viagens dessas modalidades e\n          atualiza painel, totais, PDF e Excel.\n        </p>\n\n        <form\n          className="mt-5 grid gap-4"\n          onSubmit={async (e) => {\n            e.preventDefault();\n            const next = {\n              cegonha: parseLocaleNumberOrZero(cegonha),\n              caixinha: parseLocaleNumberOrZero(caixinha),\n            };\n            if (next.cegonha <= 0 || next.caixinha <= 0) {\n              toast.error("Informe valores maiores que zero para Cegonha e Caixinha.");\n              return;\n            }\n            try {\n              await freightPrices.mutateAsync(next);\n              toast.success("Preços de Cegonha e Caixinha atualizados em todo o sistema.");\n            } catch (err) {\n              toast.error(\n                err instanceof Error\n                  ? err.message\n                  : "Não foi possível atualizar os preços de frete.",\n              );\n            }\n          }}\n        >\n          <div className="grid gap-4 sm:grid-cols-2">\n            <Field label="Cegonha — valor por viagem (R$)">\n              <Input\n                inputMode="decimal"\n                value={cegonha}\n                onChange={(e) => setCegonha(e.target.value)}\n                placeholder="0,00"\n              />\n            </Field>\n            <Field label="Caixinha — valor por viagem (R$)">\n              <Input\n                inputMode="decimal"\n                value={caixinha}\n                onChange={(e) => setCaixinha(e.target.value)}\n                placeholder="0,00"\n              />\n            </Field>\n          </div>\n\n          <div className="rounded-lg border border-border bg-bg px-4 py-3 text-sm text-muted">\n            <strong className="text-fg">Atualização automática:</strong>{" "}\n            alterar um valor aqui recalcula também as viagens já lançadas dessa\n            modalidade. O modo comum “Por viagem” continua com valor manual.\n          </div>\n\n          <div className="flex justify-end">\n            <Button type="submit" disabled={freightPrices.isPending}>\n              {freightPrices.isPending ? "Atualizando…" : "Salvar preços"}\n            </Button>\n          </div>\n        </form>\n      </div>\n    </section>\n  );\n}\n\nfunction DriverDialog({`,
    'cadastros price panel component',
  );
  write('src/routes/dono/cadastros.tsx', s);
}

for (const [rel, required] of [
  ['src/lib/api.ts', ['upsertFreightPrices', 'update trips set price_per_trip', 'getConfiguredTripPrice']],
  ['src/lib/use-fleet.ts', ['freightPrices']],
  ['src/components/owner/trip-form.tsx', ['Preço automático', 'globalPrices']],
  ['src/routes/dono/cadastros.tsx', ['Preços frete', 'FreightPricesPanel']],
  ['src/lib/types.ts', ['freightPrices: FreightPrices']],
]) {
  const text = read(rel);
  for (const marker of required) {
    if (!text.includes(marker)) throw new Error(`apply-freight-prices: ${rel} missing ${marker}`);
  }
}

console.log('[freight-prices] Cegonha/Caixinha centralized prices applied');
