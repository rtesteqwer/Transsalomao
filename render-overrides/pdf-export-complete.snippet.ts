export async function downloadDriverReportPdf({
  driverName,
  trips,
  fuelings = [],
  advances = [],
  expenses = [],
  periodLabel,
  sourceLabel,
  reportTitle,
  operatorName,
}: {
  driverName: string;
  trips: ComputedTrip[];
  fuelings?: ReportFueling[];
  advances?: Array<{ driverId?: string | null; driverName?: string; date: string; amount: number; description?: string }>;
  expenses?: Array<{ driverId?: string | null; driverName?: string; date: string; amount: number; category?: string; description?: string; fleetName?: string; notes?: string }>;
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
  const totalAdvances = advances.reduce((sum, item) => sum + Number(item.amount ?? 0), 0);
  const commissionPayable = totalCommission - totalAdvances;
  const totalFreight = trips.reduce((sum, trip) => sum + Number((trip as any).freight ?? 0), 0);
  const totalTons = trips.reduce((sum, trip) => sum + Number((trip as any).netWeight ?? 0), 0);

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
  advances.forEach((advance) => {
    const name = String(advance.driverName ?? "Motorista").trim() || "Motorista";
    const key = String(advance.driverId ?? name);
    const current = driverTotals.get(key) ?? { name, trips: 0, billing: 0, commission: 0, advances: 0 };
    current.advances += Number(advance.amount ?? 0);
    driverTotals.set(key, current);
  });

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

  const compactTrips = (() => {
    const fixedModes = new Set(["ton", "trip", "cegonha", "caixinha"]);
    const modeLabelCompact = (mode) => mode === "trip" ? "Por viagem" : mode === "cegonha" ? "Cegonha" : mode === "caixinha" ? "Caixinha" : "Por tonelada";
    const individual = [];
    const grouped = new Map();
    trips.forEach((trip) => {
      const mode = String(trip.freightMode ?? "ton");
      if (!fixedModes.has(mode)) {
        individual.push({ kind: "single", trip, mode, count: 1, label: "Por tonelada" });
        return;
      }
      const rowDriverName = String(trip.driverName ?? "Motorista").trim() || "Motorista";
      const driverKey = String(trip.driverId ?? rowDriverName);
      const key = driverKey + "|" + mode;
      const current = grouped.get(key) ?? {
        kind: "group", mode, label: modeLabelCompact(mode), count: 0, driverName: rowDriverName,
        firstDate: reportDateKey(trip.date), lastDate: reportDateKey(trip.date), fleets: new Set(),
        freight: 0, commission: 0, result: 0,
      };
      current.count += 1;
      const date = reportDateKey(trip.date);
      if (date && (!current.firstDate || date < current.firstDate)) current.firstDate = date;
      if (date && (!current.lastDate || date > current.lastDate)) current.lastDate = date;
      const fleet = String(trip.fleetName ?? "").trim();
      if (fleet) current.fleets.add(fleet);
      current.freight += Number(trip.freight ?? 0);
      current.commission += Number(trip.commissionValue ?? trip.commission ?? 0);
      current.result += Number(trip.grossResult ?? 0);
      grouped.set(key, current);
    });
    return [...individual, ...grouped.values()];
  })();

  const rows = compactTrips.map((item: any) => {
    if (item.kind === "single") {
      const trip = item.trip;
      return [
        formatDate(trip.date),
        String(trip.code ?? "—"),
        String(trip.driverName ?? driverName ?? "—"),
        String(trip.fleetName ?? "—"),
        tons(Number(trip.netWeight ?? 0)),
        brl(Number(trip.freight ?? 0)),
        brl(Number(trip.commissionValue ?? trip.commission ?? 0)),
        brl(Number(trip.grossResult ?? 0)),
      ];
    }
    const dateText = item.firstDate === item.lastDate ? formatDate(item.firstDate) : `${formatDate(item.firstDate)} a ${formatDate(item.lastDate)}`;
    const fleetText = item.fleets.size === 1 ? Array.from(item.fleets)[0] : item.fleets.size > 1 ? "Vários" : "—";
    return [
      dateText,
      `${item.label} · ${item.count} viagens`,
      item.driverName,
      fleetText,
      "—",
      brl(item.freight),
      brl(item.commission),
      brl(item.result),
    ];
  });

  const drawHeader = () => {
    doc.setFillColor(255, 255, 255);
    doc.rect(0, 0, 297, 24, "F");
    doc.addImage(REPORT_LOGO_JPEG, "JPEG", 7, 1.7, 42, 21.9, undefined, "FAST");
    doc.setTextColor(...black);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(14);
    doc.text(driverName || "Motorista", 145, 8.7, { align: "center" });
    doc.setFont("helvetica", "normal");
    doc.setFontSize(6.8);
    doc.setTextColor(70, 78, 90);
    doc.text(reportTitle || "Relatório operacional por motorista", 145, 13.2, { align: "center" });
    doc.text(`${periodLabel || "Período selecionado"}  •  ${sourceLabel || "Gerência"}  •  Operador: ${operatorName || "admin"}`, 145, 17.1, { align: "center" });
    doc.setFillColor(...dark);
    doc.roundedRect(218, 3.2, 72, 16.5, 1.4, 1.4, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(6.5);
    doc.setTextColor(255, 255, 255);
    doc.text("COMISSÃO A PAGAR", 254, 8, { align: "center" });
    doc.setFontSize(12);
    doc.setTextColor(...blue);
    doc.text(brl(commissionPayable), 254, 14.7, { align: "center" });
    doc.setDrawColor(...blue);
    doc.setLineWidth(0.5);
    doc.line(7, 22.3, 290, 22.3);
  };

  autoTable(doc, {
    head: [["Data", "Ticket / modalidade", "Motorista", "Conjunto", "Peso", "Frete", "Comissão", "Resultado"]],
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
      halign: "center",
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
      0: { cellWidth: 22 }, 1: { cellWidth: 43 }, 2: { cellWidth: 40 }, 3: { cellWidth: 42 },
      4: { cellWidth: 28 }, 5: { cellWidth: 36 }, 6: { cellWidth: 36 }, 7: { cellWidth: 36 },
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
      brl(item.advances),
      brl(item.commission - item.advances),
      brl(item.billing - item.commission),
    ]);

  let summaryY = Number((doc as any).lastAutoTable?.finalY ?? 25) + 6;
  if (summaryY > 165) {
    doc.addPage("a4", "landscape");
    summaryY = 29;
  }

  autoTable(doc, {
    head: [["Motorista", "Fretes", "Faturamento", "Comissão bruta", "Adiantamentos", "Comissão a pagar", "Faturamento líquido"]],
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
      halign: "center",
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
      0: { cellWidth: 60 },
      1: { cellWidth: 18, halign: "center" },
      2: { cellWidth: 42, halign: "right" },
      3: { cellWidth: 42, halign: "right" },
      4: { cellWidth: 38, halign: "right" },
      5: { cellWidth: 42, halign: "right" },
      6: { cellWidth: 42, halign: "right" },
    },
    didDrawPage: drawHeader,
  });

  const addDetailTable = (title: string, head: string[], body: any[][]) => {
    if (body.length === 0) return;
    let y = Number((doc as any).lastAutoTable?.finalY ?? 25) + 7;
    if (y > 174) { doc.addPage("a4", "landscape"); y = 29; }
    doc.setFont("helvetica", "bold"); doc.setFontSize(9); doc.setTextColor(...dark); doc.text(title, 148.5, y - 2, { align: "center" });
    autoTable(doc, { head: [head], body, startY: y, margin: { top: 25, right: 7, bottom: 9, left: 7 }, theme: "grid", showHead: "everyPage", rowPageBreak: "avoid", styles: { font: "helvetica", fontSize: 6.6, cellPadding: 1.05, textColor: black, fillColor: [255,255,255], lineColor: blue, lineWidth: 0.14, halign: "center", valign: "middle", overflow: "ellipsize" }, headStyles: { fillColor: dark, textColor: [255,255,255], fontStyle: "bold", halign: "center" }, didDrawPage: drawHeader });
  };
  addDetailTable("ABASTECIMENTOS", ["Data", "Motorista", "Conjunto", "Posto", "Litros", "Preço/L", "Custo", "KM"], fuelings.map((f: any) => [formatDate(f.date), f.driverName ?? "Sem motorista", f.fleetName ?? "—", f.station ?? "—", liters(Number(f.liters ?? 0)), brl(Number(f.pricePerLiter ?? 0)), brl(Number(f.liters ?? 0) * Number(f.pricePerLiter ?? 0)), integer(Number(f.km ?? 0))]));
  addDetailTable("ADIANTAMENTOS", ["Data", "Motorista", "Descrição", "Valor"], advances.map((a: any) => [formatDate(a.date), a.driverName ?? "Motorista", a.description ?? "—", brl(Number(a.amount ?? 0))]));
  addDetailTable("DESPESAS", ["Data", "Categoria", "Descrição", "Motorista", "Conjunto", "Valor"], expenses.map((e: any) => [formatDate(e.date), e.category ?? "Despesa", e.description ?? "—", e.driverName ?? "—", e.fleetName ?? "—", brl(Number(e.amount ?? 0))]));

  const pages = doc.getNumberOfPages();
  for (let page = 1; page <= pages; page += 1) {
    doc.setPage(page);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(6.2);
    doc.setTextColor(95, 105, 118);
    doc.text(
      `Fretes: ${trips.length}  •  Faturamento: ${brl(totalFreight)}  •  Comissão bruta: ${brl(totalCommission)}  •  Adiantamentos: ${brl(totalAdvances)}  •  Comissão a pagar: ${brl(commissionPayable)}`,
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
