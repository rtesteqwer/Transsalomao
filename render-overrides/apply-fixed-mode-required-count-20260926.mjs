import fs from "node:fs";
import path from "node:path";

const target = process.argv[2];
if (!target || !fs.existsSync(path.join(target, "src"))) throw new Error("fixed-mode-required-count: target missing");

const file = path.join(target, "src/routes/motorista.tsx");
let s = fs.readFileSync(file, "utf8");

function must(before, after, label) {
  if (s.includes(after)) return;
  if (!s.includes(before)) throw new Error("fixed-mode-required-count: pattern not found (" + label + ")");
  s = s.replace(before, after);
}

// Cegonha/Caixinha never silently default to one trip.
// The operator must explicitly say how many trips are being added.
must(
  '                    setFreightMode(mode);\n                    setTicketData(null); setTicketImage(null); setTicketFileName(""); setTicketConfirmed(false); setTicketReadError(""); setBatchPhotos([]);',
  '                    setFreightMode(mode);\n                    setTripCount(mode === "cegonha" || mode === "caixinha" ? "" : "1");\n                    setTicketData(null); setTicketImage(null); setTicketFileName(""); setTicketConfirmed(false); setTicketReadError(""); setBatchPhotos([]);',
  "clear fixed quantity on mode selection",
);

must(
  '    if (batchMode && batchPhotos.length === 0 && (!Number.isInteger(tripCountN) || tripCountN < 1 || tripCountN > 100)) {\n      return toast.error("Selecione uma ou mais fotos, ou informe uma quantidade entre 1 e 100.");\n    }',
  '    if (batchMode && (!Number.isInteger(tripCountN) || tripCountN < 1 || tripCountN > 100)) {\n      return toast.error("Informe obrigatoriamente quantas viagens de " + freightModeLabel(freightMode) + " deseja adicionar (1 a 100).");\n    }',
  "mandatory submit quantity",
);

must(
  '    if (!ticketAccess?.authenticated) return toast.error("Entre com seu login para enviar as fotos.");\n    const selectedFiles = files.slice(0, 100);',
  '    if (!ticketAccess?.authenticated) return toast.error("Entre com seu login para enviar as fotos.");\n    const fixedCountMode = freightMode === "cegonha" || freightMode === "caixinha";\n    if (fixedCountMode && (!Number.isInteger(tripCountN) || tripCountN < 1 || tripCountN > 100)) {\n      return toast.error("Antes das fotos, informe obrigatoriamente quantas viagens de " + freightModeLabel(freightMode) + " deseja adicionar (1 a 100).");\n    }\n    const selectedFiles = files.slice(0, 100);\n    if (fixedCountMode && selectedFiles.length > tripCountN) {\n      return toast.error("Você selecionou " + selectedFiles.length + " fotos, mas informou " + tripCountN + " viagens. A quantidade de viagens deve ser igual ou maior que a quantidade de fotos.");\n    }',
  "mandatory photo quantity",
);

must(
  '      await queryClient.invalidateQueries({ queryKey: fleetKey });\n      if (failed === 0 && linkedExisting === 0) toast.success(sent + (sent === 1 ? " viagem enviada automaticamente ao Caixa." : " viagens enviadas automaticamente ao Caixa."));',
  '      if (fixedCountMode) {\n        const newTripsFromPhotos = Math.max(0, sent - linkedExisting);\n        const remaining = Math.max(0, tripCountN - newTripsFromPhotos);\n        for (let index = 0; index < remaining; index += 1) {\n          await report.mutateAsync({ ticket: "", driverId, fleetId, km: 0, tons: 0, dailyValue: 0, freightMode });\n          sent += 1;\n        }\n      }\n      await queryClient.invalidateQueries({ queryKey: fleetKey });\n      if (failed === 0 && linkedExisting === 0) toast.success(sent + (sent === 1 ? " viagem enviada automaticamente ao Caixa." : " viagens enviadas automaticamente ao Caixa."));',
  "complete requested fixed quantity",
);

// In fixed modes, make the one-photo/many-trips workflow explicit.
must(
  'Selecione uma ou várias fotos. Cada foto é processada em fila e enviada automaticamente como um lançamento novo no Caixa.',
  'Selecione 1 foto e digite quantas viagens ela representa. A mesma foto será a evidência do grupo de Cegonha/Caixinha.',
  "fixed single-photo instructions",
);

s = s.replace(
  /multiple=\{!option\.camera\}/g,
  'multiple={!option.camera && !(freightMode === "cegonha" || freightMode === "caixinha")}',
);
s = s.replace(
  /\{ticketReading \? "Lendo ticket…" : option\.label\}/g,
  '{ticketReading ? "Lendo ticket…" : ((freightMode === "cegonha" || freightMode === "caixinha") && !option.camera ? "Selecionar 1 foto" : option.label)}',
);

// Replace the legacy "photos define the quantity" block with one mandatory field.
const quantityNeedle = '<Field label="Quantidade de viagens"';
const q = s.indexOf(quantityNeedle);
if (q < 0) throw new Error("fixed-mode-required-count: quantity field not found");
const startMarker = '          {freightMode === "cegonha" || freightMode === "caixinha" ? (';
const start = s.lastIndexOf(startMarker, q);
const endMarker = '          ) : freightMode === "trip" ? (';
const end = s.indexOf(endMarker, q);
if (start < 0 || end < 0) throw new Error("fixed-mode-required-count: quantity branch bounds missing");

const requiredBlock = `          {freightMode === "cegonha" || freightMode === "caixinha" ? (
            <Field label="Quantidade de viagens *" hint="Obrigatório — informe de 1 a 100">
              <Input
                type="number"
                inputMode="numeric"
                min={1}
                max={100}
                step={1}
                required
                value={tripCount}
                placeholder="Ex.: 16"
                onChange={(event) => setTripCount(event.target.value.replace(/\\D/g, "").slice(0, 3))}
              />
              <p className="mt-2 text-xs text-muted">
                {batchPhotos.length > 0
                  ? batchPhotos.length + " foto(s) anexada(s). A quantidade acima define exatamente quantas viagens serão criadas."
                  : "O sistema criará exatamente esta quantidade de lançamentos separados no Caixa."}
              </p>
            </Field>
`;

s = s.slice(0, start) + requiredBlock + s.slice(end);

fs.writeFileSync(file, s);
console.log("[fixed-mode-required-count] Cegonha/Caixinha now require an explicit 1-100 trip quantity");
