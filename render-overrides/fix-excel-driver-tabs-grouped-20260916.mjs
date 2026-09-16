import fs from "node:fs";
import path from "node:path";

const target = process.argv[2];
if (!target || !fs.existsSync(target)) throw new Error("fix-excel-driver-tabs-grouped: target missing");
const p = path.join(target, "src/routes/dono/totais.tsx");
let s = fs.readFileSync(p, "utf8");

if (!s.includes("const driverGroupedSheetTrips = Array.from(")) {
  const usedAt = s.indexOf('const usedNames = new Set<string>(["Resumo Geral", "Viagens", "Abastecimentos"])');
  if (usedAt < 0) throw new Error("fix-excel-driver-tabs-grouped: consolidated Excel marker missing");
  const driversAt = s.indexOf("drivers.forEach((d: any) => {", usedAt);
  if (driversAt < 0) throw new Error("fix-excel-driver-tabs-grouped: driver sheet loop missing");
  const tableAt = s.indexOf("    const header = sheet.addRow(", driversAt);
  if (tableAt < 0) throw new Error("fix-excel-driver-tabs-grouped: driver table header missing");
  const fuelGapAt = s.indexOf("\n    sheet.addRow([]);", tableAt);
  if (fuelGapAt < 0) throw new Error("fix-excel-driver-tabs-grouped: driver table end missing");

  const replacement = `    const driverGroupedSheetTrips = Array.from(
      d.trips.reduce((groups: Map<string, any>, trip: any) => {
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

    const driverSheetRows = [
      ...d.trips
        .filter((trip: any) => !["cegonha", "caixinha"].includes(String(trip.freightMode ?? "ton")))
        .map((trip: any) => {
          const mode = String(trip.freightMode ?? "ton");
          return {
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
      ...driverGroupedSheetTrips.map((group: any) => {
        const items = [...group.items].sort((a: any, b: any) =>
          safeDate(a.date).localeCompare(safeDate(b.date)) ||
          String(a.code ?? "").localeCompare(String(b.code ?? ""), "pt-BR", { numeric: true })
        );
        const dates = items.map((item: any) => safeDate(item.date)).filter(Boolean).sort();
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
          freight: Number(group.freight ?? 0),
          commission: Number(group.commission ?? 0),
        };
      }),
    ].sort((a: any, b: any) =>
      String(a.startDate).localeCompare(String(b.startDate)) ||
      String(a.mode).localeCompare(String(b.mode))
    );

    const header = sheet.addRow([
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
    styleHeader(header);

    driverSheetRows.forEach((item: any, index: number) => {
      const row = sheet.addRow([
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
      row.getCell(5).numFmt = "0.####################";
      row.getCell(6).numFmt = '0.#################### "t"';
      for (const c of [7, 8, 9, 10, 11]) money(row.getCell(c));
    });

    const totalRow = sheet.addRow([
      "TOTAL MOTORISTA",
      "",
      "",
      "",
      d.trips.length,
      d.trips.reduce(
        (sum: number, trip: any) =>
          sum + (String(trip.freightMode ?? "ton") === "ton" ? Number(trip.netWeight ?? 0) : 0),
        0,
      ),
      "",
      "",
      "",
      d.revenue,
      d.commission,
    ]);
    styleRow(totalRow, 0);
    totalRow.eachCell((cell: any) => {
      cell.font = { bold: true, color: { argb: black }, size: 10 };
    });
    totalRow.getCell(5).numFmt = "0.####################";
    totalRow.getCell(6).numFmt = '0.#################### "t"';
    money(totalRow.getCell(10));
    money(totalRow.getCell(11));
`;

  s = s.slice(0, tableAt) + replacement + s.slice(fuelGapAt);
  s = s.replace(
    "[15, 15, 18, 27, 15, 18, 18, 18, 18].forEach((w, i) => sheet.getColumn(i + 1).width = w);",
    "[22, 28, 18, 32, 18, 16, 18, 18, 18, 18, 18].forEach((w, i) => sheet.getColumn(i + 1).width = w);",
  );
  s = s.replace(
    "sheet.printArea = `A1:I${sheet.rowCount}`;",
    "sheet.printArea = `A1:K${sheet.rowCount}`;",
  );
}

for (const marker of [
  "const driverGroupedSheetTrips = Array.from(",
  '"Quantidade de fretes"',
  "money(totalRow.getCell(10));",
  "money(totalRow.getCell(11));",
]) {
  if (!s.includes(marker)) throw new Error(`fix-excel-driver-tabs-grouped: audit failed (${marker})`);
}

fs.writeFileSync(p, s);
console.log("[excel-driver-tabs] Cegonha/Caixinha grouped with freight count in general workbook driver tabs");
