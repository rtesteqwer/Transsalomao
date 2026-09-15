async function exportExcelColorido() {
  const ExcelJSModule: any = await import("exceljs");
  const ExcelJS: any = ExcelJSModule.default ?? ExcelJSModule;
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Planilha Geral", {
    views: [{ state: "frozen", ySplit: 6 }],
    pageSetup: { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0, paperSize: 9 },
  });
  const blue = "159EFF", dark = "073763", white = "FFFFFF", black = "111827", pale = "EAF6FF";
  const logoId = workbook.addImage({ base64: REPORT_LOGO_JPEG, extension: "jpeg" });
  sheet.addImage(logoId, { tl: { col: 0, row: 0 }, ext: { width: 190, height: 99 } });
  sheet.mergeCells("D1:J2");
  sheet.getCell("D1").value = "PLANILHA GERAL - TRANS SALOMÃO";
  sheet.getCell("D1").font = { bold: true, size: 20, color: { argb: white } };
  sheet.getCell("D1").fill = { type: "pattern", pattern: "solid", fgColor: { argb: dark } };
  sheet.getCell("D1").alignment = { horizontal: "center", vertical: "middle" };
  sheet.mergeCells("D3:J3");
  sheet.getCell("D3").value = `Período: ${periodLabel}`;
  sheet.getCell("D3").font = { bold: true, color: { argb: black } };
  sheet.getCell("D3").fill = { type: "pattern", pattern: "solid", fgColor: { argb: pale } };
  sheet.getRow(1).height = 38; sheet.getRow(2).height = 36; sheet.getRow(3).height = 23;

  const headers = ["Motorista", "Modalidade", "Viagens", "Peso líquido", "Faturamento", "Comissão", "Após comissão", "Diesel", "Adiantamentos", "Total líquido"];
  const header = sheet.getRow(6); header.values = headers; header.height = 25;
  header.eachCell((cell: any) => {
    cell.font = { bold: true, color: { argb: white }, size: 10 };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: blue } };
    cell.alignment = { horizontal: "center", vertical: "middle" };
  });
  const modeName = (mode: string) => mode === "ton" ? "Por tonelada" : mode === "trip" ? "Por viagem" : mode === "cegonha" ? "Cegonha" : "Caixinha";
  const grouped = new Map<string, any>();
  computed.forEach((trip: any) => {
    const mode = String(trip.freightMode ?? "ton");
    const driverName = String(trip.driverName ?? "Sem motorista");
    const key = String(trip.driverId ?? driverName) + "|" + mode;
    const row = grouped.get(key) ?? { driverId: trip.driverId, driverName, mode, count: 0, weight: 0, revenue: 0, commission: 0 };
    row.count += 1; row.weight += Number(trip.netWeight ?? 0); row.revenue += Number(trip.freight ?? 0); row.commission += Number(trip.commissionValue ?? 0);
    grouped.set(key, row);
  });
  Array.from(grouped.values()).sort((a: any, b: any) => a.driverName.localeCompare(b.driverName, "pt-BR") || modeName(a.mode).localeCompare(modeName(b.mode), "pt-BR")).forEach((item: any, index: number) => {
    const driverFuel = fuelings.filter((f: any) => String(f.driverId ?? "") === String(item.driverId ?? "")).reduce((sum: number, f: any) => sum + Number(f.liters ?? 0) * Number(f.pricePerLiter ?? 0), 0);
    const driverAdvances = (data?.expenses ?? []).filter((e: any) => e.category === "Adiantamento" && String(e.driverId ?? "") === String(item.driverId ?? "")).reduce((sum: number, e: any) => sum + Number(e.amount ?? 0), 0);
    const afterCommission = item.revenue - item.commission;
    const row = sheet.addRow([item.driverName, modeName(item.mode), item.count, item.weight, item.revenue, item.commission, afterCommission, driverFuel, driverAdvances, afterCommission - driverFuel]);
    row.height = 21;
    row.eachCell((cell: any) => {
      cell.font = { color: { argb: black }, size: 9 };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: index % 2 ? pale : white } };
      cell.border = { top: { style: "thin", color: { argb: blue } }, bottom: { style: "thin", color: { argb: blue } }, left: { style: "thin", color: { argb: blue } }, right: { style: "thin", color: { argb: blue } } };
    });
    row.getCell(4).numFmt = '0.00 "t"';
    for (let c = 5; c <= 10; c += 1) row.getCell(c).numFmt = 'R$ #,##0.00';
  });
  [28, 18, 11, 16, 18, 18, 18, 18, 18, 18].forEach((width, i) => { sheet.getColumn(i + 1).width = width; });
  sheet.autoFilter = { from: "A6", to: `J${Math.max(6, sheet.rowCount)}` };
  sheet.printArea = `A1:J${Math.max(6, sheet.rowCount)}`;
  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const link = document.createElement("a"); link.href = URL.createObjectURL(blob); link.download = "Planilha_Geral_Trans_Salomao.xlsx"; link.click(); URL.revokeObjectURL(link.href);
}
