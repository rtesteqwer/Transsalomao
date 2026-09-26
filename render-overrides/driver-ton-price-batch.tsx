import { useEffect, useRef, useState } from "react";
import { Camera, LoaderCircle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { parseLocaleNumber } from "@/lib/parse";
import { brl } from "@/lib/format";
import type { TicketData } from "@/lib/ticket-core";

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
  price: string;
  selected: boolean;
  status: "queued" | "uploading" | "reading" | "ready" | "sending" | "sent" | "linked" | "error";
  error: string;
  saved: SavedTicket | null;
};
type Props = {
  available: boolean;
  upload: (file: File) => Promise<{ id: string; imageData: string }>;
  read: (image: string, fileName: string) => Promise<TicketData>;
  save: (data: TicketData, price: number) => Promise<SavedTicket>;
  link: (photoId: string, fileName: string, saved: SavedTicket, data: TicketData) => Promise<void>;
  onBusy: (busy: boolean) => void;
  onPending: (pending: boolean) => void;
  onSaved: () => Promise<unknown>;
};

const finished = (photo: Photo) => photo.status === "sent" || photo.status === "linked";
const tonPriceFormat = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 20 });
const validPrice = (raw: string) => {
  const price = parseLocaleNumber(raw);
  return price != null && price > 0 && price <= 100_000_000 ? price : null;
};
const labels: Record<Photo["status"], string> = {
  queued: "Na fila", uploading: "Salvando foto…", reading: "Lendo com ChatGPT…",
  ready: "Pronta para conferir", sending: "Enviando ao Caixa…", sent: "Enviada ao Caixa",
  linked: "Vinculada à viagem existente", error: "Confira esta foto",
};

