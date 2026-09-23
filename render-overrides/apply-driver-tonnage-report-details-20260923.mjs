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
        sheet.orderNo = 2;
        sheet.name = "Resumo";
        tonSheet.addImage(logoId, { tl: { col: 0.02, row: 0.01 }, ext: { width: 520, height: 260 } });
        tonSheet.mergeCells("D1:T2");
        tonSheet.getCell("D1").value = "VIAGENS DO MOTORISTA - DETALHAMENTO E AGRUPAMENTOS";
        tonSheet.getCell("D1").font = { bold: true, size: 24, color: { argb: "111111" } };
        tonSheet.getCell("D1").alignment = { horizontal: "center", vertical: "middle" };
        tonSheet.mergeCells("D3:T4");
        tonSheet.getCell("D3").value = driverScope.name + " • " + excelPeriodLabel + " • Relatórios • Operador: " + excelOperator;
        tonSheet.getCell("D3").font = { bold: true, size: 16, color: { argb: "111111" } };
        tonSheet.getCell("D3").alignment = { horizontal: "center", vertical: "middle", wrapText: true };
        tonSheet.getRow(1).height = 104;
        tonSheet.getRow(2).height = 92;
        tonSheet.getRow(3).height = 40;
        tonSheet.getRow(4).height = 40;

        const tonHeader = tonSheet.getRow(6);
        tonHeader.values = [
          "Data", "Ticket", "Cliente", "Origem", "Destino", "Motorista", "Conjunto", "Modalidade",
          "Peso carregado (t)", "Peso bruto (t)", "Peso líquido (t)", "Preço do frete",
          "Frete", "KM inicial", "KM final", "KM rodados", "Comissão (%)", "Comissão",
          "Após comissão", "Resultado bruto", "Custo diesel"
        ];
        tonHeader.height = 42;
        tonHeader.eachCell((cell: any) => {
          cell.font = { bold: true, size: 16, color: { argb: "111111" } };
          cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "A9CBEA" } };
          cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
          cell.border = border;
        });

        detailedTrips.forEach((trip: any) => {
          const mode = String(trip.freightMode ?? "ton");
          const freight = Number(trip.freight ?? 0);
          const commission = Number(trip.commissionValue ?? trip.commission ?? 0);
          const dieselCost = Number(trip.dieselCost ?? 0);
          const kmStart = Number(trip.kmStart ?? 0);
          const kmEnd = Number(trip.kmEnd ?? 0);
          const kmRun = Number(trip.kmRun ?? (kmEnd >= kmStart ? kmEnd - kmStart : 0));
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
            kmStart,
            kmEnd,
            kmRun,
            freight > 0 ? commission / freight : 0,
            commission,
            Number(trip.afterCommission ?? (freight - commission)),
            Number(trip.grossResult ?? (freight - dieselCost)),
            dieselCost,
          ]);
          row.height = 34;
          row.eachCell((cell: any) => {
            cell.font = { color: { argb: "111111" }, size: 16 };
            cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "DCEEFF" } };
            cell.alignment = { vertical: "middle", wrapText: true };
            cell.border = border;
          });
          [9, 10, 11].forEach((c) => { row.getCell(c).numFmt = '0.000 "t"'; });
          [12, 13, 18, 19, 20, 21].forEach((c) => { row.getCell(c).numFmt = 'R$ #,##0.00'; });
          [14, 15, 16].forEach((c) => { row.getCell(c).numFmt = '0.00'; });
          row.getCell(17).numFmt = '0.00%';
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
            "",
            "",
            "",
            group.commission,
            group.after,
            "",
            "",
          ]);
          row.height = 38;
          row.eachCell((cell: any) => {
            cell.font = { bold: true, color: { argb: "111111" }, size: 16 };
            cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF2CC" } };
            cell.alignment = { vertical: "middle", wrapText: true };
            cell.border = border;
          });
          [13, 18, 19].forEach((c) => { row.getCell(c).numFmt = 'R$ #,##0.00'; });
        });

        const totalRow = tonSheet.addRow([
          "TOTAL", "", "", "", "", "", "", "",
          excelTrips.reduce((sum: number, trip: any) => sum + Number(trip.loadedTons ?? 0), 0),
          excelTrips.reduce((sum: number, trip: any) => sum + Number(trip.grossWeight ?? 0), 0),
          excelTrips.reduce((sum: number, trip: any) => sum + Number(trip.netWeight ?? 0), 0),
          "",
          excelTrips.reduce((sum: number, trip: any) => sum + Number(trip.freight ?? 0), 0),
          "", "",
          excelTrips.reduce((sum: number, trip: any) => sum + Number(trip.kmRun ?? 0), 0),
          "",
          excelTrips.reduce((sum: number, trip: any) => sum + Number(trip.commissionValue ?? trip.commission ?? 0), 0),
          excelTrips.reduce((sum: number, trip: any) => sum + Number(trip.afterCommission ?? (Number(trip.freight ?? 0) - Number(trip.commissionValue ?? trip.commission ?? 0))), 0),
          excelTrips.reduce((sum: number, trip: any) => sum + Number(trip.grossResult ?? (Number(trip.freight ?? 0) - Number(trip.dieselCost ?? 0))), 0),
          excelTrips.reduce((sum: number, trip: any) => sum + Number(trip.dieselCost ?? 0), 0),
        ]);
        totalRow.height = 38;
        totalRow.eachCell((cell: any) => {
          cell.font = { bold: true, size: 16, color: { argb: "111111" } };
          cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "A9CBEA" } };
          cell.border = border;
          cell.alignment = { vertical: "middle", wrapText: true };
        });
        [9, 10, 11].forEach((c) => { totalRow.getCell(c).numFmt = '0.000 "t"'; });
        [13, 18, 19, 20, 21].forEach((c) => { totalRow.getCell(c).numFmt = 'R$ #,##0.00'; });
        totalRow.getCell(16).numFmt = '0.00';

        [14, 14, 24, 22, 22, 26, 26, 18, 19, 19, 19, 22, 22, 16, 16, 16, 17, 22, 22, 22, 22]
          .forEach((width, index) => { tonSheet.getColumn(index + 1).width = width; });
        tonSheet.views = [{ state: "frozen", ySplit: 6 }];
        tonSheet.autoFilter = { from: { row: 6, column: 1 }, to: { row: 6, column: 21 } };
        tonSheet.printArea = "A1:U" + tonSheet.rowCount;
      }
    }

