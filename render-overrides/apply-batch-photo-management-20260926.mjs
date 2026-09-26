import fs from "node:fs";
import path from "node:path";

const target = process.argv[2];
if (!target || !fs.existsSync(target)) throw new Error("batch-photo-management: target missing");
const p = path.join(target, "src/routes/dono/fotos.tsx");
let s = fs.readFileSync(p, "utf8");

function must(before, after, label) {
  if (!s.includes(before)) throw new Error("batch-photo-management: pattern not found (" + label + ")");
  s = s.replace(before, after);
}

must(
  'type SavedPhoto = {',
  'type ReadTicketData = {\n' +
    '  numero_ticket?: string | null;\n' +
    '  peso_liquido_kg?: number | null;\n' +
    '  data_ticket?: string | null;\n' +
    '  placa_veiculo?: string | null;\n' +
    '  placa_carreta?: string | null;\n' +
    '  placas_detectadas?: string[];\n' +
    '  motorista?: string | null;\n' +
    '  transportadora?: string | null;\n' +
    '  contratante?: string | null;\n' +
    '  destinatario?: string | null;\n' +
    '  produto?: string | null;\n' +
    '  alertas?: string[];\n' +
    '};\n\n' +
    'type BatchPhotoResult = {\n' +
    '  id: string;\n' +
    '  fileName: string;\n' +
    '  imageData: string;\n' +
    '  photoId: string;\n' +
    '  ticket: ReadTicketData | null;\n' +
    '  linked: boolean;\n' +
    '  caixaCreated: boolean;\n' +
    '  note: string;\n' +
    '  error: string;\n' +
    '};\n\n' +
    'type SavedPhoto = {',
  "types",
);

must(
  '  const [files, setFiles] = useState<File[]>([]);\n  const [busy, setBusy] = useState(false);',
  '  const [files, setFiles] = useState<File[]>([]);\n' +
    '  const [batchResults, setBatchResults] = useState<BatchPhotoResult[]>([]);\n' +
    '  const [batchProgress, setBatchProgress] = useState({ done: 0, total: 0 });\n' +
    '  const [busy, setBusy] = useState(false);',
  "state",
);

const saveStart = s.indexOf("  async function savePhotos() {");
const saveEnd = s.indexOf("\n\n  async function deletePhoto", saveStart);
if (saveStart < 0 || saveEnd < 0) throw new Error("batch-photo-management: savePhotos block missing");

