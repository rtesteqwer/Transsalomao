import { createFileRoute } from "@tanstack/react-router";
import { Camera, CheckCircle2, ImagePlus, LoaderCircle } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Select } from "@/components/ui/select";
import { useFleet } from "@/lib/use-fleet";

export const Route = createFileRoute("/dono/fotos")({ component: FotosIaPage });

type PhotoResult = {
  ok: boolean;
  alreadyExists?: boolean;
  reportId?: string;
  ticket?: string;
  sourceTicket?: string | null;
  date?: string | null;
  netWeight?: number | null;
  grossWeight?: number | null;
  tare?: number | null;
  client?: string | null;
  origin?: string | null;
  destination?: string | null;
  confidence?: number;
  message?: string;
};

function exactTons(value: number | null | undefined) {
  if (value == null || !Number.isFinite(Number(value))) return "—";
  return new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 3 }).format(Number(value)) + " t";
}

async function imageToDataUrl(file: File) {
  if (!file.type.startsWith("image/")) throw new Error("Selecione uma foto válida.");
  if (file.size > 12_000_000) throw new Error("A foto deve ter no máximo 12 MB.");
  try {
    const bitmap = await createImageBitmap(file);
    const maxSide = 1800;
    const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Não foi possível preparar a imagem.");
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    const out = canvas.toDataURL("image/jpeg", 0.84);
    if (out.length > 5_500_000) throw new Error("A foto ficou grande demais após a preparação. Tire a foto mais perto do ticket.");
    return out;
  } catch (error) {
    if (error instanceof Error && error.message.includes("grande demais")) throw error;
    return await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error("Não foi possível ler a foto."));
      reader.onload = () => {
        const value = String(reader.result || "");
        if (value.length > 5_500_000) reject(new Error("A foto é grande demais. Use uma foto em JPG ou reduza o tamanho."));
        else resolve(value);
      };
      reader.readAsDataURL(file);
    });
  }
}

function FotosIaPage() {
  const { data } = useFleet();
  const drivers = useMemo(() => (data?.drivers ?? []).filter((d) => d.status === "ativo"), [data]);
  const fleets = useMemo(() => (data?.fleets ?? []).filter((f) => f.status === "ativo"), [data]);
  const [driverId, setDriverId] = useState("");
  const [fleetId, setFleetId] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [results, setResults] = useState<Array<{ name: string; result: PhotoResult }>>([]);

  async function processPhotos() {
    if (!driverId) return toast.error("Escolha o motorista.");
    if (!fleetId) return toast.error("Escolha o conjunto.");
    if (files.length === 0) return toast.error("Selecione pelo menos uma foto.");
    setBusy(true);
    const next: Array<{ name: string; result: PhotoResult }> = [];
    try {
      for (const file of files) {
        try {
          const image = await imageToDataUrl(file);
          const response = await fetch("/api/photo-intake", {
            method: "POST",
            credentials: "same-origin",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ image, driverId, fleetId, fileName: file.name }),
          });
          const result = await response.json().catch(() => ({ ok: false, message: "Resposta inválida do servidor." }));
          if (!response.ok) throw new Error(result?.message || "Não foi possível processar a foto.");
          next.push({ name: file.name, result });
        } catch (error) {
          next.push({ name: file.name, result: { ok: false, message: error instanceof Error ? error.message : "Falha ao processar." } });
        }
      }
      setResults(next);
      const saved = next.filter((x) => x.result.ok).length;
      if (saved) toast.success(saved === 1 ? "Foto lida e lançada na Caixa." : saved + " fotos lidas e lançadas na Caixa.");
      if (saved < next.length) toast.error((next.length - saved) + " foto(s) precisam de correção.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <div className="flex items-start gap-3">
        <span className="grid size-12 shrink-0 place-items-center rounded-xl bg-surface-2 text-accent"><Camera className="size-6" /></span>
        <div>
          <p className="text-[11px] uppercase tracking-[0.18em] text-muted">Leitura automática de tickets</p>
          <h1 className="mt-1 font-display text-4xl font-semibold tracking-tight">Fotos IA</h1>
          <p className="mt-2 max-w-2xl text-sm text-muted">Envie fotos de tickets de pesagem. O ChatGPT lê os dados da foto e grava o lançamento na Caixa para a Gerência conferir e escolher a modalidade.</p>
        </div>
      </div>

      <section className="mt-7 grid gap-5 rounded-xl border border-border bg-surface p-5 sm:p-6">
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Motorista">
            <Select value={driverId} onChange={(e) => setDriverId(e.target.value)}>
              <option value="">Escolha o motorista</option>
              {drivers.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </Select>
          </Field>
          <Field label="Conjunto">
            <Select value={fleetId} onChange={(e) => setFleetId(e.target.value)}>
              <option value="">Escolha o conjunto</option>
              {fleets.map((f) => <option key={f.id} value={f.id}>{f.name} · {f.tractorPlate} / {f.trailerPlate}</option>)}
            </Select>
          </Field>
        </div>

        <label className="flex min-h-44 cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed border-border bg-bg px-5 py-8 text-center hover:bg-surface-2">
          <ImagePlus className="size-8 text-accent" />
          <strong className="mt-3 text-sm">Adicionar fotos dos tickets</strong>
          <span className="mt-1 text-xs text-muted">Pode selecionar várias fotos de uma vez.</span>
          <input
            className="sr-only"
            type="file"
            accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
            capture="environment"
            multiple
            onChange={(e) => setFiles(Array.from(e.target.files ?? []))}
          />
        </label>

        {files.length > 0 ? (
          <div className="rounded-lg border border-border bg-bg p-3 text-sm">
            <strong>{files.length} foto(s) selecionada(s)</strong>
            <p className="mt-1 truncate text-xs text-muted">{files.map((f) => f.name).join(" • ")}</p>
          </div>
        ) : null}

        <Button type="button" size="lg" disabled={busy || files.length === 0} onClick={() => void processPhotos()}>
          {busy ? <LoaderCircle className="size-5 animate-spin" /> : <Camera className="size-5" />}
          {busy ? "Lendo fotos com IA…" : "Ler fotos e gravar na Caixa"}
        </Button>
      </section>

      {results.length > 0 ? (
        <section className="mt-6 grid gap-3">
          <h2 className="font-display text-2xl font-semibold">Resultado das fotos</h2>
          {results.map(({ name, result }, index) => (
            <article key={name + index} className="rounded-xl border border-border bg-surface p-4">
              <div className="flex items-start gap-3">
                <span className={result.ok ? "text-ok" : "text-danger"}>{result.ok ? <CheckCircle2 className="size-5" /> : <Camera className="size-5" />}</span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{name}</p>
                  {result.ok ? (
                    <div className="mt-2 grid gap-1 text-sm text-muted sm:grid-cols-2">
                      <span>Ticket: <strong className="text-fg">{result.ticket || "—"}</strong></span>
                      <span>Peso líquido: <strong className="text-fg">{exactTons(result.netWeight)}</strong></span>
                      <span>Peso bruto: <strong className="text-fg">{exactTons(result.grossWeight)}</strong></span>
                      <span>Data: <strong className="text-fg">{result.date || "—"}</strong></span>
                      <span>Cliente: <strong className="text-fg">{result.client || "—"}</strong></span>
                      <span>Rota: <strong className="text-fg">{[result.origin, result.destination].filter(Boolean).join(" → ") || "—"}</strong></span>
                    </div>
                  ) : <p className="mt-2 text-sm text-danger">{result.message || "Não foi possível ler esta foto."}</p>}
                </div>
              </div>
            </article>
          ))}
        </section>
      ) : null}
    </div>
  );
}
