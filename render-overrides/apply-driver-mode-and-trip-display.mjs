import fs from 'node:fs';
import path from 'node:path';

const target = process.argv[2];
if (!target || !fs.existsSync(target)) throw new Error('apply-driver-mode-and-trip-display: target missing');

function file(rel) { return path.join(target, rel); }
function read(rel) { return fs.readFileSync(file(rel), 'utf8'); }
function write(rel, text) { fs.writeFileSync(file(rel), text); }
function replaceRequired(text, search, replacement, label) {
  const next = text.replace(search, replacement);
  if (next === text) throw new Error(`apply-driver-mode-and-trip-display: pattern not found (${label})`);
  return next;
}

// Aba Viagens: diesel fica somente nos diretórios próprios de abastecimento/relatórios.
// Para fretes por tonelada, mostramos claramente o valor R$/t salvo naquela viagem.
{
  let s = read('src/routes/dono/viagens.tsx');

  s = replaceRequired(
    s,
    `                  <div className="text-xs text-muted">\n                    {freightModeLabel(t.freightMode)}\n                  </div>`,
    `                  <div className="text-xs text-muted">\n                    {t.freightMode === "ton"\n                      ? \`${'${freightModeLabel(t.freightMode)}'} · ${'${brl(t.pricePerTon)}'}/t\`\n                      : freightModeLabel(t.freightMode)}\n                  </div>`,
    'desktop ton price',
  );

  s = replaceRequired(
    s,
    '      <dl className="mt-3 grid grid-cols-3 gap-2 text-sm">',
    '      <dl className="mt-3 grid grid-cols-2 gap-2 text-sm">',
    'mobile grid without diesel',
  );

  s = replaceRequired(
    s,
    `          <dd className="text-[10px] text-muted">\n            {freightModeLabel(trip.freightMode)}\n          </dd>`,
    `          <dd className="text-[10px] text-muted">\n            {trip.freightMode === "ton"\n              ? \`${'${freightModeLabel(trip.freightMode)}'} · ${'${brl(trip.pricePerTon)}'}/t\`\n              : freightModeLabel(trip.freightMode)}\n          </dd>`,
    'mobile ton price',
  );

  s = replaceRequired(
    s,
    `        <div>\n          <dt className="text-[10px] uppercase tracking-[0.12em] text-subtle">\n            Diesel\n          </dt>\n          <dd className="tabular">{brl(trip.dieselCost)}</dd>\n        </div>\n`,
    '',
    'remove mobile diesel card',
  );

  s = replaceRequired(
    s,
    `  dieselLiters: string;\n  dieselPrice: string;\n`,
    '',
    'remove diesel bulk types',
  );

  s = replaceRequired(
    s,
    `    loadedTons: "", grossWeight: "", netWeight: "", pricePerTon: "", kmStart: "", kmEnd: "", dieselLiters: "", dieselPrice: "",`,
    `    loadedTons: "", grossWeight: "", netWeight: "", pricePerTon: "", kmStart: "", kmEnd: "",`,
    'remove diesel bulk defaults',
  );

  s = replaceRequired(
    s,
    `          dieselLiters: numberOr(changes.dieselLiters, source.dieselLiters),\n          dieselPrice: numberOr(changes.dieselPrice, source.dieselPrice),`,
    `          dieselLiters: source.dieselLiters,\n          dieselPrice: source.dieselPrice,`,
    'preserve diesel during bulk edits',
  );

  s = replaceRequired(
    s,
    `        <Field label="Litros diesel"><Input inputMode="decimal" value={form.dieselLiters} onChange={(e) => set("dieselLiters", e.target.value)} placeholder="Não alterar" /></Field>\n        <Field label="Preço diesel"><Input inputMode="decimal" value={form.dieselPrice} onChange={(e) => set("dieselPrice", e.target.value)} placeholder="Não alterar" /></Field>\n`,
    '',
    'remove diesel bulk fields',
  );

  write('src/routes/dono/viagens.tsx', s);
}

// App do motorista: trocar o select nativo por botões grandes, fáceis de tocar,
// e exigir uma modalidade antes de enviar o lançamento.
{
  let s = read('src/routes/motorista.tsx');

  s = replaceRequired(
    s,
    '    if (!fleetId) return toast.error("Escolha o conjunto.");\n    try {',
    '    if (!fleetId) return toast.error("Escolha o conjunto.");\n    if (!freightMode) return toast.error("Escolha o modo de frete.");\n    try {',
    'require freight mode',
  );

  s = replaceRequired(
    s,
    '        freightMode: freightMode || null,',
    '        freightMode,',
    'submit selected freight mode',
  );

  s = replaceRequired(
    s,
    `      if (freightMode) localStorage.setItem(MODE_KEY, freightMode);\n      else localStorage.removeItem(MODE_KEY);`,
    `      localStorage.setItem(MODE_KEY, freightMode);`,
    'persist selected mode',
  );

  s = replaceRequired(
    s,
    '          Para enviar, basta escolher motorista e conjunto. Ticket, KM, toneladas e modo de frete são opcionais e podem ser completados pela gerência.',
    '          Escolha motorista, conjunto e o modo de frete. Ticket, KM e toneladas podem ser completados pela gerência.',
    'driver intro copy',
  );

  s = replaceRequired(
    s,
    `          <Field label="Modo de frete" hint="Opcional — pode ser ajustado pela gerência">\n            <Select\n              value={freightMode}\n              onChange={(e) => setFreightMode(e.target.value as FreightMode | "")}\n            >\n              <option value="">A definir pela gerência</option>\n              <option value="ton">Por tonelada</option>\n              <option value="trip">Por viagem</option>\n              <option value="cegonha">Cegonha</option>\n              <option value="caixinha">Caixinha</option>\n            </Select>\n          </Field>`,
    `          <Field label="Modo de frete" hint="Obrigatório — toque em uma opção">\n            <div className="grid grid-cols-2 gap-2">\n              {(["ton", "trip", "cegonha", "caixinha"] as FreightMode[]).map((mode) => (\n                <button\n                  key={mode}\n                  type="button"\n                  aria-pressed={freightMode === mode}\n                  onClick={() => setFreightMode(mode)}\n                  className={\`min-h-14 rounded-xl border px-3 py-3 text-left transition \${\n                    freightMode === mode\n                      ? "border-fg bg-surface-2 text-fg ring-1 ring-fg"\n                      : "border-border bg-surface text-muted"\n                  }\`}\n                >\n                  <span className="block font-medium">{freightModeLabel(mode)}</span>\n                  <span className="mt-1 block text-[11px] opacity-70">\n                    {freightMode === mode ? "Selecionado" : "Selecionar"}\n                  </span>\n                </button>\n              ))}\n            </div>\n          </Field>`,
    'touch freight mode buttons',
  );

  write('src/routes/motorista.tsx', s);
}

console.log('[driver-mode-trip-display] driver freight buttons + trips ton price + trips diesel removal applied');
