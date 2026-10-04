import fs from "node:fs";
import path from "node:path";

const target = process.argv[2];
if (!target || !fs.existsSync(target)) throw new Error("report-totals-layout: target missing");

const file = path.join(target, "src/lib/excel-report.ts");
if (!fs.existsSync(file)) throw new Error("report-totals-layout: excel report missing");

let s = fs.readFileSync(file, "utf8");

const modeStart = s.indexOf("    const modeName =");
const modeEnd = s.indexOf("    const excelModeInfo =", modeStart);
if (modeStart < 0 || modeEnd < 0) throw new Error("report-totals-layout: summary block markers missing");

const summaryBlock = `    const modeName = (mode: string) => mode === "ton" ? "Por tonelada" : mode === "trip" ? "Diária" : mode === "cegonha" ? "Cegonha" : "Caixinha";
    const driverNameById = (driverId: any) => (data?.drivers ?? []).find((d: any) => String(d.id) === String(driverId ?? ""))?.name;
    const inferFuelingDriverId = (fueling: any) => {
      const explicit = String(fueling?.driverId ?? "").trim();
      if (explicit) return explicit;
      const fleetId = String(fueling?.fleetId ?? "").trim();
      const date = String(fueling?.date ?? "").slice(0, 10);
      if (!fleetId || !date) return "";
      const sameDayDrivers = [...new Set(
        computed
          .filter((trip: any) => String(trip.fleetId ?? "") === fleetId && String(trip.date ?? "").slice(0, 10) === date)
          .map((trip: any) => String(trip.driverId ?? ""))
          .filter(Boolean),
      )];
      if (sameDayDrivers.length === 1) return sameDayDrivers[0];
      const periodDrivers = [...new Set(
        computed
          .filter((trip: any) => String(trip.fleetId ?? "") === fleetId)
          .map((trip: any) => String(trip.driverId ?? ""))
          .filter(Boolean),
      )];
      return periodDrivers.length === 1 ? periodDrivers[0] : "";
    };
    const reportFuelings = excelFuelings.map((fueling: any) => {
      const driverId = String(fueling?.driverId ?? "").trim() || inferFuelingDriverId(fueling);
      return {
        ...fueling,
        driverId: driverId || fueling?.driverId,
        driverName: fueling?.driverName && fueling.driverName !== "Sem motorista informado"
          ? fueling.driverName
          : (driverNameById(driverId) ?? fueling?.driverName ?? "Sem motorista informado"),
      };
    });

    type DriverFinancial = {
      key: string;
      driverId: string;
      driverName: string;
      trips: number;
      revenue: number;
      commission: number;
      afterCommission: number;
      advances: number;
      fuelings: number;
      expenses: number;
    };
    const driverFinancial = new Map<string, DriverFinancial>();
    const ensureDriver = (driverId: any, driverName: any) => {
      const id = String(driverId ?? "").trim();
      const name = String(driverName ?? driverNameById(id) ?? "Sem motorista informado").trim() || "Sem motorista informado";
      const key = id ? "id:" + id : "name:" + normalize(name);
      let item = driverFinancial.get(key);
      if (!item) {
        item = { key, driverId: id, driverName: name, trips: 0, revenue: 0, commission: 0, afterCommission: 0, advances: 0, fuelings: 0, expenses: 0 };
        driverFinancial.set(key, item);
      } else if ((!item.driverName || item.driverName === "Sem motorista informado") && name) {
        item.driverName = name;
      }
      return item;
    };

    excelTrips.forEach((trip: any) => {
      const row = ensureDriver(trip.driverId, trip.driverName);
      const revenue = Number(trip.freight ?? 0);
      const commission = Number(trip.commissionValue ?? trip.commission ?? 0);
      row.trips += 1;
      row.revenue += revenue;
      row.commission += commission;
      row.afterCommission += Number(trip.afterCommission ?? (revenue - commission));
    });
    reportFuelings.forEach((fueling: any) => {
      const driverId = String(fueling.driverId ?? "").trim();
      const row = ensureDriver(driverId, fueling.driverName);
      const storedTotal = Number(fueling.totalPaid ?? fueling.total ?? fueling.amount ?? 0);
      const calculated = Number(fueling.liters ?? 0) * Number(fueling.pricePerLiter ?? 0);
      row.fuelings += storedTotal > 0 ? storedTotal : calculated;
    });
    excelExpensesSource.forEach((expense: any) => {
      const driverId = String(expense.driverId ?? "").trim();
      const row = ensureDriver(driverId, driverNameById(driverId) ?? expense.driverName);
      if (String(expense.category ?? "") === "Adiantamento") row.advances += Number(expense.amount ?? 0);
      else row.expenses += Number(expense.amount ?? 0);
    });

    const driverFinancialRows = Array.from(driverFinancial.values())
      .filter((item) => item.trips > 0 || item.revenue !== 0 || item.commission !== 0 || item.advances !== 0 || item.fuelings !== 0 || item.expenses !== 0)
      .sort((a, b) => a.driverName.localeCompare(b.driverName, "pt-BR"));

    const totalRevenue = driverFinancialRows.reduce((sum, item) => sum + item.revenue, 0);
    const totalCommission = driverFinancialRows.reduce((sum, item) => sum + item.commission, 0);
    const totalAfterCommission = driverFinancialRows.reduce((sum, item) => sum + item.afterCommission, 0);
    const totalFueling = driverFinancialRows.reduce((sum, item) => sum + item.fuelings, 0);
    const totalAdvances = driverFinancialRows.reduce((sum, item) => sum + item.advances, 0);
    const totalOtherExpenses = driverFinancialRows.reduce((sum, item) => sum + item.expenses, 0);

    const summary = sheet.getRow(5);
    summary.values = [
      "Faturamento bruto", totalRevenue,
      "Comissão", totalCommission,
      "Total líquido", totalAfterCommission,
      "Abastecimentos", totalFueling,
      "Adiantamentos", totalAdvances,
      "Despesas", totalOtherExpenses,
    ];
    summary.height = 30;
    summary.eachCell((cell: any, col: number) => {
      cell.font = { bold: true, color: { argb: black }, size: 10 };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: totalFill } };
      cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true, shrinkToFit: col % 2 === 0 };
      cell.border = border;
      if (col % 2 === 0) cell.numFmt = 'R$ #,##0.00';
    });

    const tripHeader = sheet.getRow(6);
    tripHeader.values = ["Motorista", "Viagens", "Faturamento bruto", "Comissão", "Total líquido", "Adiantamentos", "Abastecimentos", "Despesas", "Saldo após custos"];
    tripHeader.height = 30;
    styleHeader(tripHeader);
    driverFinancialRows.forEach((item, index) => {
      const operationalBalance = item.afterCommission - item.fuelings - item.advances - item.expenses;
      const row = sheet.addRow([
        item.driverName,
        item.trips,
        item.revenue,
        item.commission,
        item.afterCommission,
        item.advances,
        item.fuelings,
        item.expenses,
        operationalBalance,
      ]);
      styleRow(row, index);
      row.getCell(1).alignment = { horizontal: "left", vertical: "middle", wrapText: true };
      for (let c = 3; c <= 9; c += 1) {
        row.getCell(c).numFmt = 'R$ #,##0.00';
        row.getCell(c).font = { bold: c >= 5, color: { argb: black }, size: 10 };
        row.getCell(c).alignment = { horizontal: "right", vertical: "middle", shrinkToFit: true };
      }
    });
    const driverSummaryEndRow = sheet.rowCount;

`;
s = s.slice(0, modeStart) + summaryBlock + s.slice(modeEnd);

