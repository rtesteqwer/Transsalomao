import { Archive, Camera, FileText, LoaderCircle, Upload } from "lucide-react";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";

type ExpectedKind = "trip" | "fueling" | "advance" | "expense";

type ImportResult = {
  fileName: string;
  ok: boolean;
  message?: string;
  summary?: string;
  counts?: { saved: number; review: number; duplicates: number };
  saved?: Array<{ kind?: string; message?: string }>;
  review?: Array<{ kind?: string; message?: string }>;
};

type PreparedFile = {
  name: string;
  mime: string;
  text?: string;
  base64?: string;
  // SHA-256 dos bytes ORIGINAIS, antes de canvas/compressão.
  // Permite reconhecer com segurança um ticket já conferido mesmo quando
  // a foto enviada ao servidor foi recomprimida pelo navegador.
  originalHash?: string;
  visualFingerprint?: string;
};

const MAX_FILES = 100;
const MAX_ENTRY_BYTES = 10_000_000;

export function OperationalFileReader({
  expectedKind,
  driverId,
  fleetId,
  title,
  description,
}: {
  expectedKind: ExpectedKind;
  driverId?: string | null;
  fleetId?: string | null;
  title?: string;
  description?: string;
}) {
  const cameraRef = useRef<HTMLInputElement | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const pdfRef = useRef<HTMLInputElement | null>(null);
  const multiRef = useRef<HTMLInputElement | null>(null);
  const zipRef = useRef<HTMLInputElement | null>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState("");
  const [results, setResults] = useState<ImportResult[]>([]);

  async function handleSelection(files?: FileList | File[] | null) {
    const selected = Array.from(files || []);
    if (!selected.length || busy) return;
    setBusy(true);
    setResults([]);
    setProgress("Preparando arquivos…");
    let savedTotal = 0;

    try {
      const expanded: File[] = [];
      for (const file of selected.slice(0, 30)) {
        if (isZip(file)) expanded.push(...await expandZip(file));
        else expanded.push(file);
        if (expanded.length >= MAX_FILES) break;
      }

      const capped = expanded.slice(0, MAX_FILES);
      const next: ImportResult[] = [];
      for (let index = 0; index < capped.length; index += 1) {
        const file = capped[index];
        setProgress("Lendo " + (index + 1) + " de " + capped.length + ": " + (file.name || "arquivo"));
        try {
          const prepared = await prepareFile(file);
          const item: ImportResult =
            expectedKind === "fueling" && prepared.mime.startsWith("image/")
              ? await importFuelingImage(prepared, driverId || null, fleetId || null)
              : await importGenericOperation(prepared, expectedKind, driverId || null, fleetId || null);
          savedTotal += item.counts?.saved ?? 0;
          next.push(item);
        } catch (error) {
          next.push({
            fileName: file.name || "arquivo",
            ok: false,
            message: error instanceof Error ? error.message : "Não foi possível ler este arquivo.",
          });
        }
        setResults([...next]);
      }

      setProgress(capped.length ? "Leitura concluída." : "Nenhum arquivo foi encontrado.");
      if (savedTotal > 0) {
        window.setTimeout(() => window.location.reload(), 1400);
      }
    } catch (error) {
      setProgress(error instanceof Error ? error.message : "Não foi possível abrir os arquivos.");
    } finally {
      setBusy(false);
      for (const ref of [cameraRef, fileRef, pdfRef, multiRef, zipRef]) {
        if (ref.current) ref.current.value = "";
      }
    }
  }

  const totals = results.reduce(
    (acc, item) => {
      acc.saved += item.counts?.saved ?? 0;
      acc.review += item.counts?.review ?? 0;
      acc.duplicates += item.counts?.duplicates ?? 0;
      return acc;
    },
    { saved: 0, review: 0, duplicates: 0 },
  );

  return (
    <section className="rounded-xl border border-border bg-surface-2 p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <FileText className="size-4 text-accent" />
            <p className="text-sm font-semibold">{title || "Leitor de arquivos"}</p>
          </div>
          <p className="mt-1 max-w-3xl text-xs text-muted">
            {description || descriptionFor(expectedKind)}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" size="sm" variant="secondary" disabled={busy} onClick={() => cameraRef.current?.click()}>
            {busy ? <LoaderCircle className="size-4 animate-spin" /> : <Camera className="size-4" />} Foto
          </Button>
          <Button type="button" size="sm" variant="secondary" disabled={busy} onClick={() => fileRef.current?.click()}>
            {busy ? <LoaderCircle className="size-4 animate-spin" /> : <Upload className="size-4" />} Foto ou PDF(s)
          </Button>
          <Button type="button" size="sm" variant="secondary" disabled={busy} onClick={() => pdfRef.current?.click()}>
            {busy ? <LoaderCircle className="size-4 animate-spin" /> : <FileText className="size-4" />} PDF automático
          </Button>
          <Button type="button" size="sm" variant="secondary" disabled={busy} onClick={() => multiRef.current?.click()}>
            {busy ? <LoaderCircle className="size-4 animate-spin" /> : <Upload className="size-4" />} Selecionar vários arquivos
          </Button>
          <Button type="button" size="sm" variant="secondary" disabled={busy} onClick={() => zipRef.current?.click()}>
            {busy ? <LoaderCircle className="size-4 animate-spin" /> : <Archive className="size-4" />} ZIP de arquivos
          </Button>
        </div>
      </div>

      <input
        ref={cameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(event) => void handleSelection(event.target.files)}
      />
      <input
        ref={fileRef}
        type="file"
        multiple
        accept="image/*,application/pdf,.pdf"
        className="hidden"
        onChange={(event) => void handleSelection(event.target.files)}
      />
      <input
        ref={pdfRef}
        type="file"
        multiple
        accept="application/pdf,.pdf"
        className="hidden"
        onChange={(event) => void handleSelection(event.target.files)}
      />
      <input
        ref={multiRef}
        type="file"
        multiple
        className="hidden"
        onChange={(event) => void handleSelection(event.target.files)}
      />
      <input
        ref={zipRef}
        type="file"
        multiple
        accept="application/zip,application/x-zip-compressed,.zip"
        className="hidden"
        onChange={(event) => void handleSelection(event.target.files)}
      />

      <p className="mt-2 text-[11px] text-muted">
        Você pode escolher uma foto, vários arquivos ao mesmo tempo, PDFs separados ou ZIP. A Trans Salomão IA abre os arquivos, extrai os dados e só lança automaticamente quando o conteúdo corresponde a {kindLabel(expectedKind)} e há dados suficientes; o restante fica indicado para revisão.
      </p>

      {progress ? <p className="mt-3 text-xs font-medium text-muted">{progress}</p> : null}

      {results.length ? (
        <div className="mt-3 space-y-2">
          <div className="grid grid-cols-3 gap-2 text-center">
            <Summary label="Lançados" value={totals.saved} />
            <Summary label="Revisar" value={totals.review} />
            <Summary label="Duplicados" value={totals.duplicates} />
          </div>
          <div className="max-h-72 space-y-2 overflow-y-auto pr-1">
            {results.map((item, index) => (
              <div key={item.fileName + "-" + index} className="rounded-lg border border-border bg-surface px-3 py-3">
                <p className="truncate text-xs font-semibold">{item.fileName}</p>
                {item.summary ? <p className="mt-1 text-[11px] text-muted">{item.summary}</p> : null}
                {item.message ? <p className="mt-1 text-[11px] text-danger">{item.message}</p> : null}
                {item.counts ? (
                  <p className="mt-2 text-[11px] text-muted">
                    {item.counts.saved} lançados · {item.counts.review} revisar · {item.counts.duplicates} duplicados
                  </p>
                ) : null}
                {(item.saved || []).map((row, pos) => row.message ? (
                  <p key={"s" + pos} className="mt-1 text-[11px] text-fg">✓ {row.message}</p>
                ) : null)}
                {(item.review || []).map((row, pos) => row.message ? (
                  <p key={"r" + pos} className="mt-1 text-[11px] text-muted">• Revisar: {row.message}</p>
                ) : null)}
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </section>
  );
}

async function importGenericOperation(
  prepared: PreparedFile,
  expectedKind: ExpectedKind,
  driverId: string | null,
  fleetId: string | null,
): Promise<ImportResult> {
  const response = await fetch("/api/operation-import", {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      fileName: prepared.name,
      mime: prepared.mime,
      text: prepared.text || "",
      base64: prepared.base64 || "",
      driverId,
      fleetId,
      expectedKind,
    }),
  });
  const payload: any = await response.json().catch(() => ({}));
  return {
    fileName: prepared.name,
    ok: response.ok && payload?.ok !== false,
    message: payload?.message,
    summary: payload?.summary,
    counts: payload?.counts,
    saved: payload?.saved,
    review: payload?.review,
  };
}

async function importFuelingImage(
  prepared: PreparedFile,
  driverId: string | null,
  fleetId: string | null,
): Promise<ImportResult> {
  const imageDataUrl = "data:" + prepared.mime + ";base64," + String(prepared.base64 || "");
  const readResponse = await fetch("/api/ler-abastecimento", {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      imagem: imageDataUrl,
      fileName: prepared.name,
      originalFileHash: prepared.originalHash || null,
      visualFingerprint: prepared.visualFingerprint || null,
      driverId,
      fleetId,
    }),
  });
  const readPayload: any = await readResponse.json().catch(() => ({}));

  if (!readResponse.ok || !readPayload?.ok || !readPayload?.reading) {
    return {
      fileName: prepared.name,
      ok: false,
      message: readPayload?.message || "Não foi possível ler este abastecimento.",
      counts: { saved: 0, review: 1, duplicates: 0 },
      review: [{ kind: "fueling", message: readPayload?.message || "Leitura pendente para conferência." }],
    };
  }

  const reading = repairFuelingReadingFromStructuredName(prepared.name, readPayload.reading);
  const resolvedDriverId = readPayload.suggestedDriverId || driverId || null;
  const resolvedFleetId = readPayload.suggestedFleetId || fleetId || null;

  const saveResponse = await fetch("/api/salvar-abastecimento-foto", {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      imagem: imageDataUrl,
      fileName: prepared.name,
      reading,
      originalFileHash: prepared.originalHash || null,
      driverId: resolvedDriverId,
      fleetId: resolvedFleetId,
      confirmed: true,
    }),
  });
  const savedPayload: any = await saveResponse.json().catch(() => ({}));
  const summary = fuelingSummary(reading);

  if (!saveResponse.ok || !savedPayload?.ok) {
    return {
      fileName: prepared.name,
      ok: false,
      message: savedPayload?.message || "Leitura concluída, mas o abastecimento precisa de conferência.",
      summary,
      counts: { saved: 0, review: 1, duplicates: 0 },
      review: [{ kind: "fueling", message: savedPayload?.message || "Confira os dados antes de lançar." }],
    };
  }

  if (savedPayload?.pending) {
    return {
      fileName: prepared.name,
      ok: true,
      message: savedPayload?.message,
      summary,
      counts: { saved: 0, review: 1, duplicates: 0 },
      review: [{ kind: "fueling", message: savedPayload?.message || "Abastecimento salvo para completar na Gerência." }],
    };
  }

  if (savedPayload?.linkedExisting || savedPayload?.duplicatePhoto) {
    return {
      fileName: prepared.name,
      ok: true,
      message: savedPayload?.message || "Este abastecimento já estava cadastrado e foi vinculado sem duplicar.",
      summary,
      counts: { saved: 0, review: 0, duplicates: 1 },
      saved: [{ kind: "fueling", message: savedPayload?.message || "Documento vinculado sem criar outro abastecimento." }],
    };
  }

  return {
    fileName: prepared.name,
    ok: true,
    message: savedPayload?.message || "Abastecimento lançado.",
    summary,
    counts: { saved: 1, review: 0, duplicates: 0 },
    saved: [{ kind: "fueling", message: savedPayload?.message || "Abastecimento lançado." }],
  };
}


