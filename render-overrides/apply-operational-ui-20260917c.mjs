import fs from 'node:fs';
import path from 'node:path';

const target = process.argv[2];
if (!target) throw new Error('operational-ui-20260917c: target missing');

const fp = (rel) => path.join(target, rel);
const read = (rel) => {
  const p = fp(rel);
  if (!fs.existsSync(p)) throw new Error(`operational-ui-20260917c: missing ${rel}`);
  return fs.readFileSync(p, 'utf8');
};
const write = (rel, before, after) => {
  if (before === after) throw new Error(`operational-ui-20260917c: no changes in ${rel}`);
  fs.writeFileSync(fp(rel), after);
};
const must = (text, before, after, label) => {
  if (!text.includes(before)) throw new Error(`operational-ui-20260917c: pattern not found (${label})`);
  return text.replace(before, after);
};

// 1) Motorista: ticket 100% automático. Remover qualquer solicitação manual.
{
  const rel = 'src/routes/motorista.tsx';
  const before = read(rel);
  let s = before;
  s = must(s, '  const [ticket, setTicket] = useState("");\n', '', 'driver ticket state');
  s = must(
    s,
    `      for (let index = 0; index < count; index += 1) {\n        const baseTicket = ticket.trim();\n        const itemTicket = baseTicket && count > 1\n          ? \`${'${baseTicket}'}-${'${String(index + 1).padStart(2, "0")}'}\`\n          : baseTicket;\n        const res = await report.mutateAsync({\n          ticket: itemTicket,`,
    `      for (let index = 0; index < count; index += 1) {\n        const res = await report.mutateAsync({\n          ticket: "",`,
    'automatic ticket submit',
  );
  s = must(s, '      setTicket("");\n', '', 'driver ticket reset');
  s = must(
    s,
    `          <Field label="Número do ticket" hint="Opcional — será gerado automaticamente se ficar em branco">\n            <Input\n              value={ticket}\n              onChange={(e) => setTicket(e.target.value.toUpperCase())}\n              placeholder="TK-1046"\n              autoCapitalize="characters"\n              autoComplete="off"\n              className="h-14 font-display text-2xl tracking-wide"\n            />\n          </Field>\n\n`,
    '',
    'driver ticket field',
  );
  write(rel, before, s);
}

// 2) API: permitir editar lançamento pendente sem alterar ticket automático.
{
  const rel = 'src/lib/api.ts';
  const before = read(rel);
  let s = before;
  const marker = `export const deleteReport = createServerFn({ method: "POST" })\n  .validator(z.object({ id: z.string().min(1) }))\n  .handler(async ({ data }) => {\n    await requireManagement();\n    const sql = await getSql();\n    await sql\`delete from reports where id = ${'${data.id}'}\`;\n    return { ok: true };\n  });\n\n`;
  const addition = marker + `const pendingReportEditSchema = z.object({\n  id: z.string().min(1),\n  driverId: z.string().min(1, "Escolha o motorista"),\n  fleetId: z.string().min(1, "Escolha o conjunto"),\n  tons: z.number().min(0).default(0),\n  dailyValue: z.number().min(0).default(0),\n  freightMode: z.enum(["ton", "trip", "cegonha", "caixinha"]),\n});\n\nexport const updatePendingReport = createServerFn({ method: "POST" })\n  .validator(pendingReportEditSchema)\n  .handler(async ({ data }) => {\n    await requireManagement();\n    const sql = await getSql();\n    const rows = await sql<{ id: string }[]>\`\n      update reports set\n        driver_id = ${'${data.driverId}'},\n        fleet_id = ${'${data.fleetId}'},\n        tons = ${'${data.freightMode === "ton" ? data.tons : 0}'},\n        daily_value = ${'${data.freightMode === "trip" ? data.dailyValue : 0}'},\n        freight_mode = ${'${data.freightMode}'}\n      where id = ${'${data.id}'} and status = 'pendente'\n      returning id\n    \`;\n    if (!rows[0]) throw new Error("Este lançamento não está mais pendente.");\n    return { ok: true };\n  });\n\n`;
  s = must(s, marker, addition, 'pending report API');
  write(rel, before, s);
}