`;
    s = s.slice(0, insertAt) + block + s.slice(insertAt);
    write(rel, s);
  }
}

// PDF por motorista: as viagens por tonelada já são individuais; aqui cada linha
// passa a mostrar todos os dados relevantes da viagem, mantendo os demais modos compactos.
{
  const rel = "src/lib/pdf.ts";
  let s = read(rel);
  if (!s.includes('Cliente: ${String(trip.client ?? "—")}')) {
    const before = `    const details = mode === "ton"
      ? \`Peso líquido: \${tons(Number(trip.netWeight ?? 0))}  •  \${brl(Number(trip.pricePerTon ?? 0))}/t\`
      : mode === "trip"
        ? \`Valor da diária: \${brl(Number(trip.pricePerTrip ?? trip.freight ?? 0))}\`
        : \`\${modeLabelCompact(mode)} • 1 frete\`;`;
    const after = `    const freight = Number(trip.freight ?? 0);
    const commission = Number(trip.commissionValue ?? trip.commission ?? 0);
    const dieselCost = Number(trip.dieselCost ?? 0);
    const kmStart = Number(trip.kmStart ?? 0);
    const kmEnd = Number(trip.kmEnd ?? 0);
    const kmRun = Number(trip.kmRun ?? (kmEnd >= kmStart ? kmEnd - kmStart : 0));
    const commissionPct = freight > 0 ? commission / freight : 0;
    const details = mode === "ton"
      ? [
          \`Cliente: \${String(trip.client ?? "—")}\`,
          \`Rota: \${String(trip.origin ?? "—")} → \${String(trip.destination ?? "—")}\`,
          \`Conjunto: \${String(trip.fleetName ?? "—")}\`,
          \`Peso carregado: \${tons(Number(trip.loadedTons ?? 0))} • Peso bruto: \${tons(Number(trip.grossWeight ?? 0))} • Peso líquido: \${tons(Number(trip.netWeight ?? 0))}\`,
          \`Preço/t: \${brl(Number(trip.pricePerTon ?? 0))}/t • Comissão: \${(commissionPct * 100).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%\`,
          \`KM inicial: \${kmStart.toLocaleString("pt-BR", { maximumFractionDigits: 2 })} • KM final: \${kmEnd.toLocaleString("pt-BR", { maximumFractionDigits: 2 })} • KM rodados: \${kmRun.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}\`,
          \`Custo diesel: \${brl(dieselCost)} • Resultado bruto: \${brl(Number(trip.grossResult ?? (freight - dieselCost)))}\`,
        ].join("\\n")
      : mode === "trip"
        ? \`Valor da diária: \${brl(Number(trip.pricePerTrip ?? trip.freight ?? 0))}\`
        : \`\${modeLabelCompact(mode)} • 1 frete\`;`;
    if (!s.includes(before)) throw new Error("driver-tonnage-report-details-20260923: PDF ton detail block not found");
    s = s.replace(before, after);
    s = s.replace('head: [["Data", "Ticket / modalidade", "Motorista", "Detalhes do frete", "Frete", "Comissão", "Após comissão"]]', 'head: [["Data", "Ticket / modalidade", "Motorista", "Informações completas da viagem", "Frete", "Comissão", "Após comissão"]]');
    write(rel, s);
  }
  // No relatório individual, Diária também é listada viagem por viagem.
  // Apenas Cegonha e Caixinha permanecem agrupadas.
  s = read(rel);
  s = s.replace(
    'if (mode === "ton") { rows.push(rowForTrip(trip)); return; }',
    'if (mode === "ton" || mode === "trip") { rows.push(rowForTrip(trip)); return; }'
  );
  write(rel, s);
}

console.log("[driver-tonnage-report-details-20260923] tonnage + daily individual; cegonha/caixinha grouped in driver Excel/PDF");
