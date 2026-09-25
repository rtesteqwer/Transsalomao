import fs from "node:fs";
import path from "node:path";

const target = process.argv[2];
if (!target || !fs.existsSync(target)) throw new Error("excel-date-mode-style: target missing");

function mustReplace(source, before, after, label) {
  if (!source.includes(before)) throw new Error(`excel-date-mode-style: pattern not found (${label})`);
  return source.replace(before, after);
}
function patch(rel, fn) {
  const file = path.join(target, rel);
  if (!fs.existsSync(file)) throw new Error(`excel-date-mode-style: missing ${rel}`);
  const before = fs.readFileSync(file, "utf8");
  const after = fn(before);
  if (after === before) throw new Error(`excel-date-mode-style: no changes (${rel})`);
  fs.writeFileSync(file, after);
}

const chronologicalBlock = (sheetName, tripSource) => `
    const excelModeInfo = (mode: string) => mode === "ton"
      ? { label: "POR TONELADA", fill: "D9EAD3", accent: "6AA84F", order: 1 }
      : mode === "trip"
        ? { label: "DIÁRIA", fill: "D9EAF7", accent: "3D85C6", order: 2 }
        : mode === "cegonha"
          ? { label: "CEGONHA", fill: "FCE5CD", accent: "E69138", order: 3 }
          : { label: "CAIXINHA", fill: "EADCF8", accent: "8E7CC3", order: 4 };
    const excelDateKey = (value: any) => {
      const raw = String(value ?? "").trim();
      const iso = raw.match(/^(\\d{4}-\\d{2}-\\d{2})/); if (iso) return iso[1];
      const br = raw.match(/^(\\d{1,2})[\\/.\\-](\\d{1,2})[\\/.\\-](\\d{4})/);
      if (br) return br[3] + "-" + br[2].padStart(2, "0") + "-" + br[1].padStart(2, "0");
      const parsed = new Date(raw); return Number.isNaN(parsed.getTime()) ? raw : parsed.toISOString().slice(0, 10);
    };
    const excelSame = (items: any[], key: string) => {
      const values = [...new Set(items.map((item: any) => String(item?.[key] ?? "").trim()).filter(Boolean))];
      return values.length === 1 ? values[0] : values.length > 1 ? "Vários" : "—";
    };
    const excelSpecial = new Map<string, any>();
    const excelChronological: any[] = [];
    ${tripSource}.forEach((trip: any) => {
      const mode = String(trip.freightMode ?? "ton");
      const date = excelDateKey(trip.date);
      if (mode === "cegonha" || mode === "caixinha") {
        const key = [trip.driverId, mode].map((x) => String(x ?? "")).join("|");
        const item = excelSpecial.get(key) ?? { kind: "group", mode, date, firstDate: date, lastDate: date, driverName: trip.driverName, items: [], count: 0, freight: 0, commission: 0, after: 0, result: 0 };
        item.items.push(trip); item.count += 1; if (date && (!item.firstDate || date < item.firstDate)) item.firstDate = date; if (date && (!item.lastDate || date > item.lastDate)) item.lastDate = date; item.date = item.firstDate || date; item.freight += Number(trip.freight ?? 0); item.commission += Number(trip.commissionValue ?? trip.commission ?? 0); item.after += Number(trip.afterCommission ?? (Number(trip.freight ?? 0) - Number(trip.commissionValue ?? trip.commission ?? 0))); item.result += Number(trip.grossResult ?? 0); excelSpecial.set(key, item);
      } else excelChronological.push({ kind: "single", mode, date, driverName: trip.driverName, trip });
    });
    excelSpecial.forEach((item) => excelChronological.push(item));
    excelChronological.sort((a: any, b: any) => a.date.localeCompare(b.date) || String(a.driverName ?? "").localeCompare(String(b.driverName ?? ""), "pt-BR") || excelModeInfo(a.mode).order - excelModeInfo(b.mode).order || String(a.trip?.code ?? "").localeCompare(String(b.trip?.code ?? ""), "pt-BR", { numeric: true }));
    ${sheetName}.addRow([]);
    const excelTripTitle = ${sheetName}.addRow(["VIAGENS EM ORDEM DE DATA — MODALIDADES DIFERENCIADAS POR COR"]);
    ${sheetName}.mergeCells(excelTripTitle.number, 1, excelTripTitle.number, 13);
    ${sheetName}.getCell(excelTripTitle.number, 1).font = { bold: true, size: 14, color: { argb: "111111" } };
    ${sheetName}.getCell(excelTripTitle.number, 1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "DCE6EF" } };
    ${sheetName}.getCell(excelTripTitle.number, 1).alignment = { horizontal: "center", vertical: "middle" };
    const excelLegend = ${sheetName}.addRow(["LEGENDA", "POR TONELADA", "DIÁRIA", "CEGONHA", "CAIXINHA"]);
    [2,3,4,5].forEach((col, i) => { const info = excelModeInfo(["ton","trip","cegonha","caixinha"][i]); const cell = excelLegend.getCell(col); cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: info.fill } }; cell.font = { bold: true, color: { argb: "111111" } }; cell.alignment = { horizontal: "center" }; });
    const excelTripHeader = ${sheetName}.addRow(["Data", "Ticket / Grupo", "Motorista", "Modalidade", "Qtd.", "Cliente", "Origem", "Destino", "Peso líquido (t)", "Faturamento", "Comissão", "Total líquido", "Resultado bruto"]);
    excelTripHeader.height = 30;
    excelTripHeader.eachCell((cell: any) => { cell.font = { bold: true, color: { argb: "111111" }, size: 11 }; cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "C9D7E5" } }; cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true }; });
    excelChronological.forEach((item: any) => {
      const info = excelModeInfo(item.mode), grouped = item.kind === "group", trip = item.trip;
      const groupDate = item.firstDate === item.lastDate ? formatDate(item.firstDate) : formatDate(item.firstDate) + " a " + formatDate(item.lastDate);
      const row = ${sheetName}.addRow(grouped ? [groupDate, item.count + " viagens", item.driverName ?? "Sem motorista", info.label, item.count, excelSame(item.items, "client"), excelSame(item.items, "origin"), excelSame(item.items, "destination"), item.items.reduce((sum: number, x: any) => sum + Number(x.netWeight ?? 0), 0), item.freight, item.commission, item.after, item.result] : [formatDate(item.date), String(trip.code ?? "—"), String(trip.driverName ?? "Sem motorista"), info.label, 1, String(trip.client ?? "—"), String(trip.origin ?? "—"), String(trip.destination ?? "—"), Number(trip.netWeight ?? 0), Number(trip.freight ?? 0), Number(trip.commissionValue ?? trip.commission ?? 0), Number(trip.afterCommission ?? (Number(trip.freight ?? 0) - Number(trip.commissionValue ?? trip.commission ?? 0))), Number(trip.grossResult ?? 0)]);
      row.eachCell((cell: any) => { cell.font = { color: { argb: "111111" }, size: 11, bold: grouped }; cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: info.fill } }; cell.border = { top: { style: "thin", color: { argb: info.accent } }, bottom: { style: "thin", color: { argb: info.accent } }, left: { style: "thin", color: { argb: info.accent } }, right: { style: "thin", color: { argb: info.accent } } }; cell.alignment = { vertical: "middle", wrapText: true }; });
      row.getCell(4).font = { bold: true, color: { argb: "111111" }, size: 11 };
      row.getCell(9).numFmt = '0.000 "t"'; [10,11,12,13].forEach((c) => { row.getCell(c).numFmt = 'R$ #,##0.00'; });
    });
`;