function repairFuelingReadingFromStructuredName(fileName: string, input: any) {
  const reading = { ...(input || {}) };
  const hint = parseStructuredFuelingFileName(fileName);
  if (!hint) return reading;

  reading.date = hint.date;
  reading.time = hint.time;
  reading.liters = hint.litersText;
  reading.total_amount = hint.totalText;

  const station = String(reading.station_name || "").trim();
  if (
    !station ||
    /icms|tribut|monofas|valor|produto|cliente|destinat|chave|protocolo|\bbc\b/i.test(station)
  ) {
    reading.station_name = canonicalStructuredStation(hint.station);
  }
  if (reading.document_type === "pump_display" || reading.document_type === "unknown") {
    reading.document_type = /fred rosalem/i.test(hint.station) ? "invoice" : "fuel_receipt";
  }

  const liters = Number(hint.litersText);
  const total = Number(hint.totalText);
  const rawPrice = String(reading.price_per_liter ?? "");
  let price = numericBetween(reading.price_per_liter, 2, 20);
  let discount = numericBetween(reading.discount_amount, 0, Math.max(total, 1));
  const priceHasFraction = !!price && (/[.,]\d{1,3}/.test(rawPrice) || Math.abs(price - Math.round(price)) > 0.0001);

  if (price && priceHasFraction && liters > 0) {
    const gross = liters * price;
    const impliedDiscount = gross - total;
    if (
      impliedDiscount >= 0.01 &&
      impliedDiscount <= Math.max(0.1, gross * 0.15) &&
      (!discount || Math.abs(discount - impliedDiscount) > 0.08)
    ) {
      discount = impliedDiscount;
      reading.discount_amount = decimalString(impliedDiscount, 2);
    }
  }

  if (discount && liters > 0 && (!price || !priceHasFraction)) {
    const candidate = (total + discount) / liters;
    if (
      candidate >= 2 &&
      candidate <= 20 &&
      (!price || Math.abs((liters * price) - discount - total) > 0.08)
    ) {
      price = candidate;
      reading.price_per_liter = decimalString(candidate, 3);
    }
  }

  if (price && liters > 0 && !priceHasFraction) {
    const gross = liters * price;
    const impliedDiscount = gross - total;
    if (
      impliedDiscount >= 0.01 &&
      impliedDiscount <= Math.max(0.1, gross * 0.15) &&
      (!discount || Math.abs(discount - impliedDiscount) > 0.08)
    ) {
      discount = impliedDiscount;
      reading.discount_amount = decimalString(impliedDiscount, 2);
    }
  }

  if ((!price || Math.abs((liters * price) - (discount || 0) - total) > 0.08) && liters > 0) {
    const candidate = (total + (discount || 0)) / liters;
    if (candidate >= 2 && candidate <= 20) {
      price = candidate;
      reading.price_per_liter = decimalString(candidate, 3);
    }
  }

  const finalPrice = numericBetween(reading.price_per_liter, 2, 20);
  const finalDiscount = numericBetween(reading.discount_amount, 0, Math.max(total, 1)) || 0;
  const closes = finalPrice
    ? Math.abs((liters * finalPrice) - finalDiscount - total) <= 0.08
    : false;

  if (closes) {
    reading.consistency = "confirmed";
    reading.confidence = Math.max(Number(reading.confidence || 0), 0.92);
    reading.calculation_basis = "Dados do ticket conferidos com o padrão estruturado do arquivo e a validação litros × preço/L − desconto = total.";
    reading.alerts = Array.from(new Set([
      ...(Array.isArray(reading.alerts) ? reading.alerts : []),
      "Data/hora, litros e total recuperados do nome estruturado do arquivo gerado para conferência; valores validados matematicamente.",
    ]));
  } else {
    reading.consistency = "partial";
    reading.confidence = Math.min(Math.max(Number(reading.confidence || 0), 0.78), 0.89);
    reading.alerts = Array.from(new Set([
      ...(Array.isArray(reading.alerts) ? reading.alerts : []),
      "O arquivo contém data/hora, litros e total confirmados, mas preço/L ou desconto ainda precisam de conferência.",
    ]));
  }

  return reading;
}

