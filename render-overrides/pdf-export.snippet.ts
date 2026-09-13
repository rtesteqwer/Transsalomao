export async function downloadDriverReportPdf({
  driverName,
  trips,
  fuelings = [],
  periodLabel,
  sourceLabel,
  reportTitle,
  operatorName,
}: {
  driverName: string;
  trips: ComputedTrip[];
  fuelings?: ReportFueling[];
  periodLabel?: string;
  sourceLabel?: string;
  reportTitle?: string;
  operatorName?: string;
}) {
  const { jsPDF } = await import("jspdf");
  const autoTableModule: any = await import("jspdf-autotable");
  const autoTable: any = autoTableModule.default ?? autoTableModule.autoTable;
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4", compress: true });
  const blue = [0, 140, 255] as [number, number, number];
  const dark = [7, 17, 31] as [number, number, number];
  const black = [17, 17, 17] as [number, number, number];
  const totalCommission = trips.reduce((sum, trip) => sum + Number((trip as any).commissionValue ?? (trip as any).commission ?? 0), 0);
  const totalFreight = trips.reduce((sum, trip) => sum + Number((trip as any).freight ?? 0), 0);
  const totalTons = trips.reduce((sum, trip) => sum + Number((trip as any).netWeight ?? 0), 0);
  const rows = trips.map((trip) => [
    formatDate((trip as any).date),
    String((trip as any).code ?? "—"),
    String((trip as any).fleetName ?? "—"),
    tons(Number((trip as any).netWeight ?? 0)),
    brl(Number((trip as any).freight ?? 0)),
    brl(Number((trip as any).commissionValue ?? (trip as any).commission ?? 0)),
    brl(Number((trip as any).dieselCost ?? 0)),
    brl(Number((trip as any).grossResult ?? 0)),
  ]);

  const drawHeader = () => {
    doc.setFillColor(255, 255, 255);
    doc.rect(0, 0, 297, 24, "F");
    doc.addImage(REPORT_LOGO_JPEG, "JPEG", 7, 3.1, 34, 17.7, undefined, "FAST");
    doc.setTextColor(...black);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(14);
    doc.text(driverName || "Motorista", 45, 9);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(6.8);
    doc.setTextColor(70, 78, 90);
    doc.text(reportTitle || "Relatório operacional por motorista", 45, 13.5);
    doc.text(`${periodLabel || "Período selecionado"}  •  ${sourceLabel || "Gerência"}  •  Operador: ${operatorName || "admin"}`, 45, 17.2);
    doc.setFillColor(...dark);
    doc.roundedRect(218, 3.2, 72, 16.5, 1.4, 1.4, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(6.5);
    doc.setTextColor(255, 255, 255);
    doc.text("COMISSÃO TOTAL", 254, 8, { align: "center" });
    doc.setFontSize(12);
    doc.setTextColor(...blue);
    doc.text(brl(totalCommission), 254, 14.7, { align: "center" });
    doc.setDrawColor(...blue);
    doc.setLineWidth(0.5);
    doc.line(7, 22.3, 290, 22.3);
  };

  autoTable(doc, {
    head: [["Data", "Ticket", "Conjunto", "Peso líquido", "Frete", "Comissão", "Diesel", "Resultado"]],
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
      0: { cellWidth: 20, halign: "center" },
      1: { cellWidth: 15, halign: "center" },
      2: { cellWidth: 58 },
      3: { cellWidth: 25, halign: "right" },
      4: { cellWidth: 34, halign: "right" },
      5: { cellWidth: 34, halign: "right" },
      6: { cellWidth: 34, halign: "right" },
      7: { cellWidth: 34, halign: "right" },
    },
    didDrawPage: drawHeader,
  });

  const pages = doc.getNumberOfPages();
  for (let page = 1; page <= pages; page += 1) {
    doc.setPage(page);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(6.2);
    doc.setTextColor(95, 105, 118);
    doc.text(`Fretes: ${trips.length}  •  Peso: ${tons(totalTons)}  •  Faturamento: ${brl(totalFreight)}`, 7, 205);
    doc.text(`Página ${page}/${pages}`, 290, 205, { align: "right" });
  }

  const blob = doc.output("blob");
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `relatorio-trans-salomao-${normalizeFilename(driverName) || "motorista"}.pdf`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
