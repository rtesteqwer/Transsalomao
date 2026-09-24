import fs from "node:fs";
import path from "node:path";

const target = process.argv[2];
if (!target || !fs.existsSync(target)) throw new Error("driver-ticket-reader: target missing");
const repo = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");

function dst(rel) { return path.join(target, rel); }
function src(rel) { return path.join(repo, rel); }
function readTarget(rel) { return fs.readFileSync(dst(rel), "utf8"); }
function readSource(rel) { return fs.readFileSync(src(rel), "utf8"); }
function writeTarget(rel, value) {
  fs.mkdirSync(path.dirname(dst(rel)), { recursive: true });
  fs.writeFileSync(dst(rel), value);
}
function copy(relSource, relTarget) {
  writeTarget(relTarget, readSource(relSource));
}
function replaceRequired(text, before, after, label) {
  if (!text.includes(before)) throw new Error("driver-ticket-reader: pattern not found (" + label + ")");
  return text.replace(before, after);
}

copy("render-overrides/ticket-reader-api-20260924.ts", "src/routes/api/ler-ticket.ts");
copy("render-overrides/ticket-save-api-20260924.ts", "src/routes/api/salvar-ticket.ts");
copy("render-overrides/0012_ticket_reader.sql", "migrations/0012_ticket_reader.sql");
copy("render-overrides/0015_ticket_safety.sql", "migrations/0015_ticket_safety.sql");
copy("render-overrides/0016_ticket_modes_metadata.sql", "migrations/0016_ticket_modes_metadata.sql");
copy("render-overrides/ticket-core-20260924.ts", "src/lib/ticket-core.ts");
copy("render-overrides/ticket-auth-20260924.server.ts", "src/lib/ticket-auth.server.ts");
copy("render-overrides/ticket-provider-20260924.ts", "src/lib/ticket-provider.server.ts");
copy("render-overrides/ticket-photo-access-20260924.tsx", "src/components/ticket-photo-access.tsx");
copy("render-overrides/ticket-meta-api-20260924.ts", "src/routes/api/ticket-meta.ts");
copy("render-overrides/salomao-ticket-reader-20260924.server.ts", "src/lib/salomao-ticket-reader.server.ts");

// OCR local sob demanda para a Salomão IA quando a visão avançada estiver indisponível.
{
  const packagePath = dst("package.json");
  const pkg = JSON.parse(fs.readFileSync(packagePath, "utf8"));
  pkg.dependencies = pkg.dependencies || {};
  pkg.dependencies["tesseract.js"] = "^6.0.1";
  fs.writeFileSync(packagePath, JSON.stringify(pkg, null, 2) + "\n");
}

// Use the existing private deployment secret when no dedicated management key is set.
const authPath = "src/lib/management-auth.server.ts";
writeTarget(authPath, replaceRequired(readTarget(authPath),
  'return process.env.MANAGEMENT_SESSION_SECRET?.trim() || "transsalomao-test-session";',
  'const secret = process.env.MANAGEMENT_SESSION_SECRET?.trim() || process.env.DATABASE_URL?.trim();\n  if (!secret) throw new Error("Segredo de sessão da gerência não configurado.");\n  return secret;',
  "management session secret"));


