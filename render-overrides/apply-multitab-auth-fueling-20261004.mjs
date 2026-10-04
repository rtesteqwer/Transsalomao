import fs from 'node:fs';
import path from 'node:path';

const target = path.resolve(process.argv[2] || '');
if (!target || !fs.existsSync(path.join(target, 'src'))) throw new Error('multitab-auth-fueling: expected reconstructed app');
const file = (rel) => path.join(target, rel);
const read = (rel) => fs.readFileSync(file(rel), 'utf8');
const write = (rel, value) => fs.writeFileSync(file(rel), value);
function rep(s, before, after, label) {
  if (s.includes(after)) return s;
  if (!s.includes(before)) throw new Error('multitab-auth-fueling: pattern not found (' + label + ')');
  return s.replace(before, after);
}

// 1) Motorista: cada aba mantém o próprio rascunho e começa pronta para lançamento manual.
{
  const rel = 'src/routes/motorista.tsx';
  let s = read(rel);
  s = rep(s,
    '  const [priceBatchMode, setPriceBatchMode] = useState(true);',
    '  const [priceBatchMode, setPriceBatchMode] = useState(false);',
    'manual mode default');
  s = rep(s,
    '    const savedDriver = localStorage.getItem(DRIVER_KEY) ?? "";\n    const savedFleet = localStorage.getItem(FLEET_KEY) ?? "";\n    const savedMode = localStorage.getItem(MODE_KEY);',
    '    const savedDriver = sessionStorage.getItem(DRIVER_KEY) ?? "";\n    const savedFleet = sessionStorage.getItem(FLEET_KEY) ?? "";\n    const savedMode = sessionStorage.getItem(MODE_KEY);',
    'per-tab restore');
  s = rep(s,
    '    if (priceBatchMode) return;',
    '    if (priceBatchMode) return toast.info("O modo automático está ativo nesta aba. Desative-o para usar o envio manual.");',
    'no silent submit');
  s = s.replaceAll('localStorage.setItem(DRIVER_KEY, driverId);', 'sessionStorage.setItem(DRIVER_KEY, driverId);');
  s = s.replaceAll('localStorage.setItem(FLEET_KEY, fleetId);', 'sessionStorage.setItem(FLEET_KEY, fleetId);');
  s = s.replaceAll('localStorage.setItem(MODE_KEY, freightMode);', 'sessionStorage.setItem(MODE_KEY, freightMode);');
  s = s.replaceAll('localStorage.setItem(MODE_KEY, mode);', 'sessionStorage.setItem(MODE_KEY, mode);');
  s = rep(s,
    '                  onClick={() => {\n                    setFreightMode(mode);',
    '                  onClick={() => {\n                    setPriceBatchMode(false);\n                    setFreightMode(mode);',
    'explicit mode disables auto');
  write(rel, s);
}

// 2) Leitor de ticket: revalida a sessão ao voltar para a aba e aceita login de motorista ou gerência.
{
  const rel = 'src/components/ticket-photo-access.tsx';
  let s = read(rel);
  s = rep(s,
    'import { managementLogin } from "@/lib/management-auth";',
    'import { managementLogin } from "@/lib/management-auth";\nimport { klebersomLogin } from "@/lib/klebersom-access";',
    'driver login import');
  s = s.replaceAll('credentials: "same-origin"', 'credentials: "include"');
  s = rep(s,
    '    return () => controller.abort();\n  }, [load]);',
    '    const refresh = () => {\n      if (document.visibilityState === "visible") void load().catch(() => undefined);\n    };\n    window.addEventListener("pageshow", refresh);\n    window.addEventListener("focus", refresh);\n    document.addEventListener("visibilitychange", refresh);\n    return () => {\n      controller.abort();\n      window.removeEventListener("pageshow", refresh);\n      window.removeEventListener("focus", refresh);\n      document.removeEventListener("visibilitychange", refresh);\n    };\n  }, [load]);',
    'tab session refresh');
  s = rep(s,
    '      const result = await managementLogin({ data: { username, password, remember } });\n      setPassword("");\n      if (!result.ok) throw new Error("Login ou senha inválidos.");\n      if (result.requiresPasswordChange) { window.location.assign("/trocar-senha"); return; }\n      await load();',
    '      const driverResult = await klebersomLogin({ data: { username, password, remember } });\n      if (driverResult.ok) {\n        setPassword("");\n        if (driverResult.requiresPasswordChange) { window.location.assign("/trocar-senha"); return; }\n        await load();\n        return;\n      }\n      const result = await managementLogin({ data: { username, password, remember } });\n      setPassword("");\n      if (!result.ok) throw new Error("Login ou senha inválidos.");\n      if (result.requiresPasswordChange) { window.location.assign("/trocar-senha"); return; }\n      await load();',
    'unified login');
  write(rel, s);
}

