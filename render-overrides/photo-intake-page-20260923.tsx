import { createFileRoute } from "@tanstack/react-router";
import { Camera, ExternalLink, ImagePlus, Link2, LoaderCircle, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { useFleet } from "@/lib/use-fleet";
import { getManagementSession } from "@/lib/management-auth";

export const Route = createFileRoute("/dono/fotos")({ component: FotosTicketsPage });

type RelationKind = "trip" | "report" | "reading";

type SourceItem = {
  key: string;
  relationType: RelationKind;
  relationId: string;
  code: string;
  driverId: string;
  driverName: string;
  fleetId: string;
  fleetName: string;
  date: string;
  freightMode: string | null;
  netWeight: number | null;
  status: string | null;
};

type SavedPhoto = {
  id: string;
  relationType: RelationKind;
  relationId: string;
  tripCode: string;
  driverName: string | null;
  fleetName: string | null;
  tripDate: string | null;
  freightMode: string | null;
  netWeight: number | null;
  fileName: string;
  reportStatus?: string | null;
  ticketData?: Record<string, any> | null;
  notes?: string | null;
  createdAt: string;
  createdBy: string | null;
  updatedAt?: string | null;
  updatedBy?: string | null;
};

function tons(value: number | null | undefined) {
  if (value == null || !Number.isFinite(Number(value)) || Number(value) <= 0) return "—";
  return new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 3, maximumFractionDigits: 3 }).format(Number(value)) + " t";
}

function shortDate(value: string | null | undefined) {
  if (!value) return "—";
  const iso = value.slice(0, 10);
  const parts = iso.split("-");
  return parts.length === 3 ? parts[2] + "/" + parts[1] + "/" + parts[0] : iso;
}

function modeLabel(value: string | null | undefined) {
  return value === "ton" ? "Por tonelada" : value === "trip" ? "Diária" : value === "cegonha" ? "Cegonha" : value === "caixinha" ? "Caixinha" : "A definir";
}

