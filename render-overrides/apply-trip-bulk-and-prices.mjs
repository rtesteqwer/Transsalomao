import fs from 'node:fs';
import path from 'node:path';

const target = process.argv[2];
if (!target || !fs.existsSync(target)) throw new Error('apply-trip-bulk-and-prices: target missing');
const repo = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');

function p(rel) { return path.join(target, rel); }
function read(rel) { return fs.readFileSync(p(rel), 'utf8'); }
function write(rel, text) { fs.writeFileSync(p(rel), text); }
function replaceRequired(text, search, replacement, label) {
  const next = text.replace(search, replacement);
  if (next === text) throw new Error(`apply-trip-bulk-and-prices: pattern not found (${label})`);
  return next;
}

fs.copyFileSync(
  path.join(repo, 'render-overrides', '0009_trip_prices_without_global_ton.sql'),
  p('migrations/0009_trip_prices_without_global_ton.sql'),
);

// Shared types: only fixed-per-trip modes are globally priced.
{
  let s = read('src/lib/types.ts');
  s = replaceRequired(
    s,
    /export type FreightPrices = \{\n\s*cegonha: number;\n\s*caixinha: number;\n\};/,
    'export type FreightPrices = {\n  trip: number;\n  cegonha: number;\n  caixinha: number;\n};',
    'FreightPrices trip mode',
  );
  write('src/lib/types.ts', s);
}