export function DriverTonPriceBatch({ available, upload, read, save, link, onBusy, onPending, onSaved }: Props) {
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [groupPrice, setGroupPrice] = useState("");
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const mounted = useRef(true);
  // Base64 is kept only for photos that still need reading, never for the whole batch.
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
          const learnedPrice = Number(data.route_price_per_ton);
          const learnedPriceText = Number.isFinite(learnedPrice) && learnedPrice > 0
            ? String(learnedPrice).replace(".", ",")
            : item.price;
          update(item.id, { data, photoId, price: learnedPriceText, status: "ready", error: "" });
          readCount += 1;
        } catch (error) {
          update(item.id, { photoId, status: "error", error: (error instanceof Error ? error.message : "Não foi possível ler esta foto.") + (photoId ? " A foto está salva; tente ler novamente." : " Tente enviar novamente.") });
        }
      }
      if (readCount) toast.success(readCount + " foto(s) lida(s). Confira os tickets, pesos e preços antes de enviar.");
    } finally { setWorking(false); }
  }
  function addFiles(files: File[]) {
    if (busyRef.current || !available || !files.length) return;
    const items: Photo[] = files.map(file => ({
      id: crypto.randomUUID(), file, photoId: "", data: null, price: "", selected: true,
      status: "queued", error: "", saved: null,
    }));
    setPhotos(current => [...current, ...items]);
    void readPhotos(items);
  }
  function applyPrice() {
    const price = validPrice(groupPrice);
    if (price == null) return toast.error("Informe um preço por tonelada maior que zero.");
    const targets = selected.filter(photo => !photo.saved);
    if (!targets.length) return toast.error("Selecione as viagens que receberão este preço.");
    const ids = new Set(targets.map(photo => photo.id));
    setPhotos(current => current.map(photo => ids.has(photo.id) ? { ...photo, price: groupPrice.trim() } : photo));
    toast.success(tonPriceFormat.format(price) + "/t aplicado a " + targets.length + " viagem(ns).");
  }
  async function sendSelected() {
    if (busyRef.current || !available || !selected.length) return;
    for (const photo of selected) {
      if (!photo.data || !photo.photoId) return toast.error("Conclua a leitura das fotos selecionadas antes de enviar.");
      if (photo.saved) continue; // Retry only the photo link after a partial failure.
      if (!photo.data.numero_ticket?.trim()) return toast.error("Confira o número do ticket em " + photo.file.name + ".");
      if (!Number.isSafeInteger(photo.data.peso_liquido_kg) || !(photo.data.peso_liquido_kg! > 0)) return toast.error("Confira o peso líquido em kg de " + photo.file.name + ".");
      if (validPrice(photo.price) == null) return toast.error("Aplique um preço por tonelada a todas as viagens selecionadas.");
    }
    setWorking(true);
    let sent = 0;
    let linked = 0;
    let failed = 0;
    try {
      for (const photo of selected) {
        if (!mounted.current) break;
        let saved = photo.saved;
        try {
          update(photo.id, { status: "sending", error: "" });
          saved ??= await save(photo.data!, validPrice(photo.price)!);
          update(photo.id, { saved });
          await link(photo.photoId, photo.file.name, saved, photo.data!);
          update(photo.id, { saved, selected: false, status: saved.linkedExisting ? "linked" : "sent", error: "" });
          if (saved.linkedExisting) linked += 1; else sent += 1;
        } catch (error) {
          failed += 1;
          update(photo.id, { saved, status: "error", error: (error instanceof Error ? error.message : "Não foi possível enviar.") + (saved ? " A viagem está salva. Tente novamente para concluir o vínculo da foto." : " A foto está salva; você pode tentar novamente.") });
        }
      }
      if (sent || linked) {
        toast.success(sent + " viagem(ns) enviada(s) ao Caixa" + (linked ? " e " + linked + " foto(s) vinculada(s) a viagens existentes." : "."));
        try { await onSaved(); } catch { toast.warning("As viagens foram salvas. Atualize a página para recarregar o histórico."); }
      }
      if (failed) toast.warning(failed + " foto(s) precisam de atenção. As demais foram concluídas.");
    } finally { setWorking(false); }
  }
  function remove(id: string) {
    unreadImages.current.delete(id);
    setPhotos(current => current.filter(photo => photo.id !== id));
  }

  return <div className="grid gap-4" aria-label="Viagens por fotos em lote">
    <p className="text-sm text-muted">Selecione 5 fotos ou quantas precisar. Cada ticket será uma viagem; o peso será lido da própria foto.</p>
    <div className="grid grid-cols-2 gap-3">
      {[{ label: "Tirar foto para o lote", camera: true }, { label: "Selecionar várias fotos", camera: false }].map(option => (
        <label key={option.label} className="relative flex min-h-28 cursor-pointer flex-col items-center justify-center overflow-hidden rounded-xl border border-dashed border-border bg-bg px-3 py-4 text-center">
          {busy ? <LoaderCircle className="size-6 animate-spin text-accent" /> : <Camera className="size-6 text-accent" />}
          <strong className="mt-2 text-sm">{option.label}</strong>
          <input type="file" aria-label={option.label} className="absolute inset-0 h-full w-full opacity-0" accept="image/*" capture={option.camera ? "environment" : undefined} multiple={!option.camera} disabled={busy || !available}
            onChange={event => { const files = Array.from(event.currentTarget.files ?? []); event.currentTarget.value = ""; addFiles(files); }} />
        </label>
      ))}
    </div>
    {photos.length ? <>
      <p role="status" className="text-sm font-semibold">{photos.length} foto(s) no lote · {selected.length} selecionada(s) · {photos.length - pending.length} concluída(s)</p>
      <div className="grid gap-3 rounded-xl border border-accent/30 bg-accent/5 p-3">
        <Field label="Preço por tonelada do grupo (R$/t)" hint="Marque as viagens e aplique o mesmo preço a todas elas.">
          <Input aria-label="Preço por tonelada do grupo" inputMode="decimal" placeholder="Ex.: 14,00" value={groupPrice} onChange={event => setGroupPrice(event.target.value)} disabled={busy} />
        </Field>
        <Button type="button" onClick={applyPrice} disabled={busy || !selected.some(photo => !photo.saved)}>Aplicar preço às {selected.filter(photo => !photo.saved).length} selecionadas</Button>
        <label className="flex min-h-10 items-center gap-3 text-sm">
          <input type="checkbox" className="size-5" checked={pending.length > 0 && selected.length === pending.length} disabled={busy || !pending.length} onChange={event => {
            const checked = event.target.checked;
            setPhotos(current => current.map(photo => finished(photo) ? photo : { ...photo, selected: checked }));
          }} /> Selecionar todas as pendentes
        </label>
      </div>
      <div className="grid gap-3">
        {photos.map((photo, index) => <article key={photo.id} className="min-w-0 rounded-xl border border-border bg-bg p-3" aria-label={"Foto " + (index + 1)}>
          <label className="flex min-h-10 items-center gap-3 text-sm font-semibold">
            <input type="checkbox" aria-label={"Selecionar foto " + (index + 1)} className="size-5 shrink-0" checked={photo.selected} disabled={busy || finished(photo)} onChange={event => update(photo.id, { selected: event.target.checked })} />
            <span className="min-w-0 break-all">{index + 1}. {photo.file.name}</span>
          </label>
          <p className="my-2 text-xs font-semibold text-muted">{labels[photo.status]}</p>
          {photo.data ? <div className="grid gap-3">
            <div className="grid grid-cols-2 gap-2">
              <Field label="Ticket"><Input aria-label={"Ticket da foto " + (index + 1)} value={photo.data.numero_ticket ?? ""} disabled={busy || !!photo.saved} onChange={event => update(photo.id, { data: { ...photo.data!, numero_ticket: event.target.value } })} /></Field>
              <Field label="Peso líquido (kg)"><Input aria-label={"Peso líquido da foto " + (index + 1)} inputMode="numeric" value={photo.data.peso_liquido_kg ?? ""} disabled={busy || !!photo.saved} onChange={event => update(photo.id, { data: { ...photo.data!, peso_liquido_kg: event.target.value ? Number(event.target.value.replace(/\D/g, "")) : null } })} /></Field>
            </div>
            <Field label="Preço desta viagem (R$/t)"><Input aria-label={"Preço da foto " + (index + 1)} inputMode="decimal" placeholder="Aplique o preço do grupo" value={photo.price} disabled={busy || !!photo.saved} onChange={event => update(photo.id, { price: event.target.value })} /></Field>
            {photo.data.peso_liquido_kg && validPrice(photo.price) != null ? <p className="text-sm font-semibold">{new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 3 }).format(photo.data.peso_liquido_kg / 1000)} t × {tonPriceFormat.format(validPrice(photo.price)!)} = {brl(photo.data.peso_liquido_kg / 1000 * validPrice(photo.price)!)}</p> : null}
            {photo.data.route_group ? <div className="rounded-lg border border-accent/30 bg-accent/5 p-2 text-xs">
              <p className="font-semibold text-fg">Rota identificada: {photo.data.route_group}</p>
              <p className="text-muted">{photo.data.route_origin || "—"} → {photo.data.route_destination || "—"}{photo.data.route_price_per_ton ? " · " + tonPriceFormat.format(photo.data.route_price_per_ton) + "/t" : ""}</p>
            </div> : null}
            {photo.data.placa_veiculo ? <p className="text-xs text-muted">Cavalo: {photo.data.placa_veiculo} · Carreta: {photo.data.placa_carreta || "—"}</p> : null}
            {photo.data.alertas?.length && !finished(photo) ? <ul className="list-disc space-y-1 pl-4 text-xs text-warn">{photo.data.alertas.map((alert, i) => <li key={i}>{alert}</li>)}</ul> : null}
          </div> : null}
          {photo.status === "linked" ? <p className="mt-2 text-xs text-muted">Ticket e peso já existentes. A foto foi vinculada; o preço original foi mantido.</p> : null}
          {photo.error ? <p role="alert" className="mt-2 text-xs text-danger">{photo.error}</p> : null}
          <div className="mt-2 flex flex-wrap gap-2">
            {!photo.data && photo.status === "error" ? <Button type="button" size="sm" disabled={busy || !available} onClick={() => void readPhotos([photo])}>Tentar leitura novamente</Button> : null}
            <Button type="button" size="sm" variant="ghost" disabled={busy} onClick={() => remove(photo.id)}>Remover da lista</Button>
          </div>
        </article>)}
      </div>
      <p className="text-xs text-muted">Confira tickets, pesos e preços. As viagens ficarão pendentes para a gerência fechar no Caixa. Remover da lista mantém as fotos já enviadas salvas.</p>
      <Button type="button" size="lg" className="min-h-14" disabled={busy || !available || !selected.length} onClick={() => void sendSelected()}>{busy ? "Processando fotos…" : "Enviar " + selected.length + " viagem(ns) selecionada(s) ao Caixa"}</Button>
      <Button type="button" variant="ghost" disabled={busy} onClick={() => { unreadImages.current.clear(); setPhotos([]); }}>Limpar lista</Button>
    </> : null}
  </div>;
}
