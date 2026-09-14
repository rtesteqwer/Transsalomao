import fs from 'node:fs';
import path from 'node:path';

const target = process.argv[2];
if (!target) throw new Error('dashboard-excel-simplify: target missing');
const repo = process.cwd();

function write(file, text) { fs.writeFileSync(file, text); }

// PAINEL: remove indicadores solicitados e o bloco completo Frete x diesel.
{
  const p = path.join(target, 'src/routes/dono/index.tsx');
  let s = fs.readFileSync(p, 'utf8');
  const lines = [
    '        <Kpi label="KM total" value={km(kpis.totalKm)} />\n',
    '        <Kpi label="Peso bruto" value={tons(kpis.grossWeight)} />\n',
    '        <Kpi label="Preço médio/L" value={fuelLiters > 0 ? brl(fuelCost / fuelLiters) : "—"} />\n',
    '        <Kpi label="Média KM/L (abastecimentos)" value={kmL(effectiveKpis.avgKmL)} />\n',
  ];
  for (const line of lines) s = s.replace(line, '');

  const chartTitle = '<h2 className="font-display text-xl font-semibold">Frete × diesel</h2>';
  const titleAt = s.indexOf(chartTitle);
  if (titleAt >= 0) {
    const sectionStart = s.lastIndexOf('<section', titleAt);
    const sectionEnd = s.indexOf('</section>', titleAt);
    if (sectionStart < 0 || sectionEnd < 0) throw new Error('dashboard-excel-simplify: Frete x diesel section boundary not found');
    s = s.slice(0, sectionStart) + s.slice(sectionEnd + '</section>'.length);
  }

  for (const forbidden of ['label="KM total"', 'label="Peso bruto"', 'label="Preço médio/L"', 'label="Média KM/L (abastecimentos)"', '>Frete × diesel</h2>']) {
    if (s.includes(forbidden)) throw new Error(`dashboard-excel-simplify: failed to remove ${forbidden}`);
  }
  write(p, s);
}

