import { REPORT_LOGO_JPEG } from "@/lib/report-logo";
import { inPeriod } from "@/lib/calc";
import { brl, formatDate } from "@/lib/format";
import type { ComputedTrip, FleetState, PeriodKey } from "@/lib/types";
import type { ReportFueling } from "@/lib/pdf";

export async function downloadFleetExcel({ data, computed, fuelings, period, driverScope }: {
  data: FleetState | undefined;
  computed: ComputedTrip[];
  fuelings: ReportFueling[];
  period: PeriodKey;
  driverScope?: { id: string; name: string };
}) {
    const { getManagementSession } = await import("@/lib/management-auth");
    const management = await getManagementSession().catch(() => ({ authenticated: false as const, username: null, role: null }));
    const excelOperator = management.authenticated && management.username ? management.username : "Gerência";
    const excelTrips = driverScope ? computed.filter((t: any) => String(t.driverId) === String(driverScope.id)) : computed;
    const excelFuelings = driverScope ? fuelings.filter((f: any) => String(f.driverId) === String(driverScope.id)) : fuelings;
    const excelExpensesSource = (data?.expenses ?? []).filter((e: any) => inPeriod(e.date, period) && (!driverScope || String(e.driverId ?? "") === String(driverScope.id)));
    const now = new Date();
    const toIso = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
    const todayIso = toIso(now);
    const shift = (days: number) => { const d = new Date(now.getFullYear(), now.getMonth(), now.getDate()); d.setDate(d.getDate() + days); return toIso(d); };
    const allDates = [
      ...excelTrips.map((x: any) => String(x.date ?? "").slice(0, 10)),
      ...excelFuelings.map((x: any) => String(x.date ?? "").slice(0, 10)),
      ...excelExpensesSource.map((x: any) => String(x.date ?? "").slice(0, 10)),
    ].filter((value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value)).sort();
    const excelPeriodLabel = (() => {
      if (period === "month") { const first = toIso(new Date(now.getFullYear(), now.getMonth(), 1)); const last = toIso(new Date(now.getFullYear(), now.getMonth() + 1, 0)); return `Este mês (${formatDate(first)} a ${formatDate(last)})`; }
      if (period === "7d") return `7 dias (${formatDate(shift(-6))} a ${formatDate(todayIso)})`;
      if (period === "30d") return `30 dias (${formatDate(shift(-29))} a ${formatDate(todayIso)})`;
      if (allDates.length > 0) return `Tudo (${formatDate(allDates[0])} a ${formatDate(allDates[allDates.length - 1])})`;
      return "Tudo";
    })();
    const ExcelJSModule: any = await import("exceljs");
    const ExcelJS: any = ExcelJSModule.default ?? ExcelJSModule;
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Planilha Geral", { views: [{ state: "frozen", ySplit: 6 }], pageSetup: { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0, paperSize: 8 } });
    const lightBlue = "DCEEFF", blue = "A9CBEA", dark = lightBlue, white = lightBlue, black = "111111", pale = lightBlue, totalFill = lightBlue;
    const logoId = workbook.addImage({ base64: REPORT_LOGO_JPEG, extension: "jpeg" });
    sheet.addImage(logoId, { tl: { col: 0.02, row: 0.01 }, ext: { width: 600, height: 300 } });
    sheet.mergeCells("D1:H2"); sheet.getCell("D1").value = driverScope ? `PLANILHA ${driverScope.name.toLocaleUpperCase("pt-BR")} - TRANS SALOMÃO` : "PLANILHA GERAL - TRANS SALOMÃO"; sheet.getCell("D1").font = { bold: true, size: 26, color: { argb: black } }; sheet.getCell("D1").fill = { type: "pattern", pattern: "solid", fgColor: { argb: dark } }; sheet.getCell("D1").alignment = { horizontal: "center", vertical: "middle" };
    sheet.mergeCells("D3:H4"); sheet.getCell("D3").value = `${excelPeriodLabel} • Relatórios • Operador: ${excelOperator}`; sheet.getCell("D3").font = { bold: true, size: 16, color: { argb: black } }; sheet.getCell("D3").fill = { type: "pattern", pattern: "solid", fgColor: { argb: pale } }; sheet.getCell("D3").alignment = { horizontal: "center", vertical: "middle" };
    sheet.getRow(1).height = 104; sheet.getRow(2).height = 92; sheet.getRow(3).height = 40; sheet.getRow(4).height = 40;
    const border = { top: { style: "thin", color: { argb: blue } }, bottom: { style: "thin", color: { argb: blue } }, left: { style: "thin", color: { argb: blue } }, right: { style: "thin", color: { argb: blue } } };
    const styleHeader = (row: any) => row.eachCell((cell: any) => { cell.font = { bold: true, color: { argb: black }, size: 16 }; cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: blue } }; cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true }; cell.border = border; });
    const styleRow = (row: any, index: number) => row.eachCell((cell: any) => { cell.font = { color: { argb: black }, size: 16 }; cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: index % 2 ? pale : white } }; cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true }; cell.border = border; });
    const addSection = (title: string, headers: string[]) => { sheet.addRow([]); const titleRow = sheet.addRow([title]); sheet.mergeCells(titleRow.number, 1, titleRow.number, 8); titleRow.height = 34; const cell = sheet.getCell(titleRow.number, 1); cell.font = { bold: true, size: 18, color: { argb: black } }; cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: dark } }; cell.alignment = { horizontal: "center", vertical: "middle" }; const header = sheet.addRow(headers); header.height = 38; styleHeader(header); };
    const normalize = (value: any) => String(value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase();
    const modeName = (mode: string) => mode === "ton" ? "Por tonelada" : mode === "trip" ? "Diária" : mode === "cegonha" ? "Cegonha" : "Caixinha";
    const grouped = new Map<string, any>();
    excelTrips.forEach((trip: any) => { const mode = String(trip.freightMode ?? "ton"); const driverName = String(trip.driverName ?? "Sem motorista"); const key = String(trip.driverId ?? driverName) + "|" + mode; const item = grouped.get(key) ?? { driverId: trip.driverId, driverName, mode, count: 0, weight: 0, revenue: 0, commission: 0 }; item.count += 1; item.weight += Number(trip.netWeight ?? 0); item.revenue += Number(trip.freight ?? 0); item.commission += Number(trip.commissionValue ?? trip.commission ?? 0); grouped.set(key, item); });
    const advancesByDriver = new Map<string, number>();
    excelExpensesSource.filter((e: any) => e.category === "Adiantamento").forEach((e: any) => { const driver = (data?.drivers ?? []).find((d: any) => String(d.id) === String(e.driverId ?? "")); const key = String(e.driverId ?? normalize(driver?.name)); advancesByDriver.set(key, (advancesByDriver.get(key) ?? 0) + Number(e.amount ?? 0)); });
    const totalRevenue = Array.from(grouped.values()).reduce((sum: number, item: any) => sum + Number(item.revenue ?? 0), 0);
    const totalCommission = Array.from(grouped.values()).reduce((sum: number, item: any) => sum + Number(item.commission ?? 0), 0);
    const totalFueling = excelFuelings.reduce((sum: number, f: any) => sum + Number(f.liters ?? 0) * Number(f.pricePerLiter ?? 0), 0);
    const totalAdvances = Array.from(advancesByDriver.values()).reduce((sum: number, value: number) => sum + value, 0);
    const totalNetRevenue = totalRevenue - totalFueling - totalCommission;
    const summary = sheet.getRow(5);
    summary.values = ["Faturamento total", totalRevenue, "Faturamento líquido", totalNetRevenue, "Total de comissão", totalCommission, "Custo diesel", totalFueling];
    summary.height = 42;
    summary.eachCell((cell: any, col: number) => { cell.font = { bold: true, color: { argb: black }, size: 16 }; cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: totalFill } }; cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true }; cell.border = border; if (col % 2 === 0) cell.numFmt = 'R$ #,##0.00'; });
    const dieselByDriver = new Map<string, number>();
    excelFuelings.forEach((f: any) => { const driver = (data?.drivers ?? []).find((d: any) => String(d.id) === String(f.driverId ?? "")); const key = String(f.driverId ?? normalize(driver?.name)); if (!key) return; dieselByDriver.set(key, (dieselByDriver.get(key) ?? 0) + Number(f.liters ?? 0) * Number(f.pricePerLiter ?? 0)); });
    const tripHeader = sheet.getRow(6); tripHeader.values = ["Motorista", "Modalidade", "Fretes", "Faturamento", "Comissão", "Adiantamentos", "Custo diesel", "Faturamento líquido"]; tripHeader.height = 42; styleHeader(tripHeader);
    const seenDrivers = new Set<string>();
    Array.from(grouped.values()).sort((a: any, b: any) => a.driverName.localeCompare(b.driverName, "pt-BR") || modeName(a.mode).localeCompare(modeName(b.mode), "pt-BR")).forEach((item: any, index: number) => { const driverKey = String(item.driverId ?? normalize(item.driverName)); const firstDriverRow = !seenDrivers.has(driverKey); const advance = firstDriverRow ? (advancesByDriver.get(driverKey) ?? advancesByDriver.get(normalize(item.driverName)) ?? 0) : 0; const diesel = firstDriverRow ? (dieselByDriver.get(driverKey) ?? dieselByDriver.get(normalize(item.driverName)) ?? 0) : 0; seenDrivers.add(driverKey); const row = sheet.addRow([item.driverName, modeName(item.mode), item.count, item.revenue, item.commission, advance, diesel, item.revenue - item.commission - diesel]); styleRow(row, index); for (let c = 4; c <= 8; c += 1) { row.getCell(c).numFmt = 'R$ #,##0.00'; row.getCell(c).font = { bold: true, color: { argb: black }, size: 16 }; } });

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
    excelTrips.forEach((trip: any) => {
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

    addSection("ABASTECIMENTOS / CUSTO DIESEL", ["Data", "Motorista", "Posto", "Litros", "Preço/L", "Custo diesel"]);
    excelFuelings.forEach((f: any, index: number) => { const row = sheet.addRow([formatDate(f.date), f.driverName ?? (data?.drivers ?? []).find((d: any) => d.id === f.driverId)?.name ?? "Sem motorista", f.station ?? "—", Number(f.liters ?? 0), Number(f.pricePerLiter ?? 0), Number(f.liters ?? 0) * Number(f.pricePerLiter ?? 0)]); styleRow(row, index); row.getCell(4).numFmt = '0.00 "L"'; row.getCell(5).numFmt = row.getCell(6).numFmt = 'R$ #,##0.00'; });
    const periodExpenses = excelExpensesSource;
    addSection("ADIANTAMENTOS", ["Data", "Motorista", "Descrição", "Valor"]);
    periodExpenses.filter((e: any) => e.category === "Adiantamento").forEach((e: any, index: number) => { const driver = (data?.drivers ?? []).find((d: any) => String(d.id) === String(e.driverId ?? "")); const row = sheet.addRow([formatDate(e.date), driver?.name ?? "Motorista removido", e.description ?? "—", Number(e.amount ?? 0)]); styleRow(row, index); row.getCell(4).numFmt = 'R$ #,##0.00'; });
    addSection("DESPESAS", ["Data", "Categoria", "Descrição", "Valor", "Motorista"]);
    periodExpenses.filter((e: any) => e.category !== "Adiantamento").forEach((e: any, index: number) => { const driver = (data?.drivers ?? []).find((d: any) => String(d.id) === String(e.driverId ?? "")); const row = sheet.addRow([formatDate(e.date), e.category, e.description ?? "—", Number(e.amount ?? 0), driver?.name ?? "—"]); styleRow(row, index); row.getCell(4).numFmt = 'R$ #,##0.00'; });
    addSection("CADASTROS - MOTORISTAS E CONJUNTOS", ["Tipo", "Nome", "CPF / Cavalo", "Telefone / Carreta", "CNH / Modelo", "Categoria", "Comissão", "Status"]);
    (data?.drivers ?? []).filter((d: any) => !driverScope || String(d.id) === String(driverScope.id)).forEach((d: any, index: number) => { const row = sheet.addRow(["Motorista", d.name, d.cpf ?? "—", d.phone ?? "—", d.cnh ?? "—", d.cnhCategory ?? d.category ?? "—", Number(d.commissionPct ?? 0), d.status]); styleRow(row, index); row.getCell(7).numFmt = '0.0%'; });
    (data?.fleets ?? []).filter((f: any) => !driverScope || excelTrips.some((t: any) => String(t.fleetId ?? "") === String(f.id))).forEach((f: any, index: number) => { const row = sheet.addRow(["Conjunto", f.name, f.tractorPlate ?? "—", f.trailerPlate ?? "—", f.model ?? f.type ?? "—", "—", "—", f.status]); styleRow(row, index); });
    [14, 20, 28, 24, 9, 24, 22, 22, 18, 18, 18, 18, 18].forEach((width, i) => { sheet.getColumn(i + 1).width = width; }); sheet.autoFilter = { from: "A6", to: `H${Math.max(6, 6 + grouped.size)}` }; sheet.printArea = `A1:M${sheet.rowCount}`;

    if (driverScope) {
      const detailedTrips = excelTrips
        .filter((trip: any) => {
          const mode = String(trip.freightMode ?? "ton");
          return mode === "ton" || mode === "trip";
        })
        .sort((a: any, b: any) => String(a.date ?? "").localeCompare(String(b.date ?? "")) || String(a.code ?? "").localeCompare(String(b.code ?? ""), "pt-BR", { numeric: true }));
      const groupedModeMap = new Map<string, any>();
      excelTrips.filter((trip: any) => { const mode = String(trip.freightMode ?? "ton"); return mode === "cegonha" || mode === "caixinha"; }).forEach((trip: any) => {
        const mode = String(trip.freightMode ?? "ton");
        const date = String(trip.date ?? "").slice(0, 10);
        const key = mode;
        const group = groupedModeMap.get(key) ?? { mode, date, firstDate: date, lastDate: date, items: [], count: 0, freight: 0, commission: 0, after: 0, result: 0 };
        group.items.push(trip); group.count += 1; if (date && (!group.firstDate || date < group.firstDate)) group.firstDate = date; if (date && (!group.lastDate || date > group.lastDate)) group.lastDate = date; group.date = group.firstDate || date; group.freight += Number(trip.freight ?? 0); group.commission += Number(trip.commissionValue ?? trip.commission ?? 0); group.after += Number(trip.afterCommission ?? (Number(trip.freight ?? 0) - Number(trip.commissionValue ?? trip.commission ?? 0))); group.result += Number(trip.grossResult ?? 0); groupedModeMap.set(key, group);
      });
      const groupedModes = Array.from(groupedModeMap.values()).sort((a: any, b: any) => String(a.date).localeCompare(String(b.date)) || String(a.mode).localeCompare(String(b.mode)));
      const driverModeInfo = (mode: string) => mode === "ton" ? { label: "POR TONELADA", fill: "D9EAD3", accent: "6AA84F", order: 1 } : mode === "trip" ? { label: "DIÁRIA", fill: "D9EAF7", accent: "3D85C6", order: 2 } : mode === "cegonha" ? { label: "CEGONHA", fill: "FCE5CD", accent: "E69138", order: 3 } : { label: "CAIXINHA", fill: "EADCF8", accent: "8E7CC3", order: 4 };
      const orderedDriverRows = [
        ...detailedTrips.map((trip: any) => ({ kind: "trip", mode: String(trip.freightMode ?? "ton"), date: String(trip.date ?? "").slice(0, 10), trip })),
        ...groupedModes.map((group: any) => ({ kind: "group", mode: group.mode, date: group.date, group })),
      ].sort((a: any, b: any) => String(a.date).localeCompare(String(b.date)) || driverModeInfo(a.mode).order - driverModeInfo(b.mode).order || String(a.trip?.code ?? "").localeCompare(String(b.trip?.code ?? ""), "pt-BR", { numeric: true }));

      if (detailedTrips.length > 0 || groupedModes.length > 0) {
        const tonSheet = workbook.addWorksheet("Viagens do motorista", {
          pageSetup: { orientation: "landscape", paperSize: 8, fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
        });
        tonSheet.orderNo = 1;
        tonSheet.addImage(logoId, { tl: { col: 0.05, row: 0.05 }, ext: { width: 480, height: 225 } });
        tonSheet.mergeCells("D1:Q2");
        tonSheet.getCell("D1").value = "RELATÓRIO COMPLETO DO MOTORISTA - TRANS SALOMÃO";
        tonSheet.getCell("D1").font = { bold: true, size: 20, color: { argb: "111111" } };
        tonSheet.getCell("D1").alignment = { horizontal: "center", vertical: "middle" };
        tonSheet.mergeCells("D3:Q3");
        tonSheet.getCell("D3").value = driverScope.name + " • " + excelPeriodLabel + " • Relatórios • Operador: " + excelOperator;
        tonSheet.getCell("D3").font = { bold: true, size: 13, color: { argb: "111111" } };
        tonSheet.getCell("D3").alignment = { horizontal: "center", vertical: "middle", wrapText: false };

        const countMode = (mode: string) => excelTrips.filter((trip: any) => String(trip.freightMode ?? "ton") === mode).length;
        const totalFreightDriver = excelTrips.reduce((sum: number, trip: any) => sum + Number(trip.freight ?? 0), 0);
        const totalCommissionDriver = excelTrips.reduce((sum: number, trip: any) => sum + Number(trip.commissionValue ?? trip.commission ?? 0), 0);
        const totalDieselDriver = excelTrips.reduce((sum: number, trip: any) => sum + Number(trip.dieselCost ?? 0), 0);

        tonSheet.mergeCells("A4:Q4");
        tonSheet.getCell("A4").value =
          "VIAGENS EM ORDEM DE DATA • Viagens: " + excelTrips.length +
          " • Por tonelada: " + countMode("ton") +
          " • Diária: " + countMode("trip") +
          " • Cegonha: " + countMode("cegonha") +
          " • Caixinha: " + countMode("caixinha");
        tonSheet.getCell("A4").font = { bold: true, size: 12, color: { argb: "111111" } };
        tonSheet.getCell("A4").fill = { type: "pattern", pattern: "solid", fgColor: { argb: "EAF4FB" } };
        tonSheet.getCell("A4").alignment = { horizontal: "center", vertical: "middle", wrapText: false };

        tonSheet.mergeCells("A5:Q5");
        tonSheet.getCell("A5").value =
          "Frete total: " + brl(totalFreightDriver) +
          " • Comissão total: " + brl(totalCommissionDriver) +
          " • Diesel: " + brl(totalDieselDriver) +
          " • Após comissão: " + brl(totalFreightDriver - totalCommissionDriver);
        tonSheet.getCell("A5").font = { bold: true, size: 12, color: { argb: "111111" } };
        tonSheet.getCell("A5").fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF2CC" } };
        tonSheet.getCell("A5").alignment = { horizontal: "center", vertical: "middle", wrapText: false };

        tonSheet.getRow(1).height = 72;
        tonSheet.getRow(2).height = 58;
        tonSheet.getRow(3).height = 28;
        tonSheet.getRow(4).height = 24;
        tonSheet.getRow(5).height = 24;

        const tonHeader = tonSheet.getRow(6);
        tonHeader.values = [
          "Data", "Ticket", "Cliente", "Origem", "Destino", "Motorista", "Conjunto", "Modalidade (tipo de viagem)",
          "Peso carregado (t)", "Peso bruto (t)", "Peso líquido (t)", "Preço/t ou diária",
          "Frete", "Comissão (%)", "Comissão", "Após comissão", "Resultado bruto"
        ];
        tonHeader.height = 30;
        tonHeader.eachCell((cell: any) => {
          cell.font = { bold: true, size: 13, color: { argb: "111111" } };
          cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "A9CBEA" } };
          cell.alignment = { horizontal: "center", vertical: "middle", wrapText: false };
          cell.border = border;
        });

        orderedDriverRows.forEach((item: any) => {
          const info = driverModeInfo(item.mode);
          if (item.kind === "group") {
            const group = item.group;
            const values = (key: string) => { const list = [...new Set(group.items.map((x: any) => String(x?.[key] ?? "").trim()).filter(Boolean))]; return list.length === 1 ? list[0] : list.length > 1 ? "Vários" : ""; };
            const groupDate = group.firstDate === group.lastDate ? formatDate(group.firstDate) : formatDate(group.firstDate) + " a " + formatDate(group.lastDate);
            const row = tonSheet.addRow([groupDate, String(group.count) + " viagens", values("client"), values("origin"), values("destination"), driverScope.name, values("fleetName"), info.label, "", "", "", "", group.freight, "", group.commission, group.after, group.result]);
            row.height = 24;
            row.eachCell((cell: any) => { cell.font = { bold: true, color: { argb: "111111" }, size: 12 }; cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: info.fill } }; cell.alignment = { vertical: "middle", wrapText: false }; cell.border = { top: { style: "thin", color: { argb: info.accent } }, bottom: { style: "thin", color: { argb: info.accent } }, left: { style: "thin", color: { argb: info.accent } }, right: { style: "thin", color: { argb: info.accent } } }; });
            [13, 15, 16, 17].forEach((c) => { row.getCell(c).numFmt = 'R$ #,##0.00'; });
            return;
          }
          const trip = item.trip;
          const freight = Number(trip.freight ?? 0);
          const commission = Number(trip.commissionValue ?? trip.commission ?? 0);
          const dieselCost = Number(trip.dieselCost ?? 0);
          const row = tonSheet.addRow([formatDate(trip.date), String(trip.code ?? "—"), String(trip.client ?? "—"), String(trip.origin ?? "—"), String(trip.destination ?? "—"), String(trip.driverName ?? driverScope.name), String(trip.fleetName ?? "—"), info.label, Number(trip.loadedTons ?? 0), Number(trip.grossWeight ?? 0), Number(trip.netWeight ?? 0), item.mode === "trip" ? Number(trip.pricePerTrip ?? freight) : Number(trip.pricePerTon ?? 0), freight, freight > 0 ? commission / freight : 0, commission, Number(trip.afterCommission ?? (freight - commission)), Number(trip.grossResult ?? (freight - dieselCost))]);
          row.height = 24;
          row.eachCell((cell: any) => { cell.font = { color: { argb: "111111" }, size: 12 }; cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: info.fill } }; cell.alignment = { vertical: "middle", wrapText: false }; cell.border = { top: { style: "thin", color: { argb: info.accent } }, bottom: { style: "thin", color: { argb: info.accent } }, left: { style: "thin", color: { argb: info.accent } }, right: { style: "thin", color: { argb: info.accent } } }; });
          [9, 10, 11].forEach((c) => { row.getCell(c).numFmt = '0.000 "t"'; }); [12, 13, 15, 16, 17].forEach((c) => { row.getCell(c).numFmt = 'R$ #,##0.00'; }); row.getCell(14).numFmt = '0.00%'; row.getCell(8).font = { bold: true, color: { argb: "111111" }, size: 12 };
        });

        const totalRow = tonSheet.addRow([
          "TOTAL", "", "", "", "", "", "", "",
          excelTrips.reduce((sum: number, trip: any) => sum + Number(trip.loadedTons ?? 0), 0),
          excelTrips.reduce((sum: number, trip: any) => sum + Number(trip.grossWeight ?? 0), 0),
          excelTrips.reduce((sum: number, trip: any) => sum + Number(trip.netWeight ?? 0), 0),
          "",
          excelTrips.reduce((sum: number, trip: any) => sum + Number(trip.freight ?? 0), 0),
          "",
          excelTrips.reduce((sum: number, trip: any) => sum + Number(trip.commissionValue ?? trip.commission ?? 0), 0),
          excelTrips.reduce((sum: number, trip: any) => sum + Number(trip.afterCommission ?? (Number(trip.freight ?? 0) - Number(trip.commissionValue ?? trip.commission ?? 0))), 0),
          excelTrips.reduce((sum: number, trip: any) => sum + Number(trip.grossResult ?? (Number(trip.freight ?? 0) - Number(trip.dieselCost ?? 0))), 0),
        ]);
        totalRow.height = 26;
        totalRow.eachCell((cell: any) => {
          cell.font = { bold: true, size: 12, color: { argb: "111111" } };
          cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "A9CBEA" } };
          cell.border = border;
          cell.alignment = { vertical: "middle", wrapText: false };
        });
        [9, 10, 11].forEach((c) => { totalRow.getCell(c).numFmt = '0.000 "t"'; });
        [13, 15, 16, 17].forEach((c) => { totalRow.getCell(c).numFmt = 'R$ #,##0.00'; });

        [14, 14, 24, 22, 22, 26, 26, 18, 19, 19, 19, 22, 22, 17, 22, 22, 22]
          .forEach((width, index) => { tonSheet.getColumn(index + 1).width = width; });
        tonSheet.views = [{ state: "frozen", ySplit: 6 }];
        tonSheet.autoFilter = { from: { row: 6, column: 1 }, to: { row: Math.max(6, tonSheet.rowCount - 1), column: 17 } };
        tonSheet.printArea = "A1:Q" + tonSheet.rowCount;

        // O Excel individual deve ter uma única aba: resumo + todas as modalidades nela.
        workbook.removeWorksheet(sheet.id);
      }
    }

    workbook.eachSheet((excelSheet: any) => { excelSheet.eachRow({ includeEmpty: true }, (excelRow: any) => { excelRow.eachCell({ includeEmpty: true }, (cell: any) => { cell.font = { ...(cell.font ?? {}), color: { argb: "111111" } }; }); }); });
    const buffer = await workbook.xlsx.writeBuffer(); const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }); const link = document.createElement("a"); const url = URL.createObjectURL(blob); link.href = url; const safeDriverName = driverScope?.name ? driverScope.name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z0-9_-]+/g, "_") : "Geral"; link.download = driverScope ? `Planilha_${safeDriverName}_Trans_Salomao.xlsx` : "Planilha_Geral_Trans_Salomao.xlsx"; link.style.display = "none"; document.body.appendChild(link); link.click(); link.remove(); window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
