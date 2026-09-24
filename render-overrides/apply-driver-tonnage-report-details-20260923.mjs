import fs from "node:fs";
import path from "node:path";

const target = process.argv[2];
if (!target) throw new Error("driver-tonnage-report-details-20260923: target missing");

const read = (rel) => fs.readFileSync(path.join(target, rel), "utf8");
const write = (rel, value) => fs.writeFileSync(path.join(target, rel), value);

// Excel individual por motorista: cria uma aba exclusiva com cada viagem por tonelada
// e todos os campos operacionais/financeiros disponíveis na viagem.
{
  const rel = "src/routes/dono/totais.tsx";
  let s = read(rel);
  s = s.replace('  const [period, setPeriod] = useState<Period>("month");', '  const [period, setPeriod] = useState<Period>("all");');
  if (!s.includes("VIAGENS POR TONELADA - DETALHAMENTO COMPLETO")) {
    const fnStart = s.indexOf("  async function exportExcelColorido(driverScope?:");
    if (fnStart < 0) throw new Error("driver-tonnage-report-details-20260923: exportExcelColorido not found");
    const marker = "    const buffer = await workbook.xlsx.writeBuffer();";
    const insertAt = s.indexOf(marker, fnStart);
    if (insertAt < 0) throw new Error("driver-tonnage-report-details-20260923: Excel buffer marker not found");

    const block = `
    if (driverScope) {
      const detailedTrips = excelTrips
        .filter((trip: any) => {
          const mode = String(trip.freightMode ?? "ton");
          return mode === "ton" || mode === "trip";
        })
        .sort((a: any, b: any) => String(a.date ?? "").localeCompare(String(b.date ?? "")) || String(a.code ?? "").localeCompare(String(b.code ?? ""), "pt-BR", { numeric: true }));
      const groupedModes = ["cegonha", "caixinha"].map((mode) => {
        const rows = excelTrips
          .filter((trip: any) => String(trip.freightMode ?? "ton") === mode)
          .sort((a: any, b: any) => String(a.date ?? "").localeCompare(String(b.date ?? "")));
        if (rows.length === 0) return null;
        return {
          mode,
          count: rows.length,
          firstDate: rows[0]?.date,
          lastDate: rows[rows.length - 1]?.date,
          freight: rows.reduce((sum: number, trip: any) => sum + Number(trip.freight ?? 0), 0),
          commission: rows.reduce((sum: number, trip: any) => sum + Number(trip.commissionValue ?? trip.commission ?? 0), 0),
          after: rows.reduce((sum: number, trip: any) => sum + Number(trip.afterCommission ?? (Number(trip.freight ?? 0) - Number(trip.commissionValue ?? trip.commission ?? 0))), 0),
        };
      }).filter(Boolean) as any[];

      if (detailedTrips.length > 0 || groupedModes.length > 0) {
        const tonSheet = workbook.addWorksheet("Viagens do motorista", {
          pageSetup: { orientation: "landscape", paperSize: 8, fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
        });
        tonSheet.orderNo = 1;
        tonSheet.addImage(logoId, { tl: { col: 0.05, row: 0.05 }, ext: { width: 340, height: 160 } });
        tonSheet.mergeCells("D1:Q2");
        tonSheet.getCell("D1").value = "RELATÓRIO COMPLETO DO MOTORISTA - TRANS SALOMÃO";
        tonSheet.getCell("D1").font = { bold: true, size: 20, color: { argb: "111111" } };
        tonSheet.getCell("D1").alignment = { horizontal: "center", vertical: "middle" };
        tonSheet.mergeCells("D3:Q3");
        tonSheet.getCell("D3").value = driverScope.name + " • " + excelPeriodLabel + " • Relatórios • Operador: " + excelOperator;
        tonSheet.getCell("D3").font = { bold: true, size: 13, color: { argb: "111111" } };
        tonSheet.getCell("D3").alignment = { horizontal: "center", vertical: "middle", wrapText: false };

        const countMode = (mode: string) => excelTrips.filter((trip: any) => String(trip.freightMode ?? "ton") === mode).length;
        const totalFreightDriver = excelTrips.reduce((sum: number, trip: any) => sum + Number(trip.freight ?? 0), 0);
        const totalCommissionDriver = excelTrips.reduce((sum: number, trip: any) => sum + Number(trip.commissionValue ?? trip.commission ?? 0), 0);
        const totalDieselDriver = excelTrips.reduce((sum: number, trip: any) => sum + Number(trip.dieselCost ?? 0), 0);

        tonSheet.mergeCells("A4:Q4");
        tonSheet.getCell("A4").value =
          "Viagens: " + excelTrips.length +
          " • Por tonelada: " + countMode("ton") +
          " • Diária: " + countMode("trip") +
          " • Cegonha: " + countMode("cegonha") +
          " • Caixinha: " + countMode("caixinha");
        tonSheet.getCell("A4").font = { bold: true, size: 12, color: { argb: "111111" } };
        tonSheet.getCell("A4").fill = { type: "pattern", pattern: "solid", fgColor: { argb: "EAF4FB" } };
        tonSheet.getCell("A4").alignment = { horizontal: "center", vertical: "middle", wrapText: false };

        tonSheet.mergeCells("A5:Q5");
        tonSheet.getCell("A5").value =
          "Frete total: " + brl(totalFreightDriver) +
          " • Comissão total: " + brl(totalCommissionDriver) +
          " • Diesel: " + brl(totalDieselDriver) +
          " • Após comissão: " + brl(totalFreightDriver - totalCommissionDriver);
        tonSheet.getCell("A5").font = { bold: true, size: 12, color: { argb: "111111" } };
        tonSheet.getCell("A5").fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF2CC" } };
        tonSheet.getCell("A5").alignment = { horizontal: "center", vertical: "middle", wrapText: false };

        tonSheet.getRow(1).height = 72;
        tonSheet.getRow(2).height = 58;
        tonSheet.getRow(3).height = 28;
        tonSheet.getRow(4).height = 24;
        tonSheet.getRow(5).height = 24;

        const tonHeader = tonSheet.getRow(6);
        tonHeader.values = [
          "Data", "Ticket", "Cliente", "Origem", "Destino", "Motorista", "Conjunto", "Modalidade",
          "Peso carregado (t)", "Peso bruto (t)", "Peso líquido (t)", "Preço/t ou diária",
          "Frete", "Comissão (%)", "Comissão", "Após comissão", "Resultado bruto"
        ];
        tonHeader.height = 30;
        tonHeader.eachCell((cell: any) => {
          cell.font = { bold: true, size: 13, color: { argb: "111111" } };
          cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "A9CBEA" } };
          cell.alignment = { horizontal: "center", vertical: "middle", wrapText: false };
          cell.border = border;
        });

        detailedTrips.forEach((trip: any) => {
          const mode = String(trip.freightMode ?? "ton");
          const freight = Number(trip.freight ?? 0);
          const commission = Number(trip.commissionValue ?? trip.commission ?? 0);
          const dieselCost = Number(trip.dieselCost ?? 0);
          const row = tonSheet.addRow([
            formatDate(trip.date),
            String(trip.code ?? "—"),
            String(trip.client ?? "—"),
            String(trip.origin ?? "—"),
            String(trip.destination ?? "—"),
            String(trip.driverName ?? driverScope.name),
            String(trip.fleetName ?? "—"),
            mode === "trip" ? "Diária" : "Por tonelada",
            Number(trip.loadedTons ?? 0),
            Number(trip.grossWeight ?? 0),
            Number(trip.netWeight ?? 0),
            mode === "trip" ? Number(trip.pricePerTrip ?? freight) : Number(trip.pricePerTon ?? 0),
            freight,
            freight > 0 ? commission / freight : 0,
            commission,
            Number(trip.afterCommission ?? (freight - commission)),
            Number(trip.grossResult ?? (freight - dieselCost)),
          ]);
          row.height = 24;
          row.eachCell((cell: any) => {
            cell.font = { color: { argb: "111111" }, size: 12 };
            cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFFF" } };
            cell.alignment = { vertical: "middle", wrapText: false };
            cell.border = border;
          });
          [9, 10, 11].forEach((c) => { row.getCell(c).numFmt = '0.000 "t"'; });
          [12, 13, 15, 16, 17].forEach((c) => { row.getCell(c).numFmt = 'R$ #,##0.00'; });
          row.getCell(14).numFmt = '0.00%';
        });

        groupedModes.forEach((group: any) => {
          const sameDate = String(group.firstDate ?? "") === String(group.lastDate ?? "");
          const dateLabel = sameDate
            ? formatDate(group.firstDate)
            : formatDate(group.firstDate) + " a " + formatDate(group.lastDate);
          const row = tonSheet.addRow([
            dateLabel,
            String(group.count) + " fretes agrupados",
            "",
            "",
            "",
            driverScope.name,
            "",
            group.mode === "cegonha" ? "Cegonha" : "Caixinha",
            "",
            "",
            "",
            "",
            group.freight,
            "",
            group.commission,
            group.after,
            "",
          ]);
          row.height = 24;
          row.eachCell((cell: any) => {
            cell.font = { bold: true, color: { argb: "111111" }, size: 12 };
            cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF2CC" } };
            cell.alignment = { vertical: "middle", wrapText: false };
            cell.border = border;
          });
          [13, 15, 16].forEach((c) => { row.getCell(c).numFmt = 'R$ #,##0.00'; });
        });

        const totalRow = tonSheet.addRow([
          "TOTAL", "", "", "", "", "", "", "",
          excelTrips.reduce((sum: number, trip: any) => sum + Number(trip.loadedTons ?? 0), 0),
          excelTrips.reduce((sum: number, trip: any) => sum + Number(trip.grossWeight ?? 0), 0),
          excelTrips.reduce((sum: number, trip: any) => sum + Number(trip.netWeight ?? 0), 0),
          "",
          excelTrips.reduce((sum: number, trip: any) => sum + Number(trip.freight ?? 0), 0),
          "",
          excelTrips.reduce((sum: number, trip: any) => sum + Number(trip.commissionValue ?? trip.commission ?? 0), 0),
          excelTrips.reduce((sum: number, trip: any) => sum + Number(trip.afterCommission ?? (Number(trip.freight ?? 0) - Number(trip.commissionValue ?? trip.commission ?? 0))), 0),
          excelTrips.reduce((sum: number, trip: any) => sum + Number(trip.grossResult ?? (Number(trip.freight ?? 0) - Number(trip.dieselCost ?? 0))), 0),
        ]);
        totalRow.height = 26;
        totalRow.eachCell((cell: any) => {
          cell.font = { bold: true, size: 12, color: { argb: "111111" } };
          cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "A9CBEA" } };
          cell.border = border;
          cell.alignment = { vertical: "middle", wrapText: false };
        });
        [9, 10, 11].forEach((c) => { totalRow.getCell(c).numFmt = '0.000 "t"'; });
        [13, 15, 16, 17].forEach((c) => { totalRow.getCell(c).numFmt = 'R$ #,##0.00'; });

        [14, 14, 24, 22, 22, 26, 26, 18, 19, 19, 19, 22, 22, 17, 22, 22, 22]
          .forEach((width, index) => { tonSheet.getColumn(index + 1).width = width; });
        tonSheet.views = [{ state: "frozen", ySplit: 6 }];
        tonSheet.autoFilter = { from: { row: 6, column: 1 }, to: { row: Math.max(6, tonSheet.rowCount - 1), column: 17 } };
        tonSheet.printArea = "A1:Q" + tonSheet.rowCount;

        // O Excel individual deve ter uma única aba: resumo + todas as modalidades nela.
        workbook.removeWorksheet(sheet.id);
      }
    }

`;
    s = s.slice(0, insertAt) + block + s.slice(insertAt);
    write(rel, s);
  }
}