patch("src/routes/dono/viagens.tsx", (s) => {
  s = s.replace('ext: { width: 520, height: 260 }', 'ext: { width: 600, height: 300 }');
  s = mustReplace(s,
    '    const excelLightBlue = "DCEEFF"; for (let r = 1; r <= sheet.rowCount; r += 1) { for (let c = 1; c <= 8; c += 1) { const cell = sheet.getRow(r).getCell(c); cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: excelLightBlue } }; cell.font = { ...(cell.font ?? {}), color: { argb: "111111" } }; } }',
    chronologicalBlock("sheet", "rows"),
    "Viagens chronological section",
  );
  s = mustReplace(s,
    '[29, 18, 11, 15, 18, 18, 18, 18].forEach((w, i) => { sheet.getColumn(i + 1).width = w; }); sheet.printArea = `A1:H${Math.max(5, sheet.rowCount)}`;',
    '[14, 20, 28, 24, 9, 24, 22, 22, 18, 18, 18, 18, 18].forEach((w, i) => { sheet.getColumn(i + 1).width = w; }); sheet.printArea = `A1:M${Math.max(5, sheet.rowCount)}`;',
    "Viagens widths",
  );
  s = s.replaceAll('    const buffer = await workbook.xlsx.writeBuffer();', '    workbook.eachSheet((excelSheet: any) => { excelSheet.eachRow({ includeEmpty: true }, (excelRow: any) => { excelRow.eachCell({ includeEmpty: true }, (cell: any) => { cell.font = { ...(cell.font ?? {}), color: { argb: "111111" } }; }); }); });\n    const buffer = await workbook.xlsx.writeBuffer();');
  return s;
});