// 3) Hook: expor mutação de edição da Caixa.
{
  const rel = 'src/lib/use-fleet.ts';
  const before = read(rel);
  let s = before;
  s = must(s, '  upsertTrip,\n', '  upsertTrip,\n  updatePendingReport,\n', 'updatePendingReport import');
  const mutationMarker = `  const removeReport = useMutation({\n    mutationFn: (id: string) => deleteReport({ data: { id } }),\n    onSuccess: invalidate,\n  });\n`;
  s = must(
    s,
    mutationMarker,
    mutationMarker + `  const editReport = useMutation({\n    mutationFn: (data: Parameters<typeof updatePendingReport>[0]["data"]) => updatePendingReport({ data }),\n    onSuccess: invalidate,\n  });\n`,
    'edit report mutation',
  );
  s = must(s, '    removeReport,\n    trip,\n', '    removeReport,\n    editReport,\n    trip,\n', 'edit report return');
  write(rel, before, s);
}

// 4) Caixa: manter seleção visível e adicionar editor real de lançamento pendente.
{
  const rel = 'src/routes/dono/lancamentos.tsx';
  const before = read(rel);
  let s = before;
  s = must(s, 'import { CheckCheck, Trash2 } from "lucide-react";', 'import { CheckCheck, Pencil, Trash2 } from "lucide-react";', 'Pencil import');
  s = must(s, 'import { Button } from "@/components/ui/button";\n', 'import { Button } from "@/components/ui/button";\nimport { Field } from "@/components/ui/field";\nimport { Input } from "@/components/ui/input";\nimport { Select } from "@/components/ui/select";\n', 'editor UI imports');
  s = must(s, 'import { formatDate, integer, num } from "@/lib/format";\n', 'import { formatDate, integer, num } from "@/lib/format";\nimport { parseLocaleNumberOrZero } from "@/lib/parse";\n', 'parse import');
  s = must(
    s,
    '  const { trip, acceptMany, reject, removeReport, removeAllTrips } = useFleetMutations();\n  const [open, setOpen] = useState<DriverReport | null>(null);\n',
    '  const { trip, acceptMany, reject, removeReport, removeAllTrips, editReport } = useFleetMutations();\n  const [open, setOpen] = useState<DriverReport | null>(null);\n  const [editingReport, setEditingReport] = useState<DriverReport | null>(null);\n',
    'editor mutation state',
  );
  s = must(
    s,
    '        Motorista e conjunto são obrigatórios. Ticket, KM, toneladas e modo de frete podem ser completados pela gerência antes de fechar a viagem.',
    '        Motorista e conjunto são obrigatórios. Os tickets são automáticos e os lançamentos pendentes podem ser selecionados ou editados antes de fechar a viagem.',
    'Caixa help text',
  );
  s = s.replace('<span>Marcar todas ({pending.length})</span>', '<span>Selecionar todos ({pending.length})</span>');
  s = must(
    s,
    '                    <Button onClick={() => setOpen(r)}>Fechar viagem</Button>\n',
    '                    <Button onClick={() => setOpen(r)}>Fechar viagem</Button>\n                    <Button variant="secondary" onClick={() => setEditingReport(r)} title={`Editar ${r.ticket}`}>\n                      <Pencil className="size-4" /> Editar\n                    </Button>\n',
    'Caixa edit button',
  );
  const closeDialog = `      <Dialog open={!!open} onOpenChange={(v) => !v && setOpen(null)}>\n        {draft && data ? (\n          <DialogContent title={\`Fechar ${'${draft.code}'}\`}>\n            <TripForm\n              key={draft.reportId}\n              drivers={data.drivers}\n              fleets={data.fleets}\n              trips={data.trips}\n              initial={draft}\n              submitLabel="Lançar no painel"\n              pending={trip.isPending}\n              onSubmit={async (payload) => {\n                await trip.mutateAsync(payload);\n                toast.success(\`Viagem ${'${payload.code}'} lançada.\`);\n                setOpen(null);\n              }}\n            />\n          </DialogContent>\n        ) : null}\n      </Dialog>\n`;
  const dialogs = `      <Dialog open={!!editingReport} onOpenChange={(v) => !v && setEditingReport(null)}>\n        {editingReport && data ? (\n          <DialogContent title={\`Editar lançamento ${'${editingReport.ticket}'}\`}>\n            <PendingReportEditor\n              key={editingReport.id}\n              report={editingReport}\n              drivers={data.drivers}\n              fleets={data.fleets}\n              pending={editReport.isPending}\n              onCancel={() => setEditingReport(null)}\n              onSave={async (payload) => {\n                await editReport.mutateAsync(payload);\n                toast.success("Lançamento atualizado.");\n                setEditingReport(null);\n              }}\n            />\n          </DialogContent>\n        ) : null}\n      </Dialog>\n\n${closeDialog}`;
  s = must(s, closeDialog, dialogs, 'Caixa edit dialog');

  const componentEnd = '\n}\n';
  const lastMainEnd = s.lastIndexOf(componentEnd);
  if (lastMainEnd < 0) throw new Error('operational-ui-20260917c: Lancamentos component end not found');
  const editor = `\n\ntype PendingReportEditPayload = {\n  id: string;\n  driverId: string;\n  fleetId: string;\n  tons: number;\n  dailyValue: number;\n  freightMode: "ton" | "trip" | "cegonha" | "caixinha";\n};\n\nfunction PendingReportEditor({\n  report,\n  drivers,\n  fleets,\n  pending,\n  onSave,\n  onCancel,\n}: {\n  report: DriverReport;\n  drivers: Array<{ id: string; name: string }>;\n  fleets: Array<{ id: string; name: string; trailerPlate: string }>;\n  pending: boolean;\n  onSave: (payload: PendingReportEditPayload) => Promise<void>;\n  onCancel: () => void;\n}) {\n  const [driverId, setDriverId] = useState(report.driverId);\n  const [fleetId, setFleetId] = useState(report.fleetId);\n  const [mode, setMode] = useState<PendingReportEditPayload["freightMode"]>(report.freightMode ?? "ton");\n  const [tonsValue, setTonsValue] = useState(report.tons > 0 ? String(report.tons).replace(".", ",") : "");\n  const [dailyValue, setDailyValue] = useState(report.dailyValue > 0 ? String(report.dailyValue).replace(".", ",") : "");\n\n  return (\n    <form\n      className="grid gap-4"\n      onSubmit={async (event) => {\n        event.preventDefault();\n        const tons = mode === "ton" ? parseLocaleNumberOrZero(tonsValue) : 0;\n        const daily = mode === "trip" ? parseLocaleNumberOrZero(dailyValue) : 0;\n        if (!driverId || !fleetId) return toast.error("Escolha motorista e conjunto.");\n        if (mode === "ton" && tons <= 0) return toast.error("Informe o peso líquido/toneladas.");\n        if (mode === "trip" && daily <= 0) return toast.error("Informe o valor da diária.");\n        await onSave({ id: report.id, driverId, fleetId, tons, dailyValue: daily, freightMode: mode });\n      }}\n    >\n      <div className="rounded-lg border border-border bg-surface-2 px-4 py-3 text-sm">\n        <span className="text-muted">Ticket automático</span>\n        <strong className="ml-2 font-display text-lg">{report.ticket}</strong>\n      </div>\n      <Field label="Motorista">\n        <Select value={driverId} onChange={(event) => setDriverId(event.target.value)}>\n          {drivers.map((driver) => <option key={driver.id} value={driver.id}>{driver.name}</option>)}\n        </Select>\n      </Field>\n      <Field label="Conjunto">\n        <Select value={fleetId} onChange={(event) => setFleetId(event.target.value)}>\n          {fleets.map((fleet) => <option key={fleet.id} value={fleet.id}>{fleet.name} · {fleet.trailerPlate}</option>)}\n        </Select>\n      </Field>\n      <Field label="Modo de frete">\n        <Select value={mode} onChange={(event) => setMode(event.target.value as PendingReportEditPayload["freightMode"])}>\n          <option value="ton">Por tonelada</option>\n          <option value="trip">Diária</option>\n          <option value="cegonha">Cegonha</option>\n          <option value="caixinha">Caixinha</option>\n        </Select>\n      </Field>\n      {mode === "ton" ? (\n        <Field label="Peso líquido / toneladas">\n          <Input value={tonsValue} onChange={(event) => setTonsValue(event.target.value)} inputMode="decimal" placeholder="0,000" />\n        </Field>\n      ) : mode === "trip" ? (\n        <Field label="Valor da diária (R$)">\n          <Input value={dailyValue} onChange={(event) => setDailyValue(event.target.value)} inputMode="decimal" placeholder="0,00" />\n        </Field>\n      ) : null}\n      <div className="flex flex-wrap justify-end gap-2 pt-2">\n        <Button type="button" variant="ghost" onClick={onCancel} disabled={pending}>Cancelar</Button>\n        <Button type="submit" disabled={pending}>{pending ? "Salvando..." : "Salvar edição"}</Button>\n      </div>\n    </form>\n  );\n}\n`;
  s = s.slice(0, lastMainEnd + componentEnd.length) + editor + s.slice(lastMainEnd + componentEnd.length);
  write(rel, before, s);
}