s = s.replace(
  '    excelFuelings.forEach((f: any, index: number) => { const row = sheet.addRow([formatDate(f.date), f.driverName ?? (data?.drivers ?? []).find((d: any) => d.id === f.driverId)?.name ?? "Sem motorista", f.station ?? "—", Number(f.liters ?? 0), Number(f.pricePerLiter ?? 0), Number(f.liters ?? 0) * Number(f.pricePerLiter ?? 0)]); styleRow(row, index); row.getCell(4).numFmt = \'0.00 "L"\'; row.getCell(5).numFmt = row.getCell(6).numFmt = \'R$ #,##0.00\'; });',
  '    reportFuelings.forEach((f: any, index: number) => { const paid = Number(f.totalPaid ?? f.total ?? f.amount ?? 0); const calculated = Number(f.liters ?? 0) * Number(f.pricePerLiter ?? 0); const row = sheet.addRow([formatDate(f.date), f.driverName ?? driverNameById(f.driverId) ?? "Sem motorista", f.station ?? "—", Number(f.liters ?? 0), Number(f.pricePerLiter ?? 0), paid > 0 ? paid : calculated]); styleRow(row, index); row.getCell(4).numFmt = \'0.000 "L"\'; row.getCell(5).numFmt = row.getCell(6).numFmt = \'R$ #,##0.00\'; });'
);

