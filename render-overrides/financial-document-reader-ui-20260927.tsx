import { Camera, FileText, LoaderCircle, Upload } from "lucide-react";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";

export type FinancialDocumentResult = {
  amount: string | null;
  date: string | null;
  time: string | null;
  driverName: string | null;
  suggestedDriverId: string | null;
  suggestedDriverName: string | null;
};

export function FinancialDocumentReader({
  kind,
  onRead,
}: {
  kind: "advance" | "expense";
  onRead: (reading: FinancialDocumentResult) => void;
}) {
  const fileInput = useRef<HTMLInputElement>(null);
  const cameraInput = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [fileName, setFileName] = useState("");
  const [reading, setReading] = useState<FinancialDocumentResult | null>(null);
  const [error, setError] = useState("");

  async function handleFile(file?: File | null) {
    if (!file) return;
    setBusy(true);
    setError("");
    setReading(null);
    setFileName(file.name || "comprovante");
    try {
      const prepared = await prepareFile(file);
      const response = await fetch("/api/ler-comprovante-financeiro", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fileName: prepared.fileName,
          mime: prepared.mime,
          base64: prepared.base64,
          kind,
        }),
      });
      const payload: any = await response.json().catch(() => ({}));
      if (!response.ok || !payload?.ok) throw new Error(payload?.message || "Não foi possível ler o comprovante.");
      const next: FinancialDocumentResult = {
        amount: typeof payload.amount === "string" ? payload.amount : null,
        date: typeof payload.date === "string" ? payload.date : null,
        time: typeof payload.time === "string" ? payload.time : null,
        driverName: typeof payload.driverName === "string" ? payload.driverName : null,
        suggestedDriverId: typeof payload.suggestedDriverId === "string" ? payload.suggestedDriverId : null,
        suggestedDriverName: typeof payload.suggestedDriverName === "string" ? payload.suggestedDriverName : null,
      };
      if (!next.amount && !next.date && !next.time && !next.driverName) {
        throw new Error("Não encontrei uma única transação com valor, data, hora ou motorista claros neste arquivo.");
      }
      setReading(next);
      onRead(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível ler o arquivo.");
    } finally {
      setBusy(false);
      if (fileInput.current) fileInput.current.value = "";
      if (cameraInput.current) cameraInput.current.value = "";
    }
  }

  return (
    <div className="rounded-xl border border-border bg-surface-2 p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <FileText className="size-4 text-accent" />
            <p className="text-sm font-semibold">Leitor de comprovante</p>
          </div>
          <p className="mt-1 text-xs text-muted">
            {kind === "advance"
              ? "Foto ou PDF. A Salomão IA preenche Valor, Data e Hora e vincula o motorista cadastrado quando o nome do recebedor estiver claro."
              : "Foto ou PDF. A Salomão IA preenche somente Valor, Data e Hora; você confere antes de salvar."}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" size="sm" variant="secondary" disabled={busy} onClick={() => cameraInput.current?.click()}>
            {busy ? <LoaderCircle className="size-4 animate-spin" /> : <Camera className="size-4" />} Foto
          </Button>
          <Button type="button" size="sm" variant="secondary" disabled={busy} onClick={() => fileInput.current?.click()}>
            {busy ? <LoaderCircle className="size-4 animate-spin" /> : <Upload className="size-4" />} Foto ou PDF
          </Button>
        </div>
      </div>

      <input
        ref={fileInput}
        type="file"
        className="hidden"
        accept="application/pdf,image/jpeg,image/png,image/webp"
        onChange={(event) => void handleFile(event.target.files?.[0])}
      />
      <input
        ref={cameraInput}
        type="file"
        className="hidden"
        accept="image/*"
        capture="environment"
        onChange={(event) => void handleFile(event.target.files?.[0])}
      />

      {fileName ? <p className="mt-3 truncate text-xs text-muted">{busy ? "Lendo: " : "Arquivo: "}{fileName}</p> : null}
      {error ? <p className="mt-3 rounded-lg border border-danger/30 bg-danger/5 px-3 py-2 text-xs text-danger">{error}</p> : null}
      {reading ? (
        <div className={"mt-3 grid gap-2 " + (kind === "advance" ? "sm:grid-cols-4" : "sm:grid-cols-3")}>
          <ReadValue label="Valor" value={reading.amount ? "R$ " + reading.amount.replace(".", ",") : "Não identificado"} />
          <ReadValue label="Data" value={reading.date || "Não identificada"} />
          <ReadValue label="Hora" value={reading.time || "Não identificada"} />
          {kind === "advance" ? (
            <ReadValue
              label="Motorista"
              value={reading.suggestedDriverName || (reading.driverName ? reading.driverName + " · conferir cadastro" : "Não identificado")}
            />
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function ReadValue({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-surface px-3 py-2">
      <p className="text-[10px] uppercase tracking-[0.12em] text-muted">{label}</p>
      <p className="mt-1 text-sm font-semibold tabular">{value}</p>
    </div>
  );
}

async function prepareFile(file: File) {
  const isPdf = file.type === "application/pdf" || /\.pdf$/i.test(file.name);
  if (isPdf) {
    if (file.size > 2_650_000) throw new Error("O PDF deve ter até aproximadamente 2,5 MB.");
    return { fileName: file.name || "comprovante.pdf", mime: "application/pdf", base64: await fileToBase64(file) };
  }
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
    throw new Error("Selecione uma foto JPG, PNG, WebP ou um PDF.");
  }
  return await compressImage(file);
}

async function compressImage(file: File) {
  const dataUrl = await fileToDataUrl(file);
  const image = await loadImage(dataUrl);
  const maxSide = 1800;
  const scale = Math.min(1, maxSide / Math.max(image.naturalWidth || image.width, image.naturalHeight || image.height));
  const width = Math.max(1, Math.round((image.naturalWidth || image.width) * scale));
  const height = Math.max(1, Math.round((image.naturalHeight || image.height) * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Não foi possível preparar a foto.");
  context.drawImage(image, 0, 0, width, height);

  let quality = 0.88;
  let output = canvas.toDataURL("image/jpeg", quality);
  while (output.length > 3_400_000 && quality > 0.55) {
    quality -= 0.08;
    output = canvas.toDataURL("image/jpeg", quality);
  }
  if (output.length > 3_600_000) throw new Error("A foto continua grande demais. Recorte o comprovante e tente novamente.");
  return {
    fileName: file.name || "comprovante.jpg",
    mime: "image/jpeg",
    base64: output.split(",")[1] || "",
  };
}

function fileToDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("Não foi possível abrir o arquivo."));
    reader.readAsDataURL(file);
  });
}

async function fileToBase64(file: File) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, Math.min(i + chunk, bytes.length)));
  }
  return btoa(binary);
}

function loadImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Não foi possível abrir a foto."));
    image.src = src;
  });
}
