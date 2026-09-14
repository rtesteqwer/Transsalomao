import fs from 'node:fs';
import path from 'node:path';

const target = process.argv[2];
if (!target || !fs.existsSync(target)) {
  throw new Error('apply-all-freight-prices: target source directory missing');
}
const repo = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');

function file(rel) { return path.join(target, rel); }
function read(rel) { return fs.readFileSync(file(rel), 'utf8'); }
function write(rel, content) { fs.writeFileSync(file(rel), content); }
function replaceRequired(text, before, after, label) {
  if (!text.includes(before)) throw new Error(`apply-all-freight-prices: pattern not found (${label})`);
  return text.replace(before, after);
}
function replaceOptional(text, before, after) {
  return text.includes(before) ? text.replace(before, after) : text;
}

// A migração 0007 já existe em produção. A 0008 amplia a tabela para os quatro
// modos sem reaplicar migrações antigas e preserva o histórico existente.
fs.copyFileSync(
  path.join(repo, 'render-overrides', '0008_all_freight_prices.sql'),
  file('migrations/0008_all_freight_prices.sql'),
);

// Tipos compartilhados.
{
  let s = read('src/lib/types.ts');
  s = replaceRequired(
    s,
    'export type FreightPrices = {\n  cegonha: number;\n  caixinha: number;\n};',
    'export type FreightPrices = {\n  ton: number;\n  trip: number;\n  cegonha: number;\n  caixinha: number;\n};',
    'FreightPrices type',
  );
  write('src/lib/types.ts', s);
}

