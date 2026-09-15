async function exportTripsExcel() {
  const ExcelJSModule: any = await import("exceljs");
  const ExcelJS: any = ExcelJSModule.default ?? ExcelJSModule;
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Viagens", { pageSetup: { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0 } });
  const logoId = workbook.addImage({ base64: REPORT_LOGO_JPEG, extension: "jpeg" });
  sheet.addImage(logoId, { tl: { col: 0, row: 0 }, ext: { width: 175, height: 91 } });
  sheet.mergeCells("D1:H2"); sheet.getCell("D1").value = "VIAGENS - TRANS SALOMÃO";
  sheet.getCell("D1").font = { bold: true, size: 18, color: { argb: "FFFFFF" } }; sheet.getCell("D1").fill = { type: "pattern", pattern: "solid", fgColor: { argb: "073763" } }; sheet.getCell("D1").alignment = { horizontal: "center", vertical: "middle" };
  const header = sheet.getRow(5); header.values = ["Motorista", "Modalidade", "Viagens", "Peso", "Faturamento", "Comissão", "Após comissão", "Resultado"];
  header.eachCell((cell: any) => { cell.font = { bold: true, color: { argb: "FFFFFF" } }; cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "159EFF" } }; });
  const grouped = new Map<string, any>();
  rows.forEach((trip: any) => { const mode = String(trip.freightMode ?? "ton"); const key = String(trip.driverId) + "|" + mode; const item = grouped.get(key) ?? { name: trip.driverName, mode, count: 0, weight: 0, revenue: 0, commission: 0, result: 0 }; item.count += 1; item.weight += Number(trip.netWeight ?? 0); item.revenue += Number(trip.freight ?? 0); item.commission += Number(trip.commissionValue ?? 0); item.result += Number(trip.grossResult ?? 0); grouped.set(key, item); });
  const modeName = (m: string) => m === "ton" ? "Por tonelada" : m === "trip" ? "Por viagem" : m === "cegonha" ? "Cegonha" : "Caixinha";
  Array.from(grouped.values()).sort((a: any, b: any) => a.name.localeCompare(b.name, "pt-BR") || modeName(a.mode).localeCompare(modeName(b.mode), "pt-BR")).forEach((item: any, index: number) => { const row = sheet.addRow([item.name, modeName(item.mode), item.count, item.weight, item.revenue, item.commission, item.revenue - item.commission, item.result]); row.eachCell((cell: any) => { cell.font = { color: { argb: "111827" } }; cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: index % 2 ? "EAF6FF" : "FFFFFF" } }; cell.border = { top: { style: "thin", color: { argb: "159EFF" } }, bottom: { style: "thin", color: { argb: "159EFF" } }, left: { style: "thin", color: { argb: "159EFF" } }, right: { style: "thin", color: { argb: "159EFF" } } }; }); row.getCell(4).numFmt = '0.00 "t"'; for (let c = 5; c <= 8; c += 1) row.getCell(c).numFmt = 'R$ #,##0.00'; });
  [29, 18, 11, 15, 18, 18, 18, 18].forEach((w, i) => { sheet.getColumn(i + 1).width = w; }); sheet.printArea = `A1:H${Math.max(5, sheet.rowCount)}`;
  const buffer = await workbook.xlsx.writeBuffer(); const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }); const link = document.createElement("a"); link.href = URL.createObjectURL(blob); link.download = "Viagens_Trans_Salomao.xlsx"; link.click(); URL.revokeObjectURL(link.href);
}
