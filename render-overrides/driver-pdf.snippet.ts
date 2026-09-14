async function generatePdf(data: any) {
  const { jsPDF } = await import("jspdf");
  const autoTableModule: any = await import("jspdf-autotable");
  const autoTable: any = autoTableModule.default ?? autoTableModule.autoTable;
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4", compress: true });
  const blue = [0, 140, 255] as [number, number, number];
  const dark = [7, 17, 31] as [number, number, number];
  const black = [17, 17, 17] as [number, number, number];
  const netBilling = Number(data.totals.billing ?? 0) - Number(data.totals.commission ?? 0);

  const rows = reportRows(data).map((row: any) => [
    row.date,
    row.ticket,
    row.fleet,
    row.weight,
    row.billing,
    row.commission,
    row.afterCommission,
  ]);

  const drawHeader = () => {
    doc.setFillColor(255, 255, 255);
    doc.rect(0, 0, 297, 24, "F");
    doc.addImage(REPORT_LOGO_JPEG, "JPEG", 7, 3.1, 34, 17.7, undefined, "FAST");
    doc.setTextColor(...black);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(14);
    doc.text(data.driver.name, 45, 9);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(6.8);
    doc.setTextColor(70, 78, 90);
    doc.text(`Relatório operacional do motorista • Comissão cadastrada: ${(Number(data.driver.commissionPct ?? 0) * 100).toFixed(2).replace(".", ",")}%`, 45, 13.5);
    doc.setFillColor(...dark);
    doc.roundedRect(218, 3.2, 72, 16.5, 1.4, 1.4, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(6.5);
    doc.setTextColor(255, 255, 255);
    doc.text("COMISSÃO TOTAL", 254, 8, { align: "center" });
    doc.setFontSize(12);
    doc.setTextColor(...blue);
    doc.text(money(data.totals.commission), 254, 14.7, { align: "center" });
    doc.setDrawColor(...blue);
    doc.setLineWidth(0.5);
    doc.line(7, 22.3, 290, 22.3);
  };

  autoTable(doc, {
    head: [["Data", "Ticket", "Conjunto", "Peso líquido", "Faturamento", "Comissão", "Faturamento líquido"]],
    body: rows,
    startY: 25,
    margin: { top: 25, right: 7, bottom: 8, left: 7 },
    theme: "grid",
    showHead: "everyPage",
    rowPageBreak: "avoid",
    styles: { font: "helvetica", fontSize: 6.6, cellPadding: 1.15, textColor: black, fillColor: [255, 255, 255], lineColor: blue, lineWidth: 0.16, valign: "middle", overflow: "ellipsize", minCellHeight: 4.4 },
    headStyles: { fillColor: dark, textColor: [255, 255, 255], fontStyle: "bold", fontSize: 6.8, lineColor: blue, lineWidth: 0.2, halign: "center", minCellHeight: 5.2 },
    alternateRowStyles: { fillColor: [255, 255, 255] },
    columnStyles: {
      0: { cellWidth: 22, halign: "center" },
      1: { cellWidth: 16, halign: "center" },
      2: { cellWidth: 68 },
      3: { cellWidth: 30, halign: "right" },
      4: { cellWidth: 42, halign: "right" },
      5: { cellWidth: 42, halign: "right" },
      6: { cellWidth: 42, halign: "right" },
    },
    didDrawPage: drawHeader,
  });

  let summaryY = Number((doc as any).lastAutoTable?.finalY ?? 25) + 6;
  if (summaryY > 176) {
    doc.addPage("a4", "landscape");
    summaryY = 29;
  }

  autoTable(doc, {
    head: [["Motorista", "Faturamento", "Comissão", "Faturamento líquido", "Despesas", "Resultado"]],
    body: [[
      data.driver.name,
      money(data.totals.billing),
      money(data.totals.commission),
      money(netBilling),
      money(data.totals.totalExpenses),
      money(data.totals.result),
    ]],
    startY: summaryY,
    margin: { top: 25, right: 7, bottom: 8, left: 7 },
    theme: "grid",
    styles: { font: "helvetica", fontSize: 7, cellPadding: 1.2, textColor: black, fillColor: [255, 255, 255], lineColor: blue, lineWidth: 0.16 },
    headStyles: { fillColor: blue, textColor: [255, 255, 255], fontStyle: "bold", fontSize: 7, halign: "center" },
    columnStyles: {
      0: { cellWidth: 72 },
      1: { cellWidth: 42, halign: "right" },
      2: { cellWidth: 42, halign: "right" },
      3: { cellWidth: 46, halign: "right" },
      4: { cellWidth: 38, halign: "right" },
      5: { cellWidth: 38, halign: "right" },
    },
    didDrawPage: drawHeader,
  });

  const pages = doc.getNumberOfPages();
  for (let page = 1; page <= pages; page += 1) {
    doc.setPage(page);
    doc.setFontSize(6.2);
    doc.setTextColor(95, 105, 118);
    doc.text(`Fretes: ${data.totals.trips}  •  Peso: ${exactTons(data.totals.totalTons)}  •  Faturamento: ${money(data.totals.billing)}  •  Comissão: ${money(data.totals.commission)}  •  Líquido: ${money(netBilling)}`, 7, 205);
    doc.text(`Página ${page}/${pages}`, 290, 205, { align: "right" });
  }

  const blob = doc.output("blob");
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `Relatorio_${safeFileName(data.driver.name)}.pdf`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
