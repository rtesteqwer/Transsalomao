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
  const url = URL.createObjectURL(file);

  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error("Não foi possível abrir a foto para leitura local."));
      img.src = url;
    });

    function cropCanvas(left: number, top: number, width: number, height: number, targetWidth = 1600) {
      const sx = Math.max(0, Math.round(image.naturalWidth * left));
      const sy = Math.max(0, Math.round(image.naturalHeight * top));
      const sw = Math.max(1, Math.round(image.naturalWidth * width));
      const sh = Math.max(1, Math.round(image.naturalHeight * height));
      const outWidth = Math.max(600, targetWidth);
      const outHeight = Math.max(1, Math.round(sh * (outWidth / sw)));

      const canvas = document.createElement("canvas");
      canvas.width = outWidth;
      canvas.height = outHeight;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Não foi possível preparar a foto para OCR.");
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, outWidth, outHeight);
      ctx.filter = "grayscale(1) contrast(1.85)";
      ctx.drawImage(image, sx, sy, sw, sh, 0, 0, outWidth, outHeight);
      ctx.filter = "none";
      return canvas;
    }

    const regions = [
      ["TICKET", cropCanvas(0.03, 0.055, 0.47, 0.10, 1350)],
      ["TICKET_NUM", cropCanvas(0.17, 0.060, 0.30, 0.060, 1200)],
      ["CARRETA_VAL", cropCanvas(0.035, 0.135, 0.20, 0.070, 1200)],
      ["VEICULO_VAL", cropCanvas(0.205, 0.135, 0.27, 0.070, 1200)],
      ["CABECALHO", cropCanvas(0.03, 0.055, 0.94, 0.24, 1800)],
      ["PESOS", cropCanvas(0.53, 0.105, 0.45, 0.29, 1500)],
      ["EMPRESAS", cropCanvas(0.03, 0.255, 0.94, 0.17, 1800)],
      ["NF", cropCanvas(0.03, 0.395, 0.94, 0.09, 1800)],
    ] as const;

    const chunks: string[] = [];
    for (const [name, canvas] of regions) {
      const result = await worker.recognize(canvas);
      chunks.push("[[" + name + "]]\n" + String(result?.data?.text || "").trim());
    }

    return chunks.join("\n\n");
  } finally {
    URL.revokeObjectURL(url);
    await worker.terminate();
  }
}

