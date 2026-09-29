import fs from "node:fs";
import path from "node:path";

const target = process.argv[2];
if (!target || !fs.existsSync(target)) throw new Error("batch-photo-driver: target missing");
const p = path.join(target, "src/routes/motorista.tsx");
let s = fs.readFileSync(p, "utf8");

// ZIP support needs JSZip in the reconstructed app.
{
  const packagePath = path.join(target, "package.json");
  const pkg = JSON.parse(fs.readFileSync(packagePath, "utf8"));
  pkg.dependencies = { ...(pkg.dependencies || {}), jszip: pkg.dependencies?.jszip || "^3.10.1" };
  fs.writeFileSync(packagePath, JSON.stringify(pkg, null, 2) + "\n");
}

// The driver page already imports the ticket icons; add Archive for the ZIP launcher.
s = s.replace(
  'import { AlertTriangle, Camera, CheckCircle2, ChevronLeft, LoaderCircle } from "lucide-react";',
  'import { Archive, AlertTriangle, Camera, CheckCircle2, ChevronLeft, LoaderCircle } from "lucide-react";',
);

function must(before, after, label) {
  if (!s.includes(before)) throw new Error("batch-photo-driver: pattern not found (" + label + ")");
  s = s.replace(before, after);
}

must(
  '  const [batchPhotos, setBatchPhotos] = useState<Array<{ fileName: string; imageData: string }>>([]);',
  '  const [batchPhotos, setBatchPhotos] = useState<Array<{ id: string; fileName: string; imageData: string; data: TicketData | null; error: string; sent: boolean; status: "queued" | "uploading" | "saved" | "reading" | "sending" | "sent" | "linked" | "error" }>>([]);',
  "state",
);

const fnStart = s.indexOf("  async function onFixedModeFiles(files: File[]) {");
const fnEnd = s.indexOf("\n\n  async function onSubmit(e: React.FormEvent)", fnStart);
if (fnStart < 0 || fnEnd < 0) throw new Error("batch-photo-driver: fixed batch handler missing");

