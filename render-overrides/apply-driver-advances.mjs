import fs from 'node:fs';
import path from 'node:path';

const target = process.argv[2];
if (!target || !fs.existsSync(target)) throw new Error('apply-driver-advances: target missing');
const repo = process.cwd();

const file = (rel) => path.join(target, rel);
const read = (rel) => fs.readFileSync(file(rel), 'utf8');
const write = (rel, text) => fs.writeFileSync(file(rel), text);
function replaceRequired(text, search, replacement, label) {
  const next = typeof search === 'string' ? text.replace(search, replacement) : text.replace(search, replacement);
  if (next === text) throw new Error(`apply-driver-advances: pattern not found (${label})`);
  return next;
}

// Migration: vínculo opcional entre despesa e motorista; adiantamento não precisa de cavalo/carreta.
{
  const src = path.join(repo, 'render-overrides', '0010_driver_advances.sql');
  const dest = file('migrations/0010_driver_advances.sql');
  fs.copyFileSync(src, dest);
}

// Tipagem da despesa ativa.
{
  let s = read('src/lib/types.ts');
  s = replaceRequired(
    s,
    `export type Expense = {\n  id: string;\n  date: string;\n  fleetId: string;\n  assetType: ExpenseAssetType;\n  category: string;\n  description: string;\n  amount: number;\n  notes: string;\n  createdAt: string;\n};`,
    `export type Expense = {\n  id: string;\n  date: string;\n  fleetId: string | null;\n  assetType: ExpenseAssetType | null;\n  driverId: string | null;\n  category: string;\n  description: string;\n  amount: number;\n  notes: string;\n  createdAt: string;\n};`,
    'expense type',
  );
  write('src/lib/types.ts', s);
}

// API: persistir driver_id e exigir motorista apenas para Adiantamento.
{
  let s = read('src/lib/api.ts');
  s = replaceRequired(
    s,
    `    fleetId: str(r.fleet_id),\n    assetType: str(r.asset_type) === "trailer" ? "trailer" : "tractor",\n    category: str(r.category),`,
    `    fleetId: r.fleet_id ? str(r.fleet_id) : null,\n    assetType: r.asset_type ? (str(r.asset_type) === "trailer" ? "trailer" : "tractor") : null,\n    driverId: r.driver_id ? str(r.driver_id) : null,\n    category: str(r.category),`,
    'map expense driver',
  );
  s = replaceRequired(
    s,
    `const expenseSchema = z.object({\n  id: z.string().optional(),\n  date: z.string().min(8),\n  fleetId: z.string().min(1, "Escolha o conjunto"),\n  assetType: z.enum(["tractor", "trailer"]),\n  category: z.string().trim().min(1, "Informe a categoria"),\n  description: z.string().trim().min(1, "Informe a despesa"),\n  amount: z.number().positive("Informe um valor maior que zero"),\n  notes: z.string().trim(),\n});`,
    `const expenseSchema = z.object({\n  id: z.string().optional(),\n  date: z.string().min(8),\n  fleetId: z.string().nullable().optional(),\n  assetType: z.enum(["tractor", "trailer"]).nullable().optional(),\n  driverId: z.string().nullable().optional(),\n  category: z.string().trim().min(1, "Informe a categoria"),\n  description: z.string().trim().min(1, "Informe a despesa"),\n  amount: z.number().positive("Informe um valor maior que zero"),\n  notes: z.string().trim(),\n});`,
    'expense schema',
  );
  s = replaceRequired(
    s,
    `    const sql = await getSql();\n    const id = data.id?.trim() || newId("exp");\n    await sql\`\n      insert into expenses (id, date, fleet_id, asset_type, category, description, amount, notes)\n      values (\${id}, \${data.date}, \${data.fleetId}, \${data.assetType}, \${data.category}, \${data.description}, \${data.amount}, \${data.notes})\n      on conflict (id) do update set\n        date = excluded.date,\n        fleet_id = excluded.fleet_id,\n        asset_type = excluded.asset_type,\n        category = excluded.category,\n        description = excluded.description,\n        amount = excluded.amount,\n        notes = excluded.notes\n    \`;`,
    `    const sql = await getSql();\n    const id = data.id?.trim() || newId("exp");\n    const isAdvance = data.category === "Adiantamento";\n    if (isAdvance && !data.driverId) throw new Error("Escolha o motorista que recebeu o adiantamento.");\n    if (!isAdvance && (!data.fleetId || !data.assetType)) throw new Error("Escolha o conjunto e o veículo da despesa.");\n    await sql\`\n      insert into expenses (id, date, fleet_id, asset_type, driver_id, category, description, amount, notes)\n      values (\${id}, \${data.date}, \${isAdvance ? null : data.fleetId ?? null}, \${isAdvance ? null : data.assetType ?? null}, \${isAdvance ? data.driverId : null}, \${data.category}, \${data.description}, \${data.amount}, \${data.notes})\n      on conflict (id) do update set\n        date = excluded.date,\n        fleet_id = excluded.fleet_id,\n        asset_type = excluded.asset_type,\n        driver_id = excluded.driver_id,\n        category = excluded.category,\n        description = excluded.description,\n        amount = excluded.amount,\n        notes = excluded.notes\n    \`;`,
    'upsert expense driver advance',
  );
  write('src/lib/api.ts', s);
}

