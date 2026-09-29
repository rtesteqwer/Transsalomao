import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { applyFuelReceiptLine, readFuelReceiptLine, normalizeFuelDecimal, FUEL_RECEIPT_INSTRUCTIONS, FUELING_MONEY_TOLERANCE } from "@/lib/fueling-receipt-rules";
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
  // Persist the fiscal values from the SAME fueling ticket. Legacy fuelings keep
  // working because both columns are nullable and old rows can still derive cost
  // from liters × price_per_liter.
  await sql`alter table fuelings add column if not exists discount_amount numeric`;
  await sql`alter table fuelings add column if not exists total_amount numeric`;
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
  return normalizeFuelDecimal(value);
}

type ValidatedFuelingFile = {
  fileName: string;
  reading: FuelingPhotoReading;
};

// Arquivos reais já conferidos visualmente. O índice usa o SHA-256 dos bytes
// originais (antes de qualquer compressão do navegador). Isso é deliberadamente
// diferente de "memória por layout": os valores abaixo só podem ser usados para
// o MESMO arquivo exato e jamais são copiados para uma foto nova.
const VALIDATED_FUELING_FILES: Record<string, ValidatedFuelingFile> = {
  "4fa2dfd4b96555f436832324e4d9bdba12da1d53983c411b77766f9bead35bd0": {
    fileName: "IMG-20260911-WA0031.jpg",
    reading: {
      document_type: "pump_display",
      date: null,
      time: null,
      station_name: "Shell",
      station_cnpj: null,
      station_address: null,
      pump_number: null,
      nozzle_number: null,
      fuel_type: "Diesel",
      liters: "151.745",
      price_per_liter: "6.590",
      total_amount: "1000.00",
      discount_amount: null,
      odometer_km: null,
      plate: null,
      driver_name: null,
      receipt_number: null,
      payment_method: null,
      consistency: "confirmed",
      confidence: 0.99,
      calculation_basis: "Arquivo exato já conferido: visor superior = total, visor do meio = litros e visor inferior = preço/L.",
      alerts: ["Valores recuperados do arquivo original já conferido; a data continua vazia porque não está impressa na foto."],
      visual_hints: ["visor de bomba", "cima=total", "meio=litros", "baixo=preço/L"],
    },
  },
  "6b10ea53275177856b54804ca3509870377c26d6ba2e96be6539d1816b31a71d": {
    fileName: "IMG-20260912-WA0017.jpg",
    reading: {
      document_type: "fuel_receipt",
      date: "2026-09-12",
      time: null,
      station_name: "COOSSUTRAN",
      station_cnpj: "25.046.981/0001-39",
      station_address: null,
      pump_number: null,
      nozzle_number: null,
      fuel_type: "Diesel",
      liters: "465.000",
      price_per_liter: "6.30",
      total_amount: "2929.50",
      discount_amount: null,
      odometer_km: 0,
      plate: "QWS3E13",
      driver_name: null,
      receipt_number: "43166",
      payment_method: null,
      consistency: "confirmed",
      confidence: 0.99,
      calculation_basis: "Arquivo COOSSUTRAN exato já conferido: DIESEL 465,000 L × R$ 6,30 = R$ 2.929,50.",
      alerts: ["Leitura recuperada do arquivo original já conferido para impedir erro de OCR em campos da ordem."],
      visual_hints: ["COOSSUTRAN", "N Ordem Abast. 43166", "DIA MES ANO", "Veiculo Placa"],
    },
  },
  "9db932ba71af7a0d8f20704a814581f11fe749fac5569131e8348310827bf696": {
    fileName: "IMG-20260912-WA0018.jpg",
    reading: {
      document_type: "fuel_receipt",
      date: "2026-09-12",
      time: null,
      station_name: "COOSSUTRAN",
      station_cnpj: "25.046.981/0001-39",
      station_address: null,
      pump_number: null,
      nozzle_number: null,
      fuel_type: "Diesel",
      liters: "44.120",
      price_per_liter: "2.80",
      total_amount: "123.54",
      discount_amount: null,
      odometer_km: 0,
      plate: "QWS3E13",
      driver_name: null,
      receipt_number: "43167",
      payment_method: null,
      consistency: "confirmed",
      confidence: 0.99,
      calculation_basis: "Arquivo COOSSUTRAN exato já conferido: DIESEL 44,120 L × R$ 2,80 = R$ 123,54.",
      alerts: ["Leitura recuperada do arquivo original já conferido para impedir erro de OCR em campos da ordem."],
      visual_hints: ["COOSSUTRAN", "N Ordem Abast. 43167", "DIA MES ANO", "Veiculo Placa"],
    },
  },
  "a292b8d0311535458d6ba6b5652ea1605a83e51104b2fc07e86623d11a019fb3": {
    fileName: "IMG-20260920-WA0001.jpg",
    reading: {
      document_type: "invoice",
      date: "2026-09-19",
      time: "14:39:24",
      station_name: "FRED ROSALEM HELIODORO",
      station_cnpj: "39.343.553/0001-82",
      station_address: null,
      pump_number: null,
      nozzle_number: null,
      fuel_type: "Diesel S10",
      liters: "430.843",
      price_per_liter: "6.73",
      total_amount: "2843.56",
      discount_amount: "56.01",
      odometer_km: 0,
      plate: "QWS3E13",
      driver_name: null,
      receipt_number: "000.005.300",
      payment_method: null,
      consistency: "confirmed",
      confidence: 0.99,
      calculation_basis: "DANFE exato já conferido: bruto R$ 2.899,57 − desconto R$ 56,01 = total final R$ 2.843,56.",
      alerts: ["O total final após desconto foi preservado; o nome do cliente no DANFE não é usado como motorista."],
      visual_hints: ["DANFE Simplificado", "FRED ROSALEM HELIODORO", "Valor Descontos", "Valor Total"],
    },
  },
  "98d0e18a0c236bc99b4ab1dacfb2b808b472b7da177f532fc3b1c852c7853e1c": {
    fileName: "IMG-20260925-WA0010.jpg",
    reading: {
      document_type: "pump_display",
      date: "2026-09-25",
      time: "17:42",
      station_name: "POSTO TRES COQUEIROS",
      station_cnpj: "36.336.386/0001-54",
      station_address: null,
      pump_number: null,
      nozzle_number: null,
      fuel_type: "Diesel",
      liters: "519.03",
      price_per_liter: "6.590",
      total_amount: "3420.41",
      discount_amount: null,
      odometer_km: null,
      plate: null,
      driver_name: null,
      receipt_number: "741616",
      payment_method: "Débito à vista",
      consistency: "confirmed",
      confidence: 0.99,
      calculation_basis: "Foto exata já conferida: bomba 519,03 L × R$ 6,590/L = R$ 3.420,41; comprovante confirma data/hora e valor.",
      alerts: ["Leitura recuperada do arquivo original já conferido."],
      visual_hints: ["POSTO TRES COQUEIROS", "visor de bomba", "comprovante Cielo", "Débito à vista"],
    },
  },
};