const replacement = [
'  function normalizeMatchText(value: unknown) {',
'    return String(value ?? "").normalize("NFD").replace(/[\\u0300-\\u036f]/g, "").toUpperCase().replace(/[^A-Z0-9]/g, "");',
'  }',
'',
'  function ticketDateIso(value: unknown) {',
'    const raw = String(value ?? "").trim();',
'    if (/^\\d{4}-\\d{2}-\\d{2}$/.test(raw)) return raw;',
'    const match = raw.match(/^(\\d{1,2})[/.\\-](\\d{1,2})[/.\\-](\\d{4})$/);',
'    return match ? match[3] + "-" + match[2].padStart(2, "0") + "-" + match[1].padStart(2, "0") : "";',
'  }',
'',
'  async function readTicketImage(imageData: string, fileName: string, attempt = 0): Promise<ReadTicketData> {',
'    const response = await fetch("/api/ler-ticket", {',
'      method: "POST",',
'      credentials: "same-origin",',
'      signal: AbortSignal.timeout(45_000),',
'      headers: { "Content-Type": "application/json" },',
'      body: JSON.stringify({ imagem: imageData, tipo: imageData.match(/^data:([^;]+);/)?.[1] || "image/jpeg", freightMode: "ton", fileName }),',
'    });',
'    if (response.status === 429 && attempt < 6) { await new Promise((resolve) => setTimeout(resolve, 61_000)); return readTicketImage(imageData, fileName, attempt + 1); }',
'    const result = await response.json().catch(() => ({ erro: "Resposta inválida do servidor." }));',
'    if (!response.ok) throw new Error(result?.erro || "O ChatGPT não conseguiu interpretar a foto.");',
'    return result as ReadTicketData;',
'  }',
'',
'  function automaticSource(ticket: ReadTicketData) {',
'    const ticketNumber = normalizeMatchText(ticket.numero_ticket);',
'    const date = ticketDateIso(ticket.data_ticket);',
'    const kg = Number(ticket.peso_liquido_kg || 0);',
'    const ticketTons = kg > 0 ? kg / 1000 : 0;',
'    if (ticketNumber && kg > 0) {',
'      const sameNumber = sources.filter((source) => normalizeMatchText(source.code) === ticketNumber);',
'      if (sameNumber.length > 0) {',
'        const exact = sameNumber.filter((source) => source.netWeight != null && Math.round(Number(source.netWeight) * 1000) === kg);',
'        if (exact.length === 1) return exact[0];',
'        return null;',
'      }',
'    }',
'    const plateSet = new Set([ticket.placa_veiculo, ticket.placa_carreta, ...(ticket.placas_detectadas ?? [])].map(normalizeMatchText).filter(Boolean));',
'    const driverText = normalizeMatchText(ticket.motorista);',
'    const ranked = sources.map((source) => {',
'      let score = 0;',
'      if (date && source.date === date) score += 25;',
'      if (ticketTons > 0 && source.netWeight != null && Math.round(Number(source.netWeight) * 1000) === kg) score += 50;',
'      if (driverText && (driverText.includes(normalizeMatchText(source.driverName)) || normalizeMatchText(source.driverName).includes(driverText))) score += 20;',
'      const fleet = (data?.fleets ?? []).find((item) => item.id === source.fleetId);',
'      if (fleet && plateSet.size) {',
'        const tractor = normalizeMatchText(fleet.tractorPlate);',
'        const trailer = normalizeMatchText(fleet.trailerPlate);',
'        if ((tractor && plateSet.has(tractor)) || (trailer && plateSet.has(trailer))) score += 50;',
'      }',
'      return { source, score };',
'    }).sort((a, b) => b.score - a.score);',
'    const best = ranked[0];',
'    const second = ranked[1];',
'    if (!best || best.score < 80) return null;',
'    if (second && second.score >= best.score - 15) return null;',
'    return best.source;',
'  }',
'',
'  function resolveDriverAndFleet(ticket: ReadTicketData) {',
'    const drivers = (data?.drivers ?? []).filter((item) => item.status === "ativo");',
'    const fleets = (data?.fleets ?? []).filter((item) => item.status === "ativo");',
'    const driverText = normalizeMatchText(ticket.motorista);',
'    const plates = new Set([ticket.placa_veiculo, ticket.placa_carreta, ...(ticket.placas_detectadas ?? [])].map(normalizeMatchText).filter(Boolean));',
'    let driver = null as (typeof drivers)[number] | null;',
'    let fleet = null as (typeof fleets)[number] | null;',
'',
'    if (driverText) {',
'      const exact = drivers.filter((item) => normalizeMatchText(item.name) === driverText);',
'      const similar = exact.length ? exact : drivers.filter((item) => { const name = normalizeMatchText(item.name); return name && (driverText.includes(name) || name.includes(driverText)); });',
'      if (similar.length === 1) driver = similar[0];',
'    }',
'    if (plates.size) {',
'      const matches = fleets.filter((item) => {',
'        const tractor = normalizeMatchText(item.tractorPlate);',
'        const trailer = normalizeMatchText(item.trailerPlate);',
'        return (tractor && plates.has(tractor)) || (trailer && plates.has(trailer));',
'      });',
'      if (matches.length === 1) fleet = matches[0];',
'    }',
'',
'    if (driver && !fleet) {',
'      const ids = [...new Set(sources.filter((source) => source.driverId === driver!.id).map((source) => source.fleetId).filter(Boolean))];',
'      const candidates = fleets.filter((item) => ids.includes(item.id));',
'      if (candidates.length === 1) fleet = candidates[0];',
'    }',
'    if (fleet && !driver) {',
'      const ids = [...new Set(sources.filter((source) => source.fleetId === fleet!.id).map((source) => source.driverId).filter(Boolean))];',
'      const candidates = drivers.filter((item) => ids.includes(item.id));',
'      if (candidates.length === 1) driver = candidates[0];',
'    }',
'    return driver && fleet ? { driver, fleet } : null;',
'  }',
'',
'  async function createPendingCaixa(ticket: ReadTicketData, imageData: string, fileName: string, photoId: string) {',
'    const ticketNumber = String(ticket.numero_ticket || "").trim();',
'    const weightKg = Number(ticket.peso_liquido_kg || 0);',
'    if (!ticketNumber) return { source: null as SourceItem | null, note: "Foto salva, mas o número do ticket não ficou legível para lançar no Caixa." };',
'    if (!Number.isSafeInteger(weightKg) || weightKg <= 0) return { source: null as SourceItem | null, note: "Foto salva, mas o peso líquido precisa estar legível para lançar no Caixa." };',
'    const sameNumber = sources.filter((source) => normalizeMatchText(source.code) === normalizeMatchText(ticketNumber));',
'    if (sameNumber.length > 0 && !sameNumber.some((source) => source.netWeight != null && Math.round(Number(source.netWeight) * 1000) === weightKg)) {',
'      return { source: null as SourceItem | null, note: "Já existe lançamento com este número de ticket, mas com peso líquido diferente. A foto ficou salva para conferência da Gerência." };',
'    }',
'    const identity = resolveDriverAndFleet(ticket);',
'    if (!identity) return { source: null as SourceItem | null, note: "Foto e dados salvos. Não foi possível identificar motorista e conjunto com segurança; a Gerência pode relacionar manualmente." };',
'',
'    const response = await fetch("/api/salvar-ticket", {',
'      method: "POST",',
'      credentials: "same-origin",',
'      headers: { "Content-Type": "application/json" },',
'      body: JSON.stringify({ ...ticket, conferido: true, driverId: identity.driver.id, fleetId: identity.fleet.id, freightMode: "ton", dailyValue: 0, km_carreta: 0 }),',
'    });',
'    const result = await response.json().catch(() => ({ erro: "Resposta inválida do servidor." }));',
'    if (!response.ok) {',
'      if (response.status === 409) return { source: null as SourceItem | null, note: result?.erro || ("Ticket " + ticketNumber + " já existe e não foi duplicado.") };',
'      throw new Error(result?.erro || "Não foi possível lançar a viagem no Caixa.");',
'    }',
'    const source: SourceItem = {',
'      key: "report:" + result.reportId, relationType: "report", relationId: String(result.reportId), code: String(result.ticket || ticketNumber),',
'      driverId: String(result.driverId || identity.driver.id), driverName: String(result.driverName || identity.driver.name),',
'      fleetId: String(result.fleetId || identity.fleet.id), fleetName: String(result.fleetName || identity.fleet.name || ""),',
'      date: ticketDateIso(ticket.data_ticket) || new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date()),',
'      freightMode: String(result.freightMode || "ton"), netWeight: Number(result.tons ?? weightKg / 1000), status: String(result.reportStatus || "pendente"),',
'    };',
'    await archivePhoto(source, imageData, fileName, photoId);',
'    return { source, note: result.linkedExisting ? "Ticket e peso líquido já estavam lançados. A nova foto foi vinculada ao lançamento existente." : "Viagem criada no Caixa para conferência e fechamento da Gerência." };',
'  }',
'',
'  async function uploadPendingPhoto(image: string, fileName: string) {',
'    const response = await fetch("/api/photo-intake", {',
'      method: "POST",',
'      credentials: "same-origin",',
'      headers: { "Content-Type": "application/json" },',
'      body: JSON.stringify({ image, fileName, relationType: "unlinked", relationId: "pending", tripCode: "Aguardando vínculo" }),',
'    });',
'    const result = await response.json().catch(() => ({ ok: false, message: "Resposta inválida do servidor." }));',
'    if (!response.ok) throw new Error(result?.message || "Não foi possível enviar a foto.");',
'    return String(result?.id || "");',
'  }',
'',
'  async function archivePhoto(source: SourceItem, image: string, fileName: string, photoId = "") {',
'    const response = await fetch("/api/photo-intake", {',
'      method: "POST",',
'      credentials: "same-origin",',
'      headers: { "Content-Type": "application/json" },',
'      body: JSON.stringify({ image, fileName, photoId, relationType: source.relationType, relationId: source.relationId, tripCode: source.code, driverId: source.driverId, driverName: source.driverName, fleetId: source.fleetId, fleetName: source.fleetName, tripDate: source.date, freightMode: source.freightMode, netWeight: source.netWeight, reportStatus: source.status }),',
'    });',
'    const result = await response.json().catch(() => ({ ok: false, message: "Resposta inválida do servidor." }));',
'    if (!response.ok) throw new Error(result?.message || "Não foi possível relacionar a foto.");',
'  }',
'',
'  async function linkBatchResult(id: string) {',
'    const source = selected;',
'    const item = batchResults.find((entry) => entry.id === id);',
'    if (!item) return;',
'    if (!source) return toast.error("Escolha acima a viagem correta para esta foto.");',
'    try {',
'      await archivePhoto(source, item.imageData, item.fileName, item.photoId);',
'      setBatchResults((current) => current.map((entry) => entry.id === id ? { ...entry, linked: true, error: "" } : entry));',
'      toast.success("Foto relacionada à viagem " + source.code + ".");',
'      await loadSaved();',
'    } catch (error) {',
'      toast.error(error instanceof Error ? error.message : "Não foi possível relacionar a foto.");',
'    }',
'  }',
'',
'  async function savePhotos(incomingFiles?: File[]) {',
'    const selectedFiles = incomingFiles?.length ? incomingFiles : files;',
'    if (selectedFiles.length === 0) return toast.error("Selecione pelo menos uma foto do ticket.");',
'    setBusy(true);',
'    setBatchResults([]);',
'    setBatchProgress({ done: 0, total: selectedFiles.length });',
'    let linked = 0;',
'    let failed = 0;',
'    try {',
'      for (let offset = 0; offset < selectedFiles.length; offset += 3) {',
'        const chunk = selectedFiles.slice(offset, offset + 3);',
'        const results = await Promise.all(chunk.map(async (file, chunkIndex): Promise<BatchPhotoResult> => {',
'          const id = Date.now().toString(36) + "-" + (offset + chunkIndex) + "-" + Math.random().toString(36).slice(2, 8);',
'          try {',
'            const imageData = await imageToDataUrl(file);',
'            const pendingId = await uploadPendingPhoto(imageData, file.name);',
'            const ticket = await readTicketImage(imageData, file.name);',
'            const matched = automaticSource(ticket);',
'            let finalSource: SourceItem | null = matched;',
'            let caixaCreated = false;',
'            let note = "";',
'            if (matched) {',
'              await archivePhoto(matched, imageData, file.name, pendingId);',
'              linked += 1;',
'              note = "Mesmo número do ticket e mesmo peso líquido encontrados. Foto vinculada ao lançamento existente.";',
'            } else {',
'              const created = await createPendingCaixa(ticket, imageData, file.name, pendingId);',
'              finalSource = created.source;',
'              note = created.note;',
'              if (created.source) { caixaCreated = true; linked += 1; }',
'            }',
'            return { id, fileName: file.name || "ticket.jpg", imageData, photoId: pendingId, ticket, linked: !!finalSource, caixaCreated, note, error: "" };',
'          } catch (error) {',
'            failed += 1;',
'            return { id, fileName: file.name || "ticket.jpg", imageData: "", photoId: "", ticket: null, linked: false, caixaCreated: false, note: "", error: error instanceof Error ? error.message : "Não foi possível processar a foto." };',
'          }',
'        }));',
'        setBatchResults((current) => [...current, ...results]);',
'        setBatchProgress({ done: Math.min(offset + chunk.length, selectedFiles.length), total: selectedFiles.length });',
'      }',
'      const total = selectedFiles.length;',
'      setFiles([]);',
'      await loadSaved();',
'      const manual = total - linked - failed;',
'      if (failed === 0 && manual === 0) toast.success(linked + (linked === 1 ? " foto processada e enviada/relacionada com sucesso." : " fotos processadas e enviadas/relacionadas com sucesso."));',
'      else toast.success("Leitura concluída: " + linked + " enviada(s)/vinculada(s), " + manual + " aguardando identificação e " + failed + " com erro.");',
'    } finally {',
'      setBusy(false);',
'    }',
'  }',
].join("\n");