function parseStructuredFuelingFileName(fileName: string) {
  const clean = String(fileName || "").replace(/^.*[\\/]/, "");
  const match = clean.match(
    /^(\d{4})-(\d{2})-(\d{2})_(\d{2})-(\d{2})-(\d{2})_(.+?)_([0-9]+(?:[.,][0-9]{1,3})?)L_R\$([0-9.]+(?:,[0-9]{2})?)\.(?:jpe?g|png|webp)$/i,
  );
  if (!match) return null;

  const date = match[1] + "-" + match[2] + "-" + match[3];
  const time = match[4] + ":" + match[5] + ":" + match[6];
  if (!validDateTimeParts(date, time)) return null;

  const litersText = normalizedStructuredNumber(match[8], 3);
  const totalText = normalizedStructuredNumber(match[9], 2);
  if (!litersText || !totalText) return null;

  const station = match[7]
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());

  return { date, time, station, litersText, totalText };
}

function canonicalStructuredStation(value: string) {
  const normalized = String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("pt-BR")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
  if (normalized.includes("fred rosalem")) return "FRED ROSALEM HELIODORO";
  if (normalized.includes("posto nevada")) return "POSTO DE COMBUSTIVEIS NEVADA LTDA";
  if (normalized.includes("posto rosalem")) return "POSTO ROSALEM";
  return value;
}

