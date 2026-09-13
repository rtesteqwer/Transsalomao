import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  getKlebersomDashboard,
  getKlebersomSession,
  klebersomLogin,
  klebersomLogout,
} from "@/lib/klebersom-access";

export const Route = createFileRoute("/klebersom")({ component: DriverAccess });

const moneyFmt = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
const exactNumberFmt = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 20 });
const dateFmt = new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC" });

function money(value: number) {
  return moneyFmt.format(Number.isFinite(value) ? value : 0);
}
function exact(value: number) {
  return exactNumberFmt.format(Number.isFinite(value) ? value : 0);
}
function exactTons(value: number) {
  return `${exact(value)} t`;
}
function date(value: string) {
  if (!value) return "—";
  return dateFmt.format(new Date(`${value}T12:00:00Z`));
}
function modeLabel(mode: string) {
  if (mode === "ton") return "Por tonelada";
  if (mode === "trip") return "Por viagem";
  if (mode === "cegonha") return "Cegonha";
  if (mode === "caixinha") return "Caixinha";
  return mode || "—";
}
function fleetLabel(row: { fleetName?: string; tractorPlate?: string; trailerPlate?: string }) {
  return row.fleetName || [row.tractorPlate, row.trailerPlate].filter(Boolean).join(" / ") || "—";
}

type Tab = "painel" | "caixa" | "viagens" | "abastecimentos" | "despesas" | "relatorios";
const tabs: Array<{ id: Tab; label: string }> = [
  { id: "painel", label: "Painel" },
  { id: "caixa", label: "Caixa" },
  { id: "viagens", label: "Viagens" },
  { id: "abastecimentos", label: "Abastecimentos" },
  { id: "despesas", label: "Despesas" },
  { id: "relatorios", label: "Relatórios" },
];

function DriverAccess() {
  const session = useQuery({
    queryKey: ["driver-session"],
    queryFn: () => getKlebersomSession(),
    staleTime: 10_000,
  });
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  if (session.isLoading) return <LoadingPage />;

  if (!session.data?.authenticated) {
    return (
      <main className="min-h-dvh bg-bg px-4 py-8 text-fg sm:py-16">
        <div className="mx-auto max-w-md rounded-2xl border border-border bg-surface p-6 shadow-xl sm:p-8">
          <p className="text-[11px] uppercase tracking-[0.2em] text-muted">Trans Salomão</p>
          <h1 className="mt-2 font-display text-3xl font-semibold">Acesso do motorista</h1>
          <p className="mt-2 text-sm leading-relaxed text-muted">
            Entre pelo Painel da Gerência. Cada motorista visualiza somente os dados ligados ao próprio cadastro.
          </p>
          <form
            className="mt-7 grid gap-4"
            onSubmit={async (event) => {
              event.preventDefault();
              setSubmitting(true);
              setError("");
              try {
                const result = await klebersomLogin({ data: { username: username.trim(), password } });
                if (!result.ok) {
                  setError(result.message);
                  return;
                }
                await session.refetch();
              } catch {
                setError("Não foi possível entrar. Tente novamente.");
              } finally {
                setSubmitting(false);
              }
            }}
          >
            <label className="grid gap-2 text-sm">
              <span className="font-medium">Login</span>
              <input className="h-12 rounded-lg border border-border bg-bg px-3 outline-none" value={username} onChange={(e) => setUsername(e.target.value)} autoCapitalize="none" autoCorrect="off" />
            </label>
            <label className="grid gap-2 text-sm">
              <span className="font-medium">Senha</span>
              <input className="h-12 rounded-lg border border-border bg-bg px-3 outline-none" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
            </label>
            {error ? <p className="rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">{error}</p> : null}
            <button className="h-12 rounded-lg bg-fg px-4 font-semibold text-bg disabled:opacity-50" type="submit" disabled={submitting}>{submitting ? "Entrando..." : "Entrar"}</button>
          </form>
          <Link className="mt-5 inline-block text-sm text-muted hover:text-fg" to="/dono">Voltar ao Painel da Gerência</Link>
        </div>
      </main>
    );
  }

  return <DriverDashboard onLogout={async () => { await klebersomLogout(); await session.refetch(); }} />;
}