// EXCEL ADMINISTRATIVO: remove KM, amplia logo/cabecalhos e cria aba de comissoes.
{
  const p = path.join(repo, 'render-overrides', 'admin-excel.snippet.ts');
  let s = fs.readFileSync(p, 'utf8');

  // Remove o banner textual antigo de comissoes da planilha Fretes.
  const commissionBlockStart = s.indexOf('  worksheet.mergeCells("A6:J6");');
  const rowHeightMarker = s.indexOf('  worksheet.getRow(1).height =', commissionBlockStart);
  if (commissionBlockStart >= 0 && rowHeightMarker > commissionBlockStart) {
    s = s.slice(0, commissionBlockStart) + '  // Comissoes por motorista ficam em uma planilha propria.\n\n' + s.slice(rowHeightMarker);
  }

  s = s.replace('workbook.addWorksheet("Fretes", { views: [{ state: "frozen", ySplit: 8 }] })', 'workbook.addWorksheet("Fretes", { views: [{ state: "frozen", ySplit: 6 }] })');
  s = s.replace('  const headerRow = worksheet.getRow(8);', '  const headerRow = worksheet.getRow(6);');
  s = s.replace('worksheet.autoFilter = { from: "A8", to: `J${Math.max(8, worksheet.rowCount)}` };', 'worksheet.autoFilter = { from: "A6", to: `I${Math.max(6, worksheet.rowCount)}` };');

  s = s.replace('  const headers = ["Ticket", "Data", "Motorista", "Conjunto", "Modalidade", "Peso líquido", "KM", "Faturamento", "Comissão", "Resultado"];', '  const headers = ["Ticket", "Data", "Motorista", "Conjunto", "Modalidade", "Peso líquido", "Faturamento", "Comissão", "Resultado"];');
  s = s.replace('      isSingle ? `${integer(Number(trip.kmDriven ?? 0))} km` : "—",\n', '');
  s = s.replace('[20, 18, 28, 22, 16, 15, 11, 16, 16, 16]', '[20, 18, 28, 22, 16, 15, 17, 17, 17]');

  s = s.replaceAll('worksheet.mergeCells("D1:J1")', 'worksheet.mergeCells("D1:I1")');
  s = s.replaceAll('worksheet.mergeCells("H2:J2")', 'worksheet.mergeCells("G2:I2")');
  s = s.replace('worksheet.addImage(logoId, { tl: { col: 0, row: 0 }, ext: { width: 170, height: 88 } });', 'worksheet.addImage(logoId, { tl: { col: 0, row: 0 }, ext: { width: 225, height: 116 } });');
  s = s.replace('worksheet.getCell("D1").font = { bold: true, size: 19, color: { argb: white } };', 'worksheet.getCell("D1").font = { bold: true, size: 23, color: { argb: white } };');
  s = s.replace('worksheet.getCell("D2").font = { bold: true, size: 13, color: { argb: black } };', 'worksheet.getCell("D2").font = { bold: true, size: 15, color: { argb: black } };');
  s = s.replace('worksheet.getCell("H2").value = `COMISSÃO TOTAL: ${brl(totalCommission)}`;', 'worksheet.getCell("G2").value = `COMISSÃO TOTAL: ${brl(totalCommission)}`;');
  s = s.replace('worksheet.getCell("H2").font = { bold: true, size: 13, color: { argb: white } };', 'worksheet.getCell("G2").font = { bold: true, size: 15, color: { argb: white } };');
  s = s.replace('worksheet.getCell("H2").fill = { type: "pattern", pattern: "solid", fgColor: { argb: blue } };', 'worksheet.getCell("G2").fill = { type: "pattern", pattern: "solid", fgColor: { argb: blue } };');
  s = s.replace('worksheet.getCell("H2").alignment = { horizontal: "center", vertical: "middle" };', 'worksheet.getCell("G2").alignment = { horizontal: "center", vertical: "middle" };');
  s = s.replace('worksheet.getRow(1).height = 40;', 'worksheet.getRow(1).height = 54;');
  s = s.replace('worksheet.getRow(2).height = 26;', 'worksheet.getRow(2).height = 32;');
  s = s.replace('worksheet.getRow(6).height = 20;', 'worksheet.getRow(6).height = 28;');
  s = s.replace(/\n  worksheet\.getRow\(7\)\.height = commissionByDriver\.size > 3 \? 36 : 24;/, '');
  s = s.replace('cell.font = { bold: true, color: { argb: white } };\n    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: dark } };', 'cell.font = { bold: true, size: 12, color: { argb: white } };\n    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: dark } };');
  s = s.replace('  headerRow.height = 22;', '  headerRow.height = 28;');

  // Tabela de abastecimentos na aba Fretes: sem KM.
  s = s.replace('const fuelingHeaderRow = worksheet.addRow(["Data", "Motorista", "Conjunto", "Litros", "Preço/L", "Custo total", "KM"]);', 'const fuelingHeaderRow = worksheet.addRow(["Data", "Motorista", "Conjunto", "Litros", "Preço/L", "Custo total"]);');
  s = s.replace('      brl(fuelingCost),\n      Number(fueling.km ?? 0),\n', '      brl(fuelingCost),\n');
  s = s.replace('worksheet.mergeCells(fuelingTitleRow.number, 1, fuelingTitleRow.number, 10);', 'worksheet.mergeCells(fuelingTitleRow.number, 1, fuelingTitleRow.number, 9);');
  s = s.replace('const fuelingTotalRow = worksheet.addRow(["TOTAL ABASTECIMENTOS", "", "", "", "", brl(totalDiesel), ""]);', 'const fuelingTotalRow = worksheet.addRow(["TOTAL ABASTECIMENTOS", "", "", "", "", brl(totalDiesel)]);');

  // Aba Abastecimentos dedicada: remove KM.
  s = s.replace('const fuelHeader = fuelSheet.addRow(["Data", "Motorista", "Conjunto", "Litros", "Preco/L", "Custo total", "KM"]);', 'const fuelHeader = fuelSheet.addRow(["Data", "Motorista", "Conjunto", "Litros", "Preco/L", "Custo total"]);');
  s = s.replace('      brl(cost),\n      Number(fueling.km ?? 0),\n', '      brl(cost),\n');
  s = s.replace('const fuelTotalRow = fuelSheet.addRow(["TOTAL", "", "", "", "", brl(totalDiesel), ""]);', 'const fuelTotalRow = fuelSheet.addRow(["TOTAL", "", "", "", "", brl(totalDiesel)]);');
  s = s.replace('[14, 30, 28, 13, 14, 18, 13].forEach((width, index) => { fuelSheet.getColumn(index + 1).width = width; });', '[14, 32, 30, 14, 15, 19].forEach((width, index) => { fuelSheet.getColumn(index + 1).width = width; });');

  // Amplia cabecalho e logo do Resumo Motoristas.
  s = s.replace('driverSummary.addImage(summaryLogoId, { tl: { col: 0, row: 0 }, ext: { width: 180, height: 93 } });', 'driverSummary.addImage(summaryLogoId, { tl: { col: 0, row: 0 }, ext: { width: 225, height: 116 } });');
  s = s.replace('driverSummary.getCell("D1").font = { bold: true, size: 18, color: { argb: white } };', 'driverSummary.getCell("D1").font = { bold: true, size: 22, color: { argb: white } };');
  s = s.replace('driverSummary.getRow(1).height = 40;', 'driverSummary.getRow(1).height = 54;');
  s = s.replace('driverSummary.getRow(2).height = 30;', 'driverSummary.getRow(2).height = 34;');
  s = s.replace('  driverHeaderRow.height = 22;', '  driverHeaderRow.height = 28;');
  s = s.replace('driverHeaderRow.eachCell((cell: any) => {\n    cell.font = { bold: true, color: { argb: white } };', 'driverHeaderRow.eachCell((cell: any) => {\n    cell.font = { bold: true, size: 12, color: { argb: white } };');

  // Planilha propria de comissoes por motorista.
  const bufferMarker = '  const buffer = await workbook.xlsx.writeBuffer();';
  if (!s.includes('workbook.addWorksheet("Comissões Motoristas"')) {
    const commissionSheet = `  const commissionSheet = workbook.addWorksheet("Comissões Motoristas", { views: [{ state: "frozen", ySplit: 5 }] });\n  const commissionLogoId = workbook.addImage({ base64: REPORT_LOGO_JPEG, extension: "jpeg" });\n  commissionSheet.addImage(commissionLogoId, { tl: { col: 0, row: 0 }, ext: { width: 225, height: 116 } });\n  commissionSheet.mergeCells("D1:F1");\n  commissionSheet.getCell("D1").value = "COMISSÕES POR MOTORISTA";\n  commissionSheet.getCell("D1").font = { bold: true, size: 22, color: { argb: white } };\n  commissionSheet.getCell("D1").fill = { type: "pattern", pattern: "solid", fgColor: { argb: dark } };\n  commissionSheet.getCell("D1").alignment = { horizontal: "center", vertical: "middle" };\n  commissionSheet.getRow(1).height = 54;\n  commissionSheet.getRow(2).height = 32;\n  commissionSheet.getRow(3).height = 8;\n  const commissionHeader = commissionSheet.getRow(5);\n  commissionHeader.values = ["Motorista", "Viagens", "Faturamento", "Comissão bruta", "Adiantamentos", "Comissão a pagar"];\n  commissionHeader.height = 28;\n  commissionHeader.eachCell((cell: any) => {\n    cell.font = { bold: true, size: 12, color: { argb: white } };\n    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: dark } };\n    cell.alignment = { horizontal: "center", vertical: "middle" };\n    cell.border = { top: { style: "thin", color: { argb: blue } }, bottom: { style: "thin", color: { argb: blue } }, left: { style: "thin", color: { argb: blue } }, right: { style: "thin", color: { argb: blue } } };\n  });\n  Array.from(driversMap.values()).forEach((item: any, index: number) => {\n    const driverAdvances = (data?.expenses ?? []).filter((expense: any) => expense.category === "Adiantamento" && item.id && String(expense.driverId ?? "") === String(item.id)).reduce((sum: number, expense: any) => sum + Number(expense.amount ?? 0), 0);\n    const payable = Number(item.commission ?? 0) - driverAdvances;\n    const row = commissionSheet.addRow([item.name, item.trips, brl(item.billing), brl(item.commission), brl(driverAdvances), brl(payable)]);\n    row.height = 21;\n    row.eachCell((cell: any) => {\n      cell.font = { size: 11, color: { argb: black } };\n      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: index % 2 === 0 ? white : lightGray } };\n      cell.border = { top: { style: "thin", color: { argb: blue } }, bottom: { style: "thin", color: { argb: blue } }, left: { style: "thin", color: { argb: blue } }, right: { style: "thin", color: { argb: blue } } };\n    });\n  });\n  [34, 12, 20, 20, 20, 22].forEach((width, index) => { commissionSheet.getColumn(index + 1).width = width; });\n  commissionSheet.autoFilter = { from: "A5", to: \`F${'${Math.max(5, commissionSheet.rowCount)}'}\` };\n\n${bufferMarker}`;
    if (!s.includes(bufferMarker)) throw new Error('dashboard-excel-simplify: Excel buffer marker missing');
    s = s.replace(bufferMarker, commissionSheet);
  }

  if (s.includes('"Peso líquido", "KM", "Faturamento"')) throw new Error('dashboard-excel-simplify: KM remained in admin freight table');
  write(p, s);
}