// Tela Despesas: fluxo próprio para adiantamento por motorista e totais separados.
{
  const route = `import { createFileRoute } from "@tanstack/react-router";
import { Pencil, Plus, ReceiptText, Trash2, Truck, UserRound } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { brl, formatDate } from "@/lib/format";
import { parseLocaleNumberOrZero } from "@/lib/parse";
import type { Expense, ExpenseAssetType } from "@/lib/types";
import { useFleet, useFleetMutations } from "@/lib/use-fleet";

export const Route = createFileRoute("/dono/despesas")({ component: DespesasPage });

type Draft = Partial<Expense>;
type AssetFilter = "all" | ExpenseAssetType;

const CATEGORIES = [
  "Adiantamento",
  "Manutenção",
  "Peças",
  "Pneus",
  "Elétrica",
  "Mecânica",
  "Lavagem",
  "Documentação",
  "Seguro",
  "Pedágio",
  "Multa",
  "Outros",
] as const;

function DespesasPage() {
  const { data } = useFleet();
  const { removeExpense } = useFleetMutations();
  const [editing, setEditing] = useState<Draft | null>(null);
  const [fleetFilter, setFleetFilter] = useState("all");
  const [assetFilter, setAssetFilter] = useState<AssetFilter>("all");

  const rows = useMemo(() => {
    let all = data?.expenses ?? [];
    if (fleetFilter !== "all") all = all.filter((e) => e.category !== "Adiantamento" && e.fleetId === fleetFilter);
    if (assetFilter !== "all") all = all.filter((e) => e.category !== "Adiantamento" && e.assetType === assetFilter);
    return all;
  }, [data, fleetFilter, assetFilter]);

  const allExpenses = data?.expenses ?? [];
  const operating = allExpenses.filter((e) => e.category !== "Adiantamento");
  const scopedOperating = fleetFilter === "all" ? operating : operating.filter((e) => e.fleetId === fleetFilter);
  const tractorTotal = scopedOperating.filter((e) => e.assetType === "tractor").reduce((sum, e) => sum + e.amount, 0);
  const trailerTotal = scopedOperating.filter((e) => e.assetType === "trailer").reduce((sum, e) => sum + e.amount, 0);
  const advanceTotal = allExpenses.filter((e) => e.category === "Adiantamento").reduce((sum, e) => sum + e.amount, 0);
  const total = tractorTotal + trailerTotal;

  async function handleDelete(row: Expense) {
    if (!window.confirm(\`Excluir “\${row.description}”?\`)) return;
    try {
      await removeExpense.mutateAsync(row.id);
      toast.success(row.category === "Adiantamento" ? "Adiantamento excluído." : "Despesa excluída.");
      if (editing?.id === row.id) setEditing(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Não foi possível excluir.");
    }
  }

  return (
    <div>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-[11px] uppercase tracking-[0.18em] text-muted">Controle financeiro da frota</p>
          <h1 className="mt-1 font-display text-4xl font-semibold tracking-tight">Despesas</h1>
          <p className="mt-2 max-w-2xl text-sm text-muted">
            Registre gastos da frota e adiantamentos pagos aos motoristas. Adiantamentos são descontados da comissão nos relatórios.
          </p>
        </div>
        <Button onClick={() => setEditing({ date: new Date().toISOString().slice(0, 10), fleetId: data?.fleets[0]?.id ?? null, assetType: "tractor", driverId: null, category: "Manutenção", description: "", amount: 0, notes: "" })}>
          <Plus className="size-4" /> Nova despesa
        </Button>
      </div>

      <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Metric label="Despesas operacionais" value={brl(total)} />
        <Metric label="Despesas dos cavalos" value={brl(tractorTotal)} />
        <Metric label="Despesas das carretas" value={brl(trailerTotal)} />
        <Metric label="Adiantamentos" value={brl(advanceTotal)} />
      </div>

      <div className="mt-6 grid gap-3 sm:grid-cols-2">
        <Field label="Filtrar por conjunto">
          <Select value={fleetFilter} onChange={(e) => setFleetFilter(e.target.value)}>
            <option value="all">Todos os conjuntos e adiantamentos</option>
            {(data?.fleets ?? []).map((f) => <option key={f.id} value={f.id}>{f.name} · cavalo {f.tractorPlate} · carreta {f.trailerPlate}</option>)}
          </Select>
        </Field>
        <Field label="Separar por veículo">
          <Select value={assetFilter} onChange={(e) => setAssetFilter(e.target.value as AssetFilter)}>
            <option value="all">Cavalo + carreta + adiantamentos</option>
            <option value="tractor">Somente cavalo</option>
            <option value="trailer">Somente carreta</option>
          </Select>
        </Field>
      </div>

      {rows.length === 0 ? (
        <div className="mt-6 rounded-xl border border-dashed border-border px-5 py-12 text-center">
          <ReceiptText className="mx-auto size-7 text-muted" />
          <p className="mt-3 text-sm text-muted">Nenhuma despesa ou adiantamento registrado neste filtro.</p>
        </div>
      ) : (
        <ul className="mt-6 grid gap-3">
          {rows.map((row) => {
            const isAdvance = row.category === "Adiantamento";
            const fleet = data?.fleets.find((f) => f.id === row.fleetId);
            const driver = data?.drivers.find((d) => d.id === row.driverId);
            const plate = row.assetType === "tractor" ? fleet?.tractorPlate : fleet?.trailerPlate;
            const assetLabel = row.assetType === "tractor" ? "Cavalo" : "Carreta";
            return (
              <li key={row.id} className="rounded-xl border border-border bg-surface p-4 sm:p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-md border border-border bg-surface-2 px-2 py-1 text-[10px] uppercase tracking-[0.12em] text-muted">
                        {isAdvance ? "Adiantamento" : assetLabel}
                      </span>
                      <span className="text-xs text-muted">{isAdvance ? driver?.name ?? "Motorista não informado" : plate ?? "Sem placa"}</span>
                    </div>
                    <p className="mt-2 font-display text-2xl font-semibold">{row.description}</p>
                    <p className="text-sm text-muted">
                      {formatDate(row.date)} · {isAdvance ? driver?.name ?? "Motorista" : fleet?.name ?? "Conjunto"} · {row.category}
                    </p>
                  </div>
                  <div className="flex items-start gap-2">
                    <p className="mr-1 font-display text-2xl font-semibold tabular">{brl(row.amount)}</p>
                    <Button size="sm" variant="secondary" className="px-3" onClick={() => setEditing(row)} title="Editar"><Pencil className="size-4" /></Button>
                    <Button size="sm" variant="ghost" className="px-3 text-danger" disabled={removeExpense.isPending} onClick={() => handleDelete(row)} title="Excluir"><Trash2 className="size-4" /></Button>
                  </div>
                </div>
                {isAdvance ? <p className="mt-3 border-t border-border pt-3 text-sm text-muted">Será abatido da comissão de {driver?.name ?? "este motorista"} nos relatórios.</p> : null}
                {row.notes ? <p className="mt-3 border-t border-border pt-3 text-sm text-muted">{row.notes}</p> : null}
              </li>
            );
          })}
        </ul>
      )}

      <ExpenseDialog value={editing} onClose={() => setEditing(null)} onDelete={handleDelete} />
    </div>
  );
}

function ExpenseDialog({ value, onClose, onDelete }: { value: Draft | null; onClose: () => void; onDelete: (value: Expense) => Promise<void> }) {
  const { data } = useFleet();
  const { expense } = useFleetMutations();
  const [date, setDate] = useState("");
  const [fleetId, setFleetId] = useState("");
  const [assetType, setAssetType] = useState<ExpenseAssetType>("tractor");
  const [driverId, setDriverId] = useState("");
  const [category, setCategory] = useState("Manutenção");
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [notes, setNotes] = useState("");

  const reset = () => {
    if (!value) return;
    setDate(value.date ?? new Date().toISOString().slice(0, 10));
    setFleetId(value.fleetId ?? data?.fleets[0]?.id ?? "");
    setAssetType(value.assetType ?? "tractor");
    setDriverId(value.driverId ?? "");
    setCategory(value.category ?? "Manutenção");
    setDescription(value.description ?? "");
    setAmount(value.amount ? String(value.amount) : "");
    setNotes(value.notes ?? "");
  };

  useEffect(() => { reset(); }, [value?.id, value?.date]);
  const isAdvance = category === "Adiantamento";
  const fleet = data?.fleets.find((f) => f.id === fleetId);
  const driver = data?.drivers.find((d) => d.id === driverId);

  return (
    <Dialog open={!!value} onOpenChange={(open) => (open ? reset() : onClose())}>
      {value ? (
        <DialogContent title={value.id ? "Editar despesa" : "Nova despesa"}>
          <form className="grid gap-4" onSubmit={async (e) => {
            e.preventDefault();
            if (isAdvance && !driverId) return toast.error("Escolha o motorista que recebeu o adiantamento.");
            if (!isAdvance && !fleetId) return toast.error("Escolha o conjunto da despesa.");
            try {
              await expense.mutateAsync({
                id: value.id,
                date: date || new Date().toISOString().slice(0, 10),
                fleetId: isAdvance ? null : fleetId,
                assetType: isAdvance ? null : assetType,
                driverId: isAdvance ? driverId : null,
                category,
                description: description.trim() || (isAdvance ? \`Adiantamento - \${driver?.name ?? "Motorista"}\` : "Despesa"),
                amount: parseLocaleNumberOrZero(amount),
                notes,
              });
              toast.success(isAdvance ? "Adiantamento salvo e vinculado ao motorista." : "Despesa salva.");
              onClose();
            } catch (err) {
              toast.error(err instanceof Error ? err.message : "Não foi possível salvar.");
            }
          }}>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Data"><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} required /></Field>
              <Field label="Categoria">
                <Select value={category} onChange={(e) => setCategory(e.target.value)}>
                  {CATEGORIES.map((item) => <option key={item} value={item}>{item}</option>)}
                </Select>
              </Field>
            </div>

            {isAdvance ? (
              <div className="rounded-xl border border-border bg-surface-2 p-4">
                <Field label="Motorista que recebeu o adiantamento" hint="Obrigatório — o valor será descontado da comissão deste motorista nos relatórios">
                  <Select value={driverId} onChange={(e) => setDriverId(e.target.value)} required>
                    <option value="">Escolha o motorista</option>
                    {(data?.drivers ?? []).map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                  </Select>
                </Field>
                <div className="mt-3 flex items-start gap-2 text-sm text-muted"><UserRound className="mt-0.5 size-4 shrink-0" /><span>Este lançamento não entra novamente como custo da frota. Ele aparece separado como valor já pago da comissão.</span></div>
              </div>
            ) : (
              <>
                <Field label="Conjunto cadastrado">
                  <Select value={fleetId} onChange={(e) => setFleetId(e.target.value)} required>
                    <option value="">Escolha</option>
                    {(data?.fleets ?? []).map((f) => <option key={f.id} value={f.id}>{f.name} · {f.tractorPlate} / {f.trailerPlate}</option>)}
                  </Select>
                </Field>
                <Field label="Despesa pertence a">
                  <div className="grid grid-cols-2 gap-2">
                    <button type="button" onClick={() => setAssetType("tractor")} className={\`rounded-lg border px-3 py-3 text-left \${assetType === "tractor" ? "border-accent bg-surface-2 text-fg" : "border-border text-muted"}\`}><span className="block text-sm font-medium">Cavalo</span><span className="mt-1 block text-xs">{fleet?.tractorPlate ?? "Placa do cavalo"}</span></button>
                    <button type="button" onClick={() => setAssetType("trailer")} className={\`rounded-lg border px-3 py-3 text-left \${assetType === "trailer" ? "border-accent bg-surface-2 text-fg" : "border-border text-muted"}\`}><span className="block text-sm font-medium">Carreta</span><span className="mt-1 block text-xs">{fleet?.trailerPlate ?? "Placa da carreta"}</span></button>
                  </div>
                </Field>
              </>
            )}

            <Field label={isAdvance ? "Descrição do adiantamento" : "Descrição da despesa"}><Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder={isAdvance ? "Ex.: adiantamento semanal" : "Ex.: troca de pneu, peça, oficina..."} /></Field>
            <Field label="Valor (R$)"><Input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0,00" required /></Field>
            <Field label="Observação"><Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Opcional" /></Field>

            <div className="flex flex-wrap gap-2">
              <Button type="submit" disabled={expense.isPending}>{value.id ? <Pencil className="size-4" /> : <Plus className="size-4" />}{value.id ? "Salvar alterações" : isAdvance ? "Salvar adiantamento" : "Salvar despesa"}</Button>
              {value.id ? <Button type="button" variant="ghost" className="text-danger" onClick={() => onDelete(value as Expense)}><Trash2 className="size-4" /> Excluir</Button> : null}
            </div>
          </form>
        </DialogContent>
      ) : null}
    </Dialog>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div className="rounded-lg border border-border bg-surface p-4"><p className="text-[10px] uppercase tracking-[0.14em] text-muted">{label}</p><p className="mt-2 font-display text-2xl font-semibold tabular">{value}</p></div>;
}
`;
  write('src/routes/dono/despesas.tsx', route);
}