// API: Por tonelada stays individual; Por viagem/Cegonha/Caixinha are global.
{
  let s = read('src/lib/api.ts');
  s = replaceRequired(
    s,
    'const prices: FreightPrices = { cegonha: 0, caixinha: 0 };',
    'const prices: FreightPrices = { trip: 0, cegonha: 0, caixinha: 0 };',
    'price defaults',
  );
  s = replaceRequired(
    s,
    'if (mode === "cegonha" || mode === "caixinha") {',
    'if (mode === "trip" || mode === "cegonha" || mode === "caixinha") {',
    'mapped price modes',
  );
  s = replaceRequired(
    s,
    '  mode: "cegonha" | "caixinha",',
    '  mode: "trip" | "cegonha" | "caixinha",',
    'configured mode type',
  );
  s = replaceRequired(
    s,
    'const freightPricesSchema = z.object({\n  cegonha: z.number().positive("Informe um valor maior que zero para Cegonha"),\n  caixinha: z.number().positive("Informe um valor maior que zero para Caixinha"),\n});',
    'const freightPricesSchema = z.object({\n  trip: z.number().positive("Informe um valor maior que zero para Por viagem"),\n  cegonha: z.number().positive("Informe um valor maior que zero para Cegonha"),\n  caixinha: z.number().positive("Informe um valor maior que zero para Caixinha"),\n});',
    'price schema',
  );

  const cegonhaInsert = `    await sql\`\n      insert into freight_prices (mode, price, updated_at)\n      values ('cegonha', \${data.cegonha}, now())\n      on conflict (mode) do update set\n        price = excluded.price,\n        updated_at = excluded.updated_at\n    \`;`;
  const tripAndCegonha = `    await sql\`\n      insert into freight_prices (mode, price, updated_at)\n      values ('trip', \${data.trip}, now())\n      on conflict (mode) do update set\n        price = excluded.price,\n        updated_at = excluded.updated_at\n    \`;\n${cegonhaInsert}`;
  s = replaceRequired(s, cegonhaInsert, tripAndCegonha, 'trip price upsert');

  s = replaceRequired(
    s,
    `    // Gerência definiu estes dois modos como preços globais atuais. Atualizar\n    // as viagens existentes faz painel, totais, PDF e Excel mudarem juntos.\n    await sql\`update trips set price_per_trip = \${data.cegonha} where freight_mode = 'cegonha'\`;\n    await sql\`update trips set price_per_trip = \${data.caixinha} where freight_mode = 'caixinha'\`;`,
    `    // Modos de valor fixo usam o preço atual da Gerência também no histórico.\n    // Por tonelada nunca é alterado aqui: cada viagem mantém seu próprio R$/t.\n    await sql\`update trips set price_per_trip = \${data.trip} where freight_mode = 'trip'\`;\n    await sql\`update trips set price_per_trip = \${data.cegonha} where freight_mode = 'cegonha'\`;\n    await sql\`update trips set price_per_trip = \${data.caixinha} where freight_mode = 'caixinha'\`;`,
    'historical global update',
  );

  s = replaceRequired(
    s,
    `      const configuredPrice =\n        reportFreightMode === "cegonha" || reportFreightMode === "caixinha"\n          ? await getConfiguredTripPrice(sql, reportFreightMode)\n          : 0;\n      if (\n        (reportFreightMode === "cegonha" || reportFreightMode === "caixinha") &&\n        configuredPrice <= 0\n      ) {`,
    `      const usesGlobalPrice =\n        reportFreightMode === "trip" || reportFreightMode === "cegonha" || reportFreightMode === "caixinha";\n      const configuredPrice = usesGlobalPrice\n        ? await getConfiguredTripPrice(sql, reportFreightMode)\n        : 0;\n      if (usesGlobalPrice && configuredPrice <= 0) {`,
    'accepted report global modes',
  );

  s = replaceRequired(
    s,
    `    const pricePerTrip =\n      data.freightMode === "cegonha" || data.freightMode === "caixinha"\n        ? await getConfiguredTripPrice(sql, data.freightMode)\n        : data.pricePerTrip;\n    if (\n      (data.freightMode === "cegonha" || data.freightMode === "caixinha") &&\n      pricePerTrip <= 0\n    ) {\n      throw new Error(\n        \`Configure o preço de \${data.freightMode === "cegonha" ? "Cegonha" : "Caixinha"} em Cadastros > Preços de frete antes de salvar a viagem.\`,\n      );\n    }`,
    `    const usesGlobalPrice = data.freightMode !== "ton";\n    const pricePerTrip = usesGlobalPrice\n      ? await getConfiguredTripPrice(sql, data.freightMode)\n      : 0;\n    if (usesGlobalPrice && pricePerTrip <= 0) {\n      const label = data.freightMode === "trip" ? "Por viagem" : data.freightMode === "cegonha" ? "Cegonha" : "Caixinha";\n      throw new Error(\`Configure o preço de \${label} em Cadastros > Preços frete antes de salvar a viagem.\`);\n    }\n    if (data.freightMode === "ton" && data.pricePerTon <= 0) {\n      throw new Error("Informe o preço R$/t desta viagem.");\n    }`,
    'trip price selection',
  );

  s = replaceRequired(
    s,
    '    if (data.reportId) {\n      await sql`update reports set status = \'aceito\', trip_id = ${id} where id = ${data.reportId}`;\n    }',
    `    // Se esta viagem veio de um lançamento, manter o lançamento sincronizado\n    // com qualquer edição individual ou em lote feita na tela Viagens.\n    await sql\`\n      update reports set\n        ticket = \${code},\n        driver_id = \${data.driverId},\n        fleet_id = \${data.fleetId},\n        km = \${data.kmEnd},\n        tons = \${data.netWeight},\n        freight_mode = \${data.freightMode}\n      where trip_id = \${id}\n    \`;\n    if (data.reportId) {\n      await sql\`update reports set status = 'aceito', trip_id = \${id} where id = \${data.reportId}\`;\n    }`,
    'linked report sync',
  );

  s = replaceRequired(
    s,
    '    await sql`update reports set trip_id = null where trip_id = ${data.id}`;',
    "    await sql`update reports set trip_id = null, status = 'pendente' where trip_id = ${data.id}`;",
    'delete report sync',
  );
  write('src/lib/api.ts', s);
}