function PhotoPrivateEditor({ photo, onSaved }: { photo: SavedPhoto; onSaved: () => Promise<void> }) {
  const original = photo.ticketData ?? {};
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [tripCode, setTripCode] = useState(photo.tripCode || "");
  const [driverName, setDriverName] = useState(photo.driverName || "");
  const [fleetName, setFleetName] = useState(photo.fleetName || "");
  const [tripDate, setTripDate] = useState(String(photo.tripDate || "").slice(0, 10));
  const [netWeight, setNetWeight] = useState(photo.netWeight == null ? "" : String(photo.netWeight));
  const [placaVeiculo, setPlacaVeiculo] = useState(String(original.placa_veiculo ?? ""));
  const [placaCarreta, setPlacaCarreta] = useState(String(original.placa_carreta ?? ""));
  const [transportadora, setTransportadora] = useState(String(original.transportadora ?? ""));
  const [operadora, setOperadora] = useState(String(original.operadora ?? ""));
  const [contratante, setContratante] = useState(String(original.contratante ?? ""));
  const [destinatario, setDestinatario] = useState(String(original.destinatario ?? ""));
  const [navio, setNavio] = useState(String(original.navio ?? ""));
  const [emissor, setEmissor] = useState(String(original.emissor ?? ""));
  const [operadorPesagem, setOperadorPesagem] = useState(String(original.operador_pesagem ?? ""));
  const [itemCodigo, setItemCodigo] = useState(String(original.item_codigo ?? ""));
  const [notes, setNotes] = useState(photo.notes || "");

  async function save() {
    setSaving(true);
    try {
      const ticketData = {
        ...original,
        numero_ticket: tripCode || null,
        placa_veiculo: placaVeiculo.trim().toUpperCase().replace(/[^A-Z0-9]/g, "") || null,
        placa_carreta: placaCarreta.trim().toUpperCase().replace(/[^A-Z0-9]/g, "") || null,
        transportadora: transportadora.trim() || null,
        operadora: operadora.trim() || null,
        contratante: contratante.trim() || null,
        destinatario: destinatario.trim() || null,
        navio: navio.trim() || null,
        emissor: emissor.trim() || null,
        operador_pesagem: operadorPesagem.trim() || null,
        item_codigo: itemCodigo.trim() || null,
        peso_liquido_kg: netWeight ? Number(netWeight.replace(/[^0-9]/g, "")) : null,
      };
      const response = await fetch("/api/photo-intake", {
        method: "PATCH",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: photo.id,
          tripCode,
          driverName,
          fleetName,
          tripDate,
          freightMode: photo.freightMode,
          netWeight: ticketData.peso_liquido_kg,
          ticketData,
          notes,
        }),
      });
      const result = await response.json().catch(() => ({ message: "Resposta inválida do servidor." }));
      if (!response.ok) throw new Error(result?.message || "Não foi possível atualizar os dados.");
      toast.success("Dados privados da foto atualizados.");
      setOpen(false);
      await onSaved();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível atualizar os dados.");
    } finally {
      setSaving(false);
    }
  }

  if (!open) {
    return (
      <Button type="button" size="sm" variant="secondary" onClick={() => setOpen(true)}>
        Editar dados
      </Button>
    );
  }

  return (
    <div className="mt-4 grid gap-3 rounded-xl border border-accent/30 bg-bg p-4 sm:grid-cols-2">
      <Field label="Número do ticket"><Input value={tripCode} onChange={(e) => setTripCode(e.target.value)} /></Field>
      <Field label="Peso líquido (kg)"><Input inputMode="numeric" value={netWeight} onChange={(e) => setNetWeight(e.target.value)} /></Field>
      <Field label="Placa do veículo"><Input value={placaVeiculo} onChange={(e) => setPlacaVeiculo(e.target.value)} /></Field>
      <Field label="Placa da carreta"><Input value={placaCarreta} onChange={(e) => setPlacaCarreta(e.target.value)} /></Field>
      <Field label="Transportadora"><Input value={transportadora} onChange={(e) => setTransportadora(e.target.value)} /></Field>
      <Field label="Operadora"><Input value={operadora} onChange={(e) => setOperadora(e.target.value)} /></Field>
      <Field label="Empresa contratante"><Input value={contratante} onChange={(e) => setContratante(e.target.value)} /></Field>
      <Field label="Destinatário / recebedor"><Input value={destinatario} onChange={(e) => setDestinatario(e.target.value)} /></Field>
      <Field label="Navio"><Input value={navio} onChange={(e) => setNavio(e.target.value)} /></Field>
      <Field label="Emissor"><Input value={emissor} onChange={(e) => setEmissor(e.target.value)} /></Field>
      <Field label="Operador da pesagem"><Input value={operadorPesagem} onChange={(e) => setOperadorPesagem(e.target.value)} /></Field>
      <Field label="Código do item"><Input value={itemCodigo} onChange={(e) => setItemCodigo(e.target.value)} /></Field>
      <Field label="Motorista"><Input value={driverName} onChange={(e) => setDriverName(e.target.value)} /></Field>
      <Field label="Conjunto"><Input value={fleetName} onChange={(e) => setFleetName(e.target.value)} /></Field>
      <Field label="Data"><Input type="date" value={tripDate} onChange={(e) => setTripDate(e.target.value)} /></Field>
      <label className="grid gap-1 text-sm sm:col-span-2">
        <span className="font-medium">Observações privadas do Felipe</span>
        <textarea className="min-h-24 rounded-md border border-border bg-surface px-3 py-2 text-sm" value={notes} onChange={(e) => setNotes(e.target.value)} />
      </label>
      <div className="flex gap-2 sm:col-span-2">
        <Button type="button" onClick={() => void save()} disabled={saving}>{saving ? "Salvando…" : "Salvar alterações"}</Button>
        <Button type="button" variant="ghost" onClick={() => setOpen(false)} disabled={saving}>Cancelar</Button>
      </div>
    </div>
  );
}

async function imageToDataUrl(file: File) {
  if (!file.type.startsWith("image/")) throw new Error("Selecione uma foto válida.");
  if (file.size > 12_000_000) throw new Error("A foto deve ter no máximo 12 MB.");

  try {
    const bitmap = await createImageBitmap(file);
    const maxSide = 1400;
    const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Não foi possível preparar a imagem.");
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();

    const out = canvas.toDataURL("image/jpeg", 0.76);
    if (out.length > 3_000_000) throw new Error("A foto ficou grande demais. Tire a foto mais perto do ticket.");
    return out;
  } catch (error) {
    if (error instanceof Error && error.message.includes("grande demais")) throw error;
    return await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error("Não foi possível ler a foto."));
      reader.onload = () => {
        const value = String(reader.result || "");
        if (value.length > 3_000_000) reject(new Error("A foto é grande demais. Use JPG ou reduza o tamanho."));
        else resolve(value);
      };
      reader.readAsDataURL(file);
    });
  }
}