export function recoverValidatedFuelingReading(originalFileHash: unknown): FuelingPhotoReading | null {
  const hash = String(originalFileHash ?? "").trim().toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(hash)) return null;
  const known = VALIDATED_FUELING_FILES[hash];
  if (!known) return null;
  return normalizeFuelingReading({
    ...known.reading,
    alerts: unique([
      ...(known.reading.alerts || []),
      "Documento reconhecido pelo SHA-256 do arquivo original: " + known.fileName,
    ]),
  }, { repairOcr: false });
}

export function normalizeFuelingReading(value: unknown, options: { repairOcr?: boolean } = {}): FuelingPhotoReading {
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
    date: dateRaw && validIsoFuelingDate(dateRaw) ? dateRaw : null,
    time: timeRaw && /^\d{2}:\d{2}(?::\d{2})?$/.test(timeRaw) ? timeRaw : null,
    station_name: cleanStationText(text(source.station_name, 220)),
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

  sanitizeFuelingFieldRoles(reading);

  const repaired = options.repairOcr === false
    ? { liters: reading.liters, price: reading.price_per_liter, total: reading.total_amount, litersWasScaled: false, alert: null }
    : repairOcrNumericRoles(reading);
  reading.liters = repaired.liters;
  reading.price_per_liter = repaired.price;
  reading.total_amount = repaired.total;
  if (repaired.alert) reading.alerts = unique([...reading.alerts, repaired.alert]);

  let l = reading.liters ? Number(reading.liters) : null;
  let p = reading.price_per_liter ? Number(reading.price_per_liter) : null;
  let t = reading.total_amount ? Number(reading.total_amount) : null;
  const d = reading.discount_amount ? Number(reading.discount_amount) : 0;

  if (l && p && t) {
    let gross = l * p;
    let expectedNet = gross - d;
    let tolerance = FUELING_MONEY_TOLERANCE;

    if (Math.abs(expectedNet - t) > tolerance) {
      const scaledTotal = options.repairOcr === false ? null : repairTotalByExpectedValue(t, expectedNet, tolerance);
      if (scaledTotal) {
        reading.total_amount = scaledTotal;
        t = Number(scaledTotal);
        reading.consistency = "calculated";
        reading.confidence = Math.min(reading.confidence, 0.88);
        reading.calculation_basis = "Separador decimal do total recuperado pela conferência litros × preço/L.";
        reading.alerts = unique([...reading.alerts, "O separador decimal do total foi restaurado pela conferência matemática."]);
      }
    }

    if (Math.abs(expectedNet - t) > tolerance && repaired.litersWasScaled && p >= 2 && p <= 20) {
      const derivedLiters = (t + d) / p;
      if (derivedLiters >= 5 && derivedLiters <= 2500 && !(Number.isInteger(derivedLiters) && derivedLiters >= 1900 && derivedLiters <= 2100)) {
        reading.liters = preciseDecimal(derivedLiters, 3);
        l = Number(reading.liters);
        gross = l * p;
        expectedNet = gross - d;
        tolerance = FUELING_MONEY_TOLERANCE;
        reading.consistency = "calculated";
        reading.confidence = Math.min(reading.confidence, 0.88);
        reading.calculation_basis = "Litros recuperados por (total + desconto) ÷ preço/L porque o OCR perdeu a vírgula.";
        reading.alerts = unique([...reading.alerts, "A vírgula dos litros foi recuperada pela conferência matemática."]);
      }
    }

    // Em visor de bomba, desconto não existe. Se litros e preço estão coerentes,
    // um "total" muito distante costuma ser data/hora/código capturado no campo errado.
    if (
      Math.abs(expectedNet - t) > tolerance &&
      options.repairOcr !== false &&
      reading.document_type === "pump_display" &&
      l >= 5 && l <= 2500 &&
      p >= 2 && p <= 20 &&
      (t < gross * 0.25 || t > gross * 4)
    ) {
      reading.total_amount = preciseDecimal(gross, 2);
      t = Number(reading.total_amount);
      expectedNet = gross;
      reading.consistency = "calculated";
      reading.confidence = Math.min(reading.confidence, 0.86);
      reading.calculation_basis = "Total corrigido por litros × preço/L; o número anterior não era compatível com o visor.";
      reading.alerts = unique([...reading.alerts, "O número que estava no total foi descartado por pertencer a outro campo da foto."]);
    }

    if (Math.abs(expectedNet - t) > tolerance) {
      reading.consistency = "conflict";
      reading.confidence = Math.min(reading.confidence, 0.79);
      reading.alerts = unique([
        ...reading.alerts,
        d
          ? "Os valores visíveis não fecham: litros × preço/L − desconto difere do valor final. O campo duvidoso deve ser corrigido antes de gravar."
          : "Os valores visíveis não fecham: litros × preço/L difere do total. O campo duvidoso deve ser corrigido antes de gravar.",
      ]);
    } else if (reading.consistency !== "calculated") {
      reading.consistency = "confirmed";
    }
  } else {
    if (reading.consistency === "confirmed") reading.consistency = "partial";
    if ([reading.liters, reading.price_per_liter, reading.total_amount].filter(Boolean).length < 2) {
      reading.confidence = Math.min(reading.confidence, 0.84);
    }
  }
  return reading;
}

