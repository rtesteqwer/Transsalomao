import { ArrowRight, FileSpreadsheet, FileText, Plus, Wallet } from "lucide-react";
import { toast } from "sonner";
import { FreightModeBadge } from "@/components/owner/freight-mode-badge";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import {
  aggregateKpis,
  deltaPct,
  enrichTrip,
  fuelingConsumptionRows,
  fuelingConsumptionStats,
  groupRevenueByDate,
  inPeriod,
  previousPeriodRange,
  totalsByDriver,
  totalsByFleet,
} from "@/lib/calc";
import {
  brl,
  formatDateShort,
  integer,
  km,
  kmL,
  liters,
  signedPct,
  tons,
} from "@/lib/format";
import { downloadDriverReportPdf } from "@/lib/pdf";
import type { DashboardKpis, PeriodKey } from "@/lib/types";
import { useFleet } from "@/lib/use-fleet";
import { cn } from "@/lib/utils";
import { FelipeSharePanel } from "@/components/owner/felipe-share-panel";

export const Route = createFileRoute("/dono/")({ component: PainelPage });

const PERIODS: { key: PeriodKey; label: string }[] = [
  { key: "7d", label: "7 dias" },
  { key: "30d", label: "30 dias" },
  { key: "month", label: "Este mês" },
  { key: "all", label: "Tudo" },
];

