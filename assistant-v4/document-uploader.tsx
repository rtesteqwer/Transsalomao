import { useRef, useState } from "react";

type Role = "user" | "assistant";

type PreparedFile = {
  fileName: string;
  mime: string;
  base64: string;
  dataUrl: string | null;
};

type IntakePayload = {
  ok?: boolean;
  result?: any;
  links?: {
    suggestedDriverId?: string | null;
    suggestedDriverName?: string | null;
    suggestedFleetId?: string | null;
    suggestedFleetName?: string | null;
    resolutionWarnings?: string[];
  };
  routing?: {
    target?: string;
    readyToLaunch?: boolean;
    missingFields?: string[];
  };
  message?: string;
};

const TOKEN_KEY = "salomao_web_token";
const MAX_FILES = 100;
const MAX_ENTRY_BYTES = 2_700_000;

function token() {
  if (typeof window === "undefined") return "";
  return sessionStorage.getItem(TOKEN_KEY) || "";
}

async function assistantFetch(path: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers || {});
  headers.set("Accept", "application/json");
  if (init.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  const bearer = token();
  if (bearer) headers.set("Authorization", "Bearer " + bearer);
  return fetch(path, { ...init, headers, credentials: "same-origin", cache: "no-store" });
}

function mimeForName(name: string) {
  if (/\.pdf$/i.test(name)) return "application/pdf";
  if (/\.png$/i.test(name)) return "image/png";
  if (/\.webp$/i.test(name)) return "image/webp";
  if (/\.(?:jpg|jpeg)$/i.test(name)) return "image/jpeg";
  return "";
}

function isSupported(file: File) {
  const mime = String(file.type || mimeForName(file.name)).toLowerCase();
  return ["image/jpeg", "image/png", "image/webp", "application/pdf"].includes(mime);
}

function readAsDataUrl(file: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Não foi possível abrir o arquivo."));
    reader.onload = () => resolve(String(reader.result || ""));
    reader.readAsDataURL(file);
  });
}

function loadImage(url: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Não foi possível abrir a foto."));
    image.src = url;
  });
}

