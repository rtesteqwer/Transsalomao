import fs from 'node:fs';
import path from 'node:path';

const target = process.argv[2];
if (!target || !fs.existsSync(target)) throw new Error('daily-mode: target missing');
const repo = process.cwd();
const file = (rel) => path.join(target, rel);
const read = (rel) => fs.readFileSync(file(rel), 'utf8');
const write = (rel, text) => fs.writeFileSync(file(rel), text);

function required(text, before, after, label) {
  if (!text.includes(before)) throw new Error(`daily-mode: pattern not found (${label})`);
  return text.replace(before, after);
}

// Additive migration: store the daily rate separately from tons/KM.
fs.copyFileSync(
  path.join(repo, 'render-overrides', '0012_report_daily_value.sql'),
  file('migrations/0012_report_daily_value.sql'),
);

// Shared type surface.
{
  let s = read('src/lib/types.ts');
  if (!s.includes('dailyValue: number;')) {
    s = required(
      s,
      '  tons: number;\n  freightMode: FreightMode | null;',
      '  tons: number;\n  dailyValue: number;\n  freightMode: FreightMode | null;',
      'DriverReport dailyValue',
    );
  }
  write('src/lib/types.ts', s);
}

// Server API: expose daily_value and provide a dedicated driver submission endpoint.
{
  let s = read('src/lib/api.ts');
  const mapStart = s.indexOf('function mapReport(');
  if (mapStart < 0) throw new Error('daily-mode: mapReport missing');
  const mapEnd = s.indexOf('\n}\n', mapStart);
  if (mapEnd < 0) throw new Error('daily-mode: mapReport end missing');
  let mapBlock = s.slice(mapStart, mapEnd + 3);
  if (!mapBlock.includes('dailyValue:')) {
    mapBlock = required(
      mapBlock,
      '    tons: num(r.tons),',
      '    tons: num(r.tons),\n    dailyValue: num(r.daily_value),',
      'mapReport dailyValue',
    );
    s = s.slice(0, mapStart) + mapBlock + s.slice(mapEnd + 3);
  }

  if (!s.includes('export const upsertDailyReport =')) {
    const marker = 'export const upsertReport =';
    const idx = s.indexOf(marker);
    if (idx < 0) throw new Error('daily-mode: upsertReport marker missing');
    const block = `const dailyReportSchema = z.object({\n  driverId: z.string().min(1),\n  fleetId: z.string().min(1),\n  tons: z.number().min(0).default(0),\n  dailyValue: z.number().positive(\"Informe um valor de diária maior que zero\"),\n});\n\nexport const upsertDailyReport = createServerFn({ method: \"POST\" })\n  .validator(dailyReportSchema)\n  .handler(async ({ data }) => {\n    const sql = await getSql();\n    const [driver] = await sql<{ id: string }>\`select id from drivers where id = \${data.driverId} and status = 'ativo' limit 1\`;\n    if (!driver) throw new Error(\"Motorista inválido ou inativo.\");\n    const [fleet] = await sql<{ id: string }>\`select id from fleets where id = \${data.fleetId} and status = 'ativo' limit 1\`;\n    if (!fleet) throw new Error(\"Conjunto inválido ou inativo.\");\n    const id = newId(\"report\");\n    const ticket = await nextTicketCode(sql);\n    await sql\`\n      insert into reports (id, ticket, driver_id, fleet_id, km, tons, freight_mode, daily_value, status, created_at)\n      values (\${id}, \${ticket}, \${data.driverId}, \${data.fleetId}, 0, \${data.tons}, 'trip', \${data.dailyValue}, 'pendente', now())\n    \`;\n    return { ok: true, id, ticket };\n  });\n\n`;
    s = s.slice(0, idx) + block + s.slice(idx);
  }
  write('src/lib/api.ts', s);
}

