import type { TicketData } from "@/lib/ticket-core";

async function ticketImageToDataUrl(file: File) {
  const looksLikeImage = file.type.startsWith("image/") || /\.(jpe?g|png|webp|heic|heif)$/i.test(file.name || "");
  if (!looksLikeImage) throw new Error("Selecione uma foto válida.");
  if (file.size > 30_000_000) throw new Error("A foto é grande demais.");

  const encode = (source: CanvasImageSource, width: number, height: number) => {
    const maxSides = [1600, 1400, 1200, 1000, 800];
    for (const maxSide of maxSides) {
      const scale = Math.min(1, maxSide / Math.max(width, height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(width * scale));
      canvas.height = Math.max(1, Math.round(height * scale));
      const ctx = canvas.getContext("2d");
      if (!ctx) continue;
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
      for (const quality of [0.84, 0.76, 0.68, 0.60, 0.52, 0.44]) {
        const out = canvas.toDataURL("image/jpeg", quality);
        if (out.length <= 2_700_000) return out;
      }
    }
    throw new Error("Não foi possível reduzir a foto para envio.");
  };

  try {
    if (typeof createImageBitmap === "function") {
      const bitmap = await createImageBitmap(file);
      try {
        return encode(bitmap, bitmap.width, bitmap.height);
      } finally {
        bitmap.close();
      }
    }
  } catch {}

  const objectUrl = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error("Não foi possível abrir esta foto no celular."));
      image.src = objectUrl;
    });
    return encode(img, img.naturalWidth || img.width, img.naturalHeight || img.height);
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

async function ocrTicketLocal(imageDataUrl: string) {
  const tesseract = await import("tesseract.js");
  const createWorker = tesseract.createWorker;
  if (typeof createWorker !== "function") throw new Error("OCR local indisponível neste aparelho.");

  let worker: Awaited<ReturnType<typeof createWorker>> | null = null;
  const pieces: string[] = [];
  const add = (value: unknown) => {
    const text = String(value || "").trim();
    if (text && !pieces.includes(text)) pieces.push(text);
  };

  try {
    try {
      worker = await createWorker(["por", "eng"]);
    } catch {
      try { worker = await createWorker("por"); }
      catch { worker = await createWorker("eng"); }
    }

    const original = await worker.recognize(imageDataUrl);
    add(original?.data?.text);

    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error("O OCR não conseguiu abrir a foto."));
      img.src = imageDataUrl;
    });

    const makeCanvas = (sx: number, sy: number, sw: number, sh: number, maxSide = 2600) => {
      const scale = Math.min(3, maxSide / Math.max(sw, sh));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(sw * scale));
      canvas.height = Math.max(1, Math.round(sh * scale));
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Não foi possível preparar a foto para o OCR.");
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.filter = "grayscale(1) contrast(1.9)";
      ctx.drawImage(image, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
      return canvas;
    };

    const full = makeCanvas(0, 0, image.naturalWidth, image.naturalHeight);
    await worker.setParameters({
      tessedit_pageseg_mode: tesseract.PSM.SPARSE_TEXT,
      preserve_interword_spaces: "1",
    });
    add((await worker.recognize(full))?.data?.text);

    // Tickets verticais (Ecologistics/VPORTS) e folhas largas (Adubos Real/LOG)
    // ganham leituras por faixa. Isso melhora placa, número do ticket e pesos.
    if (image.naturalHeight > image.naturalWidth * 1.12) {
      for (const [top, bottom] of [[0, 0.58], [0.30, 0.90]] as const) {
        const sy = Math.floor(image.naturalHeight * top);
        const sh = Math.max(1, Math.floor(image.naturalHeight * (bottom - top)));
        add((await worker.recognize(makeCanvas(0, sy, image.naturalWidth, sh, 2400)))?.data?.text);
      }
    } else {
      const upper = Math.max(1, Math.floor(image.naturalHeight * 0.72));
      add((await worker.recognize(makeCanvas(0, 0, image.naturalWidth, upper, 2600)))?.data?.text);
    }

    const text = pieces.join("\n--- OCR PASS ---\n").slice(0, 30_000);
    if (text.replace(/\s/g, "").length < 8) {
      throw new Error("O OCR não encontrou texto suficiente. Tire outra foto mais nítida.");
    }
    return text;
  } finally {
    if (worker) await worker.terminate();
  }
}

async function postTicketRead(payload: Record<string, unknown>) {
  const response = await fetch("/api/ler-ticket", {
    method: "POST",
    signal: AbortSignal.timeout(50_000),
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const result = await response.json().catch(() => ({ erro: "Resposta inválida do servidor." }));
  return { response, result };
}

async function lerTicket(
  imageDataUrl: string,
  freightMode: "ton" | "trip" | "cegonha" | "caixinha",
  selectedFleet?: { tractorPlate: string; trailerPlate: string },
  fileName = "ticket.jpg",
  autoDetectMode = false,
): Promise<TicketData> {
  const primary = await postTicketRead({
    imagem: imageDataUrl,
    tipo: imageDataUrl.match(/^data:([^;]+);/)?.[1] || "image/jpeg",
    freightMode,
    fileName,
    selectedFleet,
    autoDetectMode,
  });
  if (primary.response.ok) return primary.result as TicketData;

  const fallbackStatuses = new Set([402, 408, 425, 429, 500, 502, 503, 504]);
  if (!fallbackStatuses.has(primary.response.status)) {
    throw new Error(primary.result?.erro || "Não foi possível interpretar o ticket.");
  }

  // Contingência automática: se a API de visão estiver sem crédito, em timeout
  // ou indisponível, a mesma foto é lida localmente e só o texto vai ao servidor.
  let ocrText: string;
  try {
    ocrText = await ocrTicketLocal(imageDataUrl);
  } catch (ocrError) {
    const aiMessage = primary.result?.erro || "A leitura por IA está indisponível.";
    const localMessage = ocrError instanceof Error ? ocrError.message : "OCR local indisponível.";
    throw new Error(aiMessage + " O OCR de contingência também falhou: " + localMessage);
  }

  const fallback = await postTicketRead({
    ocrText,
    freightMode,
    fileName,
    selectedFleet,
    autoDetectMode,
    fallbackReason: primary.response.status,
  });
  if (!fallback.response.ok) {
    throw new Error(fallback.result?.erro || "O OCR de contingência não conseguiu interpretar o ticket.");
  }
  return fallback.result as TicketData;
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
  return result as { ok: true; id: number; reportId: string; ticket: string; tons: number; freightMode: string; photoId: string | null; linkedExisting?: boolean; duplicateExact?: boolean; driverId?: string | null; driverName?: string | null; fleetId?: string | null; fleetName?: string | null; reportStatus?: string | null };
}
