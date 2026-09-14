import fs from 'node:fs';
import path from 'node:path';

const repo = process.cwd();

function patchFile(rel, transform) {
  const file = path.join(repo, rel);
  if (!fs.existsSync(file)) throw new Error(`compact-reports: missing ${rel}`);
  const before = fs.readFileSync(file, 'utf8');
  const after = transform(before);
  if (after === before) throw new Error(`compact-reports: no changes in ${rel}`);
  fs.writeFileSync(file, after);
}

const adminCompactHelper = `  const compactTrips = (() => {
    const fixedModes = new Set(["trip", "cegonha", "caixinha"]);
    const modeLabelCompact = (mode) => mode === "trip" ? "Por viagem" : mode === "cegonha" ? "Cegonha" : mode === "caixinha" ? "Caixinha" : "Por tonelada";
    const individual = [];
    const grouped = new Map();
    trips.forEach((trip) => {
      const mode = String(trip.freightMode ?? "ton");
      if (!fixedModes.has(mode)) {
        individual.push({ kind: "single", trip, mode, count: 1, label: "Por tonelada" });
        return;
      }
      const driverName = String(trip.driverName ?? driverName ?? "Motorista").trim() || "Motorista";
      const driverKey = String(trip.driverId ?? driverName);
      const key = driverKey + "|" + mode;
      const current = grouped.get(key) ?? {
        kind: "group", mode, label: modeLabelCompact(mode), count: 0, driverName,
        firstDate: String(trip.date ?? ""), lastDate: String(trip.date ?? ""), fleets: new Set(),
        freight: 0, commission: 0, diesel: 0, result: 0,
      };
      current.count += 1;
      const date = String(trip.date ?? "");
      if (date && (!current.firstDate || date < current.firstDate)) current.firstDate = date;
      if (date && (!current.lastDate || date > current.lastDate)) current.lastDate = date;
      const fleet = String(trip.fleetName ?? "").trim();
      if (fleet) current.fleets.add(fleet);
      current.freight += Number(trip.freight ?? 0);
      current.commission += Number(trip.commissionValue ?? trip.commission ?? 0);
      current.diesel += Number(trip.dieselCost ?? 0);
      current.result += Number(trip.grossResult ?? 0);
      grouped.set(key, current);
    });
    return [...individual, ...grouped.values()];
  })();`;

patchFile('render-overrides/pdf-export.snippet.ts', (s) => {
  if (s.includes('const compactTrips = (() => {')) return s;
  const rowsPattern = /  const rows = trips\.map\(\(trip: any\) => \[\n[\s\S]*?\n  \]\);/;
  if (!rowsPattern.test(s)) throw new Error('compact-reports: admin PDF rows block not found');
  const rows = `${adminCompactHelper}\n\n  const rows = compactTrips.map((item: any) => {\n    if (item.kind === "single") {\n      const trip = item.trip;\n      return [\n        formatDate(trip.date),\n        String(trip.code ?? "—"),\n        String(trip.driverName ?? driverName ?? "—"),\n        String(trip.fleetName ?? "—"),\n        tons(Number(trip.netWeight ?? 0)),\n        brl(Number(trip.freight ?? 0)),\n        brl(Number(trip.commissionValue ?? trip.commission ?? 0)),\n        brl(Number(trip.dieselCost ?? 0)),\n        brl(Number(trip.grossResult ?? 0)),\n      ];\n    }\n    const dateText = item.firstDate === item.lastDate ? formatDate(item.firstDate) : \`${'${formatDate(item.firstDate)}'}–${'${formatDate(item.lastDate)}'}\`;\n    const fleetText = item.fleets.size === 1 ? Array.from(item.fleets)[0] : item.fleets.size > 1 ? "Vários" : "—";\n    return [\n      dateText,\n      \`${'${item.label}'} · ${'${item.count}'} viagens\`,\n      item.driverName,\n      fleetText,\n      "—",\n      brl(item.freight),\n      brl(item.commission),\n      brl(item.diesel),\n      brl(item.result),\n    ];\n  });`;
  s = s.replace(rowsPattern, rows);
  s = s.replace('head: [["Data", "Ticket", "Motorista", "Conjunto", "Peso", "Frete", "Comissão", "Diesel", "Resultado"]]', 'head: [["Data", "Ticket / modalidade", "Motorista", "Conjunto", "Peso", "Frete", "Comissão", "Diesel", "Resultado"]]');
  s = s.replace('1: { cellWidth: 13, halign: "center" }', '1: { cellWidth: 35, halign: "left" }')
       .replace('2: { cellWidth: 42 }', '2: { cellWidth: 34 }')
       .replace('3: { cellWidth: 47 }', '3: { cellWidth: 36 }');
  return s;
});