// React Query mutation for driver daily submissions.
{
  let s = read('src/lib/use-fleet.ts');
  if (!s.includes('upsertDailyReport,')) {
    s = required(s, '  upsertReport,', '  upsertDailyReport,\n  upsertReport,', 'use-fleet import');
  }
  if (!s.includes('const dailyReport = useMutation')) {
    s = required(
      s,
      '  const report = useMutation({',
      `  const dailyReport = useMutation({\n    mutationFn: (data: Parameters<typeof upsertDailyReport>[0][\"data\"]) =>\n      upsertDailyReport({ data }),\n    onSuccess: invalidate,\n  });\n  const report = useMutation({`,
      'dailyReport mutation',
    );
  }
  if (!s.includes('    dailyReport,')) {
    s = required(s, '    report,', '    dailyReport,\n    report,', 'dailyReport return');
  }
  write('src/lib/use-fleet.ts', s);
}

// Driver screen: Diárias with required rate field.
{
  let s = read('src/routes/motorista.tsx');
  s = required(s, '  const { report } = useFleetMutations();', '  const { report, dailyReport } = useFleetMutations();', 'driver mutation destructure');
  if (!s.includes('const [dailyValue, setDailyValue]')) {
    s = required(
      s,
      '  const [tons, setTons] = useState(\"\");\n  const [tripCount, setTripCount] = useState(\"1\");',
      '  const [tons, setTons] = useState(\"\");\n  const [dailyValue, setDailyValue] = useState(\"\");\n  const [tripCount, setTripCount] = useState(\"1\");',
      'driver daily state',
    );
  }
  s = required(
    s,
    '    const tonsN = parseLocaleNumber(tons);\n    const batchMode = freightMode === \"cegonha\" || freightMode === \"caixinha\";',
    '    const tonsN = parseLocaleNumber(tons);\n    const dailyValueN = parseLocaleNumber(dailyValue);\n    const batchMode = freightMode === \"cegonha\" || freightMode === \"caixinha\";',
    'driver parse daily value',
  );
  s = required(
    s,
    '    if (!freightMode) return toast.error(\"Escolha o modo de frete.\");\n    if (batchMode',
    '    if (!freightMode) return toast.error(\"Escolha o modo de frete.\");\n    if (freightMode === \"trip\" && (!dailyValueN || dailyValueN <= 0)) return toast.error(\"Informe o valor da diária.\");\n    if (batchMode',
    'driver validate daily value',
  );
  s = required(
    s,
    `        const res = await report.mutateAsync({\n          ticket: itemTicket,\n          driverId,\n          fleetId,\n          km: 0,\n          tons: batchMode ? 0 : (tonsN ?? 0),\n          freightMode,\n        });`,
    `        const res = freightMode === \"trip\"\n          ? await dailyReport.mutateAsync({\n              driverId,\n              fleetId,\n              tons: tonsN ?? 0,\n              dailyValue: dailyValueN ?? 0,\n            })\n          : await report.mutateAsync({\n              ticket: itemTicket,\n              driverId,\n              fleetId,\n              km: 0,\n              tons: batchMode ? 0 : (tonsN ?? 0),\n              freightMode,\n            });`,
    'driver daily submit',
  );
  s = required(s, '      setTons(\"\");\n      if (batchMode)', '      setTons(\"\");\n      setDailyValue(\"\");\n      if (batchMode)', 'driver daily cleanup');

  const oldUi = `          {freightMode === \"cegonha\" || freightMode === \"caixinha\" ? (\n            <Field label=\"Quantidade de viagens\" hint=\"Lançadas ao mesmo tempo\">\n              <Input\n                value={tripCount}\n                onChange={(e) => setTripCount(e.target.value.replace(/\\D/g, \"\"))}\n                inputMode=\"numeric\"\n                placeholder=\"1\"\n                className=\"h-14 font-display text-2xl tabular tracking-wide\"\n              />\n              <p className=\"mt-2 text-xs text-muted\">Cada quantidade gera um lançamento separado no Painel Gerência.</p>\n            </Field>\n          ) : (\n            <Field label=\"Toneladas\" hint=\"Opcional\">\n              <Input\n                value={tons}\n                onChange={(e) => setTons(e.target.value)}\n                inputMode=\"decimal\"\n                placeholder=\"32,6\"\n                className=\"h-14 font-display text-2xl tabular tracking-wide\"\n              />\n            </Field>\n          )}`;
  const newUi = `          {freightMode === \"cegonha\" || freightMode === \"caixinha\" ? (\n            <Field label=\"Quantidade de viagens\" hint=\"Lançadas ao mesmo tempo\">\n              <Input\n                value={tripCount}\n                onChange={(e) => setTripCount(e.target.value.replace(/\\D/g, \"\"))}\n                inputMode=\"numeric\"\n                placeholder=\"1\"\n                className=\"h-14 font-display text-2xl tabular tracking-wide\"\n              />\n              <p className=\"mt-2 text-xs text-muted\">Cada quantidade gera um lançamento separado no Painel Gerência.</p>\n            </Field>\n          ) : freightMode === \"trip\" ? (\n            <Field label=\"Valor da diária (R$)\" hint=\"Obrigatório\">\n              <Input\n                value={dailyValue}\n                onChange={(e) => setDailyValue(e.target.value)}\n                inputMode=\"decimal\"\n                placeholder=\"650,00\"\n                className=\"h-14 font-display text-2xl tabular tracking-wide\"\n              />\n            </Field>\n          ) : (\n            <Field label=\"Toneladas\" hint=\"Opcional\">\n              <Input\n                value={tons}\n                onChange={(e) => setTons(e.target.value)}\n                inputMode=\"decimal\"\n                placeholder=\"32,6\"\n                className=\"h-14 font-display text-2xl tabular tracking-wide\"\n              />\n            </Field>\n          )}`;
  s = required(s, oldUi, newUi, 'driver daily field UI');
  s = s.replace('disabled={report.isPending ||', 'disabled={(report.isPending || dailyReport.isPending) ||');
  s = s.replace('{report.isPending ? \"Enviando…\" : \"Depositar no painel\"}', '{report.isPending || dailyReport.isPending ? \"Enviando…\" : \"Depositar no painel\"}');
  write('src/routes/motorista.tsx', s);
}

