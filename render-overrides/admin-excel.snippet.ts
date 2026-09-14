async function exportExcelColorido() {
  const ExcelJSModule: any = await import("exceljs");
  const ExcelJS: any = ExcelJSModule.default ?? ExcelJSModule;
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet("Fretes", { views: [{ state: "frozen", ySplit: 8 }] });
  const blue = "008CFF";
  const dark = "07111F";
  const white = "FFFFFF";
  const black = "111111";
  const lightBlue = "EAF5FF";
  const lightGray = "F7FAFC";

  const uniqueDrivers = Array.from(new Set(computed.map((trip: any) => String(trip.driverName ?? "").trim()).filter(Boolean)));
  const driverLabel = uniqueDrivers.length === 1 ? uniqueDrivers[0] : "Todos os motoristas";
  const selectedDriverIds = new Set(computed.map((trip: any) => String(trip.driverId ?? "")).filter(Boolean));

  const totalBilling = computed.reduce((sum: number, trip: any) => sum + Number(trip.freight ?? 0), 0);
  const totalCommission = computed.reduce((sum: number, trip: any) => sum + Number(trip.commissionValue ?? trip.commission ?? 0), 0);
  const totalNetBilling = totalBilling - totalCommission;
  const totalDiesel = computed.reduce((sum: number, trip: any) => sum + Number(trip.dieselCost ?? 0), 0);
  const selectedExpenses = (data?.expenses ?? []).filter((expense: any) => {
    if (selectedDriverIds.size === 0) return true;
    if (!expense.driverId) return uniqueDrivers.length !== 1;
    return selectedDriverIds.has(String(expense.driverId));
  });
  const totalExpenses = selectedExpenses.reduce((sum: number, expense: any) => sum + Number(expense.amount ?? 0), 0);
  const totalAllExpenses = totalExpenses + totalDiesel;
  const finalResult = totalBilling - totalCommission - totalAllExpenses;

  // Comissão acumulada de cada motorista no período selecionado.
  // Este resumo também aparece na primeira aba para não depender da navegação entre abas no celular.
  const commissionByDriver = new Map<string, { name: string; total: number }>();
  computed.forEach((trip: any) => {
    const name = String(trip.driverName ?? "Sem motorista").trim() || "Sem motorista";
    const key = String(trip.driverId ?? name);
    const current = commissionByDriver.get(key) ?? { name, total: 0 };
    current.total += Number(trip.commissionValue ?? trip.commission ?? 0);
    commissionByDriver.set(key, current);
  });
  const commissionByDriverText = Array.from(commissionByDriver.values())
    .map((item) => `${item.name}: ${brl(item.total)}`)
    .join("  •  ") || "Sem comissões no período";

  const logoId = workbook.addImage({ base64: REPORT_LOGO_JPEG, extension: "jpeg" });
  worksheet.addImage(logoId, { tl: { col: 0, row: 0 }, ext: { width: 205, height: 106 } });
  worksheet.mergeCells("D1:K1");
  worksheet.getCell("D1").value = "RELATÓRIO DE FRETES";
  worksheet.getCell("D1").font = { bold: true, size: 19, color: { argb: white } };
  worksheet.getCell("D1").fill = { type: "pattern", pattern: "solid", fgColor: { argb: dark } };
  worksheet.getCell("D1").alignment = { vertical: "middle", horizontal: "left" };

  worksheet.mergeCells("D2:G2");
  worksheet.getCell("D2").value = `Motorista: ${driverLabel}`;
  worksheet.getCell("D2").font = { bold: true, size: 13, color: { argb: black } };
  worksheet.getCell("D2").fill = { type: "pattern", pattern: "solid", fgColor: { argb: white } };
  worksheet.mergeCells("H2:K2");
  worksheet.getCell("H2").value = `COMISSÃO TOTAL: ${brl(totalCommission)}`;
  worksheet.getCell("H2").font = { bold: true, size: 13, color: { argb: white } };
  worksheet.getCell("H2").fill = { type: "pattern", pattern: "solid", fgColor: { argb: blue } };
  worksheet.getCell("H2").alignment = { horizontal: "center" };

  const summaryItems = [
    ["FATURAMENTO TOTAL", brl(totalBilling)],
    ["TOTAL DESPESAS", brl(totalAllExpenses)],
    ["CUSTO DE DIESEL", brl(totalDiesel)],
    ["COMISSÕES", brl(totalCommission)],
    ["RESULTADO LÍQUIDO", brl(finalResult)],
  ];
  summaryItems.forEach(([label, value], index) => {
    const startCol = 1 + index * 2;
    const endCol = Math.min(startCol + 1, 11);
    worksheet.mergeCells(4, startCol, 4, endCol);
    worksheet.mergeCells(5, startCol, 5, endCol);
    const labelCell = worksheet.getCell(4, startCol);
    const valueCell = worksheet.getCell(5, startCol);
    labelCell.value = label;
    valueCell.value = value;
    labelCell.font = { bold: true, size: 9, color: { argb: white } };
    labelCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: dark } };
    labelCell.alignment = { horizontal: "center", vertical: "middle" };
    valueCell.font = { bold: true, size: 13, color: { argb: index === 4 ? white : black } };
    valueCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: index === 4 ? blue : lightBlue } };
    valueCell.alignment = { horizontal: "center", vertical: "middle" };
    for (const cell of [labelCell, valueCell]) {
      cell.border = {
        top: { style: "thin", color: { argb: blue } },
        bottom: { style: "thin", color: { argb: blue } },
        left: { style: "thin", color: { argb: blue } },
        right: { style: "thin", color: { argb: blue } },
      };
    }
  });

  worksheet.mergeCells("A6:K6");
  worksheet.getCell("A6").value = "TOTAL DE COMISSÃO POR MOTORISTA";
  worksheet.getCell("A6").font = { bold: true, size: 10, color: { argb: white } };
  worksheet.getCell("A6").fill = { type: "pattern", pattern: "solid", fgColor: { argb: dark } };
  worksheet.getCell("A6").alignment = { horizontal: "left", vertical: "middle" };
  worksheet.mergeCells("A7:K7");
  worksheet.getCell("A7").value = commissionByDriverText;
  worksheet.getCell("A7").font = { bold: true, size: 10, color: { argb: black } };
  worksheet.getCell("A7").fill = { type: "pattern", pattern: "solid", fgColor: { argb: lightBlue } };
  worksheet.getCell("A7").alignment = { horizontal: "left", vertical: "middle", wrapText: true };
  for (const cell of [worksheet.getCell("A6"), worksheet.getCell("A7")]) {
    cell.border = {
      top: { style: "thin", color: { argb: blue } },
      bottom: { style: "thin", color: { argb: blue } },
      left: { style: "thin", color: { argb: blue } },
      right: { style: "thin", color: { argb: blue } },
    };
  }

  worksheet.getRow(1).height = 40;
  worksheet.getRow(2).height = 26;
  worksheet.getRow(3).height = 8;
  worksheet.getRow(4).height = 19;
  worksheet.getRow(5).height = 25;
  worksheet.getRow(6).height = 20;
  worksheet.getRow(7).height = commissionByDriver.size > 3 ? 36 : 24;

  const headers = ["Ticket", "Data", "Motorista", "Conjunto", "Modalidade", "Peso líquido", "KM", "Faturamento", "Comissão", "Diesel", "Resultado"];
  const headerRow = worksheet.getRow(8);
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

  computed.forEach((trip: any, index: number) => {
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
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: index % 2 === 0 ? white : lightGray } };
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
  worksheet.autoFilter = { from: "A8", to: `K${Math.max(8, worksheet.rowCount)}` };

  const driverSummary = workbook.addWorksheet("Resumo Motoristas", { views: [{ state: "frozen", ySplit: 5 }] });
  const summaryLogoId = workbook.addImage({ base64: REPORT_LOGO_JPEG, extension: "jpeg" });
  driverSummary.addImage(summaryLogoId, { tl: { col: 0, row: 0 }, ext: { width: 205, height: 106 } });
  driverSummary.mergeCells("D1:I1");
  driverSummary.getCell("D1").value = "RESUMO POR MOTORISTA — COMISSÕES";
  driverSummary.getCell("D1").font = { bold: true, size: 18, color: { argb: white } };
  driverSummary.getCell("D1").fill = { type: "pattern", pattern: "solid", fgColor: { argb: dark } };
  driverSummary.mergeCells("D2:I2");
  driverSummary.getCell("D2").value = "A coluna TOTAL COMISSÃO mostra a soma das comissões de cada motorista no período.";
  driverSummary.getCell("D2").font = { bold: true, size: 10, color: { argb: black } };
  driverSummary.getCell("D2").fill = { type: "pattern", pattern: "solid", fgColor: { argb: lightBlue } };
  driverSummary.getCell("D2").alignment = { wrapText: true, vertical: "middle" };
  driverSummary.getRow(1).height = 40;
  driverSummary.getRow(2).height = 30;
  driverSummary.getRow(3).height = 8;

  const driverHeaders = ["Motorista", "Viagens", "Faturamento", "Faturamento líquido", "TOTAL COMISSÃO", "Diesel", "Despesas", "Após custos", "% comissão"];
  const driverHeaderRow = driverSummary.getRow(5);
  driverHeaderRow.values = driverHeaders;
  driverHeaderRow.height = 22;
  driverHeaderRow.eachCell((cell: any) => {
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

  const driversMap = new Map<string, any>();
  computed.forEach((trip: any) => {
    const key = String(trip.driverId ?? trip.driverName ?? "sem-motorista");
    const current = driversMap.get(key) ?? {
      id: trip.driverId,
      name: trip.driverName ?? "Sem motorista",
      trips: 0,
      billing: 0,
      commission: 0,
      diesel: 0,
    };
    current.trips += 1;
    current.billing += Number(trip.freight ?? 0);
    current.commission += Number(trip.commissionValue ?? trip.commission ?? 0);
    current.diesel += Number(trip.dieselCost ?? 0);
    driversMap.set(key, current);
  });

  Array.from(driversMap.values()).forEach((item: any, index: number) => {
    const driverExpenses = (data?.expenses ?? [])
      .filter((expense: any) => item.id && String(expense.driverId ?? "") === String(item.id))
      .reduce((sum: number, expense: any) => sum + Number(expense.amount ?? 0), 0);
    const pct = item.billing > 0 ? (item.commission / item.billing) * 100 : 0;
    const netBilling = item.billing - item.commission;
    const row = driverSummary.addRow([
      item.name,
      item.trips,
      brl(item.billing),
      brl(netBilling),
      brl(item.commission),
      brl(item.diesel),
      brl(driverExpenses),
      brl(netBilling - item.diesel - driverExpenses),
      `${pct.toFixed(2).replace(".", ",")}%`,
    ]);
    row.height = 20;
    row.eachCell((cell: any) => {
      cell.font = { color: { argb: black }, size: 10 };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: index % 2 === 0 ? white : lightGray } };
      cell.border = {
        top: { style: "thin", color: { argb: blue } },
        bottom: { style: "thin", color: { argb: blue } },
        left: { style: "thin", color: { argb: blue } },
        right: { style: "thin", color: { argb: blue } },
      };
    });
    const commissionCell = row.getCell(5);
    commissionCell.font = { bold: true, color: { argb: blue }, size: 11 };
    commissionCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: lightBlue } };
    commissionCell.alignment = { horizontal: "center", vertical: "middle" };
  });
  [30, 11, 18, 19, 22, 18, 18, 18, 14].forEach((width, index) => {
    driverSummary.getColumn(index + 1).width = width;
  });

  const totalRow = driverSummary.addRow([
    "TOTAL GERAL",
    computed.length,
    brl(totalBilling),
    brl(totalNetBilling),
    brl(totalCommission),
    brl(totalDiesel),
    brl(totalExpenses),
    brl(finalResult),
    "",
  ]);
  totalRow.height = 23;
  totalRow.eachCell((cell: any) => {
    cell.font = { bold: true, color: { argb: white }, size: 11 };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: blue } };
    cell.border = {
      top: { style: "thin", color: { argb: dark } },
      bottom: { style: "thin", color: { argb: dark } },
      left: { style: "thin", color: { argb: dark } },
      right: { style: "thin", color: { argb: dark } },
    };
  });

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
