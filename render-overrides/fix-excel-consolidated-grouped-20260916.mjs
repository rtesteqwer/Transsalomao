import fs from "node:fs";
import path from "node:path";

const target = process.argv[2];
if (!target || !fs.existsSync(target)) throw new Error("fix-excel-consolidated-grouped: target missing");

const totalsPath = path.join(target, "src/routes/dono/totais.tsx");
let s = fs.readFileSync(totalsPath, "utf8");

function insertBefore(needle, block, label) {
  if (s.includes(block.trim().slice(0, 80))) return;
  const at = s.indexOf(needle);
  if (at < 0) throw new Error(`fix-excel-consolidated-grouped: marker missing (${label})`);
  s = s.slice(0, at) + block + s.slice(at);
}

// General Excel: add a consolidated Viagens sheet with all drivers.
// Cegonha/Caixinha are grouped exactly like the site: driver + freight mode.
const tripsSheetMarker = "  const usedNames = new Set<string>([\"Resumo Geral\", \"Abastecimentos\"]);";
if (!s.includes("VIAGENS - TODOS OS MOTORISTAS")) {
  const block = `  const groupedExcelTrips = Array.from(
    computed.reduce(
      (groups, trip) => {
        const mode = String(trip.freightMode ?? "ton");
        if (mode !== "cegonha" && mode !== "caixinha") return groups;
        const key = String(trip.driverId ?? trip.driverName ?? "sem-motorista") + "|" + mode;
        const current = groups.get(key) ?? {
          key,
          mode,
          driverId: trip.driverId,
          driverName: trip.driverName ?? "Sem motorista",
          items: [] as any[],
          freight: 0,
          commission: 0,
        };
        current.items.push(trip);
        current.freight += Number(trip.freight ?? 0);
        current.commission += Number(trip.commissionValue ?? trip.commission ?? 0);
        groups.set(key, current);
        return groups;
      },
      new Map<string, any>(),
    ).values(),
  );

  const regularExcelTrips = computed.filter((trip: any) => {
    const mode = String(trip.freightMode ?? "ton");
    return mode !== "cegonha" && mode !== "caixinha";
  });

  const consolidatedExcelRows = [
    ...regularExcelTrips.map((trip: any) => {
      const mode = String(trip.freightMode ?? "ton");
      return {
        driverName: trip.driverName ?? "Sem motorista",
        startDate: safeDate(trip.date),
        endDate: safeDate(trip.date),
        tickets: [String(trip.code ?? "—")],
        mode,
        destinations: [String(trip.destination ?? "—") || "—"],
        count: 1,
        netWeight: mode === "ton" ? Number(trip.netWeight ?? 0) : null,
        pricePerTon: mode === "ton" ? Number(trip.pricePerTon ?? 0) : null,
        dailyValue: mode === "trip" ? Number(trip.pricePerTrip ?? 0) : null,
        pricePerFreight: null,
        freight: Number(trip.freight ?? 0),
        commission: Number(trip.commissionValue ?? trip.commission ?? 0),
      };
    }),
    ...groupedExcelTrips.map((group: any) => {
      const items = [...group.items].sort((a: any, b: any) =>
        safeDate(a.date).localeCompare(safeDate(b.date)) ||
        String(a.code ?? "").localeCompare(String(b.code ?? ""), "pt-BR", { numeric: true })
      );
      const dates = items.map((item: any) => safeDate(item.date)).filter(Boolean).sort();
      const tickets = items.map((item: any) => String(item.code ?? "—"));
      const destinations = Array.from(new Set(items.map((item: any) => String(item.destination ?? "—") || "—")));
      const prices = Array.from(new Set(items.map((item: any) => Number(item.pricePerTrip ?? 0))));
      return {
        driverName: group.driverName,
        startDate: dates[0] ?? "",
        endDate: dates[dates.length - 1] ?? "",
        tickets,
        mode: group.mode,
        destinations,
        count: items.length,
        netWeight: null,
        pricePerTon: null,
        dailyValue: null,
        pricePerFreight: prices.length === 1 ? Number(prices[0]) : null,
        freight: Number(group.freight ?? 0),
        commission: Number(group.commission ?? 0),
      };
    }),
  ].sort((a: any, b: any) =>
    String(a.driverName).localeCompare(String(b.driverName), "pt-BR") ||
    String(a.startDate).localeCompare(String(b.startDate)) ||
    String(a.mode).localeCompare(String(b.mode))
  );

  const consolidatedDate = (item: any) =>
    item.startDate === item.endDate
      ? formatDate(item.startDate)
      : \`\${formatDate(item.startDate)} a \${formatDate(item.endDate)}\`;
  const consolidatedTickets = (item: any) =>
    item.tickets.length <= 6
      ? item.tickets.join(", ")
      : \`\${item.tickets[0]}–\${item.tickets[item.tickets.length - 1]} (\${item.tickets.length} tickets)\`;
  const consolidatedDestination = (item: any) =>
    item.destinations.length === 1 ? item.destinations[0] : "Vários destinos";

  const tripsSheet = workbook.addWorksheet("Viagens", {
    views: [{ state: "frozen", ySplit: 5 }],
    pageSetup: { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0, paperSize: 9 },
  });
  addLogoAndTitle(tripsSheet, "VIAGENS - TODOS OS MOTORISTAS", "Cegonha e Caixinha agrupadas por motorista e modalidade");
  tripsSheet.addRow([]);
  const allTripsHeader = tripsSheet.addRow([
    "Motorista",
    "Data / Período",
    "Ticket(s)",
    "Modalidade",
    "Descarga",
    "Quantidade de fretes",
    "Toneladas",
    "Valor por tonelada",
    "Valor da diária",
    "Valor por frete",
    "Frete total",
    "Comissão total",
  ]);
  styleHeader(allTripsHeader);

  consolidatedExcelRows.forEach((item: any, index: number) => {
    const row = tripsSheet.addRow([
      item.driverName,
      consolidatedDate(item),
      consolidatedTickets(item),
      modeName(String(item.mode)),
      consolidatedDestination(item),
      item.count,
      item.netWeight,
      item.pricePerTon,
      item.dailyValue,
      item.pricePerFreight,
      item.freight,
      item.commission,
    ]);
    styleRow(row, index);
    row.getCell(6).numFmt = "0.####################";
    row.getCell(7).numFmt = '0.#################### "t"';
    for (const col of [8, 9, 10, 11, 12]) money(row.getCell(col));
  });

  const allTripsTotal = tripsSheet.addRow([
    "TOTAL",
    "",
    "",
    "",
    "",
    computed.length,
    computed
      .filter((trip: any) => String(trip.freightMode ?? "ton") === "ton")
      .reduce((sum: number, trip: any) => sum + Number(trip.netWeight ?? 0), 0),
    "",
    "",
    "",
    computed.reduce((sum: number, trip: any) => sum + Number(trip.freight ?? 0), 0),
    computed.reduce((sum: number, trip: any) => sum + Number(trip.commissionValue ?? trip.commission ?? 0), 0),
  ]);
  styleRow(allTripsTotal, 0);
  allTripsTotal.eachCell((cell: any) => {
    cell.font = { bold: true, color: { argb: black }, size: 10 };
  });
  allTripsTotal.getCell(6).numFmt = "0.####################";
  allTripsTotal.getCell(7).numFmt = '0.#################### "t"';
  money(allTripsTotal.getCell(11));
  money(allTripsTotal.getCell(12));

  [28, 24, 28, 18, 34, 20, 16, 18, 18, 18, 18, 18].forEach((width, index) => {
    tripsSheet.getColumn(index + 1).width = width;
  });
  tripsSheet.autoFilter = {
    from: \`A\${allTripsHeader.number}\`,
    to: \`L\${Math.max(allTripsHeader.number, tripsSheet.rowCount)}\`,
  };
  tripsSheet.printArea = \`A1:L\${tripsSheet.rowCount}\`;

`;
  insertBefore(tripsSheetMarker, block, "general consolidated trips");
  s = s.replace(
    'const usedNames = new Set<string>(["Resumo Geral", "Abastecimentos"]);',
    'const usedNames = new Set<string>(["Resumo Geral", "Viagens", "Abastecimentos"]);',
  );
}