// Relatórios/Totais: comissão bruta - adiantamentos = comissão a pagar.
{
  let s = read('src/routes/dono/totais.tsx');
  s = replaceRequired(
    s,
    `  const periodLabel = PERIODS.find((p) => p.key === period)?.label ?? "Período";`,
    `  const periodLabel = PERIODS.find((p) => p.key === period)?.label ?? "Período";\n  const periodAdvances = useMemo(() => {\n    if (!data) return [];\n    return data.expenses\n      .filter((e) => e.category === "Adiantamento" && !!e.driverId && inPeriod(e.date, period))\n      .map((e) => ({\n        driverId: e.driverId!,\n        driverName: data.drivers.find((d) => d.id === e.driverId)?.name ?? "Motorista removido",\n        date: e.date,\n        amount: e.amount,\n        description: e.description,\n      }));\n  }, [data, period]);\n  const advancesForDriver = (driverId: string) => periodAdvances.filter((e) => e.driverId === driverId);\n  const advanceTotalForDriver = (driverId: string) => advancesForDriver(driverId).reduce((sum, e) => sum + e.amount, 0);`,
    'totals advance helpers',
  );
  s = replaceRequired(
    s,
    `      fuelings: fuelForDriver(selectedDriver.id),\n      periodLabel,`,
    `      fuelings: fuelForDriver(selectedDriver.id),\n      advances: advancesForDriver(selectedDriver.id),\n      periodLabel,`,
    'selected driver pdf advances',
  );
  s = replaceRequired(
    s,
    `    const label = kind === "day" ? "Diário" : kind === "week" ? "Semanal" : kind === "month" ? "Mensal" : "Completo";\n    downloadDriverReportPdf({`,
    `    const label = kind === "day" ? "Diário" : kind === "week" ? "Semanal" : kind === "month" ? "Mensal" : "Completo";\n    const advanceRows = data.expenses\n      .filter((e) => e.category === "Adiantamento" && !!e.driverId && (kind === "day" ? e.date === isoToday : kind === "week" ? inPeriod(e.date, "7d", today) : kind === "month" ? inPeriod(e.date, "month", today) : true))\n      .map((e) => ({ driverId: e.driverId!, driverName: data.drivers.find((d) => d.id === e.driverId)?.name ?? "Motorista removido", date: e.date, amount: e.amount, description: e.description }));\n    downloadDriverReportPdf({`,
    'quick pdf advance rows',
  );
  s = replaceRequired(
    s,
    `      fuelings: fuelRows,\n      periodLabel: label,`,
    `      fuelings: fuelRows,\n      advances: advanceRows,\n      periodLabel: label,`,
    'quick pdf advances',
  );
  s = replaceRequired(
    s,
    `          comissao: d.commissionValue,`,
    `          comissao_bruta: d.commissionValue,\n          adiantamentos: advanceTotalForDriver(d.driverId),\n          comissao_a_pagar: d.commissionValue - advanceTotalForDriver(d.driverId),`,
    'csv commission advances',
  );
  s = replaceRequired(
    s,
    `<Stat label="Comissão" value={\`${'${pct(d.commissionPct)}'} · ${'${brl(d.commissionValue)}'}\`} />\n                <Stat label="Após comissão" value={brl(d.freightAfterCommission)} />`,
    `<Stat label="Comissão bruta" value={\`${'${pct(d.commissionPct)}'} · ${'${brl(d.commissionValue)}'}\`} />\n                <Stat label="Adiantamentos" value={brl(advanceTotalForDriver(d.driverId))} />\n                <Stat label="Comissão a pagar" value={brl(d.commissionValue - advanceTotalForDriver(d.driverId))} />\n                <Stat label="Após comissão" value={brl(d.freightAfterCommission)} />`,
    'driver report cards',
  );
  write('src/routes/dono/totais.tsx', s);
}