const fn = [
'  async function blobBase64(blob: Blob) {',
'    const buffer = new Uint8Array(await blob.arrayBuffer());',
'    let binary = "";',
'    for (let offset = 0; offset < buffer.length; offset += 0x8000) binary += String.fromCharCode(...buffer.subarray(offset, Math.min(buffer.length, offset + 0x8000)));',
'    return btoa(binary);',
'  }',
'',
'  async function uploadSelectedPhotoFile(file: File) {',
'    const selectedDriver = (data?.drivers ?? []).find((item) => item.id === driverId);',
'    const startResponse = await fetch("/api/photo-upload", {',
'      method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" },',
'      body: JSON.stringify({ action: "start", fileName: file.name || "ticket.jpg", mimeType: file.type || "application/octet-stream", size: file.size }),',
'    });',
'    const started = await startResponse.json().catch(() => ({ ok: false, message: "Resposta inválida do servidor." }));',
'    if (!startResponse.ok) throw new Error(started?.message || "Não foi possível iniciar o upload da foto.");',
'    const uploadId = String(started.uploadId || "");',
'    const chunkSize = 512 * 1024;',
'    for (let index = 0, offset = 0; offset < file.size; index += 1, offset += chunkSize) {',
'      const data = await blobBase64(file.slice(offset, Math.min(file.size, offset + chunkSize)));',
'      const response = await fetch("/api/photo-upload", { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "chunk", uploadId, index, data }) });',
'      const result = await response.json().catch(() => ({ ok: false, message: "Resposta inválida do servidor." }));',
'      if (!response.ok) throw new Error(result?.message || "Falha ao enviar uma parte da foto.");',
'    }',
'    const finishResponse = await fetch("/api/photo-upload", {',
'      method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" },',
'      body: JSON.stringify({ action: "finish", uploadId, driverId, driverName: selectedDriver?.name || null, fleetId, fleetName: fleet?.name || null, freightMode, reportStatus: "aguardando leitura" }),',
'    });',
'    const finished = await finishResponse.json().catch(() => ({ ok: false, message: "Resposta inválida do servidor." }));',
'    if (!finishResponse.ok) throw new Error(finished?.message || "Não foi possível concluir o upload da foto.");',
'    return { id: String(finished.id || ""), imageData: String(finished.imageData || ""), fileName: String(finished.fileName || file.name || "ticket.jpg") };',
'  }',
'',
'  async function linkSelectedPhoto(photoId: string, imageData: string, fileName: string, saved: any, dados: TicketData) {',
'    if (!photoId) return;',
'    const selectedDriver = (data?.drivers ?? []).find((item) => item.id === String(saved?.driverId || driverId));',
'    const selectedFleet = (data?.fleets ?? []).find((item) => item.id === String(saved?.fleetId || fleetId));',
'    const response = await fetch("/api/photo-intake", {',
'      method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" },',
'      body: JSON.stringify({ image: imageData, fileName, photoId, relationType: "report", relationId: String(saved.reportId), tripCode: String(saved.ticket || dados.numero_ticket || "Ticket"), driverId: String(saved?.driverId || driverId), driverName: String(saved?.driverName || selectedDriver?.name || ""), fleetId: String(saved?.fleetId || fleetId), fleetName: String(saved?.fleetName || selectedFleet?.name || ""), freightMode: String(saved?.freightMode || freightMode), netWeight: Number(saved?.tons ?? ((dados.peso_liquido_kg || 0) / 1000)) || null, reportStatus: String(saved?.reportStatus || "pendente") }),',
'    });',
'    const result = await response.json().catch(() => ({ ok: false, message: "Resposta inválida do servidor." }));',
'    if (!response.ok) throw new Error(result?.message || "A viagem foi salva, mas não foi possível vincular a foto.");',
'  }',
'',
'  async function onBatchTicketFiles(files: File[]) {',
'    if (ticketBusy.current || files.length === 0) return;',
'    if (!freightMode) return toast.error("Escolha primeiro o modo da viagem.");',
'    if (!ticketAccess?.authenticated) return toast.error("Entre com seu login para enviar as fotos.");',
'    const selectedFiles = files.slice(0, 100);',
'    const queued = selectedFiles.map((file, index) => ({',
'      id: Date.now().toString(36) + "-" + index + "-" + Math.random().toString(36).slice(2, 8),',
'      file,',
'      fileName: file.name || "foto.jpg",',
'    }));',
'    setBatchPhotos((current) => [',
'      ...current,',
'      ...queued.map((item) => ({ id: item.id, fileName: item.fileName, imageData: "", data: null, error: "", sent: false, status: "queued" as const })),',
'    ].slice(-100));',
'    ticketBusy.current = true;',
'    setTicketReading(true);',
'    setTicketReadError("");',
'    setTicketData(null);',
'    setTicketImage(null);',
'    setTicketFileName("");',
'    setTicketConfirmed(false);',
'    let sent = 0;',
'    let linkedExisting = 0;',
'    let failed = 0;',
'    try {',
'      for (const item of queued) {',
'        setBatchPhotos((current) => current.map((photo) => photo.id === item.id ? { ...photo, status: "reading", error: "" } : photo));',
'        let imageData = "";',
'        let storedPhotoId = "";',
'        try {',
'          setBatchPhotos((current) => current.map((photo) => photo.id === item.id ? { ...photo, status: "uploading", error: "Enviando arquivo ao servidor…" } : photo));',
'          const uploaded = await uploadSelectedPhotoFile(item.file);',
'          imageData = uploaded.imageData;',
'          storedPhotoId = uploaded.id;',
'          setBatchPhotos((current) => current.map((photo) => photo.id === item.id ? { ...photo, status: "saved", error: "Foto salva no banco. Iniciando leitura…" } : photo));',
'          let dados: TicketData | null = null;',
'          for (let attempt = 0; attempt < 6; attempt += 1) {',
'            try {',
'              setBatchPhotos((current) => current.map((photo) => photo.id === item.id ? { ...photo, status: "reading", error: "" } : photo));',
'              dados = await lerTicket(imageData, freightMode, fleet ? { tractorPlate: fleet.tractorPlate, trailerPlate: fleet.trailerPlate } : undefined, item.fileName);',
'              break;',
'            } catch (readError) {',
'              const message = readError instanceof Error ? readError.message : "";',
'              if (message.includes("Muitas leituras") && attempt < 5) {',
'                setBatchPhotos((current) => current.map((photo) => photo.id === item.id ? { ...photo, status: "queued", error: "Aguardando um minuto para continuar a leitura…" } : photo));',
'                await new Promise((resolve) => setTimeout(resolve, 61_000));',
'                setBatchPhotos((current) => current.map((photo) => photo.id === item.id ? { ...photo, status: "reading", error: "" } : photo));',
'                continue;',
'              }',
'              throw readError;',
'            }',
'          }',
'          if (!dados) throw new Error("Não foi possível concluir a leitura desta foto.");',
'          if (freightMode !== "cegonha" && freightMode !== "caixinha" && !dados.numero_ticket?.trim()) throw new Error("Número do ticket não identificado.");',
'          if (freightMode === "ton" && !(dados.peso_liquido_kg != null && dados.peso_liquido_kg > 0)) throw new Error("Peso líquido não identificado.");',
'          setBatchPhotos((current) => current.map((photo) => photo.id === item.id ? { ...photo, imageData, data: dados, status: "sending", error: "" } : photo));',
'          const saved = await salvarTicket({',
'            ...dados,',
'            conferido: true,',
'            driverId,',
'            fleetId,',
'            freightMode,',
'            dailyValue: 0,',
'            km_carreta: Number.parseInt(kmCarreta.replace(/\\D/g, ""), 10) || 0,',
'          });',
'          await linkSelectedPhoto(storedPhotoId, imageData, item.fileName, saved, dados);',
'          sent += 1;',
'          if (saved?.linkedExisting) linkedExisting += 1;',
'          setBatchPhotos((current) => current.map((photo) => photo.id === item.id ? { ...photo, imageData: "", data: dados, sent: true, status: saved?.linkedExisting ? "linked" : "sent", error: "" } : photo));',
'        } catch (error) {',
'          failed += 1;',
'          const rawMessage = error instanceof Error ? error.message : "Não foi possível processar esta foto.";',
'          const message = storedPhotoId ? rawMessage + " A foto permaneceu salva no banco aguardando vínculo." : rawMessage;',
'          setBatchPhotos((current) => current.map((photo) => photo.id === item.id ? { ...photo, imageData: "", sent: false, status: "error", error: message } : photo));',
'        }',
'      }',
'      await queryClient.invalidateQueries({ queryKey: fleetKey });',
'      if (failed === 0 && linkedExisting === 0) toast.success(sent + (sent === 1 ? " viagem enviada automaticamente ao Caixa." : " viagens enviadas automaticamente ao Caixa."));',
'      else if (failed === 0) toast.success((sent - linkedExisting) + " nova(s) viagem(ns) e " + linkedExisting + " foto(s) vinculada(s) a lançamento(s) já existente(s).");',
'      else toast.warning((sent - linkedExisting) + " nova(s), " + linkedExisting + " vinculada(s) e " + failed + " foto(s) com erro. Confira a lista.");',
'    } finally {',
'      ticketBusy.current = false;',
'      setTicketReading(false);',
'    }',
'  }',
'  async function onDriverZipFile(file: File) {',
'    if (ticketBusy.current) return;',
'    if (!freightMode) return toast.error("Escolha primeiro o modo da viagem.");',
'    if (!ticketAccess?.authenticated) return toast.error("Entre com seu login para enviar o ZIP.");',
'    if (!ticketAccess.available) return toast.error("O envio de documentos não está disponível para este login.");',
'    if (file.size > 80_000_000) return toast.error("O ZIP deve ter no máximo 80 MB.");',
'    try {',
'      const JSZipModule: any = await import("jszip");',
'      const JSZip = JSZipModule.default ?? JSZipModule;',
'      const zip = await JSZip.loadAsync(await file.arrayBuffer());',
'      const images: File[] = [];',
'      let ignored = 0;',
'      for (const entry of Object.values(zip.files) as any[]) {',
'        if (images.length >= 100) break;',
'        const entryName = String(entry?.name || "");',
'        if (!entryName || entry.dir || entryName.startsWith("__MACOSX/") || /(?:^|\\/)\./.test(entryName)) continue;',
'        if (!/\.(?:jpe?g|png|webp)$/i.test(entryName)) { ignored += 1; continue; }',
'        const bytes: Uint8Array = await entry.async("uint8array");',
'        if (!bytes.byteLength || bytes.byteLength > 10_000_000) { ignored += 1; continue; }',
'        const cleanName = entryName.replace(/^.*[\\\\/]/, "") || ("ticket-" + (images.length + 1) + ".jpg");',
'        const copy = new Uint8Array(bytes.length); copy.set(bytes);',
'        const mime = /\.png$/i.test(cleanName) ? "image/png" : /\.webp$/i.test(cleanName) ? "image/webp" : "image/jpeg";',
'        images.push(new File([copy.buffer], cleanName, { type: mime }));',
'      }',
'      if (!images.length) throw new Error("Não encontrei fotos JPG, JPEG, PNG ou WebP dentro do ZIP.");',
'      if (ignored > 0) toast.info(ignored + " arquivo(s) não compatível(is) do ZIP foram ignorados.");',
'      await onBatchTicketFiles(images);',
'    } catch (error) {',
'      toast.error(error instanceof Error ? error.message : "Não foi possível abrir o ZIP.");',
'    }',
'  }',
'',
].join("\n");
s = s.slice(0, fnStart) + fn + s.slice(fnEnd);