// PDF por motorista: Por tonelada e Diária ficam uma viagem por linha.
// Cegonha/Caixinha seguem agrupadas. A célula de informações fica em UMA linha.
{
  const rel = "src/lib/pdf.ts";
  let s = read(rel);

  const verbose = [
    '    const freight = Number(trip.freight ?? 0);',
    '    const commission = Number(trip.commissionValue ?? trip.commission ?? 0);',
    '    const dieselCost = Number(trip.dieselCost ?? 0);',
    '    const kmStart = Number(trip.kmStart ?? 0);',
    '    const kmEnd = Number(trip.kmEnd ?? 0);',
    '    const kmRun = Number(trip.kmRun ?? (kmEnd >= kmStart ? kmEnd - kmStart : 0));',
    '    const commissionPct = freight > 0 ? commission / freight : 0;',
    '    const details = mode === "ton"',
    '      ? [',
    '          `Cliente: ${String(trip.client ?? "—")}`,',
    '          `Rota: ${String(trip.origin ?? "—")} → ${String(trip.destination ?? "—")}`,',
    '          `Conjunto: ${String(trip.fleetName ?? "—")}`,',
    '          `Peso carregado: ${tons(Number(trip.loadedTons ?? 0))} • Peso bruto: ${tons(Number(trip.grossWeight ?? 0))} • Peso líquido: ${tons(Number(trip.netWeight ?? 0))}`,',
    '          `Preço/t: ${brl(Number(trip.pricePerTon ?? 0))}/t • Comissão: ${(commissionPct * 100).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`,',
    '          `KM inicial: ${kmStart.toLocaleString("pt-BR", { maximumFractionDigits: 2 })} • KM final: ${kmEnd.toLocaleString("pt-BR", { maximumFractionDigits: 2 })} • KM rodados: ${kmRun.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}`,',
    '          `Custo diesel: ${brl(dieselCost)} • Resultado bruto: ${brl(Number(trip.grossResult ?? (freight - dieselCost)))}`,',
    '        ].join("\\n")',
    '      : mode === "trip"',
    '        ? `Valor da diária: ${brl(Number(trip.pricePerTrip ?? trip.freight ?? 0))}`',
    '        : `${modeLabelCompact(mode)} • 1 frete`;',
  ].join("\n");

  const compact = [
    '    const details = mode === "ton"',
    '      ? `Peso líquido: ${tons(Number(trip.netWeight ?? 0))} • Preço/t: ${brl(Number(trip.pricePerTon ?? 0))}/t`',
    '      : mode === "trip"',
    '        ? `Diária: ${brl(Number(trip.pricePerTrip ?? trip.freight ?? 0))}`',
    '        : `${modeLabelCompact(mode)} • 1 frete`;',
  ].join("\n");

  if (s.includes(verbose)) s = s.replace(verbose, compact);

  const previousCompact = [
    '    const details = mode === "ton"',
    '      ? `Peso: ${tons(Number(trip.netWeight ?? 0))} • Preço/t: ${brl(Number(trip.pricePerTon ?? 0))}/t`',
    '      : mode === "trip"',
    '        ? `Diária: ${brl(Number(trip.pricePerTrip ?? trip.freight ?? 0))}`',
    '        : `${modeLabelCompact(mode)} • 1 frete`;',
  ].join("\n");
  if (s.includes(previousCompact)) s = s.replace(previousCompact, compact);

  const originalCompact = [
    '    const details = mode === "ton"',
    '      ? `Peso líquido: ${tons(Number(trip.netWeight ?? 0))}  •  ${brl(Number(trip.pricePerTon ?? 0))}/t`',
    '      : mode === "trip"',
    '        ? `Valor da diária: ${brl(Number(trip.pricePerTrip ?? trip.freight ?? 0))}`',
    '        : `${modeLabelCompact(mode)} • 1 frete`;',
  ].join("\n");
  if (s.includes(originalCompact)) s = s.replace(originalCompact, compact);

  s = s.replace(
    'if (mode === "ton") { rows.push(rowForTrip(trip)); return; }',
    'if (mode === "ton" || mode === "trip") { rows.push(rowForTrip(trip)); return; }'
  );

  // Mantém o título da coluna, mas elimina qualquer quebra manual que fazia a linha crescer.
  s = s.replaceAll('wrapText: true', 'wrapText: false');
  write(rel, s);
}
console.log("[driver-tonnage-report-details-20260923] PDF one-line peso/preco; Excel sem KM e custo diesel; Cegonha/Caixinha agrupadas");