// Patch dos snippets que o render-build aplica depois do bootstrap.
{
  const pdfPath = path.join(repo, 'render-overrides', 'pdf-export.snippet.ts');
  let p = fs.readFileSync(pdfPath, 'utf8');
  p = replaceRequired(p, '  fuelings = [],\n  periodLabel,', '  fuelings = [],\n  advances = [],\n  periodLabel,', 'pdf advances arg');
  p = replaceRequired(p, '  fuelings?: ReportFueling[];\n  periodLabel?: string;', '  fuelings?: ReportFueling[];\n  advances?: Array<{ driverId?: string | null; driverName?: string; date: string; amount: number; description?: string }>;\n  periodLabel?: string;', 'pdf advances type');
  p = replaceRequired(p, '  const totalCommission = trips.reduce((sum, trip) => sum + Number((trip as any).commissionValue ?? (trip as any).commission ?? 0), 0);', '  const totalCommission = trips.reduce((sum, trip) => sum + Number((trip as any).commissionValue ?? (trip as any).commission ?? 0), 0);\n  const totalAdvances = advances.reduce((sum, item) => sum + Number(item.amount ?? 0), 0);\n  const commissionPayable = totalCommission - totalAdvances;', 'pdf commission totals');
  p = replaceRequired(p, '  const driverTotals = new Map<string, { name: string; trips: number; billing: number; commission: number }>();', '  const driverTotals = new Map<string, { name: string; trips: number; billing: number; commission: number; advances: number }>();', 'pdf driver totals type');
  p = replaceRequired(p, '    const current = driverTotals.get(key) ?? { name, trips: 0, billing: 0, commission: 0 };', '    const current = driverTotals.get(key) ?? { name, trips: 0, billing: 0, commission: 0, advances: 0 };', 'pdf driver default');
  p = replaceRequired(p, '    driverTotals.set(key, current);\n  });\n\n  const rows = trips.map', '    driverTotals.set(key, current);\n  });\n  advances.forEach((advance) => {\n    const name = String(advance.driverName ?? "Motorista").trim() || "Motorista";\n    const key = String(advance.driverId ?? name);\n    const current = driverTotals.get(key) ?? { name, trips: 0, billing: 0, commission: 0, advances: 0 };\n    current.advances += Number(advance.amount ?? 0);\n    driverTotals.set(key, current);\n  });\n\n  const rows = trips.map', 'pdf aggregate advances');
  p = replaceRequired(p, '    doc.text("COMISSÃO TOTAL", 254, 8, { align: "center" });', '    doc.text("COMISSÃO A PAGAR", 254, 8, { align: "center" });', 'pdf header label');
  p = replaceRequired(p, '    doc.text(brl(totalCommission), 254, 14.7, { align: "center" });', '    doc.text(brl(commissionPayable), 254, 14.7, { align: "center" });', 'pdf header value');
  p = replaceRequired(p, '      brl(item.commission),\n      brl(item.billing - item.commission),', '      brl(item.commission),\n      brl(item.advances),\n      brl(item.commission - item.advances),\n      brl(item.billing - item.commission),', 'pdf summary values');
  p = replaceRequired(p, '    head: [["Motorista", "Fretes", "Faturamento", "Comissão", "Faturamento líquido"]],', '    head: [["Motorista", "Fretes", "Faturamento", "Comissão bruta", "Adiantamentos", "Comissão a pagar", "Faturamento líquido"]],', 'pdf summary headers');
  p = replaceRequired(p, `      0: { cellWidth: 82 },\n      1: { cellWidth: 24, halign: "center" },\n      2: { cellWidth: 55, halign: "right" },\n      3: { cellWidth: 55, halign: "right" },\n      4: { cellWidth: 60, halign: "right" },`, `      0: { cellWidth: 60 },\n      1: { cellWidth: 18, halign: "center" },\n      2: { cellWidth: 42, halign: "right" },\n      3: { cellWidth: 42, halign: "right" },\n      4: { cellWidth: 38, halign: "right" },\n      5: { cellWidth: 42, halign: "right" },\n      6: { cellWidth: 42, halign: "right" },`, 'pdf summary widths');
  p = replaceRequired(p, '`Fretes: ${trips.length}  •  Peso: ${tons(totalTons)}  •  Faturamento: ${brl(totalFreight)}  •  Comissão: ${brl(totalCommission)}  •  Líquido: ${brl(totalFreight - totalCommission)}`', '`Fretes: ${trips.length}  •  Faturamento: ${brl(totalFreight)}  •  Comissão bruta: ${brl(totalCommission)}  •  Adiantamentos: ${brl(totalAdvances)}  •  Comissão a pagar: ${brl(commissionPayable)}`', 'pdf footer commission');
  fs.writeFileSync(pdfPath, p);

  const excelPath = path.join(repo, 'render-overrides', 'admin-excel.snippet.ts');
  let x = fs.readFileSync(excelPath, 'utf8');
  x = replaceRequired(x, '  const totalCommission = computed.reduce((sum: number, trip: any) => sum + Number(trip.commissionValue ?? trip.commission ?? 0), 0);\n  const totalNetBilling = totalBilling - totalCommission;', '  const totalCommission = computed.reduce((sum: number, trip: any) => sum + Number(trip.commissionValue ?? trip.commission ?? 0), 0);\n  const periodExpenseRows = (data?.expenses ?? []).filter((expense: any) => inPeriod(expense.date, period));\n  const advanceRows = periodExpenseRows.filter((expense: any) => expense.category === "Adiantamento");\n  const totalAdvances = advanceRows.reduce((sum: number, expense: any) => sum + Number(expense.amount ?? 0), 0);\n  const commissionPayable = totalCommission - totalAdvances;\n  const totalNetBilling = totalBilling - totalCommission;', 'excel commission totals');
  x = replaceRequired(x, '  const selectedExpenses = (data?.expenses ?? []).filter((expense: any) => {', '  const selectedExpenses = periodExpenseRows.filter((expense: any) => expense.category !== "Adiantamento").filter((expense: any) => {', 'excel exclude advances from expenses');
  x = replaceRequired(x, '  worksheet.getCell("H2").value = `COMISSÃO TOTAL: ${brl(totalCommission)}`;', '  worksheet.getCell("H2").value = `COMISSÃO A PAGAR: ${brl(commissionPayable)}`;', 'excel header commission');
  x = replaceRequired(x, '["COMISSÕES", brl(totalCommission)],', '["COMISSÃO A PAGAR", brl(commissionPayable)],', 'excel summary commission');
  x = replaceRequired(x, '  const commissionByDriver = new Map<string, { name: string; total: number }>();', '  const commissionByDriver = new Map<string, { name: string; total: number; advances: number }>();', 'excel commission map type');
  x = replaceRequired(x, '    const current = commissionByDriver.get(key) ?? { name, total: 0 };', '    const current = commissionByDriver.get(key) ?? { name, total: 0, advances: 0 };', 'excel commission map default');
  x = replaceRequired(x, '    commissionByDriver.set(key, current);\n  });\n  const commissionByDriverText', '    commissionByDriver.set(key, current);\n  });\n  advanceRows.forEach((expense: any) => {\n    const driver = (data?.drivers ?? []).find((d: any) => String(d.id) === String(expense.driverId ?? ""));\n    const name = String(driver?.name ?? "Motorista").trim() || "Motorista";\n    const key = String(expense.driverId ?? name);\n    const current = commissionByDriver.get(key) ?? { name, total: 0, advances: 0 };\n    current.advances += Number(expense.amount ?? 0);\n    commissionByDriver.set(key, current);\n  });\n  const commissionByDriverText', 'excel aggregate driver advances');
  x = replaceRequired(x, '.map((item) => `${item.name}: ${brl(item.total)}`)', '.map((item) => `${item.name}: bruta ${brl(item.total)} • adiantado ${brl(item.advances)} • a pagar ${brl(item.total - item.advances)}`)', 'excel driver commission text');
  x = replaceRequired(x, '  const driverHeaders = ["Motorista", "Viagens", "Faturamento", "Faturamento líquido", "TOTAL COMISSÃO", "Diesel", "Despesas", "Após custos", "% comissão"];', '  const driverHeaders = ["Motorista", "Viagens", "Faturamento", "Faturamento líquido", "Comissão bruta", "Adiantamentos", "COMISSÃO A PAGAR", "Diesel", "Despesas operacionais", "Após custos", "% comissão"];', 'excel driver headers');
  x = replaceRequired(x, '    const driverExpenses = (data?.expenses ?? [])\n      .filter((expense: any) => item.id && String(expense.driverId ?? "") === String(item.id))\n      .reduce((sum: number, expense: any) => sum + Number(expense.amount ?? 0), 0);', '    const driverExpenses = periodExpenseRows\n      .filter((expense: any) => expense.category !== "Adiantamento" && item.id && String(expense.driverId ?? "") === String(item.id))\n      .reduce((sum: number, expense: any) => sum + Number(expense.amount ?? 0), 0);\n    const driverAdvances = advanceRows\n      .filter((expense: any) => item.id && String(expense.driverId ?? "") === String(item.id))\n      .reduce((sum: number, expense: any) => sum + Number(expense.amount ?? 0), 0);', 'excel driver expenses and advances');
  x = replaceRequired(x, '      brl(item.commission),\n      brl(item.diesel),\n      brl(driverExpenses),', '      brl(item.commission),\n      brl(driverAdvances),\n      brl(item.commission - driverAdvances),\n      brl(item.diesel),\n      brl(driverExpenses),', 'excel driver row commissions');
  fs.writeFileSync(excelPath, x);
}

console.log('[driver-advances] advance expense + driver commission deduction applied');