// 3) Fotos de abastecimento no leitor universal: ler e preencher para conferência; não gravar antes da confirmação.
{
  const rel = 'src/components/operational-file-reader.tsx';
  let s = read(rel);
  const start = s.indexOf('async function importFuelingImage(');
  const end = s.indexOf('\n\nfunction repairFuelingReadingFromStructuredName', start);
  if (start < 0 || end < 0) throw new Error('multitab-auth-fueling: importFuelingImage block not found');
  const replacement = `async function importFuelingImage(\n  prepared: PreparedFile,\n  driverId: string | null,\n  fleetId: string | null,\n): Promise<ImportResult> {\n  const imageDataUrl = "data:" + prepared.mime + ";base64," + String(prepared.base64 || "");\n  const readResponse = await fetch("/api/ler-abastecimento", {\n    method: "POST",\n    credentials: "same-origin",\n    headers: { "Content-Type": "application/json" },\n    body: JSON.stringify({\n      imagem: imageDataUrl,\n      fileName: prepared.name,\n      originalFileHash: prepared.originalHash || null,\n      visualFingerprint: prepared.visualFingerprint || null,\n      driverId,\n      fleetId,\n    }),\n  });\n  const readPayload: any = await readResponse.json().catch(() => ({}));\n\n  if (!readResponse.ok || !readPayload?.ok || !readPayload?.reading) {\n    return {\n      fileName: prepared.name,\n      ok: false,\n      message: readPayload?.message || "Não foi possível ler este abastecimento.",\n      counts: { saved: 0, review: 1, duplicates: 0 },\n      review: [{ kind: "fueling", message: readPayload?.message || "Leitura pendente para conferência." }],\n    };\n  }\n\n  const reading = repairFuelingReadingFromStructuredName(prepared.name, readPayload.reading);\n  const resolvedDriverId = readPayload.suggestedDriverId || driverId || null;\n  const resolvedFleetId = readPayload.suggestedFleetId || fleetId || null;\n  const summary = fuelingSummary(reading);\n\n  window.dispatchEvent(new CustomEvent("transsalomao:fueling-prefill", { detail: {\n    fileName: prepared.name,\n    image: imageDataUrl,\n    reading,\n    driverId: resolvedDriverId,\n    fleetId: resolvedFleetId,\n    originalFileHash: prepared.originalHash || null,\n    visualFingerprint: prepared.visualFingerprint || null,\n  } }));\n\n  return {\n    fileName: prepared.name,\n    ok: true,\n    message: reading.document_type === "pump_display"\n      ? "Valores da bomba extraídos. Complete os dados que faltam e confirme o lançamento no cartão acima."\n      : "Dados extraídos. Confira e confirme o lançamento no cartão acima.",\n    summary,\n    counts: { saved: 0, review: 1, duplicates: 0 },\n    review: [{ kind: "fueling", message: "Leitura pronta para conferência antes de gravar." }],\n  };\n}`;
  s = s.slice(0, start) + replacement + s.slice(end);
  write(rel, s);
}