function DriverDashboard({ onLogout }: { onLogout: () => Promise<void> }) {
  const [tab, setTab] = useState<Tab>("painel");
  const dashboard = useQuery({
    queryKey: ["driver-dashboard"],
    queryFn: () => getKlebersomDashboard(),
    staleTime: 8_000,
  });

  if (dashboard.isLoading) return <LoadingPage />;
  if (dashboard.isError || !dashboard.data) {
    return (
      <main className="min-h-dvh bg-bg px-4 py-10 text-fg">
        <div className="mx-auto max-w-xl rounded-xl border border-border bg-surface p-6">
          <h1 className="font-display text-2xl font-semibold">Não foi possível carregar os dados</h1>
          <p className="mt-2 text-sm text-muted">A sessão pode ter expirado. Entre novamente pelo Painel da Gerência.</p>
          <button className="mt-5 rounded-lg border border-border px-4 py-2 text-sm" onClick={onLogout}>Sair</button>
        </div>
      </main>
    );
  }

  const data = dashboard.data;
  return (
    <main className="min-h-dvh bg-bg text-fg">
      <header className="sticky top-0 z-20 border-b border-border bg-bg/95">
        <div className="mx-auto max-w-7xl px-4 py-3 lg:px-8">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-[10px] uppercase tracking-[0.2em] text-muted">Trans Salomão · motorista</p>
              <p className="font-display text-lg font-semibold">{data.driver.name}</p>
            </div>
            <div className="flex items-center gap-2">
              <span className="hidden rounded-full border border-border px-3 py-1 text-xs text-muted sm:inline">Somente leitura</span>
              <button className="rounded-lg border border-border px-3 py-2 text-sm text-muted hover:text-fg" onClick={onLogout}>Sair</button>
            </div>
          </div>
          <nav className="mt-3 flex gap-2 overflow-x-auto pb-1">
            {tabs.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setTab(item.id)}
                className={`shrink-0 rounded-lg px-3 py-2 text-sm font-medium ${tab === item.id ? "bg-fg text-bg" : "border border-border bg-surface text-muted hover:text-fg"}`}
              >
                {item.label}
              </button>
            ))}
          </nav>
        </div>
      </header>

      <div className="mx-auto max-w-7xl px-4 py-6 lg:px-8 lg:py-8">
        <div className="mb-6 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-[11px] uppercase tracking-[0.18em] text-muted">Acesso individual</p>
            <h1 className="mt-1 font-display text-3xl font-semibold">{tabs.find((item) => item.id === tab)?.label}</h1>
          </div>
          <div className="text-xs text-muted">Comissão cadastrada: {exact(data.driver.commissionPct * 100)}%</div>
        </div>

        {tab === "painel" ? <Painel data={data} /> : null}
        {tab === "caixa" ? <Caixa data={data} /> : null}
        {tab === "viagens" ? <Viagens data={data} /> : null}
        {tab === "abastecimentos" ? <Abastecimentos data={data} /> : null}
        {tab === "despesas" ? <Despesas data={data} /> : null}
        {tab === "relatorios" ? <Relatorios data={data} /> : null}
      </div>
    </main>
  );
}

function Painel({ data }: { data: any }) {
  return (
    <>
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Faturamento" value={money(data.totals.billing)} />
        <Stat label="Comissão" value={money(data.totals.commission)} />
        <Stat label="Despesas" value={money(data.totals.totalExpenses)} />
        <Stat label="Resultado" value={money(data.totals.result)} emphasis />
      </section>
      <section className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MiniStat label="Viagens" value={String(data.totals.trips)} />
        <MiniStat label="Peso líquido total" value={exactTons(data.totals.totalTons)} />
        <MiniStat label="KM total" value={`${exact(data.totals.totalKm)} km`} />
        <MiniStat label="Abastecimentos" value={money(data.totals.fuelExpenses)} />
      </section>
      <section className="mt-6 rounded-2xl border border-border bg-surface p-5">
        <h2 className="font-display text-xl font-semibold">Últimas viagens</h2>
        <div className="mt-4 grid gap-2">
          {data.trips.slice(0, 6).map((trip: any) => (
            <div key={trip.id} className="flex flex-col gap-1 rounded-lg border border-border px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
              <div><b>Ticket {trip.code}</b><div className="text-xs text-muted">{date(trip.date)} · {fleetLabel(trip)} · {exactTons(trip.netWeight)}</div></div>
              <div className="text-right"><b>{money(trip.freight)}</b><div className="text-xs text-muted">Comissão {money(trip.commission)}</div></div>
            </div>
          ))}
        </div>
      </section>
    </>
  );
}