{
  const rel = "src/routes/motorista.tsx";
  let s = readTarget(rel);

  s = replaceRequired(
    s,
    'import { CheckCircle2, ChevronLeft } from "lucide-react";',
    'import { AlertTriangle, Camera, CheckCircle2, ChevronLeft, LoaderCircle } from "lucide-react";',
    "icons",
  );

  const helperMarker = 'const MODE_KEY = "transsalomao.freightMode";\n';
  s = replaceRequired(
    s,
    helperMarker,
    helperMarker + "\n" + readSource("render-overrides/driver-ticket-helpers-20260924.snippet.ts") + "\n",
    "helpers",
  );

  const stateMarker = '  const [sentTicket, setSentTicket] = useState<string | null>(null);\n';
  const states =
    stateMarker +
    '  const [ticketData, setTicketData] = useState<TicketData | null>(null);\n' +
    '  const [ticketReading, setTicketReading] = useState(false);\n' +
    '  const [ticketFileName, setTicketFileName] = useState("");\n' +
    '  const [kmCarreta, setKmCarreta] = useState("");\n' +
    '  const [ticketReadError, setTicketReadError] = useState("");\n';
  s = replaceRequired(s, stateMarker, states, "states");

  const submitFnMarker = "  async function onSubmit(e: React.FormEvent) {\n";
  s = replaceRequired(
    s,
    submitFnMarker,
    readSource("render-overrides/driver-ticket-read-handler-20260924.snippet.ts") + submitFnMarker,
    "read handler",
  );

  const submitStart = s.indexOf('    try {\n      const count = batchMode ? tripCountN : 1;');
  const submitEnd = s.indexOf("\n  }\n\n  return (", submitStart);
  if (submitStart < 0 || submitEnd < 0) throw new Error("driver-ticket-reader: submit block not found");
  s =
    s.slice(0, submitStart) +
    readSource("render-overrides/driver-ticket-submit-20260924.snippet.ts") +
    s.slice(submitEnd);

  const fieldsMarker = '          {freightMode === "cegonha" || freightMode === "caixinha" ? (\n';
  s = replaceRequired(
    s,
    fieldsMarker,
    readSource("render-overrides/driver-ticket-ui-20260924.snippet.tsx") + fieldsMarker,
    "ticket UI",
  );

  s = replaceRequired(
    s,
    '            <Field label="Toneladas" hint="Opcional">',
    '            <Field label="Toneladas" hint={ticketData && freightMode === "ton" ? "Preenchido pela leitura do ticket — confira" : "Opcional"}>',
    "tons hint",
  );

  s = replaceRequired(
    s,
    '                onChange={(e) => setTons(e.target.value)}\n',
    '                onChange={(e) => {\n' +
      '                  setTons(e.target.value);\n' +
      '                  const parsed = parseLocaleNumber(e.target.value);\n' +
      '                  if (ticketData && freightMode === "ton" && parsed != null) {\n' +
      '                    setTicketData({ ...ticketData, peso_liquido_kg: Math.round(parsed * 1000) });\n' +
      '                  }\n' +
      '                }}\n',
    "tons sync",
  );

  const submitButtonMarker = '\n\n          <Button\n            type="submit"';
  s = replaceRequired(
    s,
    submitButtonMarker,
    "\n\n" + readSource("render-overrides/driver-ticket-km-20260924.snippet.tsx") + '          <Button\n            type="submit"',
    "km field",
  );

  s = replaceRequired(s, 'import { useEffect, useMemo, useState } from "react";',
    'import { useEffect, useMemo, useRef, useState } from "react";\nimport { useQueryClient } from "@tanstack/react-query";\nimport { TicketPhotoAccess, type PhotoAccess } from "@/components/ticket-photo-access";', "ticket access imports");
  s = replaceRequired(s, 'import { useFleet, useFleetMutations }', 'import { fleetKey, useFleet, useFleetMutations }', "query key");
  s = replaceRequired(s, '  const drivers = (data?.drivers ?? []).filter((d) => d.status === "ativo");',
    '  const [ticketAccess, setTicketAccess] = useState<PhotoAccess | null>(null);\n  const drivers = (data?.drivers ?? []).filter((d) => d.status === "ativo" && (!ticketAccess?.driverId || d.id === ticketAccess.driverId));', "driver scope");
  s = replaceRequired(s, '  const [kmCarreta, setKmCarreta] = useState("");',
    '  const [kmCarreta, setKmCarreta] = useState("");\n  const [ticketConfirmed, setTicketConfirmed] = useState(false);\n  const [ticketSending, setTicketSending] = useState(false);\n  const ticketBusy = useRef(false);\n  const queryClient = useQueryClient();\n  useEffect(() => { if (ticketAccess?.driverId) setDriverId(ticketAccess.driverId); }, [ticketAccess?.driverId]);', "ticket state");
  s = replaceRequired(s, 'onChange={(e) => setDriverId(e.target.value)}', 'onChange={(e) => { setDriverId(e.target.value); setTicketConfirmed(false); }}', "driver confirmation");
  s = replaceRequired(s, 'onChange={(e) => setFleetId(e.target.value)}', 'onChange={(e) => { setFleetId(e.target.value); setTicketConfirmed(false); }}', "fleet confirmation");
  s = replaceRequired(s, '                value={tons}', '                readOnly={!!ticketData && freightMode === "ton" && !!ticketData.peso_liquido_kg}\n                value={tons}', "one weight source");
  s = replaceRequired(s, 'disabled={report.isPending || drivers.length === 0}',
    'disabled={report.isPending || ticketReading || ticketSending || drivers.length === 0 || (!!ticketData && !ticketConfirmed)}', "submit lock");
  s = replaceRequired(s, '{report.isPending ? "Enviando…" : "Depositar no painel"}', '{report.isPending || ticketSending ? "Enviando…" : "Depositar no painel"}', "saving label");
  s = s.replace(/(<form[^>]*onSubmit=\{onSubmit\}[^>]*>)/, '$1\n          <fieldset disabled={ticketReading || ticketSending} className="contents">');
  s = replaceRequired(s, '        </form>', '          </fieldset>\n        </form>', "fieldset end");
  writeTarget(rel, s);
}