s = s.replace(
  '    [13, 18, 22, 16, 9, 20, 18, 18, 16, 16, 16, 16, 16].forEach((width, i) => {\n      sheet.getColumn(i + 1).width = width;\n    });\n    sheet.autoFilter = { from: "A6", to: `H${Math.max(6, 6 + grouped.size)}` };',
  '    [26, 18, 22, 20, 22, 20, 22, 20, 24, 20, 22, 20, 22].forEach((width, i) => {\n      sheet.getColumn(i + 1).width = width;\n    });\n    sheet.autoFilter = { from: "A6", to: "I" + Math.max(6, driverSummaryEndRow) };'
);

s = s.replace(
  /const totalDieselDriver = excelFuelings\.reduce\(\(sum: number, fueling: any\) => sum \+ Number\(fueling\.liters \?\? 0\) \* Number\(fueling\.pricePerLiter \?\? 0\), 0\);/,
  'const totalDieselDriver = reportFuelings.reduce((sum: number, fueling: any) => { const paid = Number(fueling.totalPaid ?? fueling.total ?? fueling.amount ?? 0); const calculated = Number(fueling.liters ?? 0) * Number(fueling.pricePerLiter ?? 0); return sum + (paid > 0 ? paid : calculated); }, 0);\n        const totalAdvancesDriver = excelExpensesSource.filter((expense: any) => String(expense.category ?? "") === "Adiantamento").reduce((sum: number, expense: any) => sum + Number(expense.amount ?? 0), 0);\n        const totalExpensesDriver = excelExpensesSource.filter((expense: any) => String(expense.category ?? "") !== "Adiantamento").reduce((sum: number, expense: any) => sum + Number(expense.amount ?? 0), 0);\n        const totalAfterCommissionDriver = excelTrips.reduce((sum: number, trip: any) => { const freight = Number(trip.freight ?? 0); const commission = Number(trip.commissionValue ?? trip.commission ?? 0); return sum + Number(trip.afterCommission ?? (freight - commission)); }, 0);\n        const totalOperationalDriver = totalAfterCommissionDriver - totalDieselDriver - totalAdvancesDriver - totalExpensesDriver;'
);

