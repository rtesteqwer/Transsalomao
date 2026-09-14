async function downloadColoredExcel(data: any) {
  const ExcelJSModule: any = await import("exceljs");
  const ExcelJS: any = ExcelJSModule.default ?? ExcelJSModule;
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet("Fretes", { views: [{ state: "frozen", ySplit: 8 }] });
  const blue = "008CFF";
  const dark = "07111F";
  const white = "FFFFFF";
  const black = "111111";
  const lightBlue = "EAF5FF";
  const lightGray = "F7FAFC";

  const logoId = workbook.addImage({ base64: REPORT_LOGO_JPEG, extension: "jpeg" });
  worksheet.addImage(logoId, { tl: { col: 0, row: 0 }, ext: { width: 205, height: 106 } });
  worksheet.mergeCells("D1:I1");
  worksheet.getCell("D1").value = "RELATÓRIO DE FRETES";
  worksheet.getCell("D1").font = { bold: true, size: 18, color: { argb: white } };
  worksheet.getCell("D1").fill = { type: "pattern", pattern: "solid", fgColor: { argb: dark } };
  worksheet.mergeCells("D2:F2");
  worksheet.getCell("D2").value = data.driver.name;
  worksheet.getCell("D2").font = { bold: true, size: 13, color: { argb: black } };
  worksheet.getCell("D2").fill = { type: "pattern", pattern: "solid", fgColor: { argb: white } };
  worksheet.mergeCells("G2:I2");
  worksheet.getCell("G2").value = `COMISSÃO TOTAL: ${money(data.totals.commission)}`;
  worksheet.getCell("G2").font = { bold: true, size: 13, color: { argb: white } };
  worksheet.getCell("G2").fill = { type: "pattern", pattern: "solid", fgColor: { argb: blue } };
  worksheet.getCell("G2").alignment = { horizontal: "center" };

  const summaryItems = [
    ["FATURAMENTO", money(data.totals.billing)],
    ["DESPESAS", money(data.totals.explicitExpenses)],
    ["DIESEL", money(data.totals.fuelExpenses)],
    ["COMISSÃO", money(data.totals.commission)],
    ["RESULTADO", money(data.totals.result)],
  ];
  summaryItems.forEach(([label, value], index) => {
    const startCol = 1 + index * 2;
    const endCol = Math.min(startCol + 1, 9);
    worksheet.mergeCells(4, startCol, 4, endCol);
    worksheet.mergeCells(5, startCol, 5, endCol);
    const labelCell = worksheet.getCell(4, startCol);
    const valueCell = worksheet.getCell(5, startCol);
    labelCell.value = label;
    valueCell.value = value;
    labelCell.font = { bold: true, size: 9, color: { argb: white } };
    labelCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: dark } };
    labelCell.alignment = { horizontal: "center", vertical: "middle" };
    valueCell.font = { bold: true, size: 12, color: { argb: index === 4 ? white : black } };
    valueCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: index === 4 ? blue : lightBlue } };
    valueCell.alignment = { horizontal: "center", vertical: "middle" };
    for (const cell of [labelCell, valueCell]) {
      cell.border = {
        top: { style: "thin", color: { argb: blue } },
        bottom: { style: "thin", color: { argb: blue } },
        left: { style: "thin", color: { argb: blue } },
        right: { style: "thin", color: { argb: blue } },
      };
    }
  });

  worksheet.getRow(1).height = 40;
  worksheet.getRow(2).height = 26;
  worksheet.getRow(3).height = 8;
  worksheet.getRow(4).height = 19;
  worksheet.getRow(5).height = 25;
  worksheet.getRow(6).height = 8;

  const headers = ["Ticket", "Data", "Modalidade", "Peso líquido", "KM", "Conjunto", "Faturamento", "Comissão", "Após comissão"];
  const headerRow = worksheet.getRow(8);
  headerRow.values = headers;
  headerRow.height = 22;
  headerRow.eachCell((cell: any) => {
    cell.font = { bold: true, color: { argb: white } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: dark } };
    cell.alignment = { horizontal: "center", vertical: "middle" };
    cell.border = {
      top: { style: "thin", color: { argb: blue } },
      bottom: { style: "thin", color: { argb: blue } },
      left: { style: "thin", color: { argb: blue } },
      right: { style: "thin", color: { argb: blue } },
    };
  });

  reportRows(data).forEach((item: any, index: number) => {
    const row = worksheet.addRow([
      item.ticket,
      item.date,
      item.mode,
      item.weight,
      item.km,
      item.fleet,
      item.billing,
      item.commission,
      item.afterCommission,
    ]);
    row.height = 19;
    row.eachCell((cell: any) => {
      cell.font = { color: { argb: black }, size: 10 };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: index % 2 === 0 ? white : lightGray } };
      cell.border = {
        top: { style: "thin", color: { argb: blue } },
        bottom: { style: "thin", color: { argb: blue } },
        left: { style: "thin", color: { argb: blue } },
        right: { style: "thin", color: { argb: blue } },
      };
    });
  });

  [10, 12, 16, 15, 11, 24, 16, 16, 16].forEach((width, index) => {
    worksheet.getColumn(index + 1).width = width;
  });
  worksheet.autoFilter = { from: "A8", to: `I${Math.max(8, worksheet.rowCount)}` };

  const summary = workbook.addWorksheet("Resumo", { views: [{ state: "frozen", ySplit: 5 }] });
  const summaryLogoId = workbook.addImage({ base64: REPORT_LOGO_JPEG, extension: "jpeg" });
  summary.addImage(summaryLogoId, { tl: { col: 0, row: 0 }, ext: { width: 205, height: 106 } });
  summary.mergeCells("D1:F1");
  summary.getCell("D1").value = data.driver.name;
  summary.getCell("D1").font = { bold: true, size: 18, color: { argb: white } };
  summary.getCell("D1").fill = { type: "pattern", pattern: "solid", fgColor: { argb: dark } };
  summary.getRow(1).height = 40;
  summary.getRow(2).height = 26;
  summary.getRow(3).height = 8;

  const summaryRows = [
    ["Viagens", String(data.totals.trips)],
    ["Peso líquido total", exactTons(data.totals.totalTons)],
    ["Faturamento total", money(data.totals.billing)],
    ["Comissão total", money(data.totals.commission)],
    ["Despesas lançadas", money(data.totals.explicitExpenses)],
    ["Custo de diesel", money(data.totals.fuelExpenses)],
    ["Total de despesas", money(data.totals.totalExpenses)],
    ["Resultado final", money(data.totals.result)],
  ];
  summaryRows.forEach(([label, value], index) => {
    const row = summary.getRow(5 + index);
    row.values = [label, value];
    row.height = 23;
    row.getCell(1).font = { bold: true, color: { argb: white } };
    row.getCell(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: dark } };
    row.getCell(2).font = { bold: true, color: { argb: index === summaryRows.length - 1 ? white : black } };
    row.getCell(2).fill = { type: "pattern", pattern: "solid", fgColor: { argb: index === summaryRows.length - 1 ? blue : white } };
    [row.getCell(1), row.getCell(2)].forEach((cell: any) => {
      cell.border = {
        top: { style: "thin", color: { argb: blue } },
        bottom: { style: "thin", color: { argb: blue } },
        left: { style: "thin", color: { argb: blue } },
        right: { style: "thin", color: { argb: blue } },
      };
    });
  });
  summary.getColumn(1).width = 30;
  summary.getColumn(2).width = 22;

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `Relatorio_${safeFileName(data.driver.name)}.xlsx`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
