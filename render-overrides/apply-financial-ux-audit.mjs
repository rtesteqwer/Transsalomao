import fs from 'node:fs';
import path from 'node:path';

const target = process.argv[2];
if (!target || !fs.existsSync(target)) throw new Error('financial-ux-audit: target missing');

const file = (rel) => path.join(target, rel);
const read = (rel) => fs.readFileSync(file(rel), 'utf8');
const write = (rel, text) => fs.writeFileSync(file(rel), text);

// 1) DESPESAS: apenas total operacional na aba principal; adiantamentos em aba própria.
{
  const rel = 'src/routes/dono/despesas.tsx';
  const route = String.raw`import { createFileRoute } from "@tanstack/react-router";
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
type ExpenseTab = "despesas" | "adiantamentos";

const OPERATING_CATEGORIES = [
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
  const [tab, setTab] = useState<ExpenseTab>("despesas");

  const operating = useMemo(
    () => (data?.expenses ?? []).filter((row) => row.category !== "Adiantamento"),
    [data?.expenses],
  );
  const advances = useMemo(
    () => (data?.expenses ?? []).filter((row) => row.category === "Adiantamento"),
    [data?.expenses],
  );
  const operatingTotal = operating.reduce((sum, row) => sum + Number(row.amount ?? 0), 0);
  const advanceTotal = advances.reduce((sum, row) => sum + Number(row.amount ?? 0), 0);
  const rows = tab === "despesas" ? operating : advances;

  const openNew = () => {
    const today = new Date().toISOString().slice(0, 10);
    if (tab === "adiantamentos") {
      setEditing({
        date: today,
        fleetId: null,
        assetType: null,
        driverId: data?.drivers[0]?.id ?? null,
        category: "Adiantamento",
        description: "",
        amount: 0,
        notes: "",
      });
      return;
    }
    setEditing({
      date: today,
      fleetId: data?.fleets[0]?.id ?? null,
      assetType: "tractor",
      driverId: null,
      category: "Manutenção",
      description: "",
      amount: 0,
      notes: "",
    });
  };

  async function handleDelete(row: Expense) {
    if (!window.confirm('Excluir "' + row.description + '"?')) return;
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
          <p className="text-[11px] uppercase tracking-[0.18em] text-muted">Controle financeiro</p>
          <h1 className="mt-1 font-display text-4xl font-semibold tracking-tight">Despesas</h1>
          <p className="mt-2 max-w-2xl text-sm text-muted">
            Despesas operacionais ficam separadas dos adiantamentos. Adiantamentos são vinculados ao motorista e abatidos da comissão a pagar.
          </p>
        </div>
        <Button onClick={openNew}>
          <Plus className="size-4" /> {tab === "despesas" ? "Nova despesa" : "Novo adiantamento"}
        </Button>
      </div>

      <div className="mt-6 flex flex-wrap gap-2 rounded-xl border border-border bg-surface p-2">
        <button
          type="button"
          onClick={() => setTab("despesas")}
          className={tab === "despesas" ? "rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-bg" : "rounded-lg px-4 py-2 text-sm font-semibold text-muted hover:bg-surface-2 hover:text-fg"}
        >
          Despesas
        </button>
        <button
          type="button"
          onClick={() => setTab("adiantamentos")}
          className={tab === "adiantamentos" ? "rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-bg" : "rounded-lg px-4 py-2 text-sm font-semibold text-muted hover:bg-surface-2 hover:text-fg"}
        >
          Adiantamentos
        </button>
      </div>

      <div className="mt-5 max-w-xl">
        <Metric
          label={tab === "despesas" ? "Despesas totais" : "Adiantamentos totais"}
          value={brl(tab === "despesas" ? operatingTotal : advanceTotal)}
          hint={tab === "despesas" ? "Soma de todas as despesas operacionais cadastradas." : "Soma dos valores antecipados aos motoristas."}
        />
      </div>

      {rows.length === 0 ? (
        <div className="mt-6 rounded-xl border border-dashed border-border px-5 py-12 text-center">
          {tab === "despesas" ? <ReceiptText className="mx-auto size-7 text-muted" /> : <UserRound className="mx-auto size-7 text-muted" />}
          <p className="mt-3 text-sm text-muted">
            {tab === "despesas" ? "Nenhuma despesa cadastrada." : "Nenhum adiantamento cadastrado."}
          </p>
        </div>
      ) : (
        <ul className="mt-6 grid gap-3">
          {rows.map((row) => {
            const isAdvance = row.category === "Adiantamento";
            const fleet = data?.fleets.find((f) => f.id === row.fleetId);
            const driver = data?.drivers.find((d) => d.id === row.driverId);
            return (
              <li key={row.id} className="rounded-xl border border-border bg-surface p-4 sm:p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-md border border-border bg-surface-2 px-2 py-1 text-[10px] uppercase tracking-[0.12em] text-muted">
                        {isAdvance ? "Adiantamento" : row.category}
                      </span>
                      <span className="text-xs text-muted">
                        {isAdvance ? driver?.name ?? "Motorista não informado" : fleet?.name ?? "Despesa geral"}
                      </span>
                    </div>
                    <p className="mt-2 break-words font-display text-2xl font-semibold">{row.description}</p>
                    <p className="text-sm text-muted">
                      {formatDate(row.date)} · {isAdvance ? driver?.name ?? "Motorista" : row.category}
                    </p>
                  </div>
                  <div className="flex items-start gap-2">
                    <p className="mr-1 font-display text-2xl font-semibold tabular">{brl(row.amount)}</p>
                    <Button size="sm" variant="secondary" className="px-3" onClick={() => setEditing(row)} title="Editar"><Pencil className="size-4" /></Button>
                    <Button size="sm" variant="ghost" className="px-3 text-danger" disabled={removeExpense.isPending} onClick={() => handleDelete(row)} title="Excluir"><Trash2 className="size-4" /></Button>
                  </div>
                </div>
                {isAdvance ? (
                  <p className="mt-3 border-t border-border pt-3 text-sm text-muted">
                    Descontado da comissão a pagar de {driver?.name ?? "este motorista"}. Não entra novamente como despesa operacional.
                  </p>
                ) : null}
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
    setAssetType(value.assetType === "trailer" ? "trailer" : "tractor");
    setDriverId(value.driverId ?? data?.drivers[0]?.id ?? "");
    setCategory(value.category ?? "Manutenção");
    setDescription(value.description ?? "");
    setAmount(value.amount ? String(value.amount) : "");
    setNotes(value.notes ?? "");
  };

  useEffect(() => { reset(); }, [value?.id, value?.date, data?.drivers, data?.fleets]);
  const isAdvance = category === "Adiantamento";
  const driver = data?.drivers.find((d) => d.id === driverId);

  return (
    <Dialog open={!!value} onOpenChange={(open) => { if (!open) onClose(); }}>
      {value ? (
        <DialogContent title={value.id ? (isAdvance ? "Editar adiantamento" : "Editar despesa") : (isAdvance ? "Novo adiantamento" : "Nova despesa")}>
          <form className="grid gap-4" onSubmit={async (e) => {
            e.preventDefault();
            const parsedAmount = parseLocaleNumberOrZero(amount);
            if (parsedAmount <= 0) return toast.error("Informe um valor maior que zero.");
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
                description: description.trim() || (isAdvance ? "Adiantamento - " + (driver?.name ?? "Motorista") : "Despesa"),
                amount: parsedAmount,
                notes,
              });
              toast.success(isAdvance ? "Adiantamento salvo e sincronizado com a comissão." : "Despesa salva.");
              onClose();
            } catch (err) {
              toast.error(err instanceof Error ? err.message : "Não foi possível salvar.");
            }
          }}>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Data"><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} required /></Field>
              {isAdvance ? (
                <Field label="Tipo"><Input value="Adiantamento" readOnly /></Field>
              ) : (
                <Field label="Categoria">
                  <Select value={category} onChange={(e) => setCategory(e.target.value)}>
                    {OPERATING_CATEGORIES.map((item) => <option key={item} value={item}>{item}</option>)}
                  </Select>
                </Field>
              )}
            </div>

            {isAdvance ? (
              <Field label="Motorista que recebeu o adiantamento" hint="O valor será abatido da comissão a pagar deste motorista.">
                <Select value={driverId} onChange={(e) => setDriverId(e.target.value)} required>
                  <option value="">Selecione o motorista</option>
                  {(data?.drivers ?? []).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
                </Select>
              </Field>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Conjunto cadastrado">
                  <Select value={fleetId} onChange={(e) => setFleetId(e.target.value)} required>
                    <option value="">Selecione o conjunto</option>
                    {(data?.fleets ?? []).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
                  </Select>
                </Field>
                <Field label="Referência interna">
                  <Select value={assetType} onChange={(e) => setAssetType(e.target.value as ExpenseAssetType)}>
                    <option value="tractor">Cavalo</option>
                    <option value="trailer">Carreta</option>
                  </Select>
                </Field>
              </div>
            )}

            <Field label={isAdvance ? "Descrição do adiantamento" : "Descrição da despesa"}>
              <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder={isAdvance ? "Ex.: adiantamento semanal" : "Ex.: oficina, pneu, peça..."} />
            </Field>
            <Field label="Valor (R$)"><Input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0,00" required /></Field>
            <Field label="Observação"><Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Opcional" /></Field>

            <div className="flex flex-wrap justify-between gap-2 border-t border-border pt-4">
              <div>
                {value.id ? (
                  <Button type="button" variant="ghost" className="text-danger" onClick={() => onDelete(value as Expense)}>
                    <Trash2 className="size-4" /> Excluir
                  </Button>
                ) : null}
              </div>
              <div className="flex gap-2">
                <Button type="button" variant="ghost" onClick={onClose}>Cancelar</Button>
                <Button type="submit" disabled={expense.isPending}>{expense.isPending ? "Salvando…" : "Salvar"}</Button>
              </div>
            </div>
          </form>
        </DialogContent>
      ) : null}
    </Dialog>
  );
}

function Metric({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="rounded-xl border border-border bg-surface p-5">
      <p className="text-[10px] uppercase tracking-[0.14em] text-muted">{label}</p>
      <p className="mt-2 font-display text-3xl font-semibold tabular">{value}</p>
      <p className="mt-2 text-xs text-muted">{hint}</p>
    </div>
  );
}
`;
  write(rel, route);
}