// EXCEL DO MOTORISTA: remove KM e amplia cabecalhos/logo para manter padrao.
{
  const p = path.join(repo, 'render-overrides', 'driver-excel.snippet.ts');
  let s = fs.readFileSync(p, 'utf8');
  s = s.replace('"Peso líquido", "KM", "Conjunto"', '"Peso líquido", "Conjunto"');
  s = s.replace('      item.km,\n', '');
  s = s.replace('      isSingle ? `${integer(Number(trip.kmDriven ?? 0))} km` : "—",\n', '');
  s = s.replace('[10, 12, 16, 15, 11, 24, 16, 16, 16]', '[12, 14, 18, 16, 26, 18, 18, 18]');
  s = s.replace('worksheet.autoFilter = { from: "A8", to: `I${Math.max(8, worksheet.rowCount)}` };', 'worksheet.autoFilter = { from: "A8", to: `H${Math.max(8, worksheet.rowCount)}` };');
  s = s.replaceAll('worksheet.addImage(logoId, { tl: { col: 0, row: 0 }, ext: { width: 205, height: 106 } });', 'worksheet.addImage(logoId, { tl: { col: 0, row: 0 }, ext: { width: 225, height: 116 } });');
  s = s.replaceAll('summary.addImage(summaryLogoId, { tl: { col: 0, row: 0 }, ext: { width: 205, height: 106 } });', 'summary.addImage(summaryLogoId, { tl: { col: 0, row: 0 }, ext: { width: 225, height: 116 } });');
  s = s.replaceAll('size: 18, color: { argb: white }', 'size: 22, color: { argb: white }');
  s = s.replaceAll('headerRow.height = 22;', 'headerRow.height = 28;');
  s = s.replaceAll('cell.font = { bold: true, color: { argb: white } };', 'cell.font = { bold: true, size: 12, color: { argb: white } };');
  write(p, s);
}

console.log('[dashboard-excel-simplify] Painel simplificado + KM removido do Excel + planilha Comissões Motoristas criada');
