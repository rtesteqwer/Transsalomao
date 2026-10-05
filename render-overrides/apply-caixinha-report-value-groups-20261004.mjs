import fs from "node:fs";
import path from "node:path";

const target = path.resolve(process.argv[2] || "");
if (!process.argv[2] || !fs.existsSync(path.join(target, "src"))) {
  throw new Error("caixinha-report-value-groups: target missing");
}

const patchFile = (rel, transform) => {
  const file = path.join(target, rel);
  if (!fs.existsSync(file)) throw new Error("caixinha-report-value-groups: missing " + rel);
  const before = fs.readFileSync(file, "utf8");
  const after = transform(before);
  if (after === before) throw new Error("caixinha-report-value-groups: no changes in " + rel);
  fs.writeFileSync(file, after);
};

patchFile("src/lib/excel-report.ts", (input) => {
  let s = input;
  let changes = 0;
  const rep = (before, after) => {
    if (s.includes(before)) {
      s = s.replace(before, after);
      changes += 1;
    }
  };

  // Planilha geral: Cegonha continua agrupada pela modalidade.
  // Caixinha passa a ser agrupada por motorista + valor unitário.
  rep(
    '        const key = [trip.driverId, mode].map((x) => String(x ?? "")).join("|");\n        const item = excelSpecial.get(key) ?? { kind: "group", mode, date, firstDate: date, lastDate: date, driverName: trip.driverName, items: [], count: 0, freight: 0, commission: 0, after: 0, result: 0 };',
    '        const caixinhaUnitValue = mode === "caixinha" ? Number(trip.pricePerTrip ?? trip.freight ?? 0) : 0;\n        const key = [trip.driverId, mode, mode === "caixinha" ? caixinhaUnitValue.toFixed(2) : ""].map((x) => String(x ?? "")).join("|");\n        const item = excelSpecial.get(key) ?? { kind: "group", mode, date, firstDate: date, lastDate: date, driverName: trip.driverName, unitValue: mode === "caixinha" ? caixinhaUnitValue : null, items: [], count: 0, freight: 0, commission: 0, after: 0, result: 0 };'
  );

  rep(
    'const row = sheet.addRow(grouped ? [groupDate, item.count + " viagens", item.driverName ?? "Sem motorista", info.label, item.count,',
    'const row = sheet.addRow(grouped ? [groupDate, item.count + " viagens" + (item.mode === "caixinha" ? " · " + brl(Number(item.unitValue ?? 0)) + " cada" : ""), item.driverName ?? "Sem motorista", info.label + (item.mode === "caixinha" ? " · " + brl(Number(item.unitValue ?? 0)) + " cada" : ""), item.count,'
  );

  // Excel individual do motorista: separa Caixinha por preço e mostra o preço na coluna própria.
  rep(
    '        const key = mode;\n        const group = groupedModeMap.get(key) ?? { mode, date, firstDate: date, lastDate: date, items: [], count: 0, freight: 0, commission: 0, after: 0, result: 0 };',
    '        const caixinhaUnitValue = mode === "caixinha" ? Number(trip.pricePerTrip ?? trip.freight ?? 0) : 0;\n        const key = mode + (mode === "caixinha" ? "|" + caixinhaUnitValue.toFixed(2) : "");\n        const group = groupedModeMap.get(key) ?? { mode, date, firstDate: date, lastDate: date, unitValue: mode === "caixinha" ? caixinhaUnitValue : null, items: [], count: 0, freight: 0, commission: 0, after: 0, result: 0 };'
  );

  rep(
    '"Peso carregado (t)", "Peso bruto (t)", "Peso líquido (t)", "Preço/t ou diária",',
    '"Peso carregado (t)", "Peso bruto (t)", "Peso líquido (t)", "Preço/t, diária ou caixinha",'
  );

  rep(
    'const row = tonSheet.addRow([groupDate, String(group.count) + " viagens", driverScope.name, values("fleetName"), info.label, "", "", "", "", group.freight, "", group.commission, group.after, group.result]);',
    'const row = tonSheet.addRow([groupDate, String(group.count) + " viagens" + (group.mode === "caixinha" ? " · " + brl(Number(group.unitValue ?? 0)) + " cada" : ""), driverScope.name, values("fleetName"), info.label + (group.mode === "caixinha" ? " · " + brl(Number(group.unitValue ?? 0)) + " cada" : ""), "", "", "", group.mode === "caixinha" ? Number(group.unitValue ?? 0) : "", group.freight, "", group.commission, group.after, group.result]);'
  );

  // Compatibilidade com a versão de 17 colunas usada em snapshots antigos.
  rep(
    'const row = tonSheet.addRow([groupDate, String(group.count) + " viagens", values("client"), values("origin"), values("destination"), driverScope.name, values("fleetName"), info.label, "", "", "", "", group.freight, "", group.commission, group.after, group.result]);',
    'const row = tonSheet.addRow([groupDate, String(group.count) + " viagens" + (group.mode === "caixinha" ? " · " + brl(Number(group.unitValue ?? 0)) + " cada" : ""), values("client"), values("origin"), values("destination"), driverScope.name, values("fleetName"), info.label + (group.mode === "caixinha" ? " · " + brl(Number(group.unitValue ?? 0)) + " cada" : ""), "", "", "", group.mode === "caixinha" ? Number(group.unitValue ?? 0) : "", group.freight, "", group.commission, group.after, group.result]);'
  );

  if (changes < 3) throw new Error("caixinha-report-value-groups: Excel markers incomplete (" + changes + ")");
  if (!s.includes('mode === "caixinha" ? caixinhaUnitValue.toFixed(2)')) throw new Error("caixinha-report-value-groups: Excel value key missing");
  return s;
});