function Caixa({ data }: { data: any }) {
  return (
    <section className="rounded-2xl border border-border bg-surface p-4 sm:p-6">
      <div className="grid gap-3 sm:grid-cols-3">
        <MiniStat label="Faturamento" value={money(data.totals.billing)} />
        <MiniStat label="Comissão" value={money(data.totals.commission)} />
        <MiniStat label="Após comissão" value={money(data.totals.billing - data.totals.commission)} />
      </div>
      <div className="mt-5 overflow-x-auto">
        <table className="w-full min-w-[780px] text-left text-sm">
          <thead className="border-b border-border text-[10px] uppercase tracking-[0.12em] text-muted"><tr><th className="px-2 py-3">Ticket</th><th className="px-2 py-3">Data</th><th className="px-2 py-3">Toneladas</th><th className="px-2 py-3">Faturamento</th><th className="px-2 py-3">Comissão</th><th className="px-2 py-3">Após comissão</th></tr></thead>
          <tbody className="divide-y divide-border">
            {data.trips.map((trip: any) => <tr key={trip.id}><td className="px-2 py-3 font-semibold">{trip.code}</td><td className="px-2 py-3">{date(trip.date)}</td><td className="px-2 py-3">{exactTons(trip.netWeight)}</td><td className="px-2 py-3">{money(trip.freight)}</td><td className="px-2 py-3">{money(trip.commission)}</td><td className="px-2 py-3 font-medium">{money(trip.afterCommission)}</td></tr>)}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function Viagens({ data }: { data: any }) {
  return <DataTable headers={["Ticket", "Data", "Cliente", "Modo", "Peso líquido", "Preço", "Frete", "KM", "Conjunto"]} rows={data.trips.map((trip: any) => [trip.code, date(trip.date), trip.client || "—", modeLabel(trip.freightMode), exactTons(trip.netWeight), trip.freightMode === "ton" ? `${money(trip.pricePerTon)}/t` : money(trip.pricePerTrip), money(trip.freight), `${exact(trip.kmRun)} km`, fleetLabel(trip)])} />;
}

function Abastecimentos({ data }: { data: any }) {
  return <DataTable headers={["Data", "Posto", "Conjunto", "KM", "Litros", "Preço/L", "Total"]} rows={data.fuelings.map((row: any) => [date(row.date), row.station || "—", fleetLabel(row), exact(row.km), `${exact(row.liters)} L`, money(row.pricePerLiter), money(row.amount)])} empty="Nenhum abastecimento vinculado a este motorista." />;
}

function Despesas({ data }: { data: any }) {
  return (
    <>
      <section className="grid gap-3 sm:grid-cols-3">
        <MiniStat label="Despesas lançadas" value={money(data.totals.explicitExpenses)} />
        <MiniStat label="Combustível" value={money(data.totals.fuelExpenses)} />
        <MiniStat label="Total de despesas" value={money(data.totals.totalExpenses)} />
      </section>
      <div className="mt-5"><DataTable headers={["Data", "Categoria", "Descrição", "Tipo", "Conjunto", "Valor"]} rows={data.expenses.map((row: any) => [date(row.date), row.category || "—", row.description || "—", row.assetType || "—", fleetLabel(row), money(row.amount)])} empty="Nenhuma despesa direta vinculada a este motorista." /></div>
    </>
  );
}

function Relatorios({ data }: { data: any }) {
  return <DataTable headers={["Ticket", "Data", "Status", "Modo", "Toneladas", "KM", "Conjunto", "Faturamento", "Comissão"]} rows={data.reports.map((row: any) => [row.ticket || "—", date(row.date), row.status || "—", modeLabel(row.freightMode), exactTons(row.tons), exact(row.km), fleetLabel(row), row.freight ? money(row.freight) : "—", row.freight ? money(row.commission) : "—"])} empty="Nenhum relatório vinculado a este motorista." />;
}

function DataTable({ headers, rows, empty = "Nenhum registro encontrado." }: { headers: string[]; rows: Array<Array<string>>; empty?: string }) {
  return (
    <section className="rounded-2xl border border-border bg-surface p-4 sm:p-6">
      {rows.length === 0 ? <p className="rounded-lg border border-dashed border-border px-4 py-8 text-center text-sm text-muted">{empty}</p> : (
        <div className="overflow-x-auto"><table className="w-full min-w-[820px] text-left text-sm"><thead className="border-b border-border text-[10px] uppercase tracking-[0.12em] text-muted"><tr>{headers.map((header) => <th key={header} className="px-2 py-3">{header}</th>)}</tr></thead><tbody className="divide-y divide-border">{rows.map((row, rowIndex) => <tr key={rowIndex}>{row.map((cell, index) => <td key={`${rowIndex}-${index}`} className="px-2 py-3">{cell}</td>)}</tr>)}</tbody></table></div>
      )}
    </section>
  );
}

function Stat({ label, value, emphasis = false }: { label: string; value: string; emphasis?: boolean }) {
  return <div className={`rounded-xl border p-4 ${emphasis ? "border-foreground/30 bg-surface-2" : "border-border bg-surface"}`}><p className="text-[10px] uppercase tracking-[0.14em] text-muted">{label}</p><p className="mt-2 font-display text-2xl font-semibold tabular">{value}</p></div>;
}
function MiniStat({ label, value }: { label: string; value: string }) {
  return <div className="rounded-xl border border-border bg-surface px-4 py-3"><p className="text-[10px] uppercase tracking-[0.12em] text-muted">{label}</p><p className="mt-1 font-medium tabular">{value}</p></div>;
}
function LoadingPage() {
  return <main className="grid min-h-dvh place-items-center bg-bg px-4 text-fg"><div className="text-center"><p className="text-[11px] uppercase tracking-[0.2em] text-muted">Trans Salomão</p><p className="mt-2 font-display text-2xl font-semibold">Carregando...</p></div></main>;
}