// Caixa: show the driver-entered daily value instead of tons for this mode.
{
  let s = read('src/routes/dono/lancamentos.tsx');
  s = s.replace(
    '{r.freightMode === "cegonha" || r.freightMode === "caixinha" ? "Lançamento" : "Toneladas"}',
    '{r.freightMode === "trip" ? "Valor da diária" : r.freightMode === "cegonha" || r.freightMode === "caixinha" ? "Lançamento" : "Toneladas"}',
  );
  s = s.replace(
    '{r.freightMode === "cegonha" || r.freightMode === "caixinha" ? "1 viagem" : `${num(r.tons, 2)} t`}',
    '{r.freightMode === "trip" ? brl(r.dailyValue) : r.freightMode === "cegonha" || r.freightMode === "caixinha" ? "1 viagem" : `${num(r.tons, 2)} t`}',
  );
  write('src/routes/dono/lancamentos.tsx', s);
}

// Site-wide visible terminology only; keep internal mode key `trip` for compatibility.
for (const rel of [
  'src/lib/calc.ts',
  'src/components/owner/trip-form.tsx',
  'src/routes/motorista.tsx',
  'src/routes/dono/lancamentos.tsx',
  'src/routes/dono/viagens.tsx',
  'src/routes/dono/totais.tsx',
  'src/routes/dono/cadastros.tsx',
  'src/routes/klebersom.tsx',
]) {
  if (!fs.existsSync(file(rel))) continue;
  let s = read(rel);
  s = s.replaceAll('Preço automático — Por viagem', 'Valor da diária');
  s = s.replaceAll('Valor por viagem', 'Valor da diária');
  s = s.replaceAll('Por viagem', 'Diárias');
  write(rel, s);
}

console.log('[daily-mode] Por viagem renamed to Diárias; driver daily value stored and attributed by driver');
