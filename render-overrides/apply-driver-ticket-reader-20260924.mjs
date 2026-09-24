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
copy("render-overrides/ticket-core-20260924.ts", "src/lib/ticket-core.ts");
copy("render-overrides/ticket-auth-20260924.server.ts", "src/lib/ticket-auth.server.ts");
copy("render-overrides/ticket-provider-20260924.ts", "src/lib/ticket-provider.server.ts");
copy("render-overrides/ticket-photo-access-20260924.tsx", "src/components/ticket-photo-access.tsx");

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
    '  const [kmCarreta, setKmCarreta] = useState("");\n';
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
    '            <Field label="Toneladas" hint={ticketData ? "Preenchido pela leitura do ticket — confira" : "Opcional"}>',
    "tons hint",
  );

  s = replaceRequired(
    s,
    '                onChange={(e) => setTons(e.target.value)}\n',
    '                onChange={(e) => {\n' +
      '                  setTons(e.target.value);\n' +
      '                  const parsed = parseLocaleNumber(e.target.value);\n' +
      '                  if (ticketData && parsed != null) {\n' +
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
  s = replaceRequired(s, '                value={tons}', '                readOnly={!!ticketData}\n                value={tons}', "one weight source");
  s = replaceRequired(s, 'disabled={report.isPending || drivers.length === 0}',
    'disabled={report.isPending || ticketReading || ticketSending || drivers.length === 0 || (freightMode === "ton" && !!ticketData && !ticketConfirmed)}', "submit lock");
  s = replaceRequired(s, '{report.isPending ? "Enviando…" : "Depositar no painel"}', '{report.isPending || ticketSending ? "Enviando…" : "Depositar no painel"}', "saving label");
  s = s.replace(/(<form[^>]*onSubmit=\{onSubmit\}[^>]*>)/, '$1\n          <fieldset disabled={ticketReading || ticketSending} className="contents">');
  s = replaceRequired(s, '        </form>', '          </fieldset>\n        </form>', "fieldset end");
  writeTarget(rel, s);
}

console.log("[driver-ticket-reader] ticket photo read + confirmation + duplicate-safe save applied");
