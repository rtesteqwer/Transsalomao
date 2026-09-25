import fs from "node:fs";
import path from "node:path";

const target = process.argv[2];
if (!target || !fs.existsSync(target)) throw new Error("fixed-photo-batch: target missing");

function file(rel) { return path.join(target, rel); }
function must(source, before, after, label) {
  if (!source.includes(before)) throw new Error("fixed-photo-batch: pattern not found (" + label + ")");
  return source.replace(before, after);
}
function patch(rel, fn) {
  const p = file(rel);
  let source = fs.readFileSync(p, "utf8");
  const next = fn(source);
  if (next === source) throw new Error("fixed-photo-batch: no changes (" + rel + ")");
  fs.writeFileSync(p, next);
}

// 1) Cegonha/Caixinha: ticket e conferência não são obrigatórios.
// O servidor gera apenas um identificador interno para relacionar foto/report, nunca exigido do motorista.
patch("src/lib/ticket-core.ts", (s) => {
  s = must(
    s,
    'export function validateSave(body: Record<string, unknown>) {\n  if (body.conferido !== true) throw new TicketError(400, "Confirme a conferência do ticket antes de lançar.");\n  const freightMode = normalizeFreightMode(body.freightMode);\n  const normalized = normalizeTicket(body);\n  const ticket = ticketForMode(normalized, freightMode);\n  const numero = ticket.numero_ticket?.trim().toUpperCase();\n  if (!numero || numero.length > 80 || /[\\x00-\\x1f]/.test(numero)) throw new TicketError(400, "Confira o número do ticket (até 80 caracteres).");',
    'export function validateSave(body: Record<string, unknown>) {\n  const freightMode = normalizeFreightMode(body.freightMode);\n  const fixedPhotoMode = freightMode === "cegonha" || freightMode === "caixinha";\n  if (!fixedPhotoMode && body.conferido !== true) throw new TicketError(400, "Confirme a conferência do ticket antes de lançar.");\n  const normalized = normalizeTicket(body);\n  const ticket = ticketForMode(normalized, freightMode);\n  let numero = ticket.numero_ticket?.trim().toUpperCase() || "";\n  if (fixedPhotoMode && !numero) {\n    const prefix = freightMode === "cegonha" ? "CEG" : "CX";\n    numero = prefix + "-" + Date.now().toString(36).toUpperCase() + "-" + crypto.randomUUID().slice(0, 6).toUpperCase();\n  }\n  if (!numero || numero.length > 80 || /[\\x00-\\x1f]/.test(numero)) throw new TicketError(400, "Confira o número do ticket (até 80 caracteres).");',
    "special validation",
  );
  return s;
});