// API: os quatro preços ficam centralizados e uma alteração recalcula as viagens
// existentes. Assim painel, PDF e Excel usam imediatamente o mesmo valor.
{
  let s = read('src/lib/api.ts');
  s = replaceRequired(
    s,
    'const prices: FreightPrices = { cegonha: 0, caixinha: 0 };',
    'const prices: FreightPrices = { ton: 0, trip: 0, cegonha: 0, caixinha: 0 };',
    'price defaults',
  );
  s = replaceRequired(
    s,
    'if (mode === "cegonha" || mode === "caixinha") {',
    'if (mode === "ton" || mode === "trip" || mode === "cegonha" || mode === "caixinha") {',
    'price row modes',
  );
  s = replaceRequired(
    s,
    '  mode: "cegonha" | "caixinha",',
    '  mode: "ton" | "trip" | "cegonha" | "caixinha",',
    'configured price mode type',
  );
  s = replaceRequired(
    s,
    'const freightPricesSchema = z.object({\n  cegonha: z.number().positive("Informe um valor maior que zero para Cegonha"),\n  caixinha: z.number().positive("Informe um valor maior que zero para Caixinha"),\n});',
    'const freightPricesSchema = z.object({\n  ton: z.number().positive("Informe um valor maior que zero para Por tonelada"),\n  trip: z.number().positive("Informe um valor maior que zero para Por viagem"),\n  cegonha: z.number().positive("Informe um valor maior que zero para Cegonha"),\n  caixinha: z.number().positive("Informe um valor maior que zero para Caixinha"),\n});',
    'freight price schema',
  );

  const firstInsert = '    await sql`\n      insert into freight_prices (mode, price, updated_at)\n      values (\'cegonha\', ${data.cegonha}, now())\n      on conflict (mode) do update set\n        price = excluded.price,\n        updated_at = excluded.updated_at\n    `;';
  const allInserts = '    await sql`\n      insert into freight_prices (mode, price, updated_at)\n      values (\'ton\', ${data.ton}, now())\n      on conflict (mode) do update set\n        price = excluded.price,\n        updated_at = excluded.updated_at\n    `;\n    await sql`\n      insert into freight_prices (mode, price, updated_at)\n      values (\'trip\', ${data.trip}, now())\n      on conflict (mode) do update set\n        price = excluded.price,\n        updated_at = excluded.updated_at\n    `;\n' + firstInsert;
  s = replaceRequired(s, firstInsert, allInserts, 'price upserts');

  s = replaceRequired(
    s,
    '    // Gerência definiu estes dois modos como preços globais atuais. Atualizar\n    // as viagens existentes faz painel, totais, PDF e Excel mudarem juntos.\n    await sql`update trips set price_per_trip = ${data.cegonha} where freight_mode = \'cegonha\'`;\n    await sql`update trips set price_per_trip = ${data.caixinha} where freight_mode = \'caixinha\'`;',
    '    // Valores atuais definidos pela Gerência: recalcular todos os registros\n    // faz painel, totais, PDF e Excel permanecerem sincronizados.\n    await sql`update trips set price_per_ton = ${data.ton} where freight_mode = \'ton\'`;\n    await sql`update trips set price_per_trip = ${data.trip} where freight_mode = \'trip\'`;\n    await sql`update trips set price_per_trip = ${data.cegonha} where freight_mode = \'cegonha\'`;\n    await sql`update trips set price_per_trip = ${data.caixinha} where freight_mode = \'caixinha\'`;',
    'recalculate existing trips',
  );

  s = replaceRequired(
    s,
    '      const configuredPrice =\n        reportFreightMode === "cegonha" || reportFreightMode === "caixinha"\n          ? await getConfiguredTripPrice(sql, reportFreightMode)\n          : 0;\n      if (\n        (reportFreightMode === "cegonha" || reportFreightMode === "caixinha") &&\n        configuredPrice <= 0\n      ) {',
    '      const configuredPrice = reportFreightMode\n        ? await getConfiguredTripPrice(sql, reportFreightMode)\n        : 0;\n      if (reportFreightMode && configuredPrice <= 0) {',
    'accepted report configured price',
  );
  s = replaceRequired(
    s,
    '${tons}, 0, ${tons}, ${reportFreightMode}, 0, ${configuredPrice},\n          ${kmStart}',
    '${tons}, 0, ${tons}, ${reportFreightMode}, ${reportFreightMode === "ton" ? configuredPrice : 0}, ${reportFreightMode === "ton" ? 0 : configuredPrice},\n          ${kmStart}',
    'accepted report price columns',
  );

  const oldTripPrice = '    const pricePerTrip =\n      data.freightMode === "cegonha" || data.freightMode === "caixinha"\n        ? await getConfiguredTripPrice(sql, data.freightMode)\n        : data.pricePerTrip;\n    if (\n      (data.freightMode === "cegonha" || data.freightMode === "caixinha") &&\n      pricePerTrip <= 0\n    ) {\n      throw new Error(\n        `Configure o preço de ${data.freightMode === "cegonha" ? "Cegonha" : "Caixinha"} em Cadastros > Preços de frete antes de salvar a viagem.`,\n      );\n    }';
  const newTripPrice = '    const configuredPrice = await getConfiguredTripPrice(sql, data.freightMode);\n    if (configuredPrice <= 0) {\n      const freightModeLabel = {\n        ton: "Por tonelada",\n        trip: "Por viagem",\n        cegonha: "Cegonha",\n        caixinha: "Caixinha",\n      }[data.freightMode];\n      throw new Error(`Configure o preço de ${freightModeLabel} em Cadastros > Preços frete antes de salvar a viagem.`);\n    }\n    const pricePerTon = data.freightMode === "ton" ? configuredPrice : data.pricePerTon;\n    const pricePerTrip = data.freightMode === "ton" ? 0 : configuredPrice;';
  s = replaceRequired(s, oldTripPrice, newTripPrice, 'trip global price selection');
  s = replaceRequired(
    s,
    '${data.netWeight}, ${data.freightMode}, ${data.pricePerTon}, ${pricePerTrip},',
    '${data.netWeight}, ${data.freightMode}, ${pricePerTon}, ${pricePerTrip},',
    'trip insert configured price',
  );
  write('src/lib/api.ts', s);
}

