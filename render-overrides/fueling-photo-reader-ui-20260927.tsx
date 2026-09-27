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
          if (!response.ok || !payload?.reading) {
            throw new Error(payload?.message || "Não foi possível ler a foto.");
          }
          if (!activeDriverId && payload.suggestedDriverId) {
            activeDriverId = String(payload.suggestedDriverId);
            setDriverId(activeDriverId);
          }
          if (!activeFleetId && payload.suggestedFleetId) {
            activeFleetId = String(payload.suggestedFleetId);
            setFleetId(activeFleetId);
          }
          const item: ReadItem = {
            id: crypto.randomUUID(),
            fileName: file.name,
            image,
            reading: payload.reading,
            suggestedDriverId: payload.suggestedDriverId ? String(payload.suggestedDriverId) : null,
            suggestedFleetId: payload.suggestedFleetId ? String(payload.suggestedFleetId) : null,
          };
          setItems((current) => [...current, item]);
        } catch (error) {
          setErrors((current) => [
            ...current,
            file.name + ": " + (error instanceof Error ? error.message : "Falha na leitura."),
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
        <MiniField label="Total R$">
          <input
            inputMode="decimal"
            value={r.total_amount ?? ""}
            onChange={(event) => onChange({ total_amount: event.target.value || null, consistency: "partial" })}
            placeholder="Valor visível"
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
