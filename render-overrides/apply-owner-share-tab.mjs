import fs from 'node:fs';
import path from 'node:path';

const target = process.argv[2];
if (!target || !fs.existsSync(target)) throw new Error('owner-share-tab: target missing');

const componentPath = path.join(target, 'src', 'components', 'owner', 'felipe-share-tab.tsx');
const pagePath = path.join(target, 'src', 'routes', 'dono', 'participacao.tsx');
fs.mkdirSync(path.dirname(componentPath), { recursive: true });
fs.mkdirSync(path.dirname(pagePath), { recursive: true });

fs.writeFileSync(componentPath, `import { useEffect, useState } from "react";
import { getManagementSession } from "@/lib/management-auth";

export function FelipeShareTab() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    let active = true;
    getManagementSession()
      .then((session) => {
        if (!active) return;
        setVisible(
          session.authenticated === true &&
          String(session.username ?? "").trim().toLocaleLowerCase("pt-BR") === "felipe"
        );
      })
      .catch(() => active && setVisible(false));
    return () => { active = false; };
  }, []);

  if (!visible) return null;
  return (
    <a
      href="/dono/participacao"
      className="flex items-center gap-2 rounded-xl border border-border bg-surface px-3 py-2 text-sm font-semibold text-fg shadow-sm transition hover:bg-surface-2"
      title="Minha participação societária de 3%"
    >
      <span aria-hidden="true">%</span>
      <span>Minha participação • 3%</span>
    </a>
  );
}
`);

