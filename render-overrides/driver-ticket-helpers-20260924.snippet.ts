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
  destinatario: string | null;
  anotacoes_manuscritas: string | null;
  alertas: string[];
};

async function reduzirImagemTicket(file: File, maxLado = 1600, qualidade = 0.85) {
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
  const { createWorker } = await import("tesseract.js");
  const worker = await createWorker("por");
  try {
    const result = await worker.recognize(file);
    return String(result?.data?.text || "").trim();
  } finally {
    await worker.terminate();
  }
}

function interpretarOcrTicketLocal(
  text: string,
  freightMode: "ton" | "trip" | "cegonha" | "caixinha",
  fileName: string,
): TicketData {
  const clean = String(text || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const upper = clean.toUpperCase();
  const lines = clean.split(/\r?\n+/).map(line => line.replace(/\s+/g, " ").trim()).filter(Boolean);
  const stem = fileName.replace(/\.[^.]+$/, "").trim();

  const alerts: string[] = [
    "Leitura feita localmente pela Salomão IA. Confira os dados com a foto antes de lançar.",
  ];

  function firstMatch(patterns: RegExp[]) {
    for (const pattern of patterns) {
      const match = clean.match(pattern);
      const value = match?.[1]?.trim();
      if (value) return value.slice(0, 200);
    }
    return null;
  }

  function afterLabel(labels: string[]) {
    for (const line of lines) {
      const lineUpper = line.toUpperCase();
      for (const label of labels) {
        const index = lineUpper.indexOf(label);
        if (index < 0) continue;
        const value = line.slice(index + label.length).replace(/^\s*[:#=\-]?\s*/, "").trim();
        if (value) return value.slice(0, 200);
      }
    }
    return null;
  }

  function parseWeight(patterns: RegExp[]) {
    if (freightMode !== "ton") return null;
    for (const pattern of patterns) {
      const match = clean.match(pattern);
      if (!match?.[1]) continue;
      let raw = match[1].replace(/\s/g, "");
      const unit = String(match[2] || "").toUpperCase();

      if (/^\d{1,3}(\.\d{3})+(,\d+)?$/.test(raw)) raw = raw.replace(/\./g, "").replace(",", ".");
      else if (/^\d{1,3}(,\d{3})+(\.\d+)?$/.test(raw)) raw = raw.replace(/,/g, "");
      else if (raw.includes(",") && !raw.includes(".")) raw = raw.replace(",", ".");
      else if (raw.includes(",") && raw.includes(".")) raw = raw.replace(/\./g, "").replace(",", ".");

      const number = Number(raw);
      if (!Number.isFinite(number) || number <= 0) continue;
      const kg = /^(T|TON|TONELADA|TONELADAS)$/.test(unit) && number < 1000 ? number * 1000 : number;
      return Math.round(kg);
    }
    return null;
  }

  let numeroTicket = firstMatch([
    /(?:TICKET|TIQUETE|ROMANEIO|COMPROVANTE)\s*(?:N(?:UMERO|[Oº°])?\s*)?[:#=\-]?\s*([A-Z0-9./-]{2,30})/i,
    /(?:N[º°O]|NUMERO)\s*[:#=\-]?\s*([0-9]{3,14})\b/i,
  ]);
  if (!numeroTicket && /^\d{3,14}$/.test(stem)) {
    numeroTicket = stem;
    alerts.push("O número do ticket foi obtido do nome do arquivo; confira no documento.");
  }

  const plates = Array.from(new Set(
    upper.match(/\b[A-Z]{3}[0-9][A-Z0-9][0-9]{2}\b|\b[A-Z]{3}[0-9]{4}\b/g) || [],
  ));

  const pesoLiquido = parseWeight([
    /PESO\s*LIQUIDO\s*[:=\-]?\s*([0-9][0-9.,\s]{1,18})\s*(KG|KGS|T|TON|TONELADAS?)?/i,
    /\bLIQUIDO\s*[:=\-]?\s*([0-9][0-9.,\s]{1,18})\s*(KG|KGS|T|TON|TONELADAS?)?/i,
    /P\.?\s*LIQUIDO\s*[:=\-]?\s*([0-9][0-9.,\s]{1,18})\s*(KG|KGS|T|TON|TONELADAS?)?/i,
  ]);

  if (clean.replace(/\s/g, "").length < 4) {
    alerts.push("A leitura encontrou pouco texto; confira todos os campos manualmente.");
  }
  if (freightMode === "ton" && !pesoLiquido) {
    alerts.push("Peso líquido não identificado automaticamente. Informe e confira antes de lançar.");
  }

  return {
    numero_ticket: numeroTicket,
    status: afterLabel(["STATUS"]),
    placa_veiculo: plates[0] || null,
    placa_carreta: plates[1] || null,
    produto: afterLabel(["PRODUTO", "MERCADORIA", "CARGA"]),
    pesagem_inicial_kg: freightMode === "ton" ? parseWeight([
      /PESO\s*BRUTO\s*[:=\-]?\s*([0-9][0-9.,\s]{1,18})\s*(KG|KGS|T|TON|TONELADAS?)?/i,
      /\bBRUTO\s*[:=\-]?\s*([0-9][0-9.,\s]{1,18})\s*(KG|KGS|T|TON|TONELADAS?)?/i,
    ]) : null,
    pesagem_inicial_data: null,
    pesagem_final_kg: freightMode === "ton" ? parseWeight([
      /\bTARA\s*[:=\-]?\s*([0-9][0-9.,\s]{1,18})\s*(KG|KGS|T|TON|TONELADAS?)?/i,
    ]) : null,
    pesagem_final_data: null,
    peso_liquido_kg: freightMode === "ton" ? pesoLiquido : null,
    peso_origem_kg: null,
    numero_nf: firstMatch([/(?:NOTA\s*FISCAL|NFE|NF-E|NF)\s*[:#=\-]?\s*([0-9./-]{2,30})/i]),
    transportadora: afterLabel(["TRANSPORTADORA", "TRANSP."]),
    motorista: afterLabel(["MOTORISTA"]),
    cliente: afterLabel(["CLIENTE"]),
    destinatario: afterLabel(["DESTINATARIO", "RECEBEDOR", "DESTINO"]) || afterLabel(["CLIENTE"]),
    anotacoes_manuscritas: null,
    alertas: alerts,
  };
}

async function lerTicket(file: File, freightMode: "ton" | "trip" | "cegonha" | "caixinha"): Promise<TicketData> {
  const payload = await reduzirImagemTicket(file);
  const response = await fetch("/api/ler-ticket", {
    method: "POST",
    signal: AbortSignal.timeout(50_000),
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...payload, freightMode, fileName: file.name }),
  });
  const result = await response.json().catch(() => ({ erro: "Resposta inválida do servidor." }));

  if (response.ok) return result as TicketData;

  if (response.status === 503 && result?.ocrFallback) {
    const ocrText = await ocrTicketLocal(file);
    return interpretarOcrTicketLocal(ocrText, freightMode, file.name);
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
