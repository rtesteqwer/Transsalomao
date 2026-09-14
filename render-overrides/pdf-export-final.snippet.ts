export async function downloadDriverReportPdf({
  driverName,
  trips,
  fuelings = [],
  advances = [],
  periodLabel,
  sourceLabel,
  reportTitle,
  operatorName,
}: {
  driverName: string;
  trips: ComputedTrip[];
  fuelings?: ReportFueling[];
  advances?: Array<{ driverId: string; driverName?: string; date: string; amount: number; description?: string }>;
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
  const muted = [95, 105, 118] as [number, number, number];

  const reportDateKey = (value: any) => {
    const raw = String(value ?? "").trim();
    if (!raw) return "";
    const iso = raw.match(/^(\d{4}-\d{2}-\d{2})/);
    if (iso) return iso[1];
    const parsed = new Date(raw);
    if (Number.isNaN(parsed.getTime())) return raw;
    const y = parsed.getFullYear();
    const m = String(parsed.getMonth() + 1).padStart(2, "0");
    const d = String(parsed.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  };

  const totalCommission = trips.reduce((sum, trip) => sum + Number((trip as any).commissionValue ?? (trip as any).commission ?? 0), 0);
  const totalFreight = trips.reduce((sum, trip) => sum + Number((trip as any).freight ?? 0), 0);
  const totalTons = trips.reduce((sum, trip) => sum + Number((trip as any).netWeight ?? 0), 0);
  const totalAdvances = advances.reduce((sum, item) => sum + Number(item.amount ?? 0), 0);
  const totalFuel = fuelings.reduce((sum: number, item: any) => sum + Number(item.liters ?? 0) * Number(item.pricePerLiter ?? 0), 0);

  const driverTotals = new Map<string, { name: string; trips: number; billing: number; commission: number; advances: number }>();
  trips.forEach((trip: any) => {
    const name = String(trip.driverName ?? driverName ?? "Motorista").trim() || "Motorista";
    const key = String(trip.driverId ?? name);
    const current = driverTotals.get(key) ?? { name, trips: 0, billing: 0, commission: 0, advances: 0 };
    current.trips += 1;
    current.billing += Number(trip.freight ?? 0);
    current.commission += Number(trip.commissionValue ?? trip.commission ?? 0);
    driverTotals.set(key, current);
  });
  advances.forEach((item: any) => {
    const key = String(item.driverId ?? item.driverName ?? "Motorista");
    const current = driverTotals.get(key) ?? { name: item.driverName ?? "Motorista", trips: 0, billing: 0, commission: 0, advances: 0 };
    current.advances += Number(item.amount ?? 0);
    driverTotals.set(key, current);
  });

  const fixedModes = new Set(["trip", "cegonha", "caixinha"]);
  const singles: any[] = [];
  const grouped = new Map<string, any>();
  trips.forEach((trip: any) => {
    const mode = String(trip.freightMode ?? "ton");
    if (!fixedModes.has(mode)) {
      singles.push({ kind: "single", trip });
      return;
    }
    const name = String(trip.driverName ?? driverName ?? "Motorista").trim() || "Motorista";
    const key = `${String(trip.driverId ?? name)}|${mode}`;
    const date = reportDateKey(trip.date);
    const current = grouped.get(key) ?? {
      kind: "group",
      mode,
      driverName: name,
      count: 0,
      firstDate: date,
      lastDate: date,
      fleets: new Set<string>(),
      freight: 0,
      commission: 0,
    };
    current.count += 1;
    if (date && (!current.firstDate || date < current.firstDate)) current.firstDate = date;
    if (date && (!current.lastDate || date > current.lastDate)) current.lastDate = date;
    if (trip.fleetName) current.fleets.add(String(trip.fleetName));
    current.freight += Number(trip.freight ?? 0);
    current.commission += Number(trip.commissionValue ?? trip.commission ?? 0);
    grouped.set(key, current);
  });

  const modeLabel = (mode: string) => mode === "trip" ? "Por viagem" : mode === "cegonha" ? "Cegonha" : mode === "caixinha" ? "Caixinha" : "Por tonelada";
  const tripRows = [...singles, ...grouped.values()].map((item: any) => {
    if (item.kind === "single") {
      const trip = item.trip;
      const commission = Number(trip.commissionValue ?? trip.commission ?? 0);
      return [
        formatDate(reportDateKey(trip.date)),
        String(trip.code ?? "—"),
        String(trip.driverName ?? driverName ?? "—"),
        String(trip.fleetName ?? "—"),
        tons(Number(trip.netWeight ?? 0)),
        brl(Number(trip.freight ?? 0)),
        brl(commission),
        brl(Number(trip.freight ?? 0) - commission),
      ];
    }
    const dateText = item.firstDate === item.lastDate ? formatDate(item.firstDate) : `${formatDate(item.firstDate)} a ${formatDate(item.lastDate)}`;
    const fleetText = item.fleets.size === 1 ? Array.from(item.fleets)[0] : item.fleets.size > 1 ? "Vários" : "—";
    return [
      dateText,
      `${modeLabel(item.mode)} · ${item.count} viagens`,
      item.driverName,
      fleetText,
      "—",
      brl(item.freight),
      brl(item.commission),
      brl(item.freight - item.commission),
    ];
  });

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
    doc.text(reportTitle || "Relatório operacional", 45, 13.5);
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
    head: [["Data", "Ticket / modalidade", "Motorista", "Conjunto", "Peso", "Faturamento", "Comissão", "Total líquido"]],
    body: tripRows.length ? tripRows : [["—", "Nenhuma viagem no período", "—", "—", "—", brl(0), brl(0), brl(0)]],
    startY: 25,
    margin: { top: 25, right: 7, bottom: 10, left: 7 },
    theme: "grid",
    showHead: "everyPage",
    rowPageBreak: "avoid",
    styles: { font: "helvetica", fontSize: 6.1, cellPadding: 0.95, textColor: black, fillColor: [255, 255, 255], lineColor: blue, lineWidth: 0.14, valign: "middle", overflow: "ellipsize", minCellHeight: 4.2 },
    headStyles: { fillColor: dark, textColor: [255, 255, 255], fontStyle: "bold", fontSize: 6.2, lineColor: blue, lineWidth: 0.18, halign: "center", minCellHeight: 4.8 },
    columnStyles: {
      0: { cellWidth: 20, halign: "center" },
      1: { cellWidth: 43 },
      2: { cellWidth: 42 },
      3: { cellWidth: 45 },
      4: { cellWidth: 24, halign: "right" },
      5: { cellWidth: 34, halign: "right" },
      6: { cellWidth: 34, halign: "right" },
      7: { cellWidth: 34, halign: "right" },
    },
    didDrawPage: drawHeader,
  });

  const commissionRows = Array.from(driverTotals.values())
    .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"))
    .map((item) => [item.name, String(item.trips), brl(item.billing), brl(item.commission), brl(item.advances), brl(item.commission - item.advances)]);

  autoTable(doc, {
    head: [["Motorista", "Viagens", "Faturamento", "Comissão bruta", "Adiantamentos", "Comissão a pagar"]],
    body: commissionRows.length ? commissionRows : [["Sem motoristas", "0", brl(0), brl(0), brl(0), brl(0)]],
    startY: Number((doc as any).lastAutoTable?.finalY ?? 25) + 6,
    margin: { top: 25, right: 7, bottom: 10, left: 7 },
    theme: "grid",
    showHead: "everyPage",
    rowPageBreak: "avoid",
    styles: { font: "helvetica", fontSize: 6.8, cellPadding: 1.1, textColor: black, fillColor: [255, 255, 255], lineColor: blue, lineWidth: 0.15, overflow: "ellipsize" },
    headStyles: { fillColor: blue, textColor: [255, 255, 255], fontStyle: "bold", fontSize: 6.8, halign: "center", lineColor: dark, lineWidth: 0.18 },
    didDrawPage: drawHeader,
  });

  const fuelingRows = fuelings.map((fueling: any) => {
    const litersValue = Number(fueling.liters ?? 0);
    const priceValue = Number(fueling.pricePerLiter ?? 0);
    const relatedTrip = trips.find((trip: any) => String(trip.driverId ?? "") === String(fueling.driverId ?? "") || String(trip.fleetId ?? "") === String(fueling.fleetId ?? "")) as any;
    return [
      fueling.date ? formatDate(reportDateKey(fueling.date)) : "—",
      String(fueling.driverName ?? relatedTrip?.driverName ?? "Sem motorista informado"),
      String(fueling.fleetName ?? relatedTrip?.fleetName ?? "Conjunto não informado"),
      `${litersValue.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} L`,
      brl(priceValue),
      brl(litersValue * priceValue),
    ];
  });

  autoTable(doc, {
    head: [["ABASTECIMENTOS — Data", "Motorista", "Conjunto", "Litros", "Preço/L", "Custo total"]],
    body: fuelingRows.length ? fuelingRows : [["—", "Nenhum abastecimento no período", "—", "—", "—", brl(0)]],
    startY: Number((doc as any).lastAutoTable?.finalY ?? 25) + 6,
    margin: { top: 25, right: 7, bottom: 10, left: 7 },
    theme: "grid",
    showHead: "everyPage",
    rowPageBreak: "avoid",
    styles: { font: "helvetica", fontSize: 6.8, cellPadding: 1.1, textColor: black, fillColor: [255, 255, 255], lineColor: blue, lineWidth: 0.15, overflow: "ellipsize" },
    headStyles: { fillColor: dark, textColor: [255, 255, 255], fontStyle: "bold", fontSize: 7, halign: "center", lineColor: blue, lineWidth: 0.18 },
    didDrawPage: drawHeader,
  });

  const advanceRows = advances.map((item: any) => [
    item.date ? formatDate(reportDateKey(item.date)) : "—",
    String(item.driverName ?? "Motorista"),
    String(item.description ?? "Adiantamento"),
    brl(Number(item.amount ?? 0)),
  ]);
  autoTable(doc, {
    head: [["ADIANTAMENTOS — Data", "Motorista", "Descrição", "Valor"]],
    body: advanceRows.length ? advanceRows : [["—", "Nenhum adiantamento no período", "—", brl(0)]],
    startY: Number((doc as any).lastAutoTable?.finalY ?? 25) + 6,
    margin: { top: 25, right: 7, bottom: 10, left: 7 },
    theme: "grid",
    showHead: "everyPage",
    rowPageBreak: "avoid",
    styles: { font: "helvetica", fontSize: 6.8, cellPadding: 1.1, textColor: black, fillColor: [255, 255, 255], lineColor: blue, lineWidth: 0.15, overflow: "ellipsize" },
    headStyles: { fillColor: blue, textColor: [255, 255, 255], fontStyle: "bold", fontSize: 7, halign: "center", lineColor: dark, lineWidth: 0.18 },
    didDrawPage: drawHeader,
  });

  const pages = doc.getNumberOfPages();
  for (let page = 1; page <= pages; page += 1) {
    doc.setPage(page);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(6.2);
    doc.setTextColor(...muted);
    doc.text(
      `Viagens: ${trips.length}  •  Peso: ${tons(totalTons)}  •  Faturamento: ${brl(totalFreight)}  •  Comissão: ${brl(totalCommission)}  •  Adiantamentos: ${brl(totalAdvances)}  •  Diesel: ${brl(totalFuel)}`,
      7,
      205,
    );
    doc.text(`Página ${page}/${pages}`, 290, 205, { align: "right" });
  }

  const blob = doc.output("blob");
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `relatorio-trans-salomao-${normalizeFilename(driverName) || "geral"}.pdf`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}