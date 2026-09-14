import fs from 'node:fs';
import path from 'node:path';

const target = process.argv[2];
if (!target) throw new Error('report-polish-fuelings: target missing');
const repo = process.cwd();

function mustReplace(text, needle, replacement, label) {
  if (text.includes(replacement)) return text;
  if (!text.includes(needle)) throw new Error(`report-polish-fuelings: pattern not found (${label})`);
  return text.replace(needle, replacement);
}

// 1) Painel: trocar o texto visível "Após comissão" por "Total líquido".
{
  const p = path.join(target, 'src/routes/dono/index.tsx');
  let s = fs.readFileSync(p, 'utf8');
  s = s.replaceAll('Após comissões', 'Total líquido');
  s = s.replaceAll('Após comissão', 'Total líquido');
  fs.writeFileSync(p, s);
}

// 2) PDF geral: normalizar a data dos grupos de Caixinha/Cegonha/Por viagem.
// Isso evita intervalos estranhos quando as viagens do mesmo dia possuem timestamp/hora.
{
  const p = path.join(repo, 'render-overrides', 'pdf-export.snippet.ts');
  let s = fs.readFileSync(p, 'utf8');

  if (!s.includes('const reportDateKey = (value: any) => {')) {
    s = mustReplace(
      s,
      '  const compactTrips = (() => {',
      `  const reportDateKey = (value: any) => {\n    const raw = String(value ?? "").trim();\n    if (!raw) return "";\n    const iso = raw.match(/^(\\d{4}-\\d{2}-\\d{2})/);\n    if (iso) return iso[1];\n    const parsed = new Date(raw);\n    if (Number.isNaN(parsed.getTime())) return raw;\n    const y = parsed.getFullYear();\n    const m = String(parsed.getMonth() + 1).padStart(2, "0");\n    const d = String(parsed.getDate()).padStart(2, "0");\n    return \`${'${y}'}-${'${m}'}-${'${d}'}\`;\n  };\n\n  const compactTrips = (() => {`,
      'pdf date helper',
    );
  }

  s = s.replaceAll('firstDate: String(trip.date ?? ""), lastDate: String(trip.date ?? "")', 'firstDate: reportDateKey(trip.date), lastDate: reportDateKey(trip.date)');
  s = s.replaceAll('const date = String(trip.date ?? "");', 'const date = reportDateKey(trip.date);');
  s = s.replaceAll(
    'const dateText = item.firstDate === item.lastDate ? formatDate(item.firstDate) : `${formatDate(item.firstDate)}–${formatDate(item.lastDate)}`;',
    'const dateText = item.firstDate === item.lastDate ? formatDate(item.firstDate) : `${formatDate(item.firstDate)} a ${formatDate(item.lastDate)}`;',
  );

  fs.writeFileSync(p, s);
}

