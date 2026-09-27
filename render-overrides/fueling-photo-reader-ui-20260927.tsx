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
    let localOcrWorker: any = null;
    try {
      const selected = Array.from(files).slice(0, 12);
      for (let index = 0; index < selected.length; index += 1) {
        const file = selected[index];
        setProgress("Lendo " + (index + 1) + " de " + selected.length + ": " + file.name);
        try {
          const image = await compressPhoto(file);
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
            nextReading = payload.reading as FuelingReading;
          } else if (response.status === 429) {
            setProgress("IA online sem créditos. Fazendo leitura local no aparelho: " + file.name);
            const local = await readFuelingWithLocalOcr(image, localOcrWorker);
            localOcrWorker = local.worker;
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
          setItems((current) => [...current, item]);
        } catch (error) {
          const detail = error instanceof Error
            ? error.message
            : typeof error === "string"
              ? error
              : (() => {
                  try { return JSON.stringify(error); } catch { return "Falha na leitura."; }
                })();
          setErrors((current) => [
            ...current,
            file.name + ": " + (detail || "Falha na leitura."),
          ]);
        }
      }
      setProgress("Leitura concluída. Confira antes de gravar.");
    } finally {
      if (localOcrWorker) {
        try { await localOcrWorker.terminate(); } catch {}
      }
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
            Envie fotos do ticket do posto ou do visor da bomba. A Salomão IA identifica litros,
            preço por litro, total, posto, combustível, bomba, data, placa e odômetro sem arredondar os valores.
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


// OCR assets are served from the same origin for Android WebView reliability.
async function readFuelingWithLocalOcr(image: string, existingWorker: any) {
  let worker = existingWorker;
  if (!worker) {
    const module = await import("tesseract.js");
    worker = await module.createWorker("por", 1, {
      workerPath: "/ocr/worker.min.js",
      corePath: "/ocr/core",
      langPath: "/ocr/lang",
      gzip: true,
    });
  }

  const result = await worker.recognize(image);
  const text = String(result?.data?.text || "").trim();
  if (!text) throw new Error("A leitura local não encontrou texto legível nesta foto.");

  return {
    worker,
    reading: parseLocalFuelingText(text),
  };
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

  const stationName = findStationName(lines);
  const receiptNumber = findReceiptNumber(raw);
  const discount = findLabeledMoney(lines, ["valor descontos", "valor desconto", "descontos r$", "desconto r$"]);
  const total = findFinalTotal(lines);
  const productNumbers = findFuelProductNumbers(raw);

  const liters = productNumbers.liters;
  const price = productNumbers.price;
  const gross = productNumbers.gross;

  let consistency: FuelingReading["consistency"] = "partial";
  let confidence = 0.72;
  const alerts: string[] = ["Leitura local usada porque a leitura online estava indisponível. Confira os campos antes de gravar."];
  let calculationBasis: string | null = null;

  if (liters && price && total) {
    const l = Number(liters);
    const p = Number(price);
    const t = Number(total);
    const d = Number(discount || 0);
    const expected = l * p - d;
    const tolerance = Math.max(0.15, l * p * 0.0035);

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
    document_type: /\bdanfe\b|nota fiscal|nf-?e/i.test(raw) ? "invoice" : "fuel_receipt",
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
    total_amount: total,
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
  return Number.isFinite(number) && number > 0 ? String(number) : null;
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

function findStationName(lines: string[]) {
  const cnpjIndex = lines.findIndex((line) => /\bCNPJ\b/i.test(line));
  if (cnpjIndex > 0) {
    for (let i = cnpjIndex - 1; i >= Math.max(0, cnpjIndex - 4); i -= 1) {
      const line = lines[i];
      if (/rua|avenida|rodovia|cep|vila|bairro/i.test(line)) continue;
      const candidate = looksLikePersonName(line);
      if (candidate) return candidate;
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
  const normalized = normalizeLocal(text);
  const dieselIndex = normalized.search(/oleo diesel|diesel s ?500|diesel s ?10|\bdiesel\b/);
  const source = dieselIndex >= 0
    ? text.slice(Math.max(0, dieselIndex - 180), Math.min(text.length, dieselIndex + 380))
    : text;

  const tokens = [...source.matchAll(/\b(\d{1,4}[.,]\d{2,3})\b/g)]
    .map((match) => ({ raw: match[1], value: decimalToken(match[1]) }))
    .filter((item): item is { raw: string; value: string } => !!item.value)
    .map((item) => ({ ...item, number: Number(item.value) }));

  const litersCandidate = tokens.find((item) => {
    const decimals = (item.raw.split(/[.,]/)[1] || "").length;
    return item.number >= 50 && item.number <= 3000 && decimals >= 2;
  });
  const priceCandidate = tokens.find((item) => item.number >= 2 && item.number <= 20);
  const grossCandidate = tokens.find((item) => item.number >= 100 && item !== litersCandidate);

  return {
    liters: litersCandidate?.value ?? null,
    price: priceCandidate?.value ?? null,
    gross: grossCandidate?.value ?? null,
  };
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