patchFile('render-overrides/admin-excel.snippet.ts', (s) => {
  if (s.includes('const compactExcelTrips = (() => {')) return s;
  const loopPattern = /  computed\.forEach\(\(trip: any, index: number\) => \{[\s\S]*?\n  \}\);\n\n  \[10, 12, 28, 22, 16, 15, 11, 16, 16, 15, 16\]/;
  if (!loopPattern.test(s)) throw new Error('compact-reports: admin Excel loop not found');
  const replacement = `  const compactExcelTrips = (() => {\n    const fixedModes = new Set(["trip", "cegonha", "caixinha"]);\n    const single = [];\n    const grouped = new Map();\n    computed.forEach((trip: any) => {\n      const mode = String(trip.freightMode ?? "ton");\n      if (!fixedModes.has(mode)) { single.push({ kind: "single", trip }); return; }\n      const driverName = String(trip.driverName ?? "Sem motorista").trim() || "Sem motorista";\n      const key = String(trip.driverId ?? driverName) + "|" + mode;\n      const current = grouped.get(key) ?? { kind: "group", mode, count: 0, driverName, fleets: new Set<string>(), firstDate: String(trip.date ?? ""), lastDate: String(trip.date ?? ""), billing: 0, commission: 0, diesel: 0, result: 0 };\n      current.count += 1;\n      const date = String(trip.date ?? "");\n      if (date && (!current.firstDate || date < current.firstDate)) current.firstDate = date;\n      if (date && (!current.lastDate || date > current.lastDate)) current.lastDate = date;\n      const fleet = String(trip.fleetName ?? "").trim(); if (fleet) current.fleets.add(fleet);\n      current.billing += Number(trip.freight ?? 0);\n      current.commission += Number(trip.commissionValue ?? trip.commission ?? 0);\n      current.diesel += Number(trip.dieselCost ?? 0);\n      current.result += Number(trip.grossResult ?? 0);\n      grouped.set(key, current);\n    });\n    return [...single, ...grouped.values()];\n  })();\n\n  compactExcelTrips.forEach((item: any, index: number) => {\n    const isSingle = item.kind === "single";\n    const trip = isSingle ? item.trip : null;\n    const fleetText = isSingle ? (trip.fleetName ?? "—") : item.fleets.size === 1 ? Array.from(item.fleets)[0] : item.fleets.size > 1 ? "Vários" : "—";\n    const dateText = isSingle ? (trip.date ? formatDate(trip.date) : "—") : item.firstDate === item.lastDate ? formatDate(item.firstDate) : \`${'${formatDate(item.firstDate)}'}–${'${formatDate(item.lastDate)}'}\`;\n    const row = worksheet.addRow([\n      isSingle ? (trip.code ?? trip.ticket ?? trip.id ?? "—") : \`${'${item.count}'} viagens\`,\n      dateText,\n      isSingle ? (trip.driverName ?? "—") : item.driverName,\n      fleetText,\n      isSingle ? modeLabel(trip.freightMode) : modeLabel(item.mode),\n      isSingle ? tons(Number(trip.netWeight ?? 0)) : "—",\n      isSingle ? \`${'${integer(Number(trip.kmDriven ?? 0))}'} km\` : "—",\n      brl(isSingle ? Number(trip.freight ?? 0) : item.billing),\n      brl(isSingle ? Number(trip.commissionValue ?? trip.commission ?? 0) : item.commission),\n      brl(isSingle ? Number(trip.dieselCost ?? 0) : item.diesel),\n      brl(isSingle ? Number(trip.grossResult ?? 0) : item.result),\n    ]);\n    row.height = 19;\n    row.eachCell((cell: any) => {\n      cell.font = { color: { argb: black }, size: 10 };\n      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: index % 2 === 0 ? white : lightGray } };\n      cell.alignment = { vertical: "middle" };\n      cell.border = { top: { style: "thin", color: { argb: blue } }, bottom: { style: "thin", color: { argb: blue } }, left: { style: "thin", color: { argb: blue } }, right: { style: "thin", color: { argb: blue } } };\n    });\n  });\n\n  [13, 18, 28, 22, 16, 15, 11, 16, 16, 15, 16]`;
  return s.replace(loopPattern, replacement);
});