const a5Start = s.indexOf('        tonSheet.getCell("A5").value =');
const a5End = s.indexOf('        tonSheet.getCell("A5").font =', a5Start);
if (a5Start < 0 || a5End < 0) throw new Error("report-totals-layout: driver summary row missing");
const driverSummary = `        tonSheet.getCell("A5").value =
          "Frete: " + brl(totalFreightDriver) +
          "  •  Comissão: " + brl(totalCommissionDriver) +
          "  •  Total líquido: " + brl(totalAfterCommissionDriver) +
          "  •  Abastecimentos: " + brl(totalDieselDriver) +
          "  •  Adiantamentos: " + brl(totalAdvancesDriver) +
          "  •  Despesas: " + brl(totalExpensesDriver) +
          "  •  Saldo após custos: " + brl(totalOperationalDriver);
`;
s = s.slice(0, a5Start) + driverSummary + s.slice(a5End);
s = s.replace(
  '        tonSheet.getCell("A5").alignment = { horizontal: "center", vertical: "middle", wrapText: false };',
  '        tonSheet.getCell("A5").alignment = { horizontal: "center", vertical: "middle", wrapText: true };'
);
s = s.replace('        tonSheet.getRow(5).height = 22;', '        tonSheet.getRow(5).height = 42;');

const legacyWidthsMarker = '        [12, 12, 20, 17, 17, 20, 18, 16, 14, 14, 14, 15, 15, 12, 15, 15, 15]';
const compactWidthsMarker = '        [12, 14, 22, 18, 19, 14, 14, 14, 16, 15, 12, 15, 15, 16]';
const widthsMarker = s.includes(compactWidthsMarker) ? compactWidthsMarker : legacyWidthsMarker;
const widthsPos = s.indexOf(widthsMarker);
if (widthsPos < 0) throw new Error("report-totals-layout: driver widths marker missing");
const details = `        const driverTableEndRow = totalRow.number;
        const addDriverSection = (title: string, headers: string[]) => {
          tonSheet.addRow([]);
          const titleRow = tonSheet.addRow([title]);
          tonSheet.mergeCells(titleRow.number, 1, titleRow.number, Math.max(6, headers.length));
          titleRow.height = 24;
          const titleCell = tonSheet.getCell(titleRow.number, 1);
          titleCell.font = { bold: true, size: 12, color: { argb: "111111" } };
          titleCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "DCEAF7" } };
          titleCell.alignment = { horizontal: "left", vertical: "middle" };
          const header = tonSheet.addRow(headers);
          header.height = 26;
          header.eachCell((cell: any) => {
            cell.font = { bold: true, size: 10, color: { argb: "111111" } };
            cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "C9DDF0" } };
            cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
            cell.border = border;
          });
        };
        addDriverSection("ABASTECIMENTOS", ["Data", "Posto", "Litros", "Preço/L", "Total pago", "Placa / conjunto"]);
        reportFuelings.forEach((fueling: any, index: number) => {
          const paid = Number(fueling.totalPaid ?? fueling.total ?? fueling.amount ?? 0);
          const calculated = Number(fueling.liters ?? 0) * Number(fueling.pricePerLiter ?? 0);
          const row = tonSheet.addRow([formatDate(fueling.date), fueling.station ?? "—", Number(fueling.liters ?? 0), Number(fueling.pricePerLiter ?? 0), paid > 0 ? paid : calculated, fueling.tractorPlate ?? fueling.fleetName ?? "—"]);
          row.height = 22;
          row.eachCell((cell: any) => { cell.font = { color: { argb: "111111" }, size: 10 }; cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: index % 2 ? "F8FAFC" : "FFFFFF" } }; cell.border = border; cell.alignment = { vertical: "middle", wrapText: true }; });
          row.getCell(3).numFmt = '0.000 "L"'; row.getCell(4).numFmt = row.getCell(5).numFmt = 'R$ #,##0.00';
        });
        addDriverSection("ADIANTAMENTOS", ["Data", "Descrição", "Valor"]);
        excelExpensesSource.filter((expense: any) => String(expense.category ?? "") === "Adiantamento").forEach((expense: any, index: number) => {
          const row = tonSheet.addRow([formatDate(expense.date), expense.description ?? "—", Number(expense.amount ?? 0)]);
          row.height = 22;
          row.eachCell((cell: any) => { cell.font = { color: { argb: "111111" }, size: 10 }; cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: index % 2 ? "F8FAFC" : "FFFFFF" } }; cell.border = border; cell.alignment = { vertical: "middle", wrapText: true }; });
          row.getCell(3).numFmt = 'R$ #,##0.00';
        });
        addDriverSection("DESPESAS", ["Data", "Categoria", "Descrição", "Valor"]);
        excelExpensesSource.filter((expense: any) => String(expense.category ?? "") !== "Adiantamento").forEach((expense: any, index: number) => {
          const row = tonSheet.addRow([formatDate(expense.date), expense.category ?? "Despesa", expense.description ?? "—", Number(expense.amount ?? 0)]);
          row.height = 22;
          row.eachCell((cell: any) => { cell.font = { color: { argb: "111111" }, size: 10 }; cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: index % 2 ? "F8FAFC" : "FFFFFF" } }; cell.border = border; cell.alignment = { vertical: "middle", wrapText: true }; });
          row.getCell(4).numFmt = 'R$ #,##0.00';
        });

`;
s = s.slice(0, widthsPos) + details + s.slice(widthsPos);