must(
  '    if (batchMode && batchPhotos.length === 0 && (!Number.isInteger(tripCountN) || tripCountN < 1 || tripCountN > 100)) {\n      return toast.error("Selecione uma ou mais fotos, ou informe uma quantidade entre 1 e 100.");\n    }\n    if (ticketBusy.current) return;\n    if (!batchMode && ticketFileName && !ticketData) return toast.error("A foto foi selecionada, mas não foi lida. Tente ler novamente ou remova a foto para lançar manualmente.");\n    if (!batchMode && ticketData && !ticketImage) return toast.error("A foto foi lida, mas não ficou pronta para arquivamento. Selecione a foto novamente.");\n    if (!batchMode && ticketData && !ticketConfirmed) return toast.error("Confirme a conferência dos dados do ticket.");',
  '    if (batchMode && batchPhotos.length === 0 && (!Number.isInteger(tripCountN) || tripCountN < 1 || tripCountN > 100)) {\n' +
    '      return toast.error("Selecione uma ou mais fotos, ou informe uma quantidade entre 1 e 100.");\n' +
    '    }\n' +
    '    if (batchPhotos.length > 0) {\n' +
    '      const pendingBatch = batchPhotos.filter((photo) => !photo.sent);\n' +
    '      if (pendingBatch.length > 0) return toast.error("Ainda há fotos processando ou com erro. Confira a lista.");\n' +
    '      return toast.info("As fotos selecionadas já foram enviadas automaticamente ao Caixa.");\n' +
    '    }\n' +
    '    if (ticketBusy.current) return;\n' +
    '    if (batchPhotos.length === 0 && !batchMode && ticketFileName && !ticketData) return toast.error("A foto foi selecionada, mas não foi lida. Tente ler novamente ou remova a foto para lançar manualmente.");\n' +
    '    if (batchPhotos.length === 0 && !batchMode && ticketData && !ticketImage) return toast.error("A foto foi lida, mas não ficou pronta para arquivamento. Selecione a foto novamente.");\n' +
    '    if (batchPhotos.length === 0 && !batchMode && ticketData && !ticketConfirmed) return toast.error("Confirme a conferência dos dados do ticket.");',
  "validation",
);

