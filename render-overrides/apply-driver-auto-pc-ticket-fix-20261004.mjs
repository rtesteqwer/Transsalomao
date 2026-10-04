import fs from "node:fs";
import path from "node:path";

const target = path.resolve(process.argv[2] || "");
const driverPath = path.join(target, "src/routes/motorista.tsx");
if (!target || !fs.existsSync(driverPath)) {
  throw new Error("driver-auto-pc-ticket-fix: src/routes/motorista.tsx not found");
}

let s = fs.readFileSync(driverPath, "utf8");
let changed = 0;

function replaceOnce(before, after, label) {
  if (s.includes(after)) return;
  if (!s.includes(before)) throw new Error("driver-auto-pc-ticket-fix: pattern not found (" + label + ")");
  s = s.replace(before, after);
  changed += 1;
}

// PC/desktop: keep the mobile layout intact, but use the available screen width.
replaceOnce(
  '<div className="mx-auto max-w-md px-4 pb-16 pt-4">',
  '<div className="mx-auto w-full max-w-4xl px-4 pb-16 pt-4 sm:px-6 lg:px-8">',
  "desktop container"
);

// The intelligent reader is now the default. Explicit freight-mode buttons still
// switch to manual mode through the existing setPriceBatchMode(false) behavior.
replaceOnce(
  '  const [priceBatchMode, setPriceBatchMode] = useState(false);',
  '  const [priceBatchMode, setPriceBatchMode] = useState(true);',
  "automatic mode default"
);

// The server already creates an internal TON/TRIP/CEG/CX code when the printed
// ticket number cannot be read. Do not block the photo in the browser first.
const missingTicketGuard = '          if (freightMode !== "cegonha" && freightMode !== "caixinha" && !dados.numero_ticket?.trim()) throw new Error("Número do ticket não identificado.");\n';
if (s.includes(missingTicketGuard)) {
  s = s.replace(
    missingTicketGuard,
    '          // Sem número legível, o servidor cria um identificador interno e mantém a foto vinculada.\n'
  );
  changed += 1;
}

// Make the three manual upload actions align on one row on desktop while
// preserving two columns on phones.
const manualUploadStart = '              <div className="grid grid-cols-2 gap-3">\n                {[{ label: "Tirar foto", camera: true }, { label: "Escolher da galeria", camera: false }].map';
if (s.includes(manualUploadStart)) {
  s = s.replace(
    manualUploadStart,
    '              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">\n                {[{ label: "Tirar foto", camera: true }, { label: "Escolher da galeria", camera: false }].map'
  );
  changed += 1;
}

// Explain the fallback without presenting it as an OCR failure.
s = s.replaceAll(
  'A foto permaneceu salva no banco aguardando vínculo.',
  'A foto ficou salva e poderá ser vinculada automaticamente ao lançamento.'
);

fs.writeFileSync(driverPath, s);
console.log("[driver-auto-pc-ticket-fix] responsive desktop + automatic reader default + missing ticket fallback applied; changes=" + changed);