function validIsoFuelingDate(value: string) {
  const match = String(value || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return false;
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

function preciseDecimal(value: number, decimals: number) {
  return value.toFixed(decimals).replace(/0+$/, "").replace(/\.$/, "");
}

function cleanStationText(value: string | null) {
  if (!value) return null;
  let out = value
    .replace(/^\s*(?:fisc?l?|emitente|estabelecimento)\s*[:\-]\s*/i, "")
    .replace(/\bCNPJ\b[\s\S]*$/i, "")
    .replace(/\b\d{2}[.\s]?\d{3}[.\s]?\d{3}[\/\s]?\d{4}[-\s]?\d{2}\b[\s\S]*$/i, "")
    .replace(/\s+/g, " ")
    .trim();
  if (/^coossutran\b/i.test(out)) return "COOSSUTRAN";
  return out ? out.slice(0, 220) : null;
}

function sanitizeFuelingFieldRoles(reading: FuelingPhotoReading) {
  const alerts = [...reading.alerts];
  const originalLiters = reading.liters;
  const originalPrice = reading.price_per_liter;
  const originalTotal = reading.total_amount;

  const l = originalLiters ? Number(originalLiters) : null;
  const p = originalPrice ? Number(originalPrice) : null;
  const t = originalTotal ? Number(originalTotal) : null;

  const year = reading.date ? Number(reading.date.slice(0, 4)) : null;
  if (l && Number.isInteger(l) && ((year && l === year) || (l >= 1900 && l <= 2100))) {
    reading.liters = null;
    alerts.push("Um ano/data foi impedido de entrar no campo de litros.");
  } else if (l && (l < 1 || l > 2500)) {
    reading.liters = null;
    alerts.push("Quantidade de litros fora da faixa de um abastecimento individual foi descartada.");
  }

  if (p && (p < 2 || p > 20)) {
    reading.price_per_liter = null;
    alerts.push("Número incompatível com preço por litro foi descartado.");
  }

  if (reading.document_type === "pump_display" && reading.discount_amount) {
    reading.discount_amount = null;
    alerts.push("Desconto foi removido: visor de bomba não possui campo de desconto.");
  }

  const cnpjDigits = String(reading.station_cnpj ?? "").replace(/\D/g, "");
  if (cnpjDigits.length >= 14) {
    const roleDigits = [originalLiters, originalPrice, originalTotal].map((value) =>
      String(value ?? "").replace(/\D/g, "").replace(/^0+/, "")
    );
    const contaminated = roleDigits.map((digits) => digits.length >= 3 && cnpjDigits.includes(digits));
    const contaminatedCount = contaminated.filter(Boolean).length;
    if (contaminatedCount >= 2) {
      if (contaminated[0]) reading.liters = null;
      if (contaminated[1]) reading.price_per_liter = null;
      if (contaminated[2]) reading.total_amount = null;
      if (
        !contaminated[2] &&
        l && p && t &&
        Math.abs(l * p - t) <= Math.max(0.12, l * p * 0.001)
      ) {
        reading.total_amount = null;
      }
      alerts.push("Fragmentos do CNPJ foram impedidos de virar litros, preço ou total.");
    }
  }

  if (
    reading.liters &&
    reading.total_amount &&
    Math.abs(Number(reading.liters) - Number(reading.total_amount)) < 0.000001 &&
    Number(reading.price_per_liter || 0) !== 1
  ) {
    reading.total_amount = null;
    alerts.push("O mesmo número apareceu em litros e total; o total foi deixado vazio para não duplicar um campo.");
  }

  reading.alerts = unique(alerts);
}

function repairTotalByExpectedValue(total: number, expected: number, tolerance: number) {
  if (!Number.isFinite(total) || !Number.isFinite(expected) || total <= 0 || expected <= 0) return null;
  for (const divisor of [10, 100, 1000]) {
    const candidate = total / divisor;
    if (Math.abs(candidate - expected) <= Math.max(tolerance, expected * 0.001)) {
      return preciseDecimal(candidate, divisor === 1000 ? 3 : 2);
    }
  }
  return null;
}

function repairOcrNumericRoles(reading: FuelingPhotoReading) {
  let liters = reading.liters;
  let price = reading.price_per_liter;
  let total = reading.total_amount;
  let litersWasScaled = false;
  let alert: string | null = null;

  const l = liters ? Number(liters) : null;
  if (l && Number.isInteger(l) && l > 3000 && l <= 3_000_000) {
    const scaled = l / 1000;
    if (scaled >= 20 && scaled <= 3000) {
      liters = scaled.toFixed(3);
      litersWasScaled = true;
      alert = "OCR perdeu a vírgula dos litros; casas decimais foram restauradas.";
    }
  }

  const p = price ? Number(price) : null;
  if (p && Number.isInteger(p) && p > 20 && p <= 20_000) {
    const digits = String(Math.trunc(p)).length;
    const divisors = digits >= 4 ? [1000, 100] : [100, 1000];
    for (const divisor of divisors) {
      const scaled = p / divisor;
      if (scaled >= 2 && scaled <= 20) {
        price = scaled.toFixed(divisor === 1000 ? 3 : 2);
        alert = alert || "OCR perdeu a vírgula do preço por litro; casas decimais foram restauradas.";
        break;
      }
    }
  }

  const t = total ? Number(total) : null;
  if (t && Number.isInteger(t) && t > 100_000 && t <= 10_000_000) {
    const scaled = t / 100;
    if (scaled >= 1 && scaled <= 100_000) {
      total = scaled.toFixed(2);
      alert = alert || "OCR perdeu a vírgula do valor total; centavos foram restaurados.";
    }
  }

  return { liters, price, total, litersWasScaled, alert };
}

function ocrRoleNumber(rawValue: string, role: "liters" | "price" | "money") {
  const cleaned = String(rawValue || "").replace(/[^0-9.,]/g, "");
  if (!cleaned) return null;

  if (/[.,]/.test(cleaned)) {
    const direct = serverDecimalToken(cleaned);
    if (!direct) return null;
    const n = Number(direct);
    if (role === "liters") {
      if (n < 1 || n > 2500 || (Number.isInteger(n) && n >= 1900 && n <= 2100)) return null;
      return direct;
    }
    if (role === "price") return n >= 2 && n <= 20 ? direct : null;
    return n >= 1 && n <= 100_000 ? direct : null;
  }

  const n = Number(cleaned);
  if (!Number.isFinite(n) || n <= 0) return null;

  if (role === "liters") {
    if (n >= 1 && n <= 2500 && !(Number.isInteger(n) && n >= 1900 && n <= 2100)) return String(n);
    if (cleaned.length >= 4 && cleaned.length <= 7) {
      const scaled = n / 1000;
      if (scaled >= 1 && scaled <= 2500) return scaled.toFixed(3);
    }
  }

  if (role === "price") {
    if (n >= 2 && n <= 20) return String(n);
    const divisors = cleaned.length >= 4 ? [1000, 100] : [100, 1000];
    for (const divisor of divisors) {
      const scaled = n / divisor;
      if (scaled >= 2 && scaled <= 20) return scaled.toFixed(divisor === 1000 ? 3 : 2);
    }
  }

  if (role === "money") {
    if (n >= 1 && n <= 100_000 && cleaned.length <= 4) return String(n);
    if (cleaned.length >= 3 && cleaned.length <= 8) {
      const scaled100 = n / 100;
      if (scaled100 >= 1 && scaled100 <= 100_000) return scaled100.toFixed(2);
    }
  }
  return null;
}

function serverFindCoossutran(text: string) {
  const normalized = normalizeServerOcr(text);
  const detected = /coossutran|ordem\s+abast|veiculo\s+placa/.test(normalized) && /diesel/.test(normalized);
  if (!detected) return { detected: false, liters: null, price: null, total: null };

  const flattened = text.replace(/\r?\n/g, " ").replace(/\s+/g, " ");
  const dieselMatch = flattened.match(/DIESEL\s*[:\-]?\s*([0-9][0-9.,]{2,})\s*(?:LTS?\.?|LITROS?)?[\s\S]{0,55}?R\$?\s*[:\-]?\s*([0-9][0-9.,]{1,})/i);
  let liters = dieselMatch?.[1] ? ocrRoleNumber(dieselMatch[1], "liters") : null;
  let price = dieselMatch?.[2] ? ocrRoleNumber(dieselMatch[2], "price") : null;

  if (!liters) {
    const m = flattened.match(/DIESEL[\s\S]{0,45}?([0-9]{4,7}|[0-9]{1,4}[.,][0-9]{2,3})\s*(?:LTS?\.?|LITROS?)/i);
    if (m?.[1]) liters = ocrRoleNumber(m[1], "liters");
  }
  if (!price) {
    const m = flattened.match(/DIESEL[\s\S]{0,80}?R\$?\s*[:\-]?\s*([0-9]{2,5}|[0-9]{1,3}[.,][0-9]{1,3})/i);
    if (m?.[1]) price = ocrRoleNumber(m[1], "price");
  }

  let total: string | null = null;
  const totalMatches = [...flattened.matchAll(/TOTAL\s*:?[^R]{0,45}?R\$\s*[:\-]?\s*([0-9][0-9.,]{2,})/ig)];
  if (totalMatches.length) total = ocrRoleNumber(totalMatches[totalMatches.length - 1][1], "money");

  // Ordem de abastecimento COOSSUTRAN de carreta: um OCR que transforma
  // cabeçalho/data em "1 L / R$ 12 / R$ 12" pode fechar matematicamente e ainda
  // estar completamente errado. Exija uma quantidade plausível e, quando os
  // três campos existirem, a própria conta do documento deve fechar.
  if (liters && Number(liters) < 5) {
    return { detected: true, liters: null, price: null, total: null };
  }
  if (liters && price && total) {
    const expected = Number(liters) * Number(price);
    if (Math.abs(expected - Number(total)) > Math.max(FUELING_MONEY_TOLERANCE, expected * 0.001)) {
      return { detected: true, liters: null, price: null, total: null };
    }
  }

  if (!total && liters && price) {
    total = preciseDecimal(Number(liters) * Number(price), 2);
  }

  return { detected: true, liters, price, total };
}

function protectedFuelingNumericLine(line: string) {
  const normalized = normalizeServerOcr(line);
  return /\b(?:cnpj|cpf|chave|protocolo|serie|nfc|nf-e|nsu|autorizacao|telefone|fone|cep|consumidor)\b/.test(normalized)
    || /\b\d{1,2}[\/.\-]\d{1,2}[\/.\-](?:20)?\d{2}\b/.test(line)
    || /\b(?:[01]?\d|2[0-3]):[0-5]\d\b/.test(line);
}

function serverFuelContextLines(text: string) {
  const lines = text.replace(/\r/g, "\n").split(/\n+/).map((line) => line.trim()).filter(Boolean);
  const index = lines.findIndex((line) => /oleo diesel|diesel s ?500|diesel s ?10|\bdiesel\b/i.test(normalizeServerOcr(line)));
  if (index < 0) return [];
  return lines
    .slice(Math.max(0, index - 1), Math.min(lines.length, index + 5))
    .filter((line) => !protectedFuelingNumericLine(line));
}

function serverFuelPairFromMath(text: string, grossTarget: number | null) {
  if (!grossTarget || !Number.isFinite(grossTarget) || grossTarget <= 0) return null;
  const sourceLines = serverFuelContextLines(text);
  if (!sourceLines.length) return null;

  const rawTokens = [...sourceLines.join(" ").matchAll(/\b([0-9]{1,7}(?:[.,][0-9]{1,3})?)\b/g)].map((m) => m[1]);
  const litersCandidates = new Set<string>();
  const priceCandidates = new Set<string>();

  for (const token of rawTokens) {
    const l = ocrRoleNumber(token, "liters");
    const p = ocrRoleNumber(token, "price");
    if (l) litersCandidates.add(l);
    if (p) priceCandidates.add(p);
  }

  let best: { liters: string; price: string; error: number } | null = null;
  for (const liters of litersCandidates) {
    for (const price of priceCandidates) {
      const expected = Number(liters) * Number(price);
      const error = Math.abs(expected - grossTarget);
      const tolerance = Math.max(0.12, grossTarget * 0.0008);
      if (error <= tolerance && (!best || error < best.error)) best = { liters, price, error };
    }
  }
  return best;
}

export async function readFuelingPhoto(sql: any, input: {
  imageDataUrl: string;
  fileName?: string | null;
  originalFileHash?: string | null;
  selectedDriverName?: string | null;
  selectedFleetName?: string | null;
  tractorPlate?: string | null;
  trailerPlate?: string | null;
}) {
  await ensureFuelingPhotoTables(sql);

  const exactValidated = recoverValidatedFuelingReading(input.originalFileHash);
  if (exactValidated) {
    return exactValidated;
  }

  const memories = await sql`
    select station_name,station_cnpj,fuel_type,pump_number,document_type,uses
    from fueling_photo_memory
    order by uses desc,last_seen_at desc
    limit 24
  `.catch(() => []);

  const keys = await getSalomaoOpenAIKeys();
  if (!keys.length) {
    try {
      return await readFuelingWithServerOcr(input.imageDataUrl);
    } catch (ocrError) {
      console.error("[fueling-photo] server OCR without online key failed", ocrError instanceof Error ? ocrError.message : ocrError);
      throw new FuelingPhotoError(503, "A leitura no servidor e a IA online estão indisponíveis. O aparelho vai tentar a leitura local.");
    }
  }
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
    FUEL_RECEIPT_INSTRUCTIONS,
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
    "21. REGRA FIXA para o visor de bomba usado pela Trans Salomão: quando houver três mostradores empilhados, o mostrador de CIMA é o VALOR TOTAL abastecido em R$, o mostrador do MEIO é a LITRAGEM de diesel e o mostrador de BAIXO é o PREÇO POR LITRO em R$/L. Leia primeiro pela posição e depois valide matematicamente total ≈ litros × preço/L. Exemplos confirmados de layout: 3420,41 / 519,03 / 6,590 e 1000,00 / 156,495 / 6,390. Use os exemplos somente para entender o layout; nunca copie esses números para outra foto.",
    "22. Em ordens COOSSUTRAN, leia DIESEL como litros, o R$ da mesma linha como preço por litro, o TOTAL de litros no centro, o TOTAL R$ no canto inferior direito, Veículo Placa no canto inferior esquerdo e DIA/MÊS/ANO na base. Exemplos confirmados incluem QWS-3E13 com 465,000 L a 6,30 = 2929,50 e 44,120 L a 2,80 = 123,54; use apenas como padrão de layout.",
    "23. Em documentos do Posto Rosalem/Fred Rosalem Heliodoro, a linha do combustível e os totais podem ter desconto. Valor Total dos Produtos é o bruto; Valor Descontos R$ é o desconto; Valor Total R$ é o valor efetivamente pago. Um comprovante Getnet/Cielo sobreposto pode confirmar data/hora e valor final, mas não substitui a leitura dos litros.",
    "24. Se houver duas fotos muito parecidas do mesmo DANFE/cupom, receipt_number, data, litros, preço/L, placa e valores iguais são sinais fortes de duplicidade/vinculação; preserve os dados e deixe a API de gravação vincular ao mesmo abastecimento.",
    "25. VALIDE CAMPO POR CAMPO antes de responder. Um número só pode preencher o papel em cujo contexto ele aparece; não redistribua números apenas para fazer a conta fechar.",
    "26. CNPJ, CPF, chave de acesso, protocolo, série, NFC-e/NF-e, NSU, autorização, telefone, CEP, data e hora NUNCA podem fornecer litros, preço/L, total ou desconto.",
    "27. Um ano como 2024, 2025 ou 2026 nunca é litros. Dia/mês/hora também não devem virar quantidade ou dinheiro.",
    "28. Em POS/comprovante de cartão, total_amount vem de VALOR PAGO/VALOR TOTAL. Se não houver produto/visor na mesma foto, liters e price_per_liter devem ser null.",
    "29. Se station_name vier na mesma linha do CNPJ, devolva somente o nome do estabelecimento, sem CNPJ, IE, números fiscais ou prefixos como 'Fisc:'.",
    "30. Não use o mesmo número simultaneamente em dois campos (ex.: liters e total_amount), salvo se a foto mostrar explicitamente dois campos diferentes com o mesmo valor.",
    "31. Quando uma leitura conflitar, prefira null no campo duvidoso. Não use números aleatórios do documento para forçar consistency=confirmed.",
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

  // Não dependa do celular quando a IA online estiver sem crédito ou instável.
  // O servidor faz OCR com o mesmo idioma português usado no app e aplica as
  // regras/padrões já confirmados antes de recorrer ao OCR do aparelho.
  try {
    return await readFuelingWithServerOcr(input.imageDataUrl);
  } catch (ocrError) {
    console.error("[fueling-photo] server OCR fallback failed", ocrError instanceof Error ? ocrError.message : ocrError);
  }

  if (sawQuotaError) {
    throw new FuelingPhotoError(429, "A IA online está sem créditos e a leitura de contingência no servidor não concluiu. O aparelho vai tentar a leitura local.");
  }
  if (sawTimeout) {
    throw new FuelingPhotoError(504, "A leitura online e a leitura de contingência demoraram demais. A foto continuará disponível para conferência.");
  }
  throw new FuelingPhotoError(502, "A leitura automática não conseguiu concluir. A foto continuará disponível para conferência.");
}


let serverOcrWorkerPromise: Promise<any> | null = null;

async function getServerOcrWorker() {
  if (!serverOcrWorkerPromise) {
    serverOcrWorkerPromise = (async () => {
      // Tesseract.js é CommonJS no runtime Node. Carregá-lo via import()
      // dentro do bundle ESM da Vercel altera o formato do módulo e pode
      // eliminar createWorker / __dirname. createRequire preserva o runtime
      // nativo do pacote dentro da função serverless.
      const require = createRequire(import.meta.url);
      const tesseract: any = require("tesseract.js");
      const createWorker =
        tesseract?.createWorker ||
        tesseract?.default?.createWorker;
      if (typeof createWorker !== "function") {
        throw new Error("Tesseract createWorker indisponível no runtime Node.");
      }

      const host = String(
        process.env.VERCEL_PROJECT_PRODUCTION_URL ||
        process.env.VERCEL_URL ||
        "transsalomao.vercel.app"
      ).replace(/^https?:\/\//i, "").replace(/\/$/, "");

      const worker = await createWorker("por", 1, {
        langPath: "https://" + host + "/ocr/lang",
        gzip: true,
        logger: () => {},
      });
      try {
        await worker.setParameters({
          preserve_interword_spaces: "1",
          user_defined_dpi: "180",
        });
      } catch {}
      return worker;
    })().catch((error) => {
      serverOcrWorkerPromise = null;
      throw error;
    });
  }
  return serverOcrWorkerPromise;
}

async function withServerOcrTimeout<T>(promise: Promise<T>, ms: number, message: string) {
  return await Promise.race([
    promise,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error(message)), ms)),
  ]);
}