if (widthsMarker === compactWidthsMarker) {
  s = s.replace(
    '        [12, 14, 22, 18, 19, 14, 14, 14, 16, 15, 12, 15, 15, 16]\n          .forEach((width, index) => { tonSheet.getColumn(index + 1).width = width; });',
    '        [17, 18, 24, 22, 22, 18, 18, 18, 20, 18, 15, 18, 18, 20]\n          .forEach((width, index) => { tonSheet.getColumn(index + 1).width = width; });'
  );
  s = s.replace(
    '        tonSheet.autoFilter = { from: { row: 6, column: 1 }, to: { row: Math.max(6, tonSheet.rowCount - 1), column: 14 } };',
    '        tonSheet.autoFilter = { from: { row: 6, column: 1 }, to: { row: Math.max(6, driverTableEndRow - 1), column: 14 } };'
  );
} else {
  s = s.replace(
    '        [12, 12, 20, 17, 17, 20, 18, 16, 14, 14, 14, 15, 15, 12, 15, 15, 15]\n          .forEach((width, index) => { tonSheet.getColumn(index + 1).width = width; });',
    '        [17, 18, 28, 24, 24, 24, 22, 22, 18, 18, 18, 22, 24, 17, 24, 24, 24]\n          .forEach((width, index) => { tonSheet.getColumn(index + 1).width = width; });'
  );
  s = s.replace(
    '        tonSheet.autoFilter = { from: { row: 6, column: 1 }, to: { row: Math.max(6, tonSheet.rowCount - 1), column: 17 } };',
    '        tonSheet.autoFilter = { from: { row: 6, column: 1 }, to: { row: Math.max(6, driverTableEndRow - 1), column: 17 } };'
  );
}

s = s.replace(
  '    workbook.eachSheet((excelSheet: any) => { excelSheet.eachRow({ includeEmpty: true }, (excelRow: any) => { excelRow.eachCell({ includeEmpty: true }, (cell: any) => { cell.font = { ...(cell.font ?? {}), color: { argb: "111111" } }; }); }); });',
  '    workbook.eachSheet((excelSheet: any) => {\n      excelSheet.eachRow({ includeEmpty: true }, (excelRow: any) => {\n        excelRow.eachCell({ includeEmpty: true }, (cell: any) => {\n          cell.font = { ...(cell.font ?? {}), color: { argb: "111111" } };\n          if (typeof cell.value === "number") {\n            cell.alignment = { ...(cell.alignment ?? {}), vertical: cell.alignment?.vertical ?? "middle", shrinkToFit: true };\n          }\n        });\n      });\n      excelSheet.columns.forEach((column: any) => { if (column && (!column.width || column.width < 12)) column.width = 12; });\n    });'
);

fs.writeFileSync(file, s);
console.log("[report-totals-layout] Excel geral e por motorista organizados com totais de adiantamentos, abastecimentos e despesas");
