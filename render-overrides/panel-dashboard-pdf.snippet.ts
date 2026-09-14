async function exportPainelGeralPdf() {
  let frame: HTMLIFrameElement | null = null;
  try {
    frame = document.createElement("iframe");
    frame.src = "/dono";
    frame.setAttribute("aria-hidden", "true");
    frame.style.position = "fixed";
    frame.style.left = "-10000px";
    frame.style.top = "0";
    frame.style.width = "1440px";
    frame.style.height = "1200px";
    frame.style.border = "0";
    frame.style.opacity = "0";
    frame.style.pointerEvents = "none";
    document.body.appendChild(frame);

    await new Promise<void>((resolve, reject) => {
      const timeout = window.setTimeout(
        () => reject(new Error("Tempo esgotado ao carregar o Painel Geral")),
        12000,
      );
      frame!.addEventListener(
        "load",
        () => {
          window.clearTimeout(timeout);
          resolve();
        },
        { once: true },
      );
    });

    await new Promise((resolve) => window.setTimeout(resolve, 1800));
    const frameDocument = frame.contentDocument;
    if (!frameDocument) throw new Error("Não foi possível acessar o Painel Geral");
    try {
      await (frameDocument as any).fonts?.ready;
    } catch {}

    const panel = (frameDocument.querySelector("main") ?? frameDocument.body) as HTMLElement;
    if (!panel) throw new Error("Painel Geral não encontrado");

    const html2canvasModule: any = await import("html2canvas");
    const html2canvas: any = html2canvasModule.default ?? html2canvasModule;
    const canvas = await html2canvas(panel, {
      scale: 1.6,
      useCORS: true,
      allowTaint: false,
      backgroundColor:
        frameDocument.defaultView?.getComputedStyle(panel).backgroundColor || "#07111f",
      width: Math.max(panel.scrollWidth, panel.clientWidth),
      height: Math.max(panel.scrollHeight, panel.clientHeight),
      windowWidth: Math.max(panel.scrollWidth, 1280),
      windowHeight: Math.max(panel.scrollHeight, 900),
      logging: false,
    });

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
    const margin = 5;
    const printableWidth = pageWidth - margin * 2;
    const printableHeight = pageHeight - margin * 2;
    const scaleToPdf = printableWidth / canvas.width;
    const sliceHeightPx = Math.max(1, Math.floor(printableHeight / scaleToPdf));
    let sourceY = 0;
    let pageIndex = 0;

    while (sourceY < canvas.height) {
      const currentHeight = Math.min(sliceHeightPx, canvas.height - sourceY);
      const slice = document.createElement("canvas");
      slice.width = canvas.width;
      slice.height = currentHeight;
      const ctx = slice.getContext("2d");
      if (!ctx) throw new Error("Falha ao montar página do PDF");
      ctx.drawImage(
        canvas,
        0,
        sourceY,
        canvas.width,
        currentHeight,
        0,
        0,
        canvas.width,
        currentHeight,
      );
      if (pageIndex > 0) doc.addPage("a4", "landscape");
      const imgHeight = currentHeight * scaleToPdf;
      doc.addImage(
        slice.toDataURL("image/jpeg", 0.94),
        "JPEG",
        margin,
        margin,
        printableWidth,
        imgHeight,
        undefined,
        "FAST",
      );
      sourceY += currentHeight;
      pageIndex += 1;
    }

    const now = new Date();
    const dateKey = [
      now.getFullYear(),
      String(now.getMonth() + 1).padStart(2, "0"),
      String(now.getDate()).padStart(2, "0"),
    ].join("-");
    doc.save("Painel_Geral_" + dateKey + ".pdf");
  } catch (error) {
    console.error("[pdf-painel-geral]", error);
    window.alert("Não foi possível gerar o PDF do Painel Geral. Tente novamente.");
  } finally {
    frame?.remove();
  }
}
