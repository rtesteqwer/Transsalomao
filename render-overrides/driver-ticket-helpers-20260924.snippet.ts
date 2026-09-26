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

async function lerTicket(
  imageDataUrl: string,
  freightMode: "ton" | "trip" | "cegonha" | "caixinha",
  selectedFleet?: { tractorPlate: string; trailerPlate: string },
  fileName = "ticket.jpg",
): Promise<TicketData> {
  const response = await fetch("/api/ler-ticket", {
    method: "POST",
    signal: AbortSignal.timeout(45_000),
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      imagem: imageDataUrl,
      tipo: imageDataUrl.match(/^data:([^;]+);/)?.[1] || "image/jpeg",
      freightMode,
      fileName,
      selectedFleet,
    }),
  });
  const result = await response.json().catch(() => ({ erro: "Resposta inválida do servidor." }));
  if (!response.ok) throw new Error(result?.erro || "O ChatGPT não conseguiu interpretar o ticket.");
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
  return result as { ok: true; id: number; reportId: string; ticket: string; tons: number; freightMode: string; photoId: string | null; linkedExisting?: boolean; duplicateExact?: boolean; driverId?: string | null; driverName?: string | null; fleetId?: string | null; fleetName?: string | null; reportStatus?: string | null };
}