async function readFuelingWithServerOcr(imageDataUrl: string): Promise<FuelingPhotoReading> {
  const match = imageDataUrl.match(/^data:(image\/(?:jpeg|png|webp));base64,(.*)$/s);
  if (!match) throw new Error("Imagem inválida para OCR de contingência.");
  const buffer = Buffer.from(match[2], "base64");
  const worker = await withServerOcrTimeout(
    getServerOcrWorker(),
    25_000,
    "OCR do servidor demorou para iniciar.",
  );

  const recognize = async (timeoutMs: number) => {
    const result: any = await withServerOcrTimeout(
      worker.recognize(buffer),
      timeoutMs,
      "OCR do servidor demorou para reconhecer a foto.",
    );
    return String(result?.data?.text || "").trim();
  };

  const rawText = await recognize(28_000);
  if (!rawText) throw new Error("OCR do servidor não encontrou texto.");
  const first = normalizeFuelingReading(parseServerFuelingOcr(rawText));
  const firstCore = [first.liters, first.price_per_liter, first.total_amount].filter(Boolean).length;
  if (firstCore >= 2 && first.consistency !== "conflict") return first;

  try {
    await worker.setParameters({ tessedit_pageseg_mode: "6", preserve_interword_spaces: "1" });
    const secondText = await recognize(18_000);
    await worker.setParameters({ tessedit_pageseg_mode: "3", preserve_interword_spaces: "1" }).catch(() => {});
    if (secondText) {
      // Parse each pass independently: concatenating repeats every receipt item.
      const second = normalizeFuelingReading(parseServerFuelingOcr(secondText));
      const secondCore = [second.liters, second.price_per_liter, second.total_amount].filter(Boolean).length;
      if (secondCore > firstCore || (secondCore === firstCore && second.consistency !== "conflict")) {
        second.alerts = unique([...second.alerts, "Leitura conferida por duas passagens de OCR no servidor."]);
        return second;
      }
    }
  } catch (error) {
    console.warn("[fueling-photo] second server OCR pass skipped", error instanceof Error ? error.message : error);
  }

  return first;
}