s = s.slice(0, saveStart) + replacement + s.slice(saveEnd);

s = s.replace(
  "Salve a foto enviada pelo motorista e relacione manualmente à viagem correta. Esta área é somente da Gerência e não usa IA.",
  "Selecione quantas fotos quiser. O ChatGPT extrai os dados; se já existir a viagem, relaciona a foto. Se não existir, cria um lançamento pendente no Caixa para a Gerência conferir e fechar.",
);
s = s.replace('Field label="Relacionar foto à viagem"', 'Field label="Vínculo manual (para fotos sem correspondência automática)"');
s = s.replace("Selecione uma ou várias fotos do ticket recebidas do motorista.", "Selecione várias fotos. Todas serão lidas pelo ChatGPT em lote.");


s = s.replace(
  '              onChange={(e) => {\n                setFiles(Array.from(e.currentTarget.files ?? []));\n                e.currentTarget.value = "";\n              }}',
  '              onChange={(e) => {\n                const selectedFiles = Array.from(e.currentTarget.files ?? []);\n                e.currentTarget.value = "";\n                if (!selectedFiles.length) return;\n                setFiles(selectedFiles);\n                void savePhotos(selectedFiles);\n              }}',
);
s = s.replace(
  '              onChange={(e) => {\n                const selectedFiles = Array.from(e.currentTarget.files ?? []);\n                if (selectedFiles.length) setFiles((current) => [...current, ...selectedFiles]);\n                e.currentTarget.value = "";\n              }}',
  '              onChange={(e) => {\n                const selectedFiles = Array.from(e.currentTarget.files ?? []);\n                e.currentTarget.value = "";\n                if (!selectedFiles.length) return;\n                setFiles(selectedFiles);\n                void savePhotos(selectedFiles);\n              }}',
);
s = s.replace(
  '{files.length} foto(s) pronta(s) para salvar',
  '{busy ? "Enviando e lendo " + batchProgress.done + "/" + batchProgress.total : files.length + " foto(s) selecionada(s)"}',
);