function FotosTicketsPage() {
  const { data } = useFleet();
  const [sourceKey, setSourceKey] = useState("");
  const [search, setSearch] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [loadingSaved, setLoadingSaved] = useState(true);
  const [savedPhotos, setSavedPhotos] = useState<SavedPhoto[]>([]);
  const [felipeAccess, setFelipeAccess] = useState<boolean | null>(null);

  const sources = useMemo<SourceItem[]>(() => {
    if (!data) return [];
    const drivers = data.drivers ?? [];
    const fleets = data.fleets ?? [];
    const driverName = (id: string) => drivers.find((d) => d.id === id)?.name ?? "Motorista";
    const fleetName = (id: string) => fleets.find((f) => f.id === id)?.name ?? "Conjunto";

    const reports: SourceItem[] = (data.reports ?? []).map((r) => ({
      key: "report:" + r.id,
      relationType: "report",
      relationId: r.id,
      code: String(r.ticket ?? r.id),
      driverId: r.driverId,
      driverName: driverName(r.driverId),
      fleetId: r.fleetId,
      fleetName: fleetName(r.fleetId),
      date: String(r.createdAt ?? "").slice(0, 10),
      freightMode: r.freightMode ?? null,
      netWeight: Number(r.tons ?? 0) || null,
      status: r.status ?? null,
    }));

    const trips: SourceItem[] = (data.trips ?? []).map((t) => ({
      key: "trip:" + t.id,
      relationType: "trip",
      relationId: t.id,
      code: String(t.code ?? t.id),
      driverId: t.driverId,
      driverName: driverName(t.driverId),
      fleetId: t.fleetId,
      fleetName: fleetName(t.fleetId),
      date: String(t.date ?? "").slice(0, 10),
      freightMode: t.freightMode ?? null,
      netWeight: Number(t.netWeight ?? 0) || null,
      status: "fechada",
    }));

    return [...reports, ...trips].sort((a, b) => b.date.localeCompare(a.date) || b.code.localeCompare(a.code));
  }, [data]);

  const visibleSources = useMemo(() => {
    const q = search.trim().toLocaleLowerCase("pt-BR");
    if (!q) return sources;
    return sources.filter((s) => [s.code, s.driverName, s.fleetName, s.date, s.status, modeLabel(s.freightMode)]
      .some((value) => String(value ?? "").toLocaleLowerCase("pt-BR").includes(q)));
  }, [sources, search]);

  const selected = sources.find((s) => s.key === sourceKey) ?? null;
  const pendingSources = visibleSources.filter((s) => s.relationType === "report");
  const tripSources = visibleSources.filter((s) => s.relationType === "trip");

  async function loadSaved() {
    try {
      setLoadingSaved(true);
      const response = await fetch("/api/photo-intake", { credentials: "same-origin", cache: "no-store" });
      const result = await response.json().catch(() => ({ ok: false, message: "Resposta inválida do servidor." }));
      if (!response.ok) throw new Error(result?.message || "Não foi possível carregar as fotos.");
      setSavedPhotos(Array.isArray(result.photos) ? result.photos : []);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível carregar as fotos.");
    } finally {
      setLoadingSaved(false);
    }
  }

  useEffect(() => {
    let active = true;
    void getManagementSession()
      .then((session) => {
        if (!active) return;
        const allowed = !!session.authenticated && String(session.username || "").trim().toLocaleLowerCase("pt-BR") === "felipe";
        setFelipeAccess(allowed);
        if (allowed) void loadSaved();
        else setLoadingSaved(false);
      })
      .catch(() => {
        if (active) { setFelipeAccess(false); setLoadingSaved(false); }
      });
    return () => { active = false; };
  }, []);

  async function savePhotos() {
    if (!selected) return toast.error("Escolha a viagem ou lançamento.");
    if (files.length === 0) return toast.error("Selecione pelo menos uma foto do ticket.");

    setBusy(true);
    let saved = 0;
    try {
      for (const file of files) {
        const image = await imageToDataUrl(file);
        const response = await fetch("/api/photo-intake", {
          method: "POST",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            image,
            fileName: file.name,
            relationType: selected.relationType,
            relationId: selected.relationId,
            tripCode: selected.code,
            driverId: selected.driverId,
            driverName: selected.driverName,
            fleetId: selected.fleetId,
            fleetName: selected.fleetName,
            tripDate: selected.date,
            freightMode: selected.freightMode,
            netWeight: selected.netWeight,
            reportStatus: selected.status,
          }),
        });
        const result = await response.json().catch(() => ({ ok: false, message: "Resposta inválida do servidor." }));
        if (!response.ok) throw new Error(result?.message || "Não foi possível salvar a foto.");
        saved += 1;
      }

      toast.success(saved === 1 ? "Foto do ticket salva e relacionada à viagem." : saved + " fotos salvas e relacionadas à viagem.");
      setFiles([]);
      await loadSaved();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível salvar a foto.");
    } finally {
      setBusy(false);
    }
  }

  async function deletePhoto(photo: SavedPhoto) {
    if (!window.confirm("Excluir a foto do ticket " + photo.tripCode + "?")) return;
    try {
      const response = await fetch("/api/photo-intake?id=" + encodeURIComponent(photo.id), {
        method: "DELETE",
        credentials: "same-origin",
      });
      const result = await response.json().catch(() => ({ ok: false, message: "Resposta inválida do servidor." }));
      if (!response.ok) throw new Error(result?.message || "Não foi possível excluir a foto.");
      toast.success("Foto excluída.");
      await loadSaved();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível excluir a foto.");
    }
  }

  if (felipeAccess === null) {
    return <div className="rounded-xl border border-border bg-surface p-5 text-sm text-muted"><LoaderCircle className="mr-2 inline size-4 animate-spin" /> Verificando acesso privado…</div>;
  }

  if (!felipeAccess) {
    return (
      <div className="rounded-xl border border-border bg-surface p-6">
        <h1 className="font-display text-2xl font-semibold">Arquivo privado de fotos</h1>
        <p className="mt-2 text-sm text-muted">As fotos e os dados extras dos tickets são exclusivos do administrador Felipe.</p>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-start gap-3">
        <span className="grid size-12 shrink-0 place-items-center rounded-xl bg-surface-2 text-accent"><Camera className="size-6" /></span>
        <div>
          <p className="text-[11px] uppercase tracking-[0.18em] text-muted">Arquivo privado do Felipe</p>
          <h1 className="mt-1 font-display text-4xl font-semibold tracking-tight">Fotos dos Tickets</h1>
          <p className="mt-2 max-w-2xl text-sm text-muted">
            Todas as fotos enviadas ao leitor ficam arquivadas aqui. Somente Felipe pode visualizar, corrigir os dados e excluir arquivos.
          </p>
        </div>
      </div>

      <section className="mt-7 grid gap-5 rounded-xl border border-border bg-surface p-5 sm:p-6">
        <div className="grid gap-4">
          <Field label="Pesquisar viagem">
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Ticket, motorista, conjunto ou data"
            />
          </Field>

          <Field label="Relacionar foto à viagem">
            <Select value={sourceKey} onChange={(e) => setSourceKey(e.target.value)}>
              <option value="">Escolha a viagem ou lançamento</option>
              {pendingSources.length > 0 ? (
                <optgroup label="Caixa / lançamentos">
                  {pendingSources.map((s) => (
                    <option key={s.key} value={s.key}>
                      Ticket {s.code} · {s.driverName} · {s.fleetName} · {tons(s.netWeight)}
                    </option>
                  ))}
                </optgroup>
              ) : null}
              {tripSources.length > 0 ? (
                <optgroup label="Viagens fechadas">
                  {tripSources.map((s) => (
                    <option key={s.key} value={s.key}>
                      Viagem {s.code} · {s.driverName} · {shortDate(s.date)} · {tons(s.netWeight)}
                    </option>
                  ))}
                </optgroup>
              ) : null}
            </Select>
          </Field>
        </div>

        {selected ? (
          <div className="rounded-xl border border-border bg-bg p-4">
            <div className="flex items-start gap-3">
              <Link2 className="mt-0.5 size-5 shrink-0 text-accent" />
              <div className="grid gap-1 text-sm">
                <strong>Ticket/viagem {selected.code}</strong>
                <span className="text-muted">{selected.driverName} · {selected.fleetName}</span>
                <span className="text-muted">{shortDate(selected.date)} · {modeLabel(selected.freightMode)} · {tons(selected.netWeight)}</span>
              </div>
            </div>
          </div>
        ) : null}

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="relative flex min-h-40 overflow-hidden flex-col items-center justify-center rounded-xl border border-dashed border-border bg-bg px-5 py-7 text-center hover:bg-surface-2">
            <ImagePlus className="pointer-events-none size-8 text-accent" />
            <strong className="pointer-events-none mt-3 text-sm">Escolher da galeria</strong>
            <span className="pointer-events-none mt-1 text-xs text-muted">Selecione uma ou várias fotos do ticket recebidas do motorista.</span>
            <input
              aria-label="Escolher fotos da galeria"
              className="absolute inset-0 z-10 h-full w-full cursor-pointer opacity-0"
              type="file"
              accept="image/*"
              multiple
              onChange={(e) => {
                setFiles(Array.from(e.currentTarget.files ?? []));
                e.currentTarget.value = "";
              }}
            />
          </div>

          <div className="relative flex min-h-40 overflow-hidden flex-col items-center justify-center rounded-xl border border-dashed border-border bg-bg px-5 py-7 text-center hover:bg-surface-2">
            <Camera className="pointer-events-none size-8 text-accent" />
            <strong className="pointer-events-none mt-3 text-sm">Fotografar ticket</strong>
            <span className="pointer-events-none mt-1 text-xs text-muted">Também é possível fotografar o ticket diretamente pela Gerência.</span>
            <input
              aria-label="Fotografar ticket"
              className="absolute inset-0 z-10 h-full w-full cursor-pointer opacity-0"
              type="file"
              accept="image/*"
              capture="environment"
              onChange={(e) => {
                const selectedFiles = Array.from(e.currentTarget.files ?? []);
                if (selectedFiles.length) setFiles((current) => [...current, ...selectedFiles]);
                e.currentTarget.value = "";
              }}
            />
          </div>
        </div>

        {files.length > 0 ? (
          <div className="rounded-lg border border-border bg-bg p-3 text-sm">
            <strong>{files.length} foto(s) pronta(s) para salvar</strong>
            <p className="mt-1 truncate text-xs text-muted">{files.map((f) => f.name).join(" • ")}</p>
          </div>
        ) : null}

        <Button type="button" size="lg" disabled={busy || !selected || files.length === 0} onClick={() => void savePhotos()}>
          {busy ? <LoaderCircle className="size-5 animate-spin" /> : <ImagePlus className="size-5" />}
          {busy ? "Salvando fotos…" : "Salvar foto e relacionar à viagem"}
        </Button>
      </section>

      <section className="mt-7">
        <div className="flex items-baseline justify-between gap-3">
          <div>
            <p className="text-[11px] uppercase tracking-[0.16em] text-muted">Arquivo privado do Felipe</p>
            <h2 className="mt-1 font-display text-2xl font-semibold">Tickets salvos</h2>
          </div>
          <Button type="button" size="sm" variant="ghost" disabled={loadingSaved} onClick={() => void loadSaved()}>
            {loadingSaved ? "Atualizando…" : "Atualizar"}
          </Button>
        </div>

        {loadingSaved ? (
          <div className="mt-4 flex items-center gap-2 rounded-xl border border-border bg-surface p-4 text-sm text-muted">
            <LoaderCircle className="size-4 animate-spin" /> Carregando fotos…
          </div>
        ) : savedPhotos.length === 0 ? (
          <p className="mt-4 rounded-xl border border-dashed border-border px-4 py-10 text-center text-sm text-muted">
            Nenhuma foto de ticket salva ainda.
          </p>
        ) : (
          <div className="mt-4 grid gap-3">
            {savedPhotos.map((photo) => (
              <article key={photo.id} className="rounded-xl border border-border bg-surface p-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <strong className="font-display text-xl">Ticket/viagem {photo.tripCode}</strong>
                      <span className="rounded-full border border-border px-2 py-0.5 text-[10px] uppercase tracking-wide text-muted">
                        {photo.relationType === "trip" ? "Viagem fechada" : photo.relationType === "report" ? "Caixa" : "Leitura automática"}
                      </span>
                    </div>
                    <p className="mt-1 text-sm text-muted">
                      {photo.driverName || "Motorista"} · {photo.fleetName || "Conjunto"} · {shortDate(photo.tripDate)}
                    </p>
                    <p className="mt-1 text-xs text-subtle">
                      {modeLabel(photo.freightMode)} · {tons(photo.netWeight)} · arquivo {photo.fileName}
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-wrap gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant="secondary"
                      onClick={() => window.open("/api/photo-intake?id=" + encodeURIComponent(photo.id), "_blank")}
                    >
                      <ExternalLink className="size-4" /> Ver foto
                    </Button>
                    <PhotoPrivateEditor photo={photo} onSaved={loadSaved} />
                    <Button type="button" size="sm" variant="ghost" className="text-danger" onClick={() => void deletePhoto(photo)}>
                      <Trash2 className="size-4" /> Excluir
                    </Button>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
