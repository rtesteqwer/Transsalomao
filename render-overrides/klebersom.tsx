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
const weightFmt = new Intl.NumberFormat("pt-BR", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
const dateFmt = new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC" });

function money(value: number) {
  return moneyFmt.format(Number.isFinite(value) ? value : 0);
}
function exact(value: number) {
  return exactNumberFmt.format(Number.isFinite(value) ? value : 0);
}
function exactTons(value: number) {
  return `${weightFmt.format(Number.isFinite(value) ? value : 0)} t`;
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
function escapeHtml(value: unknown) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
function safeFileName(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z0-9_-]+/g, "_").replace(/^_+|_+$/g, "") || "motorista";
}
function reportRows(data: any) {
  return data.trips.map((trip: any) => ({
    ticket: trip.code || "—",
    date: date(trip.date),
    mode: modeLabel(trip.freightMode),
    weight: exactTons(trip.netWeight),
    km: `${exact(trip.kmRun)} km`,
    fleet: fleetLabel(trip),
    billing: money(trip.freight),
    commission: money(trip.commission),
    afterCommission: money(trip.afterCommission),
  }));
}
function downloadColoredExcel(data: any) {
  const rows = reportRows(data);
  const body = rows.map((row: any, index: number) => {
    const rowBg = index % 2 === 0 ? "#eef5ff" : "#ffffff";
    return `<tr style="background:${rowBg};height:22px">
      <td>${escapeHtml(row.ticket)}</td>
      <td>${escapeHtml(row.date)}</td>
      <td>${escapeHtml(row.mode)}</td>
      <td style="background:#fff4cc;font-weight:700">${escapeHtml(row.weight)}</td>
      <td>${escapeHtml(row.km)}</td>
      <td>${escapeHtml(row.fleet)}</td>
      <td style="background:#e8f7ec;font-weight:700">${escapeHtml(row.billing)}</td>
      <td style="background:#fff0df">${escapeHtml(row.commission)}</td>
      <td style="background:#e5f3ff;font-weight:700">${escapeHtml(row.afterCommission)}</td>
    </tr>`;
  }).join("");
  const html = `<!doctype html><html><head><meta charset="utf-8"><style>
    body{font-family:Arial,sans-serif;color:#132033} h1{font-size:20px;margin:0 0 4px} p{margin:0 0 12px;color:#546173}
    table{border-collapse:collapse;width:100%;font-size:11px} th{background:#102a43;color:white;font-weight:700;padding:7px;border:1px solid #7c8da0;text-align:left}
    td{padding:6px;border:1px solid #b8c4d0;white-space:nowrap} .summary td{font-weight:700;background:#dbeafe}
  </style></head><body>
    <h1>Trans Salomão — Relatório de Fretes</h1>
    <p>Motorista: ${escapeHtml(data.driver.name)} · Uma linha por frete</p>
    <table><thead><tr><th>Ticket</th><th>Data</th><th>Modalidade</th><th>Peso líquido</th><th>KM</th><th>Conjunto</th><th>Faturamento</th><th>Comissão</th><th>Após comissão</th></tr></thead><tbody>${body}</tbody></table>
    <br/><table class="summary"><tr><td>Viagens</td><td>${escapeHtml(data.totals.trips)}</td><td>Peso líquido total</td><td>${escapeHtml(exactTons(data.totals.totalTons))}</td><td>Faturamento</td><td>${escapeHtml(money(data.totals.billing))}</td><td>Comissão</td><td>${escapeHtml(money(data.totals.commission))}</td></tr></table>
  </body></html>`;
  const blob = new Blob(["\ufeff", html], { type: "application/vnd.ms-excel;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `Relatorio_${safeFileName(data.driver.name)}.xls`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
function generatePdf(data: any) {
  const rows = reportRows(data);
  const body = rows.map((row: any, index: number) => `<tr class="${index % 2 === 0 ? "even" : "odd"}">
    <td>${escapeHtml(row.ticket)}</td><td>${escapeHtml(row.date)}</td><td>${escapeHtml(row.mode)}</td><td>${escapeHtml(row.weight)}</td><td>${escapeHtml(row.km)}</td><td>${escapeHtml(row.fleet)}</td><td>${escapeHtml(row.billing)}</td><td>${escapeHtml(row.commission)}</td><td>${escapeHtml(row.afterCommission)}</td>
  </tr>`).join("");
  const popup = window.open("", "_blank", "noopener,noreferrer");
  if (!popup) return;
  popup.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Relatório - ${escapeHtml(data.driver.name)}</title><style>
    @page{size:A4 landscape;margin:8mm} *{box-sizing:border-box} body{font-family:Arial,sans-serif;color:#111827;margin:0} h1{font-size:16px;margin:0 0 3px} .meta{font-size:9px;color:#4b5563;margin-bottom:8px}
    table{width:100%;border-collapse:collapse;table-layout:auto;font-size:7.7px} thead{display:table-header-group} th{background:#102a43;color:#fff;padding:4px 3px;border:1px solid #8492a6;white-space:nowrap;text-align:left}
    td{padding:3px;border:1px solid #c5ced8;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:150px}.even{background:#f4f8fc}.summary{margin-top:8px;font-size:8px}.summary td{background:#e8f1fb;font-weight:700}
    .note{font-size:8px;margin-top:5px;color:#52606d}
  </style></head><body>
    <h1>Trans Salomão — Relatório de Fretes</h1><div class="meta">Motorista: ${escapeHtml(data.driver.name)} · ${rows.length} fretes · uma linha por frete · Peso líquido total: ${escapeHtml(exactTons(data.totals.totalTons))}</div>
    <table><thead><tr><th>Ticket</th><th>Data</th><th>Modalidade</th><th>Peso líquido</th><th>KM</th><th>Conjunto</th><th>Faturamento</th><th>Comissão</th><th>Após comissão</th></tr></thead><tbody>${body}</tbody></table>
    <table class="summary"><tr><td>Faturamento: ${escapeHtml(money(data.totals.billing))}</td><td>Comissão: ${escapeHtml(money(data.totals.commission))}</td><td>Despesas: ${escapeHtml(money(data.totals.totalExpenses))}</td><td>Resultado: ${escapeHtml(money(data.totals.result))}</td></tr></table>
    <div class="note">Relatório em formato compacto: cada frete ocupa exatamente uma linha.</div>
    <script>window.addEventListener('load',()=>setTimeout(()=>window.print(),150));<\/script>
  </body></html>`);
  popup.document.close();
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
  const rows = data.trips.map((trip: any) => [
    trip.code || "—",
    date(trip.date),
    modeLabel(trip.freightMode),
    exactTons(trip.netWeight),
    `${exact(trip.kmRun)} km`,
    fleetLabel(trip),
    money(trip.freight),
    money(trip.commission),
    money(trip.afterCommission),
  ]);
  return (
    <>
      <section className="mb-4 flex flex-col gap-3 rounded-2xl border border-border bg-surface p-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="font-display text-lg font-semibold">Exportar relatório</p>
          <p className="mt-1 text-xs text-muted">Somente Excel colorido ou PDF. Cada frete ocupa uma única linha.</p>
        </div>
        <div className="flex gap-2">
          <button type="button" className="rounded-lg border border-border bg-surface-2 px-4 py-2 text-sm font-semibold hover:bg-surface" onClick={() => downloadColoredExcel(data)}>Excel colorido</button>
          <button type="button" className="rounded-lg bg-fg px-4 py-2 text-sm font-semibold text-bg" onClick={() => generatePdf(data)}>Gerar PDF</button>
        </div>
      </section>
      <DataTable headers={["Ticket", "Data", "Modo", "Peso líquido", "KM", "Conjunto", "Faturamento", "Comissão", "Após comissão"]} rows={rows} empty="Nenhum frete vinculado a este motorista." />
    </>
  );
}

function DataTable({ headers, rows, empty = "Nenhum registro encontrado." }: { headers: string[]; rows: Array<Array<string>>; empty?: string }) {
  return (
    <section className="rounded-2xl border border-border bg-surface p-4 sm:p-6">
      {rows.length === 0 ? <p className="rounded-lg border border-dashed border-border px-4 py-8 text-center text-sm text-muted">{empty}</p> : (
        <div className="overflow-x-auto"><table className="w-full min-w-[820px] text-left text-sm"><thead className="border-b border-border text-[10px] uppercase tracking-[0.12em] text-muted"><tr>{headers.map((header) => <th key={header} className="px-2 py-3">{header}</th>)}</tr></thead><tbody className="divide-y divide-border">{rows.map((row, rowIndex) => <tr key={rowIndex}>{row.map((cell, index) => <td key={`${rowIndex}-${index}`} className="whitespace-nowrap px-2 py-3">{cell}</td>)}</tr>)}</tbody></table></div>
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