patchFile('render-overrides/driver-pdf.snippet.ts', (s) => {
  if (s.includes('const compactDriverTrips = (() => {')) return s;
  const rowsPattern = /  const rows = reportRows\(data\)\.map\(\(row: any\) => \[\n[\s\S]*?\n  \]\);/;
  if (!rowsPattern.test(s)) throw new Error('compact-reports: driver PDF rows block not found');
  const replacement = `  const compactDriverTrips = (() => {\n    const fixedModes = new Set(["trip", "cegonha", "caixinha"]);\n    const single: any[] = [];\n    const grouped = new Map<string, any>();\n    data.trips.forEach((trip: any) => {\n      const mode = String(trip.freightMode ?? "ton");\n      if (!fixedModes.has(mode)) { single.push({ kind: "single", trip }); return; }\n      const current = grouped.get(mode) ?? { kind: "group", mode, count: 0, fleets: new Set<string>(), firstDate: String(trip.date ?? ""), lastDate: String(trip.date ?? ""), billing: 0, commission: 0 };\n      current.count += 1;\n      const d = String(trip.date ?? ""); if (d && (!current.firstDate || d < current.firstDate)) current.firstDate = d; if (d && (!current.lastDate || d > current.lastDate)) current.lastDate = d;\n      const fleet = fleetLabel(trip); if (fleet && fleet !== "—") current.fleets.add(fleet);\n      current.billing += Number(trip.freight ?? 0); current.commission += Number(trip.commission ?? 0);\n      grouped.set(mode, current);\n    });\n    return [...single, ...grouped.values()];\n  })();\n\n  const rows = compactDriverTrips.map((item: any) => {\n    if (item.kind === "single") {\n      const trip = item.trip;\n      return [date(trip.date), String(trip.code ?? "—"), fleetLabel(trip), exactTons(Number(trip.netWeight ?? 0)), money(Number(trip.freight ?? 0)), money(Number(trip.commission ?? 0)), money(Number(trip.afterCommission ?? 0))];\n    }\n    const label = modeLabel(item.mode);\n    const dateText = item.firstDate === item.lastDate ? date(item.firstDate) : \`${'${date(item.firstDate)}'}–${'${date(item.lastDate)}'}\`;\n    const fleetText = item.fleets.size === 1 ? Array.from(item.fleets)[0] : item.fleets.size > 1 ? "Vários" : "—";\n    return [dateText, \`${'${label}'} · ${'${item.count}'} viagens\`, fleetText, "—", money(item.billing), money(item.commission), money(item.billing - item.commission)];\n  });`;
  s = s.replace(rowsPattern, replacement);
  s = s.replace('head: [["Data", "Ticket", "Conjunto", "Peso líquido", "Faturamento", "Comissão", "Faturamento líquido"]]', 'head: [["Data", "Ticket / modalidade", "Conjunto", "Peso líquido", "Faturamento", "Comissão", "Faturamento líquido"]]');
  s = s.replace('1: { cellWidth: 16, halign: "center" }', '1: { cellWidth: 42, halign: "left" }')
       .replace('2: { cellWidth: 68 }', '2: { cellWidth: 48 }')
       .replace('3: { cellWidth: 30, halign: "right" }', '3: { cellWidth: 26, halign: "right" }');
  return s;
});

