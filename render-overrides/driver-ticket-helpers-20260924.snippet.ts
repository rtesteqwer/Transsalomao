import type { TicketData } from "@/lib/ticket-core";

async function ocrTicketLocal(file: File) {
  if (!file.type.startsWith("image/")) throw new Error("Selecione uma foto válida.");
  if (file.size > 15_000_000) throw new Error("A foto é grande demais.");

  const tesseract = await import("tesseract.js");
  const createWorker = tesseract.createWorker;
  if (typeof createWorker !== "function") throw new Error("OCR local indisponível neste navegador.");

  let worker;
  try {
    try {
      worker = await createWorker(["por", "eng"]);
    } catch {
      try { worker = await createWorker("por"); }
      catch { worker = await createWorker("eng"); }
    }

    const pieces: string[] = [];
    const add = (value: unknown) => {
      const text = String(value || "").trim();
      if (text) pieces.push(text);
    };

    // 1) Preserve one reading from the original file.
    await worker.setParameters({ tessedit_pageseg_mode: tesseract.PSM.AUTO });
    add((await worker.recognize(file))?.data?.text);

    const url = URL.createObjectURL(file);
    try {
      const img = await new Promise<HTMLImageElement>((resolve, reject) => {
        const image = new Image();
        image.onload = () => resolve(image);
        image.onerror = () => reject(new Error("Não foi possível abrir a foto para o OCR."));
        image.src = url;
      });

      const scale = Math.min(3.2, 3200 / Math.max(img.naturalWidth, img.naturalHeight));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
      canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Não foi possível preparar a foto para o OCR.");

      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.filter = "grayscale(1) contrast(1.85)";
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

      // 2) Layout automático: melhor para tickets tabulares/relatórios.
      await worker.setParameters({
        tessedit_pageseg_mode: tesseract.PSM.AUTO,
        preserve_interword_spaces: "1",
      });
      add((await worker.recognize(canvas))?.data?.text);

      // 3) Texto esparso: essencial para campos isolados, números grandes,
      // placas em caixas e pesos que o AUTO deixa escapar.
      await worker.setParameters({
        tessedit_pageseg_mode: tesseract.PSM.SPARSE_TEXT,
        preserve_interword_spaces: "1",
      });
      add((await worker.recognize(canvas))?.data?.text);

      // 4) Tickets verticais (Multilift/VPORTS) ganham duas leituras amplas
      // sobrepostas. Não são recortes por fornecedor: servem para qualquer
      // comprovante alto com cabeçalho/placas em cima e pesos mais abaixo.
      if (img.naturalHeight > img.naturalWidth * 1.12) {
        const recognizeBand = async (topRatio: number, bottomRatio: number) => {
          const sy = Math.max(0, Math.floor(img.naturalHeight * topRatio));
          const sh = Math.max(1, Math.floor(img.naturalHeight * (bottomRatio - topRatio)));
          const bandScale = Math.min(3.4, 2800 / Math.max(1, img.naturalWidth));
          const band = document.createElement("canvas");
          band.width = Math.max(1, Math.round(img.naturalWidth * bandScale));
          band.height = Math.max(1, Math.round(sh * bandScale));
          const bctx = band.getContext("2d");
          if (!bctx) return;
          bctx.fillStyle = "#fff";
          bctx.fillRect(0, 0, band.width, band.height);
          bctx.filter = "grayscale(1) contrast(2)";
          bctx.drawImage(img, 0, sy, img.naturalWidth, sh, 0, 0, band.width, band.height);

          await worker.setParameters({
            tessedit_pageseg_mode: tesseract.PSM.SPARSE_TEXT,
            preserve_interword_spaces: "1",
          });
          add((await worker.recognize(band))?.data?.text);
        };

        await recognizeBand(0.00, 0.55);
        await recognizeBand(0.32, 0.84);
      }
    } finally {
      URL.revokeObjectURL(url);
    }

    const text = pieces.join("\n--- OCR PASS ---\n");
    if (text.replace(/\s/g, "").length < 8) {
      throw new Error("O OCR não encontrou texto suficiente. Tire outra foto mais nítida.");
    }
    return text;
  } finally {
    if (worker) await worker.terminate();
  }
}

async function ticketImageToDataUrl(file: File) {
  if (!file.type.startsWith("image/")) throw new Error("Selecione uma foto válida.");
  if (file.size > 15_000_000) throw new Error("A foto é grande demais.");

  try {
    const bitmap = await createImageBitmap(file);
    const maxSide = 1400;
    const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Não foi possível preparar a foto para arquivamento.");
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();

    let quality = 0.78;
    let out = canvas.toDataURL("image/jpeg", quality);
    while (out.length > 3_000_000 && quality > 0.48) {
      quality -= 0.08;
      out = canvas.toDataURL("image/jpeg", quality);
    }
    if (out.length > 3_000_000) throw new Error("A foto ficou grande demais para arquivar. Tire outra foto mais perto do ticket.");
    return out;
  } catch (error) {
    if (error instanceof Error && /grande demais|preparar/.test(error.message)) throw error;
    return await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error("Não foi possível preparar a foto para arquivamento."));
      reader.onload = () => {
        const value = String(reader.result || "");
        if (!value.startsWith("data:image/")) reject(new Error("Selecione uma foto válida."));
        else if (value.length > 3_000_000) reject(new Error("A foto é grande demais. Use outra foto mais próxima do ticket."));
        else resolve(value);
      };
      reader.readAsDataURL(file);
    });
  }
}

async function lerTicket(file: File, freightMode: "ton" | "trip" | "cegonha" | "caixinha", selectedFleet?: { tractorPlate: string; trailerPlate: string }): Promise<TicketData> {
  // OCR-only: a foto nunca é enviada para um provedor de IA.
  const ocrText = await ocrTicketLocal(file);
  const response = await fetch("/api/ler-ticket", {
    method: "POST",
    signal: AbortSignal.timeout(25_000),
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ocrText, freightMode, fileName: file.name, selectedFleet }),
  });
  const result = await response.json().catch(() => ({ erro: "Resposta inválida do servidor." }));
  if (!response.ok) throw new Error(result?.erro || "O OCR não conseguiu interpretar o ticket.");
  return result as TicketData;
}

async function salvarTicket(dados: TicketData & {
  driverId: string;
  fleetId: string;
  km_carreta: number;
  conferido: true;
  freightMode: "ton" | "trip" | "cegonha" | "caixinha";
  dailyValue: number;
  imagem?: string;
  fileName?: string;
}) {
  const response = await fetch("/api/salvar-ticket", {
    method: "POST",
    signal: AbortSignal.timeout(50_000),
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(dados),
  });
  const result = await response.json().catch(() => ({ erro: "Resposta inválida do servidor." }));
  if (!response.ok) throw new Error(result?.erro || "Falha ao salvar o ticket");
  return result as { ok: true; id: number; reportId: string; ticket: string; tons: number; freightMode: string; photoId: string | null };
}
