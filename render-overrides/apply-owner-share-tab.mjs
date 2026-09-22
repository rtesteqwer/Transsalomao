import fs from 'node:fs';
import path from 'node:path';

const target = process.argv[2];
if (!target || !fs.existsSync(target)) throw new Error('owner-share-tab: target missing');

const componentPath = path.join(target, 'src', 'components', 'owner', 'felipe-share-panel.tsx');
const oldTabPath = path.join(target, 'src', 'components', 'owner', 'felipe-share-tab.tsx');
const oldPagePath = path.join(target, 'src', 'routes', 'dono', 'participacao.tsx');
fs.mkdirSync(path.dirname(componentPath), { recursive: true });
fs.rmSync(oldTabPath, { force: true });
fs.rmSync(oldPagePath, { force: true });

fs.writeFileSync(componentPath, `import { createServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useState } from "react";

type Row = Record<string, any>;
type PeriodKey = "7d" | "30d" | "month" | "all";
type MonthRow = { month: string; companyGross: number; share: number };
type PeriodTotals = { companyGross: number; share: number };
type ShareData = {
  authorized: boolean;
  username: string | null;
  currentMonth?: string;
  currentCompanyGross?: number;
  currentShare?: number;
  totalCompanyGross?: number;
  totalShare?: number;
  periods?: Record<PeriodKey, PeriodTotals>;
  months?: MonthRow[];
};

const getFelipeShare = createServerFn({ method: "GET" }).handler(async () => {
  const { managementSession } = await import("@/lib/management-auth.server");
  const session = managementSession();
  const username = session?.username ?? null;
  if (!session || String(username).trim().toLocaleLowerCase("pt-BR") !== "felipe") {
    return { authorized: false, username } satisfies ShareData;
  }

  const SHARE_RATE = 0.03;
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit"
  }).format(new Date());
  const currentMonth = today.slice(0, 7);
  const [year, month] = currentMonth.split("-").map(Number);
  const monthKeys: string[] = [];
  for (let i = 11; i >= 0; i -= 1) {
    const d = new Date(Date.UTC(year, month - 1 - i, 1));
    monthKeys.push(d.getUTCFullYear() + "-" + String(d.getUTCMonth() + 1).padStart(2, "0"));
  }
  const todayUtc = new Date(today + "T00:00:00Z");
  const daysAgo = (days: number) => new Date(todayUtc.getTime() - days * 86400000).toISOString().slice(0, 10);
  const start7 = daysAgo(6);
  const start30 = daysAgo(29);
  const startMonth = currentMonth + "-01";

  const { getSql } = await import("@/lib/db");
  const sql = await getSql();
  const trips = await sql<Row>\`
    select date::text as date, freight_mode, net_weight, price_per_ton, price_per_trip
    from trips
    order by date asc
  \`;

  const totals = new Map(monthKeys.map((key) => [key, 0]));
  const periodGross: Record<PeriodKey, number> = { "7d": 0, "30d": 0, month: 0, all: 0 };
  const num = (value: unknown) => {
    const n = Number(value ?? 0);
    return Number.isFinite(n) ? n : 0;
  };
  for (const trip of trips) {
    const dateOnly = String(trip.date ?? "").slice(0, 10);
    const key = dateOnly.slice(0, 7);
    const gross = String(trip.freight_mode ?? "") === "ton"
      ? num(trip.net_weight) * num(trip.price_per_ton)
      : num(trip.price_per_trip);

    periodGross.all += gross;
    if (dateOnly >= start7 && dateOnly <= today) periodGross["7d"] += gross;
    if (dateOnly >= start30 && dateOnly <= today) periodGross["30d"] += gross;
    if (dateOnly >= startMonth && dateOnly <= today) periodGross.month += gross;
    if (totals.has(key)) totals.set(key, (totals.get(key) ?? 0) + gross);
  }

  const months = monthKeys.map((key) => {
    const companyGross = totals.get(key) ?? 0;
    return { month: key, companyGross, share: companyGross * SHARE_RATE };
  });
  const current = months.find((item) => item.month === currentMonth) ?? { companyGross: 0, share: 0 };
  const periods = Object.fromEntries(
    (Object.entries(periodGross) as Array<[PeriodKey, number]>).map(([key, companyGross]) => [
      key,
      { companyGross, share: companyGross * SHARE_RATE },
    ])
  ) as Record<PeriodKey, PeriodTotals>;

  return {
    authorized: true,
    username,
    currentMonth,
    currentCompanyGross: current.companyGross,
    currentShare: current.share,
    totalCompanyGross: months.reduce((sum, item) => sum + item.companyGross, 0),
    totalShare: months.reduce((sum, item) => sum + item.share, 0),
    periods,
    months,
  } satisfies ShareData;
});

function brl(value: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value || 0);
}
function monthLabel(value: string) {
  if (!value) return "";
  const [year, month] = value.split("-").map(Number);
  return new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric", timeZone: "UTC" })
    .format(new Date(Date.UTC(year, month - 1, 1)));
}

const SHARE_PERIODS: Array<{ key: PeriodKey; label: string }> = [
  { key: "7d", label: "7 dias" },
  { key: "30d", label: "30 dias" },
  { key: "month", label: "Este mês" },
  { key: "all", label: "Tudo" },
];

export function FelipeSharePanel() {
  const [data, setData] = useState<ShareData | null>(null);
  const [period, setPeriod] = useState<PeriodKey>("month");
  const [open, setOpen] = useState(true);

  useEffect(() => {
    let active = true;
    getFelipeShare()
      .then((result) => active && setData(result as ShareData))
      .catch(() => active && setData({ authorized: false, username: null }));
    return () => { active = false; };
  }, []);

  const months = useMemo(() => [...(data?.months ?? [])].reverse(), [data?.months]);
  if (!data?.authorized) return null;
  const selected = data.periods?.[period] ?? { companyGross: 0, share: 0 };
  const selectedLabel = SHARE_PERIODS.find((item) => item.key === period)?.label ?? "Este mês";

  return (
    <section className="my-5 overflow-hidden rounded-2xl border border-border bg-surface shadow-sm">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="flex w-full items-center justify-between gap-4 border-b border-border px-5 py-4 text-left"
        aria-expanded={open}
      >
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">Exclusivo do login Felipe</p>
          <h2 className="mt-1 text-xl font-bold text-fg">Faturamento dos meus 3%</h2>
          <p className="mt-1 text-sm text-muted">Sua participação de 3% calculada sobre o faturamento bruto da Trans Salomão.</p>
        </div>
        <span className="rounded-xl border border-border bg-surface-2 px-3 py-2 text-sm font-bold">{open ? "Ocultar" : "Abrir"}</span>
      </button>

      {open ? (
        <div className="space-y-5 p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted">Período dos 3%</p>
              <p className="mt-1 text-sm font-semibold text-fg">{selectedLabel}</p>
            </div>
            <div className="flex flex-wrap gap-1 rounded-lg border border-border bg-surface p-1">
              {SHARE_PERIODS.map((item) => (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => setPeriod(item.key)}
                  className={"h-9 rounded-md px-3 text-sm " + (period === item.key ? "bg-accent text-accent-fg" : "text-muted hover:text-fg")}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            <ShareCard label="Faturamento bruto do período" value={brl(selected.companyGross)} detail={selectedLabel} />
            <ShareCard label="Minha parte (3%)" value={brl(selected.share)} detail={"3% • " + selectedLabel} emphasis />
            <ShareCard label="Minha parte em 12 meses" value={brl(data.totalShare ?? 0)} detail={"Sobre " + brl(data.totalCompanyGross ?? 0) + " de faturamento"} emphasis />
          </div>

          <div className="overflow-x-auto rounded-xl border border-border">
            <table className="min-w-full text-sm">
              <thead className="bg-surface-2 text-left">
                <tr>
                  <th className="px-4 py-3 font-semibold">Mês</th>
                  <th className="px-4 py-3 text-right font-semibold">Faturamento bruto</th>
                  <th className="px-4 py-3 text-right font-semibold">Minha parte (3%)</th>
                </tr>
              </thead>
              <tbody>
                {months.map((item) => (
                  <tr key={item.month} className="border-t border-border">
                    <td className="px-4 py-3 capitalize">{monthLabel(item.month)}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{brl(item.companyGross)}</td>
                    <td className="px-4 py-3 text-right font-bold tabular-nums">{brl(item.share)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}
    </section>
  );
}

function ShareCard({ label, value, detail, emphasis = false }: { label: string; value: string; detail: string; emphasis?: boolean }) {
  return (
    <div className={"rounded-xl border border-border p-4 " + (emphasis ? "bg-surface-2" : "bg-surface")}>
      <p className="text-xs font-semibold uppercase tracking-wide text-muted">{label}</p>
      <p className="mt-2 text-2xl font-bold tabular-nums text-fg">{value}</p>
      <p className="mt-1 text-xs text-muted">{detail}</p>
    </div>
  );
}
`);

