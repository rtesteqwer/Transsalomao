import { FreightModeBadge } from "@/components/owner/freight-mode-badge";
import { REPORT_LOGO_JPEG } from "@/lib/report-logo";
import { createFileRoute } from "@tanstack/react-router";
import { FileDown, Plus, Trash2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  emptyDraft,
  TripForm,
  tripToDraft,
  type TripDraft,
} from "@/components/owner/trip-form";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { enrichTrip, freightModeLabel, nextTripCode } from "@/lib/calc";
import {
  brl,
  downloadText,
  formatDate,
  integer,
  toCsv,
  tons,
} from "@/lib/format";
import { downloadDriverReportPdf } from "@/lib/pdf";
import { parseLocaleNumberOrZero } from "@/lib/parse";
import type { ComputedTrip, Driver, Fleet, FreightMode, Trip } from "@/lib/types";
import { useFleet, useFleetMutations } from "@/lib/use-fleet";

export const Route = createFileRoute("/dono/viagens")({
  validateSearch: (search: Record<string, unknown>): { nova?: boolean } => ({ nova: search.nova === true || search.nova === "true" || undefined }),
  component: ViagensPage,
});

function ViagensPage() {
  const { data } = useFleet();
  const { trip, removeTrip } = useFleetMutations();
  const [q, setQ] = useState("");
  const [driverFilter, setDriverFilter] = useState("all");
  const [editing, setEditing] = useState<TripDraft | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [bulkEditing, setBulkEditing] = useState(false);
  const { nova } = Route.useSearch();
  const openedFromDashboard = useRef(false);
  useEffect(() => {
    if (nova && data && !openedFromDashboard.current) {
      openedFromDashboard.current = true;
      setEditing(emptyDraft(data.drivers, data.fleets, data.trips, { code: nextTripCode(data.trips) }));
    }
  }, [nova, data]);

  const rows = useMemo(() => {
    if (!data) return [];
    let all = data.trips.map((t) => enrichTrip(t, data.drivers, data.fleets));
    if (driverFilter !== "all") all = all.filter((t) => t.driverId === driverFilter);
    const s = q.trim().toLowerCase();
    if (!s) return all;
    return all.filter((t) =>
      [
        t.code,
        t.client,
        t.origin,
        t.destination,
        t.driverName,
        t.fleetName,
        t.tractorPlate,
        t.trailerPlate,
      ]
        .join(" ")
        .toLowerCase()
        .includes(s),
    );
  }, [data, q, driverFilter]);

  const selectedDriver = data?.drivers.find((d) => d.id === driverFilter);
  const selectedTrips = data?.trips.filter((t) => selectedIds.includes(t.id)) ?? [];
  const compactRows = rows.filter((t) => t.freightMode !== "caixinha" && t.freightMode !== "cegonha" && t.freightMode !== "trip");
  const groupedModeRows = Array.from(
    rows.reduce(
      (groups, t) => {
        if (t.freightMode !== "caixinha" && t.freightMode !== "cegonha" && t.freightMode !== "trip") return groups;
        const key = String(t.driverId) + "|" + t.freightMode;
        const current = groups.get(key) ?? {
          key,
          mode: t.freightMode as FreightMode,
          driverId: t.driverId,
          driverName: t.driverName,
          items: [] as ComputedTrip[],
          count: 0,
          freight: 0,
          commission: 0,
          result: 0,
        };
        current.items.push(t);
        current.count += 1;
        current.freight += Number(t.freight ?? 0);
        current.commission += Number(t.commissionValue ?? 0);
        current.result += Number(t.grossResult ?? 0);
        groups.set(key, current);
        return groups;
      },
      new Map<string, {
        key: string;
        mode: FreightMode;
        driverId: string;
        driverName: string;
        items: ComputedTrip[];
        count: number;
        freight: number;
        commission: number;
        result: number;
      }>(),
    ).values(),
  ).sort((a, b) => a.driverName.localeCompare(b.driverName) || a.mode.localeCompare(b.mode));
  const allVisibleSelected = compactRows.length > 0 && compactRows.every((t) => selectedIds.includes(t.id));

  function exportPdf() {
    if (!selectedDriver) return;
    downloadDriverReportPdf({
      driverName: selectedDriver.name,
      trips: rows,
      periodLabel: "Viagens filtradas",
      sourceLabel: "Viagens",
    });
  }

  async function exportTripsExcel() {
    const ExcelJSModule: any = await import("exceljs");
    const ExcelJS: any = ExcelJSModule.default ?? ExcelJSModule;
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Viagens", { pageSetup: { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0 } });
    const logoId = workbook.addImage({ base64: REPORT_LOGO_JPEG, extension: "jpeg" });
    sheet.addImage(logoId, { tl: { col: 0.02, row: 0.01 }, ext: { width: 600, height: 300 } }); sheet.getRow(1).height = 104; sheet.getRow(2).height = 92;
    sheet.mergeCells("D1:H2"); sheet.getCell("D1").value = "VIAGENS - TRANS SALOMÃO";
    sheet.getCell("D1").font = { bold: true, size: 26, color: { argb: "111111" } }; sheet.getCell("D1").fill = { type: "pattern", pattern: "solid", fgColor: { argb: "E8EEF3" } }; sheet.getCell("D1").alignment = { horizontal: "center", vertical: "middle" };
    const header = sheet.getRow(5); header.values = ["Motorista", "Modalidade", "Viagens", "Peso", "Faturamento", "Comissão", "Após comissão", "Resultado"];
    header.eachCell((cell: any) => { cell.font = { bold: true, size: 16, color: { argb: "111111" } }; cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "DDE6EE" } }; });
    const grouped = new Map<string, any>();
    rows.forEach((trip: any) => { const mode = String(trip.freightMode ?? "ton"); const key = String(trip.driverId) + "|" + mode; const item = grouped.get(key) ?? { name: trip.driverName, mode, count: 0, weight: 0, revenue: 0, commission: 0, result: 0 }; item.count += 1; item.weight += Number(trip.netWeight ?? 0); item.revenue += Number(trip.freight ?? 0); item.commission += Number(trip.commissionValue ?? 0); item.result += Number(trip.grossResult ?? 0); grouped.set(key, item); });
    const modeName = (m: string) => m === "ton" ? "Por tonelada" : m === "trip" ? "Diária" : m === "cegonha" ? "Cegonha" : "Caixinha";
    Array.from(grouped.values()).sort((a: any, b: any) => a.name.localeCompare(b.name, "pt-BR") || modeName(a.mode).localeCompare(modeName(b.mode), "pt-BR")).forEach((item: any, index: number) => { const row = sheet.addRow([item.name, modeName(item.mode), item.count, item.weight, item.revenue, item.commission, item.revenue - item.commission, item.result]); row.eachCell((cell: any) => { cell.font = { color: { argb: "111111" }, size: 16 }; cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: index % 2 ? "EAF6FF" : "FFFFFF" } }; cell.border = { top: { style: "thin", color: { argb: "159EFF" } }, bottom: { style: "thin", color: { argb: "159EFF" } }, left: { style: "thin", color: { argb: "159EFF" } }, right: { style: "thin", color: { argb: "159EFF" } } }; }); row.getCell(4).numFmt = '0.00 "t"'; for (let c = 5; c <= 8; c += 1) row.getCell(c).numFmt = 'R$ #,##0.00'; });

    const excelModeInfo = (mode: string) => mode === "ton"
      ? { label: "POR TONELADA", fill: "D9EAD3", accent: "6AA84F", order: 1 }
      : mode === "trip"
        ? { label: "DIÁRIA", fill: "D9EAF7", accent: "3D85C6", order: 2 }
        : mode === "cegonha"
          ? { label: "CEGONHA", fill: "FCE5CD", accent: "E69138", order: 3 }
          : { label: "CAIXINHA", fill: "EADCF8", accent: "8E7CC3", order: 4 };
    const excelDateKey = (value: any) => {
      const raw = String(value ?? "").trim();
      const iso = raw.match(/^(\d{4}-\d{2}-\d{2})/); if (iso) return iso[1];
      const br = raw.match(/^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{4})/);
      if (br) return br[3] + "-" + br[2].padStart(2, "0") + "-" + br[1].padStart(2, "0");
      const parsed = new Date(raw); return Number.isNaN(parsed.getTime()) ? raw : parsed.toISOString().slice(0, 10);
    };
    const excelSame = (items: any[], key: string) => {
      const values = [...new Set(items.map((item: any) => String(item?.[key] ?? "").trim()).filter(Boolean))];
      return values.length === 1 ? values[0] : values.length > 1 ? "Vários" : "—";
    };
    const excelSpecial = new Map<string, any>();
    const excelChronological: any[] = [];
    rows.forEach((trip: any) => {
      const mode = String(trip.freightMode ?? "ton");
      const date = excelDateKey(trip.date);
      if (mode === "cegonha" || mode === "caixinha") {
        const key = [trip.driverId, mode].map((x) => String(x ?? "")).join("|");
        const item = excelSpecial.get(key) ?? { kind: "group", mode, date, firstDate: date, lastDate: date, driverName: trip.driverName, items: [], count: 0, freight: 0, commission: 0, after: 0, result: 0 };
        item.items.push(trip); item.count += 1; if (date && (!item.firstDate || date < item.firstDate)) item.firstDate = date; if (date && (!item.lastDate || date > item.lastDate)) item.lastDate = date; item.date = item.firstDate || date; item.freight += Number(trip.freight ?? 0); item.commission += Number(trip.commissionValue ?? trip.commission ?? 0); item.after += Number(trip.afterCommission ?? (Number(trip.freight ?? 0) - Number(trip.commissionValue ?? trip.commission ?? 0))); item.result += Number(trip.grossResult ?? 0); excelSpecial.set(key, item);
      } else excelChronological.push({ kind: "single", mode, date, driverName: trip.driverName, trip });
    });
    excelSpecial.forEach((item) => excelChronological.push(item));
    excelChronological.sort((a: any, b: any) => a.date.localeCompare(b.date) || String(a.driverName ?? "").localeCompare(String(b.driverName ?? ""), "pt-BR") || excelModeInfo(a.mode).order - excelModeInfo(b.mode).order || String(a.trip?.code ?? "").localeCompare(String(b.trip?.code ?? ""), "pt-BR", { numeric: true }));
    sheet.addRow([]);
    const excelTripTitle = sheet.addRow(["VIAGENS EM ORDEM DE DATA — MODALIDADES DIFERENCIADAS POR COR"]);
    sheet.mergeCells(excelTripTitle.number, 1, excelTripTitle.number, 13);
    sheet.getCell(excelTripTitle.number, 1).font = { bold: true, size: 14, color: { argb: "111111" } };
    sheet.getCell(excelTripTitle.number, 1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "DCE6EF" } };
    sheet.getCell(excelTripTitle.number, 1).alignment = { horizontal: "center", vertical: "middle" };
    const excelLegend = sheet.addRow(["LEGENDA", "POR TONELADA", "DIÁRIA", "CEGONHA", "CAIXINHA"]);
    [2,3,4,5].forEach((col, i) => { const info = excelModeInfo(["ton","trip","cegonha","caixinha"][i]); const cell = excelLegend.getCell(col); cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: info.fill } }; cell.font = { bold: true, color: { argb: "111111" } }; cell.alignment = { horizontal: "center" }; });
    const excelTripHeader = sheet.addRow(["Data", "Ticket / Grupo", "Motorista", "Modalidade", "Qtd.", "Cliente", "Origem", "Destino", "Peso líquido (t)", "Faturamento", "Comissão", "Total líquido", "Resultado bruto"]);
    excelTripHeader.height = 30;
    excelTripHeader.eachCell((cell: any) => { cell.font = { bold: true, color: { argb: "111111" }, size: 11 }; cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "C9D7E5" } }; cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true }; });
    excelChronological.forEach((item: any) => {
      const info = excelModeInfo(item.mode), grouped = item.kind === "group", trip = item.trip;
      const groupDate = item.firstDate === item.lastDate ? formatDate(item.firstDate) : formatDate(item.firstDate) + " a " + formatDate(item.lastDate);
      const row = sheet.addRow(grouped ? [groupDate, item.count + " viagens", item.driverName ?? "Sem motorista", info.label, item.count, excelSame(item.items, "client"), excelSame(item.items, "origin"), excelSame(item.items, "destination"), item.items.reduce((sum: number, x: any) => sum + Number(x.netWeight ?? 0), 0), item.freight, item.commission, item.after, item.result] : [formatDate(item.date), String(trip.code ?? "—"), String(trip.driverName ?? "Sem motorista"), info.label, 1, String(trip.client ?? "—"), String(trip.origin ?? "—"), String(trip.destination ?? "—"), Number(trip.netWeight ?? 0), Number(trip.freight ?? 0), Number(trip.commissionValue ?? trip.commission ?? 0), Number(trip.afterCommission ?? (Number(trip.freight ?? 0) - Number(trip.commissionValue ?? trip.commission ?? 0))), Number(trip.grossResult ?? 0)]);
      row.eachCell((cell: any) => { cell.font = { color: { argb: "111111" }, size: 11, bold: grouped }; cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: info.fill } }; cell.border = { top: { style: "thin", color: { argb: info.accent } }, bottom: { style: "thin", color: { argb: info.accent } }, left: { style: "thin", color: { argb: info.accent } }, right: { style: "thin", color: { argb: info.accent } } }; cell.alignment = { vertical: "middle", wrapText: true }; });
      row.getCell(4).font = { bold: true, color: { argb: "111111" }, size: 11 };
      row.getCell(9).numFmt = '0.000 "t"'; [10,11,12,13].forEach((c) => { row.getCell(c).numFmt = 'R$ #,##0.00'; });
    });

    [14, 20, 28, 24, 9, 24, 22, 22, 18, 18, 18, 18, 18].forEach((w, i) => { sheet.getColumn(i + 1).width = w; }); sheet.printArea = `A1:M${Math.max(5, sheet.rowCount)}`;
    workbook.eachSheet((excelSheet: any) => { excelSheet.eachRow({ includeEmpty: true }, (excelRow: any) => { excelRow.eachCell({ includeEmpty: true }, (cell: any) => { cell.font = { ...(cell.font ?? {}), color: { argb: "111111" } }; }); }); });
    const buffer = await workbook.xlsx.writeBuffer(); const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }); const link = document.createElement("a"); const url = URL.createObjectURL(blob); link.href = url; link.download = "Viagens_Trans_Salomao.xlsx"; link.style.display = "none"; document.body.appendChild(link); link.click(); link.remove(); window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  async function handleDeleteTrip(row: ComputedTrip) {
    if (removeTrip.isPending) return;
    if (!window.confirm('Excluir a viagem ' + row.code + '? Esta ação atualiza os totais e relatórios.')) return;
    try {
      await removeTrip.mutateAsync(row.id);
      setSelectedIds(ids => ids.filter(id => id !== row.id));
      setEditing(current => current?.id === row.id ? null : current);
      toast.success('Viagem excluída.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Não foi possível excluir a viagem.');
    }
  }

  async function handleBulkDelete() {
    if (selectedTrips.length === 0) return;
    if (!window.confirm(`Excluir ${selectedTrips.length} viagem(ns) selecionada(s)? Esta ação atualiza também totais e relatórios.`)) return;
    try {
      for (const item of selectedTrips) await removeTrip.mutateAsync(item.id);
      setSelectedIds([]);
      setBulkEditing(false);
      toast.success(`${selectedTrips.length} viagem(ns) excluída(s).`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Não foi possível excluir todas as viagens selecionadas.");
    }
  }

  async function handleBulkApply(changes: BulkTripChanges) {
    if (selectedTrips.length === 0) return;
    const numberOr = (value: string, current: number) => value.trim() ? parseLocaleNumberOrZero(value) : current;
    try {
      for (const source of selectedTrips) {
        const freightMode = changes.freightMode || source.freightMode;
        const pricePerTon = numberOr(changes.pricePerTon, source.pricePerTon);
        if (freightMode === "ton" && pricePerTon <= 0) {
          throw new Error(`Informe o preço R$/t para a viagem ${source.code}.`);
        }
        await trip.mutateAsync({
          id: source.id,
          code: source.code,
          date: changes.date || source.date,
          client: changes.client || source.client,
          origin: changes.origin || source.origin,
          destination: changes.destination || source.destination,
          driverId: changes.driverId || source.driverId,
          fleetId: changes.fleetId || source.fleetId,
          loadedTons: numberOr(changes.loadedTons, source.loadedTons),
          grossWeight: numberOr(changes.grossWeight, source.grossWeight),
          netWeight: numberOr(changes.netWeight, source.netWeight),
          freightMode,
          tripBillingType: source.tripBillingType,
          pricePerTon,
          pricePerTrip: source.pricePerTrip,
          kmStart: numberOr(changes.kmStart, source.kmStart),
          kmEnd: numberOr(changes.kmEnd, source.kmEnd),
          dieselLiters: source.dieselLiters,
          dieselPrice: source.dieselPrice,
        });
      }
      setBulkEditing(false);
      setSelectedIds([]);
      toast.success(`${selectedTrips.length} viagem(ns) atualizada(s).`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Não foi possível editar todas as viagens selecionadas.");
      throw err;
    }
  }

  return (
    <div>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-[11px] uppercase tracking-[0.18em] text-muted">
            Gestão de fretes
          </p>
          <h1 className="mt-1 font-display text-4xl font-semibold tracking-tight">
            Viagens
          </h1>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={exportPdf} disabled={!selectedDriver || rows.length === 0} title="Gerar PDF do motorista selecionado">
            <FileDown className="size-4" /> PDF motorista
          </Button>
          <Button variant="secondary" onClick={exportTripsExcel} disabled={compactRows.length === 0}>
            Excel colorido
          </Button>
          <Button
            onClick={() =>
              data &&
              setEditing(
                emptyDraft(data.drivers, data.fleets, data.trips, {
                  code: nextTripCode(data.trips),
                }),
              )
            }
          >
            <Plus className="size-4" />
            Nova viagem
          </Button>
        </div>
      </div>



      <div className="mt-6 grid gap-3 sm:grid-cols-2">
        <Input
          placeholder="Buscar ticket, motorista, rota…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <Select value={driverFilter} onChange={(e) => setDriverFilter(e.target.value)}>
          <option value="all">Todos os motoristas</option>
          {(data?.drivers ?? []).map((d) => (
            <option key={d.id} value={d.id}>{d.name}</option>
          ))}
        </Select>
      </div>

      <div className="mt-5 hidden overflow-x-auto rounded-xl border border-border lg:block">
        <table className="w-full min-w-[940px] text-left text-sm">
          <thead className="bg-surface-2 text-[10px] uppercase tracking-[0.14em] text-muted">
            <tr>
              {[
                "Ticket",
                "Data",
                "Rota",
                "Motorista",
                "Peso",
                "Frete",
                "Modo",
                "Resultado",
                "",
              ].map((h) => (
                <th key={h} className="px-3 py-3 font-medium">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {compactRows.map((t) => (
              <tr key={t.id} className="border-t border-border">
                <td className="px-3 py-3 font-display text-base font-semibold">
                  {t.code}
                </td>
                <td className="px-3 py-3 text-muted">{formatDate(t.date)}</td>
                <td className="px-3 py-3">
                  <div>{t.origin || "—"}</div>
                  <div className="text-xs text-muted">{t.destination}</div>
                </td>
                <td className="px-3 py-3">
                  <div>{t.driverName}</div>
                  <div className="text-xs text-muted">{t.fleetName}</div>
                </td>
                <td className="px-3 py-3 tabular">{tons(t.netWeight)}</td>
                <td className="px-3 py-3 tabular">
                  <div>{brl(t.freight)}</div>
                  <div className="text-xs text-muted">
                    {t.freightMode === "ton"
                      ? `${freightModeLabel(t.freightMode)} · ${brl(t.pricePerTon)}/t`
                      : freightModeLabel(t.freightMode)}
                  </div>
                </td>
                <td className="px-3 py-3"><FreightModeBadge mode={t.freightMode} /></td>
                <td className="px-3 py-3 tabular">{brl(t.grossResult)}</td>
                <td className="px-3 py-3 text-right">
                  <div className="flex justify-end gap-1">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setEditing(tripToDraft(t))}
                    >
                      Editar
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-danger"
                      disabled={removeTrip.isPending}
                      title={`Excluir ${t.code}`}
                      onClick={() => handleDeleteTrip(t)}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ul className="mt-5 grid gap-3 lg:hidden">
        {compactRows.map((t) => (
          <TripCard
            key={t.id}
            trip={t}
            onEdit={() => setEditing(tripToDraft(t))}
            onDelete={() => handleDeleteTrip(t)}
            removing={removeTrip.isPending}
          />
        ))}
      </ul>

      {rows.length === 0 ? (
        <p className="mt-8 text-center text-sm text-subtle">
          Nenhuma viagem encontrada.
        </p>
      ) : null}

      <section className="mt-6 rounded-xl border border-border bg-surface p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            {groupedModeRows.length > 0 ? (
            <div className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {groupedModeRows.map((group) => {
                const allGroupSelected = group.items.every((item) => selectedIds.includes(item.id));
                return (
                  <div key={group.key} className="rounded-xl border border-accent/30 bg-bg p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-[10px] uppercase tracking-[0.16em] text-muted">Modo de frete</p>
                        <div className="mt-2"><FreightModeBadge mode={group.mode} /></div>
                        <p className="mt-1 text-sm font-medium text-fg">{group.driverName}</p>
                      </div>
                      <Badge>{group.count} viagem{group.count === 1 ? "" : "s"}</Badge>
                    </div>
                    <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
                      <div className="rounded-lg border border-border bg-surface px-3 py-2">
                        <span className="block text-[10px] uppercase tracking-[0.12em] text-muted">Frete total</span>
                        <strong className="mt-1 block">{brl(group.freight)}</strong>
                      </div>
                      <div className="rounded-lg border border-border bg-surface px-3 py-2">
                        <span className="block text-[10px] uppercase tracking-[0.12em] text-muted">Resultado</span>
                        <strong className="mt-1 block">{brl(group.result)}</strong>
                      </div>
                    </div>
                    {group.mode === "ton" ? (
                      <div className="mt-3 grid gap-2">
                        {group.items.map((item) => (
                          <div key={item.id} className="rounded-lg border border-border bg-surface px-3 py-2 text-xs">
                            <strong className="block text-sm">{item.code}</strong>
                            <div className="mt-1 grid grid-cols-2 gap-x-3 gap-y-1 text-muted sm:grid-cols-4">
                              <span>Peso líquido: <b className="text-fg">{tons(item.netWeight)}</b></span>
                              <span>Preço/t: <b className="text-fg">{brl(item.pricePerTon)}/t</b></span>
                              <span>Frete: <b className="text-fg">{brl(item.freight)}</b></span>
                              <span>Comissão: <b className="text-fg">{brl(item.commissionValue)}</b></span>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : null}
                    <Button
                      className="mt-3 w-full"
                      size="sm"
                      variant={allGroupSelected ? "secondary" : "outline"}
                      onClick={() =>
                        setSelectedIds((ids) =>
                          allGroupSelected
                            ? ids.filter((id) => !group.items.some((item) => item.id === id))
                            : Array.from(new Set([...ids, ...group.items.map((item) => item.id)])),
                        )
                      }
                    >
                      {allGroupSelected ? "Desmarcar grupo" : "Selecionar grupo"}
                    </Button>
                  </div>
                );
              })}
            </div>
          ) : null}
          <p className="text-[11px] uppercase tracking-[0.16em] text-muted">Seleção em lote</p>
            <p className="mt-1 text-sm text-fg">
              {selectedTrips.length} viagem(ns) selecionada(s). Marque somente as que deseja alterar ou excluir.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="secondary"
              onClick={() =>
                setSelectedIds((ids) =>
                  allVisibleSelected
                    ? ids.filter((id) => !compactRows.some((row) => row.id === id))
                    : Array.from(new Set([...ids, ...compactRows.map((row) => row.id)])),
                )
              }
              disabled={compactRows.length === 0}
            >
              {allVisibleSelected ? "Desmarcar visíveis" : "Selecionar visíveis"}
            </Button>
            <Button size="sm" variant="secondary" onClick={() => setSelectedIds([])} disabled={selectedTrips.length === 0}>
              Limpar
            </Button>
            <Button size="sm" onClick={() => setBulkEditing(true)} disabled={selectedTrips.length === 0 || trip.isPending}>
              Editar selecionadas
            </Button>
            <Button size="sm" variant="ghost" className="text-danger" onClick={handleBulkDelete} disabled={selectedTrips.length === 0 || removeTrip.isPending}>
              <Trash2 className="size-4" /> Excluir selecionadas
            </Button>
          </div>
        </div>
        <div className="mt-3 grid max-h-56 gap-2 overflow-y-auto sm:grid-cols-2 xl:grid-cols-3">
          {compactRows.map((t) => (
            <label key={t.id} className="flex cursor-pointer items-start gap-2 rounded-lg border border-border bg-bg px-3 py-2 text-sm">
              <input
                type="checkbox"
                className="mt-1 size-4"
                checked={selectedIds.includes(t.id)}
                onChange={(e) =>
                  setSelectedIds((ids) =>
                    e.target.checked ? Array.from(new Set([...ids, t.id])) : ids.filter((id) => id !== t.id),
                  )
                }
              />
              <span className="min-w-0">
                <strong className="block truncate">{t.code} · {formatDate(t.date)}</strong>
                <span className="block truncate text-xs text-muted">{t.driverName} · {t.fleetName} · {freightModeLabel(t.freightMode)}</span>
              </span>
            </label>
          ))}
        </div>
      </section>

      <Dialog open={bulkEditing} onOpenChange={setBulkEditing}>
        {bulkEditing && data ? (
          <DialogContent title={`Editar ${selectedTrips.length} viagem(ns) selecionada(s)`}>
            <BulkTripEditForm
              drivers={data.drivers}
              fleets={data.fleets}
              pending={trip.isPending}
              onApply={handleBulkApply}
              onCancel={() => setBulkEditing(false)}
            />
          </DialogContent>
        ) : null}
      </Dialog>

      <Dialog open={!!editing} onOpenChange={(v) => !v && setEditing(null)}>
        {editing && data ? (
          <DialogContent title={editing.id ? `Editar ${editing.code}` : "Nova viagem"}>
            <TripForm
              key={editing.id ?? editing.code}
              drivers={data.drivers}
              fleets={data.fleets}
              trips={data.trips}
              initial={editing}
              submitLabel="Salvar viagem"
              pending={trip.isPending}
              onSubmit={async (payload) => {
                await trip.mutateAsync(payload);
                toast.success("Viagem salva.");
                setEditing(null);
              }}
            />
            {editing.id ? (
              <Button
                variant="ghost"
                className="mt-2 text-danger"
                onClick={async () => {
                  const row = rows.find((item) => item.id === editing.id);
                  if (!row) return;
                  await handleDeleteTrip(row);
                }}
              >
                <Trash2 className="size-4" /> Remover viagem
              </Button>
            ) : null}
          </DialogContent>
        ) : null}
      </Dialog>
    </div>
  );
}

function TripCard({
  trip,
  onEdit,
  onDelete,
  removing,
}: {
  trip: ComputedTrip;
  onEdit: () => void;
  onDelete: () => void;
  removing: boolean;
}) {
  return (
    <li className="rounded-xl border border-border bg-surface p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-display text-2xl font-semibold">{trip.code}</p>
          <p className="text-sm text-muted">
            {formatDate(trip.date)} · {trip.driverName}
          </p>
        </div>
        <Badge>{integer(trip.kmDriven)} km</Badge>
      </div>
      <p className="mt-3 text-sm">
        {trip.origin || "—"} → {trip.destination || "—"}
      </p>
      {trip.freightMode === "ton" ? (
        <dl className="mt-3 grid grid-cols-2 gap-2 text-sm">
          <div className="rounded-lg border border-border bg-bg px-3 py-2">
            <dt className="text-[10px] uppercase tracking-[0.12em] text-subtle">Peso líquido</dt>
            <dd className="mt-1 font-semibold tabular">{tons(trip.netWeight)}</dd>
          </div>
          <div className="rounded-lg border border-border bg-bg px-3 py-2">
            <dt className="text-[10px] uppercase tracking-[0.12em] text-subtle">Preço por tonelada</dt>
            <dd className="mt-1 font-semibold tabular">{brl(trip.pricePerTon)}/t</dd>
          </div>
          <div className="rounded-lg border border-border bg-bg px-3 py-2">
            <dt className="text-[10px] uppercase tracking-[0.12em] text-subtle">Frete total</dt>
            <dd className="mt-1 font-semibold tabular">{brl(trip.freight)}</dd>
          </div>
          <div className="rounded-lg border border-border bg-bg px-3 py-2">
            <dt className="text-[10px] uppercase tracking-[0.12em] text-subtle">Comissão</dt>
            <dd className="mt-1 font-semibold tabular">{brl(trip.commissionValue)}</dd>
          </div>
        </dl>
      ) : (
        <dl className="mt-3 grid grid-cols-2 gap-2 text-sm">
          <div>
            <dt className="text-[10px] uppercase tracking-[0.12em] text-subtle">Frete</dt>
            <dd className="tabular">{brl(trip.freight)}</dd>
            <dd className="text-[10px] text-muted">{freightModeLabel(trip.freightMode)}</dd>
          </div>
          <div>
            <dt className="text-[10px] uppercase tracking-[0.12em] text-subtle">Resultado</dt>
            <dd className="tabular">{brl(trip.grossResult)}</dd>
          </div>
        </dl>
      )}
      <div className="mt-4 flex gap-2">
        <Button variant="secondary" size="sm" onClick={onEdit}>
          Editar
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="text-danger"
          disabled={removing}
          onClick={onDelete}
        >
          <Trash2 className="size-4" /> Excluir
        </Button>
      </div>
    </li>
  );
}


type BulkTripChanges = {
  date: string;
  client: string;
  origin: string;
  destination: string;
  driverId: string;
  fleetId: string;
  freightMode: FreightMode | "";
  loadedTons: string;
  grossWeight: string;
  netWeight: string;
  pricePerTon: string;
  kmStart: string;
  kmEnd: string;
};

function BulkTripEditForm({
  drivers,
  fleets,
  pending,
  onApply,
  onCancel,
}: {
  drivers: Driver[];
  fleets: Fleet[];
  pending: boolean;
  onApply: (changes: BulkTripChanges) => Promise<void>;
  onCancel: () => void;
}) {
  const [form, setForm] = useState<BulkTripChanges>({
    date: "", client: "", origin: "", destination: "", driverId: "", fleetId: "", freightMode: "",
    loadedTons: "", grossWeight: "", netWeight: "", pricePerTon: "", kmStart: "", kmEnd: "",
  });
  const set = (key: keyof BulkTripChanges, value: string) => setForm((f) => ({ ...f, [key]: value }));
  return (
    <form className="grid gap-4" onSubmit={async (e) => { e.preventDefault(); await onApply(form); }}>
      <p className="text-sm text-muted">Preencha apenas os campos que deseja alterar em todas as viagens selecionadas. Campos vazios permanecem como estão.</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Data"><Input type="date" value={form.date} onChange={(e) => set("date", e.target.value)} /></Field>
        <Field label="Modo de frete">
          <Select value={form.freightMode} onChange={(e) => set("freightMode", e.target.value)}>
            <option value="">Não alterar</option>
            <option value="ton">Por tonelada</option>
            <option value="trip">Por viagem</option>
            <option value="cegonha">Cegonha</option>
            <option value="caixinha">Caixinha</option>
          </Select>
        </Field>
        <Field label="Motorista"><Select value={form.driverId} onChange={(e) => set("driverId", e.target.value)}><option value="">Não alterar</option>{drivers.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</Select></Field>
        <Field label="Conjunto"><Select value={form.fleetId} onChange={(e) => set("fleetId", e.target.value)}><option value="">Não alterar</option>{fleets.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}</Select></Field>
        <Field label="Cliente"><Input value={form.client} onChange={(e) => set("client", e.target.value)} placeholder="Não alterar" /></Field>
        <Field label="Origem"><Input value={form.origin} onChange={(e) => set("origin", e.target.value)} placeholder="Não alterar" /></Field>
        <Field label="Destino"><Input value={form.destination} onChange={(e) => set("destination", e.target.value)} placeholder="Não alterar" /></Field>
        <Field label="Ton. carregadas"><Input inputMode="decimal" value={form.loadedTons} onChange={(e) => set("loadedTons", e.target.value)} placeholder="Não alterar" /></Field>
        <Field label="Peso bruto"><Input inputMode="decimal" value={form.grossWeight} onChange={(e) => set("grossWeight", e.target.value)} placeholder="Não alterar" /></Field>
        <Field label="Peso líquido"><Input inputMode="decimal" value={form.netWeight} onChange={(e) => set("netWeight", e.target.value)} placeholder="Não alterar" /></Field>
        <Field label="Preço R$/t (só Por tonelada)"><Input inputMode="decimal" value={form.pricePerTon} onChange={(e) => set("pricePerTon", e.target.value)} placeholder="Não alterar" /></Field>
        <Field label="KM inicial"><Input inputMode="numeric" value={form.kmStart} onChange={(e) => set("kmStart", e.target.value)} placeholder="Não alterar" /></Field>
        <Field label="KM final"><Input inputMode="numeric" value={form.kmEnd} onChange={(e) => set("kmEnd", e.target.value)} placeholder="Não alterar" /></Field>
      </div>
      <div className="rounded-lg border border-border bg-bg px-3 py-2 text-xs text-muted">Por viagem, Cegonha e Caixinha usam automaticamente os valores atuais da Gerência. Por tonelada usa o R$/t de cada viagem.</div>
      <div className="flex justify-end gap-2"><Button type="button" variant="secondary" onClick={onCancel}>Cancelar</Button><Button type="submit" disabled={pending}>{pending ? "Atualizando…" : "Aplicar às selecionadas"}</Button></div>
    </form>
  );
}