patchFile("src/lib/pdf.ts", (input) => {
  let s = input;
  let changes = 0;
  const rep = (before, after) => {
    if (s.includes(before)) {
      s = s.replace(before, after);
      changes += 1;
    }
  };

  // PDF completo: grupos por motorista/modalidade também recebem o preço da Caixinha na chave.
  rep(
    '      const key = driverKey + "|" + mode;\n      const current = grouped.get(key) ?? {\n        kind: "group", mode, label: modeLabelCompact(mode), count: 0, driverName: rowDriverName,',
    '      const caixinhaUnitValue = mode === "caixinha" ? Number(trip.pricePerTrip ?? trip.freight ?? 0) : 0;\n      const key = driverKey + "|" + mode + (mode === "caixinha" ? "|" + caixinhaUnitValue.toFixed(2) : "");\n      const current = grouped.get(key) ?? {\n        kind: "group", mode, label: modeLabelCompact(mode), count: 0, driverName: rowDriverName, unitValue: mode === "caixinha" ? caixinhaUnitValue : null,'
  );

  rep(
    '${item.label} · ${item.count} viagens',
    '${item.label}${item.mode === "caixinha" ? " · " + brl(Number(item.unitValue ?? 0)) + " cada" : ""} · ${item.count} viagens'
  );

  // PDF do motorista em snapshots que agrupam Cegonha/Caixinha diretamente por modalidade.
  rep(
    '      const current = grouped.get(mode) ?? { kind: "group", mode, count: 0, fleets: new Set<string>(), firstDate: String(trip.date ?? ""), lastDate: String(trip.date ?? ""), billing: 0, commission: 0 };',
    '      const caixinhaUnitValue = mode === "caixinha" ? Number(trip.pricePerTrip ?? trip.freight ?? 0) : 0;\n      const groupKey = mode + (mode === "caixinha" ? "|" + caixinhaUnitValue.toFixed(2) : "");\n      const current = grouped.get(groupKey) ?? { kind: "group", mode, unitValue: mode === "caixinha" ? caixinhaUnitValue : null, count: 0, fleets: new Set<string>(), firstDate: String(trip.date ?? ""), lastDate: String(trip.date ?? ""), billing: 0, commission: 0 };'
  );
  rep('      grouped.set(mode, current);', '      grouped.set(groupKey, current);');
  rep(
    '${label} · ${item.count} viagens',
    '${label}${item.mode === "caixinha" ? " · " + brl(Number(item.unitValue ?? 0)) + " cada" : ""} · ${item.count} viagens'
  );

  // Outra forma usada pelo PDF final: Map por key=mode.
  rep(
    '    const key = mode;\n    const group = grouped.get(key) ?? {',
    '    const caixinhaUnitValue = mode === "caixinha" ? Number(trip.pricePerTrip ?? trip.freight ?? 0) : 0;\n    const key = mode + (mode === "caixinha" ? "|" + caixinhaUnitValue.toFixed(2) : "");\n    const group = grouped.get(key) ?? {'
  );
  rep(
    'kind: "group", mode, count: 0,',
    'kind: "group", mode, unitValue: mode === "caixinha" ? caixinhaUnitValue : null, count: 0,'
  );

  if (changes < 2) throw new Error("caixinha-report-value-groups: PDF markers incomplete (" + changes + ")");
  if (!s.includes('mode === "caixinha"') || !s.includes("unitValue")) throw new Error("caixinha-report-value-groups: PDF value grouping missing");
  return s;
});

console.log("[caixinha-report-value-groups] PDF/Excel: Caixinha agrupada por valor unitário e valor explícito no relatório");