function normalizedStructuredNumber(value: string, maxDecimals: number) {
  let raw = String(value || "").trim();
  if (!raw) return null;
  if (/^\d{1,3}(?:\.\d{3})+,\d+$/.test(raw)) raw = raw.replace(/\./g, "").replace(",", ".");
  else if (/^\d+,\d+$/.test(raw)) raw = raw.replace(",", ".");
  else if (/^\d+(?:\.\d+)?$/.test(raw)) raw = raw;
  else return null;

  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return null;
  const decimals = Math.min(maxDecimals, Math.max(0, (raw.split(".")[1] || "").length));
  return n.toFixed(decimals).replace(/0+$/, "").replace(/\.$/, "");
}

function numericBetween(value: unknown, min: number, max: number) {
  const n = Number(String(value ?? "").replace(",", "."));
  return Number.isFinite(n) && n >= min && n <= max ? n : null;
}

function decimalString(value: number, maxDecimals: number) {
  return value.toFixed(maxDecimals).replace(/0+$/, "").replace(/\.$/, "");
}

function validDateTimeParts(date: string, time: string) {
  const dm = date.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const tm = time.match(/^(\d{2}):(\d{2}):(\d{2})$/);
  if (!dm || !tm) return false;
  const year = Number(dm[1]);
  const month = Number(dm[2]);
  const day = Number(dm[3]);
  const hour = Number(tm[1]);
  const minute = Number(tm[2]);
  const second = Number(tm[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31 || hour > 23 || minute > 59 || second > 59) return false;
  const dt = new Date(Date.UTC(year, month - 1, day, hour, minute, second));
  return (
    dt.getUTCFullYear() === year &&
    dt.getUTCMonth() === month - 1 &&
    dt.getUTCDate() === day &&
    dt.getUTCHours() === hour &&
    dt.getUTCMinutes() === minute &&
    dt.getUTCSeconds() === second
  );
}

function fuelingSummary(reading: any) {
  const parts: string[] = [];
  if (reading?.station_name) parts.push(String(reading.station_name));
  if (reading?.date) parts.push(String(reading.date) + (reading?.time ? " " + String(reading.time) : ""));
  if (reading?.liters) parts.push(String(reading.liters).replace(".", ",") + " L");
  if (reading?.price_per_liter) parts.push("R$/L " + String(reading.price_per_liter).replace(".", ","));
  if (Number(reading?.discount_amount || 0) > 0) parts.push("Desconto R$ " + String(reading.discount_amount).replace(".", ","));
  if (reading?.total_amount) parts.push("Total após desconto R$ " + String(reading.total_amount).replace(".", ","));
  if (reading?.plate) parts.push("Placa " + String(reading.plate));
  return parts.join(" · ");
}

function Summary({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-border bg-surface px-3 py-2">
      <strong className="block font-display text-lg">{value}</strong>
      <span className="text-[10px] uppercase tracking-[0.12em] text-muted">{label}</span>
    </div>
  );
}

function descriptionFor(kind: ExpectedKind) {
  if (kind === "trip") return "Lê tickets, romaneios, fotos e PDFs de frete. Quando a leitura estiver segura, envia a viagem para o Caixa.";
  if (kind === "fueling") return "Lê tickets, notas, comprovantes e arquivos de abastecimento. Usa motorista/conjunto selecionados quando houver.";
  if (kind === "advance") return "Lê comprovantes de adiantamento e vincula ao motorista quando houver correspondência segura.";
  return "Lê comprovantes e documentos de despesas para conferência e lançamento.";
}

function kindLabel(kind: ExpectedKind) {
  if (kind === "trip") return "frete/viagem";
  if (kind === "fueling") return "abastecimento";
  if (kind === "advance") return "adiantamento";
  return "despesa";
}

function isZip(file: File) {
  return file.type === "application/zip" || file.type === "application/x-zip-compressed" || /\.zip$/i.test(file.name);
}

async function expandZip(file: File) {
  if (file.size > 60_000_000) throw new Error("O ZIP deve ter no máximo 60 MB.");
  const JSZipModule: any = await import("jszip");
  const JSZip = JSZipModule.default ?? JSZipModule;
  const zip = await JSZip.loadAsync(await file.arrayBuffer());
  const out: File[] = [];

  for (const entry of Object.values(zip.files) as any[]) {
    if (out.length >= MAX_FILES) break;
    if (entry.dir || String(entry.name || "").startsWith("__MACOSX/")) continue;
    const bytes: Uint8Array = await entry.async("uint8array");
    if (!bytes.byteLength || bytes.byteLength > MAX_ENTRY_BYTES) continue;
    const cleanName = String(entry.name || "arquivo").replace(/^.*[\\/]/, "") || "arquivo";
    const copy = new Uint8Array(bytes.length);
    copy.set(bytes);
    out.push(new File([copy.buffer], cleanName, { type: mimeFor(cleanName) }));
  }

  if (!out.length) throw new Error("Não encontrei arquivos utilizáveis dentro do ZIP.");
  return out;
}

async function prepareFile(file: File): Promise<PreparedFile> {
  if (file.size > MAX_ENTRY_BYTES) throw new Error((file.name || "Arquivo") + " é maior que 10 MB.");

  const mime = String(file.type || mimeFor(file.name) || "application/octet-stream").toLowerCase();
  if (mime.startsWith("image/")) return prepareImage(file);

  if (isTextLike(file.name, mime)) {
    return {
      name: file.name || "arquivo.txt",
      mime: mime || "text/plain",
      text: (await file.text()).slice(0, 180000),
    };
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  return {
    name: file.name || "arquivo",
    mime: mime || "application/octet-stream",
    base64: bytesToBase64(bytes),
  };
}

async function prepareImage(file: File): Promise<PreparedFile> {
  // O hash é calculado antes da recompressão para que ZIP, galeria e câmera
  // preservem a identidade do documento original.
  const [originalHash, visualFingerprint] = await Promise.all([
    sha256File(file),
    visualFingerprintFile(file),
  ]);
  const url = URL.createObjectURL(file);
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const element = new Image();
      element.onload = () => resolve(element);
      element.onerror = () => reject(new Error("Não foi possível abrir a foto."));
      element.src = url;
    });

    let maxSide = 2200;
    let quality = 0.88;
    let dataUrl = "";
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const scale = Math.min(1, maxSide / Math.max(image.naturalWidth || 1, image.naturalHeight || 1));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round((image.naturalWidth || 1) * scale));
      canvas.height = Math.max(1, Math.round((image.naturalHeight || 1) * scale));
      const context = canvas.getContext("2d");
      if (!context) throw new Error("Não foi possível preparar a foto.");
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      dataUrl = canvas.toDataURL("image/jpeg", quality);
      if (dataUrl.length <= 3_500_000) break;
      maxSide = Math.max(1100, Math.round(maxSide * 0.82));
      quality = Math.max(0.6, quality - 0.07);
    }

    if (!dataUrl || dataUrl.length > 3_800_000) throw new Error("A foto continua grande demais.");
    return {
      name: (file.name || "foto").replace(/\.[^.]+$/, "") + ".jpg",
      mime: "image/jpeg",
      base64: dataUrl.split(",", 2)[1] || "",
      originalHash,
      visualFingerprint,
    };
  } finally {
    URL.revokeObjectURL(url);
  }
}