function interpretarOcrTicketLocal(
  text: string,
  freightMode: "ton" | "trip" | "cegonha" | "caixinha",
  fileName: string,
): TicketData {
  const source = String(text || "");
  const clean = source.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const stem = fileName.replace(/\.[^.]+$/, "").trim();

  function section(name: string) {
    const match = clean.match(new RegExp("\\[\\[" + name + "\\]\\]\\s*([\\s\\S]*?)(?=\\n\\s*\\[\\[|$)", "i"));
    return (match?.[1] || "").trim();
  }

  const ticketText = section("TICKET");
  const ticketNumberText = section("TICKET_NUM");
  const trailerValueText = section("CARRETA_VAL");
  const tractorValueText = section("VEICULO_VAL");
  const headerText = section("CABECALHO");
  const weightText = section("PESOS");
  const companyText = section("EMPRESAS");
  const nfText = section("NF");
  const allText = [ticketText, ticketNumberText, trailerValueText, tractorValueText, headerText, weightText, companyText, nfText].filter(Boolean).join("\n");
  const allUpper = allText.toUpperCase();

  const alerts: string[] = [
    "Leitura feita localmente pela Salomão IA. Confira os dados com a foto antes de lançar.",
  ];

  function ocrDigits(value: string | null | undefined) {
    if (!value) return null;
    const normalized = value
      .toUpperCase()
      .replace(/[OQD]/g, "0")
      .replace(/[IL|]/g, "1")
      .replace(/S/g, "5")
      .replace(/B/g, "8")
      .replace(/[^0-9]/g, "");
    return normalized || null;
  }

  function firstMatchIn(value: string, patterns: RegExp[]) {
    for (const pattern of patterns) {
      const match = value.match(pattern);
      const found = match?.[1]?.trim();
      if (found) return found.slice(0, 240);
    }
    return null;
  }

  function parseWeightFrom(value: string, labels: string[]) {
    if (freightMode !== "ton") return null;
    const upper = value.toUpperCase();
    for (const label of labels) {
      const idx = upper.indexOf(label);
      if (idx < 0) continue;
      const nearby = value.slice(idx + label.length, idx + label.length + 90);
      const match = nearby.match(/[:=\-]?\s*([0-9OQDISBL|][0-9OQDISBL|.,\s]{2,18})\s*(KG|KGS|K9|K6|T|TON|TONELADAS?)?/i);
      if (!match?.[1]) continue;
      const digits = ocrDigits(match[1]);
      if (!digits) continue;
      const number = Number(digits);
      if (!Number.isFinite(number) || number <= 0) continue;
      const unit = String(match[2] || "").toUpperCase();
      return /^(T|TON|TONELADA|TONELADAS)$/.test(unit) && number < 1000 ? Math.round(number * 1000) : Math.round(number);
    }
    return null;
  }

  function parseDateAfter(value: string, label: string) {
    const upper = value.toUpperCase();
    const idx = upper.indexOf(label);
    if (idx < 0) return null;
    const nearby = value.slice(idx, idx + 180);
    const match = nearby.match(/(\d{2}[\/.-]\d{2}[\/.-]\d{4})\s+(\d{2}:\d{2}:\d{2})/);
    return match ? match[1].replace(/[.-]/g, "/") + " " + match[2] : null;
  }

  function normalizePlate(value: string | null) {
    if (!value) return null;
    const plate = value.toUpperCase().replace(/[^A-Z0-9]/g, "");
    return /^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$/.test(plate) || /^[A-Z]{3}[0-9]{4}$/.test(plate) ? plate : null;
  }

  function plateFromValueCrop(value: string) {
    const tokens = value.toUpperCase().match(/[A-Z0-9]{7}/g) || [];
    for (const token of tokens) {
      const exact = normalizePlate(token);
      if (exact) return exact;
    }
    return null;
  }

  function plateAfterLabel(label: string) {
    const upper = headerText.toUpperCase();
    const idx = upper.indexOf(label);
    if (idx < 0) return null;
    const nearby = headerText.slice(idx + label.length, idx + label.length + 140);
    const tokens = nearby.toUpperCase().match(/[A-Z0-9]{7}/g) || [];
    for (const token of tokens) {
      const exact = normalizePlate(token);
      if (exact) return exact;
    }
    return null;
  }

  function blockBetween(value: string, startLabel: string, endLabel: string) {
    const upper = value.toUpperCase();
    const startIndex = upper.indexOf(startLabel);
    if (startIndex < 0) return "";
    const after = startIndex + startLabel.length;
    const endIndex = upper.indexOf(endLabel, after);
    return value.slice(after, endIndex >= 0 ? endIndex : undefined).trim();
  }

  function companyName(block: string) {
    if (!block) return null;
    const normalized = block.replace(/\s+/g, " ").trim();

    const razao = normalized.match(/RAZAO\s+SOCIAL\s*[:\-]?\s*([A-Z][A-Z0-9 .&/\-]{3,}?)(?=\s+CNPJ\b|\s+DESTINATARIO\b|\s+REMETENTE\b|$)/i)?.[1]?.trim();
    if (razao && /[A-Z]{3}/i.test(razao) && !/^\d+$/.test(razao.replace(/\D/g, ""))) return razao;

    const afterCnpj = normalized.match(/CNPJ\s*[:\-]?\s*([A-Z][A-Z .&/\-]{3,}?)(?=\s+RAZAO\s+SOCIAL\b|\s+DESTINATARIO\b|\s+REMETENTE\b|$)/i)?.[1]?.trim();
    if (afterCnpj && /[A-Z]{3}/i.test(afterCnpj)) return afterCnpj;

    const candidates = normalized
      .split(/\s{2,}|\n/)
      .map(part => part.replace(/^(CNPJ|RAZAO\s+SOCIAL)\s*[:\-]?\s*/i, "").trim())
      .filter(part => /[A-Z]{3}/i.test(part) && !/^\d{8,}$/.test(part.replace(/\D/g, "")));
    return candidates[0]?.slice(0, 200) || null;
  }

  let numeroTicket: string | null = null;
  const ticketCandidates = [
    firstMatchIn(ticketNumberText, [/\b([0-9OQDISBL|]{5,12})\b/]),
    firstMatchIn(ticketText, [/\b([0-9OQDISBL|]{5,12})\b/]),
    firstMatchIn(headerText, [
      /NUMERO\s*[:#=\-]?\s*([0-9OQDISBL|]{5,12})/i,
      /TICKET\s*[:#=\-]?\s*([0-9OQDISBL|]{5,12})/i,
    ]),
  ].filter(Boolean) as string[];

  for (const candidate of ticketCandidates) {
    const digits = ocrDigits(candidate);
    if (digits && digits.length >= 5 && digits.length <= 12) {
      numeroTicket = digits;
      break;
    }
  }

  if (!numeroTicket && /^\d{3,14}$/.test(stem)) {
    numeroTicket = stem;
    alerts.push("O número do ticket foi obtido do nome do arquivo; confira no documento.");
  }

  const placaCarreta = plateFromValueCrop(trailerValueText) || plateAfterLabel("CARRETA");
  const placaVeiculo = plateFromValueCrop(tractorValueText) || plateAfterLabel("VEICULO");
  const fallbackPlates = Array.from(new Set(
    allUpper.match(/\b[A-Z]{3}[0-9][A-Z0-9][0-9]{2}\b|\b[A-Z]{3}[0-9]{4}\b/g) || [],
  ));

  const pesoInicial = parseWeightFrom(weightText, ["PESAGEM INICIAL", "PESO INICIAL", "BRUTO"]);
  const pesoFinal = parseWeightFrom(weightText, ["PESAGEM FINAL", "PESO FINAL", "TARA"]);
  const pesoLiquido = parseWeightFrom(weightText, ["PESO LIQUIDO", "LIQUIDO"]);
  const pesoOrigem = parseWeightFrom(weightText, ["PESO ORIGEM", "ORIGEM"]);

  const transportBlock = blockBetween(companyText, "TRANSPORTADORA", "DESTINATARIO");
  const destBlock = blockBetween(companyText, "DESTINATARIO", "REMETENTE");

  let produto = firstMatchIn(headerText, [
    /PRODUTO\s*[:\-]?\s*([^\n]{2,120})/i,
  ]);
  if (produto) produto = produto
    .replace(/\s+(?:DATA\s+E\s+HORARIO|OPERADOR|PESAGEM|PESO\s+LIQUIDO).*$/i, "")
    .trim();

  let numeroNf = firstMatchIn(nfText, [
    /NRO\s+NOTA\s*[:#=\-]?\s*([0-9OQDISBL|\-./]{5,30})/i,
    /NUMERO\s+NF\s*[:#=\-]?\s*([0-9OQDISBL|\-./]{5,30})/i,
  ]);
  if (numeroNf) {
    numeroNf = numeroNf.toUpperCase()
      .replace(/[OQD]/g, "0")
      .replace(/[IL|]/g, "1")
      .replace(/S/g, "5")
      .replace(/B/g, "8");
  }

  const status = firstMatchIn(headerText, [
    /STATUS\s*[:#=\-]?\s*([A-ZÀ-Ú]{4,30})/i,
  ]);

  const dataInicial = parseDateAfter(weightText, "PESAGEM INICIAL");
  const dataFinal = parseDateAfter(weightText, "PESAGEM FINAL");

  if (!pesoLiquido && freightMode === "ton") {
    alerts.push("Peso líquido não identificado automaticamente. Informe e confira antes de lançar.");
  }
  if (!placaCarreta) alerts.push("Placa da carreta não foi identificada com segurança.");
  if (!companyName(transportBlock)) alerts.push("Transportadora não foi identificada com segurança.");
  if (!companyName(destBlock)) alerts.push("Destinatário não foi identificado com segurança.");

  return {
    numero_ticket: numeroTicket,
    status: status || null,
    placa_veiculo: placaVeiculo || fallbackPlates.find((p) => p !== placaCarreta) || null,
    placa_carreta: placaCarreta || fallbackPlates.find((p) => p !== placaVeiculo) || null,
    produto: produto || null,
    pesagem_inicial_kg: freightMode === "ton" ? pesoInicial : null,
    pesagem_inicial_data: freightMode === "ton" ? dataInicial : null,
    pesagem_final_kg: freightMode === "ton" ? pesoFinal : null,
    pesagem_final_data: freightMode === "ton" ? dataFinal : null,
    peso_liquido_kg: freightMode === "ton" ? pesoLiquido : null,
    peso_origem_kg: freightMode === "ton" ? pesoOrigem : null,
    numero_nf: numeroNf || null,
    transportadora: companyName(transportBlock),
    motorista: firstMatchIn(headerText, [/MOTORISTA\s*[:\-]?\s*([^\n]{2,100})/i])?.replace(/^[-.]\s*$/, "") || null,
    cliente: firstMatchIn(headerText, [/CLIENTE\s*[:\-]?\s*([^\n]{1,100})/i])?.replace(/^[-.]\s*$/, "") || null,
    destinatario: companyName(destBlock),
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
