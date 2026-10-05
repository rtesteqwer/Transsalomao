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

  const compactStart = s.indexOf('  const compactRows = (() => {');
  if (compactStart < 0) throw new Error("caixinha-report-value-groups: compactRows not found");

  // Chave do grupo: motorista + modalidade + valor unitário da Caixinha.
  const keyStart = s.indexOf('      const key = ', compactStart);
  if (keyStart < 0) throw new Error("caixinha-report-value-groups: PDF group key not found");
  const keyEnd = s.indexOf("\n", keyStart);
  if (keyEnd < 0) throw new Error("caixinha-report-value-groups: PDF group key line end not found");
  const oldKeyLine = s.slice(keyStart, keyEnd);
  if (!oldKeyLine.includes("mode")) throw new Error("caixinha-report-value-groups: unexpected PDF group key");
  const newKeyLines =
    '      const caixinhaUnitValue = mode === "caixinha" ? Number(trip.pricePerTrip ?? trip.freight ?? 0) : 0;\n' +
    '      const key = String(trip.driverId ?? name) + "|" + mode + (mode === "caixinha" ? "|" + caixinhaUnitValue.toFixed(2) : "");';
  s = s.slice(0, keyStart) + newKeyLines + s.slice(keyEnd);
  changes += 1;

  const currentOld = '      const current = grouped.get(key) ?? { mode, name, count: 0, firstDate: reportDateKey(trip.date), lastDate: reportDateKey(trip.date), freight: 0, commission: 0, after: 0 };';
  const currentNew = '      const current = grouped.get(key) ?? { mode, name, unitValue: mode === "caixinha" ? caixinhaUnitValue : null, count: 0, firstDate: reportDateKey(trip.date), lastDate: reportDateKey(trip.date), freight: 0, commission: 0, after: 0 };';
  if (!s.includes(currentOld)) throw new Error("caixinha-report-value-groups: PDF current group not found");
  s = s.replace(currentOld, currentNew);
  changes += 1;

  const groupedOld = '    grouped.forEach((item) => { const dateText = item.firstDate === item.lastDate ? formatDate(item.firstDate) : \`${formatDate(item.firstDate)} a ${formatDate(item.lastDate)}\`; rows.push([dateText, \`${modeLabelCompact(item.mode)} • ${item.count} fretes\`, item.name, \`${item.count} fretes\`, brl(item.freight), brl(item.commission), brl(item.after)]); });';
  const groupedNew = '    grouped.forEach((item) => { const dateText = item.firstDate === item.lastDate ? formatDate(item.firstDate) : \`${formatDate(item.firstDate)} a ${formatDate(item.lastDate)}\`; const unitText = item.mode === "caixinha" ? " • " + brl(Number(item.unitValue ?? 0)) + " cada" : ""; rows.push([dateText, \`${modeLabelCompact(item.mode)}${unitText} • ${item.count} fretes\`, item.name, \`${item.count} fretes${unitText}\`, brl(item.freight), brl(item.commission), brl(item.after)]); });';
  if (!s.includes(groupedOld)) throw new Error("caixinha-report-value-groups: PDF grouped row not found");
  s = s.replace(groupedOld, groupedNew);
  changes += 1;

  // No PDF geral, também explicita o valor quando a linha for Caixinha.
  const rowOld = '    return [formatDate(trip.date), \`${String(trip.code ?? "—")} • ${modeLabelCompact(mode)}\`, String(trip.driverName ?? driverName ?? "—"), details, brl(Number(trip.freight ?? 0)), brl(Number(trip.commissionValue ?? trip.commission ?? 0)), brl(Number(trip.afterCommission ?? (Number(trip.freight ?? 0) - Number(trip.commissionValue ?? trip.commission ?? 0))))];';
  const rowNew = '    return [formatDate(trip.date), \`${String(trip.code ?? "—")} • ${modeLabelCompact(mode)}${mode === "caixinha" ? " • " + brl(Number(trip.pricePerTrip ?? trip.freight ?? 0)) + " cada" : ""}\`, String(trip.driverName ?? driverName ?? "—"), details, brl(Number(trip.freight ?? 0)), brl(Number(trip.commissionValue ?? trip.commission ?? 0)), brl(Number(trip.afterCommission ?? (Number(trip.freight ?? 0) - Number(trip.commissionValue ?? trip.commission ?? 0))))];';
  if (s.includes(rowOld)) {
    s = s.replace(rowOld, rowNew);
    changes += 1;
  }

  // Usa as linhas compactas em PDF geral e individual: tonelada/diária seguem individuais;
  // Cegonha/Caixinha ficam agrupadas, e Caixinha é separada por valor.
  const rowsOld = '  const rows = isGeneralReport ? generalRows : compactRows;';
  if (!s.includes(rowsOld)) throw new Error("caixinha-report-value-groups: PDF rows selector not found");
  s = s.replace(rowsOld, '  const rows = compactRows;');
  changes += 1;

  if (changes < 4) throw new Error("caixinha-report-value-groups: PDF changes incomplete (" + changes + ")");
  return s;
});

console.log("[caixinha-report-value-groups] PDF/Excel: Caixinha agrupada por valor unitário e valor explícito no relatório");
