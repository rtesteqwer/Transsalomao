async function exportPainelGeralPdf() {
  try {
    if (!data) {
      window.alert("Os dados do Painel Geral ainda não foram carregados.");
      return;
    }

    const reportTrips = computed.filter((trip: any) =>
      driverFilter === "all" || String(trip.driverId ?? "") === String(driverFilter),
    );
    const reportFuelings = fuelings.filter((fueling: any) =>
      driverFilter === "all" || String(fueling.driverId ?? "") === String(driverFilter),
    );

    const totalBilling = reportTrips.reduce(
      (sum: number, trip: any) => sum + Number(trip.freight ?? 0),
      0,
    );
    const totalCommission = reportTrips.reduce(
      (sum: number, trip: any) =>
        sum + Number(trip.commissionValue ?? trip.commission ?? 0),
      0,
    );
    const totalDiesel = reportFuelings.reduce(
      (sum: number, fueling: any) =>
        sum + Number(fueling.liters ?? 0) * Number(fueling.pricePerLiter ?? 0),
      0,
    );
    const totalNet = totalBilling - totalCommission - totalDiesel;
    const totalNetWeight = reportTrips.reduce(
      (sum: number, trip: any) => sum + Number(trip.netWeight ?? 0),
      0,
    );
    const averageTicket = reportTrips.length > 0 ? totalBilling / reportTrips.length : 0;
    const selectedDriver =
      driverFilter === "all"
        ? "Todos os motoristas"
        : data.drivers.find((driver: any) => String(driver.id) === String(driverFilter))?.name ??
          "Motorista";

    const jsPDFModule: any = await import("jspdf");
    const JsPDF: any =
      jsPDFModule.jsPDF ?? jsPDFModule.default?.jsPDF ?? jsPDFModule.default;
    const doc = new JsPDF({
      orientation: "landscape",
      unit: "mm",
      format: "a4",
      compress: true,
    });

    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const blue = [0, 140, 255] as [number, number, number];
    const dark = [7, 17, 31] as [number, number, number];
    const panel = [13, 27, 46] as [number, number, number];
    const panelSoft = [20, 39, 64] as [number, number, number];
    const white = [255, 255, 255] as [number, number, number];
    const muted = [170, 186, 205] as [number, number, number];

    doc.setFillColor(...dark);
    doc.rect(0, 0, pageWidth, pageHeight, "F");

    try {
      doc.addImage(REPORT_LOGO_JPEG, "JPEG", 9, 7, 40, 21, undefined, "FAST");
    } catch {}

    doc.setFont("helvetica", "bold");
    doc.setFontSize(18);
    doc.setTextColor(...white);
    doc.text("Painel Geral", 55, 14);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    doc.setTextColor(...muted);
    doc.text(`Período: ${periodLabel}  •  ${selectedDriver}`, 55, 20);
    doc.text("Trans Salomão — visão financeira e operacional", 55, 25);

    doc.setDrawColor(...blue);
    doc.setLineWidth(0.6);
    doc.line(9, 32, pageWidth - 9, 32);

    const drawKpi = (
      x: number,
      y: number,
      w: number,
      h: number,
      label: string,
      value: string,
      emphasized = false,
    ) => {
      doc.setFillColor(...(emphasized ? blue : panel));
      doc.setDrawColor(...blue);
      doc.setLineWidth(0.35);
      doc.roundedRect(x, y, w, h, 2.5, 2.5, "FD");
      doc.setFont("helvetica", "bold");
      doc.setFontSize(7.5);
      doc.setTextColor(...(emphasized ? dark : muted));
      doc.text(label.toUpperCase(), x + 5, y + 8);
      doc.setFontSize(15);
      doc.setTextColor(...white);
      doc.text(value, x + 5, y + 20);
    };

    const margin = 9;
    const gap = 5;
    const primaryWidth = (pageWidth - margin * 2 - gap * 3) / 4;
    const primaryY = 39;
    drawKpi(margin, primaryY, primaryWidth, 29, "Faturamento", brl(totalBilling));
    drawKpi(
      margin + (primaryWidth + gap),
      primaryY,
      primaryWidth,
      29,
      "Comissão total",
      brl(totalCommission),
    );
    drawKpi(
      margin + (primaryWidth + gap) * 2,
      primaryY,
      primaryWidth,
      29,
      "Custo diesel",
      brl(totalDiesel),
    );
    drawKpi(
      margin + (primaryWidth + gap) * 3,
      primaryY,
      primaryWidth,
      29,
      "Total líquido",
      brl(totalNet),
      true,
    );

    const secondaryY = 75;
    const secondaryWidth = (pageWidth - margin * 2 - gap * 2) / 3;
    drawKpi(margin, secondaryY, secondaryWidth, 25, "Viagens", String(reportTrips.length));
    drawKpi(
      margin + secondaryWidth + gap,
      secondaryY,
      secondaryWidth,
      25,
      "Peso líquido",
      tons(totalNetWeight),
    );
    drawKpi(
      margin + (secondaryWidth + gap) * 2,
      secondaryY,
      secondaryWidth,
      25,
      "Ticket médio",
      brl(averageTicket),
    );

    const modeTotals = new Map<string, { trips: number; billing: number; commission: number }>();
    reportTrips.forEach((trip: any) => {
      const mode = String(trip.freightMode ?? "ton");
      const current = modeTotals.get(mode) ?? { trips: 0, billing: 0, commission: 0 };
      current.trips += 1;
      current.billing += Number(trip.freight ?? 0);
      current.commission += Number(trip.commissionValue ?? trip.commission ?? 0);
      modeTotals.set(mode, current);
    });

    const modeLabel = (mode: string) =>
      mode === "ton"
        ? "Por tonelada"
        : mode === "trip"
          ? "Por viagem"
          : mode === "cegonha"
            ? "Cegonha"
            : mode === "caixinha"
              ? "Caixinha"
              : mode;

    doc.setFillColor(...panelSoft);
    doc.setDrawColor(...blue);
    doc.setLineWidth(0.3);
    doc.roundedRect(margin, 108, pageWidth - margin * 2, 72, 2.5, 2.5, "FD");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(...white);
    doc.text("Resumo por modalidade", margin + 6, 117);

    const headers = ["Modalidade", "Viagens", "Faturamento", "Comissão", "Total líquido"];
    const colX = [margin + 6, margin + 92, margin + 128, margin + 183, margin + 238];
    doc.setFontSize(7.2);
    doc.setTextColor(...muted);
    headers.forEach((header, index) => doc.text(header, colX[index], 126));
    doc.setDrawColor(55, 77, 103);
    doc.line(margin + 6, 130, pageWidth - margin - 6, 130);

    const modes = ["ton", "trip", "cegonha", "caixinha"].filter((mode) => modeTotals.has(mode));
    let rowY = 138;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    for (const mode of modes) {
      const item = modeTotals.get(mode)!;
      doc.setTextColor(...white);
      doc.text(modeLabel(mode), colX[0], rowY);
      doc.text(String(item.trips), colX[1], rowY);
      doc.text(brl(item.billing), colX[2], rowY);
      doc.text(brl(item.commission), colX[3], rowY);
      doc.text(brl(item.billing - item.commission), colX[4], rowY);
      rowY += 9;
    }
    if (modes.length === 0) {
      doc.setTextColor(...muted);
      doc.text("Nenhuma viagem no período selecionado.", colX[0], rowY);
    }

    const now = new Date();
    const generatedAt = now.toLocaleString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
    doc.setFontSize(6.8);
    doc.setTextColor(...muted);
    doc.text(`Gerado em ${generatedAt}`, margin, pageHeight - 6);
    doc.text("Trans Salomão", pageWidth - margin, pageHeight - 6, { align: "right" });

    const dateKey = [
      now.getFullYear(),
      String(now.getMonth() + 1).padStart(2, "0"),
      String(now.getDate()).padStart(2, "0"),
    ].join("-");
    doc.save("Painel_Geral_" + dateKey + ".pdf");
  } catch (error) {
    console.error("[pdf-painel-geral]", error);
    window.alert("Não foi possível gerar o PDF do Painel Geral. Tente novamente.");
  }
}