// 4) O leitor especializado recebe os dados do leitor universal e mostra o formulário já preenchido.
{
  const rel = 'src/components/fueling-photo-reader.tsx';
  let s = read(rel);
  const marker = '  const safeCount = useMemo(() => items.filter((item) =>';
  if (!s.includes('transsalomao:fueling-prefill')) {
    if (!s.includes(marker)) throw new Error('multitab-auth-fueling: fueling listener marker not found');
    const listener = `  useEffect(() => {\n    const onPrefill = (event: Event) => {\n      const detail = (event as CustomEvent<any>).detail || {};\n      if (!detail?.reading || !detail?.image) return;\n      const item: ReadItem = {\n        id: crypto.randomUUID(),\n        fileName: String(detail.fileName || "abastecimento.jpg"),\n        image: String(detail.image),\n        reading: detail.reading as FuelingReading,\n        suggestedDriverId: detail.driverId ? String(detail.driverId) : null,\n        suggestedFleetId: detail.fleetId ? String(detail.fleetId) : null,\n        originalFileHash: detail.originalFileHash ? String(detail.originalFileHash) : undefined,\n        visualFingerprint: detail.visualFingerprint ? String(detail.visualFingerprint) : undefined,\n        saved: false,\n        pending: false,\n        message: detail.reading?.document_type === "pump_display"\n          ? "Foto da bomba lida. Complete os dados que faltam e confirme o lançamento."\n          : "Documento lido. Confira os dados e confirme o lançamento.",\n      };\n      if (!driverId && item.suggestedDriverId) setDriverId(item.suggestedDriverId);\n      if (!fleetId && item.suggestedFleetId) setFleetId(item.suggestedFleetId);\n      setItems((current) => reconcileFuelingBatch([...current, item]));\n      setProgress("Dados extraídos da foto. Complete o lançamento abaixo.");\n    };\n    window.addEventListener("transsalomao:fueling-prefill", onPrefill as EventListener);\n    return () => window.removeEventListener("transsalomao:fueling-prefill", onPrefill as EventListener);\n  }, [driverId, fleetId]);\n\n`;
    s = s.replace(marker, listener + marker);
  }
  s = s.replace(
    ': item.pending\n                ? "Completar lançamento"\n                : "Gravar abastecimento"}',
    ': item.pending || r.document_type === "pump_display"\n                ? "Completar lançamento"\n                : "Gravar abastecimento"}'
  );
  write(rel, s);
}


// 5) Lançamento de viagem: a Gerência pode lançar em nome do motorista selecionado.
//    Motorista autenticado continua restrito ao próprio driverId.
//    Isso permite duas abas simultâneas sem exigir uma sessão de motorista em cada aba.
{
  const rel = 'src/lib/api.ts';
  let s = read(rel);
  s = rep(s,
    `  .handler(async ({ data }) => {
    const session = await requireDriver();
    const sql = await getSql();
    const id = newId("rep");`,
    `  .handler(async ({ data }) => {
    const access = await fleetAccess();
    const sql = await getSql();
    const driverId = access.role === "admin" ? data.driverId : access.driverId;
    if (!driverId) throw new Error("Escolha o motorista.");
    if (access.role === "driver" && data.driverId !== driverId) {
      throw new Error("Motorista inválido para esta sessão.");
    }
    const driver = await sql<{ id: string }>\`select id from drivers where id=\${driverId} and status='ativo' limit 1\`;
    if (!driver[0]) throw new Error("Motorista inválido ou inativo.");
    const id = newId("rep");`,
    'manager can submit reports on behalf of selected driver');
  s = rep(s,
    `      values (\${id},\${ticket},\${session.driverId},\${data.fleetId},\${data.km},\${data.tons},\${data.dailyValue},\${data.freightMode ?? null},'pendente')`, 
    `      values (\${id},\${ticket},\${driverId},\${data.fleetId},\${data.km},\${data.tons},\${data.dailyValue},\${data.freightMode ?? null},'pendente')`,
    'report uses selected driver for management');
  write(rel, s);
}