function addImport(source, statement) {
  if (source.includes(statement)) return source;
  const lines = source.split('\n');
  let lastImport = -1;
  for (let i = 0; i < lines.length; i += 1) if (/^import\s/.test(lines[i])) lastImport = i;
  lines.splice(lastImport + 1, 0, statement);
  return lines.join('\n');
}

const dashboardPath = path.join(target, 'src', 'routes', 'dono', 'index.tsx');
if (!fs.existsSync(dashboardPath)) throw new Error('owner-share-tab: dashboard route missing');
let dashboard = fs.readFileSync(dashboardPath, 'utf8');
dashboard = dashboard.replace(/import \{ FelipeShareTab \} from [^\n]+\n?/g, '');
dashboard = dashboard.replace(/<FelipeShareTab\s*\/>\s*/g, '');
dashboard = dashboard.replace(/\s*<FelipeSharePanel\s*\/>\s*/g, '\n');
dashboard = addImport(dashboard, 'import { FelipeSharePanel } from "@/components/owner/felipe-share-panel";');
if (!dashboard.includes('<FelipeSharePanel')) {
  const marker = '      <div className="mt-5 max-w-sm">';
  if (!dashboard.includes(marker)) throw new Error('owner-share-tab: billing controls marker missing');
  dashboard = dashboard.replace(marker, '      <FelipeSharePanel />\n\n' + marker);
}
fs.writeFileSync(dashboardPath, dashboard);

const shellPath = path.join(target, 'src', 'components', 'owner', 'shell.tsx');
if (fs.existsSync(shellPath)) {
  let shell = fs.readFileSync(shellPath, 'utf8');
  shell = shell.replace(/import \{ FelipeShareTab \} from [^\n]+\n?/g, '');
  shell = shell.replace(/\s*<FelipeShareTab\s*\/>\s*/g, '\n');
  fs.writeFileSync(shellPath, shell);
}

const routePath = path.join(target, 'src', 'routes', 'dono', 'route.tsx');
if (fs.existsSync(routePath)) {
  let route = fs.readFileSync(routePath, 'utf8');
  route = route.replace(/import \{ FelipeShareTab \} from [^\n]+\n?/g, '');
  route = route.replace(/<div className="mb-4"><FelipeShareTab \/><\/div>/g, '');
  fs.writeFileSync(routePath, route);
}

console.log('[owner-share-tab] Felipe-only 3% participation panel installed inside /dono');
