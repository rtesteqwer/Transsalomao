type DetailTrip = {
  id?: string; code?: string; date: string; driverName?: string;
  freightMode?: string; client?: string; origin?: string; destination?: string;
  netWeight: number; pricePerTon: number; pricePerTrip: number;
  freight: number; commissionPct: number; commissionValue: number;
};

export const tripDetailHeaders = [
  "Data", "Ticket", "Motorista", "Modalidade", "Empresa", "Origem", "Destino",
  "Peso líquido (t)", "Preço por tonelada (R$)", "Valor fixo (R$)",
  "Faturamento (R$)", "Comissão (%)", "Comissão (R$)", "Após comissão (R$)",
];

export function tripDetailRows(trips: DetailTrip[]) {
  const labels: Record<string, string> = { ton: "Por tonelada", trip: "Diária", cegonha: "Cegonha", caixinha: "Caixinha" };
  return [...trips].sort((a, b) =>
    String(a.driverName ?? "").localeCompare(String(b.driverName ?? ""), "pt-BR") ||
    a.date.localeCompare(b.date) ||
    String(a.code ?? "").localeCompare(String(b.code ?? ""), "pt-BR", { numeric: true }) ||
    String(a.id ?? "").localeCompare(String(b.id ?? "")),
  ).map((trip) => {
    const mode = trip.freightMode ?? "ton";
    const day = trip.date.slice(0, 10);
    return [
      /^\d{4}-\d{2}-\d{2}$/.test(day) ? new Date(`${day}T00:00:00Z`) : trip.date,
      trip.code ?? "", trip.driverName ?? "Sem motorista", labels[mode] ?? mode,
      trip.client ?? "", trip.origin ?? "", trip.destination ?? "",
      trip.netWeight, mode === "ton" ? trip.pricePerTon : null,
      mode === "ton" ? null : trip.pricePerTrip,
      trip.freight, trip.commissionPct, trip.commissionValue,
      trip.freight - trip.commissionValue,
    ];
  });
}

export function addTripDetailsWorksheet(workbook: any, trips: DetailTrip[], subtitle: string) {
  const rows = tripDetailRows(trips);
  const sheet = workbook.addWorksheet("Viagens detalhadas", {
    views: [{ state: "frozen", ySplit: 6, xSplit: 2 }],
    pageSetup: { orientation: "landscape", paperSize: 8, fitToPage: true, fitToWidth: 1, fitToHeight: 0, printTitlesRow: "1:6" },
  });
  sheet.mergeCells("A1:N2");
  sheet.getCell("A1").value = "VIAGENS DETALHADAS - TRANS SALOMÃO";
  sheet.getCell("A1").font = { name: "Arial", size: 22, bold: true, color: { argb: "111111" } };
  sheet.mergeCells("A3:N3"); sheet.getCell("A3").value = subtitle;
  sheet.mergeCells("A4:N4"); sheet.getCell("A4").value = `${rows.length} fretes. Após comissão = faturamento menos comissão. Diesel consta no resumo.`;
  sheet.getRow(6).values = tripDetailHeaders;
  sheet.getRow(6).height = 48;
  for (const values of rows) {
    const row = sheet.addRow(values);
    const r = row.number;
    row.getCell(11).value = { formula: `IF(D${r}="Por tonelada",H${r}*I${r},J${r})`, result: values[10] };
    row.getCell(13).value = { formula: `K${r}*L${r}`, result: values[12] };
    row.getCell(14).value = { formula: `K${r}-M${r}`, result: values[13] };
    row.height = 44;
  }
  const total = sheet.addRow(["TOTAL"]);
  const last = total.number - 1;
  for (const col of [8, 11, 13, 14]) {
    const letter = String.fromCharCode(64 + col);
    total.getCell(col).value = { formula: rows.length ? `SUM(${letter}7:${letter}${last})` : "0", result: rows.reduce((sum, row) => sum + Number(row[col - 1] ?? 0), 0) };
  }
  total.height = 40;
  for (let r = 3; r <= sheet.rowCount; r++) {
    for (let c = 1; c <= 14; c++) {
      const cell = sheet.getCell(r, c);
      cell.font = { name: "Arial", size: 16, bold: r === 6 || r === total.number, color: { argb: "111111" } };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: r === 6 ? "A9CBEA" : "DCEEFF" } };
      cell.alignment = { vertical: "middle", horizontal: c >= 8 ? "right" : "left", wrapText: true };
    }
  }
  sheet.getRow(1).height = 28; sheet.getRow(2).height = 22;
  sheet.getRow(3).height = 30; sheet.getRow(4).height = 30;
  [18, 15, 38, 22, 28, 28, 28, 23, 26, 26, 28, 22, 28, 30].forEach((width, i) => { sheet.getColumn(i + 1).width = width; });
  sheet.getColumn(1).numFmt = "dd/mm/yyyy";
  sheet.getColumn(2).numFmt = "@";
  sheet.getColumn(8).numFmt = '#,##0.000 "t"';
  for (const col of [9, 10, 11, 13, 14]) sheet.getColumn(col).numFmt = '"R$" #,##0.00########';
  sheet.getColumn(12).numFmt = "0.##%";
  sheet.autoFilter = { from: "A6", to: `N${Math.max(6, last)}` };
  sheet.printArea = `A1:N${sheet.rowCount}`;
  return sheet;
}