const branchStart = s.indexOf('      const count = batchMode ? (batchPhotos.length || tripCountN) : 1;');
const branchEnd = s.indexOf('      } else if (ticketData) {', branchStart);
if (branchStart < 0 || branchEnd < 0) throw new Error("batch-photo-driver: submit branch missing");

const submitBatch = [
'      const count = batchPhotos.length > 0 ? batchPhotos.length : (batchMode ? tripCountN : 1);',
'      let firstTicket = "";',
'      let sentCount = count;',
'      let failedBatch: typeof batchPhotos = [];',
'',
'      if (batchPhotos.length > 0) {',
'        sentCount = 0;',
'        for (const photo of batchPhotos.filter((item) => !item.sent)) {',
'          if (!photo.data) { failedBatch.push(photo); continue; }',
'          try {',
'            const saved = await salvarTicket({',
'              ...photo.data,',
'              conferido: true,',
'              driverId,',
'              fleetId,',
'              freightMode,',
'              dailyValue: freightMode === "trip" ? (dailyValueN ?? 0) : 0,',
'              km_carreta: Number.parseInt(kmCarreta.replace(/\\D/g, ""), 10) || 0,',
'              imagem: photo.imageData,',
'              fileName: photo.fileName,',
'            });',
'            if (!firstTicket) firstTicket = saved.ticket;',
'            sentCount += 1;',
'          } catch (error) {',
'            failedBatch.push({ ...photo, error: error instanceof Error ? error.message : "Não foi possível salvar esta viagem." });',
'          }',
'        }',
'        if (sentCount === 0) throw new Error(failedBatch[0]?.error || "Nenhuma viagem foi salva.");',
'      } else if (ticketData) {',
].join("\n");
s = s.slice(0, branchStart) + submitBatch + s.slice(branchEnd + '      } else if (ticketData) {'.length);