// 2) Motorista: Cegonha/Caixinha aceitam várias fotos; cada foto vira um lançamento novo.
// Não passam por OCR e não exigem número, placa, empresa, peso ou conferência.
patch("src/routes/motorista.tsx", (s) => {
  s = must(
    s,
    'async function salvarTicket(dados: TicketData & {',
    'async function salvarTicket(dados: Partial<TicketData> & {',
    "partial ticket save",
  );

  s = must(
    s,
    '  const [ticketReadError, setTicketReadError] = useState("");',
    '  const [ticketReadError, setTicketReadError] = useState("");\n  const [batchPhotos, setBatchPhotos] = useState<Array<{ fileName: string; imageData: string }>>([]);',
    "batch photos state",
  );

  const readEnd = '  async function onSubmit(e: React.FormEvent) {';
  const batchReader = `  async function onFixedModeFiles(files: File[]) {
    if (ticketBusy.current || files.length === 0) return;
    if (!(freightMode === "cegonha" || freightMode === "caixinha")) return;
    if (!ticketAccess?.authenticated) return toast.error("Entre com seu login para enviar as fotos.");
    ticketBusy.current = true;
    setTicketReading(true);
    setTicketReadError("");
    try {
      const prepared: Array<{ fileName: string; imageData: string }> = [];
      for (const file of files.slice(0, 100)) {
        prepared.push({ fileName: file.name || "foto.jpg", imageData: await ticketImageToDataUrl(file) });
      }
      setBatchPhotos((current) => [...current, ...prepared].slice(0, 100));
      setTicketData(null);
      setTicketImage(null);
      setTicketFileName("");
      setTicketConfirmed(false);
      toast.success(prepared.length + (prepared.length === 1 ? " foto adicionada. Ela será 1 novo lançamento." : " fotos adicionadas. Cada foto será 1 novo lançamento."));
    } catch (error) {
      const message = error instanceof Error ? error.message : "Não foi possível preparar as fotos.";
      setTicketReadError(message);
      toast.error(message);
    } finally {
      ticketBusy.current = false;
      setTicketReading(false);
    }
  }

`;
  if (!s.includes(readEnd)) throw new Error("fixed-photo-batch: submit marker missing");
  s = s.replace(readEnd, batchReader + readEnd);

  s = must(
    s,
    '    if (batchMode && (!Number.isInteger(tripCountN) || tripCountN < 1 || tripCountN > 100)) {\n      return toast.error("Informe uma quantidade de viagens entre 1 e 100.");\n    }\n    if (ticketBusy.current) return;\n    if (ticketFileName && !ticketData) return toast.error("A foto foi selecionada, mas não foi lida. Tente ler novamente ou remova a foto para lançar manualmente.");\n    if (ticketData && !ticketImage) return toast.error("A foto foi lida, mas não ficou pronta para arquivamento. Selecione a foto novamente.");\n    if (ticketData && !ticketConfirmed) return toast.error("Confirme a conferência dos dados do ticket.");',
    '    if (batchMode && batchPhotos.length === 0 && (!Number.isInteger(tripCountN) || tripCountN < 1 || tripCountN > 100)) {\n      return toast.error("Selecione uma ou mais fotos, ou informe uma quantidade entre 1 e 100.");\n    }\n    if (ticketBusy.current) return;\n    if (!batchMode && ticketFileName && !ticketData) return toast.error("A foto foi selecionada, mas não foi lida. Tente ler novamente ou remova a foto para lançar manualmente.");\n    if (!batchMode && ticketData && !ticketImage) return toast.error("A foto foi lida, mas não ficou pronta para arquivamento. Selecione a foto novamente.");\n    if (!batchMode && ticketData && !ticketConfirmed) return toast.error("Confirme a conferência dos dados do ticket.");',
    "submit validations",
  );

  s = must(
    s,
    '      const count = batchMode ? tripCountN : 1;\n      let firstTicket = "";\n      let sentCount = count;\n\n      if (ticketData) {',
    '      const count = batchMode ? (batchPhotos.length || tripCountN) : 1;\n      let firstTicket = "";\n      let sentCount = count;\n\n      if (batchMode && batchPhotos.length > 0) {\n        for (const photo of batchPhotos) {\n          const saved = await salvarTicket({\n            conferido: true,\n            driverId,\n            fleetId,\n            freightMode,\n            dailyValue: 0,\n            km_carreta: 0,\n            imagem: photo.imageData,\n            fileName: photo.fileName,\n          });\n          if (!firstTicket) firstTicket = saved.ticket;\n        }\n        sentCount = batchPhotos.length;\n      } else if (ticketData) {',
    "special photo saves",
  );

  s = must(
    s,
    '      setTicketConfirmed(false);\n      await queryClient.invalidateQueries({ queryKey: fleetKey });\n      setTicketFileName("");',
    '      setTicketConfirmed(false);\n      setBatchPhotos([]);\n      await queryClient.invalidateQueries({ queryKey: fleetKey });\n      setTicketFileName("");',
    "clear batch photos",
  );

  s = must(
    s,
    '      toast.success(sentCount > 1\n        ? sentCount + " viagens enviadas ao Caixa da Gerência."\n        : "Ticket " + firstTicket + " enviado ao Caixa da Gerência.");',
    '      toast.success(batchMode\n        ? sentCount + (sentCount === 1 ? " viagem enviada ao Caixa da Gerência." : " viagens enviadas ao Caixa da Gerência.")\n        : sentCount > 1\n          ? sentCount + " viagens enviadas ao Caixa da Gerência."\n          : "Ticket " + firstTicket + " enviado ao Caixa da Gerência.");',
    "success copy",
  );

  s = must(
    s,
    '                Ticket {sentTicket} depositado',
    '                {freightMode === "cegonha" || freightMode === "caixinha" ? sentTicket : "Ticket " + sentTicket} depositado',
    "success card label",
  );

  s = must(
    s,
    '                    setFreightMode(mode);\n                    try { localStorage.setItem(MODE_KEY, mode); } catch {}',
    '                    setFreightMode(mode);\n                    setTicketData(null); setTicketImage(null); setTicketFileName(""); setTicketConfirmed(false); setTicketReadError(""); setBatchPhotos([]);\n                    try { localStorage.setItem(MODE_KEY, mode); } catch {}',
    "mode reset",
  );

  s = must(
    s,
    '                  {freightMode === "ton"\n                    ? "O OCR lê número do ticket, peso líquido, placas, transportadora, operadora, destinatário, data e horário quando estiverem no ticket."\n                    : "Neste modo o OCR lê número do ticket, placas, transportadora, destinatário, data e horário; pesos e pesagens são ignorados."}',
    '                  {freightMode === "ton"\n                    ? "O OCR lê número do ticket, peso líquido, placas, transportadora, operadora, destinatário, data e horário quando estiverem no ticket."\n                    : freightMode === "cegonha" || freightMode === "caixinha"\n                      ? "Selecione uma ou várias fotos. Cada foto será um lançamento novo. Nenhum número de ticket nem dado da foto é exigido."\n                      : "Neste modo o OCR lê número do ticket, placas, transportadora, destinatário, data e horário; pesos e pesagens são ignorados."}',
    "photo instructions",
  );

  s = must(
    s,
    '<input className="absolute inset-0 h-full w-full cursor-pointer opacity-0" type="file" aria-label={option.label} accept="image/*" capture={option.camera ? "environment" : undefined}\n                      disabled={ticketReading || ticketSending || !freightMode || !ticketAccess?.authenticated || !ticketAccess.available}\n                      onChange={event => { const file = event.currentTarget.files?.[0]; event.currentTarget.value = ""; if (file) void onTicketFile(file); }} />',
    '<input className="absolute inset-0 h-full w-full cursor-pointer opacity-0" type="file" aria-label={option.label} accept="image/*" capture={option.camera ? "environment" : undefined}\n                      multiple={!option.camera && (freightMode === "cegonha" || freightMode === "caixinha")}\n                      disabled={ticketReading || ticketSending || !freightMode || !ticketAccess?.authenticated || !ticketAccess.available}\n                      onChange={event => { const files = Array.from(event.currentTarget.files ?? []); event.currentTarget.value = ""; if (!files.length) return; if (freightMode === "cegonha" || freightMode === "caixinha") void onFixedModeFiles(files); else void onTicketFile(files[0]); }} />',
    "multi photo input",
  );

  const batchStatusMarker = '              {ticketFileName ? (';
  const batchStatus = `              {(freightMode === "cegonha" || freightMode === "caixinha") && batchPhotos.length > 0 ? (
                <div className="grid gap-2 rounded-lg border border-ok/30 bg-ok/10 p-3 text-sm">
                  <p className="font-semibold">{batchPhotos.length} foto{batchPhotos.length === 1 ? "" : "s"} = {batchPhotos.length} viagem{batchPhotos.length === 1 ? "" : "ns"} de {freightModeLabel(freightMode)}</p>
                  <p className="text-xs text-muted">Cada foto será arquivada em um lançamento separado. Nenhum dado do ticket precisa ser preenchido.</p>
                  <div className="max-h-28 overflow-auto text-xs text-muted">
                    {batchPhotos.map((photo, index) => <p key={index} className="truncate">{index + 1}. {photo.fileName}</p>)}
                  </div>
                  <Button type="button" variant="ghost" onClick={() => setBatchPhotos([])}>Remover todas as fotos</Button>
                </div>
              ) : null}
`;
  if (!s.includes(batchStatusMarker)) throw new Error("fixed-photo-batch: batch status marker missing");
  s = s.replace(batchStatusMarker, batchStatus + batchStatusMarker);

  s = must(
    s,
    '              {ticketFileName ? (',
    '              {!(freightMode === "cegonha" || freightMode === "caixinha") && ticketFileName ? (',
    "hide single photo status special",
  );
  s = must(
    s,
    '              {ticketFileName && !ticketData && !ticketReading ? (',
    '              {!(freightMode === "cegonha" || freightMode === "caixinha") && ticketFileName && !ticketData && !ticketReading ? (',
    "hide read error special",
  );
  s = must(
    s,
    '              {ticketData ? (',
    '              {!(freightMode === "cegonha" || freightMode === "caixinha") && ticketData ? (',
    "hide ticket form special",
  );

  s = must(
    s,
    '          {freightMode === "cegonha" || freightMode === "caixinha" ? (\n            <Field label="Quantidade de viagens" hint="Lançadas ao mesmo tempo">',
    '          {freightMode === "cegonha" || freightMode === "caixinha" ? (\n            batchPhotos.length > 0 ? (\n              <div className="rounded-xl border border-border bg-surface px-4 py-3 text-sm">\n                <strong>{batchPhotos.length} viagem{batchPhotos.length === 1 ? "" : "ns"} pronta{batchPhotos.length === 1 ? "" : "s"} para lançar</strong>\n                <p className="mt-1 text-xs text-muted">A quantidade é definida automaticamente pelas fotos selecionadas.</p>\n              </div>\n            ) : (\n            <Field label="Quantidade de viagens" hint="Opcional se você selecionar fotos">',
    "special quantity branch",
  );
  s = must(
    s,
    '              <p className="mt-2 text-xs text-muted">Cada quantidade gera um lançamento separado no Painel Gerência.</p>\n            </Field>\n          ) : freightMode === "trip" ? (',
    '              <p className="mt-2 text-xs text-muted">Sem fotos, cada quantidade gera um lançamento separado no Painel Gerência.</p>\n            </Field>\n            )\n          ) : freightMode === "trip" ? (',
    "close special quantity branch",
  );

  return s;
});