must(
  '<Button type="button" size="lg" disabled={busy || !selected || files.length === 0} onClick={() => void savePhotos()}>\n          {busy ? <LoaderCircle className="size-5 animate-spin" /> : <ImagePlus className="size-5" />}\n          {busy ? "Salvando fotos…" : "Salvar foto e relacionar à viagem"}\n        </Button>',
  '<Button type="button" size="lg" disabled={busy || files.length === 0} onClick={() => void savePhotos()}>\n' +
    '          {busy ? <LoaderCircle className="size-5 animate-spin" /> : <ImagePlus className="size-5" />}\n' +
    '          {busy ? "Lendo " + batchProgress.done + "/" + batchProgress.total + "…" : "Ler, extrair e relacionar fotos"}\n' +
    '        </Button>',
  "button",
);

const savedMarker = '\n\n      <section className="mt-7">\n        <div className="flex items-baseline justify-between gap-3">';
if (!s.includes(savedMarker)) throw new Error("batch-photo-management: saved section marker missing");

const resultUi = [
'',
'      {batchResults.length > 0 ? (',
'        <section className="mt-7 grid gap-3">',
'          <div>',
'            <p className="text-[11px] uppercase tracking-[0.16em] text-muted">Leitura em lote</p>',
'            <h2 className="mt-1 font-display text-2xl font-semibold">Dados extraídos</h2>',
'          </div>',
'          {batchResults.map((item, index) => {',
'            const ticket = item.ticket;',
'            return (',
'              <article key={item.id} className="rounded-xl border border-border bg-surface p-4">',
'                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">',
'                  <div className="min-w-0 text-sm">',
'                    <strong>{index + 1}. {item.fileName}</strong>',
'                    {item.error ? <p className="mt-1 text-danger">{item.error}</p> : ticket ? (',
'                      <div className="mt-2 grid gap-1 text-muted sm:grid-cols-2">',
'                        <span>Ticket: <b className="text-fg">{ticket.numero_ticket || "—"}</b></span>',
'                        <span>Peso líquido: <b className="text-fg">{ticket.peso_liquido_kg ? new Intl.NumberFormat("pt-BR").format(ticket.peso_liquido_kg) + " kg" : "—"}</b></span>',
'                        <span>Veículo: <b className="text-fg">{ticket.placa_veiculo || "—"}</b></span>',
'                        <span>Carreta: <b className="text-fg">{ticket.placa_carreta || "—"}</b></span>',
'                        <span>Contratante: <b className="text-fg">{ticket.contratante || ticket.transportadora || "—"}</b></span>',
'                        <span>Destinatário: <b className="text-fg">{ticket.destinatario || "—"}</b></span>',
'                      </div>',
'                    ) : null}',
'                    {item.note ? <p className="mt-2 text-xs text-muted">{item.note}</p> : null}',
'                  </div>',
'                  <div className="shrink-0">',
'                    {item.linked ? (',
'                      <span className="inline-flex rounded-full border border-ok/30 bg-ok/10 px-3 py-1 text-xs font-semibold text-ok">{item.caixaCreated ? "Lançada no Caixa" : "Relacionada automaticamente"}</span>',
'                    ) : !item.error ? (',
'                      <Button type="button" size="sm" variant="secondary" disabled={!selected} onClick={() => void linkBatchResult(item.id)}>',
'                        <Link2 className="size-4" /> Relacionar à viagem escolhida',
'                      </Button>',
'                    ) : null}',
'                  </div>',
'                </div>',
'              </article>',
'            );',
'          })}',
'        </section>',
'      ) : null}',
].join("\n");

s = s.replace(savedMarker, resultUi + savedMarker);
fs.writeFileSync(p, s);
console.log("[batch-photo-management] multi-photo ChatGPT extraction and safe auto-link applied");