fs.writeFileSync(pagePath, `import { createFileRoute } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useState } from "react";

type Row = Record<string, any>;
type MonthRow = { month: string; companyGross: number; share: number };
type ShareData = {
  authorized: boolean;
  username: string | null;
  shareRate?: number;
  currentMonth?: string;
  currentCompanyGross?: number;
  currentShare?: number;
  totalCompanyGross?: number;
  totalShare?: number;
  months?: MonthRow[];
  generatedAt?: string;
};

const getFelipeParticipation = createServerFn({ method: "GET" }).handler(async () => {
  const { managementSession } = await import("@/lib/management-auth.server");
  const session = managementSession();
  const username = session?.username ?? null;
  if (!session || String(username).trim().toLocaleLowerCase("pt-BR") !== "felipe") {
    return { authorized: false, username } satisfies ShareData;
  }

  const SHARE_RATE = 0.03;
  const nowParts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  const currentMonth = nowParts.slice(0, 7);
  const [year, month] = currentMonth.split("-").map(Number);
  const months: string[] = [];
  for (let i = 11; i >= 0; i -= 1) {
    const d = new Date(Date.UTC(year, month - 1 - i, 1));
    months.push(\`${'${d.getUTCFullYear()}'}-${'${String(d.getUTCMonth() + 1).padStart(2, "0")}'}\`);
  }
  const startDate = \`${'${months[0]}'}-01\`;

  const { getSql } = await import("@/lib/db");
  const sql = await getSql();
  const trips = await sql<Row>\`
    select date::text as date, freight_mode, net_weight, price_per_ton, price_per_trip
    from trips
    where date >= ${'${startDate}'}
    order by date asc
  \`;

  const totals = new Map(months.map((key) => [key, 0]));
  const num = (value: unknown) => {
    const n = Number(value ?? 0);
    return Number.isFinite(n) ? n : 0;
  };
  for (const trip of trips) {
    const key = String(trip.date ?? "").slice(0, 7);
    if (!totals.has(key)) continue;
    const gross = String(trip.freight_mode ?? "") === "ton"
      ? num(trip.net_weight) * num(trip.price_per_ton)
      : num(trip.price_per_trip);
    totals.set(key, (totals.get(key) ?? 0) + gross);
  }

  const monthRows = months.map((key) => {
    const companyGross = totals.get(key) ?? 0;
    return { month: key, companyGross, share: companyGross * SHARE_RATE };
  });
  const totalCompanyGross = monthRows.reduce((sum, item) => sum + item.companyGross, 0);
  const totalShare = monthRows.reduce((sum, item) => sum + item.share, 0);
  const current = monthRows.find((item) => item.month === currentMonth) ?? { companyGross: 0, share: 0 };

  return {
    authorized: true,
    username,
    shareRate: SHARE_RATE,
    currentMonth,
    currentCompanyGross: current.companyGross,
    currentShare: current.share,
    totalCompanyGross,
    totalShare,
    months: monthRows,
    generatedAt: new Date().toISOString(),
  } satisfies ShareData;
});

export const Route = createFileRoute("/dono/participacao")({
  component: FelipeParticipationPage,
});

function brl(value: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value || 0);
}
function monthLabel(value: string) {
  const [year, month] = value.split("-").map(Number);
  return new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(Date.UTC(year, month - 1, 1)));
}

function FelipeParticipationPage() {
  const [data, setData] = useState<ShareData | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    getFelipeParticipation()
      .then((result) => active && setData(result as ShareData))
      .catch((err) => active && setError(err instanceof Error ? err.message : "Não foi possível carregar os dados."));
    return () => { active = false; };
  }, []);

  const orderedMonths = useMemo(() => [...(data?.months ?? [])].reverse(), [data?.months]);

  if (error) {
    return <div className="rounded-2xl border border-border bg-surface p-6"><h1 className="text-xl font-bold">Minha participação • 3%</h1><p className="mt-3 text-sm text-red-700">{error}</p></div>;
  }
  if (!data) {
    return <div className="rounded-2xl border border-border bg-surface p-6"><p className="text-sm text-muted">Carregando participação...</p></div>;
  }
  if (!data.authorized) {
    return (
      <div className="rounded-2xl border border-border bg-surface p-6">
        <h1 className="text-xl font-bold">Minha participação • 3%</h1>
        <p className="mt-3 text-sm text-muted">Esta área é exclusiva do login Felipe.</p>
        <a className="mt-5 inline-flex rounded-xl border border-border px-4 py-2 font-semibold" href="/dono">Voltar ao painel</a>
      </div>
    );
  }

  return (
    <section className="space-y-6">
      <div className="rounded-2xl border border-border bg-surface p-6 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">Trans Salomão</p>
            <h1 className="mt-1 text-2xl font-bold text-fg">Minha participação na empresa</h1>
            <p className="mt-2 text-sm text-muted">Participação societária: 3% do faturamento bruto lançado no sistema.</p>
          </div>
          <a href="/dono" className="rounded-xl border border-border px-4 py-2 text-sm font-semibold">Voltar ao painel</a>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <ShareCard label="Percentual" value="3%" detail="do faturamento bruto" />
        <ShareCard label="Faturamento bruto do mês" value={brl(data.currentCompanyGross ?? 0)} detail={monthLabel(data.currentMonth ?? "")} />
        <ShareCard label="Minha parte no mês" value={brl(data.currentShare ?? 0)} detail="3% do bruto do mês" emphasis />
        <ShareCard label="Minha parte em 12 meses" value={brl(data.totalShare ?? 0)} detail={\`Sobre ${'${brl(data.totalCompanyGross ?? 0)}'} de faturamento\`} emphasis />
      </div>

      <div className="overflow-hidden rounded-2xl border border-border bg-surface shadow-sm">
        <div className="border-b border-border px-5 py-4">
          <h2 className="text-lg font-bold">Histórico mensal da participação</h2>
          <p className="mt-1 text-sm text-muted">Cálculo automático com base nas viagens registradas no Trans Salomão.</p>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-surface-2 text-left">
              <tr>
                <th className="px-5 py-3 font-semibold">Mês</th>
                <th className="px-5 py-3 text-right font-semibold">Faturamento bruto</th>
                <th className="px-5 py-3 text-right font-semibold">Minha parte (3%)</th>
              </tr>
            </thead>
            <tbody>
              {orderedMonths.map((item) => (
                <tr key={item.month} className="border-t border-border">
                  <td className="px-5 py-3 capitalize">{monthLabel(item.month)}</td>
                  <td className="px-5 py-3 text-right tabular-nums">{brl(item.companyGross)}</td>
                  <td className="px-5 py-3 text-right font-bold tabular-nums">{brl(item.share)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}

function ShareCard({ label, value, detail, emphasis = false }: { label: string; value: string; detail: string; emphasis?: boolean }) {
  return (
    <div className={\`rounded-2xl border border-border p-5 shadow-sm ${'${emphasis ? "bg-surface-2" : "bg-surface"}'}\`}>
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
  for (let i = 0; i < lines.length; i += 1) {
    if (/^import\s/.test(lines[i])) lastImport = i;
  }
  lines.splice(lastImport + 1, 0, statement);
  return lines.join('\n');
}

let injected = false;
const shellPath = path.join(target, 'src', 'components', 'owner', 'shell.tsx');
if (fs.existsSync(shellPath)) {
  let shell = fs.readFileSync(shellPath, 'utf8');
  shell = addImport(shell, 'import { FelipeShareTab } from "@/components/owner/felipe-share-tab";');
  if (!shell.includes('<FelipeShareTab')) {
    const navClose = shell.indexOf('</nav>');
    if (navClose >= 0) {
      shell = shell.slice(0, navClose) + '  <FelipeShareTab />\n' + shell.slice(navClose);
      injected = true;
    }
  } else injected = true;
  fs.writeFileSync(shellPath, shell);
}

if (!injected) {
  const routePath = path.join(target, 'src', 'routes', 'dono', 'route.tsx');
  if (!fs.existsSync(routePath)) throw new Error('owner-share-tab: management route missing');
  let route = fs.readFileSync(routePath, 'utf8');
  route = addImport(route, 'import { FelipeShareTab } from "@/components/owner/felipe-share-tab";');
  if (!route.includes('<FelipeShareTab')) {
    if (route.includes('<Outlet />')) {
      route = route.replace('<Outlet />', '<div className="mb-4"><FelipeShareTab /></div><Outlet />');
    } else if (route.includes('<Outlet/>')) {
      route = route.replace('<Outlet/>', '<div className="mb-4"><FelipeShareTab /></div><Outlet/>');
    } else {
      throw new Error('owner-share-tab: could not find nav or Outlet insertion point');
    }
  }
  fs.writeFileSync(routePath, route);
  injected = true;
}

console.log('[owner-share-tab] Felipe-only 3% participation tab installed');
