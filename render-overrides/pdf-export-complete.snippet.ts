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
  const black = [17, 17, 17] as [number, number, number];
  const dark = [30, 30, 30] as [number, number, number];
  const gray = [235, 235, 235] as [number, number, number];
  const white = [255, 255, 255] as [number, number, number];

  const normalize = (value: any) => String(value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase();
  const fuelTypeOf = (f: any) => {
    const value = normalize(f?.fuelType ?? "diesel");
    return value === "arla" ? "arla" : value === "gasolina" ? "gasolina" : "diesel";
  };
  const fuelLabel = (f: any) => fuelTypeOf(f) === "arla" ? "ARLA" : fuelTypeOf(f) === "gasolina" ? "Gasolina" : "Diesel";
  const fuelCost = (f: any) => Number(f?.liters ?? 0) * Number(f?.pricePerLiter ?? 0);
  const modeLabel = (mode: any) => String(mode) === "ton" ? "Por tonelada" : String(mode) === "trip" ? "Por viagem" : String(mode) === "cegonha" ? "Cegonha" : "Caixinha";
  const dateKey = (value: any) => {
    const raw = String(value ?? "").trim();
    const iso = raw.match(/^(\d{4}-\d{2}-\d{2})/);
    return iso?.[1] ?? "";
  };
  const dateRange = (() => {
    const now = new Date();
    const toIso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    const lower = normalize(periodLabel);
    if (lower.includes("este mes")) return [`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`, toIso(now)];
    if (lower.includes("7 dias")) { const d = new Date(now); d.setDate(d.getDate() - 6); return [toIso(d), toIso(now)]; }
    if (lower.includes("30 dias")) { const d = new Date(now); d.setDate(d.getDate() - 29); return [toIso(d), toIso(now)]; }
    const dates = [
      ...trips.map((t: any) => dateKey(t.date)),
      ...fuelings.map((f: any) => dateKey(f.date)),
      ...advances.map((a: any) => dateKey(a.date)),
      ...expenses.map((e: any) => dateKey(e.date)),
    ].filter(Boolean).sort();
    return [dates[0] ?? toIso(now), dates[dates.length - 1] ?? toIso(now)];
  })();
  const exactPeriodLabel = `${formatDate(dateRange[0])} a ${formatDate(dateRange[1])}`;

  const totalFreight = trips.reduce((sum, trip: any) => sum + Number(trip.freight ?? 0), 0);
  const totalCommission = trips.reduce((sum, trip: any) => sum + Number(trip.commissionValue ?? trip.commission ?? 0), 0);
  const totalAdvances = advances.reduce((sum, item: any) => sum + Number(item.amount ?? 0), 0);
  const commissionPayable = totalCommission - totalAdvances;
  const fuelTotal = (type: string) => fuelings.filter((f: any) => fuelTypeOf(f) === type).reduce((sum, f: any) => sum + fuelCost(f), 0);
  const totalDiesel = fuelTotal("diesel");
  const totalArla = fuelTotal("arla");
  const totalGas = fuelTotal("gasolina");
  const totalFuelings = totalDiesel + totalArla + totalGas;

  const drawHeader = () => {
    doc.setFillColor(...white);
    doc.rect(0, 0, 297, 29, "F");
    doc.addImage(REPORT_LOGO_JPEG, "JPEG", 6, 1.5, 58, 27, undefined, "FAST");
    doc.setTextColor(...black);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(14);
    doc.text(reportTitle || "RELATÓRIO GERAL", 153, 8.5, { align: "center" });
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.2);
    doc.text(`Período: ${exactPeriodLabel}`, 153, 13.3, { align: "center" });
    doc.text(`${sourceLabel || "Gerência"} · Operador: ${operatorName || "admin"}`, 153, 17.4, { align: "center" });
    doc.setFontSize(6.7);
    doc.setTextColor(75, 75, 75);
    doc.text("Comissão a pagar = comissão bruta − adiantamentos | Custo diesel = somente abastecimentos classificados como Diesel", 153, 22.0, { align: "center" });
    doc.setDrawColor(...black);
    doc.setLineWidth(0.35);
    doc.line(6, 27.6, 291, 27.6);
  };

  autoTable(doc, {
    head: [["Faturamento total", "Comissão bruta", "Adiantamentos", "Comissão a pagar", "Custo diesel", "ARLA", "Gasolina", "Combustíveis"]],
    body: [[brl(totalFreight), brl(totalCommission), brl(totalAdvances), brl(commissionPayable), brl(totalDiesel), brl(totalArla), brl(totalGas), brl(totalFuelings)]],
    startY: 31,
    margin: { top: 31, right: 6, bottom: 10, left: 6 },
    theme: "grid",
    styles: { font: "helvetica", fontSize: 6.2, cellPadding: 1.05, textColor: black, fillColor: white, lineColor: [150,150,150], lineWidth: 0.12, halign: "center", valign: "middle" },
    headStyles: { fillColor: dark, textColor: white, fontStyle: "bold", fontSize: 6.0, halign: "center" },
    didDrawPage: drawHeader,
  });

  const driverMap = new Map<string, any>();
  const ensureDriver = (id: any, nameValue: any) => {
    const name = String(nameValue ?? driverName ?? "Sem motorista").trim() || "Sem motorista";
    const key = String(id ?? name);
    let item = driverMap.get(key);
    if (!item) { item = { key, id: id ?? null, name, trips: [], fuelings: [], advances: 0 }; driverMap.set(key, item); }
    return item;
  };
  trips.forEach((trip: any) => ensureDriver(trip.driverId, trip.driverName).trips.push(trip));
  fuelings.forEach((f: any) => ensureDriver(f.driverId, f.driverName ?? "Sem motorista").fuelings.push(f));
  advances.forEach((a: any) => { ensureDriver(a.driverId, a.driverName ?? "Sem motorista").advances += Number(a.amount ?? 0); });
  const driverRows = Array.from(driverMap.values()).sort((a: any, b: any) => a.name.localeCompare(b.name, "pt-BR"));

  const ensureSpace = (needed = 22) => {
    let y = Number((doc as any).lastAutoTable?.finalY ?? 31) + 5;
    if (y + needed > 196) { doc.addPage("a4", "landscape"); drawHeader(); y = 32; }
    return y;
  };

  for (const driver of driverRows) {
    const sortedTrips = [...driver.trips].sort((a: any, b: any) => dateKey(a.date).localeCompare(dateKey(b.date)) || String(a.code ?? "").localeCompare(String(b.code ?? ""), "pt-BR", { numeric: true }));
    const driverFreight = sortedTrips.reduce((sum: number, t: any) => sum + Number(t.freight ?? 0), 0);
    const driverCommission = sortedTrips.reduce((sum: number, t: any) => sum + Number(t.commissionValue ?? t.commission ?? 0), 0);
    const driverCommissionPayable = driverCommission - Number(driver.advances ?? 0);
    let y = ensureSpace(28);
    doc.setFont("helvetica", "bold"); doc.setFontSize(10); doc.setTextColor(...black);
    doc.text(driver.name, 7, y);
    doc.setFont("helvetica", "normal"); doc.setFontSize(6.5); doc.setTextColor(80,80,80);
    doc.text(`Faturamento ${brl(driverFreight)} · Comissão bruta ${brl(driverCommission)} · Adiantamentos ${brl(driver.advances)} · Comissão a pagar ${brl(driverCommissionPayable)}`, 7, y + 4.2);

    const tripRows = sortedTrips.map((trip: any) => {
      const isTon = String(trip.freightMode ?? "ton") === "ton";
      return [
        formatDate(trip.date),
        String(trip.code ?? "—"),
        modeLabel(trip.freightMode),
        String(trip.destination ?? "").trim() || "—",
        isTon ? tons(Number(trip.netWeight ?? 0)) : "—",
        isTon ? brl(Number(trip.pricePerTon ?? 0)) : "—",
        brl(Number(trip.freight ?? 0)),
        brl(Number(trip.commissionValue ?? trip.commission ?? 0)),
      ];
    });
    tripRows.push(["TOTAL MOTORISTA", "", "", "", "", "", brl(driverFreight), brl(driverCommission)]);
    autoTable(doc, {
      head: [["Data", "Ticket", "Modalidade", "Descarga", "Toneladas", "Valor/t", "Frete total", "Comissão total"]],
      body: tripRows,
      startY: y + 6,
      margin: { top: 31, right: 6, bottom: 10, left: 6 },
      theme: "grid",
      showHead: "everyPage",
      rowPageBreak: "avoid",
      styles: { font: "helvetica", fontSize: 6.15, cellPadding: 0.9, textColor: black, fillColor: white, lineColor: [170,170,170], lineWidth: 0.11, valign: "middle", overflow: "ellipsize", halign: "center" },
      headStyles: { fillColor: dark, textColor: white, fontStyle: "bold", fontSize: 6.15, halign: "center" },
      columnStyles: { 0:{cellWidth:22},1:{cellWidth:20},2:{cellWidth:29},3:{cellWidth:64,halign:"left"},4:{cellWidth:28},5:{cellWidth:28},6:{cellWidth:40},7:{cellWidth:40} },
      didParseCell: (hook: any) => { if (hook.section === "body" && hook.row.index === tripRows.length - 1) hook.cell.styles.fontStyle = "bold"; },
      didDrawPage: drawHeader,
    });

    if (driver.fuelings.length > 0) {
      y = ensureSpace(24);
      doc.setFont("helvetica", "bold"); doc.setFontSize(8.2); doc.setTextColor(...black); doc.text(`Abastecimentos — ${driver.name}`, 7, y);
      const fuelRows = [...driver.fuelings].sort((a: any,b: any) => dateKey(a.date).localeCompare(dateKey(b.date))).map((f: any) => [
        formatDate(f.date), fuelLabel(f), String(f.station ?? "—") || "—", `${Number(f.liters ?? 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 3 })} L`, brl(Number(f.pricePerLiter ?? 0)), brl(fuelCost(f)),
      ]);
      autoTable(doc, {
        head: [["Data", "Combustível", "Posto", "Litros", "Preço/L", "Custo total"]], body: fuelRows, startY: y + 2,
        margin: { top:31,right:6,bottom:10,left:6 }, theme:"grid", showHead:"everyPage", rowPageBreak:"avoid",
        styles:{font:"helvetica",fontSize:6.2,cellPadding:0.85,textColor:black,fillColor:white,lineColor:[180,180,180],lineWidth:0.1,halign:"center",overflow:"ellipsize"},
        headStyles:{fillColor:gray,textColor:black,fontStyle:"bold",fontSize:6.1},
        columnStyles:{0:{cellWidth:30},1:{cellWidth:38},2:{cellWidth:90,halign:"left"},3:{cellWidth:38},4:{cellWidth:38},5:{cellWidth:48}}, didDrawPage:drawHeader,
      });
    }
  }

  const generalFuelRows = [...fuelings].sort((a: any, b: any) => {
    const an = String(a.driverName ?? "Sem motorista"); const bn = String(b.driverName ?? "Sem motorista");
    return an.localeCompare(bn, "pt-BR") || dateKey(a.date).localeCompare(dateKey(b.date));
  }).map((f: any) => [formatDate(f.date), String(f.driverName ?? "Sem motorista"), fuelLabel(f), String(f.station ?? "—") || "—", `${Number(f.liters ?? 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 3 })} L`, brl(Number(f.pricePerLiter ?? 0)), brl(fuelCost(f))]);
  if (generalFuelRows.length > 0) {
    const y = ensureSpace(25);
    doc.setFont("helvetica", "bold"); doc.setFontSize(9); doc.setTextColor(...black); doc.text("ABASTECIMENTOS GERAIS — DIESEL / ARLA / GASOLINA", 148.5, y, { align:"center" });
    autoTable(doc, {
      head:[["Data","Motorista","Combustível","Posto","Litros","Preço/L","Custo total"]], body:generalFuelRows, startY:y+2,
      margin:{top:31,right:6,bottom:10,left:6},theme:"grid",showHead:"everyPage",rowPageBreak:"avoid",
      styles:{font:"helvetica",fontSize:6.1,cellPadding:0.85,textColor:black,fillColor:white,lineColor:[175,175,175],lineWidth:0.1,halign:"center",overflow:"ellipsize"},
      headStyles:{fillColor:dark,textColor:white,fontStyle:"bold",fontSize:6.0},
      columnStyles:{0:{cellWidth:25},1:{cellWidth:58,halign:"left"},2:{cellWidth:32},3:{cellWidth:62,halign:"left"},4:{cellWidth:30},5:{cellWidth:34},6:{cellWidth:40}},didDrawPage:drawHeader,
    });
  }

  const ordinaryExpenses = expenses.filter((e: any) => normalize(e.category) !== "adiantamento");
  if (ordinaryExpenses.length > 0) {
    const y = ensureSpace(24);
    doc.setFont("helvetica", "bold"); doc.setFontSize(9); doc.setTextColor(...black); doc.text("DESPESAS", 148.5, y, {align:"center"});
    autoTable(doc, {
      head:[["Data","Motorista","Categoria","Descrição","Valor"]], body:ordinaryExpenses.map((e:any)=>[formatDate(e.date),e.driverName??"—",e.category??"—",e.description??"—",brl(Number(e.amount??0))]), startY:y+2,
      margin:{top:31,right:6,bottom:10,left:6},theme:"grid",showHead:"everyPage",rowPageBreak:"avoid",
      styles:{font:"helvetica",fontSize:6.1,cellPadding:0.9,textColor:black,fillColor:white,lineColor:[175,175,175],lineWidth:0.1,halign:"center",overflow:"ellipsize"},
      headStyles:{fillColor:dark,textColor:white,fontStyle:"bold"},columnStyles:{0:{cellWidth:28},1:{cellWidth:62},2:{cellWidth:48},3:{cellWidth:105,halign:"left"},4:{cellWidth:40}},didDrawPage:drawHeader,
    });
  }

  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i += 1) {
    doc.setPage(i); doc.setFont("helvetica", "normal"); doc.setFontSize(6); doc.setTextColor(90,90,90);
    doc.text(`Trans Salomão · ${exactPeriodLabel} · página ${i}/${pageCount}`, 148.5, 205, {align:"center"});
  }
  const safeName = String(driverName || "geral").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-|-$/g, "").toLowerCase();
  doc.save(`relatorio-${safeName || "geral"}-${dateRange[0]}-a-${dateRange[1]}.pdf`);
}
