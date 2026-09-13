async function exportExcelColorido() {
  const ExcelJSModule: any = await import("exceljs");
  const ExcelJS: any = ExcelJSModule.default ?? ExcelJSModule;
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet("Fretes", { views: [{ state: "frozen", ySplit: 5 }] });
  const blue = "008CFF";
  const dark = "07111F";
  const white = "FFFFFF";
  const black = "111111";
  const uniqueDrivers = Array.from(new Set(computed.map((trip: any) => String(trip.driverName ?? "").trim()).filter(Boolean)));
  const driverLabel = uniqueDrivers.length === 1 ? uniqueDrivers[0] : "Todos os motoristas";
  const totalCommission = computed.reduce((sum: number, trip: any) => sum + Number(trip.commissionValue ?? trip.commission ?? 0), 0);
  const logoId = workbook.addImage({ base64: REPORT_LOGO_JPEG, extension: "jpeg" });
  worksheet.addImage(logoId, { tl: { col: 0, row: 0 }, ext: { width: 158, height: 82 } });
  worksheet.mergeCells("C1:K1");
  worksheet.getCell("C1").value = "RELATÓRIO DE FRETES";
  worksheet.getCell("C1").font = { bold: true, size: 18, color: { argb: white } };
  worksheet.getCell("C1").fill = { type: "pattern", pattern: "solid", fgColor: { argb: dark } };
  worksheet.getCell("C1").alignment = { vertical: "middle" };
  worksheet.mergeCells("C2:G2");
  worksheet.getCell("C2").value = `Motorista: ${driverLabel}`;
  worksheet.getCell("C2").font = { bold: true, size: 13, color: { argb: black } };
  worksheet.getCell("C2").fill = { type: "pattern", pattern: "solid", fgColor: { argb: white } };
  worksheet.mergeCells("H2:K2");
  worksheet.getCell("H2").value = `COMISSÃO TOTAL: ${brl(totalCommission)}`;
  worksheet.getCell("H2").font = { bold: true, size: 13, color: { argb: blue } };
  worksheet.getCell("H2").fill = { type: "pattern", pattern: "solid", fgColor: { argb: dark } };
  worksheet.getCell("H2").alignment = { horizontal: "center" };
  worksheet.getRow(1).height = 34;
  worksheet.getRow(2).height = 24;
  worksheet.getRow(3).height = 8;

  const headers = ["Ticket", "Data", "Motorista", "Conjunto", "Modalidade", "Peso líquido", "KM", "Faturamento", "Comissão", "Diesel", "Resultado"];
  const headerRow = worksheet.getRow(5);
  headerRow.values = headers;
  headerRow.height = 22;
  headerRow.eachCell((cell: any) => {
    cell.font = { bold: true, color: { argb: white } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: dark } };
    cell.alignment = { horizontal: "center", vertical: "middle" };
    cell.border = {
      top: { style: "thin", color: { argb: blue } },
      bottom: { style: "thin", color: { argb: blue } },
      left: { style: "thin", color: { argb: blue } },
      right: { style: "thin", color: { argb: blue } },
    };
  });

  const modeLabel = (mode: unknown) => {
    const value = String(mode ?? "");
    if (value === "ton") return "Por tonelada";
    if (value === "trip") return "Por viagem";
    if (value === "cegonha") return "Cegonha";
    if (value === "caixinha") return "Caixinha";
    return value || "—";
  };

  computed.forEach((trip: any) => {
    const row = worksheet.addRow([
      trip.code ?? trip.ticket ?? trip.id ?? "—",
      trip.date ? formatDate(trip.date) : "—",
      trip.driverName ?? "—",
      trip.fleetName ?? "—",
      modeLabel(trip.freightMode),
      tons(Number(trip.netWeight ?? 0)),
      `${integer(Number(trip.kmDriven ?? 0))} km`,
      brl(Number(trip.freight ?? 0)),
      brl(Number(trip.commissionValue ?? trip.commission ?? 0)),
      brl(Number(trip.dieselCost ?? 0)),
      brl(Number(trip.grossResult ?? 0)),
    ]);
    row.height = 19;
    row.eachCell((cell: any) => {
      cell.font = { color: { argb: black }, size: 10 };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: white } };
      cell.alignment = { vertical: "middle" };
      cell.border = {
        top: { style: "thin", color: { argb: blue } },
        bottom: { style: "thin", color: { argb: blue } },
        left: { style: "thin", color: { argb: blue } },
        right: { style: "thin", color: { argb: blue } },
      };
    });
  });

  [10, 12, 28, 22, 16, 15, 11, 16, 16, 15, 16].forEach((width, index) => {
    worksheet.getColumn(index + 1).width = width;
  });
  worksheet.autoFilter = { from: "A5", to: `K${Math.max(5, worksheet.rowCount)}` };

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "relatorio-fretes-trans-salomao.xlsx";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