must(
  '      setBatchPhotos([]);\n      await queryClient.invalidateQueries({ queryKey: fleetKey });',
  '      setBatchPhotos(failedBatch);\n      await queryClient.invalidateQueries({ queryKey: fleetKey });',
  "retain failed",
);

must(
  '      toast.success(batchMode\n        ? sentCount + (sentCount === 1 ? " viagem enviada ao Caixa da Gerência." : " viagens enviadas ao Caixa da Gerência.")\n        : sentCount > 1\n          ? sentCount + " viagens enviadas ao Caixa da Gerência."\n          : "Ticket " + firstTicket + " enviado ao Caixa da Gerência.");',
  '      toast.success(sentCount + (sentCount === 1 ? " viagem enviada ao Caixa da Gerência." : " viagens enviadas ao Caixa da Gerência."));\n' +
    '      if (failedBatch.length) toast.warning(failedBatch.length + " foto(s) ficaram na lista porque não puderam ser salvas.");',
  "message",
);

must(
  '                      multiple={!option.camera && (freightMode === "cegonha" || freightMode === "caixinha")}\n                      disabled={ticketReading || ticketSending || !freightMode || !ticketAccess?.authenticated || !ticketAccess.available}\n                      onChange={event => { const files = Array.from(event.currentTarget.files ?? []); event.currentTarget.value = ""; if (!files.length) return; if (freightMode === "cegonha" || freightMode === "caixinha") void onFixedModeFiles(files); else void onTicketFile(files[0]); }} />',
  '                      multiple={!option.camera}\n' +
    '                      disabled={ticketReading || ticketSending || !freightMode || !ticketAccess?.authenticated || !ticketAccess.available}\n' +
    '                      onChange={event => { const files = Array.from(event.currentTarget.files ?? []); event.currentTarget.value = ""; if (files.length) void onBatchTicketFiles(files); }} />',
  "input",
);

const statusStart = s.indexOf('              {(freightMode === "cegonha" || freightMode === "caixinha") && batchPhotos.length > 0 ? (');
const statusEndMarker = '              {!(freightMode === "cegonha" || freightMode === "caixinha") && ticketFileName ? (';
const statusEnd = s.indexOf(statusEndMarker, statusStart);
if (statusStart < 0 || statusEnd < 0) throw new Error("batch-photo-driver: status block missing");

