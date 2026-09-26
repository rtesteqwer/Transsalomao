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
    '  ticket: ReadTicketData | null;\n' +
    '  linked: boolean;\n' +
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
'    const plateSet = new Set([ticket.placa_veiculo, ticket.placa_carreta, ...(ticket.placas_detectadas ?? [])].map(normalizeMatchText).filter(Boolean));',
'    const driverText = normalizeMatchText(ticket.motorista);',
'    const ranked = sources.map((source) => {',
'      let score = 0;',
'      if (ticketNumber && normalizeMatchText(source.code) === ticketNumber) score += 15;',
'      if (date && source.date === date) score += 25;',
'      if (ticketTons > 0 && source.netWeight != null && Math.abs(Number(source.netWeight) - ticketTons) <= 0.01) score += 50;',
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
'  async function archivePhoto(source: SourceItem, image: string, fileName: string) {',
'    const response = await fetch("/api/photo-intake", {',
'      method: "POST",',
'      credentials: "same-origin",',
'      headers: { "Content-Type": "application/json" },',
'      body: JSON.stringify({ image, fileName, relationType: source.relationType, relationId: source.relationId, tripCode: source.code, driverId: source.driverId, driverName: source.driverName, fleetId: source.fleetId, fleetName: source.fleetName, tripDate: source.date, freightMode: source.freightMode, netWeight: source.netWeight, reportStatus: source.status }),',
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
'      await archivePhoto(source, item.imageData, item.fileName);',
'      setBatchResults((current) => current.map((entry) => entry.id === id ? { ...entry, linked: true, error: "" } : entry));',
'      toast.success("Foto relacionada à viagem " + source.code + ".");',
'      await loadSaved();',
'    } catch (error) {',
'      toast.error(error instanceof Error ? error.message : "Não foi possível relacionar a foto.");',
'    }',
'  }',
'',
'  async function savePhotos() {',
'    if (files.length === 0) return toast.error("Selecione pelo menos uma foto do ticket.");',
'    setBusy(true);',
'    setBatchResults([]);',
'    setBatchProgress({ done: 0, total: files.length });',
'    let linked = 0;',
'    let failed = 0;',
'    try {',
'      for (let offset = 0; offset < files.length; offset += 3) {',
'        const chunk = files.slice(offset, offset + 3);',
'        const results = await Promise.all(chunk.map(async (file, chunkIndex): Promise<BatchPhotoResult> => {',
'          const id = Date.now().toString(36) + "-" + (offset + chunkIndex) + "-" + Math.random().toString(36).slice(2, 8);',
'          try {',
'            const imageData = await imageToDataUrl(file);',
'            const ticket = await readTicketImage(imageData, file.name);',
'            const matched = automaticSource(ticket);',
'            if (matched) { await archivePhoto(matched, imageData, file.name); linked += 1; }',
'            return { id, fileName: file.name || "ticket.jpg", imageData, ticket, linked: !!matched, error: "" };',
'          } catch (error) {',
'            failed += 1;',
'            return { id, fileName: file.name || "ticket.jpg", imageData: "", ticket: null, linked: false, error: error instanceof Error ? error.message : "Não foi possível processar a foto." };',
'          }',
'        }));',
'        setBatchResults((current) => [...current, ...results]);',
'        setBatchProgress({ done: Math.min(offset + chunk.length, files.length), total: files.length });',
'      }',
'      const total = files.length;',
'      setFiles([]);',
'      if (linked > 0) await loadSaved();',
'      const manual = total - linked - failed;',
'      if (failed === 0 && manual === 0) toast.success(linked + (linked === 1 ? " foto lida e relacionada automaticamente." : " fotos lidas e relacionadas automaticamente."));',
'      else toast.success("Leitura concluída: " + linked + " vinculada(s), " + manual + " aguardando vínculo e " + failed + " com erro.");',
'    } finally {',
'      setBusy(false);',
'    }',
'  }',
].join("\n");

s = s.slice(0, saveStart) + replacement + s.slice(saveEnd);

s = s.replace(
  "Salve a foto enviada pelo motorista e relacione manualmente à viagem correta. Esta área é somente da Gerência e não usa IA.",
  "Selecione quantas fotos quiser. O ChatGPT extrai os dados de cada ticket e relaciona automaticamente quando encontra uma viagem com correspondência segura.",
);
s = s.replace('Field label="Relacionar foto à viagem"', 'Field label="Vínculo manual (para fotos sem correspondência automática)"');
s = s.replace("Selecione uma ou várias fotos do ticket recebidas do motorista.", "Selecione várias fotos. Todas serão lidas pelo ChatGPT em lote.");

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
'                  </div>',
'                  <div className="shrink-0">',
'                    {item.linked ? (',
'                      <span className="inline-flex rounded-full border border-ok/30 bg-ok/10 px-3 py-1 text-xs font-semibold text-ok">Relacionada automaticamente</span>',
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
