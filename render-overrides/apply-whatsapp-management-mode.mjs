import fs from 'node:fs';
import path from 'node:path';

const target = process.argv[2];
if (!target || !fs.existsSync(target)) throw new Error('whatsapp-management-mode: target missing');

const rel = 'src/routes/dono/lancamentos.tsx';
const p = path.join(target, rel);
let s = fs.readFileSync(p, 'utf8');

function mustReplace(search, replacement, label) {
  if (s.includes(replacement)) return;
  if (!s.includes(search)) throw new Error('whatsapp-management-mode: pattern not found (' + label + ')');
  s = s.replace(search, replacement);
}

mustReplace(
  '  const [editingReport, setEditingReport] = useState<DriverReport | null>(null);',
  '  const [editingReport, setEditingReport] = useState<DriverReport | null>(null);\n  const [editingForClose, setEditingForClose] = useState(false);',
  'close mode state',
);

mustReplace(
  '                    <Button onClick={() => setOpen(r)}>Fechar viagem</Button>',
  '                    <Button onClick={() => {\n                      if (r.freightMode) setOpen(r);\n                      else { setEditingForClose(true); setEditingReport(r); }\n                    }}>{r.freightMode ? "Fechar viagem" : "Definir tipo e fechar"}</Button>',
  'close button requires management mode',
);

mustReplace(
  '<Button variant="secondary" onClick={() => setEditingReport(r)} title={`Editar ${r.ticket}`}>',
  '<Button variant="secondary" onClick={() => { setEditingForClose(false); setEditingReport(r); }} title={`Editar ${r.ticket}`}>',
  'edit button mode',
);

mustReplace(
  '<Dialog open={!!editingReport} onOpenChange={(v) => !v && setEditingReport(null)}>',
  '<Dialog open={!!editingReport} onOpenChange={(v) => { if (!v) { setEditingReport(null); setEditingForClose(false); } }}>',
  'editor close cleanup',
);

mustReplace(
`              onSave={async (payload) => {
                await editReport.mutateAsync(payload);
                toast.success("Lançamento atualizado.");
                setEditingReport(null);
              }}`,
`              onSave={async (payload) => {
                await editReport.mutateAsync(payload);
                const shouldClose = editingForClose;
                const edited = editingReport
                  ? { ...editingReport, driverId: payload.driverId, fleetId: payload.fleetId, tons: payload.tons, dailyValue: payload.dailyValue, freightMode: payload.freightMode }
                  : null;
                toast.success(shouldClose ? "Tipo definido. Complete o fechamento da viagem." : "Lançamento atualizado.");
                setEditingReport(null);
                setEditingForClose(false);
                if (shouldClose && edited) setOpen(edited);
              }}`,
  'continue close after choosing mode',
);

mustReplace(
  '  const [mode, setMode] = useState<PendingReportEditPayload["freightMode"]>(report.freightMode ?? "ton");',
  '  const [mode, setMode] = useState<"" | PendingReportEditPayload["freightMode"]>(report.freightMode ?? "");',
  'mode starts undefined',
);

mustReplace(
  '        if (!driverId || !fleetId) return toast.error("Escolha motorista e conjunto.");\n        if (mode === "ton" && tons <= 0) return toast.error("Informe o peso líquido/toneladas.");',
  '        if (!driverId || !fleetId) return toast.error("Escolha motorista e conjunto.");\n        if (!mode) return toast.error("Escolha o tipo da viagem.");\n        if (mode === "ton" && tons <= 0) return toast.error("Informe o peso líquido/toneladas.");',
  'require management mode',
);

mustReplace(
  '<Select value={mode} onChange={(event) => setMode(event.target.value as PendingReportEditPayload["freightMode"])}>\n          <option value="ton">Por tonelada</option>',
  '<Select value={mode} onChange={(event) => setMode(event.target.value as "" | PendingReportEditPayload["freightMode"])}>\n          <option value="">A definir pela Gerência</option>\n          <option value="ton">Por tonelada</option>',
  'mode placeholder',
);

s = s.replace(
  /\{freightModeLabel\(r\.freightMode\)\}/g,
  '{r.freightMode ? freightModeLabel(r.freightMode) : "A definir pela Gerência"}',
);

s = s.replace(
  '{r.freightMode === "trip" ? "Valor da diária" : r.freightMode === "cegonha" || r.freightMode === "caixinha" ? "Lançamento" : "Toneladas"}',
  '{!r.freightMode ? "Peso líquido" : r.freightMode === "trip" ? "Valor da diária" : r.freightMode === "cegonha" || r.freightMode === "caixinha" ? "Lançamento" : "Toneladas"}',
);

fs.writeFileSync(p, s);
console.log('[whatsapp-management-mode] Caixa now requires management to choose trip mode before closing');
