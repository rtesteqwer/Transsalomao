import fs from 'node:fs';
import path from 'node:path';

const target = process.argv[2];
if (!target) throw new Error('caixa-ton-viagens: target missing');
const repo = process.cwd();
const file = (rel) => path.join(target, rel);
const read = (rel) => fs.readFileSync(file(rel), 'utf8');
const write = (rel, text) => fs.writeFileSync(file(rel), text);
const snippet = (name) => fs.readFileSync(path.join(repo, 'render-overrides', name), 'utf8');
function required(text, needle, replacement, label) {
  if (text.includes(replacement)) return text;
  if (!text.includes(needle)) throw new Error(`caixa-ton-viagens: pattern not found (${label})`);
  return text.replace(needle, replacement);
}

{
  let s = read('src/lib/parse.ts');
  if (!s.includes('.replace(/R\\$/gi, "")')) {
    s = required(s,
      '  const t = raw.trim().replace(/\\s/g, "");',
      '  const t = raw.trim().replace(/R\\$/gi, "").replace(/\\s/g, "");',
      'currency number parsing');
  }
  write('src/lib/parse.ts', s);
}

{
  let s = read('src/lib/api.ts');
  if (!s.includes('export const closeTonReport')) {
    const marker = 'export const deleteTrip = createServerFn({ method: "POST" })';
    if (!s.includes(marker)) throw new Error('caixa-ton-viagens: api marker missing');
    s = s.replace(marker, snippet('close-ton-report.snippet.ts') + '\n\n' + marker);
  }
  write('src/lib/api.ts', s);
}

{
  let s = read('src/lib/use-fleet.ts');
  if (!s.includes('  closeTonReport,')) {
    s = required(s, '  acceptReports,\n', '  acceptReports,\n  closeTonReport,\n', 'closeTon import');
  }
  if (!s.includes('const closeTon = useMutation')) {
    const marker = '  const trip = useMutation({\n    mutationFn: (data: Parameters<typeof upsertTrip>[0]["data"]) => upsertTrip({ data }),\n    onSuccess: invalidate,\n  });';
    if (!s.includes(marker)) throw new Error('caixa-ton-viagens: trip mutation marker missing');
    const add = '\n  const closeTon = useMutation({\n    mutationFn: (data: Parameters<typeof closeTonReport>[0]["data"]) => closeTonReport({ data }),\n    onSuccess: invalidate,\n  });';
    s = s.replace(marker, marker + add);
  }
  if (!s.includes('    closeTon,')) {
    const returnAt = s.indexOf('  return {');
    const tripAt = s.indexOf('    trip,', returnAt);
    if (returnAt < 0 || tripAt < 0) throw new Error('caixa-ton-viagens: trip return entry missing');
    const insertAt = tripAt + '    trip,'.length;
    s = s.slice(0, insertAt) + '\n    closeTon,' + s.slice(insertAt);
  }
  write('src/lib/use-fleet.ts', s);
}

{
  let s = read('src/routes/dono/lancamentos.tsx');
  if (!s.includes('useFleetMutations();')) {
    throw new Error('caixa-ton-viagens: useFleetMutations call missing');
  }
  if (!/const \{[^}]*\bcloseTon\b[^}]*\} = useFleetMutations\(\);/.test(s)) {
    s = s.replace(/const \{([^}]*?)\btrip,([^}]*)\} = useFleetMutations\(\);/, 'const {$1trip, closeTon,$2} = useFleetMutations();');
    if (!/const \{[^}]*\bcloseTon\b[^}]*\} = useFleetMutations\(\);/.test(s)) throw new Error('caixa-ton-viagens: could not add closeTon to mutations destructure');
  }
  if (!s.includes('await closeTon.mutateAsync({')) {
    const labelAt = s.indexOf('submitLabel="Lançar no painel"');
    const submitAt = s.indexOf('              onSubmit={async (payload) => {', labelAt);
    const submitEndMarker = '\n              }}';
    const submitEnd = s.indexOf(submitEndMarker, submitAt);
    if (labelAt < 0 || submitAt < 0 || submitEnd < 0) throw new Error('caixa-ton-viagens: submit block bounds missing');
    const newSubmit = [
      '              onSubmit={async (payload) => {',
      '                try {',
      '                  if (open?.freightMode === "ton" && payload.reportId) {',
      '                    const weight = payload.netWeight > 0 ? payload.netWeight : Number(open.tons ?? 0);',
      '                    if (payload.pricePerTon <= 0) throw new Error("Informe o valor em R$/t para fechar a viagem.");',
      '                    if (weight <= 0) throw new Error("O lançamento não possui peso válido para fechar a viagem.");',
      '                    await closeTon.mutateAsync({',
      '                      reportId: payload.reportId,',
      '                      pricePerTon: payload.pricePerTon,',
      '                      date: payload.date,',
      '                      client: payload.client,',
      '                      origin: payload.origin,',
      '                      destination: payload.destination,',
      '                      loadedTons: payload.loadedTons > 0 ? payload.loadedTons : weight,',
      '                      grossWeight: payload.grossWeight,',
      '                      netWeight: weight,',
      '                      kmStart: payload.kmStart,',
      '                      kmEnd: payload.kmEnd,',
      '                      dieselLiters: payload.dieselLiters,',
      '                      dieselPrice: payload.dieselPrice,',
      '                    });',
      '                  } else {',
      '                    await trip.mutateAsync(payload);',
      '                  }',
      '                  toast.success(`Viagem ${payload.code} lançada.`);',
      '                  setOpen(null);',
      '                } catch (err) {',
      '                  toast.error(err instanceof Error ? err.message : "Não foi possível lançar a viagem no painel.");',
      '                }',
      '              }}',
    ].join('\n');
    s = s.slice(0, submitAt) + newSubmit + s.slice(submitEnd + submitEndMarker.length);
  }
  s = s.replace('pending={trip.isPending}', 'pending={trip.isPending || closeTon.isPending}');
  write('src/routes/dono/lancamentos.tsx', s);
}