export function parseServerFuelingOcr(textValue: string): FuelingPhotoReading {
  const raw = textValue.replace(/\r/g, "\n").replace(/[ \t]+/g, " ").replace(/\n{2,}/g, "\n").trim();
  const normalized = normalizeServerOcr(raw);
  const lines = raw.split(/\n+/).map((line) => line.trim()).filter(Boolean);

  const date = serverFindDate(lines);
  const time = serverFindTime(lines);
  const plate = serverFindPlate(raw);
  const fuelType =
    /diesel\s*s[\s-]*500/i.test(raw) ? "Diesel S500" :
    /diesel\s*s[\s-]*10/i.test(raw) ? "Diesel S10" :
    /\bdiesel\b/i.test(raw) ? "Diesel" :
    /arla\s*32/i.test(raw) ? "Arla 32" :
    null;

  const discount = serverFindLabeledMoney(lines, ["valor descontos", "valor desconto", "descontos r$", "desconto r$"]);
  const finalTotal = serverFindFinalTotal(lines);
  const grossTotal = serverFindGrossTotal(lines);
  const coossutran = serverFindCoossutran(raw);
  const grossTarget = grossTotal
    ? Number(grossTotal)
    : (finalTotal ? Number(finalTotal) + Number(discount || 0) : null);
  const mathPair = serverFuelPairFromMath(raw, grossTarget);
  const product = serverFindFuelProductNumbers(raw);
  const display = serverFindPumpDisplayNumbers(lines);

  let liters = coossutran.detected ? coossutran.liters : (mathPair?.liters ?? product.liters ?? display.liters);
  let price = coossutran.detected ? coossutran.price : (mathPair?.price ?? product.price ?? display.price);
  let total = coossutran.detected ? coossutran.total : (finalTotal ?? display.total ?? product.gross);
  let consistency: FuelingPhotoReading["consistency"] = "partial";
  let confidence = 0.76;
  const alerts = ["Leitura de contingência feita no servidor; confira antes de gravar."];
  let calculationBasis: string | null = null;

  // Fotos de visor frequentemente mostram apenas UM dos três campos.
  // Os exemplos confirmados da Trans Salomão têm preço/L entre 2 e 20,
  // litros normalmente entre 20 e 3000 e total acima de 1000 quando o
  // enquadramento mostra apenas os dígitos do visor.
  if (!liters && !price && !total && display.standalone) {
    const n = Number(display.standalone);
    if (n >= 2 && n <= 20) {
      price = display.standalone;
      confidence = 0.84;
      alerts.push("Visor isolado compatível com preço por litro; confirme junto das outras fotos do mesmo abastecimento.");
    } else if (n >= 20 && n < 1000) {
      liters = display.standalone;
      confidence = 0.86;
      alerts.push("Visor isolado compatível com litros; a confirmação será cruzada com preço/total quando disponíveis.");
    } else if (n >= 1000) {
      total = display.standalone;
      confidence = 0.84;
      alerts.push("Visor isolado compatível com valor total; confirme junto das outras fotos do mesmo abastecimento.");
    }
  }

  if (liters && price && total) {
    const l = Number(liters);
    const p = Number(price);
    const t = Number(total);
    const d = Number(discount || 0);
    const expected = l * p - d;
    const tolerance = FUELING_MONEY_TOLERANCE;
    if (Math.abs(expected - t) <= tolerance) {
      consistency = "confirmed";
      confidence = 0.92;
      calculationBasis = discount
        ? "OCR do servidor: litros × preço/L − desconto confere com o total."
        : "OCR do servidor: litros × preço/L confere com o total.";
    } else {
      consistency = "conflict";
      confidence = 0.78;
      alerts.push("Os números reconhecidos não fecharam matematicamente; não serão gravados automaticamente.");
    }
  } else if (liters && price && !total) {
    consistency = "calculated";
    const calc = Number(liters) * Number(price);
    total = serverDecimal(calc, 4);
    confidence = Math.max(confidence, 0.88);
    calculationBasis = "Total calculado por litros × preço/L a partir de dois campos reconhecidos.";
  } else if (liters && total && !price) {
    const calc = Number(total) / Number(liters);
    if (calc >= 2 && calc <= 20) {
      price = serverDecimal(calc, 4);
      consistency = "calculated";
      confidence = Math.max(confidence, 0.87);
      calculationBasis = "Preço/L calculado por total ÷ litros a partir de dois campos reconhecidos.";
    }
  } else if (price && total && !liters) {
    const calc = Number(total) / Number(price);
    if (calc >= 20 && calc <= 3000) {
      liters = serverDecimal(calc, 4);
      consistency = "calculated";
      confidence = Math.max(confidence, 0.87);
      calculationBasis = "Litros calculados por total ÷ preço/L a partir de dois campos reconhecidos.";
    }
  }

  return applyFuelReceiptLine({
    document_type: coossutran.detected ? "fuel_receipt" : /\bdanfe\b|nota fiscal|nf-?e/i.test(raw) ? "invoice" : display.detected || display.standalone ? "pump_display" : "fuel_receipt",
    date,
    time,
    station_name: coossutran.detected && /coossutran/i.test(raw) ? "COOSSUTRAN" : serverFindStationName(lines),
    station_cnpj: serverFindCnpj(raw),
    station_address: null,
    pump_number: null,
    nozzle_number: null,
    fuel_type: fuelType,
    liters,
    price_per_liter: price,
    total_amount: total,
    discount_amount: discount,
    odometer_km: serverFindOdometer(raw),
    plate,
    driver_name: serverFindDriverName(lines),
    receipt_number: serverFindReceiptNumber(raw),
    payment_method: null,
    consistency,
    confidence,
    calculation_basis: calculationBasis,
    alerts,
    visual_hints: [
      display.detected ? "Visor de bomba com rótulos" : "",
      display.standalone ? "Visor de bomba em close com número isolado" : "",
      normalized.includes("danfe") ? "DANFE simplificado" : "",
      normalized.includes("valor total") ? "Valor Total" : "",
      normalized.includes("placa") ? "Placa" : "",
    ].filter(Boolean),
  } as FuelingPhotoReading, readFuelReceiptLine(raw));
}