// 5) Viagens: em frete por tonelada mostrar os quatro dados de cada viagem nos balões.
{
  const rel = 'src/routes/dono/viagens.tsx';
  const before = read(rel);
  let s = before;

  const groupButtonMarker = `                    <Button\n                      className="mt-3 w-full"`;
  const tonDetails = `                    {group.mode === "ton" ? (\n                      <div className="mt-3 grid gap-2">\n                        {group.items.map((item) => (\n                          <div key={item.id} className="rounded-lg border border-border bg-surface px-3 py-2 text-xs">\n                            <strong className="block text-sm">{item.code}</strong>\n                            <div className="mt-1 grid grid-cols-2 gap-x-3 gap-y-1 text-muted sm:grid-cols-4">\n                              <span>Peso líquido: <b className="text-fg">{tons(item.netWeight)}</b></span>\n                              <span>Preço/t: <b className="text-fg">{brl(item.pricePerTon)}/t</b></span>\n                              <span>Frete: <b className="text-fg">{brl(item.freight)}</b></span>\n                              <span>Comissão: <b className="text-fg">{brl(item.commissionValue)}</b></span>\n                            </div>\n                          </div>\n                        ))}\n                      </div>\n                    ) : null}\n`;
  s = must(s, groupButtonMarker, tonDetails + groupButtonMarker, 'ton grouped details');

  const oldTripCard = `      <dl className="mt-3 grid grid-cols-2 gap-2 text-sm">\n        <div>\n          <dt className="text-[10px] uppercase tracking-[0.12em] text-subtle">\n            Frete\n          </dt>\n          <dd className="tabular">{brl(trip.freight)}</dd>\n          <dd className="text-[10px] text-muted">\n            {trip.freightMode === "ton"\n              ? \`${'${freightModeLabel(trip.freightMode)}'} · ${'${brl(trip.pricePerTon)}'}/t\`\n              : freightModeLabel(trip.freightMode)}\n          </dd>\n        </div>\n        <div>\n          <dt className="text-[10px] uppercase tracking-[0.12em] text-subtle">\n            Resultado\n          </dt>\n          <dd className="tabular">{brl(trip.grossResult)}</dd>\n        </div>\n      </dl>`;
  const newTripCard = `      {trip.freightMode === "ton" ? (\n        <dl className="mt-3 grid grid-cols-2 gap-2 text-sm">\n          <div className="rounded-lg border border-border bg-bg px-3 py-2">\n            <dt className="text-[10px] uppercase tracking-[0.12em] text-subtle">Peso líquido</dt>\n            <dd className="mt-1 font-semibold tabular">{tons(trip.netWeight)}</dd>\n          </div>\n          <div className="rounded-lg border border-border bg-bg px-3 py-2">\n            <dt className="text-[10px] uppercase tracking-[0.12em] text-subtle">Preço por tonelada</dt>\n            <dd className="mt-1 font-semibold tabular">{brl(trip.pricePerTon)}/t</dd>\n          </div>\n          <div className="rounded-lg border border-border bg-bg px-3 py-2">\n            <dt className="text-[10px] uppercase tracking-[0.12em] text-subtle">Frete total</dt>\n            <dd className="mt-1 font-semibold tabular">{brl(trip.freight)}</dd>\n          </div>\n          <div className="rounded-lg border border-border bg-bg px-3 py-2">\n            <dt className="text-[10px] uppercase tracking-[0.12em] text-subtle">Comissão</dt>\n            <dd className="mt-1 font-semibold tabular">{brl(trip.commissionValue)}</dd>\n          </div>\n        </dl>\n      ) : (\n        <dl className="mt-3 grid grid-cols-2 gap-2 text-sm">\n          <div>\n            <dt className="text-[10px] uppercase tracking-[0.12em] text-subtle">Frete</dt>\n            <dd className="tabular">{brl(trip.freight)}</dd>\n            <dd className="text-[10px] text-muted">{freightModeLabel(trip.freightMode)}</dd>\n          </div>\n          <div>\n            <dt className="text-[10px] uppercase tracking-[0.12em] text-subtle">Resultado</dt>\n            <dd className="tabular">{brl(trip.grossResult)}</dd>\n          </div>\n        </dl>\n      )}`;
  s = must(s, oldTripCard, newTripCard, 'TripCard ton details');
  write(rel, before, s);
}