// Form: R$/t is editable per trip; fixed modes pull the current management price.
{
  let s = read('src/components/owner/trip-form.tsx');
  s = replaceRequired(
    s,
    '  const globalPrices = fleetState?.freightPrices ?? { cegonha: 0, caixinha: 0 };',
    '  const globalPrices = fleetState?.freightPrices ?? { trip: 0, cegonha: 0, caixinha: 0 };',
    'form global price defaults',
  );
  s = replaceRequired(
    s,
    `  useEffect(() => {\n    if (form.freightMode !== "cegonha" && form.freightMode !== "caixinha") return;\n    const currentPrice = globalPrices[form.freightMode];\n    const nextValue = currentPrice > 0 ? String(currentPrice) : "";\n    setForm((current) =>\n      current.pricePerTrip === nextValue\n        ? current\n        : { ...current, pricePerTrip: nextValue },\n    );\n  }, [form.freightMode, globalPrices.cegonha, globalPrices.caixinha]);`,
    `  useEffect(() => {\n    if (form.freightMode === "ton") return;\n    const currentPrice = globalPrices[form.freightMode];\n    const nextValue = currentPrice > 0 ? String(currentPrice) : "";\n    setForm((current) =>\n      current.pricePerTrip === nextValue\n        ? current\n        : { ...current, pricePerTrip: nextValue },\n    );\n  }, [form.freightMode, globalPrices.trip, globalPrices.cegonha, globalPrices.caixinha]);`,
    'form price synchronization',
  );
  s = replaceRequired(
    s,
    `              onClick={() =>\n                setForm((f) => ({\n                  ...f,\n                  freightMode: opt.key,\n                  pricePerTrip:\n                    opt.key === "cegonha"\n                      ? String(globalPrices.cegonha || "")\n                      : opt.key === "caixinha"\n                        ? String(globalPrices.caixinha || "")\n                        : f.pricePerTrip,\n                }))\n              }`,
    `              onClick={() =>\n                setForm((f) => ({\n                  ...f,\n                  freightMode: opt.key,\n                  pricePerTrip:\n                    opt.key === "ton"\n                      ? ""\n                      : String(\n                          opt.key === "trip"\n                            ? globalPrices.trip || ""\n                            : opt.key === "cegonha"\n                              ? globalPrices.cegonha || ""\n                              : globalPrices.caixinha || "",\n                        ),\n                }))\n              }`,
    'mode selector pricing',
  );
  s = replaceRequired(
    s,
    '? "Por tonelada: valor bruto = peso líquido × preço R$/t definido pela gerência."',
    '? "Por tonelada: informe o preço R$/t individualmente nesta viagem."',
    'ton helper text',
  );
  s = replaceRequired(
    s,
    ': "Por viagem: valor bruto por viagem feita, independente das toneladas."}',
    ': `Por viagem: valor automático definido pela Gerência (${brl(globalPrices.trip)}) por viagem.`}',
    'trip helper text',
  );
  s = replaceRequired(
    s,
    '? "Valor por viagem"',
    '? "Preço automático — Por viagem"',
    'trip field label',
  );
  s = replaceRequired(
    s,
    '              readOnly={form.freightMode === "cegonha" || form.freightMode === "caixinha"}',
    '              readOnly',
    'fixed price readonly',
  );
  write('src/components/owner/trip-form.tsx', s);
}