{
  let s = read('src/routes/dono/viagens.tsx');
  if (!s.includes('                "Valor/t",')) {
    s = required(s,
      '                "Motorista",\n                "Peso",\n                "Frete",',
      '                "Motorista",\n                "Peso líquido",\n                "Valor/t",\n                "Frete",',
      'viagens headers');
    const oldCells = [
      '                <td className="px-3 py-3 tabular">{tons(t.netWeight)}</td>',
      '                <td className="px-3 py-3 tabular">',
      '                  <div>{brl(t.freight)}</div>',
      '                  <div className="text-xs text-muted">',
      '                    {t.freightMode === "ton"',
      '                      ? `${freightModeLabel(t.freightMode)} · ${brl(t.pricePerTon)}/t`',
      '                      : freightModeLabel(t.freightMode)}',
      '                  </div>',
      '                </td>',
    ].join('\n');
    if (!s.includes(oldCells)) throw new Error('caixa-ton-viagens: viagens desktop cells missing');
    const newCells = [
      '                <td className="px-3 py-3 tabular">{t.netWeight > 0 ? tons(t.netWeight) : "—"}</td>',
      '                <td className="px-3 py-3 tabular">',
      '                  {t.freightMode === "ton" ? `${brl(t.pricePerTon)}/t` : "—"}',
      '                </td>',
      '                <td className="px-3 py-3 tabular">{brl(t.freight)}</td>',
    ].join('\n');
    s = s.replace(oldCells, newCells);
  }
  if (!s.includes('            Peso líquido\n          </dt>')) {
    const marker = [
      '      <dl className="mt-3 grid grid-cols-2 gap-2 text-sm">',
      '        <div>',
      '          <dt className="text-[10px] uppercase tracking-[0.12em] text-subtle">',
      '            Frete',
      '          </dt>',
    ].join('\n');
    if (!s.includes(marker)) throw new Error('caixa-ton-viagens: mobile card marker missing');
    const replacement = [
      '      <dl className="mt-3 grid grid-cols-2 gap-2 text-sm">',
      '        <div>',
      '          <dt className="text-[10px] uppercase tracking-[0.12em] text-subtle">',
      '            Peso líquido',
      '          </dt>',
      '          <dd className="tabular">{trip.netWeight > 0 ? tons(trip.netWeight) : "—"}</dd>',
      '        </div>',
      '        <div>',
      '          <dt className="text-[10px] uppercase tracking-[0.12em] text-subtle">',
      '            Valor por tonelada',
      '          </dt>',
      '          <dd className="tabular">{trip.freightMode === "ton" ? `${brl(trip.pricePerTon)}/t` : "—"}</dd>',
      '        </div>',
      '        <div>',
      '          <dt className="text-[10px] uppercase tracking-[0.12em] text-subtle">',
      '            Frete',
      '          </dt>',
    ].join('\n');
    s = s.replace(marker, replacement);
  }
  write('src/routes/dono/viagens.tsx', s);
}

console.log('[caixa-ton-viagens] dedicated per-ton close and explicit trip weight/R$/t applied');
