type DetailTrip = {
  id?: string; code?: string; date: string; driverName?: string; fleetName?: string;
  freightMode?: string; client?: string; origin?: string; destination?: string;
  netWeight: number; pricePerTon: number; pricePerTrip: number;
  freight: number; commissionPct: number; commissionValue: number;
};

export const tripDetailHeaders = [
  "Data", "Ticket / quantidade", "Motorista", "Conjunto", "Modalidade",
  "Empresa", "Origem", "Destino", "Peso líquido (t)", "Preço/t (R$)",
  "Valor fixo (R$)", "Frete (R$)", "Comissão (%)", "Comissão (R$)", "Após comissão (R$)",
];

const labels: Record<string, string> = {
  ton: "Por tonelada",
  trip: "Diária",
  cegonha: "Cegonha",
  caixinha: "Caixinha",
};

function dateKey(value: string) {
  const raw = String(value ?? "").trim();
  const iso = raw.match(/^(\d{4}-\d{2}-\d{2})/);
  if (iso) return iso[1];
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return raw;
  const y = parsed.getFullYear();
  const m = String(parsed.getMonth() + 1).padStart(2, "0");
  const d = String(parsed.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function excelDate(value: string) {
  const day = dateKey(value);
  return /^\d{4}-\d{2}-\d{2}$/.test(day) ? new Date(`${day}T00:00:00Z`) : value;
}

export function tripDetailRows(trips: DetailTrip[]) {
  const groupedModes = new Set(["cegonha", "caixinha"]);
  const individual: any[] = [];
  const grouped = new Map<string, any>();

  [...trips].forEach((trip) => {
    const mode = String(trip.freightMode ?? "ton");
    if (!groupedModes.has(mode)) {
      individual.push({ kind: "single", trip, mode, sortDate: dateKey(trip.date) });
      return;
    }

    const driverName = String(trip.driverName ?? "Sem motorista");
    const key = `${String((trip as any).driverId ?? driverName)}|${mode}`;
    const current = grouped.get(key) ?? {
      kind: "group",
      mode,
      driverName,
      firstDate: dateKey(trip.date),
      lastDate: dateKey(trip.date),
      count: 0,
      fleets: new Set<string>(),
      clients: new Set<string>(),
      origins: new Set<string>(),
      destinations: new Set<string>(),
      fixedPrices: new Set<number>(),
      freight: 0,
      commission: 0,
      commissionPcts: new Set<number>(),
    };

    current.count += 1;
    const day = dateKey(trip.date);
    if (day && (!current.firstDate || day < current.firstDate)) current.firstDate = day;
    if (day && (!current.lastDate || day > current.lastDate)) current.lastDate = day;
    const fleet = String(trip.fleetName ?? "").trim();
    const client = String(trip.client ?? "").trim();
    const origin = String(trip.origin ?? "").trim();
    const destination = String(trip.destination ?? "").trim();
    if (fleet) current.fleets.add(fleet);
    if (client) current.clients.add(client);
    if (origin) current.origins.add(origin);
    if (destination) current.destinations.add(destination);
    if (Number(trip.pricePerTrip ?? 0)) current.fixedPrices.add(Number(trip.pricePerTrip));
    current.commissionPcts.add(Number(trip.commissionPct ?? 0));
    current.freight += Number(trip.freight ?? 0);
    current.commission += Number(trip.commissionValue ?? 0);
    grouped.set(key, current);
  });

  const compact = [...individual, ...grouped.values()].sort((a, b) => {
    const aDriver = String(a.kind === "single" ? a.trip.driverName ?? "" : a.driverName);
    const bDriver = String(b.kind === "single" ? b.trip.driverName ?? "" : b.driverName);
    return aDriver.localeCompare(bDriver, "pt-BR") ||
      String(a.kind === "single" ? a.sortDate : a.firstDate).localeCompare(String(b.kind === "single" ? b.sortDate : b.firstDate)) ||
      String(a.kind === "single" ? a.trip.code ?? "" : a.mode).localeCompare(String(b.kind === "single" ? b.trip.code ?? "" : b.mode), "pt-BR", { numeric: true });
  });

  return compact.map((item: any) => {
    if (item.kind === "single") {
      const trip: DetailTrip = item.trip;
      const mode = String(item.mode ?? trip.freightMode ?? "ton");
      return [
        excelDate(trip.date),
        trip.code ?? "",
        trip.driverName ?? "Sem motorista",
        trip.fleetName ?? "",
        labels[mode] ?? mode,
        trip.client ?? "",
        trip.origin ?? "",
        trip.destination ?? "",
        mode === "ton" ? Number(trip.netWeight ?? 0) : null,
        mode === "ton" ? Number(trip.pricePerTon ?? 0) : null,
        mode === "ton" ? null : Number(trip.pricePerTrip ?? 0),
        Number(trip.freight ?? 0),
        Number(trip.commissionPct ?? 0),
        Number(trip.commissionValue ?? 0),
        Number(trip.freight ?? 0) - Number(trip.commissionValue ?? 0),
      ];
    }

    const sameOrSeveral = (values: Set<string>) => values.size === 1 ? Array.from(values)[0] : values.size > 1 ? "Vários" : "";
    const dateText = item.firstDate === item.lastDate
      ? item.firstDate.split("-").reverse().join("/")
      : `${item.firstDate.split("-").reverse().join("/")} a ${item.lastDate.split("-").reverse().join("/")}`;
    const fixedPrice = item.fixedPrices.size === 1 ? Array.from(item.fixedPrices)[0] : null;
    const commissionPct = item.commissionPcts.size === 1 ? Array.from(item.commissionPcts)[0] : null;
    return [
      dateText,
      `${item.count} viagens agrupadas`,
      item.driverName,
      sameOrSeveral(item.fleets),
      labels[item.mode] ?? item.mode,
      sameOrSeveral(item.clients),
      sameOrSeveral(item.origins),
      sameOrSeveral(item.destinations),
      null,
      null,
      fixedPrice,
      item.freight,
      commissionPct,
      item.commission,
      item.freight - item.commission,
    ];
  });
}

export function addTripDetailsWorksheet(workbook: any, trips: DetailTrip[], subtitle: string) {
  const rows = tripDetailRows(trips);
  const counts = trips.reduce((acc: Record<string, number>, trip) => {
    const mode = String(trip.freightMode ?? "ton");
    acc[mode] = (acc[mode] ?? 0) + 1;
    return acc;
  }, {});

  const sheet = workbook.addWorksheet("Todas as viagens", {
    views: [{ state: "frozen", ySplit: 6, xSplit: 2 }],
    pageSetup: {
      orientation: "landscape",
      paperSize: 8,
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
      printTitlesRow: "1:6",
    },
  });

  sheet.mergeCells("A1:O2");
  sheet.getCell("A1").value = "RELATÓRIO COMPLETO DO MOTORISTA - TRANS SALOMÃO";
  sheet.getCell("A1").font = { name: "Arial", size: 18, bold: true, color: { argb: "111111" } };
  sheet.getCell("A1").alignment = { horizontal: "center", vertical: "middle" };

  sheet.mergeCells("A3:O3");
  sheet.getCell("A3").value = subtitle;
  sheet.getCell("A3").font = { name: "Arial", size: 12, bold: true, color: { argb: "111111" } };
  sheet.getCell("A3").alignment = { horizontal: "center", vertical: "middle" };

  sheet.mergeCells("A4:O4");
  sheet.getCell("A4").value =
    `Total: ${trips.length} viagens • Por tonelada: ${counts.ton ?? 0} • Diária: ${counts.trip ?? 0} • Cegonha: ${counts.cegonha ?? 0} • Caixinha: ${counts.caixinha ?? 0}`;
  sheet.getCell("A4").font = { name: "Arial", size: 12, bold: true, color: { argb: "111111" } };
  sheet.getCell("A4").alignment = { horizontal: "center", vertical: "middle" };

  sheet.getRow(6).values = tripDetailHeaders;
  sheet.getRow(6).height = 30;

  for (const values of rows) {
    const row = sheet.addRow(values);
    row.height = 24;
  }

  const total = sheet.addRow(["TOTAL"]);
  const last = total.number - 1;
  for (const col of [9, 12, 14, 15]) {
    const letter = String.fromCharCode(64 + col);
    total.getCell(col).value = {
      formula: rows.length ? `SUM(${letter}7:${letter}${last})` : "0",
      result: rows.reduce((sum, row) => sum + Number(row[col - 1] ?? 0), 0),
    };
  }
  total.height = 26;

  for (let r = 3; r <= sheet.rowCount; r++) {
    for (let c = 1; c <= 15; c++) {
      const cell = sheet.getCell(r, c);
      cell.font = {
        name: "Arial",
        size: r === 6 ? 13 : 12,
        bold: r === 6 || r === total.number || r === 4,
        color: { argb: "111111" },
      };
      cell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: r === 6 ? "A9CBEA" : r === total.number ? "E9F2F9" : "FFFFFF" },
      };
      cell.alignment = {
        vertical: "middle",
        horizontal: c >= 9 ? "right" : "left",
        wrapText: false,
      };
      cell.border = {
        top: { style: "thin", color: { argb: "7F8C8D" } },
        bottom: { style: "thin", color: { argb: "7F8C8D" } },
        left: { style: "thin", color: { argb: "7F8C8D" } },
        right: { style: "thin", color: { argb: "7F8C8D" } },
      };
    }
  }

  sheet.getRow(1).height = 28;
  sheet.getRow(2).height = 22;
  sheet.getRow(3).height = 24;
  sheet.getRow(4).height = 24;

  [16, 24, 30, 24, 18, 24, 22, 22, 18, 18, 18, 20, 16, 20, 22]
    .forEach((width, i) => { sheet.getColumn(i + 1).width = width; });

  sheet.getColumn(1).numFmt = "dd/mm/yyyy";
  sheet.getColumn(2).numFmt = "@";
  sheet.getColumn(9).numFmt = '#,##0.000 "t"';
  for (const col of [10, 11, 12, 14, 15]) sheet.getColumn(col).numFmt = '"R$" #,##0.00';
  sheet.getColumn(13).numFmt = "0.##%";
  sheet.autoFilter = { from: "A6", to: `O${Math.max(6, last)}` };
  sheet.printArea = `A1:O${sheet.rowCount}`;
  return sheet;
}
