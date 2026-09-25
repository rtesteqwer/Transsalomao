import type { TicketData } from "@/lib/ticket-core";

async function reduzirImagemTicket(file: File, maxLado = 2600, qualidade = 0.90) {
  if (!file.type.startsWith("image/")) throw new Error("Selecione uma foto válida.");
  if (file.size > 15_000_000) throw new Error("A foto é grande demais.");

  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error("Não foi possível abrir esta foto. Use JPG ou PNG."));
      image.src = url;
    });
    const escala = Math.min(1, maxLado / Math.max(img.naturalWidth, img.naturalHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(img.naturalWidth * escala));
    canvas.height = Math.max(1, Math.round(img.naturalHeight * escala));
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Não foi possível preparar a foto.");
    ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    let imagem = canvas.toDataURL("image/jpeg", qualidade).split(",")[1] || "";
    if (imagem.length > 3_500_000) imagem = canvas.toDataURL("image/jpeg", 0.65).split(",")[1] || "";
    if (!imagem || imagem.length > 3_500_000) throw new Error("A foto é grande demais. Escolha outra imagem.");
    return { imagem, tipo: "image/jpeg" };
  } finally { URL.revokeObjectURL(url); }
}

async function ocrTicketLocal(file: File) {
  const tesseract = await import("tesseract.js");
  const createWorker = tesseract.createWorker;
  if (typeof createWorker !== "function") throw new Error("OCR local indisponível neste navegador.");
  let worker;
  try {
    worker = await createWorker("por");
  } catch {
    worker = await createWorker("eng");
  }
  try {
    const result = await worker.recognize(file);
    let text = String(result?.data?.text || "").trim();
    // A second full-page pass helps small text and shadows without depending on
    // fixed crop coordinates or omitting another part of the document.
    const url = URL.createObjectURL(file);
    try {
      const img = await new Promise<HTMLImageElement>((resolve, reject) => {
        const image = new Image(); image.onload = () => resolve(image); image.onerror = reject; image.src = url;
      });
      const scale = Math.min(3, 3200 / Math.max(img.naturalWidth, img.naturalHeight));
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(img.naturalWidth * scale); canvas.height = Math.round(img.naturalHeight * scale);
      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.filter = "grayscale(1) contrast(1.8)";
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        // Receipts with boxed fields (Multilift/VPORTS/LOG) are much more reliable
        // as one enhanced text block than with sparse-text segmentation alone.
        await worker.setParameters({ tessedit_pageseg_mode: tesseract.PSM.SINGLE_BLOCK });
        const block = await worker.recognize(canvas);
        text += "\n" + String(block?.data?.text || "");

        // Only spend a third OCR pass when the first two passes still missed
        // several of the fields that are important to a trip.
        const cues = (text.match(/(?:TICKET|TIQUETE|PESO|LIQ|PLACA|CARRETA|VEIC|TRANSPORTADORA)/gi) || []).length;
        if (cues < 5) {
          await worker.setParameters({ tessedit_pageseg_mode: tesseract.PSM.SPARSE_TEXT });
          const sparse = await worker.recognize(canvas);
          text += "\n" + String(sparse?.data?.text || "");
        }
      }
    } catch { /* Preserve the first reading if image enhancement is unavailable. */ }
    finally { URL.revokeObjectURL(url); }
    if (text.replace(/\s/g, "").length < 8) {
      throw new Error("A Salomão IA não encontrou texto suficiente. Tire outra foto mais nítida.");
    }
    return text;
  } finally {
    if (worker) await worker.terminate();
  }
}

async function lerTicket(file: File, freightMode: "ton" | "trip" | "cegonha" | "caixinha", selectedFleet?: { tractorPlate: string; trailerPlate: string }): Promise<TicketData> {
  const payload = await reduzirImagemTicket(file);
  const response = await fetch("/api/ler-ticket", {
    method: "POST",
    signal: AbortSignal.timeout(50_000),
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...payload, freightMode, fileName: file.name, selectedFleet }),
  });
  const result = await response.json().catch(() => ({ erro: "Resposta inválida do servidor." }));

  if (response.ok) return result as TicketData;

  if (response.status === 503 && result?.ocrFallback) {
    const ocrText = await ocrTicketLocal(file);
    const localResponse = await fetch("/api/ler-ticket", {
      method: "POST",
      signal: AbortSignal.timeout(20_000),
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ocrText, freightMode, fileName: file.name, selectedFleet }),
    });
    const localResult = await localResponse.json().catch(() => ({ erro: "Resposta inválida do servidor." }));
    if (!localResponse.ok) throw new Error(localResult?.erro || "A Salomão IA não conseguiu interpretar o OCR.");
    return localResult as TicketData;
  }

  throw new Error(result?.erro || "Falha ao ler o ticket");
}

async function salvarTicket(dados: TicketData & {
  driverId: string;
  fleetId: string;
  km_carreta: number;
  conferido: true;
  freightMode: "ton" | "trip" | "cegonha" | "caixinha";
  dailyValue: number;
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
  return result as { ok: true; id: number; reportId: string; ticket: string; tons: number; freightMode: string };
}