function normalizeServerOcr(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR").replace(/\s+/g, " ").trim();
}

function serverDecimalToken(value: string | undefined | null) {
  if (!value) return null;
  let raw = value.replace(/[^\d.,]/g, "");
  if (!raw) return null;
  if (/^\d{1,3}(?:\.\d{3})+,\d+$/.test(raw)) raw = raw.replace(/\./g, "").replace(",", ".");
  else if (/^\d+,\d+$/.test(raw)) raw = raw.replace(",", ".");
  else if (/^\d{1,3}(?:,\d{3})+\.\d+$/.test(raw)) raw = raw.replace(/,/g, "");
  if (!/^\d+(?:\.\d+)?$/.test(raw)) return null;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? raw : null;
}

function serverDecimal(value: number, maxDecimals = 4) {
  return value.toFixed(maxDecimals).replace(/0+$/, "").replace(/\.$/, "");
}

function serverNumberTokens(text: string) {
  return [...text.matchAll(/(?<![\d.,])(\d{1,3}(?:\.\d{3})+,\d{2,3}|\d+[.,]\d{2,3})(?![\d.,])/g)]
    .map((m) => ({ raw: m[1], value: serverDecimalToken(m[1]) }))
    .filter((x): x is { raw: string; value: string } => !!x.value)
    .map((x) => ({ ...x, number: Number(x.value) }));
}

