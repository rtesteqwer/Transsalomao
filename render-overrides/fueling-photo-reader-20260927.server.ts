import { createHash } from "node:crypto";
import { getSalomaoOpenAIKeys, salomaoModel } from "@/lib/salomao-ai.server";

export type FuelingPhotoReading = {
  document_type: "pump_display" | "fuel_receipt" | "pos_receipt" | "invoice" | "unknown";
  date: string | null;
  time: string | null;
  station_name: string | null;
  station_cnpj: string | null;
  station_address: string | null;
  pump_number: string | null;
  nozzle_number: string | null;
  fuel_type: string | null;
  liters: string | null;
  price_per_liter: string | null;
  total_amount: string | null;
  discount_amount: string | null;
  odometer_km: number | null;
  plate: string | null;
  driver_name: string | null;
  receipt_number: string | null;
  payment_method: string | null;
  consistency: "confirmed" | "calculated" | "partial" | "conflict";
  confidence: number;
  calculation_basis: string | null;
  alerts: string[];
  visual_hints: string[];
};

export class FuelingPhotoError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export async function ensureFuelingPhotoTables(sql: any) {
  await sql`
    create table if not exists fueling_photo_files (
      id text primary key,
      source_hash text unique not null,
      file_name text not null,
      mime_type text not null,
      image_base64 text not null,
      created_at timestamptz not null default now()
    )
  `;
  await sql`
    create table if not exists fueling_photo_reads (
      id text primary key,
      file_id text unique not null references fueling_photo_files(id),
      fueling_id text,
      driver_id text,
      fleet_id text,
      document_type text,
      confidence numeric,
      status text not null,
      read_json jsonb not null,
      created_at timestamptz not null default now(),
      confirmed_at timestamptz
    )
  `;
  await sql`create index if not exists fueling_photo_reads_fueling_idx on fueling_photo_reads(fueling_id)`;
  await sql`
    create table if not exists fueling_photo_memory (
      memory_key text primary key,
      station_name text,
      station_cnpj text,
      fuel_type text,
      pump_number text,
      document_type text,
      uses integer not null default 1,
      last_seen_at timestamptz not null default now()
    )
  `;
}

