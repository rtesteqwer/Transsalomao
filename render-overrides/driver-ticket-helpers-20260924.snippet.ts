import type { TicketData } from "@/lib/ticket-core";

async function ticketImageToDataUrl(file: File) {
  if (!file.type.startsWith("image/")) throw new Error("Selecione uma foto válida.");
  if (file.size > 15_000_000) throw new Error("A foto é grande demais.");

  try {
    const bitmap = await createImageBitmap(file);
    const maxSide = 1800;
    const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Não foi possível preparar a foto.");
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();

    let quality = 0.86;
    let out = canvas.toDataURL("image/jpeg", quality);
    while (out.length > 3_000_000 && quality > 0.5) {
      quality -= 0.07;
      out = canvas.toDataURL("image/jpeg", quality);
    }
    if (out.length > 3_000_000) {
      throw new Error("A foto ficou grande demais. Tire outra foto mais próxima do ticket.");
    }
    return out;
  } catch (error) {
    if (error instanceof Error && /grande demais|preparar/.test(error.message)) throw error;
    return await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error("Não foi possível preparar a foto."));
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
  return result as { ok: true; id: number; reportId: string; ticket: string; tons: number; freightMode: string; photoId: string | null };
}