// Preserve entered quantity precision in Excel.
s = s.replaceAll(`row.getCell(5).numFmt = '0.000 "t"';`, `row.getCell(5).numFmt = '0.#################### "t"';`);
s = s.replaceAll(`totalRow.getCell(5).numFmt = '0.000 "t"';`, `totalRow.getCell(5).numFmt = '0.#################### "t"';`);
s = s.replaceAll(`row.getCell(4).numFmt = '0.000 "L"';`, `row.getCell(4).numFmt = '0.#################### "L"';`);
s = s.replaceAll(`row.getCell(5).numFmt = '0.000 "L"';`, `row.getCell(5).numFmt = '0.#################### "L"';`);

// Individual Excel export for the icon beside each driver's PDF.
if (!s.includes("async function exportExcelMotorista(")) {
  const returnMarker = "\n\n  return (\n    <div>";
  const at = s.indexOf(returnMarker);
  if (at < 0) throw new Error("fix-excel-consolidated-grouped: totals return marker missing");

  const individual = `

  async function exportExcelMotorista(driverId: string) {
    if (!data) return;
    const driver = data.drivers.find((item) => String(item.id) === String(driverId));
    if (!driver) return;

    const driverTrips = computed.filter((trip: any) => String(trip.driverId ?? "") === String(driverId));
    const driverFuelings = fuelings.filter((item: any) => String(item.driverId ?? "") === String(driverId));
    const driverAdvances = (data.expenses ?? [])
      .filter((item: any) =>
        item.category === "Adiantamento" &&
        String(item.driverId ?? "") === String(driverId) &&
        inPeriod(item.date, period)
      )
      .reduce((sum: number, item: any) => sum + Number(item.amount ?? 0), 0);

    const ExcelJSModule: any = await import("exceljs");
    const ExcelJS: any = ExcelJSModule.default ?? ExcelJSModule;
    const workbook = new ExcelJS.Workbook();
    workbook.creator = "Trans Salomão";
    workbook.created = new Date();

    const black = "111111";
    const dark = "202020";
    const white = "FFFFFF";
    const light = "F7F7F7";
    const border = {
      top: { style: "thin", color: { argb: "B8B8B8" } },
      bottom: { style: "thin", color: { argb: "B8B8B8" } },
      left: { style: "thin", color: { argb: "B8B8B8" } },
      right: { style: "thin", color: { argb: "B8B8B8" } },
    } as any;
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
    const modeLabel = (mode: string) =>
      mode === "ton" ? "Por tonelada" :
      mode === "trip" ? "Diárias" :
      mode === "cegonha" ? "Cegonha" : "Caixinha";
    const safe = (value: any) => String(value ?? "").slice(0, 10);

    const grouped = Array.from(
      driverTrips.reduce((groups: Map<string, any>, trip: any) => {
        const mode = String(trip.freightMode ?? "ton");
        if (mode !== "cegonha" && mode !== "caixinha") return groups;
        const current = groups.get(mode) ?? {
          mode,
          items: [] as any[],
          freight: 0,
          commission: 0,
        };
        current.items.push(trip);
        current.freight += Number(trip.freight ?? 0);
        current.commission += Number(trip.commissionValue ?? trip.commission ?? 0);
        groups.set(mode, current);
        return groups;
      }, new Map<string, any>()).values(),
    );

    const rows: any[] = [
      ...driverTrips
        .filter((trip: any) => !["cegonha", "caixinha"].includes(String(trip.freightMode ?? "ton")))
        .map((trip: any) => {
          const mode = String(trip.freightMode ?? "ton");
          return {
            startDate: safe(trip.date),
            endDate: safe(trip.date),
            tickets: [String(trip.code ?? "—")],
            mode,
            destinations: [String(trip.destination ?? "—") || "—"],
            count: 1,
            netWeight: mode === "ton" ? Number(trip.netWeight ?? 0) : null,
            pricePerTon: mode === "ton" ? Number(trip.pricePerTon ?? 0) : null,
            dailyValue: mode === "trip" ? Number(trip.pricePerTrip ?? 0) : null,
            pricePerFreight: null,
            freight: Number(trip.freight ?? 0),
            commission: Number(trip.commissionValue ?? trip.commission ?? 0),
          };
        }),
      ...grouped.map((group: any) => {
        const items = [...group.items].sort((a: any, b: any) =>
          safe(a.date).localeCompare(safe(b.date)) ||
          String(a.code ?? "").localeCompare(String(b.code ?? ""), "pt-BR", { numeric: true })
        );
        const dates = items.map((item: any) => safe(item.date)).filter(Boolean).sort();
        const destinations = Array.from(new Set(items.map((item: any) => String(item.destination ?? "—") || "—")));
        const prices = Array.from(new Set(items.map((item: any) => Number(item.pricePerTrip ?? 0))));
        return {
          startDate: dates[0] ?? "",
          endDate: dates[dates.length - 1] ?? "",
          tickets: items.map((item: any) => String(item.code ?? "—")),
          mode: group.mode,
          destinations,
          count: items.length,
          netWeight: null,
          pricePerTon: null,
          dailyValue: null,
          pricePerFreight: prices.length === 1 ? Number(prices[0]) : null,
          freight: group.freight,
          commission: group.commission,
        };
      }),
    ].sort((a: any, b: any) =>
      String(a.startDate).localeCompare(String(b.startDate)) ||
      String(a.mode).localeCompare(String(b.mode))
    );

    const sheet = workbook.addWorksheet("Viagens", {
      views: [{ state: "frozen", ySplit: 8 }],
      pageSetup: { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0, paperSize: 9 },
    });
    const logoId = workbook.addImage({ base64: REPORT_LOGO_JPEG, extension: "jpeg" });
    sheet.addImage(logoId, { tl: { col: 0.1, row: 0.05 }, ext: { width: 300, height: 145 } });
    sheet.getRow(1).height = 58;
    sheet.getRow(2).height = 50;
    sheet.mergeCells("D1:K2");
    sheet.getCell("D1").value = \`RELATÓRIO EXCEL - \${driver.name.toUpperCase()}\`;
    sheet.getCell("D1").font = { bold: true, size: 17, color: { argb: black } };
    sheet.getCell("D1").alignment = { horizontal: "center", vertical: "middle" };

    const revenue = driverTrips.reduce((sum: number, trip: any) => sum + Number(trip.freight ?? 0), 0);
    const commission = driverTrips.reduce((sum: number, trip: any) =>
      sum + Number(trip.commissionValue ?? trip.commission ?? 0), 0);
    const summaryRow = sheet.addRow([
      "Faturamento", revenue,
      "Comissão bruta", commission,
      "Adiantamentos", driverAdvances,
      "Comissão a pagar", commission - driverAdvances,
    ]);
    styleRow(summaryRow, 0);
    for (const col of [2, 4, 6, 8]) money(summaryRow.getCell(col));
    sheet.addRow([]);

    const header = sheet.addRow([
      "Data / Período", "Ticket(s)", "Modalidade", "Descarga", "Quantidade de fretes",
      "Toneladas", "Valor/t", "Valor da diária", "Valor por frete", "Frete total", "Comissão total",
    ]);
    styleHeader(header);

    rows.forEach((item: any, index: number) => {
      const date =
        item.startDate === item.endDate
          ? formatDate(item.startDate)
          : \`\${formatDate(item.startDate)} a \${formatDate(item.endDate)}\`;
      const tickets =
        item.tickets.length <= 6
          ? item.tickets.join(", ")
          : \`\${item.tickets[0]}–\${item.tickets[item.tickets.length - 1]} (\${item.tickets.length} tickets)\`;
      const destination = item.destinations.length === 1 ? item.destinations[0] : "Vários destinos";
      const row = sheet.addRow([
        date,
        tickets,
        modeLabel(item.mode),
        destination,
        item.count,
        item.netWeight,
        item.pricePerTon,
        item.dailyValue,
        item.pricePerFreight,
        item.freight,
        item.commission,
      ]);
      styleRow(row, index);
      row.getCell(5).numFmt = "0.####################";
      row.getCell(6).numFmt = '0.#################### "t"';
      for (const col of [7, 8, 9, 10, 11]) money(row.getCell(col));
    });

    const fuelSheet = workbook.addWorksheet("Abastecimentos", {
      views: [{ state: "frozen", ySplit: 2 }],
      pageSetup: { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0, paperSize: 9 },
    });
    const fuelHeader = fuelSheet.addRow(["Data", "Combustível", "Posto", "Litros", "Preço/L", "Custo total"]);
    styleHeader(fuelHeader);
    driverFuelings.forEach((fueling: any, index: number) => {
      const type = String(fueling.fuelType ?? "diesel").toLowerCase();
      const label = type === "arla" ? "ARLA" : type === "gasolina" ? "Gasolina" : "Diesel";
      const cost = Number(fueling.liters ?? 0) * Number(fueling.pricePerLiter ?? 0);
      const row = fuelSheet.addRow([
        formatDate(fueling.date),
        label,
        fueling.station || "—",
        Number(fueling.liters ?? 0),
        Number(fueling.pricePerLiter ?? 0),
        cost,
      ]);
      styleRow(row, index);
      row.getCell(4).numFmt = '0.#################### "L"';
      money(row.getCell(5));
      money(row.getCell(6));
    });
    [15, 16, 32, 16, 18, 20].forEach((width, index) => {
      fuelSheet.getColumn(index + 1).width = width;
    });

    [24, 28, 18, 34, 20, 16, 18, 18, 18, 18, 18].forEach((width, index) => {
      sheet.getColumn(index + 1).width = width;
    });

    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    const safeName = driver.name
      .normalize("NFD")
      .replace(/[\\u0300-\\u036f]/g, "")
      .replace(/[^a-zA-Z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "");
    link.href = url;
    link.download = \`Relatorio_Excel_\${safeName || "Motorista"}.xlsx\`;
    link.style.display = "none";
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }`;

  s = s.slice(0, at) + individual + s.slice(at);
}

