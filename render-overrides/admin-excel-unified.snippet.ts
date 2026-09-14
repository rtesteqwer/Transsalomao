async function exportExcelColorido(scope: "current" | "month" = "current") {
  if (!data) return;

  const ExcelJSModule: any = await import("exceljs");
  const ExcelJS: any = ExcelJSModule.default ?? ExcelJSModule;
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet("Planilha Geral", { views: [{ state: "frozen", ySplit: 6 }] });

  const blue = "008CFF";
  const dark = "07111F";
  const white = "FFFFFF";
  const black = "111111";
  const lightBlue = "EAF5FF";
  const lightGray = "F7FAFC";
  const today = new Date();

  const monthlyTrips = scope === "month"
    ? data.trips
        .filter((trip: any) => inPeriod(trip.date, "month", today))
        .map((trip: any) => enrichTrip(trip, data.drivers, data.fleets))
    : computed;
  const exportTrips = monthlyTrips.filter((trip: any) =>
    driverFilter === "all" || String(trip.driverId ?? "") === String(driverFilter),
  );

  const monthlyFuelings = scope === "month"
    ? fuelingConsumptionRows(data.fuelings)
        .filter((fueling: any) => inPeriod(fueling.date, "month", today))
        .map((fueling: any) => {
          const driver = data.drivers.find((item: any) => item.id === fueling.driverId);
          const fleet = data.fleets.find((item: any) => item.id === fueling.fleetId);
          return {
            ...fueling,
            driverName: driver?.name ?? "Sem motorista informado",
            fleetName: fleet?.name ?? "Conjunto removido",
          };
        })
    : fuelings;
  const reportFuelings = monthlyFuelings.filter((fueling: any) =>
    driverFilter === "all" || String(fueling.driverId ?? "") === String(driverFilter),
  );

  const expensePeriod: any = scope === "month" ? "month" : period;
  const reportExpenses = (data.expenses ?? []).filter((expense: any) => {
    if (!inPeriod(expense.date, expensePeriod, today)) return false;
    if (driverFilter === "all") return true;
    if (expense.category === "Adiantamento") return String(expense.driverId ?? "") === String(driverFilter);
    return true;
  });
  const operatingExpenses = reportExpenses.filter((expense: any) => expense.category !== "Adiantamento");
  const advances = reportExpenses.filter((expense: any) => expense.category === "Adiantamento");

  const totalBilling = exportTrips.reduce((sum: number, trip: any) => sum + Number(trip.freight ?? 0), 0);
  const totalCommission = exportTrips.reduce((sum: number, trip: any) => sum + Number(trip.commissionValue ?? trip.commission ?? 0), 0);
  const totalAdvances = advances.reduce((sum: number, expense: any) => sum + Number(expense.amount ?? 0), 0);
  const totalDiesel = reportFuelings.reduce(
    (sum: number, fueling: any) => sum + Number(fueling.liters ?? 0) * Number(fueling.pricePerLiter ?? 0),
    0,
  );
  const totalOperatingExpenses = operatingExpenses.reduce((sum: number, expense: any) => sum + Number(expense.amount ?? 0), 0);
  const totalNet = totalBilling - totalCommission - totalDiesel - totalOperatingExpenses;
  const reportLabel = scope === "month" ? "Este mês" : periodLabel;

  const setSectionTitle = (rowNumber: number, title: string) => {
    worksheet.mergeCells(rowNumber, 1, rowNumber, 9);
    const cell = worksheet.getCell(rowNumber, 1);
    cell.value = title;
    cell.font = { bold: true, size: 13, color: { argb: white } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: dark } };
    cell.alignment = { horizontal: "left", vertical: "middle" };
    worksheet.getRow(rowNumber).height = 26;
  };

  const styleHeader = (row: any) => {
    row.height = 28;
    row.eachCell((cell: any) => {
      cell.font = { bold: true, size: 12, color: { argb: white } };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: blue } };
      cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
      cell.border = {
        top: { style: "thin", color: { argb: dark } },
        bottom: { style: "thin", color: { argb: dark } },
        left: { style: "thin", color: { argb: dark } },
        right: { style: "thin", color: { argb: dark } },
      };
    });
  };

  const styleBody = (row: any, index: number) => {
    row.height = 21;
    row.eachCell((cell: any) => {
      cell.font = { size: 10.5, color: { argb: black } };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: index % 2 === 0 ? white : lightGray } };
      cell.alignment = { vertical: "middle", wrapText: true };
      cell.border = {
        top: { style: "thin", color: { argb: blue } },
        bottom: { style: "thin", color: { argb: blue } },
        left: { style: "thin", color: { argb: blue } },
        right: { style: "thin", color: { argb: blue } },
      };
    });
  };

  const logoId = workbook.addImage({ base64: REPORT_LOGO_JPEG, extension: "jpeg" });
  worksheet.addImage(logoId, { tl: { col: 0, row: 0 }, ext: { width: 245, height: 126 } });
  worksheet.mergeCells("D1:I1");
  worksheet.getCell("D1").value = "PLANILHA GERAL — TRANS SALOMÃO";
  worksheet.getCell("D1").font = { bold: true, size: 23, color: { argb: white } };
  worksheet.getCell("D1").fill = { type: "pattern", pattern: "solid", fgColor: { argb: dark } };
  worksheet.getCell("D1").alignment = { horizontal: "center", vertical: "middle" };
  worksheet.mergeCells("D2:I2");
  worksheet.getCell("D2").value = `Período: ${reportLabel} · ${driverFilter === "all" ? "Todos os motoristas" : data.drivers.find((d: any) => d.id === driverFilter)?.name ?? "Motorista"}`;
  worksheet.getCell("D2").font = { bold: true, size: 14, color: { argb: black } };
  worksheet.getCell("D2").fill = { type: "pattern", pattern: "solid", fgColor: { argb: lightBlue } };
  worksheet.getCell("D2").alignment = { horizontal: "center", vertical: "middle" };
  worksheet.getRow(1).height = 58;
  worksheet.getRow(2).height = 34;
  worksheet.getRow(3).height = 8;

  const summary = [
    ["FATURAMENTO", brl(totalBilling)],
    ["COMISSÃO TOTAL", brl(totalCommission)],
    ["ADIANTAMENTOS", brl(totalAdvances)],
    ["CUSTO DIESEL", brl(totalDiesel)],
    ["TOTAL LÍQUIDO", brl(totalNet)],
  ];
  summary.forEach(([label, value], index) => {
    const col = 1 + index * 2;
    const end = Math.min(col + 1, 9);
    worksheet.mergeCells(4, col, 4, end);
    worksheet.mergeCells(5, col, 5, end);
    const labelCell = worksheet.getCell(4, col);
    const valueCell = worksheet.getCell(5, col);
    labelCell.value = label;
    valueCell.value = value;
    labelCell.font = { bold: true, size: 10, color: { argb: white } };
    labelCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: dark } };
    valueCell.font = { bold: true, size: 14, color: { argb: index === 4 ? white : black } };
    valueCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: index === 4 ? blue : lightBlue } };
    labelCell.alignment = valueCell.alignment = { horizontal: "center", vertical: "middle" };
  });
  worksheet.getRow(4).height = 21;
  worksheet.getRow(5).height = 28;

  let rowCursor = 7;
  setSectionTitle(rowCursor, "FRETES");
  rowCursor += 1;
  const freightHeader = worksheet.getRow(rowCursor);
  freightHeader.values = ["Ticket / Grupo", "Data", "Motorista", "Conjunto", "Modalidade", "Peso líquido", "Faturamento", "Comissão", "Total líquido"];
  styleHeader(freightHeader);
  rowCursor += 1;

  const fixedModes = new Set(["trip", "cegonha", "caixinha"]);
  const grouped = new Map<string, any>();
  const singles: any[] = [];
  exportTrips.forEach((trip: any) => {
    const mode = String(trip.freightMode ?? "ton");
    if (!fixedModes.has(mode)) {
      singles.push({ kind: "single", trip });
      return;
    }
    const name = String(trip.driverName ?? "Sem motorista");
    const key = `${String(trip.driverId ?? name)}|${mode}`;
    const current = grouped.get(key) ?? {
      kind: "group",
      mode,
      driverName: name,
      count: 0,
      firstDate: String(trip.date ?? ""),
      lastDate: String(trip.date ?? ""),
      fleets: new Set<string>(),
      billing: 0,
      commission: 0,
    };
    current.count += 1;
    const date = String(trip.date ?? "").slice(0, 10);
    if (date && (!current.firstDate || date < String(current.firstDate).slice(0, 10))) current.firstDate = date;
    if (date && (!current.lastDate || date > String(current.lastDate).slice(0, 10))) current.lastDate = date;
    if (trip.fleetName) current.fleets.add(String(trip.fleetName));
    current.billing += Number(trip.freight ?? 0);
    current.commission += Number(trip.commissionValue ?? trip.commission ?? 0);
    grouped.set(key, current);
  });
  const freightRows = [...singles, ...grouped.values()];
  const modeLabel = (mode: unknown) => String(mode ?? "") === "ton" ? "Por tonelada" : String(mode ?? "") === "trip" ? "Por viagem" : String(mode ?? "") === "cegonha" ? "Cegonha" : String(mode ?? "") === "caixinha" ? "Caixinha" : String(mode ?? "—");

  freightRows.forEach((item: any, index: number) => {
    if (item.kind === "single") {
      const trip = item.trip;
      const row = worksheet.getRow(rowCursor++);
      row.values = [
        trip.code ?? trip.ticket ?? trip.id ?? "—",
        trip.date ? formatDate(String(trip.date).slice(0, 10)) : "—",
        trip.driverName ?? "—",
        trip.fleetName ?? "—",
        modeLabel(trip.freightMode),
        tons(Number(trip.netWeight ?? 0)),
        brl(Number(trip.freight ?? 0)),
        brl(Number(trip.commissionValue ?? trip.commission ?? 0)),
        brl(Number(trip.freight ?? 0) - Number(trip.commissionValue ?? trip.commission ?? 0)),
      ];
      styleBody(row, index);
      return;
    }
    const first = String(item.firstDate ?? "").slice(0, 10);
    const last = String(item.lastDate ?? "").slice(0, 10);
    const dateText = first === last ? formatDate(first) : `${formatDate(first)} a ${formatDate(last)}`;
    const fleetText = item.fleets.size === 1 ? Array.from(item.fleets)[0] : item.fleets.size > 1 ? "Vários" : "—";
    const row = worksheet.getRow(rowCursor++);
    row.values = [
      `TOTAL: ${item.count} viagens`,
      dateText,
      item.driverName,
      fleetText,
      modeLabel(item.mode),
      "—",
      brl(item.billing),
      brl(item.commission),
      brl(item.billing - item.commission),
    ];
    styleBody(row, index);
  });

  rowCursor += 2;
  setSectionTitle(rowCursor, "ABASTECIMENTOS");
  rowCursor += 1;
  const fuelingHeader = worksheet.getRow(rowCursor++);
  fuelingHeader.values = ["Data", "Motorista", "Conjunto", "Litros", "Preço/L", "Custo total"];
  styleHeader(fuelingHeader);
  if (reportFuelings.length === 0) {
    const row = worksheet.getRow(rowCursor++);
    row.values = ["—", "Nenhum abastecimento no período", "—", "—", "—", brl(0)];
    styleBody(row, 0);
  } else {
    reportFuelings.forEach((fueling: any, index: number) => {
      const driverName = data.drivers.find((driver: any) => String(driver.id) === String(fueling.driverId ?? ""))?.name ?? fueling.driverName ?? "Sem motorista informado";
      const fleetName = data.fleets.find((fleet: any) => String(fleet.id) === String(fueling.fleetId ?? ""))?.name ?? fueling.fleetName ?? "Conjunto não informado";
      const cost = Number(fueling.liters ?? 0) * Number(fueling.pricePerLiter ?? 0);
      const row = worksheet.getRow(rowCursor++);
      row.values = [
        fueling.date ? formatDate(String(fueling.date).slice(0, 10)) : "—",
        driverName,
        fleetName,
        Number(fueling.liters ?? 0),
        brl(Number(fueling.pricePerLiter ?? 0)),
        brl(cost),
      ];
      styleBody(row, index);
    });
  }
  const fuelTotal = worksheet.getRow(rowCursor++);
  fuelTotal.values = ["TOTAL ABASTECIMENTOS", "", "", "", "", brl(totalDiesel)];
  fuelTotal.eachCell((cell: any) => {
    cell.font = { bold: true, color: { argb: white } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: dark } };
  });

  const driversMap = new Map<string, any>();
  exportTrips.forEach((trip: any) => {
    const key = String(trip.driverId ?? trip.driverName ?? "sem-motorista");
    const item = driversMap.get(key) ?? { id: trip.driverId, name: trip.driverName ?? "Sem motorista", trips: 0, billing: 0, commission: 0 };
    item.trips += 1;
    item.billing += Number(trip.freight ?? 0);
    item.commission += Number(trip.commissionValue ?? trip.commission ?? 0);
    driversMap.set(key, item);
  });

  rowCursor += 2;
  setSectionTitle(rowCursor, "RESUMO / COMISSÕES POR MOTORISTA");
  rowCursor += 1;
  const driverHeader = worksheet.getRow(rowCursor++);
  driverHeader.values = ["Motorista", "Viagens", "Faturamento", "Comissão bruta", "Adiantamentos", "Comissão a pagar", "Diesel"];
  styleHeader(driverHeader);
  Array.from(driversMap.values()).sort((a: any, b: any) => String(a.name).localeCompare(String(b.name), "pt-BR")).forEach((item: any, index: number) => {
    const driverAdvances = advances.filter((expense: any) => String(expense.driverId ?? "") === String(item.id ?? "")).reduce((sum: number, expense: any) => sum + Number(expense.amount ?? 0), 0);
    const driverDiesel = reportFuelings.filter((fueling: any) => String(fueling.driverId ?? "") === String(item.id ?? "")).reduce((sum: number, fueling: any) => sum + Number(fueling.liters ?? 0) * Number(fueling.pricePerLiter ?? 0), 0);
    const row = worksheet.getRow(rowCursor++);
    row.values = [item.name, item.trips, brl(item.billing), brl(item.commission), brl(driverAdvances), brl(item.commission - driverAdvances), brl(driverDiesel)];
    styleBody(row, index);
  });

  rowCursor += 2;
  setSectionTitle(rowCursor, "ADIANTAMENTOS");
  rowCursor += 1;
  const advanceHeader = worksheet.getRow(rowCursor++);
  advanceHeader.values = ["Data", "Motorista", "Descrição", "Valor"];
  styleHeader(advanceHeader);
  if (advances.length === 0) {
    const row = worksheet.getRow(rowCursor++);
    row.values = ["—", "Nenhum adiantamento no período", "—", brl(0)];
    styleBody(row, 0);
  } else {
    advances.forEach((expense: any, index: number) => {
      const driverName = data.drivers.find((driver: any) => String(driver.id) === String(expense.driverId ?? ""))?.name ?? "Motorista removido";
      const row = worksheet.getRow(rowCursor++);
      row.values = [expense.date ? formatDate(String(expense.date).slice(0, 10)) : "—", driverName, expense.description ?? "Adiantamento", brl(Number(expense.amount ?? 0))];
      styleBody(row, index);
    });
  }

  [24, 18, 31, 29, 19, 18, 19, 19, 20].forEach((width, index) => {
    worksheet.getColumn(index + 1).width = width;
  });

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  const monthKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}`;
  link.download = scope === "month" ? `Planilha_Geral_Mensal_${monthKey}.xlsx` : `Planilha_Geral_${String(reportLabel).replace(/[^a-zA-Z0-9À-ÿ]+/g, "_")}.xlsx`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}