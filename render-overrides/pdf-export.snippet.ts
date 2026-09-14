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

  const driverTotals = new Map<string, { name: string; trips: number; billing: number; commission: number }>();
  trips.forEach((trip: any) => {
    const name = String(trip.driverName ?? driverName ?? "Motorista").trim() || "Motorista";
    const key = String(trip.driverId ?? name);
    const current = driverTotals.get(key) ?? { name, trips: 0, billing: 0, commission: 0 };
    current.trips += 1;
    current.billing += Number(trip.freight ?? 0);
    current.commission += Number(trip.commissionValue ?? trip.commission ?? 0);
    driverTotals.set(key, current);
  });

  const rows = trips.map((trip: any) => [
    formatDate(trip.date),
    String(trip.code ?? "—"),
    String(trip.driverName ?? driverName ?? "—"),
    String(trip.fleetName ?? "—"),
    tons(Number(trip.netWeight ?? 0)),
    brl(Number(trip.freight ?? 0)),
    brl(Number(trip.commissionValue ?? trip.commission ?? 0)),
    brl(Number(trip.dieselCost ?? 0)),
    brl(Number(trip.grossResult ?? 0)),
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
    head: [["Data", "Ticket", "Motorista", "Conjunto", "Peso", "Frete", "Comissão", "Diesel", "Resultado"]],
    body: rows,
    startY: 25,
    margin: { top: 25, right: 7, bottom: 9, left: 7 },
    theme: "grid",
    showHead: "everyPage",
    rowPageBreak: "avoid",
    styles: {
      font: "helvetica",
      fontSize: 6.15,
      cellPadding: 0.95,
      textColor: black,
      fillColor: [255, 255, 255],
      lineColor: blue,
      lineWidth: 0.14,
      valign: "middle",
      overflow: "ellipsize",
      minCellHeight: 4.1,
    },
    headStyles: {
      fillColor: dark,
      textColor: [255, 255, 255],
      fontStyle: "bold",
      fontSize: 6.25,
      lineColor: blue,
      lineWidth: 0.18,
      halign: "center",
      minCellHeight: 4.8,
    },
    alternateRowStyles: { fillColor: [255, 255, 255] },
    columnStyles: {
      0: { cellWidth: 18, halign: "center" },
      1: { cellWidth: 13, halign: "center" },
      2: { cellWidth: 42 },
      3: { cellWidth: 47 },
      4: { cellWidth: 22, halign: "right" },
      5: { cellWidth: 32, halign: "right" },
      6: { cellWidth: 32, halign: "right" },
      7: { cellWidth: 32, halign: "right" },
      8: { cellWidth: 32, halign: "right" },
    },
    didDrawPage: drawHeader,
  });

  const commissionRows = Array.from(driverTotals.values())
    .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"))
    .map((item) => [
      item.name,
      String(item.trips),
      brl(item.billing),
      brl(item.commission),
      brl(item.billing - item.commission),
    ]);

  let summaryY = Number((doc as any).lastAutoTable?.finalY ?? 25) + 6;
  if (summaryY > 165) {
    doc.addPage("a4", "landscape");
    summaryY = 29;
  }

  autoTable(doc, {
    head: [["Motorista", "Fretes", "Faturamento", "Comissão", "Faturamento líquido"]],
    body: commissionRows,
    startY: summaryY,
    margin: { top: 25, right: 7, bottom: 9, left: 7 },
    theme: "grid",
    showHead: "everyPage",
    rowPageBreak: "avoid",
    styles: {
      font: "helvetica",
      fontSize: 7,
      cellPadding: 1.2,
      textColor: black,
      fillColor: [255, 255, 255],
      lineColor: blue,
      lineWidth: 0.16,
      overflow: "ellipsize",
    },
    headStyles: {
      fillColor: blue,
      textColor: [255, 255, 255],
      fontStyle: "bold",
      fontSize: 7,
      halign: "center",
      lineColor: dark,
      lineWidth: 0.18,
    },
    columnStyles: {
      0: { cellWidth: 82 },
      1: { cellWidth: 24, halign: "center" },
      2: { cellWidth: 55, halign: "right" },
      3: { cellWidth: 55, halign: "right" },
      4: { cellWidth: 60, halign: "right" },
    },
    didDrawPage: drawHeader,
  });

  const pages = doc.getNumberOfPages();
  for (let page = 1; page <= pages; page += 1) {
    doc.setPage(page);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(6.2);
    doc.setTextColor(95, 105, 118);
    doc.text(
      `Fretes: ${trips.length}  •  Peso: ${tons(totalTons)}  •  Faturamento: ${brl(totalFreight)}  •  Comissão: ${brl(totalCommission)}  •  Líquido: ${brl(totalFreight - totalCommission)}`,
      7,
      205,
    );
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
