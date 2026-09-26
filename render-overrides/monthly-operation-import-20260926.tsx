import { useMemo, useRef, useState } from "react";
import { Archive, FileText, LoaderCircle, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Select } from "@/components/ui/select";
import { useFleet } from "@/lib/use-fleet";

type ImportResult = {
  fileName: string;
  ok: boolean;
  message?: string;
  summary?: string;
  counts?: { saved: number; review: number; duplicates: number };
  saved?: Array<{ kind?: string; message?: string }>;
  review?: Array<{ kind?: string; message?: string }>;
};

type ExpandedFile = {
  name: string;
  mime: string;
  text?: string;
  base64?: string;
  contextText?: string;
};

export function MonthlyOperationImport() {
  const { data } = useFleet();
  const [driverId, setDriverId] = useState("");
  const [fleetId, setFleetId] = useState("");
  const [busy, setBusy] = useState(false);
  const [results, setResults] = useState<ImportResult[]>([]);
  const [progress, setProgress] = useState("");
  const inputRef = useRef<HTMLInputElement | null>(null);

  const selectedDriver = useMemo(() => data?.drivers.find((item) => item.id === driverId), [data, driverId]);
  const selectedFleet = useMemo(() => data?.fleets.find((item) => item.id === fleetId), [data, fleetId]);

  async function handleFiles(files: FileList | null) {
    if (!files?.length || busy) return;
    setBusy(true);
    setResults([]);
    setProgress("Preparando arquivos…");

    try {
      const expanded: ExpandedFile[] = [];
      for (const file of Array.from(files).slice(0, 20)) {
        if (/\.zip$/i.test(file.name) || file.type === "application/zip") {
          expanded.push(...await expandZip(file));
        } else {
          expanded.push(await toExpanded(file));
        }
      }

      const capped = expanded.slice(0, 80);
      const next: ImportResult[] = [];
      for (let index = 0; index < capped.length; index += 1) {
        const item = capped[index];
        setProgress("Analisando " + (index + 1) + " de " + capped.length + ": " + item.name);
        try {
          const response = await fetch("/api/operation-import", {
            method: "POST",
            credentials: "same-origin",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              fileName: item.name,
              mime: item.mime,
              text: item.text || "",
              base64: item.base64 || "",
              contextText: item.contextText || "",
              driverId: driverId || null,
              fleetId: fleetId || null,
            }),
          });
          const payload = await response.json().catch(() => ({}));
          next.push({
            fileName: item.name,
            ok: response.ok && payload?.ok !== false,
            message: payload?.message,
            summary: payload?.summary,
            counts: payload?.counts,
            saved: payload?.saved,
            review: payload?.review,
          });
        } catch (error) {
          next.push({ fileName: item.name, ok: false, message: error instanceof Error ? error.message : "Falha no envio." });
        }
        setResults([...next]);
      }
      setProgress(capped.length ? "Importação concluída." : "Nenhum arquivo compatível encontrado.");
    } catch (error) {
      setProgress(error instanceof Error ? error.message : "Não foi possível abrir os arquivos.");
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
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
    <section className="rounded-2xl border border-border bg-surface p-4 sm:p-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Archive className="size-5 text-accent" />
            <h2 className="font-display text-2xl font-semibold">Importação mensal com Salomão IA</h2>
          </div>
          <p className="mt-2 max-w-3xl text-sm text-muted">
            Envie ZIP exportado do WhatsApp, TXT da conversa, PDFs, comprovantes PIX, fotos de tickets,
            abastecimentos e notas mecânicas. A IA cruza a conversa com os anexos, lança dados seguros e
            separa o que precisa de revisão.
          </p>
        </div>
        <Button type="button" onClick={() => inputRef.current?.click()} disabled={busy}>
          {busy ? <LoaderCircle className="size-4 animate-spin" /> : <Upload className="size-4" />}
          {busy ? "Analisando…" : "Selecionar arquivos"}
        </Button>
        <input
          ref={inputRef}
          type="file"
          multiple
          className="hidden"
          accept=".zip,.txt,.pdf,image/jpeg,image/png,image/webp"
          onChange={(event) => void handleFiles(event.target.files)}
        />
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        <Field label="Motorista desta conversa" hint="Opcional, mas recomendado ao importar um grupo/conversa de motorista">
          <Select value={driverId} onChange={(event) => setDriverId(event.target.value)}>
            <option value="">Detectar automaticamente</option>
            {(data?.drivers ?? []).map((driver) => <option key={driver.id} value={driver.id}>{driver.name}</option>)}
          </Select>
        </Field>
        <Field label="Conjunto principal" hint="Ajuda a relacionar abastecimentos, mecânica e odômetro">
          <Select value={fleetId} onChange={(event) => setFleetId(event.target.value)}>
            <option value="">Detectar automaticamente</option>
            {(data?.fleets ?? []).map((fleet) => (
              <option key={fleet.id} value={fleet.id}>
                {fleet.name} · {fleet.tractorPlate || "sem cavalo"} / {fleet.trailerPlate || "sem carreta"}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      {(selectedDriver || selectedFleet) ? (
        <p className="mt-3 text-xs text-muted">
          Contexto aplicado:
          {selectedDriver ? " motorista " + selectedDriver.name : ""}
          {selectedFleet ? " · conjunto " + selectedFleet.name : ""}
        </p>
      ) : null}

      {progress ? <p className="mt-4 text-sm text-muted">{progress}</p> : null}

      {results.length ? (
        <div className="mt-4 grid gap-3">
          <div className="grid grid-cols-3 gap-2 text-center">
            <Summary label="Lançados" value={totals.saved} />
            <Summary label="Revisar" value={totals.review} />
            <Summary label="Duplicados" value={totals.duplicates} />
          </div>
          <div className="max-h-[420px] space-y-2 overflow-y-auto pr-1">
            {results.map((item, index) => (
              <div key={item.fileName + index} className="rounded-xl border border-border bg-bg p-3">
                <div className="flex items-start gap-2">
                  <FileText className="mt-0.5 size-4 shrink-0 text-muted" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">{item.fileName}</p>
                    {item.summary ? <p className="mt-1 text-xs text-muted">{item.summary}</p> : null}
                    {item.message ? <p className="mt-1 text-xs text-danger">{item.message}</p> : null}
                    {item.counts ? (
                      <p className="mt-2 text-[11px] text-muted">
                        {item.counts.saved} lançados · {item.counts.review} revisar · {item.counts.duplicates} duplicados
                      </p>
                    ) : null}
                    {(item.saved ?? []).map((saved, pos) => saved.message ? (
                      <p key={"s"+pos} className="mt-1 text-xs text-fg">✓ {saved.message}</p>
                    ) : null)}
                    {(item.review ?? []).map((review, pos) => review.message ? (
                      <p key={"r"+pos} className="mt-1 text-xs text-muted">• Revisar: {review.message}</p>
                    ) : null)}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </section>
  );
}

function Summary({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-border bg-bg px-3 py-2">
      <strong className="block font-display text-xl">{value}</strong>
      <span className="text-[10px] uppercase tracking-[0.12em] text-muted">{label}</span>
    </div>
  );
}

async function expandZip(file: File): Promise<ExpandedFile[]> {
  const JSZipModule: any = await import("jszip");
  const JSZip = JSZipModule.default ?? JSZipModule;
  const zip = await JSZip.loadAsync(await file.arrayBuffer());
  const entries = Object.values(zip.files).filter((entry: any) => !entry.dir);
  const chatEntry: any = entries.find((entry: any) => /(?:^|\/)(?:_chat|chat|conversa).*\.txt$/i.test(entry.name))
    ?? entries.find((entry: any) => /\.txt$/i.test(entry.name));
  const chatText = chatEntry ? String(await chatEntry.async("string")).slice(0, 180000) : "";

  const output: ExpandedFile[] = [];
  for (const entry of entries.slice(0, 100) as any[]) {
    const name = String(entry.name || "").split("/").pop() || "arquivo";
    if (!/\.(txt|pdf|jpe?g|png|webp)$/i.test(name)) continue;
    if (/\.txt$/i.test(name)) {
      const text = String(await entry.async("string")).slice(0, 180000);
      output.push({ name, mime: "text/plain", text });
      continue;
    }

    const bytes: Uint8Array = await entry.async("uint8array");
    if (bytes.byteLength > 12_000_000) continue;
    output.push({
      name,
      mime: mimeFor(name),
      base64: bytesToBase64(bytes),
      contextText: nearbyChatContext(chatText, name),
    });
  }
  return output;
}

async function toExpanded(file: File): Promise<ExpandedFile> {
  if (/\.txt$/i.test(file.name) || file.type === "text/plain") {
    return { name: file.name, mime: "text/plain", text: (await file.text()).slice(0, 180000) };
  }
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (bytes.byteLength > 12_000_000) throw new Error(file.name + " é maior que 12 MB.");
  return {
    name: file.name,
    mime: file.type || mimeFor(file.name),
    base64: bytesToBase64(bytes),
  };
}

function nearbyChatContext(chat: string, fileName: string) {
  if (!chat || !fileName) return "";
  const names = [fileName, fileName.replace(/\s+/g, " ")];
  let index = -1;
  for (const name of names) {
    index = chat.toLocaleLowerCase("pt-BR").indexOf(name.toLocaleLowerCase("pt-BR"));
    if (index >= 0) break;
  }
  if (index < 0) return "";
  return chat.slice(Math.max(0, index - 1800), Math.min(chat.length, index + fileName.length + 2200));
}

function bytesToBase64(bytes: Uint8Array) {
  let binary = "";
  const chunk = 0x8000;
  for (let index = 0; index < bytes.length; index += chunk) {
    binary += String.fromCharCode(...bytes.subarray(index, Math.min(bytes.length, index + chunk)));
  }
  return btoa(binary);
}

function mimeFor(name: string) {
  if (/\.pdf$/i.test(name)) return "application/pdf";
  if (/\.png$/i.test(name)) return "image/png";
  if (/\.webp$/i.test(name)) return "image/webp";
  if (/\.txt$/i.test(name)) return "text/plain";
  return "image/jpeg";
}