export function validateFuelingImage(value: unknown) {
  if (typeof value !== "string" || !value) {
    throw new FuelingPhotoError(400, "Escolha uma foto do ticket ou da bomba.");
  }
  const match = value.match(/^data:(image\/(?:jpeg|png|webp));base64,(.*)$/s);
  if (!match) throw new FuelingPhotoError(415, "Use uma foto JPG, PNG ou WebP.");
  const mime = match[1];
  const base64 = match[2];
  if (base64.length > 3_500_000) {
    throw new FuelingPhotoError(413, "A foto ficou grande demais. Tente novamente.");
  }
  if (!base64 || base64.length % 4 !== 0 || !/^[A-Za-z0-9+/]+={0,2}$/.test(base64)) {
    throw new FuelingPhotoError(400, "A foto está inválida.");
  }
  const bytes = Buffer.from(base64, "base64");
  const valid =
    (mime === "image/jpeg" && bytes.subarray(0, 3).equals(Buffer.from([255, 216, 255]))) ||
    (mime === "image/png" && bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) ||
    (mime === "image/webp" && bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WEBP");
  if (!valid || bytes.length < 12) throw new FuelingPhotoError(415, "Formato de imagem inválido.");
  return {
    mime,
    base64,
    dataUrl: "data:" + mime + ";base64," + base64,
    sourceHash: createHash("sha256").update(bytes).digest("hex"),
  };
}

export function normalizePlate(value: unknown) {
  const plate = String(value ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  return /^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$/.test(plate) ? plate : null;
}

export function normalizeName(value: unknown) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("pt-BR")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function normalizeDecimalText(value: unknown) {
  if (value == null || value === "") return null;
  let raw = String(value).trim().replace(/\s+/g, "").replace(/^R\$/i, "").replace(/[Ll]$/i, "");
  raw = raw.replace(/[^\d.,-]/g, "");
  if (!raw || raw.startsWith("-")) return null;

  if (/^\d{1,3}(?:\.\d{3})+,\d+$/.test(raw)) {
    raw = raw.replace(/\./g, "").replace(",", ".");
  } else if (/^\d{1,3}(?:,\d{3})+\.\d+$/.test(raw)) {
    raw = raw.replace(/,/g, "");
  } else if (/^\d+,\d+$/.test(raw)) {
    raw = raw.replace(",", ".");
  } else if (/^\d{1,3}(?:\.\d{3})+$/.test(raw)) {
    raw = raw.replace(/\./g, "");
  } else if (/^\d{1,3}(?:,\d{3})+$/.test(raw)) {
    raw = raw.replace(/,/g, "");
  }

  if (!/^\d+(?:\.\d+)?$/.test(raw)) return null;
  const number = Number(raw);
  if (!Number.isFinite(number) || number <= 0 || number > 100_000_000) return null;
  return raw;
}

export function normalizeFuelingReading(value: unknown): FuelingPhotoReading {
  const source = value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
  const documentType = ["pump_display", "fuel_receipt", "pos_receipt", "invoice", "unknown"].includes(String(source.document_type))
    ? String(source.document_type) as FuelingPhotoReading["document_type"]
    : "unknown";
  const consistency = ["confirmed", "calculated", "partial", "conflict"].includes(String(source.consistency))
    ? String(source.consistency) as FuelingPhotoReading["consistency"]
    : "partial";
  const dateRaw = text(source.date, 20);
  const timeRaw = text(source.time, 20);
  const reading: FuelingPhotoReading = {
    document_type: documentType,
    date: dateRaw && /^\d{4}-\d{2}-\d{2}$/.test(dateRaw) ? dateRaw : null,
    time: timeRaw && /^\d{2}:\d{2}(?::\d{2})?$/.test(timeRaw) ? timeRaw : null,
    station_name: text(source.station_name, 220),
    station_cnpj: text(source.station_cnpj, 40),
    station_address: text(source.station_address, 350),
    pump_number: text(source.pump_number, 80),
    nozzle_number: text(source.nozzle_number, 80),
    fuel_type: text(source.fuel_type, 100),
    liters: normalizeDecimalText(source.liters),
    price_per_liter: normalizeDecimalText(source.price_per_liter),
    total_amount: normalizeDecimalText(source.total_amount),
    discount_amount: normalizeDecimalText(source.discount_amount),
    odometer_km: integer(source.odometer_km),
    plate: normalizePlate(source.plate),
    driver_name: text(source.driver_name, 180),
    receipt_number: text(source.receipt_number, 120),
    payment_method: text(source.payment_method, 80),
    consistency,
    confidence: confidence(source.confidence),
    calculation_basis: text(source.calculation_basis, 220),
    alerts: stringArray(source.alerts, 12, 220),
    visual_hints: stringArray(source.visual_hints, 12, 220),
  };

  const l = reading.liters ? Number(reading.liters) : null;
  const p = reading.price_per_liter ? Number(reading.price_per_liter) : null;
  const t = reading.total_amount ? Number(reading.total_amount) : null;
  const d = reading.discount_amount ? Number(reading.discount_amount) : 0;
  if (l && p && t) {
    const gross = l * p;
    const expectedNet = gross - d;
    const tolerance = Math.max(0.05, gross * 0.0015);
    if (Math.abs(expectedNet - t) > tolerance) {
      reading.consistency = "conflict";
      reading.alerts = unique([
        ...reading.alerts,
        d
          ? "Os valores visíveis não fecham: litros × preço/L − desconto difere do valor final. Confira a foto antes de gravar."
          : "Os valores visíveis não fecham: litros × preço/L difere do total. Confira a foto antes de gravar.",
      ]);
    } else if (reading.consistency !== "calculated") {
      reading.consistency = "confirmed";
    }
  } else if (reading.consistency === "confirmed") {
    reading.consistency = "partial";
  }
  return reading;
}

export async function readFuelingPhoto(sql: any, input: {
  imageDataUrl: string;
  selectedDriverName?: string | null;
  selectedFleetName?: string | null;
  tractorPlate?: string | null;
  trailerPlate?: string | null;
}) {
  await ensureFuelingPhotoTables(sql);
  const memories = await sql`
    select station_name,station_cnpj,fuel_type,pump_number,document_type,uses
    from fueling_photo_memory
    order by uses desc,last_seen_at desc
    limit 24
  `.catch(() => []);

  const keys = await getSalomaoOpenAIKeys();
  if (!keys.length) throw new FuelingPhotoError(503, "Leitor de abastecimento sem credencial de IA configurada.");
  const model =
    process.env.OPENAI_FUELING_MODEL?.trim() ||
    process.env.OPENAI_TICKET_MODEL?.trim() ||
    salomaoModel();

  const nullableString = { type: ["string", "null"] };
  const nullableInteger = { type: ["integer", "null"] };
  const schema = {
    type: "object",
    additionalProperties: false,
    properties: {
      document_type: { type: "string", enum: ["pump_display", "fuel_receipt", "pos_receipt", "invoice", "unknown"] },
      date: nullableString,
      time: nullableString,
      station_name: nullableString,
      station_cnpj: nullableString,
      station_address: nullableString,
      pump_number: nullableString,
      nozzle_number: nullableString,
      fuel_type: nullableString,
      liters: nullableString,
      price_per_liter: nullableString,
      total_amount: nullableString,
      discount_amount: nullableString,
      odometer_km: nullableInteger,
      plate: nullableString,
      driver_name: nullableString,
      receipt_number: nullableString,
      payment_method: nullableString,
      consistency: { type: "string", enum: ["confirmed", "calculated", "partial", "conflict"] },
      confidence: { type: "number", minimum: 0, maximum: 1 },
      calculation_basis: nullableString,
      alerts: { type: "array", items: { type: "string" }, maxItems: 12 },
      visual_hints: { type: "array", items: { type: "string" }, maxItems: 12 },
    },
    required: [
      "document_type","date","time","station_name","station_cnpj","station_address",
      "pump_number","nozzle_number","fuel_type","liters","price_per_liter","total_amount","discount_amount",
      "odometer_km","plate","driver_name","receipt_number","payment_method","consistency",
      "confidence","calculation_basis","alerts","visual_hints"
    ],
  };

  const knownMemory = Array.isArray(memories) && memories.length
    ? memories.map((row: any) =>
        "- posto=" + (row.station_name || "não identificado") +
        "; cnpj=" + (row.station_cnpj || "—") +
        "; combustível=" + (row.fuel_type || "—") +
        "; bomba=" + (row.pump_number || "—") +
        "; documento=" + (row.document_type || "—") +
        "; confirmações=" + Number(row.uses || 0)
      ).join("\n")
    : "Nenhum padrão confirmado ainda.";

  const selectedContext = [
    input.selectedDriverName ? "Motorista selecionado: " + input.selectedDriverName : "",
    input.selectedFleetName ? "Conjunto selecionado: " + input.selectedFleetName : "",
    input.tractorPlate ? "Placa do cavalo selecionado: " + input.tractorPlate : "",
    input.trailerPlate ? "Placa da carreta selecionada: " + input.trailerPlate : "",
  ].filter(Boolean).join("\n") || "Nenhum motorista/conjunto selecionado.";

  const instructions = [
    "Você é o leitor especializado de ABASTECIMENTOS da Trans Salomão.",
    "Sua função é ler fotos de tickets/cupons de postos e fotos do VISOR DA BOMBA de combustível.",
    "Extraia somente o que estiver visível. Não invente números, datas, placas ou nomes.",
    "",
    "REGRAS CRÍTICAS:",
    "1. Diferencie visor da bomba (pump_display), cupom/ticket do posto (fuel_receipt), comprovante POS (pos_receipt) e nota fiscal (invoice).",
    "2. Preserve TODOS os algarismos e casas decimais visíveis. Não arredonde litros, preço por litro nem total.",
    "3. liters é a QUANTIDADE abastecida. price_per_liter é o PREÇO UNITÁRIO por litro. total_amount é o VALOR FINAL efetivamente cobrado/pago em reais. discount_amount é o DESCONTO em reais quando estiver visível.",
    "4. Nunca confunda R$ total com litros. Em bombas, use rótulos como TOTAL/R$, LITROS/L e PREÇO/L ou a posição/layout somente quando estiver claro.",
    "5. Quando houver desconto, confira: litros × preço/L = valor bruto e valor bruto − desconto = total_amount. Exemplo: 469,325 L × 6,65 = 3.121,01; desconto 61,01; total final 3.060,00. Isso é consistency=confirmed, não conflict.",
    "6. Se exatamente um dos três valores estiver ausente e os outros dois estiverem claramente visíveis, você pode calcular o terceiro, marcar consistency=calculated e explicar calculation_basis. Nunca apresente cálculo como valor visual.",
    "7. Se só parte dos dados estiver legível, consistency=partial. É melhor null do que adivinhar.",
    "8. data em YYYY-MM-DD e hora em HH:MM ou HH:MM:SS somente quando visíveis no documento. Foto de bomba sem data impressa deve retornar date=null.",
    "9. odometer_km só pode ser odômetro real do veículo, não número da bomba, NSU, código, litros ou valor.",
    "10. plate deve ser placa brasileira de 7 caracteres somente quando estiver visível no ticket/documento. Procure rótulos PLACA, VEÍCULO, CAVALO e similares.",
    "11. fuel_type deve distinguir quando legível: Diesel S10, Diesel S500, Diesel comum, Arla 32, gasolina etc. Não presuma S10 por padrão.",
    "12. station_name e station_cnpj pertencem ao posto emissor. Não confunda adquirente/cartão/maquininha com o posto.",
    "13. receipt_number é número do cupom/documento, não CNPJ, NSU, autorização do cartão ou número da bomba.",
    "13A. Em DANFE/cupom de posto, DESTINATÁRIO, CLIENTE ou MOTORISTA pode indicar driver_name somente quando for claramente uma pessoa. Não use o nome do posto como motorista.",
    "14. visual_hints deve registrar rótulos/layout úteis para reconhecer novamente o mesmo padrão, sem copiar valores transacionais.",
    "15. confidence >= 0.90 somente quando litros e preço/L estiverem legíveis com segurança.",
    "16. O contexto selecionado serve somente para desambiguar placa/nome VISÍVEL. Nunca preencha dado ausente só porque o usuário selecionou um conjunto.",
    "17. Em DANFE Simplificado de combustível, leia a linha do produto: QTD = litros, VL.UNIT = preço por litro e VL.TOTAL da linha = valor bruto. Depois leia Valor Descontos R$ como discount_amount e Valor Total R$ como total_amount final.",
    "18. Em DANFE, procure PLACA para identificar o veículo. Se DESTINATÁRIO/CLIENTE mostrar uma pessoa que coincide com motorista cadastrado, use esse nome em driver_name; não use o emitente/posto.",
    "19. UMA MESMA COMPRA pode aparecer em várias fotos: visor da bomba, comprovante Cielo/Getnet, DANFE/cupom e ordem de abastecimento. Trate esses documentos como evidências do mesmo abastecimento quando os números visíveis forem compatíveis; não invente uma segunda compra só porque o tipo de documento mudou.",
    "20. Se a MESMA FOTO mostrar visor da bomba e comprovante POS, combine as fontes: use litros/preço/total do visor e use data, hora, posto e forma de pagamento do comprovante. O valor pago no POS deve ser comparado ao total do visor.",
    "21. Em visores Wayne/Shell semelhantes aos exemplos confirmados, o campo grande superior sob R$ é o TOTAL A PAGAR, o campo grande do meio é LITROS e o visor pequeno inferior em R$ é o PREÇO POR LITRO. Exemplos de layout já confirmados: 3420,41 / 519,03 / 6,590 e 1000,00 / 151,745 / 6,590. Use os exemplos somente para entender o layout; nunca copie esses números para outra foto.",
    "22. Em ordens COOSSUTRAN, leia DIESEL como litros, o R$ da mesma linha como preço por litro, o TOTAL de litros no centro, o TOTAL R$ no canto inferior direito, Veículo Placa no canto inferior esquerdo e DIA/MÊS/ANO na base. Exemplos confirmados incluem QWS-3E13 com 465,000 L a 6,30 = 2929,50 e 44,120 L a 2,80 = 123,54; use apenas como padrão de layout.",
    "23. Em documentos do Posto Rosalem/Fred Rosalem Heliodoro, a linha do combustível e os totais podem ter desconto. Valor Total dos Produtos é o bruto; Valor Descontos R$ é o desconto; Valor Total R$ é o valor efetivamente pago. Um comprovante Getnet/Cielo sobreposto pode confirmar data/hora e valor final, mas não substitui a leitura dos litros.",
    "24. Se houver duas fotos muito parecidas do mesmo DANFE/cupom, receipt_number, data, litros, preço/L, placa e valores iguais são sinais fortes de duplicidade/vinculação; preserve os dados e deixe a API de gravação vincular ao mesmo abastecimento.",
    "",
    "CONTEXTO SELECIONADO:",
    selectedContext,
    "",
    "PADRÕES CONFIRMADOS ANTERIORMENTE:",
    knownMemory,
    "",
    "Use padrões anteriores apenas para reconhecer posto/layout/combustível/bomba quando a foto atual tiver sinais compatíveis. " +
      "NUNCA copie litros, preço, total, data, hora, odômetro ou número de cupom de leitura antiga.",
  ].join("\n");

  const requestBody = JSON.stringify({
    model,
    reasoning: { effort: "medium" },
    instructions,
    input: [{
      role: "user",
      content: [
        { type: "input_text", text: "Leia esta foto de abastecimento com máxima precisão." },
        { type: "input_image", image_url: input.imageDataUrl, detail: "high" },
      ],
    }],
    text: { format: { type: "json_schema", name: "trans_salomao_fueling_photo", strict: true, schema } },
    max_output_tokens: 2200,
  });

  let sawQuotaError = false;
  let sawTimeout = false;
  for (const key of keys.slice(0, 2)) {
    let response: Response;
    try {
      response = await fetch("https://api.openai.com/v1/responses", {
        method: "POST",
        signal: AbortSignal.timeout(45_000),
        headers: { Authorization: "Bearer " + key, "Content-Type": "application/json" },
        body: requestBody,
      });
    } catch (error) {
      if (error instanceof DOMException && error.name === "TimeoutError") {
        sawTimeout = true;
        continue;
      }
      throw error;
    }

    const payload: any = await response.json().catch(() => ({}));
    if (!response.ok) {
      console.error("[fueling-photo] OpenAI error", response.status, JSON.stringify(payload).slice(0, 700));
      if (
        response.status === 429 ||
        payload?.error?.code === "credit_balance_exhausted" ||
        payload?.error?.type === "insufficient_quota"
      ) {
        sawQuotaError = true;
        continue;
      }
      continue;
    }

    const out = outputText(payload);
    if (!out) continue;
    try {
      return normalizeFuelingReading(JSON.parse(out));
    } catch {
      continue;
    }
  }

  if (sawQuotaError) {
    throw new FuelingPhotoError(429, "Créditos da IA online indisponíveis. O aplicativo vai tentar a leitura local da foto.");
  }
  if (sawTimeout) {
    throw new FuelingPhotoError(504, "A leitura online demorou demais. Tente novamente.");
  }
  throw new FuelingPhotoError(502, "A IA não conseguiu ler a foto agora. Tente novamente.");
}

export function fuelingPhotoErrorResponse(error: unknown) {
  if (error instanceof FuelingPhotoError) {
    return Response.json({ ok: false, message: error.message }, { status: error.status, headers: { "Cache-Control": "no-store" } });
  }
  console.error("[fueling-photo] failed", error instanceof Error ? error.message : error);
  return Response.json(
    { ok: false, message: "Não foi possível concluir a leitura do abastecimento." },
    { status: 503, headers: { "Cache-Control": "no-store" } },
  );
}

function text(value: unknown, max: number) {
  if (typeof value !== "string" && typeof value !== "number") return null;
  const out = String(value).trim().slice(0, max);
  return out || null;
}

function integer(value: unknown) {
  if (value == null || value === "") return null;
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0 || number > 2_147_483_647) return null;
  return Math.round(number);
}

function confidence(value: unknown) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return Math.max(0, Math.min(1, number));
}

function stringArray(value: unknown, maxItems: number, maxLength: number) {
  if (!Array.isArray(value)) return [];
  return unique(
    value
      .filter((item) => typeof item === "string" || typeof item === "number")
      .map((item) => String(item).trim().slice(0, maxLength))
      .filter(Boolean)
      .slice(0, maxItems),
  );
}

function unique<T>(items: T[]) {
  return [...new Set(items)];
}

function outputText(value: any) {
  if (typeof value?.output_text === "string" && value.output_text.trim()) return value.output_text.trim();
  const parts: string[] = [];
  for (const item of Array.isArray(value?.output) ? value.output : []) {
    if (item?.type !== "message") continue;
    for (const part of Array.isArray(item?.content) ? item.content : []) {
      if (part?.type === "output_text" && typeof part.text === "string") parts.push(part.text);
    }
  }
  return parts.join("").trim();
}