// 6) Abastecimentos já gravados: botão de remoção no próprio cartão da foto.
//    A exclusão usa a mesma rotina segura da lista de abastecimentos, solta o
//    vínculo da foto e mantém o cartão disponível para corrigir/lançar novamente.
{
  const rel = 'src/components/fueling-photo-reader.tsx';
  let s = read(rel);

  s = rep(s,
    'import { AlertTriangle, Camera, CheckCircle2, Fuel, LoaderCircle, Upload } from "lucide-react";',
    'import { AlertTriangle, Camera, CheckCircle2, Fuel, LoaderCircle, Trash2, Upload } from "lucide-react";',
    'trash icon for saved fueling');

  s = rep(s,
    'import { fleetKey, useFleet } from "@/lib/use-fleet";',
    'import { fleetKey, useFleet, useFleetMutations } from "@/lib/use-fleet";',
    'fueling delete mutation import');

  s = rep(s,
    '  visualFingerprint?: string;\n  saving?: boolean;',
    '  visualFingerprint?: string;\n  fuelingId?: string | null;\n  saving?: boolean;',
    'fueling id on read item');

  s = rep(s,
    '  const queryClient = useQueryClient();\n  const galleryRef = useRef<HTMLInputElement | null>(null);',
    '  const queryClient = useQueryClient();\n  const { removeFueling } = useFleetMutations();\n  const galleryRef = useRef<HTMLInputElement | null>(null);',
    'delete mutation hook');

  s = rep(s,
    '  const [reading, setReading] = useState(false);\n  const [progress, setProgress] = useState("");',
    '  const [reading, setReading] = useState(false);\n  const [removingId, setRemovingId] = useState<string | null>(null);\n  const [progress, setProgress] = useState("");',
    'removing state');

  s = rep(s,
    '              saved: true,\n              pending: Boolean(payload?.pending),',
    '              saved: true,\n              fuelingId: payload?.fuelingId ? String(payload.fuelingId) : null,\n              pending: Boolean(payload?.pending),',
    'capture saved fueling id');

  s = rep(s,
    '  async function saveSafe() {',
    `  async function removeSavedItem(item: ReadItem) {
    if (!item.saved || !item.fuelingId || removingId) return;
    const fuelName = String(item.reading.fuel_type || "").toLowerCase().includes("diesel")
      ? "este lançamento de diesel"
      : "este abastecimento";
    if (!window.confirm("Remover " + fuelName + "? A foto continuará disponível para corrigir e lançar novamente.")) return;

    setRemovingId(item.id);
    try {
      await removeFueling.mutateAsync(item.fuelingId);
      setItems((current) => current.map((row) =>
        row.id === item.id
          ? {
              ...row,
              saved: false,
              pending: true,
              fuelingId: null,
              message: "Lançamento removido. A foto foi mantida para você corrigir e lançar novamente.",
            }
          : row
      ));
      await queryClient.invalidateQueries({ queryKey: fleetKey });
      await queryClient.refetchQueries({ queryKey: fleetKey, type: "active" });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Não foi possível remover o lançamento.";
      setErrors((current) => [...current, item.fileName + ": " + message]);
    } finally {
      setRemovingId(null);
    }
  }

  async function saveSafe() {`,
    'remove saved fueling directly from photo card');

  s = rep(s,
    '              onSave={() => void saveItem(item)}\n            />',
    '              onSave={() => void saveItem(item)}\n              onRemove={() => void removeSavedItem(item)}\n              removing={removingId === item.id}\n            />',
    'pass removal action');

  s = rep(s,
    '  onSave,\n}: {\n  item: ReadItem;\n  onChange: (patch: Partial<FuelingReading>) => void;\n  onSave: () => void;\n}) {',
    '  onSave,\n  onRemove,\n  removing,\n}: {\n  item: ReadItem;\n  onChange: (patch: Partial<FuelingReading>) => void;\n  onSave: () => void;\n  onRemove: () => void;\n  removing: boolean;\n}) {',
    'card removal props');

  s = rep(s,
    '        {item.message ? (\n          <span className={"text-xs " + (item.saved ? "text-muted" : "text-danger")}>{item.message}</span>\n        ) : null}',
    `        {item.saved && item.fuelingId ? (
          <Button
            type="button"
            variant="ghost"
            className="text-danger"
            onClick={onRemove}
            disabled={removing}
          >
            {removing ? <LoaderCircle className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
            {removing ? "Removendo…" : "Remover lançamento"}
          </Button>
        ) : null}
        {item.message ? (
          <span className={"text-xs " + (item.saved ? "text-muted" : "text-danger")}>{item.message}</span>
        ) : null}`,
    'remove button on saved card');

  write(rel, s);
}

console.log('[multitab-auth-fueling] per-tab trips, session refresh, unified login and fueling prefill enabled; management trip submit enabled');

// Regression coverage: Qwen3-VL reader + independent-tab launch flow.