// Formulário de viagem: ao escolher a modalidade, o valor correspondente vem
// automaticamente da Gerência. O operador escolhe o modo; não digita o preço.
{
  let s = read('src/components/owner/trip-form.tsx');
  s = replaceRequired(
    s,
    '  const globalPrices = fleetState?.freightPrices ?? { cegonha: 0, caixinha: 0 };',
    '  const globalPrices = fleetState?.freightPrices ?? { ton: 0, trip: 0, cegonha: 0, caixinha: 0 };',
    'trip form price defaults',
  );
  s = replaceRequired(
    s,
    '  useEffect(() => {\n    if (form.freightMode !== "cegonha" && form.freightMode !== "caixinha") return;\n    const currentPrice = globalPrices[form.freightMode];\n    const nextValue = currentPrice > 0 ? String(currentPrice) : "";\n    setForm((current) =>\n      current.pricePerTrip === nextValue\n        ? current\n        : { ...current, pricePerTrip: nextValue },\n    );\n  }, [form.freightMode, globalPrices.cegonha, globalPrices.caixinha]);',
    '  useEffect(() => {\n    const currentPrice = globalPrices[form.freightMode];\n    const nextValue = currentPrice > 0 ? String(currentPrice) : "";\n    setForm((current) => {\n      if (current.freightMode === "ton") {\n        return current.pricePerTon === nextValue\n          ? current\n          : { ...current, pricePerTon: nextValue, pricePerTrip: "" };\n      }\n      return current.pricePerTrip === nextValue\n        ? current\n        : { ...current, pricePerTrip: nextValue };\n    });\n  }, [form.freightMode, globalPrices.ton, globalPrices.trip, globalPrices.cegonha, globalPrices.caixinha]);',
    'trip form synchronized value',
  );
  s = replaceRequired(
    s,
    '              onClick={() =>\n                setForm((f) => ({\n                  ...f,\n                  freightMode: opt.key,\n                  pricePerTrip:\n                    opt.key === "cegonha"\n                      ? String(globalPrices.cegonha || "")\n                      : opt.key === "caixinha"\n                        ? String(globalPrices.caixinha || "")\n                        : f.pricePerTrip,\n                }))\n              }',
    '              onClick={() =>\n                setForm((f) => ({\n                  ...f,\n                  freightMode: opt.key,\n                  pricePerTon: opt.key === "ton" ? String(globalPrices.ton || "") : f.pricePerTon,\n                  pricePerTrip: opt.key === "ton" ? "" : String(globalPrices[opt.key] || ""),\n                }))\n              }',
    'trip form mode selector',
  );
  s = replaceRequired(
    s,
    '              readOnly={form.freightMode === "cegonha" || form.freightMode === "caixinha"}',
    '              readOnly',
    'fixed mode price readonly',
  );
  s = replaceOptional(
    s,
    '              value={form.pricePerTon}\n              onChange={(e) => set("pricePerTon", e.target.value)}',
    '              value={form.pricePerTon}\n              onChange={(e) => set("pricePerTon", e.target.value)}\n              readOnly',
  );
  s = replaceOptional(
    s,
    '                ? "Valor por viagem"\n                : `Preço automático — ${form.freightMode === "cegonha" ? "Cegonha" : "Caixinha"}`',
    '                ? "Preço automático — Por viagem"\n                : `Preço automático — ${form.freightMode === "cegonha" ? "Cegonha" : "Caixinha"}`',
  );
  write('src/components/owner/trip-form.tsx', s);
}

