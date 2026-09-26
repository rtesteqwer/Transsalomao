import { REPORT_LOGO_JPEG } from "@/lib/report-logo";
import { createFileRoute } from "@tanstack/react-router";
import { Calendar, CalendarDays, CalendarRange, FileDown, FileSpreadsheet, FileText, Files, UsersRound } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { enrichTrip, fuelingConsumptionRows, fuelingConsumptionStats, inPeriod, totalsByDriver, totalsByFleet } from "@/lib/calc";
import {
  brl,
  downloadText,
  formatDate,
  integer,
  km,
  kmL,
  liters,
  pct,
  toCsv,
  tons,
} from "@/lib/format";
import { downloadDriverReportPdf, type ReportFueling } from "@/lib/pdf";
import type { PeriodKey } from "@/lib/types";
import { useFleet } from "@/lib/use-fleet";
import { downloadFleetExcel } from "@/lib/excel-report";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/dono/totais")({ component: TotaisPage });

const PERIODS: { key: PeriodKey; label: string }[] = [
  { key: "7d", label: "7 dias" },
  { key: "30d", label: "30 dias" },
  { key: "month", label: "Este mês" },
  { key: "all", label: "Tudo" },
];

function TotaisPage() {
  const { data } = useFleet();
  const [tab, setTab] = useState<"motoristas" | "conjuntos" | "diesel">("motoristas");
  const [period, setPeriod] = useState<PeriodKey>("month");
  const [driverFilter, setDriverFilter] = useState("all");
  const [excelExporting, setExcelExporting] = useState<string | null>(null);

  const computed = useMemo(() => {
    if (!data) return [];
    return data.trips
      .filter((t) => inPeriod(t.date, period))
      .map((t) => enrichTrip(t, data.drivers, data.fleets));
  }, [data, period]);

  const fuelingIntervals = useMemo(() => data ? fuelingConsumptionRows(data.fuelings) : [], [data]);

  const fuelings = useMemo<ReportFueling[]>(() => {
    if (!data) return [];
    return fuelingIntervals
      .filter((f) => inPeriod(f.date, period))
      .map((f) => {
        const driver = data.drivers.find((d) => d.id === f.driverId);
        const fleet = data.fleets.find((x) => x.id === f.fleetId);
        return {
          ...f,
          driverName: driver?.name ?? "Sem motorista informado",
          fleetName: fleet?.name ?? "Conjunto removido",
          tractorPlate: fleet?.tractorPlate ?? "—",
          trailerPlate: fleet?.trailerPlate ?? "—",
        };
      });
  }, [data, period, fuelingIntervals]);

  const fuelSummary = useMemo(() => {
    const litersTotal = fuelings.reduce((acc, f) => acc + f.liters, 0);
    const cost = fuelings.reduce((acc, f) => acc + f.liters * f.pricePerLiter, 0);
    const consumption = fuelingConsumptionStats(fuelings);
    return {
      count: fuelings.length,
      liters: litersTotal,
      cost,
      avgPrice: litersTotal > 0 ? cost / litersTotal : null,
      kmDriven: consumption.kmDriven,
      kmPerLiter: consumption.kmPerLiter,
    };
  }, [fuelings]);

  const drivers = useMemo(
    () => (data ? totalsByDriver(computed, data.drivers) : []),
    [computed, data],
  );
  const fleets = useMemo(
    () => (data ? totalsByFleet(computed, data.fleets) : []),
    [computed, data],
  );
  const shownDrivers = driverFilter === "all" ? drivers : drivers.filter((d) => d.driverId === driverFilter);
  const selectedDriver = data?.drivers.find((d) => d.id === driverFilter);
  const periodLabel = PERIODS.find((p) => p.key === period)?.label ?? "Período";
  const periodAdvances = useMemo(() => {
    if (!data) return [];
    return data.expenses
      .filter((e) => e.category === "Adiantamento" && !!e.driverId && inPeriod(e.date, period))
      .map((e) => ({
        driverId: e.driverId!,
        driverName: data.drivers.find((d) => d.id === e.driverId)?.name ?? "Motorista removido",
        date: e.date,
        amount: e.amount,
        description: e.description,
      }));
  }, [data, period]);
  const periodExpenses = useMemo(() => {
    if (!data) return [];
    return data.expenses.filter((e) => e.category !== "Adiantamento" && inPeriod(e.date, period)).map((e) => ({
      ...e,
      driverName: data.drivers.find((d) => d.id === e.driverId)?.name ?? "—",
      fleetName: data.fleets.find((f) => f.id === e.fleetId)?.name ?? "—",
    }));
  }, [data, period]);
  const advancesForDriver = (driverId: string) => periodAdvances.filter((e) => e.driverId === driverId);
  const advanceTotalForDriver = (driverId: string) => advancesForDriver(driverId).reduce((sum, e) => sum + e.amount, 0);

  const fuelForDriver = (driverId: string) => fuelings.filter((f) => f.driverId === driverId);
  const fuelForFleet = (fleetId: string) => fuelings.filter((f) => f.fleetId === fleetId);
  const fuelStats = (rows: ReportFueling[]) => {
    const litersTotal = rows.reduce((acc, f) => acc + f.liters, 0);
    const cost = rows.reduce((acc, f) => acc + f.liters * f.pricePerLiter, 0);
    const consumption = fuelingConsumptionStats(rows);
    return {
      liters: litersTotal,
      cost,
      avgPrice: litersTotal > 0 ? cost / litersTotal : null,
      kmDriven: consumption.kmDriven,
      kmPerLiter: consumption.kmPerLiter,
    };
  };

  function exportDriverPdf() {
    if (!selectedDriver) return;
    const rows = computed.filter((t) => t.driverId === selectedDriver.id);
    downloadDriverReportPdf({
      driverName: selectedDriver.name,
      trips: rows,
      fuelings: fuelForDriver(selectedDriver.id),
      advances: advancesForDriver(selectedDriver.id),
      expenses: periodExpenses.filter((e) => e.driverId === selectedDriver.id),
      periodLabel,
      sourceLabel: "Relatórios",

    });
  }


  function quickPdf(kind: "day" | "week" | "month" | "all") {
    if (!data) return;
    const today = new Date();
    const isoToday = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
    const rows = data.trips
      .filter((t) => {
        if (kind === "day") return t.date === isoToday;
        if (kind === "week") return inPeriod(t.date, "7d", today);
        if (kind === "month") return inPeriod(t.date, "month", today);
        return true;
      })
      .map((t) => enrichTrip(t, data.drivers, data.fleets));
    const fuelRows = fuelingConsumptionRows(data.fuelings)
      .filter((f) => {
        if (kind === "day") return f.date === isoToday;
        if (kind === "week") return inPeriod(f.date, "7d", today);
        if (kind === "month") return inPeriod(f.date, "month", today);
        return true;
      })
      .map((f) => {
        const driver = data.drivers.find((d) => d.id === f.driverId);
        const fleet = data.fleets.find((x) => x.id === f.fleetId);
        return {
          ...f,
          driverName: driver?.name ?? "Sem motorista informado",
          fleetName: fleet?.name ?? "Conjunto removido",
          tractorPlate: fleet?.tractorPlate ?? "—",
          trailerPlate: fleet?.trailerPlate ?? "—",
        };
      });
    const label = kind === "day" ? "Diário" : kind === "week" ? "Semanal" : kind === "month" ? "Mensal" : "Completo";
    const advanceRows = data.expenses
      .filter((e) => {
        if (e.category !== "Adiantamento" || !e.driverId) return false;
        if (kind === "day") return e.date === new Date().toISOString().slice(0, 10);
        if (kind === "week") return inPeriod(e.date, "7d");
        if (kind === "month") return inPeriod(e.date, "month");
        return true;
      })
      .map((e) => ({ driverId: e.driverId!, driverName: data.drivers.find((d) => d.id === e.driverId)?.name ?? "Motorista removido", date: e.date, amount: e.amount, description: e.description }));
    downloadDriverReportPdf({
      driverName: "Todos os motoristas",
      trips: rows,
      fuelings: fuelRows,
      advances: advanceRows,
      expenses: data.expenses.filter((e) => e.category !== "Adiantamento" && (kind === "all" || kind === "day" && e.date === isoToday || kind === "week" && inPeriod(e.date, "7d", today) || kind === "month" && inPeriod(e.date, "month", today))).map((e) => ({ ...e, driverName: data.drivers.find((d) => d.id === e.driverId)?.name ?? "—", fleetName: data.fleets.find((f) => f.id === e.fleetId)?.name ?? "—" })),
      periodLabel: label,
      sourceLabel: "Relatórios",
      reportTitle: `Relatório ${label} da Gerência`,

    });
  }

  async function exportExcelColorido(driverScope?: { id: string; name: string }) {
    if (!data) {
      toast.error("Os dados ainda estão carregando. Tente novamente em alguns segundos.");
      return;
    }
    const exportKey = driverScope ? "driver:" + driverScope.id : "general";
    setExcelExporting(exportKey);
    toast.info(driverScope ? "Gerando Excel do motorista…" : "Gerando Planilha Geral…");
    try {
      await downloadFleetExcel({ data, computed, fuelings, period, driverScope });
      toast.success("Excel gerado. Verifique seus downloads.");
    } catch (error) {
      console.error("[excel-report]", error);
      toast.error(error instanceof Error ? "Não foi possível gerar o Excel: " + error.message : "Não foi possível gerar o Excel.");
    } finally {
      setExcelExporting(null);
    }
  }

  return (
    <div>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-[11px] uppercase tracking-[0.18em] text-muted">Documentos e consolidados</p>
          <h1 className="mt-1 font-display text-4xl font-semibold tracking-tight">Relatórios</h1>
          <p className="mt-2 max-w-xl text-sm text-muted">Gere PDFs no padrão visual da Trans Salomão e consulte totais por motorista, conjunto e combustível.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            onClick={() => downloadDriverReportPdf({
              driverName: "Todos os motoristas",
              trips: computed,
              fuelings,
              advances: periodAdvances,
              expenses: periodExpenses,
              periodLabel,
              sourceLabel: "Relatórios",
              reportTitle: "Relatório Geral da Gerência",

            })}
            disabled={computed.length === 0}
            title="Gerar relatório geral em PDF"
          >
            <FileText className="size-4" /> PDF geral
          </Button>
          {tab === "motoristas" ? (
            <Button variant="secondary" onClick={exportDriverPdf} disabled={!selectedDriver} title="Gerar PDF do motorista selecionado">
              <UsersRound className="size-4" /> PDF motorista
            </Button>
          ) : null}
          <button
            type="button"
            onClick={() => void exportExcelColorido()}
            disabled={!data || excelExporting !== null}
            className="h-11 rounded-md border border-accent bg-bg px-4 text-sm font-semibold text-fg hover:bg-surface-2 disabled:cursor-wait disabled:opacity-60"
            title="Baixar Excel colorido"
          >
            <FileSpreadsheet className="mr-2 inline size-4" />
            {excelExporting === "general" ? "Gerando Excel…" : "Planilha Geral"}
          </button>
        </div>
      </div>


      <section className="mt-7">
        <p className="text-[11px] uppercase tracking-[0.16em] text-muted">Relatórios rápidos em PDF</p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {[
            { key: "day", label: "Diário", hint: "Viagens de hoje", icon: CalendarDays },
            { key: "week", label: "Semanal", hint: "Últimos 7 dias", icon: CalendarRange },
            { key: "month", label: "Mensal", hint: "Mês atual", icon: Calendar },
            { key: "all", label: "Completo", hint: "Todo o histórico", icon: Files },
          ].map((item) => (
            <button
              key={item.key}
              type="button"
              onClick={() => quickPdf(item.key as "day" | "week" | "month" | "all")}
              className="group flex items-center gap-3 rounded-xl border border-border bg-surface p-4 text-left hover:bg-surface-2"
            >
              <span className="grid size-11 place-items-center rounded-lg bg-surface-2 text-accent group-hover:bg-bg">
                <item.icon className="size-5" />
              </span>
              <span>
                <strong className="block font-display text-xl font-semibold">PDF {item.label}</strong>
                <span className="text-xs text-muted">{item.hint}</span>
              </span>
            </button>
          ))}
        </div>
      </section>

      <div className="mt-6 flex flex-wrap gap-2">
        <div className="flex gap-1 rounded-lg border border-border bg-surface p-1">
          {([ ["motoristas", "Motoristas"], ["conjuntos", "Conjuntos"], ["diesel", "Combustível"] ] as const).map(([key, label]) => (
            <button key={key} type="button" onClick={() => setTab(key)} className={cn("h-9 rounded-md px-3 text-sm", tab === key ? "bg-accent text-accent-fg" : "text-muted")}>{label}</button>
          ))}
        </div>
        <div className="flex gap-1 rounded-lg border border-border bg-surface p-1">
          {PERIODS.map((p) => (
            <button key={p.key} type="button" onClick={() => setPeriod(p.key)} className={cn("h-9 rounded-md px-3 text-sm", period === p.key ? "bg-accent text-accent-fg" : "text-muted")}>{p.label}</button>
          ))}
        </div>
      </div>

      {tab === "motoristas" ? (
        <div className="mt-5 max-w-sm">
          <Select value={driverFilter} onChange={(e) => setDriverFilter(e.target.value)}>
            <option value="all">Todos os motoristas</option>
            {(data?.drivers ?? []).map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </Select>
        </div>
      ) : null}

      {tab === "motoristas" ? (
        <ul className="mt-6 grid gap-3">
          {shownDrivers.map((d) => (
            <li key={d.driverId} className="rounded-xl border border-border bg-surface p-4 sm:p-5">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h2 className="font-display text-2xl font-semibold">{d.driverName}</h2>
                  <p className="text-sm text-muted">{d.tripCount} viagens totais</p>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    variant="ghost"
                    title={`Gerar PDF de ${d.driverName}`}
                    onClick={() => downloadDriverReportPdf({
                      driverName: d.driverName,
                      trips: computed.filter((t) => t.driverId === d.driverId),
                      fuelings: fuelForDriver(d.driverId),
                      advances: advancesForDriver(d.driverId),
                      expenses: periodExpenses.filter((e) => e.driverId === d.driverId),
                      periodLabel,
                      sourceLabel: "Relatórios",

                    })}
                  >
                    <FileDown className="size-4" /> PDF
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    title={`Gerar Excel de ${d.driverName}`}
                    disabled={excelExporting !== null}
                    onClick={() => void exportExcelColorido({ id: d.driverId, name: d.driverName })}
                  >
                    <FileSpreadsheet className="size-4" />
                    {excelExporting === "driver:" + d.driverId ? "Gerando…" : "Excel"}
                  </Button>
                </div>
              </div>
              <dl className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
                <Stat label="Por tonelada" value={`${d.tonTripCount} viagens · ${tons(d.tonTons)} · ${brl(d.tonFreight)}`} />
                <Stat label="Diária" value={`${integer(d.tripModeCount)} · ${brl(d.tripFreight)}`} />
                <Stat label="Cegonha" value={`${integer(d.cegonhaCount)} · ${brl(d.cegonhaFreight)}`} />
                <Stat label="Caixinha" value={`${integer(d.caixinhaCount)} · ${brl(d.caixinhaFreight)}`} />
                <Stat label="Modos por viagem" value={`${integer(d.fixedTripCount)} · ${brl(d.fixedFreight)}`} />
                <Stat label="KM" value={km(d.totalKm)} />
                <Stat label="Peso líquido" value={tons(d.netWeight)} />
                <Stat label="Preço médio/t" value={d.avgPricePerTon == null ? "—" : brl(d.avgPricePerTon)} />
                <Stat label="Frete" value={brl(d.freight)} />
                <Stat label="Comissão bruta" value={`${pct(d.commissionPct)} · ${brl(d.commissionValue)}`} />
                <Stat label="Adiantamentos" value={brl(advanceTotalForDriver(d.driverId))} />
                <Stat label="Comissão a pagar" value={brl(d.commissionValue - advanceTotalForDriver(d.driverId))} />
                <Stat label="Após comissão" value={brl(d.freightAfterCommission)} />
                <Stat label="Diesel" value={liters(fuelStats(fuelForDriver(d.driverId)).liters)} />
                <Stat label="Custo diesel" value={brl(fuelStats(fuelForDriver(d.driverId)).cost)} />
                <Stat label="Preço médio/L" value={fuelStats(fuelForDriver(d.driverId)).avgPrice == null ? "—" : brl(fuelStats(fuelForDriver(d.driverId)).avgPrice!)} />
                <Stat label="KM/L abastecimentos" value={kmL(fuelStats(fuelForDriver(d.driverId)).kmPerLiter)} />
              </dl>
            </li>
          ))}
        </ul>
      ) : null}

      {tab === "conjuntos" ? (
        <ul className="mt-6 grid gap-3">
          {fleets.map((f) => (
            <li key={f.fleetId} className="rounded-xl border border-border bg-surface p-4 sm:p-5">
              <div className="flex items-baseline justify-between gap-3">
                <div>
                  <h2 className="font-display text-2xl font-semibold">{f.fleetName}</h2>
                  <p className="mt-1 text-xs text-muted">Cavalo {f.tractorPlate} · Carreta {f.trailerPlate}</p>
                </div>
                <p className="text-sm text-muted">{f.tripCount} viagens totais</p>
              </div>
              <dl className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
                <Stat label="Por tonelada" value={`${f.tonTripCount} viagens · ${tons(f.tonTons)} · ${brl(f.tonFreight)}`} />
                <Stat label="Diária" value={`${integer(f.tripModeCount)} · ${brl(f.tripFreight)}`} />
                <Stat label="Cegonha" value={`${integer(f.cegonhaCount)} · ${brl(f.cegonhaFreight)}`} />
                <Stat label="Caixinha" value={`${integer(f.caixinhaCount)} · ${brl(f.caixinhaFreight)}`} />
                <Stat label="Modos por viagem" value={`${integer(f.fixedTripCount)} · ${brl(f.fixedFreight)}`} />
                <Stat label="KM" value={km(f.totalKm)} />
                <Stat label="Peso líquido" value={tons(f.netWeight)} />
                <Stat label="Preço médio/t" value={f.avgPricePerTon == null ? "—" : brl(f.avgPricePerTon)} />
                <Stat label="Faturamento" value={brl(f.freight)} />
                <Stat label="Diesel" value={liters(fuelStats(fuelForFleet(f.fleetId)).liters)} />
                <Stat label="Custo diesel" value={brl(fuelStats(fuelForFleet(f.fleetId)).cost)} />
                <Stat label="Preço médio/L" value={fuelStats(fuelForFleet(f.fleetId)).avgPrice == null ? "—" : brl(fuelStats(fuelForFleet(f.fleetId)).avgPrice!)} />
                <Stat label="KM/L abastecimentos" value={kmL(fuelStats(fuelForFleet(f.fleetId)).kmPerLiter)} />
              </dl>
            </li>
          ))}
        </ul>
      ) : null}

      {tab === "diesel" ? (
        <div className="mt-6 space-y-4">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-6">
            <Summary label="Abastecimentos" value={integer(fuelSummary.count)} />
            <Summary label="Litros abastecidos" value={liters(fuelSummary.liters)} />
            <Summary label="Custo total" value={brl(fuelSummary.cost)} />
            <Summary label="Preço médio/L" value={fuelSummary.avgPrice == null ? "—" : brl(fuelSummary.avgPrice)} />
            <Summary label="KM pelos abastecimentos" value={km(fuelSummary.kmDriven)} />
            <Summary label="KM/L" value={kmL(fuelSummary.kmPerLiter)} />
          </div>
          <div className="overflow-x-auto rounded-xl border border-border">
            <table className="w-full min-w-[980px] text-left text-sm">
              <thead className="bg-surface-2 text-[10px] uppercase tracking-[0.14em] text-muted">
                <tr>{["Data", "Motorista", "Conjunto", "Placas", "Posto", "KM", "KM rodado", "Litros", "KM/L", "Preço/L", "Custo"].map((h) => <th key={h} className="px-3 py-3 font-medium">{h}</th>)}</tr>
              </thead>
              <tbody>
                {fuelings.length === 0 ? (
                  <tr><td colSpan={11} className="px-4 py-8 text-center text-muted">Nenhum abastecimento registrado neste período.</td></tr>
                ) : fuelings.map((f) => (
                  <tr key={f.id} className="border-t border-border">
                    <td className="px-3 py-3 text-muted">{formatDate(f.date)}</td>
                    <td className="px-3 py-3">{f.driverName}</td>
                    <td className="px-3 py-3">{f.fleetName}</td>
                    <td className="px-3 py-3 text-xs text-muted">{f.tractorPlate} · {f.trailerPlate}</td>
                    <td className="px-3 py-3">{f.station || "—"}</td>
                    <td className="px-3 py-3 tabular">{integer(f.km)}</td>
                    <td className="px-3 py-3 tabular">{f.kmSincePrevious == null ? "—" : km(f.kmSincePrevious)}</td>
                    <td className="px-3 py-3 tabular">{liters(f.liters)}</td>
                    <td className="px-3 py-3 tabular">{kmL(f.kmPerLiter)}</td>
                    <td className="px-3 py-3 tabular">{brl(f.pricePerLiter)}</td>
                    <td className="px-3 py-3 tabular">{brl(f.liters * f.pricePerLiter)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function Summary({ label, value }: { label: string; value: string }) {
  return <div className="rounded-lg border border-border bg-surface p-4"><p className="text-[10px] uppercase tracking-[0.14em] text-muted">{label}</p><p className="mt-2 font-display text-xl font-semibold tabular">{value}</p></div>;
}

function Stat({ label, value }: { label: string; value: string }) {
  return <div><dt className="text-[10px] uppercase tracking-[0.14em] text-subtle">{label}</dt><dd className="mt-1 font-display text-lg tabular">{value}</dd></div>;
}
