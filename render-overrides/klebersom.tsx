import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  getKlebersomDashboard,
  getKlebersomSession,
  klebersomLogin,
  klebersomLogout,
} from "@/lib/klebersom-access";

export const Route = createFileRoute("/klebersom")({
  component: KlebersomAccess,
});

const moneyFmt = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
const exactNumberFmt = new Intl.NumberFormat("pt-BR", {
  maximumFractionDigits: 20,
});
const dateFmt = new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC" });

function money(value: number) {
  return moneyFmt.format(value);
}
function exactTons(value: number) {
  return `${exactNumberFmt.format(value)} t`;
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

function KlebersomAccess() {
  const session = useQuery({
    queryKey: ["klebersom-session"],
    queryFn: () => getKlebersomSession(),
    staleTime: 15_000,
  });
  const [username, setUsername] = useState("KlebersomDurtra");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  if (session.isLoading) {
    return <LoadingPage />;
  }

  if (!session.data?.authenticated) {
    return (
      <main className="min-h-dvh bg-bg px-4 py-8 text-fg sm:py-16">
        <div className="mx-auto max-w-md rounded-2xl border border-border bg-surface p-6 shadow-xl sm:p-8">
          <p className="text-[11px] uppercase tracking-[0.2em] text-muted">Trans Salomão</p>
          <h1 className="mt-2 font-display text-3xl font-semibold">Acesso do motorista</h1>
          <p className="mt-2 text-sm leading-relaxed text-muted">
            Área privada de consulta. Este acesso mostra somente resultados financeiros vinculados ao motorista autorizado.
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
              <input
                className="h-12 rounded-lg border border-border bg-bg px-3 outline-none focus:border-foreground/50"
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                autoCapitalize="none"
                autoCorrect="off"
              />
            </label>
            <label className="grid gap-2 text-sm">
              <span className="font-medium">Senha</span>
              <input
                className="h-12 rounded-lg border border-border bg-bg px-3 outline-none focus:border-foreground/50"
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoComplete="current-password"
              />
            </label>
            {error ? <p className="rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">{error}</p> : null}
            <button
              className="mt-1 h-12 rounded-lg bg-fg px-4 font-semibold text-bg disabled:opacity-50"
              type="submit"
              disabled={submitting}
            >
              {submitting ? "Entrando..." : "Entrar"}
            </button>
          </form>
          <Link className="mt-5 inline-block text-sm text-muted hover:text-fg" to="/">
            Voltar ao início
          </Link>
        </div>
      </main>
    );
  }

  return <ReadOnlyDashboard onLogout={async () => {
    await klebersomLogout();
    await session.refetch();
  }} />;
}

function ReadOnlyDashboard({ onLogout }: { onLogout: () => Promise<void> }) {
  const dashboard = useQuery({
    queryKey: ["klebersom-dashboard"],
    queryFn: () => getKlebersomDashboard(),
    staleTime: 10_000,
  });

  if (dashboard.isLoading) return <LoadingPage />;
  if (dashboard.isError || !dashboard.data) {
    return (
      <main className="min-h-dvh bg-bg px-4 py-10 text-fg">
        <div className="mx-auto max-w-xl rounded-xl border border-border bg-surface p-6">
          <h1 className="font-display text-2xl font-semibold">Não foi possível carregar os dados</h1>
          <p className="mt-2 text-sm text-muted">Atualize a página ou entre novamente.</p>
          <button className="mt-5 rounded-lg border border-border px-4 py-2 text-sm" onClick={onLogout}>Sair</button>
        </div>
      </main>
    );
  }

  const data = dashboard.data;
  return (
    <main className="min-h-dvh bg-bg text-fg">
      <header className="sticky top-0 z-20 border-b border-border bg-bg/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-4 lg:px-8">
          <div>
            <p className="text-[10px] uppercase tracking-[0.2em] text-muted">Trans Salomão · consulta</p>
            <p className="font-display text-lg font-semibold">{data.driver.name}</p>
          </div>
          <button className="rounded-lg border border-border px-3 py-2 text-sm text-muted hover:text-fg" onClick={onLogout}>Sair</button>
        </div>
      </header>

      <div className="mx-auto max-w-6xl px-4 py-6 lg:px-8 lg:py-8">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-[11px] uppercase tracking-[0.18em] text-muted">Painel financeiro individual</p>
            <h1 className="mt-1 font-display text-3xl font-semibold sm:text-4xl">Resultados e faturamento</h1>
          </div>
          <div className="rounded-full border border-border bg-surface px-3 py-1.5 text-xs text-muted">
            Somente leitura · Comissão {exactNumberFmt.format(data.driver.commissionPct * 100)}%
          </div>
        </div>

        <section className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Stat label="Faturamento" value={money(data.totals.billing)} />
          <Stat label="Comissão" value={money(data.totals.commission)} />
          <Stat label="Despesas" value={money(data.totals.totalExpenses)} />
          <Stat label="Resultado" value={money(data.totals.result)} emphasis />
        </section>

        <section className="mt-3 grid gap-3 sm:grid-cols-3">
          <MiniStat label="Viagens" value={String(data.totals.trips)} />
          <MiniStat label="Peso líquido total" value={exactTons(data.totals.totalTons)} />
          <MiniStat label="Combustível" value={money(data.totals.fuelExpenses)} />
        </section>

        <section className="mt-8 rounded-2xl border border-border bg-surface p-4 sm:p-6">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-[11px] uppercase tracking-[0.16em] text-muted">Histórico</p>
              <h2 className="mt-1 font-display text-2xl font-semibold">Viagens e comissão</h2>
            </div>
            <span className="text-xs text-muted">{data.trips.length} registros</span>
          </div>
          {data.trips.length === 0 ? (
            <p className="mt-5 rounded-lg border border-dashed border-border px-4 py-8 text-center text-sm text-muted">Nenhuma viagem vinculada.</p>
          ) : (
            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[760px] text-left text-sm">
                <thead className="border-b border-border text-[10px] uppercase tracking-[0.12em] text-muted">
                  <tr>
                    <th className="px-2 py-3">Ticket</th>
                    <th className="px-2 py-3">Data</th>
                    <th className="px-2 py-3">Modo</th>
                    <th className="px-2 py-3">Peso</th>
                    <th className="px-2 py-3">Faturamento</th>
                    <th className="px-2 py-3">Comissão</th>
                    <th className="px-2 py-3">Conjunto</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {data.trips.map((trip) => (
                    <tr key={trip.id}>
                      <td className="px-2 py-3 font-semibold tabular">{trip.code}</td>
                      <td className="px-2 py-3 text-muted">{date(trip.date)}</td>
                      <td className="px-2 py-3">{modeLabel(trip.freightMode)}</td>
                      <td className="px-2 py-3 tabular">{exactTons(trip.netWeight)}</td>
                      <td className="px-2 py-3 tabular">{money(trip.freight)}</td>
                      <td className="px-2 py-3 tabular">{money(trip.commission)}</td>
                      <td className="px-2 py-3 text-muted">{trip.fleetName || [trip.tractorPlate, trip.trailerPlate].filter(Boolean).join(" / ") || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="mt-6 grid gap-6 lg:grid-cols-2">
          <ExpenseCard
            title="Despesas lançadas"
            total={data.totals.explicitExpenses}
            empty="Nenhuma despesa direta vinculada a este motorista."
            rows={data.expenses.map((expense) => ({
              id: expense.id,
              date: expense.date,
              title: expense.description || expense.category || "Despesa",
              detail: [expense.category, expense.assetType].filter(Boolean).join(" · "),
              amount: expense.amount,
            }))}
          />
          <ExpenseCard
            title="Abastecimentos"
            total={data.totals.fuelExpenses}
            empty="Nenhum abastecimento vinculado a este motorista."
            rows={data.fuelings.map((fueling) => ({
              id: fueling.id,
              date: fueling.date,
              title: fueling.station || "Abastecimento",
              detail: `${exactNumberFmt.format(fueling.liters)} L × ${money(fueling.pricePerLiter)}`,
              amount: fueling.amount,
            }))}
          />
        </section>
      </div>
    </main>
  );
}

function Stat({ label, value, emphasis = false }: { label: string; value: string; emphasis?: boolean }) {
  return (
    <div className={`rounded-xl border p-4 ${emphasis ? "border-foreground/30 bg-surface-2" : "border-border bg-surface"}`}>
      <p className="text-[10px] uppercase tracking-[0.14em] text-muted">{label}</p>
      <p className="mt-2 font-display text-2xl font-semibold tabular">{value}</p>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border bg-surface px-4 py-3">
      <p className="text-[10px] uppercase tracking-[0.12em] text-muted">{label}</p>
      <p className="mt-1 font-medium tabular">{value}</p>
    </div>
  );
}

type ExpenseRow = { id: string; date: string; title: string; detail: string; amount: number };
function ExpenseCard({ title, total, empty, rows }: { title: string; total: number; empty: string; rows: ExpenseRow[] }) {
  return (
    <div className="rounded-2xl border border-border bg-surface p-4 sm:p-6">
      <div className="flex items-end justify-between gap-3">
        <h2 className="font-display text-xl font-semibold">{title}</h2>
        <p className="font-semibold tabular">{money(total)}</p>
      </div>
      {rows.length === 0 ? (
        <p className="mt-4 rounded-lg border border-dashed border-border px-4 py-7 text-center text-sm text-muted">{empty}</p>
      ) : (
        <ul className="mt-4 divide-y divide-border">
          {rows.map((row) => (
            <li key={row.id} className="flex items-start justify-between gap-3 py-3">
              <div>
                <p className="font-medium">{row.title}</p>
                <p className="mt-0.5 text-xs text-muted">{date(row.date)}{row.detail ? ` · ${row.detail}` : ""}</p>
              </div>
              <p className="shrink-0 font-medium tabular">{money(row.amount)}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function LoadingPage() {
  return (
    <main className="grid min-h-dvh place-items-center bg-bg px-4 text-fg">
      <div className="text-center">
        <p className="text-[11px] uppercase tracking-[0.2em] text-muted">Trans Salomão</p>
        <p className="mt-2 font-display text-2xl font-semibold">Carregando...</p>
      </div>
    </main>
  );
}
