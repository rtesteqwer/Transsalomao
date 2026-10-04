import fs from "node:fs";
import path from "node:path";

const target = path.resolve(process.argv[2] || "");
if (!process.argv[2] || !fs.existsSync(path.join(target, "src"))) {
  throw new Error("driver-fixed-trip-price: expected reconstructed application directory");
}

const driverPath = path.join(target, "src/routes/motorista.tsx");
const apiPath = path.join(target, "src/lib/api.ts");
let s = fs.readFileSync(driverPath, "utf8");

function must(before, after, label) {
  if (s.includes(after)) return;
  if (!s.includes(before)) throw new Error("driver-fixed-trip-price: pattern not found (" + label + ")");
  s = s.replace(before, after);
}

// Diária, Cegonha e Caixinha são lançamentos com preço por viagem e quantidade explícita.
must(
  '    const batchMode = freightMode === "cegonha" || freightMode === "caixinha";\n    const tripCountN = Number.parseInt(tripCount, 10);',
  '    const batchMode = freightMode === "cegonha" || freightMode === "caixinha";\n    const pricedTripMode = freightMode === "trip" || freightMode === "cegonha" || freightMode === "caixinha";\n    const tripCountN = Number.parseInt(tripCount, 10);',
  "priced mode state"
);

must(
  '    if (freightMode === "trip" && (!(dailyValueN != null) || dailyValueN <= 0)) return toast.error("Informe o valor da diária.");',
  '    if (pricedTripMode && (!Number.isInteger(tripCountN) || tripCountN < 1 || tripCountN > 100)) return toast.error("Informe a quantidade de viagens entre 1 e 100.");\n    if (pricedTripMode && (!(dailyValueN != null) || dailyValueN <= 0)) return toast.error("Informe o valor em reais por viagem.");',
  "priced mode validation"
);

// Ao trocar de modalidade, quantidade e valor devem ser informados novamente.
s = s.replaceAll(
  'setTripCount(mode === "cegonha" || mode === "caixinha" ? "" : "1");',
  'setTripCount(mode === "trip" || mode === "cegonha" || mode === "caixinha" ? "" : "1"); setDailyValue("");'
);

// Lançamento manual: cria exatamente a quantidade solicitada também para Diária.
must(
  '      const count = batchMode ? (batchPhotos.length || tripCountN) : 1;',
  '      const count = pricedTripMode ? (batchMode && batchPhotos.length > 0 ? batchPhotos.length : tripCountN) : 1;',
  "priced mode count"
);

// Cada lançamento carrega o valor unitário informado pelo motorista.
s = s.replaceAll(
  'dailyValue: freightMode === "trip" ? (dailyValueN ?? 0) : 0,',
  'dailyValue: pricedTripMode ? (dailyValueN ?? 0) : 0,'
);
s = s.replaceAll(
  'dailyValue: 0,\n            km_carreta: 0,',
  'dailyValue: dailyValueN ?? 0,\n            km_carreta: 0,'
);
s = s.replaceAll(
  'dailyValue: 0, freightMode });',
  'dailyValue: dailyValueN ?? 0, freightMode });'
);

// Cegonha/Caixinha: acrescenta valor por viagem acima da quantidade obrigatória.
const fixedStart = '          {freightMode === "cegonha" || freightMode === "caixinha" ? (\n            <Field label="Quantidade de viagens *" hint="Obrigatório — informe de 1 a 100">';
if (!s.includes(fixedStart)) throw new Error("driver-fixed-trip-price: fixed quantity UI not found");
s = s.replace(
  fixedStart,
  `          {freightMode === "cegonha" || freightMode === "caixinha" ? (
            <>
            <Field label="Valor por viagem (R$) *" hint="Obrigatório — aplicado a cada viagem lançada">
              <Input
                value={dailyValue}
                onChange={(e) => setDailyValue(e.target.value)}
                inputMode="decimal"
                placeholder="0,00"
                className="h-14 font-display text-2xl tabular tracking-wide"
              />
            </Field>
            <Field label="Quantidade de viagens *" hint="Obrigatório — informe de 1 a 100">`
);

const fixedEnd = '            </Field>\n          ) : freightMode === "trip" ? (';
if (!s.includes(fixedEnd)) throw new Error("driver-fixed-trip-price: fixed quantity UI end not found");
s = s.replace(
  fixedEnd,
  '            </Field>\n            </>\n          ) : freightMode === "trip" ? ('
);

// Diária: troca o campo único de valor por valor unitário + quantidade.
const dailyBlock = `          ) : freightMode === "trip" ? (
            <Field label="Valor da diária (R$)" hint="Obrigatório — este valor será enviado para a Gerência">
              <Input
                value={dailyValue}
                onChange={(e) => setDailyValue(e.target.value)}
                inputMode="decimal"
                placeholder="0,00"
                className="h-14 font-display text-2xl tabular tracking-wide"
              />
              <p className="mt-2 text-xs text-muted">A comissão do motorista será calculada sobre o valor desta diária.</p>
            </Field>
          ) : (`;
const dailyReplacement = `          ) : freightMode === "trip" ? (
            <>
            <Field label="Valor por viagem (R$) *" hint="Obrigatório — valor de cada diária lançada">
              <Input
                value={dailyValue}
                onChange={(e) => setDailyValue(e.target.value)}
                inputMode="decimal"
                placeholder="0,00"
                className="h-14 font-display text-2xl tabular tracking-wide"
              />
            </Field>
            <Field label="Quantidade de viagens *" hint="Obrigatório — informe de 1 a 100">
              <Input
                type="number"
                inputMode="numeric"
                min={1}
                max={100}
                step={1}
                required
                value={tripCount}
                placeholder="Ex.: 5"
                onChange={(event) => setTripCount(event.target.value.replace(/\\D/g, "").slice(0, 3))}
              />
              <p className="mt-2 text-xs text-muted">Serão criados exatamente esta quantidade de lançamentos, cada um com o valor informado acima.</p>
            </Field>
            </>
          ) : (`;
if (!s.includes(dailyBlock)) throw new Error("driver-fixed-trip-price: daily UI block not found");
s = s.replace(dailyBlock, dailyReplacement);

fs.writeFileSync(driverPath, s);

// Ao aceitar em lote no Caixa, Cegonha/Caixinha respeitam o valor por viagem enviado pelo motorista.
// Se um lançamento antigo não tiver valor próprio, continua usando o preço global da Gerência.
let api = fs.readFileSync(apiPath, "utf8");
const priceBefore = '      const reportId = str(report.id); const mode = nullableFreightMode(report.freight_mode); const price = mode === "trip" ? num(report.daily_value) : mode && mode !== "ton" ? (prices.get(mode) ?? 0) : 0;';
const priceAfter = '      const reportId = str(report.id); const mode = nullableFreightMode(report.freight_mode); const ownTripPrice = num(report.daily_value); const price = mode && mode !== "ton" ? (ownTripPrice > 0 ? ownTripPrice : (prices.get(mode) ?? 0)) : 0;';
if (api.includes(priceBefore)) api = api.replace(priceBefore, priceAfter);
else if (!api.includes(priceAfter)) throw new Error("driver-fixed-trip-price: bulk fixed-mode price logic not found");
fs.writeFileSync(apiPath, api);

console.log("[driver-fixed-trip-price] Diária/Cegonha/Caixinha now require R$/trip + explicit quantity");