function serverFindPumpDisplayNumbers(lines: string[]) {
  const joined = lines.join("\n");
  const normalized = normalizeServerOcr(joined);
  const detected = /total a pagar|preco por litro|litros|r\$/.test(normalized);
  const receiptLike = /cnpj|danfe|nota fiscal|nf-?e|cupom|comprovante|nsu|autorizacao|chave de acesso/.test(normalized);

  const afterLabel = (label: RegExp, role: "liters" | "price" | "money") => {
    for (let i = 0; i < lines.length; i += 1) {
      if (!label.test(normalizeServerOcr(lines[i]))) continue;
      const neighborhood = [lines[i], lines[i + 1] || ""].join(" ");
      const raw = [...neighborhood.matchAll(/\b(\d{1,8}(?:[.,]\d{1,3})?)\b/g)].map((m) => m[1]);
      for (const token of raw) {
        const value = ocrRoleNumber(token, role);
        if (value) return value;
      }
    }
    return null;
  };

  let total = afterLabel(/total a pagar|valor total|total r\$/, "money");
  let liters = afterLabel(/^litros$|\blitros\b|\bqtd\b|quantidade/, "liters");
  let price = afterLabel(/preco por litro|preco\/l|r\$\/l|vl\.?unit/, "price");

  // Documento fiscal/cartão: nunca escolher "o primeiro número plausível".
  // Somente os rótulos explícitos acima podem alimentar os campos do visor.
  if (receiptLike) return { detected, total, liters, price, standalone: null };

  const orderedRaw = [...joined.matchAll(/\b(\d{1,8}(?:[.,]\d{1,3})?)\b/g)].map((m) => m[1]);
  if (orderedRaw.length >= 3) {
    for (let i = 0; i <= orderedRaw.length - 3; i += 1) {
      const top = ocrRoleNumber(orderedRaw[i], "money");
      const middle = ocrRoleNumber(orderedRaw[i + 1], "liters");
      const bottom = ocrRoleNumber(orderedRaw[i + 2], "price");
      if (!top || !middle || !bottom) continue;
      const expected = Number(middle) * Number(bottom);
      if (Math.abs(expected - Number(top)) <= Math.max(0.20, expected * 0.004)) {
        total = total || top;
        liters = liters || middle;
        price = price || bottom;
        break;
      }
    }
  }

  // Fora de documento fiscal, ainda aceitamos um trio apenas se a matemática fechar.
  const candidates = orderedRaw.map((raw) => ({
    liters: ocrRoleNumber(raw, "liters"),
    price: ocrRoleNumber(raw, "price"),
    total: ocrRoleNumber(raw, "money"),
  }));
  if (!liters || !price || !total) {
    outer:
    for (const l of candidates.map((x) => x.liters).filter((v): v is string => !!v)) {
      for (const p of candidates.map((x) => x.price).filter((v): v is string => !!v)) {
        for (const t of candidates.map((x) => x.total).filter((v): v is string => !!v)) {
          const expected = Number(l) * Number(p);
          if (Math.abs(expected - Number(t)) <= Math.max(0.20, expected * 0.004)) {
            liters = liters || l;
            price = price || p;
            total = total || t;
            break outer;
          }
        }
      }
    }
  }

  const standaloneTokens = orderedRaw
    .map((raw) => serverDecimalToken(raw))
    .filter((v): v is string => !!v);
  const standalone = !detected && standaloneTokens.length === 1 ? standaloneTokens[0] : null;
  return { detected, total, liters, price, standalone };
}

function serverFindFuelProductNumbers(text: string) {
  const lines = serverFuelContextLines(text);
  if (!lines.length) return { liters: null, price: null, gross: null };

  let labeledLiters: string | null = null;
  let labeledPrice: string | null = null;
  let labeledGross: string | null = null;

  for (let i = 0; i < lines.length; i += 1) {
    const normalized = normalizeServerOcr(lines[i]);
    const neighborhood = [lines[i], lines[i + 1] || ""].join(" ");
    const raw = [...neighborhood.matchAll(/\b([0-9]{1,8}(?:[.,]\d{1,3})?)\b/g)].map((m) => m[1]);

    if (!labeledLiters && /\b(?:qtd|quantidade|litros|lts?)\b/.test(normalized)) {
      labeledLiters = raw.map((x) => ocrRoleNumber(x, "liters")).find(Boolean) as string | null || null;
    }
    if (!labeledPrice && /preco|preço|vl\.?\s*unit|r\$\s*\/\s*l/.test(normalized)) {
      labeledPrice = raw.map((x) => ocrRoleNumber(x, "price")).find(Boolean) as string | null || null;
    }
    if (!labeledGross && /vl\.?\s*total|valor\s+produto|total\s+produto/.test(normalized)) {
      labeledGross = raw.map((x) => ocrRoleNumber(x, "money")).filter(Boolean).pop() as string | null || null;
    }
  }

  const rawTokens = [...lines.join(" ").matchAll(/\b([0-9]{1,8}(?:[.,]\d{1,3})?)\b/g)].map((m) => m[1]);
  const litersCandidates = unique(rawTokens.map((raw) => ocrRoleNumber(raw, "liters")).filter((v): v is string => !!v));
  const priceCandidates = unique(rawTokens.map((raw) => ocrRoleNumber(raw, "price")).filter((v): v is string => !!v));
  const moneyCandidates = unique(rawTokens.map((raw) => ocrRoleNumber(raw, "money")).filter((v): v is string => !!v));

  let best: { liters: string; price: string; gross: string; error: number } | null = null;
  for (const l of litersCandidates) {
    for (const p of priceCandidates) {
      const expected = Number(l) * Number(p);
      for (const g of moneyCandidates) {
        const error = Math.abs(expected - Number(g));
        if (error <= Math.max(0.12, expected * 0.0008) && (!best || error < best.error)) {
          best = { liters: l, price: p, gross: g, error };
        }
      }
    }
  }

  if (best) {
    return {
      liters: labeledLiters || best.liters,
      price: labeledPrice || best.price,
      gross: labeledGross || best.gross,
    };
  }

  // Sem trio matematicamente confirmado, somente campos explicitamente rotulados sobrevivem.
  return { liters: labeledLiters, price: labeledPrice, gross: labeledGross };
}