patch("src/routes/dono/totais.tsx", (s) => {
  s = s.replace('ext: { width: 520, height: 260 }', 'ext: { width: 600, height: 300 }');
  s = s.replace('ext: { width: 340, height: 160 }', 'ext: { width: 480, height: 225 }');
  s = mustReplace(s,
    '    addSection("ABASTECIMENTOS / CUSTO DIESEL", ["Data", "Motorista", "Posto", "Litros", "Preço/L", "Custo diesel"]);',
    chronologicalBlock("sheet", "excelTrips") + '\n    addSection("ABASTECIMENTOS / CUSTO DIESEL", ["Data", "Motorista", "Posto", "Litros", "Preço/L", "Custo diesel"]);',
    "General chronological section",
  );
  s = s.replace(/\n\s*for \(let r = 1; r <= sheet\.rowCount; r \+= 1\) \{ for \(let c = 1; c <= 8; c \+= 1\) \{ const cell = sheet\.getRow\(r\)\.getCell\(c\); cell\.fill = \{ type: "pattern", pattern: "solid", fgColor: \{ argb: lightBlue \} \}; cell\.font = \{ \.\.\.\(cell\.font \?\? \{\}\), color: \{ argb: black \} \}; \} \}/, '');
  s = mustReplace(s,
    '[40, 30, 20, 28, 28, 28, 28, 32].forEach((width, i) => { sheet.getColumn(i + 1).width = width; }); sheet.autoFilter = { from: "A6", to: `H${Math.max(6, 6 + grouped.size)}` }; sheet.printArea = `A1:H${sheet.rowCount}`;',
    '[14, 20, 28, 24, 9, 24, 22, 22, 18, 18, 18, 18, 18].forEach((width, i) => { sheet.getColumn(i + 1).width = width; }); sheet.autoFilter = { from: "A6", to: `H${Math.max(6, 6 + grouped.size)}` }; sheet.printArea = `A1:M${sheet.rowCount}`;',
    "General widths",
  );

  const groupStart = s.indexOf('      const groupedModes = ["cegonha", "caixinha"].map((mode) => {');
  const groupEnd = s.indexOf('\n\n      if (detailedTrips.length > 0 || groupedModes.length > 0) {', groupStart);
  if (groupStart < 0 || groupEnd < 0) throw new Error('excel-date-mode-style: individual groups block missing');
  const newGroups = `      const groupedModeMap = new Map<string, any>();
      excelTrips.filter((trip: any) => { const mode = String(trip.freightMode ?? "ton"); return mode === "cegonha" || mode === "caixinha"; }).forEach((trip: any) => {
        const mode = String(trip.freightMode ?? "ton");
        const date = String(trip.date ?? "").slice(0, 10);
        const key = mode;
        const group = groupedModeMap.get(key) ?? { mode, date, firstDate: date, lastDate: date, items: [], count: 0, freight: 0, commission: 0, after: 0, result: 0 };
        group.items.push(trip); group.count += 1; if (date && (!group.firstDate || date < group.firstDate)) group.firstDate = date; if (date && (!group.lastDate || date > group.lastDate)) group.lastDate = date; group.date = group.firstDate || date; group.freight += Number(trip.freight ?? 0); group.commission += Number(trip.commissionValue ?? trip.commission ?? 0); group.after += Number(trip.afterCommission ?? (Number(trip.freight ?? 0) - Number(trip.commissionValue ?? trip.commission ?? 0))); group.result += Number(trip.grossResult ?? 0); groupedModeMap.set(key, group);
      });
      const groupedModes = Array.from(groupedModeMap.values()).sort((a: any, b: any) => String(a.date).localeCompare(String(b.date)) || String(a.mode).localeCompare(String(b.mode)));
      const driverModeInfo = (mode: string) => mode === "ton" ? { label: "POR TONELADA", fill: "D9EAD3", accent: "6AA84F", order: 1 } : mode === "trip" ? { label: "DIÁRIA", fill: "D9EAF7", accent: "3D85C6", order: 2 } : mode === "cegonha" ? { label: "CEGONHA", fill: "FCE5CD", accent: "E69138", order: 3 } : { label: "CAIXINHA", fill: "EADCF8", accent: "8E7CC3", order: 4 };
      const orderedDriverRows = [
        ...detailedTrips.map((trip: any) => ({ kind: "trip", mode: String(trip.freightMode ?? "ton"), date: String(trip.date ?? "").slice(0, 10), trip })),
        ...groupedModes.map((group: any) => ({ kind: "group", mode: group.mode, date: group.date, group })),
      ].sort((a: any, b: any) => String(a.date).localeCompare(String(b.date)) || driverModeInfo(a.mode).order - driverModeInfo(b.mode).order || String(a.trip?.code ?? "").localeCompare(String(b.trip?.code ?? ""), "pt-BR", { numeric: true }));`;
  s = s.slice(0, groupStart) + newGroups + s.slice(groupEnd);

  const rowsStart = s.indexOf('        detailedTrips.forEach((trip: any) => {');
  const rowsEnd = s.indexOf('\n\n        const totalRow = tonSheet.addRow([', rowsStart);
  if (rowsStart < 0 || rowsEnd < 0) throw new Error('excel-date-mode-style: individual row loops missing');
  const combinedRows = `        orderedDriverRows.forEach((item: any) => {
          const info = driverModeInfo(item.mode);
          if (item.kind === "group") {
            const group = item.group;
            const values = (key: string) => { const list = [...new Set(group.items.map((x: any) => String(x?.[key] ?? "").trim()).filter(Boolean))]; return list.length === 1 ? list[0] : list.length > 1 ? "Vários" : ""; };
            const groupDate = group.firstDate === group.lastDate ? formatDate(group.firstDate) : formatDate(group.firstDate) + " a " + formatDate(group.lastDate);
            const row = tonSheet.addRow([groupDate, String(group.count) + " viagens", values("client"), values("origin"), values("destination"), driverScope.name, values("fleetName"), info.label, "", "", "", "", group.freight, "", group.commission, group.after, group.result]);
            row.height = 24;
            row.eachCell((cell: any) => { cell.font = { bold: true, color: { argb: "111111" }, size: 12 }; cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: info.fill } }; cell.alignment = { vertical: "middle", wrapText: false }; cell.border = { top: { style: "thin", color: { argb: info.accent } }, bottom: { style: "thin", color: { argb: info.accent } }, left: { style: "thin", color: { argb: info.accent } }, right: { style: "thin", color: { argb: info.accent } } }; });
            [13, 15, 16, 17].forEach((c) => { row.getCell(c).numFmt = 'R$ #,##0.00'; });
            return;
          }
          const trip = item.trip;
          const freight = Number(trip.freight ?? 0);
          const commission = Number(trip.commissionValue ?? trip.commission ?? 0);
          const dieselCost = Number(trip.dieselCost ?? 0);
          const row = tonSheet.addRow([formatDate(trip.date), String(trip.code ?? "—"), String(trip.client ?? "—"), String(trip.origin ?? "—"), String(trip.destination ?? "—"), String(trip.driverName ?? driverScope.name), String(trip.fleetName ?? "—"), info.label, Number(trip.loadedTons ?? 0), Number(trip.grossWeight ?? 0), Number(trip.netWeight ?? 0), item.mode === "trip" ? Number(trip.pricePerTrip ?? freight) : Number(trip.pricePerTon ?? 0), freight, freight > 0 ? commission / freight : 0, commission, Number(trip.afterCommission ?? (freight - commission)), Number(trip.grossResult ?? (freight - dieselCost))]);
          row.height = 24;
          row.eachCell((cell: any) => { cell.font = { color: { argb: "111111" }, size: 12 }; cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: info.fill } }; cell.alignment = { vertical: "middle", wrapText: false }; cell.border = { top: { style: "thin", color: { argb: info.accent } }, bottom: { style: "thin", color: { argb: info.accent } }, left: { style: "thin", color: { argb: info.accent } }, right: { style: "thin", color: { argb: info.accent } } }; });
          [9, 10, 11].forEach((c) => { row.getCell(c).numFmt = '0.000 "t"'; }); [12, 13, 15, 16, 17].forEach((c) => { row.getCell(c).numFmt = 'R$ #,##0.00'; }); row.getCell(14).numFmt = '0.00%'; row.getCell(8).font = { bold: true, color: { argb: "111111" }, size: 12 };
        });`;
  s = s.slice(0, rowsStart) + combinedRows + s.slice(rowsEnd);
  s = s.replace('"Modalidade",\n          "Peso carregado (t)"', '"Modalidade (tipo de viagem)",\n          "Peso carregado (t)"');
  s = s.replace('tonSheet.getCell("A4").value =\n          "Viagens: " + excelTrips.length +', 'tonSheet.getCell("A4").value =\n          "VIAGENS EM ORDEM DE DATA • Viagens: " + excelTrips.length +');
  s = s.replaceAll('    const buffer = await workbook.xlsx.writeBuffer();', '    workbook.eachSheet((excelSheet: any) => { excelSheet.eachRow({ includeEmpty: true }, (excelRow: any) => { excelRow.eachCell({ includeEmpty: true }, (cell: any) => { cell.font = { ...(cell.font ?? {}), color: { argb: "111111" } }; }); }); });\n    const buffer = await workbook.xlsx.writeBuffer();');
  return s;
});

console.log('[excel-date-mode-style] Excel geral, por motorista e Viagens: ordem por data, cores por modalidade, logo maior e modalidade explícita');