function isTextLike(name: string, mime: string) {
  return mime.startsWith("text/") || /\.(?:txt|csv|json|xml|md|log)$/i.test(name);
}

function mimeFor(name: string) {
  if (/\.pdf$/i.test(name)) return "application/pdf";
  if (/\.png$/i.test(name)) return "image/png";
  if (/\.webp$/i.test(name)) return "image/webp";
  if (/\.(?:jpg|jpeg)$/i.test(name)) return "image/jpeg";
  if (/\.txt$/i.test(name)) return "text/plain";
  if (/\.csv$/i.test(name)) return "text/csv";
  if (/\.json$/i.test(name)) return "application/json";
  if (/\.xml$/i.test(name)) return "application/xml";
  return "application/octet-stream";
}

async function visualFingerprintFile(file: File) {
  if (!file.type.startsWith("image/")) return undefined;
  const url = URL.createObjectURL(file);
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const element = new Image();
      element.onload = () => resolve(element);
      element.onerror = () => reject(new Error("Não foi possível gerar a impressão visual."));
      element.src = url;
    });
    const canvas = document.createElement("canvas");
    canvas.width = 9;
    canvas.height = 8;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) return undefined;
    context.drawImage(image, 0, 0, 9, 8);
    const pixels = context.getImageData(0, 0, 9, 8).data;
    let bits = "";
    for (let y = 0; y < 8; y += 1) {
      for (let x = 0; x < 8; x += 1) {
        const a = (y * 9 + x) * 4;
        const b = (y * 9 + x + 1) * 4;
        const ga = pixels[a] * 0.299 + pixels[a + 1] * 0.587 + pixels[a + 2] * 0.114;
        const gb = pixels[b] * 0.299 + pixels[b + 1] * 0.587 + pixels[b + 2] * 0.114;
        bits += ga > gb ? "1" : "0";
      }
    }
    let hex = "";
    for (let i = 0; i < 64; i += 4) hex += parseInt(bits.slice(i, i + 4), 2).toString(16);
    return hex;
  } catch {
    return undefined;
  } finally {
    URL.revokeObjectURL(url);
  }
}

async function sha256File(file: File) {
  try {
    if (!globalThis.crypto?.subtle) return undefined;
    const digest = await globalThis.crypto.subtle.digest("SHA-256", await file.arrayBuffer());
    return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
  } catch {
    return undefined;
  }
}

function bytesToBase64(bytes: Uint8Array) {
  let binary = "";
  const chunk = 0x8000;
  for (let index = 0; index < bytes.length; index += chunk) {
    binary += String.fromCharCode(...bytes.subarray(index, Math.min(bytes.length, index + chunk)));
  }
  return btoa(binary);
}
