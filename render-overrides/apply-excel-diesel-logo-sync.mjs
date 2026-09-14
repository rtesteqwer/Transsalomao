import fs from 'node:fs';
import path from 'node:path';

const target = process.argv[2];
if (!target) throw new Error('excel-diesel-logo-sync: target missing');
const repo = process.cwd();

function replaceRequired(text, needle, replacement, label) {
  if (text.includes(replacement)) return text;
  if (!text.includes(needle)) throw new Error(`excel-diesel-logo-sync: pattern not found (${label})`);
  return text.replace(needle, replacement);
}

// O Excel administrativo e injetado depois pelo render-build.mjs a partir deste snippet.
// Por isso a correcao e feita no snippet ja processado pelos patches anteriores.
{
  const p = path.join(repo, 'render-overrides', 'admin-excel.snippet.ts');
  let s = fs.readFileSync(p, 'utf8');

  s = replaceRequired(
    s,
    '  const totalDiesel = computed.reduce((sum: number, trip: any) => sum + Number(trip.dieselCost ?? 0), 0);',
    `  // Diesel vem dos abastecimentos reais do periodo, nao do campo legado da viagem.\n  const reportFuelings = fuelings.filter((fueling: any) =>\n    driverFilter === "all" || String(fueling.driverId ?? "") === String(driverFilter),\n  );\n  const totalDiesel = reportFuelings.reduce(\n    (sum: number, fueling: any) => sum + Number(fueling.liters ?? 0) * Number(fueling.pricePerLiter ?? 0),\n    0,\n  );`,
    'real fueling total',
  );

  // A logo ocupa exatamente a altura combinada das duas linhas superiores.
  s = s.replaceAll(
    'worksheet.addImage(logoId, { tl: { col: 0, row: 0 }, ext: { width: 205, height: 106 } });',
    'worksheet.addImage(logoId, { tl: { col: 0, row: 0 }, ext: { width: 170, height: 88 } });',
  );
  s = s.replaceAll(
    'driverSummary.addImage(summaryLogoId, { tl: { col: 0, row: 0 }, ext: { width: 205, height: 106 } });',
    'driverSummary.addImage(summaryLogoId, { tl: { col: 0, row: 0 }, ext: { width: 180, height: 93 } });',
  );
  s = s.replaceAll(
    'worksheet.getCell("D1").alignment = { vertical: "middle", horizontal: "left" };',
    'worksheet.getCell("D1").alignment = { vertical: "middle", horizontal: "center" };',
  );
  s = replaceRequired(
    s,
    '  worksheet.getCell("D2").fill = { type: "pattern", pattern: "solid", fgColor: { argb: white } };',
    '  worksheet.getCell("D2").fill = { type: "pattern", pattern: "solid", fgColor: { argb: white } };\n  worksheet.getCell("D2").alignment = { horizontal: "center", vertical: "middle" };',
    'driver header alignment',
  );
  s = s.replaceAll(
    'worksheet.getCell("H2").alignment = { horizontal: "center" };',
    'worksheet.getCell("H2").alignment = { horizontal: "center", vertical: "middle" };',
  );
  s = replaceRequired(
    s,
    '  driverSummary.getCell("D1").fill = { type: "pattern", pattern: "solid", fgColor: { argb: dark } };',
    '  driverSummary.getCell("D1").fill = { type: "pattern", pattern: "solid", fgColor: { argb: dark } };\n  driverSummary.getCell("D1").alignment = { horizontal: "center", vertical: "middle" };',
    'summary title alignment',
  );
  s = s.replaceAll(
    'driverSummary.getCell("D2").alignment = { wrapText: true, vertical: "middle" };',
    'driverSummary.getCell("D2").alignment = { wrapText: true, vertical: "middle", horizontal: "center" };',
  );

  // Usa o abastecimento real de cada motorista no resumo, sem duplicar diesel por viagem.
  s = replaceRequired(
    s,
    '  Array.from(driversMap.values()).forEach((item: any, index: number) => {',
    `  Array.from(driversMap.values()).forEach((item: any, index: number) => {\n    const driverDiesel = reportFuelings\n      .filter((fueling: any) => item.id && String(fueling.driverId ?? "") === String(item.id))\n      .reduce((sum: number, fueling: any) => sum + Number(fueling.liters ?? 0) * Number(fueling.pricePerLiter ?? 0), 0);`,
    'driver fueling total',
  );
  if (!s.includes('brl(driverDiesel),')) {
    s = replaceRequired(s, '      brl(item.diesel),', '      brl(driverDiesel),', 'driver diesel cell');
  }
  s = s.replaceAll('netBilling - item.diesel - driverExpenses', 'netBilling - driverDiesel - driverExpenses');

  // Deixa a quantidade agrupada totalmente legivel no celular/Excel.
  s = s.replaceAll('`${item.count} viagens`', '`TOTAL: ${item.count} viagens`');
  s = s.replace('[13, 18, 28, 22, 16, 15, 11, 16, 16, 15, 16]', '[20, 18, 28, 22, 16, 15, 11, 16, 16, 15, 16]');

  // Aba auditavel com todos os abastecimentos que compoem o custo de diesel do relatorio.
  const bufferNeedle = '  const buffer = await workbook.xlsx.writeBuffer();';
  if (!s.includes('const fuelSheet = workbook.addWorksheet("Abastecimentos"')) {
    s = replaceRequired(
      s,
      bufferNeedle,
      `  const fuelSheet = workbook.addWorksheet("Abastecimentos", { views: [{ state: "frozen", ySplit: 1 }] });\n  const fuelHeader = fuelSheet.addRow(["Data", "Motorista", "Conjunto", "Litros", "Preco/L", "Custo total", "KM"]);\n  fuelHeader.height = 22;\n  fuelHeader.eachCell((cell: any) => {\n    cell.font = { bold: true, color: { argb: white } };\n    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: dark } };\n    cell.alignment = { horizontal: "center", vertical: "middle" };\n    cell.border = {\n      top: { style: "thin", color: { argb: blue } }, bottom: { style: "thin", color: { argb: blue } },\n      left: { style: "thin", color: { argb: blue } }, right: { style: "thin", color: { argb: blue } },\n    };\n  });\n  reportFuelings.forEach((fueling: any, index: number) => {\n    const cost = Number(fueling.liters ?? 0) * Number(fueling.pricePerLiter ?? 0);\n    const row = fuelSheet.addRow([\n      fueling.date ? formatDate(fueling.date) : "—",\n      fueling.driverName ?? "Sem motorista informado",\n      fueling.fleetName ?? "Conjunto removido",\n      Number(fueling.liters ?? 0),\n      brl(Number(fueling.pricePerLiter ?? 0)),\n      brl(cost),\n      Number(fueling.km ?? 0),\n    ]);\n    row.height = 19;\n    row.eachCell((cell: any) => {\n      cell.font = { color: { argb: black }, size: 10 };\n      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: index % 2 === 0 ? white : lightGray } };\n      cell.border = {\n        top: { style: "thin", color: { argb: blue } }, bottom: { style: "thin", color: { argb: blue } },\n        left: { style: "thin", color: { argb: blue } }, right: { style: "thin", color: { argb: blue } },\n      };\n    });\n  });\n  const fuelTotalRow = fuelSheet.addRow(["TOTAL", "", "", "", "", brl(totalDiesel), ""]);\n  fuelTotalRow.eachCell((cell: any) => {\n    cell.font = { bold: true, color: { argb: white } };\n    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: blue } };\n  });\n  [14, 30, 28, 13, 14, 18, 13].forEach((width, index) => { fuelSheet.getColumn(index + 1).width = width; });\n\n${bufferNeedle}`,
      'fueling detail sheet',
    );
  }

  fs.writeFileSync(p, s);
}

// Mantem todas as telas sempre atualizadas com a mesma fonte de dados.
{
  const p = path.join(target, 'src/lib/use-fleet.ts');
  let s = fs.readFileSync(p, 'utf8');
  if (!s.includes('refetchOnMount: "always"')) {
    s = replaceRequired(
      s,
      '    refetchInterval: 4000,\n    staleTime: 2000,',
      '    refetchInterval: 4000,\n    refetchIntervalInBackground: true,\n    refetchOnMount: "always",\n    refetchOnWindowFocus: "always",\n    staleTime: 1000,',
      'fleet synchronization',
    );
  }
  fs.writeFileSync(p, s);
}

// O contador visual das Caixinhas/Cegonhas deriva diretamente do tamanho do grupo carregado.
{
  const p = path.join(target, 'src/routes/dono/viagens.tsx');
  let s = fs.readFileSync(p, 'utf8');
  s = s.replace(
    '<Badge>{group.count} viagem{group.count === 1 ? "" : "s"}</Badge>',
    '<Badge>{group.items.length} viagem{group.items.length === 1 ? "" : "s"}</Badge>',
  );
  fs.writeFileSync(p, s);
}

console.log('[excel-diesel-logo-sync] diesel from fuelings + aligned logos + live trip synchronization applied');