// 3) Caixa: uma linha por modalidade fixa para cada motorista/conjunto.
// Cegonha nunca se mistura com Caixinha. Ações do grupo trabalham sobre todos os lançamentos da linha.
patch("src/routes/dono/lancamentos.tsx", (s) => {
  s = must(
    s,
    '  const done = [...(data?.reports.filter((r) => r.status !== "pendente") ?? [])].sort(byFreightMode);\n  const selectedPending = pending.filter((r) => selected.has(r.id));',
    '  const done = [...(data?.reports.filter((r) => r.status !== "pendente") ?? [])].sort(byFreightMode);\n  const pendingRows = (() => {\n    const groups = new Map<string, DriverReport[]>();\n    const rows: Array<{ key: string; reports: DriverReport[]; special: boolean }> = [];\n    for (const report of pending) {\n      const special = report.freightMode === "cegonha" || report.freightMode === "caixinha";\n      if (!special) { rows.push({ key: report.id, reports: [report], special: false }); continue; }\n      const key = String(report.driverId) + "|" + String(report.fleetId) + "|" + String(report.freightMode);\n      const list = groups.get(key) ?? []; list.push(report); groups.set(key, list);\n    }\n    for (const [key, reports] of groups) rows.push({ key: "group|" + key, reports, special: true });\n    return rows.sort((a, b) => byFreightMode(a.reports[0], b.reports[0]));\n  })();\n  const selectedPending = pending.filter((r) => selected.has(r.id));',
    "pending rows",
  );

  s = must(
    s,
    '  function toggleAll() {',
    '  function toggleGroup(ids: string[]) {\n    setSelected((current) => {\n      const next = new Set(current);\n      const all = ids.every((id) => next.has(id));\n      ids.forEach((id) => all ? next.delete(id) : next.add(id));\n      return next;\n    });\n  }\n\n  async function acceptGroup(reports: DriverReport[]) {\n    try {\n      const result = await acceptMany.mutateAsync(reports.map((r) => r.id));\n      setSelected((current) => { const next = new Set(current); reports.forEach((r) => next.delete(r.id)); return next; });\n      toast.success(String(result.accepted ?? 0) + " viagem(ns) do grupo aceita(s).");\n    } catch (err) { toast.error(err instanceof Error ? err.message : "Não foi possível aceitar o grupo."); }\n  }\n\n  async function rejectGroup(reports: DriverReport[]) {\n    try {\n      for (const report of reports) await reject.mutateAsync(report.id);\n      toast.success(reports.length + " lançamento(ns) recusado(s).");\n    } catch (err) { toast.error(err instanceof Error ? err.message : "Não foi possível recusar o grupo."); }\n  }\n\n  async function deleteGroup(reports: DriverReport[]) {\n    if (!window.confirm("Excluir todos os " + reports.length + " lançamentos deste grupo?")) return;\n    try {\n      for (const report of reports) await removeReport.mutateAsync(report.id);\n      toast.success(reports.length + " lançamento(ns) excluído(s).");\n    } catch (err) { toast.error(err instanceof Error ? err.message : "Não foi possível excluir o grupo."); }\n  }\n\n  function toggleAll() {',
    "group actions",
  );

  s = must(
    s,
    '            {pending.map((r) => {\n              const driver = data?.drivers.find((d) => d.id === r.driverId);\n              const fleet = data?.fleets.find((f) => f.id === r.fleetId);',
    '            {pendingRows.map((entry) => {\n              const r = entry.reports[0];\n              const groupReports = entry.reports;\n              const groupIds = groupReports.map((item) => item.id);\n              const groupSelected = groupIds.every((id) => selected.has(id));\n              const driver = data?.drivers.find((d) => d.id === r.driverId);\n              const fleet = data?.fleets.find((f) => f.id === r.fleetId);',
    "map grouped rows",
  );

  s = must(s, '                  key={r.id}', '                  key={entry.key}', "group key");
  s = must(
    s,
    '                    selected.has(r.id) ? "border-foreground/40 ring-1 ring-foreground/20" : "border-border"',
    '                    (entry.special ? groupSelected : selected.has(r.id)) ? "border-foreground/40 ring-1 ring-foreground/20" : "border-border"',
    "group selected card",
  );
  s = must(
    s,
    '                        checked={selected.has(r.id)}\n                        onChange={() => toggleSelected(r.id)}',
    '                        checked={entry.special ? groupSelected : selected.has(r.id)}\n                        onChange={() => entry.special ? toggleGroup(groupIds) : toggleSelected(r.id)}',
    "group checkbox",
  );
  s = must(
    s,
    '                        aria-label={\`Selecionar viagem \${r.ticket}\`}',
    '                        aria-label={entry.special ? "Selecionar grupo " + freightModeLabel(r.freightMode!) : "Selecionar viagem " + r.ticket}',
    "group aria",
  );
  s = must(
    s,
    '                        {r.ticket}',
    '                        {entry.special ? freightModeLabel(r.freightMode!) + " · " + groupReports.length + (groupReports.length === 1 ? " viagem" : " viagens") : r.ticket}',
    "group title",
  );
  s = must(
    s,
    '                        {r.freightMode === "trip" ? new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(r.dailyValue || 0) : r.freightMode === "cegonha" || r.freightMode === "caixinha" ? "1 viagem" : \`${new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 3, maximumFractionDigits: 3 }).format(Number(r.tons ?? 0))} t\`}',
    '                        {r.freightMode === "trip" ? new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(r.dailyValue || 0) : r.freightMode === "cegonha" || r.freightMode === "caixinha" ? groupReports.length + (groupReports.length === 1 ? " viagem" : " viagens") : \`${new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 3, maximumFractionDigits: 3 }).format(Number(r.tons ?? 0))} t\`}',
    "group count",
  );
  s = must(
    s,
    '                  <TicketMetadata reportId={r.id} mode={r.freightMode} />\n                <div className="mt-4 flex flex-wrap gap-2">',
    '                  {!entry.special ? <TicketMetadata reportId={r.id} mode={r.freightMode} /> : null}\n                {entry.special ? (\n                  <div className="mt-4 flex flex-wrap gap-2">\n                    <Button onClick={() => void acceptGroup(groupReports)} disabled={acceptMany.isPending}>Aceitar grupo ({groupReports.length})</Button>\n                    <Button variant="ghost" onClick={() => void rejectGroup(groupReports)}>Recusar grupo</Button>\n                    <Button variant="ghost" className="text-danger" onClick={() => void deleteGroup(groupReports)}>Excluir grupo</Button>\n                  </div>\n                ) : (\n                <div className="mt-4 flex flex-wrap gap-2">',
    "group actions branch open",
  );
  s = must(
    s,
    '                  </div>\n                </li>\n              );',
    '                  </div>\n                )}\n                </li>\n              );',
    "group actions branch close",
  );

  return s;
});

console.log("[fixed-photo-batch] Cegonha/Caixinha: no ticket data required, multi-photo = one launch each, grouped in Caixa by mode");