// 2) PAINEL: tornar explícita a comissão total, usando a mesma soma central de trips.
{
  const rel = 'src/routes/dono/index.tsx';
  let s = read(rel);
  if (!s.includes('<Kpi label="Comissões" value={brl(kpis.commissions)} />') && !s.includes('<Kpi label="Comissão total" value={brl(kpis.commissions)} />')) {
    throw new Error('financial-ux-audit: dashboard commission KPI marker missing');
  }
  s = s.replace('<Kpi label="Comissões" value={brl(kpis.commissions)} />', '<Kpi label="Comissão total" value={brl(kpis.commissions)} />');
  write(rel, s);
}

// 3) CADASTROS: deixar a configuração dos valores de frete explícita e fácil de encontrar.
{
  const rel = 'src/routes/dono/cadastros.tsx';
  let s = read(rel);
  if (!s.includes('["fretes", "Preços frete"]') && !s.includes('["fretes", "Valores de frete"]')) {
    throw new Error('financial-ux-audit: freight prices tab marker missing');
  }
  s = s.replace('["fretes", "Preços frete"]', '["fretes", "Valores de frete"]');
  s = s.replace(
    'Defina os valores globais de Por viagem, Cegonha e Caixinha. O preço',
    'Defina os valores de frete usados automaticamente no sistema. Caixinha e Cegonha ficam centralizados aqui; o preço',
  );
  write(rel, s);
}