// Preserve physical ticket numbers in pending Caixa items created from photo tickets.
{
  const rel = "src/lib/api.ts";
  let s = readTarget(rel);
  const oldNormalize = "      await sql\`with ordered as (select id, row_number() over (order by created_at asc, created_at asc nulls first, id asc) as rn from reports where status = 'pendente') update reports r set ticket = (\${offset} + ordered.rn)::text from ordered where r.id = ordered.id\`;";
  const actualNormalize = "      await sql\`with ordered as (select id, row_number() over (order by created_at asc nulls first, id asc) as rn from reports where status = 'pendente') update reports r set ticket = (\${offset} + ordered.rn)::text from ordered where r.id = ordered.id\`;";
  const fixedNormalize = "      await sql\`with ordered as (select r0.id, row_number() over (order by r0.created_at asc nulls first, r0.id asc) as rn from reports r0 where r0.status = 'pendente' and not exists (select 1 from tickets_balanca tb where tb.report_id = r0.id)) update reports r set ticket = (\${offset} + ordered.rn)::text from ordered where r.id = ordered.id\`;\n      await sql\`update reports r set ticket = tb.numero_ticket from tickets_balanca tb where tb.report_id = r.id and r.status = 'pendente' and r.ticket is distinct from tb.numero_ticket\`;";
  if (s.includes(actualNormalize)) s = s.replace(actualNormalize, fixedNormalize);
  else if (s.includes(oldNormalize)) s = s.replace(oldNormalize, fixedNormalize);
  else throw new Error("driver-ticket-reader: pending ticket normalization pattern not found");
  writeTarget(rel, s);
}

// Show ticket metadata captured by the photo reader inside management Caixa cards.
{
  const rel = "src/routes/dono/lancamentos.tsx";
  let s = readTarget(rel);
  if (s.includes('import { useState } from "react";')) {
    s = s.replace('import { useState } from "react";', 'import { useEffect, useState } from "react";');
  } else if (!s.includes("useEffect")) {
    throw new Error("driver-ticket-reader: React state import not found in Caixa");
  }

  const cardActions = '                <div className="mt-4 flex flex-wrap gap-2">';
  s = replaceRequired(s, cardActions, '                <TicketMetadata reportId={r.id} mode={r.freightMode} />\n' + cardActions, "Caixa ticket metadata card");

  const editorMarker = "type PendingReportEditPayload = {";
  const metadataComponent = `type PendingTicketMetadata = {
  numeroTicket: string | null;
  placaVeiculo: string | null;
  placaCarreta: string | null;
  transportadora: string | null;
  operadora: string | null;
  contratante: string | null;
  destinatario: string | null;
  pesoLiquidoKg: number | null;
  freightMode: string | null;
};

function TicketMetadata({ reportId, mode }: { reportId: string; mode?: string | null }) {
  const [ticket, setTicket] = useState<PendingTicketMetadata | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/ticket-meta?reportId=" + encodeURIComponent(reportId), {
      credentials: "same-origin",
      cache: "no-store",
      signal: controller.signal,
    })
      .then((response) => response.ok ? response.json() : null)
      .then((result) => { if (!controller.signal.aborted) setTicket(result?.ticket ?? null); })
      .catch(() => {});
    return () => controller.abort();
  }, [reportId]);

  if (!ticket) return null;
  return (
    <div className="mt-4 rounded-lg border border-border bg-bg p-3 text-xs">
      <p className="font-semibold text-fg">Dados captados da foto</p>
      <div className="mt-2 grid gap-1 text-muted sm:grid-cols-2">
        <span>Ticket: <b className="text-fg">{ticket.numeroTicket || "—"}</b></span>
        <span>Veículo: <b className="text-fg">{ticket.placaVeiculo || "—"}</b></span>
        <span>Carreta: <b className="text-fg">{ticket.placaCarreta || "—"}</b></span>
        <span>Transportadora: <b className="text-fg">{ticket.transportadora || "—"}</b></span>
        <span>Operadora: <b className="text-fg">{ticket.operadora || "—"}</b></span>
        <span>Contratante: <b className="text-fg">{ticket.contratante || "—"}</b></span>
        <span>Destinatário: <b className="text-fg">{ticket.destinatario || "—"}</b></span>
        {mode === "ton" && ticket.pesoLiquidoKg ? (
          <span>Peso líquido: <b className="text-fg">{new Intl.NumberFormat("pt-BR").format(ticket.pesoLiquidoKg)} kg</b></span>
        ) : null}
      </div>
    </div>
  );
}

`;
  s = replaceRequired(s, editorMarker, metadataComponent + editorMarker, "Caixa metadata component");
  writeTarget(rel, s);
}

console.log("[driver-ticket-reader] all freight modes + photo metadata + Caixa visibility applied");
