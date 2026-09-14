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
// A fonte continua sendo data.trips enriquecida, portanto qualquer edição de
// motorista/modo reflete no contador, nos totais e na seleção em lote.
{
  const rel = 'src/routes/dono/viagens.tsx';
  let s = read(rel);

  s = replaceRequired(
    s,
    `  const selectedDriver = data?.drivers.find((d) => d.id === driverFilter);\n  const selectedTrips = data?.trips.filter((t) => selectedIds.includes(t.id)) ?? [];\n  const compactRows = rows.filter((t) => t.freightMode !== "caixinha" && t.freightMode !== "cegonha");\n  const groupedModeRows = (["caixinha", "cegonha"] as FreightMode[])\n    .map((mode) => {\n      const items = rows.filter((t) => t.freightMode === mode);\n      return {\n        mode,\n        items,\n        count: items.length,\n        freight: items.reduce((sum, t) => sum + Number(t.freight ?? 0), 0),\n        commission: items.reduce((sum, t) => sum + Number(t.commissionValue ?? 0), 0),\n        result: items.reduce((sum, t) => sum + Number(t.grossResult ?? 0), 0),\n      };\n    })\n    .filter((group) => group.count > 0);\n  const allVisibleSelected = compactRows.length > 0 && compactRows.every((t) => selectedIds.includes(t.id));`,
    `  const selectedDriver = data?.drivers.find((d) => d.id === driverFilter);\n  const selectedTrips = data?.trips.filter((t) => selectedIds.includes(t.id)) ?? [];\n  const compactRows = rows.filter((t) => t.freightMode !== "caixinha" && t.freightMode !== "cegonha");\n  const groupedModeRows = Array.from(\n    rows.reduce(\n      (groups, t) => {\n        if (t.freightMode !== "caixinha" && t.freightMode !== "cegonha") return groups;\n        const key = String(t.driverId) + "|" + t.freightMode;\n        const current = groups.get(key) ?? {\n          key,\n          mode: t.freightMode as FreightMode,\n          driverId: t.driverId,\n          driverName: t.driverName,\n          items: [] as ComputedTrip[],\n          count: 0,\n          freight: 0,\n          commission: 0,\n          result: 0,\n        };\n        current.items.push(t);\n        current.count += 1;\n        current.freight += Number(t.freight ?? 0);\n        current.commission += Number(t.commissionValue ?? 0);\n        current.result += Number(t.grossResult ?? 0);\n        groups.set(key, current);\n        return groups;\n      },\n      new Map<string, {\n        key: string;\n        mode: FreightMode;\n        driverId: string;\n        driverName: string;\n        items: ComputedTrip[];\n        count: number;\n        freight: number;\n        commission: number;\n        result: number;\n      }>(),\n    ).values(),\n  ).sort((a, b) => a.driverName.localeCompare(b.driverName) || a.mode.localeCompare(b.mode));\n  const allVisibleSelected = compactRows.length > 0 && compactRows.every((t) => selectedIds.includes(t.id));`,
    'viagens grouped state per driver',
  );

  s = replaceRequired(
    s,
    `<div key={group.mode} className="rounded-xl border border-accent/30 bg-bg p-4">`,
    `<div key={group.key} className="rounded-xl border border-accent/30 bg-bg p-4">`,
    'viagens group unique key',
  );

  s = replaceRequired(
    s,
    `<p className="mt-1 font-display text-xl font-semibold">{freightModeLabel(group.mode)}</p>`,
    `<p className="mt-1 font-display text-xl font-semibold">{freightModeLabel(group.mode)}</p>\n                        <p className="mt-1 text-sm font-medium text-fg">{group.driverName}</p>`,
    'viagens group driver label',
  );

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