// 4) VIAGENS: garantir agrupamento por motorista+modalidade apenas para Caixinha/Cegonha.
{
  const rel = 'src/routes/dono/viagens.tsx';
  const s = read(rel);
  const required = [
    'const groupedModeRows = Array.from(',
    't.freightMode !== "caixinha" && t.freightMode !== "cegonha"',
    'const key = String(t.driverId) + "|" + t.freightMode',
    '<Badge>{group.count} viagem{group.count === 1 ? "" : "s"}</Badge>',
  ];
  for (const marker of required) {
    if (!s.includes(marker)) throw new Error('financial-ux-audit: trip grouping invariant missing: ' + marker);
  }
}

// 5) AUDITORIA DE CÁLCULOS EM CÓDIGO: impede build se fórmulas básicas forem removidas por outro patch.
{
  const calc = read('src/lib/calc.ts');
  const required = [
    'const freight = freightOf(trip);',
    'const commissionValue = freight * commissionPct;',
    'const grossResult = freight - dieselCost;',
    'const afterCommission = grossResult - commissionValue;',
    'const commissions = sum(trips, (t) => t.commissionValue);',
  ];
  for (const marker of required) {
    if (!calc.includes(marker)) throw new Error('financial-ux-audit: calculation invariant missing: ' + marker);
  }

  const api = read('src/lib/api.ts');
  const apiRequired = [
    'update trips set price_per_trip',
    'getConfiguredTripPrice',
    'pricePerTrip <= 0',
    'data.pricePerTon <= 0',
  ];
  for (const marker of apiRequired) {
    if (!api.includes(marker)) throw new Error('financial-ux-audit: pricing invariant missing: ' + marker);
  }
}

const dbHost = (() => {
  try { return process.env.DATABASE_URL ? new URL(process.env.DATABASE_URL).hostname : 'DATABASE_URL ausente'; }
  catch { return 'DATABASE_URL inválida'; }
})();
console.log('[financial-ux-audit] despesas/adiantamentos reorganizados + comissão total + valores de frete + agrupamento verificado');
console.log('[financial-ux-audit] database host:', dbHost);
