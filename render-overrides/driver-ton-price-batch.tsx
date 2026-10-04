import { useEffect, useRef, useState } from "react";
import { Camera, LoaderCircle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { parseLocaleNumber } from "@/lib/parse";
import { brl } from "@/lib/format";
import type { TicketData, TicketFreightMode } from "@/lib/ticket-core";

type SavedTicket = {
  reportId: string;
  ticket: string;
  linkedExisting?: boolean;
};
type Photo = {
  id: string;
  file: File;
  photoId: string;
  data: TicketData | null;
  mode: TicketFreightMode;
  price: string;
  quantity: string;
  createdCount: number;
  selected: boolean;
  status: "queued" | "uploading" | "reading" | "ready" | "sending" | "sent" | "linked" | "error";
  error: string;
  saved: SavedTicket | null;
};
type Props = {
  available: boolean;
  upload: (file: File) => Promise<{ id: string; imageData: string }>;
  read: (image: string, fileName: string) => Promise<TicketData>;
  save: (data: TicketData, mode: TicketFreightMode, price?: number) => Promise<SavedTicket>;
  link: (photoId: string, fileName: string, saved: SavedTicket, data: TicketData) => Promise<void>;
  onBusy: (busy: boolean) => void;
  onPending: (pending: boolean) => void;
  onSaved: () => Promise<unknown>;
};

const finished = (photo: Photo) => photo.status === "sent" || photo.status === "linked";
const money = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 20 });
const tons = new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 3, maximumFractionDigits: 3 });
const validPrice = (raw: string) => {
  if (!raw.trim()) return null;
  const price = parseLocaleNumber(raw);
  return price != null && price > 0 && price <= 100_000_000 ? price : null;
};
const modeLabel: Record<TicketFreightMode, string> = {
  ton: "Por tonelada",
  trip: "Por viagem",
  cegonha: "Cegonha",
  caixinha: "Caixinha",
};
const labels: Record<Photo["status"], string> = {
  queued: "Na fila",
  uploading: "Salvando foto…",
  reading: "Cruzando dados do ticket…",
  ready: "Pronta para conferir",
  sending: "Enviando ao Caixa…",
  sent: "Enviada ao Caixa",
  linked: "Vinculada à viagem existente",
  error: "Confira esta foto",
};

function inferredMode(data: TicketData): TicketFreightMode {
  if (data.inferred_freight_mode && ["ton", "trip", "cegonha", "caixinha"].includes(data.inferred_freight_mode)) {
    return data.inferred_freight_mode;
  }
  return data.peso_liquido_kg && data.peso_liquido_kg > 0 ? "ton" : "trip";
}

function inferredPrice(data: TicketData) {
  const value = Number(data.inferred_price ?? data.route_price_per_ton);
  return Number.isFinite(value) && value > 0 ? String(value).replace(".", ",") : "";
}

