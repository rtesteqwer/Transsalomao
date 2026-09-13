async function downloadColoredExcel(data: any) {
  const ExcelJSModule: any = await import("exceljs");
  const ExcelJS: any = ExcelJSModule.default ?? ExcelJSModule;
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet("Fretes", { views: [{ state: "frozen", ySplit: 5 }] });
  const blue = "008CFF";
  const dark = "07111F";
  const white = "FFFFFF";
  const black = "111111";

  const logoId = workbook.addImage({ base64: REPORT_LOGO_JPEG, extension: "jpeg" });
  worksheet.addImage(logoId, { tl: { col: 0, row: 0 }, ext: { width: 158, height: 82 } });
  worksheet.mergeCells("C1:I1");
  worksheet.getCell("C1").value = "RELATÓRIO DE FRETES";
  worksheet.getCell("C1").font = { bold: true, size: 18, color: { argb: white } };
  worksheet.getCell("C1").fill = { type: "pattern", pattern: "solid", fgColor: { argb: dark } };
  worksheet.mergeCells("C2:F2");
  worksheet.getCell("C2").value = data.driver.name;
  worksheet.getCell("C2").font = { bold: true, size: 13, color: { argb: black } };
  worksheet.mergeCells("G2:I2");
  worksheet.getCell("G2").value = `COMISSÃO TOTAL: ${money(data.totals.commission)}`;
  worksheet.getCell("G2").font = { bold: true, size: 13, color: { argb: blue } };
  worksheet.getCell("G2").fill = { type: "pattern", pattern: "solid", fgColor: { argb: dark } };
  worksheet.getCell("G2").alignment = { horizontal: "center" };
  worksheet.getRow(1).height = 34;
  worksheet.getRow(2).height = 24;
  worksheet.getRow(3).height = 8;

  const headers = ["Ticket", "Data", "Modalidade", "Peso líquido", "KM", "Conjunto", "Faturamento", "Comissão", "Após comissão"];
  const headerRow = worksheet.getRow(5);
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

  reportRows(data).forEach((item: any) => {
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
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: white } };
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