patchFile('render-overrides/driver-excel.snippet.ts', (s) => {
  if (s.includes('const compactDriverExcelTrips = (() => {')) return s;
  const loopPattern = /  reportRows\(data\)\.forEach\(\(item: any, index: number\) => \{[\s\S]*?\n  \}\);\n\n  \[10, 12, 16, 15, 11, 24, 16, 16, 16\]/;
  if (!loopPattern.test(s)) throw new Error('compact-reports: driver Excel loop not found');
  const replacement = `  const compactDriverExcelTrips = (() => {\n    const fixedModes = new Set(["trip", "cegonha", "caixinha"]);\n    const single: any[] = [];\n    const grouped = new Map<string, any>();\n    data.trips.forEach((trip: any) => {\n      const mode = String(trip.freightMode ?? "ton");\n      if (!fixedModes.has(mode)) { single.push({ kind: "single", trip }); return; }\n      const current = grouped.get(mode) ?? { kind: "group", mode, count: 0, fleets: new Set<string>(), firstDate: String(trip.date ?? ""), lastDate: String(trip.date ?? ""), billing: 0, commission: 0 };\n      current.count += 1;\n      const d = String(trip.date ?? ""); if (d && (!current.firstDate || d < current.firstDate)) current.firstDate = d; if (d && (!current.lastDate || d > current.lastDate)) current.lastDate = d;\n      const fleet = fleetLabel(trip); if (fleet && fleet !== "—") current.fleets.add(fleet);\n      current.billing += Number(trip.freight ?? 0); current.commission += Number(trip.commission ?? 0);\n      grouped.set(mode, current);\n    });\n    return [...single, ...grouped.values()];\n  })();\n\n  compactDriverExcelTrips.forEach((entry: any, index: number) => {\n    const isSingle = entry.kind === "single";\n    const trip = isSingle ? entry.trip : null;\n    const fleetText = isSingle ? fleetLabel(trip) : entry.fleets.size === 1 ? Array.from(entry.fleets)[0] : entry.fleets.size > 1 ? "Vários" : "—";\n    const dateText = isSingle ? date(trip.date) : entry.firstDate === entry.lastDate ? date(entry.firstDate) : \`${'${date(entry.firstDate)}'}–${'${date(entry.lastDate)}'}\`;\n    const row = worksheet.addRow([\n      isSingle ? (trip.code || "—") : \`${'${entry.count}'} viagens\`,\n      dateText,\n      isSingle ? modeLabel(trip.freightMode) : modeLabel(entry.mode),\n      isSingle ? exactTons(Number(trip.netWeight ?? 0)) : "—",\n      isSingle ? \`${'${exact(Number(trip.kmRun ?? 0))}'} km\` : "—",\n      fleetText,\n      money(isSingle ? Number(trip.freight ?? 0) : entry.billing),\n      money(isSingle ? Number(trip.commission ?? 0) : entry.commission),\n      money(isSingle ? Number(trip.afterCommission ?? 0) : entry.billing - entry.commission),\n    ]);\n    row.height = 19;\n    row.eachCell((cell: any) => {\n      cell.font = { color: { argb: black }, size: 10 };\n      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: index % 2 === 0 ? white : lightGray } };\n      cell.border = { top: { style: "thin", color: { argb: blue } }, bottom: { style: "thin", color: { argb: blue } }, left: { style: "thin", color: { argb: blue } }, right: { style: "thin", color: { argb: blue } } };\n    });\n  });\n\n  [13, 18, 16, 15, 11, 24, 16, 16, 16]`;
  return s.replace(loopPattern, replacement);
});

console.log('[compact-reports] Por viagem/Cegonha/Caixinha grouped by quantity in PDF and Excel');
