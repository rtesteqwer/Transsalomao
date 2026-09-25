import fs from "node:fs";
import path from "node:path";

const target = process.argv[2];
if (!target || !fs.existsSync(target)) throw new Error("caixa-ticket-prefill: target missing");

const rel = "src/routes/dono/lancamentos.tsx";
const file = path.join(target, rel);
let s = fs.readFileSync(file, "utf8");

function replaceRequired(before, after, label) {
  if (!s.includes(before)) throw new Error("caixa-ticket-prefill: pattern not found (" + label + ")");
  s = s.replace(before, after);
}

replaceRequired(
  'export const Route = createFileRoute("/dono/lancamentos")({\n  component: LancamentosPage,\n});\n\nfunction LancamentosPage() {',
  'export const Route = createFileRoute("/dono/lancamentos")({\n  component: LancamentosPage,\n});\n\nfunction ticketDateForInput(value?: string | null) {\n  const raw = String(value || "").trim();\n  if (!raw) return "";\n  if (/^\\d{4}-\\d{2}-\\d{2}$/.test(raw)) return raw;\n  const match = raw.match(/^(\\d{1,2})[\\/.\\-](\\d{1,2})[\\/.\\-](\\d{4})$/);\n  if (!match) return "";\n  const [, day, month, year] = match;\n  return year + "-" + month.padStart(2, "0") + "-" + day.padStart(2, "0");\n}\n\nfunction LancamentosPage() {',
  "date helper",
);

replaceRequired(
  '  const [editingForClose, setEditingForClose] = useState(false);\n  const [selected, setSelected] = useState<Set<string>>(() => new Set());',
  '  const [editingForClose, setEditingForClose] = useState(false);\n  const [closingTicketMeta, setClosingTicketMeta] = useState<PendingTicketMetadata | null>(null);\n  const [selected, setSelected] = useState<Set<string>>(() => new Set());',
  "closing metadata state",
);

replaceRequired(
`  const draft: TripDraft | null =
    open && data
      ? emptyDraft(data.drivers, data.fleets, data.trips, {
          reportId: open.id,
          code: open.ticket,
          driverId: open.driverId,
          fleetId: open.fleetId,
          kmEnd: open.km > 0 ? String(open.km) : "",
          kmStart: String(lastKmForFleet(data.trips, open.fleetId) ?? ""),
          loadedTons: String(open.tons),
          netWeight: String(open.tons),
          freightMode: open.freightMode ?? "ton",
          pricePerTrip: open.freightMode === "trip" ? String(open.dailyValue || "") : "",
          dieselPrice: String(lastDieselPrice(data.trips)),
        })
      : null;`,
`  const draft: TripDraft | null =
    open && data
      ? emptyDraft(data.drivers, data.fleets, data.trips, {
          reportId: open.id,
          code: closingTicketMeta?.numeroTicket || open.ticket,
          date: ticketDateForInput(closingTicketMeta?.dataTicket) || new Date().toISOString().slice(0, 10),
          client: closingTicketMeta?.contratante || closingTicketMeta?.cliente || "",
          origin: closingTicketMeta?.navioOrigem || closingTicketMeta?.remetente || "",
          destination: closingTicketMeta?.navioDestino || closingTicketMeta?.destinatario || "",
          driverId: open.driverId,
          fleetId: open.fleetId,
          kmEnd: open.km > 0 ? String(open.km) : "",
          kmStart: String(lastKmForFleet(data.trips, open.fleetId) ?? ""),
          loadedTons: String(open.tons),
          netWeight: String(open.tons),
          freightMode: open.freightMode ?? "ton",
          pricePerTrip: open.freightMode === "trip" ? String(open.dailyValue || "") : "",
          dieselPrice: String(lastDieselPrice(data.trips)),
        })
      : null;`,
  "draft prefill",
);

replaceRequired(
  '  function toggleSelected(id: string) {',
  `  async function openReportForClose(report: DriverReport) {
    let ticket: PendingTicketMetadata | null = null;
    try {
      const response = await fetch("/api/ticket-meta?reportId=" + encodeURIComponent(report.id), {
        credentials: "same-origin",
        cache: "no-store",
      });
      const result = response.ok ? await response.json() : null;
      ticket = result?.ticket ?? null;
    } catch {
      ticket = null;
    }
    setClosingTicketMeta(ticket);
    setOpen(report);
  }

  function toggleSelected(id: string) {`,
  "close loader",
);

replaceRequired(
  '                      if (r.freightMode) setOpen(r);\n                      else { setEditingForClose(true); setEditingReport(r); }',
  '                      if (r.freightMode) void openReportForClose(r);\n                      else { setEditingForClose(true); setEditingReport(r); }',
  "close button",
);

replaceRequired(
  '                if (shouldClose && edited) setOpen(edited);',
  '                if (shouldClose && edited) await openReportForClose(edited);',
  "close after edit",
);

replaceRequired(
  '<Dialog open={!!open} onOpenChange={(v) => !v && setOpen(null)}>',
  '<Dialog open={!!open} onOpenChange={(v) => { if (!v) { setOpen(null); setClosingTicketMeta(null); } }}>',
  "close dialog reset",
);

replaceRequired(
  '          <DialogContent title={\`Fechar \${draft.code}\`}>\n            <TripForm',
  '          <DialogContent title={\`Fechar \${draft.code}\`}>\n            {open ? <TicketMetadata reportId={open.id} mode={open.freightMode} /> : null}\n            <TripForm',
  "metadata in close dialog",
);

replaceRequired(
`type PendingTicketMetadata = {
  numeroTicket: string | null;
  placaVeiculo: string | null;
  placaCarreta: string | null;
  transportadora: string | null;
  destinatario: string | null;
  operadora: string | null;
  contratante: string | null;
  dataTicket: string | null;
  horaTicket: string | null;
  pesoLiquidoKg: number | null;
  freightMode: string | null;
};`,
`type PendingTicketMetadata = {
  numeroTicket: string | null;
  placaVeiculo: string | null;
  placaCarreta: string | null;
  transportadora: string | null;
  destinatario: string | null;
  operadora: string | null;
  contratante: string | null;
  cliente: string | null;
  produto: string | null;
  remetente: string | null;
  navio: string | null;
  navioOrigem: string | null;
  navioDestino: string | null;
  empresaDocumento: string | null;
  dataTicket: string | null;
  horaTicket: string | null;
  pesoLiquidoKg: number | null;
  freightMode: string | null;
};`,
  "metadata type expansion",
);

replaceRequired(
  '        <span>Destinatário: <b className="text-fg">{ticket.destinatario || "—"}</b></span>\n        <span>Data do ticket: <b className="text-fg">{ticket.dataTicket || "—"}</b></span>',
  '        <span>Destinatário: <b className="text-fg">{ticket.destinatario || "—"}</b></span>\n        <span>Produto: <b className="text-fg">{ticket.produto || "—"}</b></span>\n        <span>Remetente: <b className="text-fg">{ticket.remetente || "—"}</b></span>\n        <span>Navio: <b className="text-fg">{ticket.navio || "—"}</b></span>\n        <span>Navio origem: <b className="text-fg">{ticket.navioOrigem || "—"}</b></span>\n        <span>Navio destino: <b className="text-fg">{ticket.navioDestino || "—"}</b></span>\n        <span>Data do ticket: <b className="text-fg">{ticket.dataTicket || "—"}</b></span>',
  "metadata display expansion",
);

fs.writeFileSync(file, s);
console.log("[caixa-ticket-prefill] ticket photo data now prefills Caixa close form");