// Add an Excel button beside each driver's PDF icon.
if (!s.includes("Gerar Excel de ${d.driverName}") && !s.includes("Gerar Excel de ${row.driverName}")) {
  const pdfButton = /(<Button[\s\S]{0,900}?title=\{`Gerar PDF de \$\{([^}]+\.driverName)\}`\}[\s\S]{0,1800}?<\/Button>)/;
  const match = s.match(pdfButton);
  if (!match) throw new Error("fix-excel-consolidated-grouped: per-driver PDF button not found");
  const rowExpr = match[2].replace(/\.driverName$/, "");
  const excelButton = `<Button
                      size="sm"
                      variant="ghost"
                      title={\`Gerar Excel de \${${rowExpr}.driverName}\`}
                      onClick={() => void exportExcelMotorista(${rowExpr}.driverId)}
                    >
                      <FileDown className="size-4" /> Excel
                    </Button>`;
  s = s.replace(match[1], `<div className="flex items-center gap-1">${match[1]}${excelButton}</div>`);
}

// General button must not accidentally pass a click event as a driver id.
s = s.replaceAll("onClick={exportExcelColorido}", "onClick={() => void exportExcelColorido()}");

const audits = [
  'workbook.addWorksheet("Viagens"',
  '"Quantidade de fretes"',
  '"VIAGENS - TODOS OS MOTORISTAS"',
  "async function exportExcelMotorista(driverId: string)",
  "exportExcelMotorista(",
  "Gerar Excel de",
];
for (const marker of audits) {
  if (!s.includes(marker)) throw new Error(`fix-excel-consolidated-grouped: audit failed (${marker})`);
}

fs.writeFileSync(totalsPath, s);
console.log("[excel-grouped] general Excel rebuilt with all trips; Cegonha/Caixinha grouped; per-driver Excel button added");