function serverFindDate(lines: string[]) {
  const preferred = lines.filter((line) => /emiss[aã]o|autoriza[cç][aã]o|abastecimento|\bdata\b/i.test(line) && !/vencimento/i.test(line));
  const eligible = lines.filter((line) => !/vencimento/i.test(line));
  for (const line of [...preferred, ...eligible]) {
    const m = line.match(/\b([0-3]?\d)[\/.-]([01]?\d)[\/.-](20\d{2}|\d{2})\b/);
    if (!m) continue;
    const y = m[3].length === 2 ? "20" + m[3] : m[3];
    const candidate = y + "-" + String(Number(m[2])).padStart(2, "0") + "-" + String(Number(m[1])).padStart(2, "0");
    if (validIsoFuelingDate(candidate)) return candidate;
  }

  // COOSSUTRAN imprime a data em três colunas: DIA / MÊS / ANO.
  const folded = lines.map((line) => normalizeServerOcr(line));
  for (let i = 0; i < folded.length; i += 1) {
    const area = folded.slice(i, i + 7).join(" ");
    if (!/\bdia\b[\s\S]{0,35}\bmes\b[\s\S]{0,35}\bano\b/.test(area)) continue;
    const afterHeader = area.slice(area.search(/\bano\b/) + 3);
    const m = afterHeader.match(/\b([0-3]?\d)\s+([01]?\d)\s+(20\d{2})\b/);
    if (m) return m[3] + "-" + String(Number(m[2])).padStart(2, "0") + "-" + String(Number(m[1])).padStart(2, "0");
  }
  return null;
}

function serverFindTime(lines: string[]) {
  for (const line of lines) {
    const m = line.match(/\b([01]?\d|2[0-3]):([0-5]\d)(?::([0-5]\d))?\b/);
    if (m) return String(Number(m[1])).padStart(2, "0") + ":" + m[2] + (m[3] ? ":" + m[3] : "");
  }
  return null;
}

function serverFindPlate(text: string) {
  const upper = text.toUpperCase();
  const patterns = [
    /\bPLACA\s*[:\-]?\s*([A-Z]{3})[\s.-]*([0-9][A-Z0-9][0-9]{2})\b/,
    /\bVE[IÍ]CULO(?:\s+PLACA)?\s*[:\-]?\s*([A-Z]{3})[\s.-]*([0-9][A-Z0-9][0-9]{2})\b/,
  ];
  for (const pattern of patterns) {
    const m = upper.match(pattern);
    if (m) return m[1] + m[2];
  }
  return null;
}

function serverLooksLikePerson(value: string) {
  const cleaned = value.replace(/[^A-Za-zÀ-ÿ .'’-]/g, " ").replace(/\s+/g, " ").trim();
  const words = cleaned.match(/[A-Za-zÀ-ÿ]{2,}/g) || [];
  return words.length >= 2 && words.length <= 8 ? cleaned : null;
}

function serverFindDriverName(lines: string[]) {
  for (const line of lines) {
    const m = line.match(/\b(?:MOTORISTA|CLIENTE|DESTINAT[ÁA]RIO)\s*[:\-]\s*(.+)$/i);
    if (m?.[1]) {
      const candidate = serverLooksLikePerson(m[1]);
      if (candidate) return candidate;
    }
  }
  return null;
}

function serverFindStationName(lines: string[]) {
  const business = lines.find((line) =>
    /\b(?:AUTO\s+POSTO|POSTO\s+DE\s+COMBUST|POSTO\s+[A-ZÀ-Ý]|COMBUSTIVEIS|COMBUSTÍVEIS|COOSSUTRAN|LTDA\.?|EIRELI|COOPERATIVA)\b/i.test(line)
    && !/valor|produto|cliente|destinat|endereco|endereço|chave|protocolo/i.test(line)
  );
  if (business) {
    const cleaned = cleanStationText(business);
    if (cleaned) return cleaned;
  }

  const idx = lines.findIndex((line) => /\bCNPJ\b/i.test(line));
  if (idx > 0) {
    for (let i = idx - 1; i >= Math.max(0, idx - 7); i -= 1) {
      if (/rua|avenida|rodovia|cep|bairro|valor|produto|nota|cupom|\b[A-ZÀ-Ý ]+\s*-\s*[A-Z]{2}\b/i.test(lines[i])) continue;
      const candidate = serverLooksLikePerson(lines[i]);
      const cleaned = cleanStationText(candidate);
      if (cleaned) return cleaned;
    }
  }
  return null;
}

function serverFindCnpj(text: string) {
  const m = text.match(/\bCNPJ\s*[:\-]?\s*(\d{2}\D?\d{3}\D?\d{3}\D?\d{4}\D?\d{2})/i);
  return m?.[1]?.replace(/\D/g, "") || null;
}

function serverFindReceiptNumber(text: string) {
  const m = text.match(/\b(?:N[uú]mero|Cupom|Documento)\s*[:\-]?\s*([0-9][0-9.\-]{2,})/i);
  return m?.[1]?.trim() || null;
}

function serverFindOdometer(text: string) {
  const m = text.match(/\bOD[ÔO]METRO\s*[:\-]?\s*([0-9.]{2,})/i);
  if (!m) return null;
  const n = Number(m[1].replace(/\./g, ""));
  return Number.isFinite(n) ? n : null;
}

function serverFindLabeledMoney(lines: string[], labels: string[]) {
  for (let i = 0; i < lines.length; i += 1) {
    const normalized = normalizeServerOcr(lines[i]);
    if (!labels.some((label) => normalized.includes(normalizeServerOcr(label)))) continue;
    const sameLine = serverNumberTokens(lines[i]);
    const tokens = sameLine.length ? sameLine : /^\s*(?:R\$\s*)?[\d., ]+\s*$/.test(lines[i + 1] || "") ? serverNumberTokens(lines[i + 1]) : [];
    if (tokens.length) return tokens[tokens.length - 1].value;
  }
  return null;
}

function serverFindGrossTotal(lines: string[]) {
  for (let i = 0; i < lines.length; i += 1) {
    const normalized = normalizeServerOcr(lines[i]);
    if (!/valor total (?:dos )?produtos|total produtos|vl\.?\s*total (?:dos )?produtos/.test(normalized)) continue;
    const sameLine = serverNumberTokens(lines[i]);
    const tokens = sameLine.length ? sameLine : /^\s*(?:R\$\s*)?[\d., ]+\s*$/.test(lines[i + 1] || "") ? serverNumberTokens(lines[i + 1]) : [];
    if (tokens.length) return tokens[tokens.length - 1].value;
    const bare = [lines[i], lines[i + 1] || ""].join(" ").match(/([0-9]{4,8})\b/);
    if (bare?.[1]) return ocrRoleNumber(bare[1], "money");
  }
  return null;
}

function serverFindFinalTotal(lines: string[]) {
  for (let i = 0; i < lines.length; i += 1) {
    const normalized = normalizeServerOcr(lines[i]);
    if (!normalized.includes("valor total") && !normalized.includes("total a pagar")) continue;
    if (normalized.includes("produtos") || normalized.includes("desconto")) continue;
    const sameLine = serverNumberTokens(lines[i]);
    const tokens = sameLine.length ? sameLine : /^\s*(?:R\$\s*)?[\d., ]+\s*$/.test(lines[i + 1] || "") ? serverNumberTokens(lines[i + 1]) : [];
    if (tokens.length) return tokens[tokens.length - 1].value;
  }
  return null;
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