function PainelPage() {
  const { data, isError, refetch } = useFleet();
  const [period, setPeriod] = useState<PeriodKey>("month");
  const [driverFilter, setDriverFilter] = useState("all");
  const [exporting, setExporting] = useState<string | null>(null);

  const computed = useMemo(() => {
    if (!data) return [];
    return data.trips
      .filter((t) => inPeriod(t.date, period))
      .map((t) => enrichTrip(t, data.drivers, data.fleets))
      .filter((t) => driverFilter === "all" || t.driverId === driverFilter);
  }, [data, period, driverFilter]);

  const fuelingRows = useMemo(() => data ? fuelingConsumptionRows(data.fuelings).map(fueling => {
    const driver = data.drivers.find(item => item.id === fueling.driverId);
    const fleet = data.fleets.find(item => item.id === fueling.fleetId);
    return { ...fueling, driverName: driver?.name || 'Motorista', fleetName: fleet?.name || '',
      tractorPlate: fleet?.tractorPlate || '', trailerPlate: fleet?.trailerPlate || '' };
  }) : [], [data]);
  const fuelings = useMemo(() => {
    return fuelingRows.filter(
      (f) => inPeriod(f.date, period) && (driverFilter === "all" || f.driverId === driverFilter),
    );
  }, [fuelingRows, period, driverFilter]);

  const kpis = useMemo(() => aggregateKpis(computed), [computed]);
  const fuelLiters = fuelings.reduce((acc, f) => acc + f.liters, 0);
  const fuelCost = fuelings.reduce((acc, f) => acc + f.liters * f.pricePerLiter, 0);
  const fuelConsumption = useMemo(() => fuelingConsumptionStats(fuelings), [fuelings]);
  const hasFuelings = fuelings.length > 0;
  const effectiveKpis: DashboardKpis = {
    ...kpis,
    dieselLiters: hasFuelings ? fuelLiters : kpis.dieselLiters,
    dieselCost: hasFuelings ? fuelCost : kpis.dieselCost,
    grossResult: hasFuelings ? kpis.revenue - fuelCost : kpis.grossResult,
    afterCommission: hasFuelings ? kpis.revenue - fuelCost - kpis.commissions : kpis.afterCommission,
    avgKmL: fuelConsumption.kmPerLiter,
  };
  const prevKpis = useMemo(() => {
    if (!data) return null;
    const range = previousPeriodRange(period);
    if (!range) return null;
    const rows = data.trips
      .filter((t) => t.date >= range.start && t.date <= range.end)
      .map((t) => enrichTrip(t, data.drivers, data.fleets))
      .filter((t) => driverFilter === "all" || t.driverId === driverFilter);
    return aggregateKpis(rows);
  }, [data, period, driverFilter]);

  const prevEffectiveKpis = useMemo(() => {
    if (!prevKpis || !data) return prevKpis;
    const range = previousPeriodRange(period);
    if (!range) return prevKpis;
    const prevFuelings = fuelingRows.filter(
      (f) => f.date >= range.start && f.date <= range.end && (driverFilter === "all" || f.driverId === driverFilter),
    );
    if (prevFuelings.length === 0) return { ...prevKpis, avgKmL: null };
    const litersTotal = prevFuelings.reduce((acc, f) => acc + f.liters, 0);
    const cost = prevFuelings.reduce((acc, f) => acc + f.liters * f.pricePerLiter, 0);
    const consumption = fuelingConsumptionStats(prevFuelings);
    return {
      ...prevKpis,
      dieselLiters: litersTotal,
      dieselCost: cost,
      grossResult: prevKpis.revenue - cost,
      afterCommission: prevKpis.revenue - cost - prevKpis.commissions,
      avgKmL: consumption.kmPerLiter,
    };
  }, [prevKpis, data, period, driverFilter, fuelingRows]);

  const chart = useMemo(() => {
    const base = groupRevenueByDate(computed);
    if (!hasFuelings) return base;
    const map = new Map(base.map((row) => [row.date, { ...row, diesel: 0, result: row.freight }]));
    for (const f of fuelings) {
      const row = map.get(f.date) ?? { date: f.date, freight: 0, diesel: 0, result: 0 };
      row.diesel += f.liters * f.pricePerLiter;
      row.result = row.freight - row.diesel;
      map.set(f.date, row);
    }
    return [...map.values()].sort((a, b) => a.date.localeCompare(b.date));
  }, [computed, fuelings, hasFuelings]);
  const pending = data?.reports.filter((r) => r.status === "pendente" && (driverFilter === "all" || r.driverId === driverFilter)) ?? [];
  const driverTotals = useMemo(() => {
    if (!data) return [];
    const allPeriodTrips = data.trips
      .filter((t) => inPeriod(t.date, period))
      .map((t) => enrichTrip(t, data.drivers, data.fleets));
    return totalsByDriver(allPeriodTrips, data.drivers).filter((row) => driverFilter === "all" || row.driverId === driverFilter);
  }, [data, period, driverFilter]);
  const fleetTotals = useMemo(() => {
    if (!data) return [];
    const allPeriodTrips = data.trips
      .filter((t) => inPeriod(t.date, period))
      .map((t) => enrichTrip(t, data.drivers, data.fleets))
      .filter((t) => driverFilter === "all" || t.driverId === driverFilter);
    return totalsByFleet(allPeriodTrips, data.fleets);
  }, [data, period, driverFilter]);

  function exportBillingPdf() {
    const advances = (data?.expenses ?? [])
      .filter((expense) => expense.category === "Adiantamento" && !!expense.driverId)
      .map((expense) => ({
        driverId: expense.driverId,
        driverName: data?.drivers.find((driver) => driver.id === expense.driverId)?.name ?? "Motorista",
        date: expense.date,
        amount: expense.amount,
        description: expense.description,
      }));
    void downloadDriverReportPdf({
      driverName: driverFilter === "all" ? "Todos os motoristas" : data?.drivers.find((driver) => driver.id === driverFilter)?.name ?? "Motorista",
      trips: computed,
      fuelings,
      advances,
      periodLabel: PERIODS.find((item) => item.key === period)?.label ?? "Período selecionado",
      sourceLabel: "Painel",
      reportTitle: "FATURAMENTO",

    });
  }

  const periodLabel = PERIODS.find((item) => item.key === period)?.label ?? "Este mês";
  const summaryRows = driverTotals.map((driver) => {
    const driverFuelings = fuelings.filter((f) => f.driverId === driver.driverId);
    const driverTrips = computed.filter((t) => t.driverId === driver.driverId);
    const diesel = driverFuelings.length > 0
      ? driverFuelings.reduce((sum, f) => sum + f.liters * f.pricePerLiter, 0)
      : driverTrips.reduce((sum, t) => sum + t.dieselCost, 0);
    return { ...driver, diesel, totalNet: driver.freightAfterCommission - diesel };
  });
  const latestTrips = [...computed].sort((a, b) => b.date.localeCompare(a.date) || b.code.localeCompare(a.code, "pt-BR", { numeric: true })).slice(0, 3);

  async function driverReport(driverId: string, kind: "pdf" | "excel") {
    const driver = data?.drivers.find((item) => item.id === driverId);
    if (!data || !driver) return;
    setExporting(driverId + kind);
    try {
      if (kind === "excel") {
        const { downloadFleetExcel } = await import("@/lib/excel-report");
        await downloadFleetExcel({ data, computed, fuelings, period, driverScope: { id: driver.id, name: driver.name } });
      } else {
        await downloadDriverReportPdf({
          driverName: driver.name,
          trips: computed.filter((item) => item.driverId === driverId),
          fuelings: fuelings.filter((item) => item.driverId === driverId),
          advances: data.expenses.filter((e) => e.driverId === driverId && e.category === "Adiantamento" && inPeriod(e.date, period)).map((e) => ({ driverId, driverName: driver.name, date: e.date, amount: e.amount, description: e.description })),
          expenses: data.expenses.filter((e) => e.driverId === driverId && e.category !== "Adiantamento" && inPeriod(e.date, period)).map((e) => ({ ...e, driverName: driver.name, fleetName: data.fleets.find((f) => f.id === e.fleetId)?.name ?? "—" })),
          periodLabel, sourceLabel: "Painel", reportTitle: "FATURAMENTO",
        });
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível gerar o relatório.");
    } finally {
      setExporting(null);
    }
  }

  if (isError) return <div className="dashboard-panel" role="alert"><h1>Painel da Gerência</h1><p className="my-4 text-muted">Não foi possível carregar os dados. Tente novamente.</p><Button onClick={() => void refetch()}>Tentar novamente</Button></div>;

  return (
    <div>
      <div className="dashboard-title">
        <div><h1>Painel da Gerência</h1><p className="dashboard-subtitle">Sua operação, em um só lugar.</p></div>
        <div className="dashboard-actions">
          <Button variant="outline" onClick={exportBillingPdf} disabled={computed.length === 0} title="Gerar PDF de faturamento"><FileText className="size-4" /> Faturamento</Button>
          <Button asChild><Link to="/dono/viagens" search={{ nova: true }}><Plus className="size-4" /> Nova viagem</Link></Button>
        </div>
      </div>
      <div className="dashboard-filters">
        <div className="period-tabs" role="group" aria-label="Período do painel">{PERIODS.map((item) => <button key={item.key} type="button" aria-pressed={period === item.key} onClick={() => setPeriod(item.key)} className={cn("period-tab", period === item.key && "is-active")}>{item.label}</button>)}</div>
        <Select aria-label="Filtrar por motorista" value={driverFilter} onChange={(e) => setDriverFilter(e.target.value)} className="!w-full sm:!w-[230px] !bg-white">
          <option value="all">Todos os motoristas</option>{(data?.drivers ?? []).map((driver) => <option key={driver.id} value={driver.id}>{driver.name}</option>)}
        </Select>
      </div>
      <section className="kpi-strip" aria-label="Resumo financeiro" aria-busy={!data}>
        <SummaryKpi label="Faturamento bruto" value={data ? brl(effectiveKpis.revenue) : "—"} />
        <SummaryKpi label="Valor de comissão" value={data ? brl(kpis.commissions) : "—"} />
        <SummaryKpi label="Custo diesel" value={data ? brl(effectiveKpis.dieselCost) : "—"} />
        <SummaryKpi label="Total líquido" value={data ? brl(effectiveKpis.afterCommission) : "—"} emphasis />
      </section>
      <Link to="/dono/lancamentos" className="cash-summary"><Wallet className="size-5 shrink-0" /><span className="text-sm font-semibold">Caixa</span>
        {pending.length > 0 ? <span className="cash-badge">{pending.length} para conferir</span> : <span className="text-xs text-muted">Sem pendências</span>}
        <span className="cash-link"><span>Abrir caixa</span><ArrowRight className="size-4" /></span>
      </Link>
      <section className="dashboard-panel">
        <div className="panel-heading"><h2>Resumo por motorista</h2><p>{periodLabel}</p></div>
        {!data ? <p className="py-6 text-sm text-muted" role="status">Carregando motoristas…</p> : summaryRows.length === 0 ? <p className="py-6 text-sm text-muted">Nenhuma viagem neste período.</p> : <>
          <div className="hidden overflow-x-auto lg:block"><table className="driver-summary-table"><thead><tr>{["Motorista", "Viagens", "Fretes", "Comissão", "Diesel", "Total líquido", "Relatórios"].map((label) => <th key={label} scope="col">{label}</th>)}</tr></thead><tbody>
            {summaryRows.map((driver) => <tr key={driver.driverId}><td className="font-semibold">{driver.driverName}</td><td>{driver.tripCount}</td><td className="money">{brl(driver.freight)}</td><td className="money">{brl(driver.commissionValue)}</td><td className="money">{brl(driver.diesel)}</td><td className="money font-semibold">{brl(driver.totalNet)}</td><td><div className="flex items-center"><button type="button" className="report-action" onClick={() => void driverReport(driver.driverId, "pdf")} disabled={exporting !== null} aria-label={`Baixar PDF de ${driver.driverName}`}><FileText className="size-4" />{exporting === driver.driverId + "pdf" ? "…" : "PDF"}</button><button type="button" className="report-action" onClick={() => void driverReport(driver.driverId, "excel")} disabled={exporting !== null} aria-label={`Baixar Excel de ${driver.driverName}`}><FileSpreadsheet className="size-4" />{exporting === driver.driverId + "excel" ? "…" : "Excel"}</button></div></td></tr>)}
          </tbody></table></div>
          <div className="lg:hidden">{summaryRows.map((driver) => <article key={driver.driverId} className="driver-mobile-row">
            <div className="flex items-center justify-between gap-3"><h3 className="text-sm font-semibold">{driver.driverName}</h3><span className="shrink-0 text-xs text-muted">{driver.tripCount} viagens</span></div>
            <dl className="mobile-financials"><div><dt>Fretes</dt><dd>{brl(driver.freight)}</dd></div><div><dt>Comissão</dt><dd>{brl(driver.commissionValue)}</dd></div><div><dt>Diesel</dt><dd>{brl(driver.diesel)}</dd></div><div><dt>Total líquido</dt><dd className="text-accent">{brl(driver.totalNet)}</dd></div></dl>
            <div className="mt-2 flex justify-end gap-2"><button type="button" className="report-action" onClick={() => void driverReport(driver.driverId, "pdf")} disabled={exporting !== null} aria-label={`Baixar PDF de ${driver.driverName}`}><FileText className="size-4" />PDF</button><button type="button" className="report-action" onClick={() => void driverReport(driver.driverId, "excel")} disabled={exporting !== null} aria-label={`Baixar Excel de ${driver.driverName}`}><FileSpreadsheet className="size-4" />Excel</button></div>
          </article>)}</div>
        </>}
      </section>
      <FelipeSharePanel />
      <section className="dashboard-panel lg:hidden"><div className="panel-heading"><h2>Últimas viagens</h2><Link to="/dono/viagens">Ver todas →</Link></div>
        {latestTrips.length === 0 ? <p className="text-sm text-muted">Nenhuma viagem neste período.</p> : latestTrips.map((trip) => <Link key={trip.id} to="/dono/viagens" className="recent-trip"><div className="flex items-center justify-between gap-3"><FreightModeBadge mode={trip.freightMode} /><span className="text-[11px] text-muted">{formatDateShort(trip.date)}</span></div><p className="mt-3 text-xs font-medium">{trip.origin || "Origem não informada"} → {trip.destination || "Destino não informado"}</p><div className="mt-2 flex items-center justify-between gap-3"><span className="text-[11px] text-muted">{trip.driverName}</span><span className="text-xs font-semibold text-accent tabular">{brl(trip.freight)}</span></div></Link>)}
      </section>
      <details className="operation-details"><summary>Detalhes da operação</summary><div>
      <div className="mt-3 grid grid-cols-2 gap-3 lg:grid-cols-3">
        <Kpi label="Viagens totais" value={integer(kpis.tripCount)} />
        <Kpi label="Por tonelada" value={`${integer(kpis.tonTripCount)} viagens · ${tons(kpis.tonTons)} · ${brl(kpis.tonFreight)}`} />
        <Kpi label="Diária" value={`${integer(kpis.tripModeCount)} viagens · ${brl(kpis.tripFreight)}`} />
        <Kpi label="Cegonha" value={`${integer(kpis.cegonhaCount)} viagens · ${brl(kpis.cegonhaFreight)}`} />
        <Kpi label="Caixinha" value={`${integer(kpis.caixinhaCount)} viagens · ${brl(kpis.caixinhaFreight)}`} />
        <Kpi label="Modos por viagem" value={`${integer(kpis.fixedTripCount)} viagens · ${brl(kpis.fixedFreight)}`} />
        <Kpi label="Ton. carregadas" value={tons(kpis.loadedTons)} />
        <Kpi label="Peso líquido" value={tons(kpis.netWeight)} />
        <Kpi label="Diesel" value={liters(effectiveKpis.dieselLiters)} />
        <Kpi label="Abastecimentos" value={integer(fuelings.length)} />
        <Kpi label="Comissões" value={brl(kpis.commissions)} />
        <Kpi
          label="Média R$/t"
          value={kpis.avgPerTon == null ? "—" : brl(kpis.avgPerTon)}
        />
      </div>
      <section className="mt-6 rounded-xl border border-border bg-surface p-5">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="font-display text-xl font-semibold">Viagens por caminhão</h2>
          <p className="text-xs text-muted">quantidade por conjunto no período</p>
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {fleetTotals.map((f) => (
            <div key={f.fleetId} className="rounded-lg border border-border bg-bg p-4">
              <div className="flex items-baseline justify-between gap-2">
                <div>
                  <p className="font-display text-xl font-semibold">{f.fleetName}</p>
                  <p className="mt-1 text-xs text-muted">Cavalo {f.tractorPlate} · Carreta {f.trailerPlate}</p>
                </div>
                <span className="font-display text-2xl font-semibold tabular">{f.tripCount}</span>
              </div>
              <p className="mt-1 text-xs text-muted">viagens totais</p>
              <dl className="mt-3 grid grid-cols-2 gap-2 text-sm">
                <div><dt className="text-[10px] uppercase tracking-[0.12em] text-subtle">Por tonelada</dt><dd>{f.tonTripCount} viagens · {tons(f.tonTons)} · {brl(f.tonFreight)}</dd></div>
                <div><dt className="text-[10px] uppercase tracking-[0.12em] text-subtle">Por viagem</dt><dd>{f.tripModeCount} viagens · {brl(f.tripFreight)}</dd></div>
                <div><dt className="text-[10px] uppercase tracking-[0.12em] text-subtle">Cegonha</dt><dd>{f.cegonhaCount} viagens · {brl(f.cegonhaFreight)}</dd></div>
                <div><dt className="text-[10px] uppercase tracking-[0.12em] text-subtle">Caixinha</dt><dd>{f.caixinhaCount} viagens · {brl(f.caixinhaFreight)}</dd></div>
              </dl>
            </div>
          ))}
        </div>
      </section>

      <section className="mt-6 rounded-xl border border-border bg-surface p-5">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="font-display text-xl font-semibold">Abastecimentos registrados</h2>
          <p className="text-xs text-muted">dados do controle de combustível</p>
        </div>
        {fuelings.length === 0 ? (
          <p className="mt-4 text-sm text-subtle">Nenhum abastecimento registrado neste período.</p>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead className="text-[10px] uppercase tracking-[0.14em] text-muted">
                <tr>{["Data", "Motorista", "Conjunto", "Posto", "Litros", "Custo"].map((h) => <th key={h} className="border-b border-border px-3 py-2 font-medium">{h}</th>)}</tr>
              </thead>
              <tbody>
                {fuelings.slice(0, 8).map((f) => {
                  const driver = data?.drivers.find((d) => d.id === f.driverId);
                  const fleet = data?.fleets.find((x) => x.id === f.fleetId);
                  return (
                    <tr key={f.id} className="border-b border-border/70 last:border-b-0">
                      <td className="px-3 py-3 text-muted">{formatDateShort(f.date)}</td>
                      <td className="px-3 py-3">{driver?.name ?? "Sem motorista"}</td>
                      <td className="px-3 py-3">{fleet?.name ?? "Conjunto removido"}</td>
                      <td className="px-3 py-3">{f.station || "—"}</td>
                      
                      
                      <td className="px-3 py-3 tabular">{liters(f.liters)}</td>
                      
                      
                      <td className="px-3 py-3 tabular">{brl(f.liters * f.pricePerLiter)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="mt-6 rounded-xl border border-border bg-surface p-5">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="font-display text-xl font-semibold">Frete × diesel</h2>
          <p className="text-xs text-muted">por dia de descarga</p>
        </div>
        <div className="mt-4 h-56">
          {chart.length === 0 ? (
            <p className="grid h-full place-items-center text-sm text-subtle">
              Sem viagens neste período.
            </p>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chart} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid stroke="#e4e9f1" vertical={false} />
                <XAxis
                  dataKey="date"
                  tickFormatter={formatDateShort}
                  tick={{ fill: "#8b8e96", fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  tickFormatter={(v) =>
                    new Intl.NumberFormat("pt-BR", {
                      notation: "compact",
                    }).format(Number(v))
                  }
                  tick={{ fill: "#8b8e96", fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                  width={48}
                />
                <Tooltip
                  contentStyle={{
                    background: "#ffffff",
                    border: "1px solid #e4e9f1",
                    borderRadius: 12,
                    color: "#152033",
                  }}
                  formatter={(value, name) => [
                    brl(Number(value ?? 0)),
                    name === "freight" ? "Frete" : "Diesel",
                  ]}
                  labelFormatter={(l) => formatDateShort(String(l))}
                />
                <Area
                  type="monotone"
                  dataKey="freight"
                  stroke="#1769f4"
                  fill="rgba(23,105,244,0.08)"
                  strokeWidth={2}
                />
                <Area
                  type="monotone"
                  dataKey="diesel"
                  stroke="#c47a72"
                  fill="rgba(196,122,114,0.12)"
                  strokeWidth={2}
                />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>
      </section>
      </div></details>
    </div>
  );
}

function SummaryKpi({ label, value, emphasis = false }: { label: string; value: string; emphasis?: boolean }) {
  return <div className={cn("kpi-cell", emphasis && "is-emphasis")}><p className="kpi-label">{label}</p><p className="kpi-value">{value}</p></div>;
}


function deltaOf(
  current: DashboardKpis,
  previous: DashboardKpis | null,
  key: keyof DashboardKpis,
) {
  if (!previous) return null;
  const a = current[key];
  const b = previous[key];
  if (typeof a !== "number" || typeof b !== "number") return null;
  return deltaPct(a, b);
}

function Kpi({
  label,
  value,
  delta,
  large,
}: {
  label: string;
  value: string;
  delta?: number | null;
  large?: boolean;
}) {
  return (
    <div
      className={cn(
        "rounded-lg border border-border bg-surface p-4",
        large && "sm:p-5",
      )}
    >
      <p className="text-[10px] uppercase tracking-[0.14em] text-muted">{label}</p>
      <p
        className={cn(
          "mt-2 font-display font-semibold tabular tracking-tight",
          large ? "text-3xl" : "text-xl",
        )}
      >
        {value}
      </p>
      {delta != null ? (
        <p
          className={cn(
            "mt-2 text-xs tabular",
            delta > 0 ? "text-ok" : delta < 0 ? "text-danger" : "text-muted",
          )}
        >
          {signedPct(delta)} vs período anterior
        </p>
      ) : null}
    </div>
  );
}
