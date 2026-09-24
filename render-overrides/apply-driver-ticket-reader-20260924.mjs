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

  writeTarget(rel, s);
}

console.log("[driver-ticket-reader] ticket photo read + confirmation + duplicate-safe save applied");
