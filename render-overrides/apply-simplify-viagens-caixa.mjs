import fs from 'node:fs';
import path from 'node:path';

const target = process.argv[2];
if (!target) throw new Error('simplify-viagens-caixa: target missing');

function read(rel) {
  const p = path.join(target, rel);
  if (!fs.existsSync(p)) throw new Error(`simplify-viagens-caixa: missing ${rel}`);
  return fs.readFileSync(p, 'utf8');
}
function write(rel, text) {
  fs.writeFileSync(path.join(target, rel), text);
}
function replaceRequired(text, needle, replacement, label) {
  if (text.includes(replacement)) return text;
  if (!text.includes(needle)) throw new Error(`simplify-viagens-caixa: pattern not found (${label})`);
  return text.replace(needle, replacement);
}

// VIAGENS: Caixinha e Cegonha ficam agrupadas por motorista + modo.
// A fonte é sempre data.trips enriquecida, então qualquer alteração de
// motorista/modo reflete automaticamente no contador e nos totais do grupo.
{
  const rel = 'src/routes/dono/viagens.tsx';
  let s = read(rel);

  s = replaceRequired(
    s,
    `  const selectedDriver = data?.drivers.find((d) => d.id === driverFilter);\n  const selectedTrips = data?.trips.filter((t) => selectedIds.includes(t.id)) ?? [];\n  const allVisibleSelected = rows.length > 0 && rows.every((t) => selectedIds.includes(t.id));`,
    `  const selectedDriver = data?.drivers.find((d) => d.id === driverFilter);\n  const selectedTrips = data?.trips.filter((t) => selectedIds.includes(t.id)) ?? [];\n  const compactRows = rows.filter((t) => t.freightMode !== "caixinha" && t.freightMode !== "cegonha");\n  const groupedModeRows = Array.from(\n    rows.reduce(\n      (groups, t) => {\n        if (t.freightMode !== "caixinha" && t.freightMode !== "cegonha") return groups;\n        const key = String(t.driverId) + "|" + t.freightMode;\n        const current = groups.get(key) ?? {\n          key,\n          mode: t.freightMode as FreightMode,\n          driverId: t.driverId,\n          driverName: t.driverName,\n          items: [] as ComputedTrip[],\n          count: 0,\n          freight: 0,\n          commission: 0,\n          result: 0,\n        };\n        current.items.push(t);\n        current.count += 1;\n        current.freight += Number(t.freight ?? 0);\n        current.commission += Number(t.commissionValue ?? 0);\n        current.result += Number(t.grossResult ?? 0);\n        groups.set(key, current);\n        return groups;\n      },\n      new Map<string, {\n        key: string;\n        mode: FreightMode;\n        driverId: string;\n        driverName: string;\n        items: ComputedTrip[];\n        count: number;\n        freight: number;\n        commission: number;\n        result: number;\n      }>(),\n    ).values(),\n  ).sort((a, b) => a.driverName.localeCompare(b.driverName) || a.mode.localeCompare(b.mode));\n  const allVisibleSelected = compactRows.length > 0 && compactRows.every((t) => selectedIds.includes(t.id));`,
    'viagens grouped state per driver',
  );

  const groupUiMarker = `<p className="text-[11px] uppercase tracking-[0.16em] text-muted">Seleção em lote</p>`;
  const groupUi = `{groupedModeRows.length > 0 ? (\n            <div className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">\n              {groupedModeRows.map((group) => {\n                const allGroupSelected = group.items.every((item) => selectedIds.includes(item.id));\n                return (\n                  <div key={group.key} className="rounded-xl border border-accent/30 bg-bg p-4">\n                    <div className="flex items-start justify-between gap-3">\n                      <div>\n                        <p className="text-[10px] uppercase tracking-[0.16em] text-muted">Modo de frete</p>\n                        <p className="mt-1 font-display text-xl font-semibold">{freightModeLabel(group.mode)}</p>\n                        <p className="mt-1 text-sm font-medium text-fg">{group.driverName}</p>\n                      </div>\n                      <Badge>{group.count} viagem{group.count === 1 ? "" : "s"}</Badge>\n                    </div>\n                    <div className="mt-3 grid grid-cols-2 gap-2 text-sm">\n                      <div className="rounded-lg border border-border bg-surface px-3 py-2">\n                        <span className="block text-[10px] uppercase tracking-[0.12em] text-muted">Frete total</span>\n                        <strong className="mt-1 block">{brl(group.freight)}</strong>\n                      </div>\n                      <div className="rounded-lg border border-border bg-surface px-3 py-2">\n                        <span className="block text-[10px] uppercase tracking-[0.12em] text-muted">Resultado</span>\n                        <strong className="mt-1 block">{brl(group.result)}</strong>\n                      </div>\n                    </div>\n                    <Button\n                      className="mt-3 w-full"\n                      size="sm"\n                      variant={allGroupSelected ? "secondary" : "outline"}\n                      onClick={() =>\n                        setSelectedIds((ids) =>\n                          allGroupSelected\n                            ? ids.filter((id) => !group.items.some((item) => item.id === id))\n                            : Array.from(new Set([...ids, ...group.items.map((item) => item.id)])),\n                        )\n                      }\n                    >\n                      {allGroupSelected ? "Desmarcar grupo" : "Selecionar grupo"}\n                    </Button>\n                  </div>\n                );\n              })}\n            </div>\n          ) : null}\n          ${groupUiMarker}`;
  s = replaceRequired(s, groupUiMarker, groupUi, 'viagens grouped cards');

  s = s.replaceAll('ids.filter((id) => !rows.some((row) => row.id === id))', 'ids.filter((id) => !compactRows.some((row) => row.id === id))');
  s = s.replaceAll('Array.from(new Set([...ids, ...rows.map((row) => row.id)]))', 'Array.from(new Set([...ids, ...compactRows.map((row) => row.id)]))');
  s = s.replaceAll('disabled={rows.length === 0}', 'disabled={compactRows.length === 0}');

  const beforeMaps = (s.match(/\{rows\.map\(\((?:t|row)\) => \(/g) ?? []).length;
  s = s.replaceAll('{rows.map((t) => (', '{compactRows.map((t) => (');
  s = s.replaceAll('{rows.map((row) => (', '{compactRows.map((row) => (');
  const remainingMaps = (s.match(/\{rows\.map\(\((?:t|row)\) => \(/g) ?? []).length;
  if (beforeMaps < 2 || remainingMaps !== 0) {
    throw new Error(`simplify-viagens-caixa: expected visible rows maps >=2, found ${beforeMaps}, remaining ${remainingMaps}`);
  }

  write(rel, s);
}

// CAIXA / painel principal: deixa explícito o filtro por motorista e aplica também
// aos lançamentos pendentes e ao resumo por motorista.
{
  const rel = 'src/routes/dono/index.tsx';
  let s = read(rel);
  s = replaceRequired(s, 'Painel por motorista', 'Filtrar caixa por motorista', 'caixa filter label');

  s = replaceRequired(
    s,
    `  const pending = data?.reports.filter((r) => r.status === "pendente") ?? [];`,
    `  const pending = data?.reports.filter((r) => r.status === "pendente" && (driverFilter === "all" || r.driverId === driverFilter)) ?? [];`,
    'caixa pending filter',
  );

  s = replaceRequired(
    s,
    `    return totalsByDriver(allPeriodTrips, data.drivers);\n  }, [data, period]);`,
    `    return totalsByDriver(allPeriodTrips, data.drivers).filter((row) => driverFilter === "all" || row.driverId === driverFilter);\n  }, [data, period, driverFilter]);`,
    'caixa driver totals filter',
  );

  const selectBlock = `        <Select value={driverFilter} onChange={(e) => setDriverFilter(e.target.value)}>\n          <option value="all">Todos os motoristas</option>\n          {(data?.drivers ?? []).map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}\n        </Select>`;
  const selectWithHint = `${selectBlock}\n        <p className="mt-2 text-xs text-muted">O filtro atualiza faturamento, resultado, diesel, viagens, pendências e resumos do Caixa.</p>`;
  s = replaceRequired(s, selectBlock, selectWithHint, 'caixa filter hint');

  write(rel, s);
}

console.log('[simplify-viagens-caixa] Caixinha/Cegonha grouped by driver+mode in Viagens + Caixa driver filter applied');