const batchUi = [
'              {batchPhotos.length > 0 ? (',
'                <div className="grid gap-2 rounded-lg border border-ok/30 bg-ok/10 p-3 text-sm">',
'                  <p className="font-semibold">{batchPhotos.length} foto{batchPhotos.length === 1 ? "" : "s"} selecionada{batchPhotos.length === 1 ? "" : "s"}</p>',
'                  <p className="text-xs text-muted">Cada foto é salva primeiro no banco. Depois o ChatGPT lê, cria ou encontra a viagem e vincula a imagem ao lançamento.</p>',
'                  <div className="max-h-48 space-y-2 overflow-auto">',
'                    {batchPhotos.map((photo, index) => (',
'                      <div key={index} className="rounded-md border border-border/70 bg-bg/70 p-2 text-xs">',
'                        <p className="truncate font-medium">{index + 1}. {photo.fileName}</p>',
'                        <p className="mt-1 text-[11px] font-semibold text-muted">{photo.status === "queued" ? "Na fila" : photo.status === "uploading" ? "Salvando foto no banco…" : photo.status === "saved" ? "Foto salva no banco" : photo.status === "reading" ? "Lendo com ChatGPT…" : photo.status === "sending" ? "Enviando ao Caixa…" : photo.status === "linked" ? "Vinculada ao lançamento existente" : photo.status === "sent" ? "Enviada ao Caixa" : "Erro"}</p>',
'                        {photo.error ? <p className="mt-1 text-danger">{photo.error}</p> : photo.data ? (',
'                          <p className="mt-1 text-muted">',
'                            Ticket {photo.data.numero_ticket || "—"}',
'                            {freightMode === "ton" ? " · " + (photo.data.peso_liquido_kg ? new Intl.NumberFormat("pt-BR").format(photo.data.peso_liquido_kg) + " kg" : "peso não identificado") : ""}',
'                            {photo.data.placa_veiculo ? " · " + photo.data.placa_veiculo : ""}',
'                          </p>',
'                        ) : null}',
'                        <Button type="button" size="sm" variant="ghost" className="mt-1" onClick={() => setBatchPhotos((current) => current.filter((_, itemIndex) => itemIndex !== index))}>Remover esta foto</Button>',
'                      </div>',
'                    ))}',
'                  </div>',
'                  <Button type="button" variant="ghost" disabled={ticketReading} onClick={() => setBatchPhotos([])}>Limpar lista</Button>',
'                </div>',
'              ) : null}',
'',
].join("\n");
s = s.slice(0, statusStart) + batchUi + s.slice(statusEnd);

must(
  '              </div>\n              {batchPhotos.length > 0 ? (',
  '                <label className="relative flex min-h-28 cursor-pointer flex-col items-center justify-center overflow-hidden rounded-xl border border-dashed border-border bg-bg px-3 py-4 text-center">\n' +
    '                  {ticketReading ? <LoaderCircle className="size-6 animate-spin text-accent" /> : <Archive className="size-6 text-accent" />}\n' +
    '                  <strong className="mt-2 text-sm">{ticketReading ? "Processando…" : "Enviar ZIP"}</strong>\n' +
    '                  <span className="mt-1 text-[11px] text-muted">Até 100 fotos de tickets</span>\n' +
    '                  <input className="absolute inset-0 h-full w-full cursor-pointer opacity-0" type="file" aria-label="Enviar ZIP de tickets" accept="application/zip,application/x-zip-compressed,.zip"\n' +
    '                    disabled={ticketReading || ticketSending || !freightMode || !ticketAccess?.authenticated || !ticketAccess.available}\n' +
    '                    onChange={event => { const file = event.currentTarget.files?.[0]; event.currentTarget.value = ""; if (file) void onDriverZipFile(file); }} />\n' +
    '                </label>\n' +
    '              </div>\n' +
    '              {batchPhotos.length > 0 ? (',
  "zip launcher",
);

s = s.replace(
  'Selecione uma ou várias fotos. Cada foto será um lançamento novo. Nenhum número de ticket nem dado da foto é exigido.',
  'Selecione uma ou várias fotos. Cada foto é processada em fila e enviada automaticamente como um lançamento novo no Caixa.',
);
s = s.replace(
  'O OCR lê número do ticket, peso líquido, placas, transportadora, operadora, destinatário, data e horário quando estiverem no ticket.',
  'Selecione uma ou várias fotos. O ChatGPT lê cada uma e envia automaticamente cada ticket válido ao Caixa da Gerência.',
);
s = s.replace(
  'Neste modo o OCR lê número do ticket, placas, transportadora, destinatário, data e horário; pesos e pesagens são ignorados.',
  'Selecione uma ou várias fotos. O ChatGPT lê os dados de cada documento; pesos são ignorados neste modo.',
);

fs.writeFileSync(p, s);
console.log("[batch-photo-driver] all modes now support multi-photo ChatGPT extraction");