// 6) Abastecimentos: remover métricas derivadas de KM entre abastecimentos e KM/L.
{
  const rel = 'src/routes/dono/abastecimentos.tsx';
  const before = read(rel);
  let s = before;
  s = must(s, 'import { fuelingConsumptionRows, fuelingConsumptionStats } from "@/lib/calc";', 'import { fuelingConsumptionRows } from "@/lib/calc";', 'fuel stats import');
  s = must(s, 'import { brl, formatDate, integer, km, kmL, liters } from "@/lib/format";', 'import { brl, formatDate, integer, liters } from "@/lib/format";', 'fuel format imports');
  s = must(s, '  const consumption = fuelingConsumptionStats(rows);\n', '', 'consumption stats const');
  s = must(
    s,
    '            KM/L calculado somente pelos abastecimentos: diferença de odômetro entre abastecimentos consecutivos do mesmo conjunto ÷ litros do abastecimento atual.',
    '            Registre e acompanhe litros, preços e custo total de cada abastecimento por conjunto.',
    'fuel description',
  );
  s = must(
    s,
    `      <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">\n        <Metric label="Litros registrados" value={liters(totalLiters)} />\n        <Metric label="Custo total" value={brl(totalCost)} />\n        <Metric label="Preço médio/L" value={brl(avgPrice)} />\n        <Metric label="KM entre abastecimentos" value={km(consumption.kmDriven)} />\n        <Metric label="Média KM/L" value={kmL(consumption.kmPerLiter)} />\n      </div>`,
    `      <div className="mt-6 grid gap-3 sm:grid-cols-3">\n        <Metric label="Litros registrados" value={liters(totalLiters)} />\n        <Metric label="Custo total" value={brl(totalCost)} />\n        <Metric label="Preço médio/L" value={brl(avgPrice)} />\n      </div>`,
    'fuel top metrics',
  );
  s = must(
    s,
    `                <dl className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">\n                  <Metric label="Odômetro" value={\`${'${integer(row.km)}'} km\`} compact />\n                  <Metric label="KM rodado" value={row.kmSincePrevious == null ? "—" : km(row.kmSincePrevious)} compact />\n                  <Metric label="Litros" value={liters(row.liters)} compact />\n                  <Metric label="KM/L" value={kmL(row.kmPerLiter)} compact />\n                  <Metric label="Preço/L" value={brl(row.pricePerLiter)} compact />\n                  <Metric label="Total" value={brl(row.liters * row.pricePerLiter)} compact />\n                  <Metric label="Carreta" value={fleet?.trailerPlate ?? "—"} compact />\n                </dl>`,
    `                <dl className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">\n                  <Metric label="Odômetro" value={\`${'${integer(row.km)}'} km\`} compact />\n                  <Metric label="Litros" value={liters(row.liters)} compact />\n                  <Metric label="Preço/L" value={brl(row.pricePerLiter)} compact />\n                  <Metric label="Total" value={brl(row.liters * row.pricePerLiter)} compact />\n                  <Metric label="Carreta" value={fleet?.trailerPlate ?? "—"} compact />\n                </dl>`,
    'fuel card metrics',
  );
  write(rel, before, s);
}

console.log('[operational-ui-20260917c] automatic ticket + Caixa edit/select + ton card details + fueling cleanup applied');