// Management price panel: trip/cegonha/caixinha only. Ton stays per-trip.
{
  let s = read('src/routes/dono/cadastros.tsx');
  s = replaceRequired(
    s,
    '  const [cegonha, setCegonha] = useState("");\n  const [caixinha, setCaixinha] = useState("");',
    '  const [tripPrice, setTripPrice] = useState("");\n  const [cegonha, setCegonha] = useState("");\n  const [caixinha, setCaixinha] = useState("");',
    'management state',
  );
  s = replaceRequired(
    s,
    '    setCegonha(current.cegonha > 0 ? String(current.cegonha) : "");\n    setCaixinha(current.caixinha > 0 ? String(current.caixinha) : "");\n  }, [current?.cegonha, current?.caixinha]);',
    '    setTripPrice(current.trip > 0 ? String(current.trip) : "");\n    setCegonha(current.cegonha > 0 ? String(current.cegonha) : "");\n    setCaixinha(current.caixinha > 0 ? String(current.caixinha) : "");\n  }, [current?.trip, current?.cegonha, current?.caixinha]);',
    'management load',
  );
  s = replaceRequired(
    s,
    '          Defina aqui o valor atual de Cegonha e Caixinha. Ao salvar, o sistema\n          aplica os valores automaticamente nas viagens dessas modalidades e\n          atualiza painel, totais, PDF e Excel.',
    '          Defina os valores globais de Por viagem, Cegonha e Caixinha. O preço\n          por tonelada é informado individualmente em cada viagem. Ao salvar, as\n          viagens antigas desses modos também são atualizadas em painel, PDF e Excel.',
    'management copy',
  );
  s = replaceRequired(
    s,
    '            const next = {\n              cegonha: parseLocaleNumberOrZero(cegonha),\n              caixinha: parseLocaleNumberOrZero(caixinha),\n            };\n            if (next.cegonha <= 0 || next.caixinha <= 0) {\n              toast.error("Informe valores maiores que zero para Cegonha e Caixinha.");',
    '            const next = {\n              trip: parseLocaleNumberOrZero(tripPrice),\n              cegonha: parseLocaleNumberOrZero(cegonha),\n              caixinha: parseLocaleNumberOrZero(caixinha),\n            };\n            if (next.trip <= 0 || next.cegonha <= 0 || next.caixinha <= 0) {\n              toast.error("Informe valores maiores que zero para Por viagem, Cegonha e Caixinha.");',
    'management payload',
  );
  s = replaceRequired(
    s,
    '              toast.success("Preços de Cegonha e Caixinha atualizados em todo o sistema.");',
    '              toast.success("Preços de Por viagem, Cegonha e Caixinha atualizados em todo o sistema.");',
    'management success',
  );
  s = replaceRequired(
    s,
    '          <div className="grid gap-4 sm:grid-cols-2">\n            <Field label="Cegonha — valor por viagem (R$)">',
    '          <div className="grid gap-4 sm:grid-cols-3">\n            <Field label="Por viagem — valor (R$)">\n              <Input\n                inputMode="decimal"\n                value={tripPrice}\n                onChange={(e) => setTripPrice(e.target.value)}\n                placeholder="0,00"\n              />\n            </Field>\n            <Field label="Cegonha — valor por viagem (R$)">',
    'management trip field',
  );
  s = replaceRequired(
    s,
    '            alterar um valor aqui recalcula também as viagens já lançadas dessa\n            modalidade. O modo comum “Por viagem” continua com valor manual.',
    '            alterar Por viagem, Cegonha ou Caixinha recalcula também as viagens\n            já lançadas desses modos. Por tonelada permanece individual por viagem.',
    'management note',
  );
  write('src/routes/dono/cadastros.tsx', s);
}

