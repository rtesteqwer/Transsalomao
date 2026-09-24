type TicketData = {
  numero_ticket: string | null;
  status: string | null;
  placa_veiculo: string | null;
  placa_carreta: string | null;
  produto: string | null;
  pesagem_inicial_kg: number | null;
  pesagem_inicial_data: string | null;
  pesagem_final_kg: number | null;
  pesagem_final_data: string | null;
  peso_liquido_kg: number | null;
  peso_origem_kg: number | null;
  numero_nf: string | null;
  transportadora: string | null;
  motorista: string | null;
  cliente: string | null;
  anotacoes_manuscritas: string | null;
  alertas: string[];
};

async function reduzirImagemTicket(file: File, maxLado = 1600, qualidade = 0.85) {
  if (!file.type.startsWith("image/")) throw new Error("Selecione uma foto válida.");
  if (file.size > 15_000_000) throw new Error("A foto é grande demais.");

  const bitmap = await createImageBitmap(file);
  const escala = Math.min(1, maxLado / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bitmap.width * escala));
  canvas.height = Math.max(1, Math.round(bitmap.height * escala));
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    bitmap.close();
    throw new Error("Não foi possível preparar a foto.");
  }
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const dataUrl = canvas.toDataURL("image/jpeg", qualidade);
  return { imagem: dataUrl.split(",")[1] || "", tipo: "image/jpeg" };
}

async function lerTicket(file: File): Promise<TicketData> {
  const payload = await reduzirImagemTicket(file);
  const response = await fetch("/api/ler-ticket", {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const result = await response.json().catch(() => ({ erro: "Resposta inválida do servidor." }));
  if (!response.ok) throw new Error(result?.erro || "Falha ao ler o ticket");
  return result as TicketData;
}

async function salvarTicket(dados: TicketData & { driverId: string; fleetId: string; km_carreta: number }) {
  const response = await fetch("/api/salvar-ticket", {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(dados),
  });
  const result = await response.json().catch(() => ({ erro: "Resposta inválida do servidor." }));
  if (!response.ok) throw new Error(result?.erro || "Falha ao salvar o ticket");
  return result as { ok: true; id: number; reportId: string; ticket: string; tons: number };
}