// 3) Excel geral: a coluna Diesel sai da tabela de viagens.
// O custo de diesel continua no resumo, calculado exclusivamente pelos abastecimentos reais.
// Também adicionamos uma tabela de Abastecimentos logo abaixo dos fretes, com motorista resolvido pelo driverId.
{
  const p = path.join(repo, 'render-overrides', 'admin-excel.snippet.ts');
  let s = fs.readFileSync(p, 'utf8');

  s = s.replace(
    '  const headers = ["Ticket", "Data", "Motorista", "Conjunto", "Modalidade", "Peso líquido", "KM", "Faturamento", "Comissão", "Diesel", "Resultado"];',
    '  const headers = ["Ticket", "Data", "Motorista", "Conjunto", "Modalidade", "Peso líquido", "KM", "Faturamento", "Comissão", "Resultado"];',
  );

  s = s.replace(
    '      brl(isSingle ? Number(trip.commissionValue ?? trip.commission ?? 0) : item.commission),\n      brl(isSingle ? Number(trip.dieselCost ?? 0) : item.diesel),\n      brl(isSingle ? Number(trip.grossResult ?? 0) : item.result),',
    '      brl(isSingle ? Number(trip.commissionValue ?? trip.commission ?? 0) : item.commission),\n      brl(isSingle ? Number(trip.grossResult ?? 0) : item.result),',
  );

  s = s.replace('[20, 18, 28, 22, 16, 15, 11, 16, 16, 15, 16]', '[20, 18, 28, 22, 16, 15, 11, 16, 16, 16]');
  s = s.replace('worksheet.autoFilter = { from: "A8", to: `K${Math.max(8, worksheet.rowCount)}` };', 'worksheet.autoFilter = { from: "A8", to: `J${Math.max(8, worksheet.rowCount)}` };');

  s = s.replaceAll('worksheet.mergeCells("D1:K1")', 'worksheet.mergeCells("D1:J1")');
  s = s.replaceAll('worksheet.mergeCells("H2:K2")', 'worksheet.mergeCells("H2:J2")');
  s = s.replaceAll('worksheet.mergeCells("A6:K6")', 'worksheet.mergeCells("A6:J6")');
  s = s.replaceAll('worksheet.mergeCells("A7:K7")', 'worksheet.mergeCells("A7:J7")');

  // Corrige nome do motorista na aba de abastecimentos já existente.
  s = s.replaceAll(
    '      fueling.driverName ?? "Sem motorista informado",',
    '      (data?.drivers ?? []).find((driver: any) => String(driver.id) === String(fueling.driverId ?? ""))?.name ?? fueling.driverName ?? "Sem motorista informado",',
  );

  if (!s.includes('"ABASTECIMENTOS DO PERÍODO"')) {
    const marker = '  const driverSummary = workbook.addWorksheet("Resumo Motoristas", { views: [{ state: "frozen", ySplit: 5 }] });';
    const block = `  worksheet.addRow([]);\n  const fuelingTitleRow = worksheet.addRow(["ABASTECIMENTOS DO PERÍODO"]);\n  worksheet.mergeCells(fuelingTitleRow.number, 1, fuelingTitleRow.number, 10);\n  fuelingTitleRow.height = 24;\n  const fuelingTitleCell = worksheet.getCell(fuelingTitleRow.number, 1);\n  fuelingTitleCell.font = { bold: true, size: 12, color: { argb: white } };\n  fuelingTitleCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: dark } };\n  fuelingTitleCell.alignment = { horizontal: "left", vertical: "middle" };\n\n  const fuelingHeaderRow = worksheet.addRow(["Data", "Motorista", "Conjunto", "Litros", "Preço/L", "Custo total", "KM"]);\n  fuelingHeaderRow.height = 22;\n  fuelingHeaderRow.eachCell((cell: any) => {\n    cell.font = { bold: true, color: { argb: white } };\n    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: blue } };\n    cell.alignment = { horizontal: "center", vertical: "middle" };\n    cell.border = {\n      top: { style: "thin", color: { argb: blue } }, bottom: { style: "thin", color: { argb: blue } },\n      left: { style: "thin", color: { argb: blue } }, right: { style: "thin", color: { argb: blue } },\n    };\n  });\n\n  reportFuelings.forEach((fueling: any, index: number) => {\n    const fuelingDriverName = (data?.drivers ?? []).find(\n      (driver: any) => String(driver.id) === String(fueling.driverId ?? ""),\n    )?.name ?? fueling.driverName ?? "Sem motorista informado";\n    const fuelingFleetName = (data?.fleets ?? []).find(\n      (fleet: any) => String(fleet.id) === String(fueling.fleetId ?? ""),\n    )?.name ?? fueling.fleetName ?? "Conjunto não informado";\n    const fuelingCost = Number(fueling.liters ?? 0) * Number(fueling.pricePerLiter ?? 0);\n    const row = worksheet.addRow([\n      fueling.date ? formatDate(fueling.date) : "—",\n      fuelingDriverName,\n      fuelingFleetName,\n      Number(fueling.liters ?? 0),\n      brl(Number(fueling.pricePerLiter ?? 0)),\n      brl(fuelingCost),\n      Number(fueling.km ?? 0),\n    ]);\n    row.height = 19;\n    row.eachCell((cell: any) => {\n      cell.font = { color: { argb: black }, size: 10 };\n      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: index % 2 === 0 ? white : lightGray } };\n      cell.border = {\n        top: { style: "thin", color: { argb: blue } }, bottom: { style: "thin", color: { argb: blue } },\n        left: { style: "thin", color: { argb: blue } }, right: { style: "thin", color: { argb: blue } },\n      };\n    });\n  });\n\n  const fuelingTotalRow = worksheet.addRow(["TOTAL ABASTECIMENTOS", "", "", "", "", brl(totalDiesel), ""]);\n  fuelingTotalRow.eachCell((cell: any) => {\n    cell.font = { bold: true, color: { argb: white } };\n    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: dark } };\n  });\n\n${marker}`;
    s = mustReplace(s, marker, block, 'fuelings table below trips');
  }

  if (!s.includes('"Resultado"]') || s.includes('"Comissão", "Diesel", "Resultado"]')) {
    throw new Error('report-polish-fuelings: main Excel diesel column was not removed');
  }
  fs.writeFileSync(p, s);
}

console.log('[report-polish-fuelings] Total líquido + PDF date normalization + Excel fuelings table applied');