// Trips page: selectable trips with bulk edit/delete, using existing mutations.
{
  let s = read('src/routes/dono/viagens.tsx');
  s = replaceRequired(
    s,
    'import { Dialog, DialogContent } from "@/components/ui/dialog";\nimport { Input } from "@/components/ui/input";',
    'import { Dialog, DialogContent } from "@/components/ui/dialog";\nimport { Field } from "@/components/ui/field";\nimport { Input } from "@/components/ui/input";',
    'Field import',
  );
  s = replaceRequired(
    s,
    'import { downloadDriverReportPdf } from "@/lib/pdf";\nimport type { ComputedTrip } from "@/lib/types";',
    'import { downloadDriverReportPdf } from "@/lib/pdf";\nimport { parseLocaleNumberOrZero } from "@/lib/parse";\nimport type { ComputedTrip, Driver, Fleet, FreightMode, Trip } from "@/lib/types";',
    'bulk imports',
  );
  s = replaceRequired(
    s,
    '  const [editing, setEditing] = useState<TripDraft | null>(null);',
    '  const [editing, setEditing] = useState<TripDraft | null>(null);\n  const [selectedIds, setSelectedIds] = useState<string[]>([]);\n  const [bulkEditing, setBulkEditing] = useState(false);',
    'bulk state',
  );
  s = replaceRequired(
    s,
    '  const selectedDriver = data?.drivers.find((d) => d.id === driverFilter);',
    '  const selectedDriver = data?.drivers.find((d) => d.id === driverFilter);\n  const selectedTrips = data?.trips.filter((t) => selectedIds.includes(t.id)) ?? [];\n  const allVisibleSelected = rows.length > 0 && rows.every((t) => selectedIds.includes(t.id));',
    'bulk derived state',
  );
  s = replaceRequired(
    s,
    '  async function handleDeleteTrip(tripRow: ComputedTrip) {\n    if (!window.confirm(`Excluir a viagem ${tripRow.code}?`)) return;\n    try {\n      await removeTrip.mutateAsync(tripRow.id);\n      toast.success("Viagem excluída.");\n      if (editing?.id === tripRow.id) setEditing(null);\n    } catch (err) {\n      toast.error(err instanceof Error ? err.message : "Não foi possível excluir a viagem.");\n    }\n  }',
    `  async function handleDeleteTrip(tripRow: ComputedTrip) {\n    if (!window.confirm(\`Excluir a viagem \${tripRow.code}?\`)) return;\n    try {\n      await removeTrip.mutateAsync(tripRow.id);\n      setSelectedIds((ids) => ids.filter((id) => id !== tripRow.id));\n      toast.success("Viagem excluída.");\n      if (editing?.id === tripRow.id) setEditing(null);\n    } catch (err) {\n      toast.error(err instanceof Error ? err.message : "Não foi possível excluir a viagem.");\n    }\n  }\n\n  async function handleBulkDelete() {\n    if (selectedTrips.length === 0) return;\n    if (!window.confirm(\`Excluir \${selectedTrips.length} viagem(ns) selecionada(s)? Esta ação atualiza também totais e relatórios.\`)) return;\n    try {\n      for (const item of selectedTrips) await removeTrip.mutateAsync(item.id);\n      setSelectedIds([]);\n      setBulkEditing(false);\n      toast.success(\`\${selectedTrips.length} viagem(ns) excluída(s).\`);\n    } catch (err) {\n      toast.error(err instanceof Error ? err.message : "Não foi possível excluir todas as viagens selecionadas.");\n    }\n  }\n\n  async function handleBulkApply(changes: BulkTripChanges) {\n    if (selectedTrips.length === 0) return;\n    const numberOr = (value: string, current: number) => value.trim() ? parseLocaleNumberOrZero(value) : current;\n    try {\n      for (const source of selectedTrips) {\n        const freightMode = changes.freightMode || source.freightMode;\n        const pricePerTon = numberOr(changes.pricePerTon, source.pricePerTon);\n        if (freightMode === "ton" && pricePerTon <= 0) {\n          throw new Error(\`Informe o preço R$/t para a viagem \${source.code}.\`);\n        }\n        await trip.mutateAsync({\n          id: source.id,\n          code: source.code,\n          date: changes.date || source.date,\n          client: changes.client || source.client,\n          origin: changes.origin || source.origin,\n          destination: changes.destination || source.destination,\n          driverId: changes.driverId || source.driverId,\n          fleetId: changes.fleetId || source.fleetId,\n          loadedTons: numberOr(changes.loadedTons, source.loadedTons),\n          grossWeight: numberOr(changes.grossWeight, source.grossWeight),\n          netWeight: numberOr(changes.netWeight, source.netWeight),\n          freightMode,\n          tripBillingType: source.tripBillingType,\n          pricePerTon,\n          pricePerTrip: source.pricePerTrip,\n          kmStart: numberOr(changes.kmStart, source.kmStart),\n          kmEnd: numberOr(changes.kmEnd, source.kmEnd),\n          dieselLiters: numberOr(changes.dieselLiters, source.dieselLiters),\n          dieselPrice: numberOr(changes.dieselPrice, source.dieselPrice),\n        });\n      }\n      setBulkEditing(false);\n      setSelectedIds([]);\n      toast.success(\`\${selectedTrips.length} viagem(ns) atualizada(s).\`);\n    } catch (err) {\n      toast.error(err instanceof Error ? err.message : "Não foi possível editar todas as viagens selecionadas.");\n      throw err;\n    }\n  }`,
    'bulk handlers',
  );

  const selectionPanel = `\n      <section className="mt-6 rounded-xl border border-border bg-surface p-4">\n        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">\n          <div>\n            <p className="text-[11px] uppercase tracking-[0.16em] text-muted">Seleção em lote</p>\n            <p className="mt-1 text-sm text-fg">\n              {selectedTrips.length} viagem(ns) selecionada(s). Marque somente as que deseja alterar ou excluir.\n            </p>\n          </div>\n          <div className="flex flex-wrap gap-2">\n            <Button\n              size="sm"\n              variant="secondary"\n              onClick={() =>\n                setSelectedIds((ids) =>\n                  allVisibleSelected\n                    ? ids.filter((id) => !rows.some((row) => row.id === id))\n                    : Array.from(new Set([...ids, ...rows.map((row) => row.id)])),\n                )\n              }\n              disabled={rows.length === 0}\n            >\n              {allVisibleSelected ? "Desmarcar visíveis" : "Selecionar visíveis"}\n            </Button>\n            <Button size="sm" variant="secondary" onClick={() => setSelectedIds([])} disabled={selectedTrips.length === 0}>\n              Limpar\n            </Button>\n            <Button size="sm" onClick={() => setBulkEditing(true)} disabled={selectedTrips.length === 0 || trip.isPending}>\n              Editar selecionadas\n            </Button>\n            <Button size="sm" variant="ghost" className="text-danger" onClick={handleBulkDelete} disabled={selectedTrips.length === 0 || removeTrip.isPending}>\n              <Trash2 className="size-4" /> Excluir selecionadas\n            </Button>\n          </div>\n        </div>\n        <div className="mt-3 grid max-h-56 gap-2 overflow-y-auto sm:grid-cols-2 xl:grid-cols-3">\n          {rows.map((t) => (\n            <label key={t.id} className="flex cursor-pointer items-start gap-2 rounded-lg border border-border bg-bg px-3 py-2 text-sm">\n              <input\n                type="checkbox"\n                className="mt-1 size-4"\n                checked={selectedIds.includes(t.id)}\n                onChange={(e) =>\n                  setSelectedIds((ids) =>\n                    e.target.checked ? Array.from(new Set([...ids, t.id])) : ids.filter((id) => id !== t.id),\n                  )\n                }\n              />\n              <span className="min-w-0">\n                <strong className="block truncate">{t.code} · {formatDate(t.date)}</strong>\n                <span className="block truncate text-xs text-muted">{t.driverName} · {t.fleetName} · {freightModeLabel(t.freightMode)}</span>\n              </span>\n            </label>\n          ))}\n        </div>\n      </section>\n`;
  s = replaceRequired(
    s,
    /\n      <div className="mt-6/,
    selectionPanel + '\n      <div className="mt-6',
    'selection panel',
  );

  s = replaceRequired(
    s,
    '      <Dialog open={!!editing} onOpenChange={(v) => !v && setEditing(null)}>',
    `      <Dialog open={bulkEditing} onOpenChange={setBulkEditing}>\n        {bulkEditing && data ? (\n          <DialogContent title={\`Editar \${selectedTrips.length} viagem(ns) selecionada(s)\`}>\n            <BulkTripEditForm\n              drivers={data.drivers}\n              fleets={data.fleets}\n              pending={trip.isPending}\n              onApply={handleBulkApply}\n              onCancel={() => setBulkEditing(false)}\n            />\n          </DialogContent>\n        ) : null}\n      </Dialog>\n\n      <Dialog open={!!editing} onOpenChange={(v) => !v && setEditing(null)}>`,
    'bulk dialog',
  );

  s += `\n\ntype BulkTripChanges = {\n  date: string;\n  client: string;\n  origin: string;\n  destination: string;\n  driverId: string;\n  fleetId: string;\n  freightMode: FreightMode | "";\n  loadedTons: string;\n  grossWeight: string;\n  netWeight: string;\n  pricePerTon: string;\n  kmStart: string;\n  kmEnd: string;\n  dieselLiters: string;\n  dieselPrice: string;\n};\n\nfunction BulkTripEditForm({\n  drivers,\n  fleets,\n  pending,\n  onApply,\n  onCancel,\n}: {\n  drivers: Driver[];\n  fleets: Fleet[];\n  pending: boolean;\n  onApply: (changes: BulkTripChanges) => Promise<void>;\n  onCancel: () => void;\n}) {\n  const [form, setForm] = useState<BulkTripChanges>({\n    date: "", client: "", origin: "", destination: "", driverId: "", fleetId: "", freightMode: "",\n    loadedTons: "", grossWeight: "", netWeight: "", pricePerTon: "", kmStart: "", kmEnd: "", dieselLiters: "", dieselPrice: "",\n  });\n  const set = (key: keyof BulkTripChanges, value: string) => setForm((f) => ({ ...f, [key]: value }));\n  return (\n    <form className="grid gap-4" onSubmit={async (e) => { e.preventDefault(); await onApply(form); }}>\n      <p className="text-sm text-muted">Preencha apenas os campos que deseja alterar em todas as viagens selecionadas. Campos vazios permanecem como estão.</p>\n      <div className="grid gap-3 sm:grid-cols-2">\n        <Field label="Data"><Input type="date" value={form.date} onChange={(e) => set("date", e.target.value)} /></Field>\n        <Field label="Modo de frete">\n          <Select value={form.freightMode} onChange={(e) => set("freightMode", e.target.value)}>\n            <option value="">Não alterar</option>\n            <option value="ton">Por tonelada</option>\n            <option value="trip">Por viagem</option>\n            <option value="cegonha">Cegonha</option>\n            <option value="caixinha">Caixinha</option>\n          </Select>\n        </Field>\n        <Field label="Motorista"><Select value={form.driverId} onChange={(e) => set("driverId", e.target.value)}><option value="">Não alterar</option>{drivers.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</Select></Field>\n        <Field label="Conjunto"><Select value={form.fleetId} onChange={(e) => set("fleetId", e.target.value)}><option value="">Não alterar</option>{fleets.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}</Select></Field>\n        <Field label="Cliente"><Input value={form.client} onChange={(e) => set("client", e.target.value)} placeholder="Não alterar" /></Field>\n        <Field label="Origem"><Input value={form.origin} onChange={(e) => set("origin", e.target.value)} placeholder="Não alterar" /></Field>\n        <Field label="Destino"><Input value={form.destination} onChange={(e) => set("destination", e.target.value)} placeholder="Não alterar" /></Field>\n        <Field label="Ton. carregadas"><Input inputMode="decimal" value={form.loadedTons} onChange={(e) => set("loadedTons", e.target.value)} placeholder="Não alterar" /></Field>\n        <Field label="Peso bruto"><Input inputMode="decimal" value={form.grossWeight} onChange={(e) => set("grossWeight", e.target.value)} placeholder="Não alterar" /></Field>\n        <Field label="Peso líquido"><Input inputMode="decimal" value={form.netWeight} onChange={(e) => set("netWeight", e.target.value)} placeholder="Não alterar" /></Field>\n        <Field label="Preço R$/t (só Por tonelada)"><Input inputMode="decimal" value={form.pricePerTon} onChange={(e) => set("pricePerTon", e.target.value)} placeholder="Não alterar" /></Field>\n        <Field label="KM inicial"><Input inputMode="numeric" value={form.kmStart} onChange={(e) => set("kmStart", e.target.value)} placeholder="Não alterar" /></Field>\n        <Field label="KM final"><Input inputMode="numeric" value={form.kmEnd} onChange={(e) => set("kmEnd", e.target.value)} placeholder="Não alterar" /></Field>\n        <Field label="Litros diesel"><Input inputMode="decimal" value={form.dieselLiters} onChange={(e) => set("dieselLiters", e.target.value)} placeholder="Não alterar" /></Field>\n        <Field label="Preço diesel"><Input inputMode="decimal" value={form.dieselPrice} onChange={(e) => set("dieselPrice", e.target.value)} placeholder="Não alterar" /></Field>\n      </div>\n      <div className="rounded-lg border border-border bg-bg px-3 py-2 text-xs text-muted">Por viagem, Cegonha e Caixinha usam automaticamente os valores atuais da Gerência. Por tonelada usa o R$/t de cada viagem.</div>\n      <div className="flex justify-end gap-2"><Button type="button" variant="secondary" onClick={onCancel}>Cancelar</Button><Button type="submit" disabled={pending}>{pending ? "Atualizando…" : "Aplicar às selecionadas"}</Button></div>\n    </form>\n  );\n}\n`;

  write('src/routes/dono/viagens.tsx', s);
}

for (const [rel, markers] of [
  ['src/lib/api.ts', ['data.trip', 'data.freightMode !== "ton"', "status = 'pendente'", 'update reports set']],
  ['src/components/owner/trip-form.tsx', ['globalPrices.trip', 'informe o preço R$/t individualmente', 'readOnly']],
  ['src/routes/dono/cadastros.tsx', ['tripPrice', 'Por tonelada permanece individual por viagem']],
  ['src/routes/dono/viagens.tsx', ['Seleção em lote', 'Editar selecionadas', 'BulkTripEditForm', 'handleBulkDelete']],
]) {
  const text = read(rel);
  for (const marker of markers) if (!text.includes(marker)) throw new Error(`apply-trip-bulk-and-prices: ${rel} missing ${marker}`);
}

console.log('[trip-bulk] bulk select/edit/delete + per-trip ton price applied');