export function DriverTonPriceBatch({ available, upload, read, save, link, onBusy, onPending, onSaved }: Props) {
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [groupPrice, setGroupPrice] = useState("");
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const mounted = useRef(true);
  const unreadImages = useRef(new Map<string, string>());
  const pending = photos.filter(photo => !finished(photo));
  const selected = pending.filter(photo => photo.selected);
  const hasPending = pending.length > 0;

  useEffect(() => { onPending(hasPending); }, [hasPending, onPending]);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; unreadImages.current.clear(); };
  }, []);
  useEffect(() => {
    if (!hasPending && !busy) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [hasPending, busy]);

  function update(id: string, changes: Partial<Photo>) {
    if (mounted.current) setPhotos(current => current.map(photo => photo.id === id ? { ...photo, ...changes } : photo));
  }
  function setWorking(value: boolean) {
    busyRef.current = value;
    if (mounted.current) { setBusy(value); onBusy(value); }
  }

  async function readPhotos(items: Photo[]) {
    if (busyRef.current || !available || !items.length) return;
    setWorking(true);
    let readCount = 0;
    try {
      for (const item of items) {
        if (!mounted.current) break;
        let photoId = item.photoId;
        try {
          let image = unreadImages.current.get(item.id);
          if (!image) {
            update(item.id, { status: "uploading", error: "" });
            const uploaded = await upload(item.file);
            photoId = uploaded.id;
            image = uploaded.imageData;
            unreadImages.current.set(item.id, image);
            update(item.id, { photoId });
          }
          update(item.id, { status: "reading", error: "" });
          let data: TicketData | null = null;
          for (let attempt = 0; attempt < 6; attempt += 1) {
            try { data = await read(image, item.file.name); break; }
            catch (error) {
              if (!(error instanceof Error) || !error.message.includes("Muitas leituras") || attempt === 5) throw error;
              update(item.id, { error: "Aguardando o limite de leitura liberar para continuar automaticamente…" });
              await new Promise(resolve => setTimeout(resolve, 61_000));
              if (!mounted.current) return;
            }
          }
          if (!data) throw new Error("A leitura não retornou dados. Tente novamente.");
          unreadImages.current.delete(item.id);
          update(item.id, {
            data,
            photoId,
            mode: inferredMode(data),
            price: inferredPrice(data),
            status: "ready",
            error: "",
          });
          readCount += 1;
        } catch (error) {
          update(item.id, {
            photoId,
            status: "error",
            error: (error instanceof Error ? error.message : "Não foi possível ler esta foto.")
              + (photoId ? " A foto está salva; tente ler novamente." : " Tente enviar novamente."),
          });
        }
      }
      if (readCount) toast.success(readCount + " viagem(ns) interpretada(s). Confira modalidade, peso e preço antes de aceitar.");
    } finally { setWorking(false); }
  }

  function addFiles(files: File[]) {
    if (busyRef.current || !available || !files.length) return;
    const items: Photo[] = files.slice(0, 100).map(file => ({
      id: crypto.randomUUID(),
      file,
      photoId: "",
      data: null,
      mode: "ton",
      price: "",
      quantity: "",
      createdCount: 0,
      selected: true,
      status: "queued",
      error: "",
      saved: null,
    }));
    setPhotos(current => [...current, ...items].slice(0, 100));
    void readPhotos(items);
  }

  function applyPrice() {
    const price = validPrice(groupPrice);
    if (price == null) return toast.error("Informe um preço maior que zero.");
    const targets = selected.filter(photo => !photo.saved);
    if (!targets.length) return toast.error("Selecione as viagens que receberão este preço.");
    const modes = new Set(targets.map(photo => photo.mode));
    if (modes.size > 1) return toast.error("Para aplicar preço em grupo, selecione viagens da mesma modalidade.");
    const ids = new Set(targets.map(photo => photo.id));
    setPhotos(current => current.map(photo => ids.has(photo.id) ? { ...photo, price: groupPrice.trim() } : photo));
    const mode = targets[0].mode;
    toast.success(money.format(price) + (mode === "ton" ? "/t" : "/viagem") + " aplicado a " + targets.length + " viagem(ns).");
  }

  async function sendSelected() {
    if (busyRef.current || !available || !selected.length) return;
    for (const photo of selected) {
      if (!photo.data || !photo.photoId) return toast.error("Conclua a leitura das fotos selecionadas antes de aceitar.");
      if (photo.saved) continue;
      if (photo.mode === "ton" && (!Number.isSafeInteger(photo.data.peso_liquido_kg) || !(photo.data.peso_liquido_kg! > 0))) {
        return toast.error("Por tonelada exige somente o peso líquido. Confira " + photo.file.name + ".");
      }
      if (photo.mode === "cegonha" || photo.mode === "caixinha") {
        const quantity = Number.parseInt(photo.quantity, 10);
        if (!Number.isInteger(quantity) || quantity < 1 || quantity > 100) {
          return toast.error("Informe obrigatoriamente quantas viagens de " + modeLabel[photo.mode] + " deseja adicionar (1 a 100).");
        }
      }
    }

    setWorking(true);
    let sent = 0;
    let linked = 0;
    let failed = 0;
    try {
      for (const photo of selected) {
        if (!mounted.current) break;
        let saved = photo.saved;
        let createdCount = photo.createdCount || 0;
        try {
          update(photo.id, { status: "sending", error: "" });
          const requestedCount = photo.mode === "cegonha" || photo.mode === "caixinha"
            ? Number.parseInt(photo.quantity, 10)
            : 1;

          if (!saved) {
            saved = await save(photo.data!, photo.mode, validPrice(photo.price) ?? undefined);
            createdCount = Math.max(createdCount, 1);
            update(photo.id, { saved, createdCount });
          }

          for (let copyIndex = createdCount; copyIndex < requestedCount; copyIndex += 1) {
            await save({ ...photo.data!, numero_ticket: null }, photo.mode, validPrice(photo.price) ?? undefined);
            createdCount = copyIndex + 1;
            update(photo.id, { createdCount });
          }

          await link(photo.photoId, photo.file.name, saved, photo.data!);
          update(photo.id, { saved, createdCount, selected: false, status: saved.linkedExisting ? "linked" : "sent", error: "" });
          if (saved.linkedExisting) linked += 1;
          sent += requestedCount;
        } catch (error) {
          failed += 1;
          update(photo.id, {
            saved,
            status: "error",
            error: (error instanceof Error ? error.message : "Não foi possível enviar.")
              + (saved ? " A viagem está salva. Tente novamente para concluir o vínculo da foto." : " A foto está salva; você pode tentar novamente."),
          });
        }
      }
      if (sent || linked) {
        toast.success(sent + " viagem(ns) adicionada(s) ao Caixa" + (linked ? " · " + linked + " foto(s) vinculada(s)." : "."));
        try { await onSaved(); } catch { toast.warning("As viagens foram salvas. Atualize a página para recarregar o histórico."); }
      }
      if (failed) toast.warning(failed + " foto(s) precisam de atenção. As demais foram concluídas.");
    } finally { setWorking(false); }
  }

  function remove(id: string) {
    unreadImages.current.delete(id);
    setPhotos(current => current.filter(photo => photo.id !== id));
  }

  const selectedModes = new Set(selected.map(photo => photo.mode));
  const groupUnit = selectedModes.size === 1 && selected[0]?.mode === "ton" ? "R$/t" : "R$/viagem";

  return <div className="grid gap-4" aria-label="Leitura inteligente de viagens por fotos">
    <div className="grid grid-cols-2 gap-3">
      {[{ label: "Tirar foto", camera: true }, { label: "Selecionar várias fotos", camera: false }].map(option => (
        <label key={option.label} className="relative flex min-h-28 cursor-pointer flex-col items-center justify-center overflow-hidden rounded-xl border border-dashed border-border bg-bg px-3 py-4 text-center">
          {busy ? <LoaderCircle className="size-6 animate-spin text-accent" /> : <Camera className="size-6 text-accent" />}
          <strong className="mt-2 text-sm">{option.label}</strong>
          <input
            type="file"
            aria-label={option.label}
            className="absolute inset-0 h-full w-full opacity-0"
            accept="image/*"
            capture={option.camera ? "environment" : undefined}
            multiple={!option.camera}
            disabled={busy || !available}
            onChange={event => {
              const files = Array.from(event.currentTarget.files ?? []);
              event.currentTarget.value = "";
              addFiles(files);
            }}
          />
        </label>
      ))}
    </div>

    {photos.length ? <>
      <p role="status" className="text-sm font-semibold">{photos.length} foto(s) · {selected.length} selecionada(s) · {photos.length - pending.length} concluída(s)</p>

      <div className="grid gap-3 rounded-xl border border-border bg-surface p-3">
        <label className="flex min-h-10 items-center gap-3 text-sm">
          <input
            type="checkbox"
            className="size-5"
            checked={pending.length > 0 && selected.length === pending.length}
            disabled={busy || !pending.length}
            onChange={event => {
              const checked = event.target.checked;
              setPhotos(current => current.map(photo => finished(photo) ? photo : { ...photo, selected: checked }));
            }}
          />
          Selecionar todas as pendentes
        </label>
        <Field label={"Preço do grupo (" + groupUnit + ")"} hint="Opcional. Só aplica quando as selecionadas têm a mesma modalidade.">
          <Input inputMode="decimal" placeholder="Ex.: 35,00" value={groupPrice} onChange={event => setGroupPrice(event.target.value)} disabled={busy} />
        </Field>
        <Button type="button" variant="ghost" onClick={applyPrice} disabled={busy || !selected.length}>Aplicar preço ao grupo selecionado</Button>
      </div>

      <div className="grid gap-3">
        {photos.map((photo, index) => <article key={photo.id} className="min-w-0 rounded-xl border border-border bg-bg p-3">
          <label className="flex min-h-10 items-center gap-3 text-sm font-semibold">
            <input
              type="checkbox"
              className="size-5 shrink-0"
              checked={photo.selected}
              disabled={busy || finished(photo)}
              onChange={event => update(photo.id, { selected: event.target.checked })}
            />
            <span className="min-w-0 break-all">{index + 1}. {photo.file.name}</span>
          </label>

          <p className="my-2 text-xs font-semibold text-muted">{labels[photo.status]}</p>

          {photo.data ? <div className="grid gap-3">
            <div className="grid gap-2 sm:grid-cols-2">
              <Field label="Modalidade identificada">
                <select
                  className="h-11 w-full rounded-lg border border-border bg-bg px-3 text-sm"
                  value={photo.mode}
                  disabled={busy || !!photo.saved}
                  onChange={event => update(photo.id, { mode: event.target.value as TicketFreightMode })}
                >
                  {(["ton","trip","cegonha","caixinha"] as TicketFreightMode[]).map(mode => <option key={mode} value={mode}>{modeLabel[mode]}</option>)}
                </select>
              </Field>
              <Field label={photo.mode === "ton" ? "Preço (R$/t)" : "Preço (R$/viagem)"} hint="Opcional se ainda não foi possível descobrir">
                <Input inputMode="decimal" value={photo.price} disabled={busy || !!photo.saved} onChange={event => update(photo.id, { price: event.target.value })} />
              </Field>
            </div>

            {photo.mode === "ton" ? <Field label="Peso líquido (kg)" hint="Único dado obrigatório para lançar por tonelada">
              <Input
                inputMode="numeric"
                value={photo.data.peso_liquido_kg ?? ""}
                disabled={busy || !!photo.saved}
                onChange={event => update(photo.id, {
                  data: { ...photo.data!, peso_liquido_kg: event.target.value ? Number(event.target.value.replace(/\D/g, "")) : null },
                })}
              />
            </Field> : null}

            <div className="rounded-lg border border-border p-2 text-xs text-muted">
              <p><b className="text-fg">Ticket:</b> {photo.data.numero_ticket || "não identificado"}</p>
              <p><b className="text-fg">Data/hora:</b> {[photo.data.data_ticket, photo.data.hora_ticket].filter(Boolean).join(" · ") || "não identificada"}</p>
              <p><b className="text-fg">Produto:</b> {photo.data.produto || "—"}</p>
              <p><b className="text-fg">Transportadora:</b> {photo.data.transportadora || "—"}</p>
              {photo.data.inferred_price_basis ? <p><b className="text-fg">Preço descoberto por:</b> {photo.data.inferred_price_basis}</p> : null}
            </div>

            {photo.mode === "ton" && photo.data.peso_liquido_kg && validPrice(photo.price) != null ? (
              <p className="text-sm font-semibold">{tons.format(photo.data.peso_liquido_kg / 1000)} t × {money.format(validPrice(photo.price)!)} = {brl(photo.data.peso_liquido_kg / 1000 * validPrice(photo.price)!)}</p>
            ) : null}

            {(photo.mode === "cegonha" || photo.mode === "caixinha") ? (
              <div className="grid gap-2">
                <Field label="Quantidade de viagens *" hint="Obrigatório para Cegonha e Caixinha">
                  <Input
                    inputMode="numeric"
                    placeholder="Ex.: 16"
                    value={photo.quantity}
                    disabled={busy || !!photo.saved}
                    onChange={event => update(photo.id, { quantity: event.target.value.replace(/\D/g, "").slice(0, 3) })}
                  />
                </Field>
                <p className="text-xs text-muted">{modeLabel[photo.mode]} usa <b>preço por viagem</b>. Uma única foto pode servir como evidência para várias viagens; o sistema criará exatamente a quantidade informada.</p>
              </div>
            ) : null}

            {photo.data.route_group ? <div className="rounded-lg border border-accent/30 bg-accent/5 p-2 text-xs">
              <p className="font-semibold text-fg">Rota identificada: {photo.data.route_group}</p>
              <p className="text-muted">{photo.data.route_origin || "—"} → {photo.data.route_destination || "—"}</p>
            </div> : null}

            {photo.data.alertas?.length && !finished(photo) ? (
              <ul className="list-disc space-y-1 pl-4 text-xs text-warn">{photo.data.alertas.map((alert, i) => <li key={i}>{alert}</li>)}</ul>
            ) : null}
          </div> : null}

          {photo.error ? <p role="alert" className="mt-2 text-xs text-danger">{photo.error}</p> : null}

          <div className="mt-2 flex flex-wrap gap-2">
            {!photo.data && photo.status === "error" ? <Button type="button" size="sm" disabled={busy || !available} onClick={() => void readPhotos([photo])}>Tentar leitura novamente</Button> : null}
            <Button type="button" size="sm" variant="ghost" disabled={busy} onClick={() => remove(photo.id)}>Remover</Button>
          </div>
        </article>)}
      </div>

      <Button
        type="button"
        size="lg"
        className="min-h-14"
        disabled={busy || !available || !selected.length}
        onClick={() => void sendSelected()}
      >
        {busy ? "Processando…" : "Aceitar grupo selecionado (" + selected.length + ")"}
      </Button>
      <Button type="button" variant="ghost" disabled={busy} onClick={() => { unreadImages.current.clear(); setPhotos([]); }}>Limpar lista</Button>
    </> : null}
  </div>;
}