// Gerência: quatro campos, um para cada modalidade.
{
  let s = read('src/routes/dono/cadastros.tsx');
  s = replaceRequired(
    s,
    '  const [cegonha, setCegonha] = useState("");\n  const [caixinha, setCaixinha] = useState("");',
    '  const [ton, setTon] = useState("");\n  const [trip, setTrip] = useState("");\n  const [cegonha, setCegonha] = useState("");\n  const [caixinha, setCaixinha] = useState("");',
    'management price state',
  );
  s = replaceRequired(
    s,
    '    setCegonha(current.cegonha > 0 ? String(current.cegonha) : "");\n    setCaixinha(current.caixinha > 0 ? String(current.caixinha) : "");\n  }, [current?.cegonha, current?.caixinha]);',
    '    setTon(current.ton > 0 ? String(current.ton) : "");\n    setTrip(current.trip > 0 ? String(current.trip) : "");\n    setCegonha(current.cegonha > 0 ? String(current.cegonha) : "");\n    setCaixinha(current.caixinha > 0 ? String(current.caixinha) : "");\n  }, [current?.ton, current?.trip, current?.cegonha, current?.caixinha]);',
    'management price load',
  );
  s = replaceOptional(s, '          Preços por viagem', '          Preços dos modos de frete');
  s = replaceRequired(
    s,
    '          Defina aqui o valor atual de Cegonha e Caixinha. Ao salvar, o sistema\n          aplica os valores automaticamente nas viagens dessas modalidades e\n          atualiza painel, totais, PDF e Excel.',
    '          Defina aqui o valor de cada modo de frete. Ao salvar, o sistema\n          aplica os valores automaticamente nas viagens correspondentes e\n          atualiza painel, totais, PDF e Excel colorido.',
    'management explanatory copy',
  );
  s = replaceRequired(
    s,
    '            const next = {\n              cegonha: parseLocaleNumberOrZero(cegonha),\n              caixinha: parseLocaleNumberOrZero(caixinha),\n            };\n            if (next.cegonha <= 0 || next.caixinha <= 0) {\n              toast.error("Informe valores maiores que zero para Cegonha e Caixinha.");',
    '            const next = {\n              ton: parseLocaleNumberOrZero(ton),\n              trip: parseLocaleNumberOrZero(trip),\n              cegonha: parseLocaleNumberOrZero(cegonha),\n              caixinha: parseLocaleNumberOrZero(caixinha),\n            };\n            if (next.ton <= 0 || next.trip <= 0 || next.cegonha <= 0 || next.caixinha <= 0) {\n              toast.error("Informe valores maiores que zero para todos os modos de frete.");',
    'management save values',
  );
  s = replaceOptional(
    s,
    '              toast.success("Preços de Cegonha e Caixinha atualizados em todo o sistema.");',
    '              toast.success("Preços de todos os modos de frete atualizados em todo o sistema.");',
  );
  s = replaceRequired(
    s,
    '          <div className="grid gap-4 sm:grid-cols-2">\n            <Field label="Cegonha — valor por viagem (R$)">',
    '          <div className="grid gap-4 sm:grid-cols-2">\n            <Field label="Por tonelada — R$/t">\n              <Input\n                inputMode="decimal"\n                value={ton}\n                onChange={(e) => setTon(e.target.value)}\n                placeholder="0,00"\n              />\n            </Field>\n            <Field label="Por viagem — valor fixo (R$)">\n              <Input\n                inputMode="decimal"\n                value={trip}\n                onChange={(e) => setTrip(e.target.value)}\n                placeholder="0,00"\n              />\n            </Field>\n            <Field label="Cegonha — valor por viagem (R$)">',
    'management four price inputs',
  );
  s = replaceRequired(
    s,
    '            alterar um valor aqui recalcula também as viagens já lançadas dessa\n            modalidade. O modo comum “Por viagem” continua com valor manual.',
    '            alterar qualquer valor aqui recalcula também as viagens já lançadas\n            da modalidade correspondente. Novos lançamentos recebem o preço automaticamente.',
    'management automatic update copy',
  );
  write('src/routes/dono/cadastros.tsx', s);
}

for (const [rel, markers] of [
  ['src/lib/types.ts', ['ton: number;', 'trip: number;', 'freightPrices: FreightPrices']],
  ['src/lib/api.ts', ["values ('ton'", "values ('trip'", "price_per_ton = ${data.ton}", 'const configuredPrice = await getConfiguredTripPrice(sql, data.freightMode)']],
  ['src/components/owner/trip-form.tsx', ['globalPrices.ton', 'globalPrices.trip', 'readOnly']],
  ['src/routes/dono/cadastros.tsx', ['Por tonelada — R$/t', 'Por viagem — valor fixo', 'Excel colorido']],
]) {
  const text = read(rel);
  for (const marker of markers) {
    if (!text.includes(marker)) throw new Error(`apply-all-freight-prices: ${rel} missing ${marker}`);
  }
}

console.log('[freight-prices] all four freight modes centralized and synchronized');
