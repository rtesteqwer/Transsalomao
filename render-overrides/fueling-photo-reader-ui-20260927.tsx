import { useMemo, useRef, useState } from "react";
import { AlertTriangle, Camera, CheckCircle2, Fuel, LoaderCircle, Upload } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Select } from "@/components/ui/select";
import { fleetKey, useFleet } from "@/lib/use-fleet";

type FuelingReading = {
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

type ReadItem = {
  id: string;
  fileName: string;
  image: string;
  reading: FuelingReading;
  suggestedDriverId: string | null;
  suggestedFleetId: string | null;
  saving?: boolean;
  saved?: boolean;
  message?: string;
};

// Um único worker é compartilhado entre todas as fotos e entre novos lotes.
// Isso evita reiniciar o Tesseract (e baixar/carregar o idioma novamente)
// a cada foto quando a IA online estiver sem créditos.
let sharedLocalOcrWorker: any = null;
let sharedLocalOcrInit: Promise<any> | null = null;

async function getSharedLocalOcrWorker() {
  if (sharedLocalOcrWorker) return sharedLocalOcrWorker;
  if (!sharedLocalOcrInit) {
    sharedLocalOcrInit = (async () => {
      const module = await import("tesseract.js");
      const worker = await module.createWorker("por", 1, {
        workerPath: "/ocr/worker.min.js",
        corePath: "/ocr/core",
        langPath: "/ocr/lang",
        gzip: true,
      });
      sharedLocalOcrWorker = worker;
      return worker;
    })().catch((error) => {
      sharedLocalOcrInit = null;
      throw error;
    });
  }
  return sharedLocalOcrInit;
}

export function FuelingPhotoReader() {
  const { data } = useFleet();
  const queryClient = useQueryClient();
  const galleryRef = useRef<HTMLInputElement | null>(null);
  const cameraRef = useRef<HTMLInputElement | null>(null);
  const [driverId, setDriverId] = useState("");
  const [fleetId, setFleetId] = useState("");
  const [items, setItems] = useState<ReadItem[]>([]);
  const [errors, setErrors] = useState<string[]>([]);
  const [reading, setReading] = useState(false);
  const [progress, setProgress] = useState("");

  const safeCount = useMemo(() => items.filter((item) =>
    !item.saved &&
    item.reading.confidence >= 0.9 &&
    item.reading.consistency === "confirmed" &&
    !!item.reading.date &&
    !!item.reading.liters &&
    !!item.reading.price_per_liter &&
    !!(fleetId || item.suggestedFleetId)
  ).length, [items, fleetId]);

  async function handleFiles(files: FileList | null) {
    if (!files?.length || reading) return;
    setReading(true);
    setErrors([]);
    let activeDriverId = driverId;
    let activeFleetId = fleetId;
    try {
      const selected = Array.from(files).slice(0, 12);
      for (let index = 0; index < selected.length; index += 1) {
        const file = selected[index];
        let image = "";
        setProgress("Lendo " + (index + 1) + " de " + selected.length + ": " + file.name);
        try {
          image = await compressPhoto(file);
          const response = await fetch("/api/ler-abastecimento", {
            method: "POST",
            credentials: "same-origin",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              imagem: image,
              driverId: activeDriverId || null,
              fleetId: activeFleetId || null,
            }),
          });
          const payload = await response.json().catch(() => ({}));

          let nextReading: FuelingReading;
          let suggestedDriverId = payload?.suggestedDriverId ? String(payload.suggestedDriverId) : null;
          let suggestedFleetId = payload?.suggestedFleetId ? String(payload.suggestedFleetId) : null;

          if (response.ok && payload?.reading) {
            // O servidor já executa a segunda passagem de OCR quando necessário.
            // Não bloquear a interface com uma segunda leitura local após sucesso.
            nextReading = payload.reading as FuelingReading;
          } else if ([429, 502, 503, 504].includes(response.status)) {
            setProgress("Leitura no servidor não concluiu. Última tentativa local: " + file.name);
            const local = await readFuelingWithLocalOcr(image);
            nextReading = local.reading;

            const localDriver = matchLocalDriver(nextReading.driver_name, data?.drivers ?? []);
            const localFleet = matchLocalFleet(nextReading.plate, data?.fleets ?? []);
            suggestedDriverId = localDriver?.id ? String(localDriver.id) : null;
            suggestedFleetId = localFleet?.id ? String(localFleet.id) : null;
          } else {
            throw new Error(payload?.message || "Não foi possível ler a foto.");
          }

          if (!activeDriverId && suggestedDriverId) {
            activeDriverId = suggestedDriverId;
            setDriverId(activeDriverId);
          }
          if (!activeFleetId && suggestedFleetId) {
            activeFleetId = suggestedFleetId;
            setFleetId(activeFleetId);
          }

          const item: ReadItem = {
            id: crypto.randomUUID(),
            fileName: file.name,
            image,
            reading: nextReading,
            suggestedDriverId,
            suggestedFleetId,
          };
          setItems((current) => reconcileFuelingBatch([...current, item]));
        } catch (error) {
          const detail = error instanceof Error
            ? error.message
            : typeof error === "string"
              ? error
              : (() => {
                  try { return JSON.stringify(error); } catch { return "Falha na leitura."; }
                })();
          if (image) {
            const manualItem: ReadItem = {
              id: crypto.randomUUID(),
              fileName: file.name,
              image,
              reading: manualFallbackReading(detail || "Falha na leitura automática."),
              suggestedDriverId: null,
              suggestedFleetId: null,
            };
            setItems((current) => reconcileFuelingBatch([...current, manualItem]));
          }
          setErrors((current) => [
            ...current,
            file.name + ": " + (detail || "Falha na leitura.") + (image ? " A foto foi mantida para conferência manual." : ""),
          ]);
        }
      }
      setProgress("Leitura concluída. Confira antes de gravar.");
    } finally {
      setReading(false);
      if (galleryRef.current) galleryRef.current.value = "";
      if (cameraRef.current) cameraRef.current.value = "";
    }
  }

  function updateReading(id: string, patch: Partial<FuelingReading>) {
    setItems((current) => current.map((item) =>
      item.id === id
        ? { ...item, saved: false, message: undefined, reading: { ...item.reading, ...patch } }
        : item
    ));
  }

  async function saveItem(item: ReadItem, quiet = false) {
    if (item.saving || item.saved) return true;
    setItems((current) => current.map((row) => row.id === item.id ? { ...row, saving: true, message: undefined } : row));
    try {
      const response = await fetch("/api/salvar-abastecimento-foto", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          imagem: item.image,
          fileName: item.fileName,
          reading: item.reading,
          driverId: driverId || item.suggestedDriverId || null,
          fleetId: fleetId || item.suggestedFleetId || null,
          confirmed: true,
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload?.message || "Não foi possível gravar.");
      setItems((current) => current.map((row) =>
        row.id === item.id
          ? { ...row, saving: false, saved: true, message: payload?.message || "Abastecimento gravado." }
          : row
      ));
      await queryClient.invalidateQueries({ queryKey: fleetKey });
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Não foi possível gravar.";
      setItems((current) => current.map((row) =>
        row.id === item.id ? { ...row, saving: false, saved: false, message } : row
      ));
      if (!quiet) setErrors((current) => [...current, item.fileName + ": " + message]);
      return false;
    }
  }

  async function saveSafe() {
    const candidates = items.filter((item) =>
      !item.saved &&
      item.reading.confidence >= 0.9 &&
      item.reading.consistency === "confirmed" &&
      !!item.reading.date &&
      !!item.reading.liters &&
      !!item.reading.price_per_liter &&
      !!(fleetId || item.suggestedFleetId)
    );
    for (const item of candidates) {
      await saveItem(item, true);
    }
  }

  return (
    <section className="mt-6 rounded-2xl border border-border bg-surface p-4 sm:p-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Fuel className="size-5 text-accent" />
            <h2 className="font-display text-xl font-semibold sm:text-2xl">Leitor de abastecimento</h2>
          </div>
          <p className="mt-2 max-w-3xl text-sm text-muted">
            Envie fotos do ticket do posto ou do visor da bomba. No visor padrão da Trans Salomão:
            cima = valor total, meio = litros e baixo = preço por litro. A leitura preserva as casas decimais e confere os valores matematicamente.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button type="button" onClick={() => cameraRef.current?.click()} disabled={reading}>
            <Camera className="size-4" />
            Câmera
          </Button>
          <Button type="button" onClick={() => galleryRef.current?.click()} disabled={reading}>
            {reading ? <LoaderCircle className="size-4 animate-spin" /> : <Upload className="size-4" />}
            Fotos
          </Button>
          {safeCount > 0 ? (
            <Button type="button" onClick={() => void saveSafe()} disabled={reading}>
              <CheckCircle2 className="size-4" />
              Gravar seguros ({safeCount})
            </Button>
          ) : null}
        </div>

        <input
          ref={galleryRef}
          type="file"
          multiple
          accept="image/jpeg,image/png,image/webp"
          className="hidden"
          onChange={(event) => void handleFiles(event.target.files)}
        />
        <input
          ref={cameraRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={(event) => void handleFiles(event.target.files)}
        />
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        <Field label="Motorista" hint="A IA também tenta identificar pelo documento">
          <Select value={driverId} onChange={(event) => setDriverId(event.target.value)}>
            <option value="">Detectar / selecionar depois</option>
            {(data?.drivers ?? []).filter((driver) => driver.status === "ativo").map((driver) => (
              <option key={driver.id} value={driver.id}>{driver.name}</option>
            ))}
          </Select>
        </Field>
        <Field label="Conjunto" hint="Obrigatório para gravar; pode ser detectado pela placa">
          <Select value={fleetId} onChange={(event) => setFleetId(event.target.value)}>
            <option value="">Detectar pela placa / selecionar depois</option>
            {(data?.fleets ?? []).filter((fleet) => fleet.status === "ativo").map((fleet) => (
              <option key={fleet.id} value={fleet.id}>
                {fleet.name} · {fleet.tractorPlate || "sem cavalo"} / {fleet.trailerPlate || "sem carreta"}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      {progress ? <p className="mt-4 text-sm text-muted">{progress}</p> : null}

      {errors.length ? (
        <div className="mt-4 rounded-xl border border-border bg-bg p-3">
          {errors.slice(-6).map((message, index) => (
            <p key={index} className="text-xs text-danger">• {message}</p>
          ))}
        </div>
      ) : null}

      {items.length ? (
        <div className="mt-5 grid gap-4">
          {items.map((item) => (
            <FuelingReadCard
              key={item.id}
              item={item}
              onChange={(patch) => updateReading(item.id, patch)}
              onSave={() => void saveItem(item)}
            />
          ))}
        </div>
      ) : null}
    </section>
  );
}

function manualFallbackReading(reason: string): FuelingReading {
  return {
    document_type: "unknown",
    date: null,
    time: null,
    station_name: null,
    station_cnpj: null,
    station_address: null,
    pump_number: null,
    nozzle_number: null,
    fuel_type: null,
    liters: null,
    price_per_liter: null,
    total_amount: null,
    discount_amount: null,
    odometer_km: null,
    plate: null,
    driver_name: null,
    receipt_number: null,
    payment_method: null,
    consistency: "partial",
    confidence: 0,
    calculation_basis: null,
    alerts: [
      "A leitura automática não concluiu. A foto foi mantida na tela para você conferir e preencher os campos manualmente.",
      reason,
    ].filter(Boolean),
    visual_hints: [],
  };
}

function FuelingReadCard({
  item,
  onChange,
  onSave,
}: {
  item: ReadItem;
  onChange: (patch: Partial<FuelingReading>) => void;
  onSave: () => void;
}) {
  const r = item.reading;
  const status = r.consistency === "confirmed"
    ? "Valores conferem"
    : r.consistency === "calculated"
      ? "Um valor foi calculado"
      : r.consistency === "conflict"
        ? "Conflito nos valores"
        : "Leitura parcial";

  return (
    <article className="rounded-xl border border-border bg-bg p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
        <img
          src={item.image}
          alt={"Foto " + item.fileName}
          className="h-28 w-full rounded-lg border border-border object-cover sm:w-40"
        />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <strong className="truncate text-sm">{item.fileName}</strong>
            <span className="rounded-full border border-border px-2 py-0.5 text-[11px] text-muted">
              {documentLabel(r.document_type)}
            </span>
            <span className="rounded-full border border-border px-2 py-0.5 text-[11px] text-muted">
              {Math.round(r.confidence * 100)}% confiança
            </span>
          </div>
          <p className={"mt-2 flex items-center gap-1 text-xs " + (r.consistency === "conflict" ? "text-danger" : "text-muted")}>
            {r.consistency === "conflict" ? <AlertTriangle className="size-3.5" /> : <CheckCircle2 className="size-3.5" />}
            {status}
          </p>
          {r.fuel_type || r.station_name ? (
            <p className="mt-1 text-xs text-muted">
              {[r.station_name, r.fuel_type, r.pump_number ? "Bomba " + r.pump_number : ""].filter(Boolean).join(" · ")}
            </p>
          ) : null}
        </div>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <MiniField label="Data">
          <input
            type="date"
            value={r.date ?? ""}
            onChange={(event) => onChange({ date: event.target.value || null })}
            className={inputClass}
          />
        </MiniField>
        <MiniField label="Litros exatos">
          <input
            inputMode="decimal"
            value={r.liters ?? ""}
            onChange={(event) => onChange({ liters: event.target.value || null, consistency: "partial" })}
            placeholder="Ex.: 412,735"
            className={inputClass}
          />
        </MiniField>
        <MiniField label="Preço/L exato">
          <input
            inputMode="decimal"
            value={r.price_per_liter ?? ""}
            onChange={(event) => onChange({ price_per_liter: event.target.value || null, consistency: "partial" })}
            placeholder="Ex.: 5,879"
            className={inputClass}
          />
        </MiniField>
        <MiniField label="Total final R$">
          <input
            inputMode="decimal"
            value={r.total_amount ?? ""}
            onChange={(event) => onChange({ total_amount: event.target.value || null, consistency: "partial" })}
            placeholder="Valor efetivamente pago"
            className={inputClass}
          />
        </MiniField>
        <MiniField label="Desconto R$">
          <input
            inputMode="decimal"
            value={r.discount_amount ?? ""}
            onChange={(event) => onChange({ discount_amount: event.target.value || null, consistency: "partial" })}
            placeholder="Se houver"
            className={inputClass}
          />
        </MiniField>
        <MiniField label="Posto">
          <input
            value={r.station_name ?? ""}
            onChange={(event) => onChange({ station_name: event.target.value || null })}
            className={inputClass}
          />
        </MiniField>
        <MiniField label="Combustível">
          <input
            value={r.fuel_type ?? ""}
            onChange={(event) => onChange({ fuel_type: event.target.value || null })}
            className={inputClass}
          />
        </MiniField>
        <MiniField label="Bomba">
          <input
            value={r.pump_number ?? ""}
            onChange={(event) => onChange({ pump_number: event.target.value || null })}
            className={inputClass}
          />
        </MiniField>
        <MiniField label="Odômetro">
          <input
            inputMode="numeric"
            value={r.odometer_km ?? ""}
            onChange={(event) => {
              const clean = event.target.value.replace(/\D/g, "");
              onChange({ odometer_km: clean ? Number(clean) : null });
            }}
            className={inputClass}
          />
        </MiniField>
      </div>

      {(r.plate || r.receipt_number || r.time) ? (
        <p className="mt-3 text-xs text-muted">
          {[r.plate ? "Placa " + r.plate : "", r.receipt_number ? "Documento " + r.receipt_number : "", r.time ? "Hora " + r.time : ""]
            .filter(Boolean).join(" · ")}
        </p>
      ) : null}

      {r.alerts.length ? (
        <div className="mt-3 rounded-lg border border-border bg-surface p-3">
          {r.alerts.map((alert, index) => <p key={index} className="text-xs text-muted">• {alert}</p>)}
        </div>
      ) : null}

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <Button type="button" onClick={onSave} disabled={item.saving || item.saved || r.consistency === "conflict"}>
          {item.saving ? <LoaderCircle className="size-4 animate-spin" /> : <CheckCircle2 className="size-4" />}
          {item.saved ? "Gravado" : item.saving ? "Gravando…" : "Gravar abastecimento"}
        </Button>
        {item.message ? (
          <span className={"text-xs " + (item.saved ? "text-muted" : "text-danger")}>{item.message}</span>
        ) : null}
      </div>
    </article>
  );
}


// OCR assets are self-hosted on the same origin for reliable Android WebView fallback.
async function readFuelingWithLocalOcr(image: string) {
  // A primeira inicialização pode levar alguns segundos no Android. O ponto
  // importante é que ela acontece apenas uma vez; se o limite visual for
  // atingido, a mesma inicialização continua em segundo plano e a próxima
  // foto reutiliza o worker quando ele estiver pronto.
  const worker = await withOcrTimeout(
    getSharedLocalOcrWorker(),
    32_000,
    "O leitor local ainda está carregando.",
  );

  const ocrImage = await prepareLocalOcrImage(image);
  const result = await withOcrTimeout(
    worker.recognize(ocrImage),
    24_000,
    "A leitura desta foto demorou além do esperado.",
  );
  const text = String(result?.data?.text || "").trim();
  if (!text) throw new Error("A leitura local não encontrou texto legível nesta foto.");

  return {
    worker,
    reading: parseLocalFuelingText(text),
  };
}

function withOcrTimeout<T>(promise: Promise<T>, ms: number, message: string) {
  return new Promise<T>((resolve, reject) => {
    const timer = window.setTimeout(() => reject(new Error(message)), ms);
    promise.then(
      (value) => {
        window.clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        window.clearTimeout(timer);
        reject(error);
      },
    );
  });
}

async function prepareLocalOcrImage(dataUrl: string) {
  const image = await new Promise<HTMLImageElement>((resolve, reject) => {
    const element = new Image();
    element.onload = () => resolve(element);
    element.onerror = () => reject(new Error("Não foi possível preparar a foto para leitura local."));
    element.src = dataUrl;
  });

  // Android/WebView: reduzir a imagem antes do Tesseract diminui bastante
  // memória, download para o worker e tempo de reconhecimento.
  const maxSide = 1100;
  const scale = Math.min(1, maxSide / Math.max(image.naturalWidth, image.naturalHeight));

  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
  canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) return dataUrl;
  context.drawImage(image, 0, 0, canvas.width, canvas.height);

  // Pré-processamento leve: tons de cinza + contraste. Ajuda números de visor,
  // tickets impressos e reduz ruído sem destruir casas decimais.
  try {
    const frame = context.getImageData(0, 0, canvas.width, canvas.height);
    const pixels = frame.data;
    for (let i = 0; i < pixels.length; i += 4) {
      const gray = Math.round(pixels[i] * 0.299 + pixels[i + 1] * 0.587 + pixels[i + 2] * 0.114);
      const boosted = Math.max(0, Math.min(255, Math.round((gray - 128) * 1.28 + 128)));
      pixels[i] = boosted;
      pixels[i + 1] = boosted;
      pixels[i + 2] = boosted;
    }
    context.putImageData(frame, 0, 0);
  } catch {}

  return canvas.toDataURL("image/jpeg", 0.86);
}

function parseLocalFuelingText(text: string): FuelingReading {
  const raw = text.replace(/\r/g, "\n").replace(/[ \t]+/g, " ").replace(/\n{2,}/g, "\n").trim();
  const normalized = normalizeLocal(raw);
  const lines = raw.split(/\n+/).map((line) => line.trim()).filter(Boolean);

  const date = findDate(lines);
  const time = findTime(lines);
  const plate = findPlate(raw);
  const driverName = findDriverName(lines);
  const fuelType =
    /diesel\s*s[\s-]*500/i.test(raw) ? "Diesel S500" :
    /diesel\s*s[\s-]*10/i.test(raw) ? "Diesel S10" :
    /\bdiesel\b/i.test(raw) ? "Diesel" :
    /arla\s*32/i.test(raw) ? "Arla 32" :
    null;

  const coossutran = findCoossutranLocal(raw);
  const stationName = coossutran.detected && /coossutran/i.test(raw) ? "COOSSUTRAN" : findStationName(lines);
  const receiptNumber = findReceiptNumber(raw);
  const discount = findLabeledMoney(lines, ["valor descontos", "valor desconto", "descontos r$", "desconto r$"]);
  const total = findFinalTotal(lines);
  const grossTotal = findGrossTotal(lines);
  const grossTarget = grossTotal
    ? Number(grossTotal)
    : (total ? Number(total) + Number(discount || 0) : null);
  const mathPair = findFuelPairFromMathLocal(raw, grossTarget);
  const productNumbers = findFuelProductNumbers(raw);

  const pumpNumbers = findPumpDisplayNumbers(lines);
  let liters = coossutran.liters ?? mathPair?.liters ?? productNumbers.liters ?? pumpNumbers.liters;
  let price = coossutran.price ?? mathPair?.price ?? productNumbers.price ?? pumpNumbers.price;
  const gross = grossTotal ?? productNumbers.gross ?? pumpNumbers.total;
  let resolvedTotal = coossutran.total ?? total ?? pumpNumbers.total;

  // Close de visor: muitas fotos reais mostram somente um campo grande.
  // Não gravamos automaticamente; classificamos o papel provável e depois
  // cruzamos com as outras fotos do mesmo lote pela relação matemática.
  if (!liters && !price && !resolvedTotal && pumpNumbers.standalone) {
    const n = Number(pumpNumbers.standalone);
    if (n >= 2 && n <= 20) price = pumpNumbers.standalone;
    else if (n >= 20 && n < 1000) liters = pumpNumbers.standalone;
    else if (n >= 1000) resolvedTotal = pumpNumbers.standalone;
  }

  const repaired = repairLocalCoreNumbers(liters, price, resolvedTotal);
  liters = repaired.liters;
  price = repaired.price;
  resolvedTotal = repaired.total;

  let consistency: FuelingReading["consistency"] = "partial";
  let confidence = 0.72;
  const alerts: string[] = ["Leitura local usada. Confira os campos antes de gravar."];
  if (repaired.alert) alerts.push(repaired.alert);
  let calculationBasis: string | null = null;

  if (liters && price && resolvedTotal) {
    const l = Number(liters);
    const p = Number(price);
    const t = Number(resolvedTotal);
    const d = Number(discount || 0);
    const expected = l * p - d;
    const tolerance = Math.max(0.12, l * p * 0.0005);

    if (Math.abs(expected - t) <= tolerance) {
      consistency = "confirmed";
      confidence = driverName || plate ? 0.93 : 0.9;
      calculationBasis = discount
        ? "OCR local: litros × preço/L − desconto confere com o total final."
        : "OCR local: litros × preço/L confere com o total final.";
    } else if (gross && Math.abs(Number(gross) - l * p) <= tolerance) {
      consistency = "partial";
      confidence = 0.86;
      alerts.push("Quantidade e preço foram identificados, mas o total final precisa ser conferido.");
    } else if (repaired.litersWasScaled && price && resolvedTotal) {
      const derived = (Number(resolvedTotal) + Number(discount || 0)) / Number(price);
      if (derived >= 20 && derived <= 3000) {
        liters = derived.toFixed(3);
        consistency = "calculated";
        confidence = 0.86;
        calculationBasis = "Litros recuperados por (total + desconto) ÷ preço/L após perda da vírgula no OCR.";
        alerts.push("A vírgula dos litros foi recuperada pela conferência matemática.");
      } else {
        consistency = "conflict";
        confidence = 0.78;
        alerts.push("Os valores reconhecidos não fecharam matematicamente. Confira litros, preço, desconto e total.");
      }
    } else {
      consistency = "conflict";
      confidence = 0.78;
      alerts.push("Os valores reconhecidos não fecharam matematicamente. Confira litros, preço, desconto e total.");
    }
  } else if (liters && price) {
    consistency = "partial";
    confidence = 0.84;
  }

  return {
    document_type: coossutran.detected ? "fuel_receipt" : /\bdanfe\b|nota fiscal|nf-?e/i.test(raw) ? "invoice" : pumpNumbers.detected ? "pump_display" : "fuel_receipt",
    date,
    time,
    station_name: stationName,
    station_cnpj: findCnpj(raw),
    station_address: null,
    pump_number: null,
    nozzle_number: null,
    fuel_type: fuelType,
    liters,
    price_per_liter: price,
    total_amount: resolvedTotal,
    discount_amount: discount,
    odometer_km: findOdometer(raw),
    plate,
    driver_name: driverName,
    receipt_number: receiptNumber,
    payment_method: null,
    consistency,
    confidence,
    calculation_basis: calculationBasis,
    alerts,
    visual_hints: [
      normalized.includes("danfe") ? "DANFE simplificado" : "",
      normalized.includes("valor total") ? "Valor Total" : "",
      normalized.includes("placa") ? "Placa" : "",
    ].filter(Boolean),
  };
}

function normalizeLocal(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("pt-BR")
    .replace(/\s+/g, " ")
    .trim();
}

function decimalToken(value: string | undefined | null) {
  if (!value) return null;
  let raw = value.replace(/[^\d.,]/g, "");
  if (!raw) return null;
  if (/^\d{1,3}(?:\.\d{3})+,\d+$/.test(raw)) raw = raw.replace(/\./g, "").replace(",", ".");
  else if (/^\d+,\d+$/.test(raw)) raw = raw.replace(",", ".");
  else if (/^\d{1,3}(?:,\d{3})+\.\d+$/.test(raw)) raw = raw.replace(/,/g, "");
  if (!/^\d+(?:\.\d+)?$/.test(raw)) return null;
  const number = Number(raw);
  return Number.isFinite(number) && number > 0 ? raw : null;
}

function fixedRole(value: number, decimals: number) {
  return value.toFixed(decimals);
}

function localRoleNumber(rawValue: string, role: "liters" | "price" | "money") {
  const cleaned = String(rawValue || "").replace(/[^0-9.,]/g, "");
  if (!cleaned) return null;

  if (/[.,]/.test(cleaned)) {
    const direct = decimalToken(cleaned);
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
      if (scaled >= 1 && scaled <= 2500) return fixedRole(scaled, 3);
    }
  }

  if (role === "price") {
    if (n >= 2 && n <= 20) return String(n);
    const divisors = cleaned.length >= 4 ? [1000, 100] : [100, 1000];
    for (const divisor of divisors) {
      const scaled = n / divisor;
      if (scaled >= 2 && scaled <= 20) return fixedRole(scaled, divisor === 1000 ? 3 : 2);
    }
  }

  if (role === "money") {
    if (n >= 1 && n <= 100_000 && cleaned.length <= 4) return String(n);
    if (cleaned.length >= 3 && cleaned.length <= 8) {
      const scaled = n / 100;
      if (scaled >= 1 && scaled <= 100_000) return fixedRole(scaled, 2);
    }
  }
  return null;
}

function repairLocalCoreNumbers(liters: string | null, price: string | null, total: string | null) {
  let l = liters;
  let p = price;
  let t = total;
  let litersWasScaled = false;
  let alert: string | null = null;

  if (l && Number.isInteger(Number(l)) && Number(l) > 3000 && Number(l) <= 3_000_000) {
    const scaled = Number(l) / 1000;
    if (scaled >= 20 && scaled <= 3000) {
      l = fixedRole(scaled, 3);
      litersWasScaled = true;
      alert = "OCR perdeu a vírgula dos litros; casas decimais foram restauradas.";
    }
  }

  if (p && Number.isInteger(Number(p)) && Number(p) > 20) {
    const repaired = localRoleNumber(p, "price");
    if (repaired) p = repaired;
  }
  if (t && Number.isInteger(Number(t)) && Number(t) > 100_000) {
    const repaired = localRoleNumber(t, "money");
    if (repaired) t = repaired;
  }

  return { liters: l, price: p, total: t, litersWasScaled, alert };
}

function findCoossutranLocal(text: string) {
  const normalized = normalizeLocal(text);
  const detected = /coossutran|ordem\s+abast|veiculo\s+placa/.test(normalized) && /diesel/.test(normalized);
  if (!detected) return { detected: false, liters: null, price: null, total: null };

  const flat = text.replace(/\r?\n/g, " ").replace(/\s+/g, " ");
  const diesel = flat.match(/DIESEL\s*[:\-]?\s*([0-9][0-9.,]{2,})\s*(?:LTS?\.?|LITROS?)?[\s\S]{0,55}?R\$?\s*[:\-]?\s*([0-9][0-9.,]{1,})/i);
  let liters = diesel?.[1] ? localRoleNumber(diesel[1], "liters") : null;
  let price = diesel?.[2] ? localRoleNumber(diesel[2], "price") : null;

  if (!liters) {
    const m = flat.match(/DIESEL[\s\S]{0,45}?([0-9]{4,7}|[0-9]{1,4}[.,][0-9]{2,3})\s*(?:LTS?\.?|LITROS?)/i);
    if (m?.[1]) liters = localRoleNumber(m[1], "liters");
  }
  if (!price) {
    const m = flat.match(/DIESEL[\s\S]{0,80}?R\$?\s*[:\-]?\s*([0-9]{2,5}|[0-9]{1,3}[.,][0-9]{1,3})/i);
    if (m?.[1]) price = localRoleNumber(m[1], "price");
  }

  let total: string | null = null;
  const totals = [...flat.matchAll(/TOTAL\s*:?[^R]{0,45}?R\$\s*[:\-]?\s*([0-9][0-9.,]{2,})/ig)];
  if (totals.length) total = localRoleNumber(totals[totals.length - 1][1], "money");
  if (!total && liters && price) total = (Number(liters) * Number(price)).toFixed(2);

  return { detected: true, liters, price, total };
}

function protectedFuelingNumericLineLocal(line: string) {
  const normalized = normalizeLocal(line);
  return /\b(?:cnpj|cpf|chave|protocolo|serie|nfc|nf-e|nsu|autorizacao|telefone|fone|cep|consumidor)\b/.test(normalized)
    || /\b\d{1,2}[\/.\-]\d{1,2}[\/.\-](?:20)?\d{2}\b/.test(line)
    || /\b(?:[01]?\d|2[0-3]):[0-5]\d\b/.test(line);
}

function fuelContextLinesLocal(text: string) {
  const lines = text.replace(/\r/g, "\n").split(/\n+/).map((line) => line.trim()).filter(Boolean);
  const index = lines.findIndex((line) => /oleo diesel|diesel s ?500|diesel s ?10|\bdiesel\b/i.test(normalizeLocal(line)));
  if (index < 0) return [];
  return lines
    .slice(Math.max(0, index - 1), Math.min(lines.length, index + 5))
    .filter((line) => !protectedFuelingNumericLineLocal(line));
}

function findFuelPairFromMathLocal(text: string, grossTarget: number | null) {
  if (!grossTarget || !Number.isFinite(grossTarget) || grossTarget <= 0) return null;
  const sourceLines = fuelContextLinesLocal(text);
  if (!sourceLines.length) return null;

  const rawTokens = [...sourceLines.join(" ").matchAll(/\b([0-9]{1,7}(?:[.,][0-9]{1,3})?)\b/g)].map((m) => m[1]);
  const litersCandidates = new Set<string>();
  const priceCandidates = new Set<string>();

  for (const token of rawTokens) {
    const l = localRoleNumber(token, "liters");
    const p = localRoleNumber(token, "price");
    if (l) litersCandidates.add(l);
    if (p) priceCandidates.add(p);
  }

  let best: { liters: string; price: string; error: number } | null = null;
  for (const liters of litersCandidates) {
    for (const price of priceCandidates) {
      const expected = Number(liters) * Number(price);
      const error = Math.abs(expected - grossTarget);
      const tolerance = Math.max(0.15, grossTarget * 0.001);
      if (error <= tolerance && (!best || error < best.error)) best = { liters, price, error };
    }
  }
  return best;
}

function findGrossTotal(lines: string[]) {
  for (let i = 0; i < lines.length; i += 1) {
    const normalized = normalizeLocal(lines[i]);
    if (!/valor total (?:dos )?produtos|total produtos|vl\.?\s*total (?:dos )?produtos/.test(normalized)) continue;
    const joined = [lines[i], lines[i + 1] || ""].join(" ");
    const decimals = [...joined.matchAll(/(?:R\$\s*)?(\d{1,3}(?:\.\d{3})*,\d{2}|\d+,\d{2}|\d+\.\d{2})/g)];
    if (decimals.length) return decimalToken(decimals[decimals.length - 1][1]);
    const bare = joined.match(/([0-9]{4,8})\b/);
    if (bare?.[1]) return localRoleNumber(bare[1], "money");
  }
  return null;
}

function coreReadingScore(reading: FuelingReading) {
  const core = [reading.liters, reading.price_per_liter, reading.total_amount].filter(Boolean).length;
  const metadata = [reading.date, reading.station_name, reading.fuel_type, reading.plate, reading.receipt_number].filter(Boolean).length;
  const consistency = reading.consistency === "confirmed" ? 5 : reading.consistency === "calculated" ? 4 : reading.consistency === "partial" ? 2 : 0;
  return core * 4 + metadata + consistency + Math.round((reading.confidence || 0) * 3);
}

function needsSecondOcrPass(reading: FuelingReading) {
  const core = [reading.liters, reading.price_per_liter, reading.total_amount].filter(Boolean).length;
  return core < 2 || reading.consistency === "conflict" || (reading.confidence || 0) < 0.82;
}

function mergeFuelingReadings(server: FuelingReading, local: FuelingReading): FuelingReading {
  const preferred = coreReadingScore(local) > coreReadingScore(server) ? local : server;
  const other = preferred === server ? local : server;

  const merged: FuelingReading = {
    ...preferred,
    date: preferred.date || other.date,
    time: preferred.time || other.time,
    station_name: preferred.station_name || other.station_name,
    station_cnpj: preferred.station_cnpj || other.station_cnpj,
    station_address: preferred.station_address || other.station_address,
    pump_number: preferred.pump_number || other.pump_number,
    nozzle_number: preferred.nozzle_number || other.nozzle_number,
    fuel_type: preferred.fuel_type || other.fuel_type,
    liters: preferred.liters || other.liters,
    price_per_liter: preferred.price_per_liter || other.price_per_liter,
    total_amount: preferred.total_amount || other.total_amount,
    discount_amount: preferred.discount_amount || other.discount_amount,
    odometer_km: preferred.odometer_km || other.odometer_km,
    plate: preferred.plate || other.plate,
    driver_name: preferred.driver_name || other.driver_name,
    receipt_number: preferred.receipt_number || other.receipt_number,
    payment_method: preferred.payment_method || other.payment_method,
    alerts: Array.from(new Set([...(preferred.alerts || []), ...(other.alerts || []), "Leitura conferida por duas fontes de OCR."])),
    visual_hints: Array.from(new Set([...(preferred.visual_hints || []), ...(other.visual_hints || [])])),
    confidence: Math.max(preferred.confidence || 0, other.confidence || 0),
  };

  const repaired = repairLocalCoreNumbers(merged.liters, merged.price_per_liter, merged.total_amount);
  merged.liters = repaired.liters;
  merged.price_per_liter = repaired.price;
  merged.total_amount = repaired.total;

  const l = merged.liters ? Number(merged.liters) : null;
  const p = merged.price_per_liter ? Number(merged.price_per_liter) : null;
  const t = merged.total_amount ? Number(merged.total_amount) : null;
  const d = merged.discount_amount ? Number(merged.discount_amount) : 0;
  if (l && p && t) {
    const expected = l * p - d;
    const tolerance = Math.max(0.12, l * p * 0.0005);
    if (Math.abs(expected - t) <= tolerance) {
      merged.consistency = "confirmed";
      merged.confidence = Math.max(merged.confidence, 0.92);
      merged.calculation_basis = "Leitura conferida por OCR do servidor + OCR local e validada matematicamente.";
    }
  }
  return merged;
}

function findDate(lines: string[]) {
  const preferred = lines.filter((line) => /emiss[aã]o|autoriza[cç][aã]o|abastecimento|data/i.test(line));
  for (const line of [...preferred, ...lines]) {
    const match = line.match(/\b([0-3]?\d)[\/.-]([01]?\d)[\/.-](20\d{2}|\d{2})\b/);
    if (!match) continue;
    const year = match[3].length === 2 ? "20" + match[3] : match[3];
    return year + "-" + String(Number(match[2])).padStart(2, "0") + "-" + String(Number(match[1])).padStart(2, "0");
  }
  return null;
}

function findTime(lines: string[]) {
  const preferred = lines.filter((line) => /autoriza[cç][aã]o|abastecimento|hora/i.test(line));
  for (const line of [...preferred, ...lines]) {
    const match = line.match(/\b([01]?\d|2[0-3]):([0-5]\d)(?::([0-5]\d))?\b/);
    if (match) return String(Number(match[1])).padStart(2, "0") + ":" + match[2] + (match[3] ? ":" + match[3] : "");
  }
  return null;
}

function findPlate(text: string) {
  const match = text.toUpperCase().match(/\bPLACA\s*[:\-]?\s*([A-Z]{3})[\s.-]*([0-9][A-Z0-9][0-9]{2})\b/);
  if (!match) return null;
  return match[1] + match[2];
}

function looksLikePersonName(value: string) {
  const cleaned = value
    .replace(/\b(?:CPF|CNPJ|IE|RG|ENDERE[CÇ]O|AVENIDA|RUA|RODOVIA|CLIENTE|DESTINAT[ÁA]RIO)\b.*$/i, "")
    .replace(/[^A-Za-zÀ-ÿ .'’-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const words = cleaned.match(/[A-Za-zÀ-ÿ]{2,}/g) || [];
  return words.length >= 2 && words.length <= 8 ? cleaned : null;
}

function findDriverName(lines: string[]) {
  for (let i = 0; i < lines.length; i += 1) {
    if (/^\s*destinat[áa]rio\s*$/i.test(lines[i])) {
      for (let j = i + 1; j <= Math.min(lines.length - 1, i + 4); j += 1) {
        const candidate = looksLikePersonName(lines[j]);
        if (candidate && !/rua|avenida|vila|cnpj|cpf/i.test(candidate)) return candidate;
      }
    }
  }

  for (const line of lines) {
    const client = line.match(/\bCLIENTE\s*[:\-]\s*(.+?)(?=\s+(?:CNPJ|CPF)\b|$)/i);
    if (client?.[1]) {
      const candidate = looksLikePersonName(client[1]);
      if (candidate) return candidate;
    }
  }
  return null;
}

function cleanLocalStationName(value: string | null) {
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

function findStationName(lines: string[]) {
  const business = lines.find((line) =>
    /\b(?:AUTO\s+POSTO|POSTO\s+DE\s+COMBUST|POSTO\s+[A-ZÀ-Ý]|COMBUSTIVEIS|COMBUSTÍVEIS|COOSSUTRAN|LTDA\.?|EIRELI|COOPERATIVA)\b/i.test(line)
    && !/valor|produto|cliente|destinat|endereco|endereço|chave|protocolo/i.test(line)
  );
  if (business) {
    const cleaned = cleanLocalStationName(business);
    if (cleaned) return cleaned;
  }

  const cnpjIndex = lines.findIndex((line) => /\bCNPJ\b/i.test(line));
  if (cnpjIndex > 0) {
    for (let i = cnpjIndex - 1; i >= Math.max(0, cnpjIndex - 7); i -= 1) {
      const line = lines[i];
      if (/rua|avenida|rodovia|cep|bairro|valor|produto|nota|cupom|\b[A-ZÀ-Ý ]+\s*-\s*[A-Z]{2}\b/i.test(line)) continue;
      const candidate = looksLikePersonName(line);
      const cleaned = cleanLocalStationName(candidate);
      if (cleaned) return cleaned;
    }
  }
  return null;
}

function findCnpj(text: string) {
  const match = text.match(/\bCNPJ\s*[:\-]?\s*(\d{2}\D?\d{3}\D?\d{3}\D?\d{4}\D?\d{2})/i);
  return match?.[1]?.replace(/\D/g, "") || null;
}

function findReceiptNumber(text: string) {
  const match = text.match(/\bN[uú]mero\s*[:\-]?\s*([0-9][0-9.\-]{2,})/i);
  return match?.[1]?.trim() || null;
}

function findOdometer(text: string) {
  const match = text.match(/\bOD[ÔO]METRO\s*[:\-]?\s*([0-9.]{2,})/i);
  if (!match) return null;
  const number = Number(match[1].replace(/\./g, ""));
  return Number.isFinite(number) ? number : null;
}

function findLabeledMoney(lines: string[], labels: string[]) {
  for (let i = 0; i < lines.length; i += 1) {
    const normalized = normalizeLocal(lines[i]);
    if (!labels.some((label) => normalized.includes(normalizeLocal(label)))) continue;
    const joined = [lines[i], lines[i + 1] || ""].join(" ");
    const matches = [...joined.matchAll(/(?:R\$\s*)?(\d{1,3}(?:\.\d{3})*,\d{2}|\d+,\d{2}|\d+\.\d{2})/g)];
    for (let m = matches.length - 1; m >= 0; m -= 1) {
      const value = decimalToken(matches[m][1]);
      if (value) return value;
    }
  }
  return null;
}

function findPumpDisplayNumbers(lines: string[]) {
  const joined = lines.join("\n");
  const normalized = normalizeLocal(joined);
  const detected = /total a pagar|preco por litro|litros|r\$/.test(normalized);
  const receiptLike = /cnpj|danfe|nota fiscal|nf-?e|cupom|comprovante|nsu|autorizacao|chave de acesso/.test(normalized);

  const afterLabel = (label: RegExp, role: "liters" | "price" | "money") => {
    if (!detected) return null;
    for (let i = 0; i < lines.length; i += 1) {
      if (!label.test(normalizeLocal(lines[i]))) continue;
      const neighborhood = [lines[i], lines[i + 1] || ""].join(" ");
      const raw = [...neighborhood.matchAll(/\b(\d{1,8}(?:[.,]\d{1,3})?)\b/g)].map((m) => m[1]);
      for (const token of raw) {
        const value = localRoleNumber(token, role);
        if (value) return value;
      }
    }
    return null;
  };

  let total = afterLabel(/total a pagar|valor total|total r\$/, "money");
  let liters = afterLabel(/^litros$|\blitros\b|quantidade|\bqtd\b/, "liters");
  let price = afterLabel(/preco por litro|preco\/l|r\$\/l|vl\.?unit/, "price");

  if (receiptLike) return { detected, total, liters, price, standalone: null };

  const orderedRaw = [...joined.matchAll(/\b(\d{1,8}(?:[.,]\d{1,3})?)\b/g)].map((m) => m[1]);
  if (orderedRaw.length >= 3) {
    for (let i = 0; i <= orderedRaw.length - 3; i += 1) {
      const top = localRoleNumber(orderedRaw[i], "money");
      const middle = localRoleNumber(orderedRaw[i + 1], "liters");
      const bottom = localRoleNumber(orderedRaw[i + 2], "price");
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

  const candidates = orderedRaw.map((raw) => ({
    liters: localRoleNumber(raw, "liters"),
    price: localRoleNumber(raw, "price"),
    total: localRoleNumber(raw, "money"),
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

  const standaloneTokens = orderedRaw.map((raw) => decimalToken(raw)).filter((v): v is string => !!v);
  const standalone = !detected && standaloneTokens.length === 1 ? standaloneTokens[0] : null;
  return { detected, total, liters, price, standalone };
}

function findFinalTotal(lines: string[]) {
  for (let i = 0; i < lines.length; i += 1) {
    const normalized = normalizeLocal(lines[i]);
    if (!normalized.includes("valor total")) continue;
    if (normalized.includes("produtos") || normalized.includes("itens") || normalized.includes("desconto")) continue;
    const joined = [lines[i], lines[i + 1] || ""].join(" ");
    const matches = [...joined.matchAll(/(?:R\$\s*)?(\d{1,3}(?:\.\d{3})*,\d{2}|\d+,\d{2}|\d+\.\d{2})/g)];
    for (let m = matches.length - 1; m >= 0; m -= 1) {
      const value = decimalToken(matches[m][1]);
      if (value) return value;
    }
  }
  return null;
}

function findFuelProductNumbers(text: string) {
  const lines = fuelContextLinesLocal(text);
  if (!lines.length) return { liters: null, price: null, gross: null };

  let labeledLiters: string | null = null;
  let labeledPrice: string | null = null;
  let labeledGross: string | null = null;

  for (let i = 0; i < lines.length; i += 1) {
    const normalized = normalizeLocal(lines[i]);
    const neighborhood = [lines[i], lines[i + 1] || ""].join(" ");
    const raw = [...neighborhood.matchAll(/\b([0-9]{1,8}(?:[.,]\d{1,3})?)\b/g)].map((m) => m[1]);

    if (!labeledLiters && /\b(?:qtd|quantidade|litros|lts?)\b/.test(normalized)) {
      labeledLiters = (raw.map((x) => localRoleNumber(x, "liters")).find(Boolean) as string | undefined) || null;
    }
    if (!labeledPrice && /preco|preço|vl\.?\s*unit|r\$\s*\/\s*l/.test(normalized)) {
      labeledPrice = (raw.map((x) => localRoleNumber(x, "price")).find(Boolean) as string | undefined) || null;
    }
    if (!labeledGross && /vl\.?\s*total|valor\s+produto|total\s+produto/.test(normalized)) {
      labeledGross = (raw.map((x) => localRoleNumber(x, "money")).filter(Boolean).pop() as string | undefined) || null;
    }
  }

  const rawTokens = [...lines.join(" ").matchAll(/\b([0-9]{1,8}(?:[.,]\d{1,3})?)\b/g)].map((m) => m[1]);
  const litersCandidates = Array.from(new Set(rawTokens.map((raw) => localRoleNumber(raw, "liters")).filter((v): v is string => !!v)));
  const priceCandidates = Array.from(new Set(rawTokens.map((raw) => localRoleNumber(raw, "price")).filter((v): v is string => !!v)));
  const moneyCandidates = Array.from(new Set(rawTokens.map((raw) => localRoleNumber(raw, "money")).filter((v): v is string => !!v)));

  let best: { liters: string; price: string; gross: string; error: number } | null = null;
  for (const l of litersCandidates) {
    for (const p of priceCandidates) {
      const expected = Number(l) * Number(p);
      for (const g of moneyCandidates) {
        const error = Math.abs(expected - Number(g));
        if (error <= Math.max(0.12, expected * 0.001) && (!best || error < best.error)) {
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

  return { liters: labeledLiters, price: labeledPrice, gross: labeledGross };
}


function reconcileFuelingBatch(rows: ReadItem[]) {
  if (rows.length < 2) return rows;

  const liters = rows
    .map((row, index) => ({ index, value: row.reading.liters ? Number(row.reading.liters) : NaN, text: row.reading.liters }))
    .filter((x) => Number.isFinite(x.value) && x.value >= 20 && x.value <= 3000 && x.text);
  const prices = rows
    .map((row, index) => ({ index, value: row.reading.price_per_liter ? Number(row.reading.price_per_liter) : NaN, text: row.reading.price_per_liter }))
    .filter((x) => Number.isFinite(x.value) && x.value >= 2 && x.value <= 20 && x.text);
  const totals = rows
    .map((row, index) => ({ index, value: row.reading.total_amount ? Number(row.reading.total_amount) : NaN, text: row.reading.total_amount }))
    .filter((x) => Number.isFinite(x.value) && x.value >= 100 && x.text);

  const updates = new Map<number, { liters: string; price: string; total: string }>();

  for (const l of liters) {
    for (const p of prices) {
      const expected = l.value * p.value;
      for (const t of totals) {
        const tolerance = Math.max(0.12, expected * 0.0005);
        if (Math.abs(expected - t.value) > tolerance) continue;

        const distinctPhotos = new Set([l.index, p.index, t.index]).size;
        if (distinctPhotos < 2 && rows[l.index]?.reading.consistency !== "confirmed") continue;

        for (const idx of new Set([l.index, p.index, t.index])) {
          updates.set(idx, {
            liters: String(l.text),
            price: String(p.text),
            total: String(t.text),
          });
        }
      }
    }
  }

  if (!updates.size) return rows;

  return rows.map((row, index) => {
    const match = updates.get(index);
    if (!match) return row;
    const existingAlerts = row.reading.alerts || [];
    return {
      ...row,
      reading: {
        ...row.reading,
        liters: match.liters,
        price_per_liter: match.price,
        total_amount: match.total,
        consistency: "confirmed" as const,
        confidence: Math.max(row.reading.confidence || 0, 0.92),
        calculation_basis: "Valores cruzados entre fotos do mesmo lote: litros × preço/L confere com o total.",
        alerts: [
          "Esta foto foi vinculada a outras do mesmo lote por conferência matemática.",
          ...existingAlerts.filter((alert) => !/vinculada a outras/i.test(alert)),
        ],
      },
    };
  });
}


function matchLocalDriver(name: string | null, drivers: any[]) {
  if (!name) return null;
  const wanted = normalizeLocal(name);
  const compactWanted = wanted.replace(/[^a-z0-9]/g, "");
  const matches = drivers.filter((driver) => {
    const current = normalizeLocal(String(driver?.name || ""));
    const compact = current.replace(/[^a-z0-9]/g, "");
    return current === wanted ||
      (wanted.length >= 5 && (current.includes(wanted) || wanted.includes(current))) ||
      (compactWanted.length >= 8 && compact === compactWanted);
  });
  return matches.length === 1 ? matches[0] : null;
}

function matchLocalFleet(plate: string | null, fleets: any[]) {
  const wanted = String(plate || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (!wanted) return null;
  const matches = fleets.filter((fleet) => {
    const tractor = String(fleet?.tractorPlate || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
    const trailer = String(fleet?.trailerPlate || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
    return tractor === wanted || trailer === wanted;
  });
  return matches.length === 1 ? matches[0] : null;
}

function MiniField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="grid gap-1 text-xs text-muted">
      <span>{label}</span>
      {children}
    </label>
  );
}

function documentLabel(value: FuelingReading["document_type"]) {
  if (value === "pump_display") return "Visor da bomba";
  if (value === "fuel_receipt") return "Ticket do posto";
  if (value === "pos_receipt") return "Comprovante";
  if (value === "invoice") return "Nota fiscal";
  return "Foto";
}

const inputClass =
  "h-10 w-full rounded-lg border border-border bg-surface px-3 text-sm text-fg outline-none focus:border-accent";

async function compressPhoto(file: File) {
  if (!file.type.startsWith("image/")) throw new Error("Selecione uma imagem.");
  const url = URL.createObjectURL(file);
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const element = new Image();
      element.onload = () => resolve(element);
      element.onerror = () => reject(new Error("Não foi possível abrir a foto."));
      element.src = url;
    });

    let maxSide = 1900;
    let quality = 0.86;
    let result = "";
    for (let attempt = 0; attempt < 4; attempt += 1) {
      const scale = Math.min(1, maxSide / Math.max(image.naturalWidth, image.naturalHeight));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
      canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
      const context = canvas.getContext("2d");
      if (!context) throw new Error("Não foi possível preparar a foto.");
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      result = canvas.toDataURL("image/jpeg", quality);
      if (result.length <= 3_400_000) return result;
      maxSide = Math.max(1100, Math.round(maxSide * 0.82));
      quality = Math.max(0.68, quality - 0.06);
    }
    if (!result || result.length > 3_500_000) throw new Error("A foto continua grande demais.");
    return result;
  } finally {
    URL.revokeObjectURL(url);
  }
}