async function prepareImage(file: File): Promise<PreparedFile> {
  const originalUrl = URL.createObjectURL(file);
  try {
    const image = await loadImage(originalUrl);
    const maxSide = 2200;
    const scale = Math.min(1, maxSide / Math.max(image.naturalWidth || 1, image.naturalHeight || 1));
    const width = Math.max(1, Math.round(image.naturalWidth * scale));
    const height = Math.max(1, Math.round(image.naturalHeight * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Não foi possível preparar a foto.");
    ctx.drawImage(image, 0, 0, width, height);

    let quality = 0.88;
    let blob: Blob | null = null;
    while (quality >= 0.54) {
      blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
      if (blob && blob.size <= 2_450_000) break;
      quality -= 0.08;
    }
    if (!blob || blob.size > 2_650_000) throw new Error("A foto ficou grande demais mesmo após a redução.");
    const dataUrl = await readAsDataUrl(blob);
    const base64 = dataUrl.split(",", 2)[1] || "";
    return {
      fileName: file.name.replace(/\.(?:png|webp|jpe?g)$/i, "") + ".jpg",
      mime: "image/jpeg",
      base64,
      dataUrl,
    };
  } finally {
    URL.revokeObjectURL(originalUrl);
  }
}

async function prepareFile(file: File): Promise<PreparedFile> {
  const mime = String(file.type || mimeForName(file.name)).toLowerCase();
  if (mime.startsWith("image/")) return prepareImage(file);
  if (mime !== "application/pdf") throw new Error("Formato não suportado.");
  if (file.size > MAX_ENTRY_BYTES) throw new Error("PDF maior que aproximadamente 2,7 MB.");
  const dataUrl = await readAsDataUrl(file);
  return {
    fileName: file.name || "documento.pdf",
    mime,
    base64: dataUrl.split(",", 2)[1] || "",
    dataUrl: null,
  };
}

async function expandZip(file: File) {
  if (file.size > 50_000_000) throw new Error("O ZIP deve ter no máximo 50 MB.");
  const { unzipSync } = await import("fflate");
  const archive = unzipSync(new Uint8Array(await file.arrayBuffer()));
  const out: File[] = [];
  for (const [entryName, bytes] of Object.entries(archive)) {
    if (out.length >= MAX_FILES) break;
    if (entryName.startsWith("__MACOSX/") || entryName.endsWith("/")) continue;
    const mime = mimeForName(entryName);
    if (!mime) continue;
    if (bytes.length <= 0 || bytes.length > MAX_ENTRY_BYTES) continue;
    const copy = new Uint8Array(bytes.length);
    copy.set(bytes);
    const clean = entryName.replace(/^.*[\\/]/, "") || "documento";
    out.push(new File([copy.buffer], clean, { type: mime }));
  }
  if (!out.length) throw new Error("Não encontrei PDF ou foto compatível dentro do ZIP.");
  return out;
}

async function normalizeSelection(files: File[]) {
  const out: File[] = [];
  for (const file of files) {
    const zip = file.type === "application/zip" || file.type === "application/x-zip-compressed" || /\.zip$/i.test(file.name);
    if (zip) {
      const inside = await expandZip(file);
      out.push(...inside);
    } else if (isSupported(file)) {
      out.push(file);
    }
    if (out.length >= MAX_FILES) break;
  }
  if (!out.length) throw new Error("Selecione PDF, ZIP ou foto JPG/PNG/WebP.");
  return out.slice(0, MAX_FILES);
}

function numberText(value: unknown, suffix = "") {
  if (value == null || value === "") return "—";
  return String(value).replace(".", ",") + suffix;
}

function currencyText(value: unknown) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "—";
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(n);
}

function labelCategory(category: string) {
  if (category === "viagem") return "Ticket de viagem";
  if (category === "abastecimento") return "Abastecimento";
  if (category === "adiantamento") return "Adiantamento";
  if (category === "mecanica") return "Mecânica";
  if (category === "despesa") return "Despesa";
  return "Documento";
}

function pendingSummary(fileName: string, intake: IntakePayload, extra?: string) {
  const r = intake.result || {};
  const missing = Array.isArray(intake.routing?.missingFields) ? intake.routing!.missingFields!.filter(Boolean) : [];
  const warnings = [
    ...(Array.isArray(r.warnings) ? r.warnings : []),
    ...(Array.isArray(intake.links?.resolutionWarnings) ? intake.links!.resolutionWarnings! : []),
  ].filter(Boolean);
  const lines = [
    "⚠️ " + fileName + " — " + labelCategory(String(r.category || "desconhecido")) + " identificado, mas não lancei automaticamente.",
    "Destino: " + String(intake.routing?.target || "Revisar"),
  ];
  if (missing.length) lines.push("Falta conferir: " + missing.join(", ") + ".");
  if (extra) lines.push(extra);
  if (warnings.length) lines.push("Alerta: " + warnings.slice(0, 2).join(" • "));
  return lines.join("\n");
}

async function classify(prepared: PreparedFile): Promise<IntakePayload> {
  const response = await assistantFetch("/api/assistant/document-intake", {
    method: "POST",
    headers: { "X-Salomao-App": "1" },
    body: JSON.stringify({
      fileName: prepared.fileName,
      mime: prepared.mime,
      base64: prepared.base64,
    }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data?.ok) throw new Error(data?.message || "Não foi possível classificar o documento.");
  return data as IntakePayload;
}

async function processFueling(prepared: PreparedFile, intake: IntakePayload) {
  if (!prepared.dataUrl) return pendingSummary(prepared.fileName, intake, "Para abastecimento automático, envie a foto do ticket/visor; PDF ficou somente analisado.");
  const links = intake.links || {};
  const read = await assistantFetch("/api/ler-abastecimento", {
    method: "POST",
    headers: { "X-Salomao-App": "1" },
    body: JSON.stringify({
      imagem: prepared.dataUrl,
      driverId: links.suggestedDriverId || null,
      fleetId: links.suggestedFleetId || null,
    }),
  });
  const payload: any = await read.json().catch(() => ({}));
  if (!read.ok || !payload?.ok) return pendingSummary(prepared.fileName, intake, payload?.message || "O leitor especializado de abastecimento não confirmou os dados.");

  const reading = payload.reading || {};
  const fleetId = payload.suggestedFleetId || links.suggestedFleetId || null;
  const driverId = payload.suggestedDriverId || links.suggestedDriverId || null;
  const safe =
    Number(reading.confidence || 0) >= 0.9 &&
    reading.consistency === "confirmed" &&
    !!reading.date &&
    !!reading.liters &&
    !!reading.price_per_liter &&
    !!reading.total_amount &&
    !!fleetId;

  if (!safe) {
    const missing = [
      !fleetId ? "conjunto" : "",
      !reading.date ? "data" : "",
      !reading.liters ? "litros" : "",
      !reading.price_per_liter ? "preço/L" : "",
      !reading.total_amount ? "total" : "",
      reading.consistency !== "confirmed" ? "conferência matemática" : "",
    ].filter(Boolean);
    return pendingSummary(prepared.fileName, intake, "Leitura especializada pendente: " + missing.join(", ") + ".");
  }

  const save = await assistantFetch("/api/salvar-abastecimento-foto", {
    method: "POST",
    headers: { "X-Salomao-App": "1" },
    body: JSON.stringify({
      imagem: prepared.dataUrl,
      fileName: prepared.fileName,
      reading,
      driverId,
      fleetId,
      confirmed: true,
    }),
  });
  const saved: any = await save.json().catch(() => ({}));
  if (!save.ok || !saved?.ok) return pendingSummary(prepared.fileName, intake, saved?.message || "A leitura ficou pronta, mas o lançamento foi bloqueado.");

  return [
    "✅ " + prepared.fileName + " — abastecimento " + (saved.linkedExisting ? "vinculado sem duplicar." : "lançado automaticamente."),
    "Posto: " + String(reading.station_name || "não informado"),
    "Data/hora: " + String(reading.date || "—") + (reading.time ? " " + reading.time : ""),
    "Litros: " + numberText(reading.liters, " L") + " • Preço/L: " + currencyText(reading.price_per_liter) + " • Total: " + currencyText(reading.total_amount),
    reading.plate ? "Placa: " + reading.plate : "",
  ].filter(Boolean).join("\n");
}

async function readAdvance(prepared: PreparedFile) {
  async function run(reader: "ai" | "pdf_text") {
    const response = await assistantFetch("/api/ler-comprovante-financeiro", {
      method: "POST",
      headers: { "X-Salomao-App": "1" },
      body: JSON.stringify({
        fileName: prepared.fileName,
        mime: prepared.mime,
        base64: prepared.base64,
        kind: "advance",
        reader,
      }),
    });
    const payload: any = await response.json().catch(() => ({}));
    if (!response.ok || !payload?.ok) throw new Error(payload?.message || "Não foi possível ler o adiantamento.");
    return payload;
  }

  if (prepared.mime !== "application/pdf") return run("ai");
  try {
    const local = await run("pdf_text");
    if (local.amount && local.date && local.time && local.suggestedDriverId) return local;
  } catch {}
  return run("ai");
}

async function processAdvance(prepared: PreparedFile, intake: IntakePayload) {
  let reading: any;
  try {
    reading = await readAdvance(prepared);
  } catch (error) {
    return pendingSummary(prepared.fileName, intake, error instanceof Error ? error.message : "Não foi possível confirmar o adiantamento.");
  }
  if (!reading.amount || !reading.date || !reading.time || !reading.suggestedDriverId) {
    return pendingSummary(
      prepared.fileName,
      intake,
      "O comprovante precisa identificar com segurança recebedor cadastrado, valor, data e hora."
    );
  }

  const save = await assistantFetch("/api/lancar-adiantamentos-pdf-lote", {
    method: "POST",
    headers: { "X-Salomao-App": "1" },
    body: JSON.stringify({
      items: [{
        fileName: prepared.fileName,
        amount: reading.amount,
        date: reading.date,
        time: reading.time,
        driverId: reading.suggestedDriverId,
        sourceArchive: null,
      }],
    }),
  });
  const saved: any = await save.json().catch(() => ({}));
  if (!save.ok || !saved?.ok) return pendingSummary(prepared.fileName, intake, saved?.message || "O lançamento do adiantamento foi bloqueado.");
  if (Array.isArray(saved.created) && saved.created.length) {
    return [
      "✅ " + prepared.fileName + " — adiantamento lançado automaticamente.",
      "Motorista: " + String(saved.created[0].driverName || reading.suggestedDriverName || reading.driverName || "—"),
      "Valor: " + currencyText(saved.created[0].amount || reading.amount),
      "Data/hora: " + String(saved.created[0].date || reading.date) + " " + String(saved.created[0].time || reading.time),
    ].join("\n");
  }
  if (Array.isArray(saved.skipped) && saved.skipped.length) {
    return "↪️ " + prepared.fileName + " — adiantamento já existia e foi ignorado para não duplicar.";
  }
  return pendingSummary(prepared.fileName, intake, "O comprovante foi lido, mas ficou pendente.");
}

async function processTrip(prepared: PreparedFile, intake: IntakePayload) {
  const r = intake.result || {};
  const links = intake.links || {};
  if (Number(r.confidence || 0) < 0.82) {
    return pendingSummary(prepared.fileName, intake, "Confiança insuficiente para lançar a viagem.");
  }

  const response = await assistantFetch("/api/assistant/document-launch-trip", {
    method: "POST",
    headers: { "X-Salomao-App": "1" },
    body: JSON.stringify({
      fileName: prepared.fileName,
      mime: prepared.mime,
      imageDataUrl: prepared.dataUrl,
      result: r,
      links,
    }),
  });
  const saved: any = await response.json().catch(() => ({}));
  if (!response.ok || !saved?.ok) {
    return pendingSummary(
      prepared.fileName,
      intake,
      saved?.erro || saved?.message || "O lançamento da viagem foi bloqueado."
    );
  }

  const mode = String(saved.freightMode || r.freight_mode || "—");
  return [
    "✅ " + prepared.fileName + " — viagem " + (saved.linkedExisting ? "já existente; foto vinculada sem duplicar." : "enviada automaticamente para o Caixa."),
    "Ticket: " + String(saved.ticket || r.ticket_number || r.document_number || "—") + " • Modalidade: " + mode,
    mode === "ton" && r.net_weight_kg ? "Peso líquido: " + numberText(r.net_weight_kg, " kg") : "",
    links.suggestedDriverName ? "Motorista: " + links.suggestedDriverName : "",
    links.suggestedFleetName ? "Conjunto: " + links.suggestedFleetName : "",
  ].filter(Boolean).join("\n");
}

async function processOne(file: File) {
  const prepared = await prepareFile(file);
  const intake = await classify(prepared);
  const category = String(intake.result?.category || "desconhecido");
  if (category === "abastecimento") return processFueling(prepared, intake);
  if (category === "adiantamento") return processAdvance(prepared, intake);
  if (category === "viagem") return processTrip(prepared, intake);
  return pendingSummary(prepared.fileName, intake, "Documento extraído e classificado; este tipo ainda exige lançamento pela Gerência.");
}

export function UniversalDocumentUploader({
  disabled = false,
  onMessage,
}: {
  disabled?: boolean;
  onMessage: (role: Role, content: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState("");

  async function handleFiles(files?: FileList | null) {
    const selected = Array.from(files || []);
    if (!selected.length || busy) return;
    setBusy(true);
    setProgress("Preparando arquivos…");
    try {
      const expanded = await normalizeSelection(selected);
      onMessage("user", "📎 Enviei " + expanded.length + " arquivo(s) para a Trans Salomão IA analisar e lançar.");
      for (let index = 0; index < expanded.length; index += 1) {
        const file = expanded[index];
        setProgress("Analisando " + (index + 1) + "/" + expanded.length + ": " + file.name);
        try {
          const result = await processOne(file);
          onMessage("assistant", result);
        } catch (error) {
          onMessage(
            "assistant",
            "❌ " + file.name + " — " + (error instanceof Error ? error.message : "Não consegui processar este arquivo.") + "\nNenhum lançamento foi feito para este arquivo."
          );
        }
      }
    } catch (error) {
      onMessage("assistant", "❌ " + (error instanceof Error ? error.message : "Não consegui abrir os arquivos."));
    } finally {
      setBusy(false);
      setProgress("");
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div className="shrink-0 self-center">
      <button
        type="button"
        disabled={disabled || busy}
        onClick={() => inputRef.current?.click()}
        className="grid size-11 place-items-center rounded-full text-xl text-[#d1d7db] hover:bg-[#3b4a54] disabled:opacity-40"
        aria-label="Adicionar PDF, foto ou ZIP"
        title={busy ? progress || "Analisando…" : "Adicionar PDF, foto ou ZIP"}
      >
        {busy ? "⏳" : "📎"}
      </button>
      <input
        ref={inputRef}
        type="file"
        multiple
        accept=".pdf,.zip,application/pdf,application/zip,application/x-zip-compressed,image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={(event) => void handleFiles(event.target.files)}
      />
      {busy && progress ? (
        <div className="fixed bottom-20 left-1/2 z-50 max-w-[92vw] -translate-x-1/2 rounded-full border border-white/10 bg-[#111b21] px-4 py-2 text-xs text-[#d1d7db] shadow-2xl">
          {progress}
        </div>
      ) : null}
    </div>
  );
}
