async function exportExcelColorido() {
  const ExcelJSModule: any = await import("exceljs");
  const ExcelJS: any = ExcelJSModule.default ?? ExcelJSModule;
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Trans Salomão";
  workbook.created = new Date();

  const black = "111111";
  const dark = "202020";
  const light = "F7F7F7";
  const white = "FFFFFF";
  const border = {
    top: { style: "thin", color: { argb: "B8B8B8" } },
    bottom: { style: "thin", color: { argb: "B8B8B8" } },
    left: { style: "thin", color: { argb: "B8B8B8" } },
    right: { style: "thin", color: { argb: "B8B8B8" } },
  } as any;
  const normalize = (value: any) => String(value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase();
  const fuelTypeOf = (f: any) => {
    const type = normalize(f?.fuelType ?? "diesel");
    return type === "arla" ? "arla" : type === "gasolina" ? "gasolina" : "diesel";
  };
  const fuelLabel = (f: any) => fuelTypeOf(f) === "arla" ? "ARLA" : fuelTypeOf(f) === "gasolina" ? "Gasolina" : "Diesel";
  const modeName = (mode: string) => mode === "ton" ? "Por tonelada" : mode === "trip" ? "Por viagem" : mode === "cegonha" ? "Cegonha" : "Caixinha";
  const fuelCost = (f: any) => Number(f?.liters ?? 0) * Number(f?.pricePerLiter ?? 0);
  const safeDate = (value: any) => String(value ?? "").slice(0, 10);
  const today = new Date();
  const toIso = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  const subtractDays = (days: number) => { const d = new Date(today); d.setDate(d.getDate() - days); return d; };
  const dataDates = [
    ...computed.map((t: any) => safeDate(t.date)),
    ...fuelings.map((f: any) => safeDate(f.date)),
    ...(data?.expenses ?? []).filter((e: any) => inPeriod(e.date, period)).map((e: any) => safeDate(e.date)),
  ].filter(Boolean).sort();
  let startIso = dataDates[0] ?? toIso(today);
  let endIso = dataDates[dataDates.length - 1] ?? toIso(today);
  if (period === "7d") { startIso = toIso(subtractDays(6)); endIso = toIso(today); }
  if (period === "30d") { startIso = toIso(subtractDays(29)); endIso = toIso(today); }
  if (period === "month") { startIso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-01`; endIso = toIso(today); }
  const exactPeriodLabel = `${formatDate(startIso)} a ${formatDate(endIso)}`;

  const advances = (data?.expenses ?? []).filter((e: any) => e.category === "Adiantamento" && inPeriod(e.date, period));
  const advancesByDriver = new Map<string, number>();
  advances.forEach((e: any) => {
    const driver = (data?.drivers ?? []).find((d: any) => String(d.id) === String(e.driverId ?? ""));
    const key = String(e.driverId ?? normalize(driver?.name ?? "Sem motorista"));
    advancesByDriver.set(key, (advancesByDriver.get(key) ?? 0) + Number(e.amount ?? 0));
  });

  const driverMap = new Map<string, any>();
  const ensureDriver = (driverId: any, driverName: any) => {
    const name = String(driverName ?? "Sem motorista").trim() || "Sem motorista";
    const key = String(driverId ?? normalize(name));
    let item = driverMap.get(key);
    if (!item) {
      item = { key, id: driverId ?? null, name, trips: [], fuelings: [], revenue: 0, commission: 0, advance: 0 };
      driverMap.set(key, item);
    }
    return item;
  };
  computed.forEach((trip: any) => {
    const item = ensureDriver(trip.driverId, trip.driverName);
    item.trips.push(trip);
    item.revenue += Number(trip.freight ?? 0);
    item.commission += Number(trip.commissionValue ?? trip.commission ?? 0);
  });
  fuelings.forEach((f: any) => {
    const driver = (data?.drivers ?? []).find((d: any) => String(d.id) === String(f.driverId ?? ""));
    ensureDriver(f.driverId, f.driverName ?? driver?.name ?? "Sem motorista").fuelings.push(f);
  });
  for (const item of driverMap.values()) item.advance = advancesByDriver.get(String(item.id ?? item.key)) ?? advancesByDriver.get(normalize(item.name)) ?? 0;
  advances.forEach((e: any) => {
    const driver = (data?.drivers ?? []).find((d: any) => String(d.id) === String(e.driverId ?? ""));
    const item = ensureDriver(e.driverId, driver?.name ?? "Sem motorista");
    item.advance = advancesByDriver.get(String(e.driverId ?? item.key)) ?? item.advance;
  });
  const drivers = Array.from(driverMap.values()).sort((a: any, b: any) => a.name.localeCompare(b.name, "pt-BR"));

  const totalRevenue = drivers.reduce((sum: number, d: any) => sum + d.revenue, 0);
  const totalCommission = drivers.reduce((sum: number, d: any) => sum + d.commission, 0);
  const totalAdvances = drivers.reduce((sum: number, d: any) => sum + d.advance, 0);
  const totalCommissionPayable = totalCommission - totalAdvances;
  const fuelTotal = (type: string) => fuelings.filter((f: any) => fuelTypeOf(f) === type).reduce((sum: number, f: any) => sum + fuelCost(f), 0);
  const totalDiesel = fuelTotal("diesel");
  const totalArla = fuelTotal("arla");
  const totalGas = fuelTotal("gasolina");
  const totalFuel = totalDiesel + totalArla + totalGas;

  const addLogoAndTitle = (sheet: any, title: string, subtitle?: string) => {
    const logoId = workbook.addImage({ base64: REPORT_LOGO_JPEG, extension: "jpeg" });
    sheet.addImage(logoId, { tl: { col: 0.1, row: 0.05 }, ext: { width: 330, height: 160 } });
    sheet.getRow(1).height = 62;
    sheet.getRow(2).height = 55;
    sheet.mergeCells("E1:J2");
    const t = sheet.getCell("E1");
    t.value = title;
    t.font = { bold: true, size: 18, color: { argb: black } };
    t.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
    sheet.mergeCells("E3:J3");
    const p = sheet.getCell("E3");
    p.value = subtitle ? `${subtitle} · ${exactPeriodLabel}` : `Período: ${exactPeriodLabel}`;
    p.font = { bold: true, size: 10, color: { argb: black } };
    p.alignment = { horizontal: "center", vertical: "middle" };
    sheet.getRow(3).height = 24;
  };
  const styleHeader = (row: any) => row.eachCell((cell: any) => {
    cell.font = { bold: true, color: { argb: white }, size: 10 };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: dark } };
    cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
    cell.border = border;
  });
  const styleRow = (row: any, index = 0) => row.eachCell({ includeEmpty: true }, (cell: any) => {
    cell.font = { color: { argb: black }, size: 9 };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: index % 2 ? light : white } };
    cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
    cell.border = border;
  });
  const money = (cell: any) => { cell.numFmt = 'R$ #,##0.00'; };
  const addSummaryRow = (sheet: any, label: string, value: number, explanation: string) => {
    const row = sheet.addRow([label, value, explanation]);
    row.height = 24;
    styleRow(row, 0);
    row.getCell(1).font = { bold: true, color: { argb: black }, size: 10 };
    row.getCell(2).font = { bold: true, color: { argb: black }, size: 10 };
    money(row.getCell(2));
    row.getCell(3).alignment = { horizontal: "left", vertical: "middle", wrapText: true };
    return row;
  };

  const summary = workbook.addWorksheet("Resumo Geral", { views: [{ state: "frozen", ySplit: 7 }], pageSetup: { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0, paperSize: 9 } });
  addLogoAndTitle(summary, "PLANILHA GERAL - TRANS SALOMÃO");
  summary.addRow([]);
  addSummaryRow(summary, "Faturamento total", totalRevenue, "Soma do frete de todas as viagens do período");
  addSummaryRow(summary, "Comissão bruta", totalCommission, "Soma das comissões calculadas em todas as viagens");
  addSummaryRow(summary, "Adiantamentos", totalAdvances, "Soma dos adiantamentos vinculados aos motoristas");
  addSummaryRow(summary, "Comissão a pagar", totalCommissionPayable, "Comissão bruta − adiantamentos");
  addSummaryRow(summary, "Diesel", totalDiesel, "Soma dos abastecimentos classificados como Diesel");
  addSummaryRow(summary, "ARLA", totalArla, "Soma dos abastecimentos classificados como ARLA");
  addSummaryRow(summary, "Gasolina", totalGas, "Soma dos abastecimentos classificados como Gasolina");
  addSummaryRow(summary, "Total combustíveis", totalFuel, "Diesel + ARLA + Gasolina");
  summary.addRow([]);
  const sh = summary.addRow(["Motorista", "Viagens", "Faturamento", "Comissão bruta", "Adiantamentos", "Comissão a pagar", "Diesel", "ARLA", "Gasolina", "Total combustíveis"]);
  styleHeader(sh);
  drivers.forEach((d: any, index: number) => {
    const byType = (type: string) => d.fuelings.filter((f: any) => fuelTypeOf(f) === type).reduce((sum: number, f: any) => sum + fuelCost(f), 0);
    const diesel = byType("diesel"), arla = byType("arla"), gas = byType("gasolina");
    const row = summary.addRow([d.name, d.trips.length, d.revenue, d.commission, d.advance, d.commission - d.advance, diesel, arla, gas, diesel + arla + gas]);
    styleRow(row, index);
    for (let c = 3; c <= 10; c += 1) money(row.getCell(c));
  });
  [30, 10, 18, 18, 18, 18, 16, 16, 16, 18].forEach((w, i) => summary.getColumn(i + 1).width = w);
  summary.printArea = `A1:J${summary.rowCount}`;

  const usedNames = new Set<string>(["Resumo Geral", "Abastecimentos"]);
  const sheetNameFor = (name: string) => {
    let base = String(name || "Motorista").replace(/[\\/*?:[\]]/g, " ").replace(/\s+/g, " ").trim().slice(0, 27) || "Motorista";
    let candidate = base; let n = 2;
    while (usedNames.has(candidate)) candidate = `${base.slice(0, 23)} ${n++}`;
    usedNames.add(candidate); return candidate;
  };

  drivers.forEach((d: any) => {
    const sheet = workbook.addWorksheet(sheetNameFor(d.name), { views: [{ state: "frozen", ySplit: 11 }], pageSetup: { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0, paperSize: 9 } });
    addLogoAndTitle(sheet, d.name.toUpperCase(), "Relatório por motorista");
    sheet.addRow([]);
    addSummaryRow(sheet, "Faturamento", d.revenue, "Soma dos fretes deste motorista");
    addSummaryRow(sheet, "Comissão bruta", d.commission, "Soma das comissões deste motorista");
    addSummaryRow(sheet, "Adiantamentos", d.advance, "Adiantamentos registrados para este motorista");
    addSummaryRow(sheet, "Comissão a pagar", d.commission - d.advance, "Comissão bruta − adiantamentos");
    sheet.addRow([]);
    const header = sheet.addRow(["Data", "Ticket", "Modalidade", "Descarga", "Toneladas", "Valor por tonelada", "Valor por viagem", "Frete total", "Comissão total"]);
    styleHeader(header);
    [...d.trips].sort((a: any, b: any) => safeDate(a.date).localeCompare(safeDate(b.date)) || String(a.code ?? "").localeCompare(String(b.code ?? ""), "pt-BR", { numeric: true })).forEach((trip: any, index: number) => {
      const tonMode = String(trip.freightMode ?? "ton") === "ton";
      const row = sheet.addRow([
        formatDate(trip.date),
        String(trip.code ?? "—"),
        modeName(String(trip.freightMode ?? "ton")),
        String(trip.destination ?? "—") || "—",
        tonMode ? Number(trip.netWeight ?? 0) : null,
        tonMode ? Number(trip.pricePerTon ?? 0) : null,
        tonMode ? null : Number(trip.pricePerTrip ?? 0),
        Number(trip.freight ?? 0),
        Number(trip.commissionValue ?? trip.commission ?? 0),
      ]);
      styleRow(row, index);
      row.getCell(5).numFmt = '0.000 "t"';
      for (const c of [6,7,8,9]) money(row.getCell(c));
    });
    const totalRow = sheet.addRow(["TOTAL MOTORISTA", "", "", "", d.trips.reduce((s: number, t: any) => s + (String(t.freightMode ?? "ton") === "ton" ? Number(t.netWeight ?? 0) : 0), 0), "", "", d.revenue, d.commission]);
    styleRow(totalRow, 0);
    totalRow.eachCell((cell: any) => cell.font = { bold: true, color: { argb: black }, size: 10 });
    totalRow.getCell(5).numFmt = '0.000 "t"'; money(totalRow.getCell(8)); money(totalRow.getCell(9));

    sheet.addRow([]);
    const fh = sheet.addRow(["Data", "Combustível", "Posto", "Litros", "Preço/L", "Custo total"]);
    styleHeader(fh);
    [...d.fuelings].sort((a: any, b: any) => safeDate(a.date).localeCompare(safeDate(b.date))).forEach((f: any, index: number) => {
      const row = sheet.addRow([formatDate(f.date), fuelLabel(f), f.station || "—", Number(f.liters ?? 0), Number(f.pricePerLiter ?? 0), fuelCost(f)]);
      styleRow(row, index); row.getCell(4).numFmt = '0.000 "L"'; money(row.getCell(5)); money(row.getCell(6));
    });
    [15, 15, 18, 27, 15, 18, 18, 18, 18].forEach((w, i) => sheet.getColumn(i + 1).width = w);
    sheet.printArea = `A1:I${sheet.rowCount}`;
  });

  const fuelSheet = workbook.addWorksheet("Abastecimentos", { views: [{ state: "frozen", ySplit: 5 }], pageSetup: { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0, paperSize: 9 } });
  addLogoAndTitle(fuelSheet, "ABASTECIMENTOS - TRANS SALOMÃO");
  fuelSheet.addRow([]);
  const fuelHeader = fuelSheet.addRow(["Data", "Motorista", "Combustível", "Posto", "Litros", "Preço/L", "Custo total"]);
  styleHeader(fuelHeader);
  [...fuelings].sort((a: any, b: any) => {
    const ad = (data?.drivers ?? []).find((d: any) => String(d.id) === String(a.driverId ?? ""))?.name ?? "Sem motorista";
    const bd = (data?.drivers ?? []).find((d: any) => String(d.id) === String(b.driverId ?? ""))?.name ?? "Sem motorista";
    return ad.localeCompare(bd, "pt-BR") || safeDate(a.date).localeCompare(safeDate(b.date));
  }).forEach((f: any, index: number) => {
    const driver = (data?.drivers ?? []).find((d: any) => String(d.id) === String(f.driverId ?? ""));
    const row = fuelSheet.addRow([formatDate(f.date), f.driverName ?? driver?.name ?? "Sem motorista", fuelLabel(f), f.station || "—", Number(f.liters ?? 0), Number(f.pricePerLiter ?? 0), fuelCost(f)]);
    styleRow(row, index); row.getCell(5).numFmt = '0.000 "L"'; money(row.getCell(6)); money(row.getCell(7));
  });
  [15, 30, 16, 26, 15, 17, 19].forEach((w, i) => fuelSheet.getColumn(i + 1).width = w);
  fuelSheet.printArea = `A1:G${fuelSheet.rowCount}`;

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const link = document.createElement("a");
  const url = URL.createObjectURL(blob);
  link.href = url;
  link.download = `Planilha_Geral_Trans_Salomao_${startIso}_a_${endIso}.xlsx`;
  link.style.display = "none";
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
