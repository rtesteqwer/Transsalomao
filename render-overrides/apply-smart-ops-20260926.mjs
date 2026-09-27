import fs from "node:fs";
import path from "node:path";

const target = process.argv[2];
if (!target || !fs.existsSync(target)) throw new Error("smart-ops: target missing");
const repo = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");

function src(rel) { return path.join(repo, rel); }
function dst(rel) { return path.join(target, rel); }
function read(rel) { return fs.readFileSync(dst(rel), "utf8"); }
function write(rel, value) { fs.mkdirSync(path.dirname(dst(rel)), { recursive: true }); fs.writeFileSync(dst(rel), value); }
function copy(source, dest) { write(dest, fs.readFileSync(src(source), "utf8")); }
function replaceRequired(text, before, after, label) {
  if (text.includes(after)) return text;
  if (!text.includes(before)) throw new Error("smart-ops: pattern not found (" + label + ")");
  return text.replace(before, after);
}
const lines = (...items) => items.join("\n");

copy("render-overrides/smart-search-20260926.tsx", "src/components/smart-search.tsx");
copy("render-overrides/caixa-ticket-summary-20260926.tsx", "src/components/caixa-ticket-summary.tsx");
copy("render-overrides/ticket-meta-smart-20260926.ts", "src/routes/api/ticket-meta.ts");

// VIAGENS
{
  const rel = "src/routes/dono/viagens.tsx";
  let s = read(rel);
  s = replaceRequired(
    s,
    'import { Button } from "@/components/ui/button";',
    lines(
      'import { Button } from "@/components/ui/button";',
      'import { SmartSearch, buildSmartSuggestions, smartSearchActive, smartSearchMatches } from "@/components/smart-search";'
    ),
    "viagens smart search import"
  );

  s = replaceRequired(
    s,
    lines(
      '    const s = q.trim().toLowerCase();',
      '    if (!s) return all;',
      '    return all.filter((t) =>',
      '      [',
      '        t.code,',
      '        t.client,',
      '        t.origin,',
      '        t.destination,',
      '        t.driverName,',
      '        t.fleetName,',
      '        t.tractorPlate,',
      '        t.trailerPlate,',
      '      ]',
      '        .join(" ")',
      '        .toLowerCase()',
      '        .includes(s),',
      '    );'
    ),
    lines(
      '    if (!smartSearchActive(q)) return all;',
      '    return all.filter((t) => smartSearchMatches(q, [',
      '      t.code, t.client, t.origin, t.destination, t.driverName, t.fleetName,',
      '      t.tractorPlate, t.trailerPlate, freightModeLabel(t.freightMode), t.date,',
      '    ]));'
    ),
    "viagens minimum search"
  );

  s = replaceRequired(
    s,
    '  const selectedDriver = data?.drivers.find((d) => d.id === driverFilter);',
    lines(
      '  const searchSuggestions = useMemo(() => buildSmartSuggestions(',
      '    (data?.trips ?? []).flatMap((trip) => {',
      '      const driver = data?.drivers.find((d) => d.id === trip.driverId);',
      '      const fleet = data?.fleets.find((f) => f.id === trip.fleetId);',
      '      return [trip.code, trip.client, trip.origin, trip.destination, driver?.name, fleet?.name, fleet?.tractorPlate, fleet?.trailerPlate];',
      '    }), q,',
      '  ), [data, q]);',
      '',
      '  const selectedDriver = data?.drivers.find((d) => d.id === driverFilter);'
    ),
    "viagens ranked suggestions"
  );

  s = replaceRequired(
    s,
    lines(
      '        <Input',
      '          placeholder="Buscar ticket, motorista, rota…"',
      '          value={q}',
      '          onChange={(e) => setQ(e.target.value)}',
      '        />'
    ),
    '        <SmartSearch value={q} onChange={setQ} suggestions={searchSuggestions} placeholder="Ticket, motorista, empresa, rota ou placa — mínimo 3 letras" label="Pesquisar viagens" />',
    "viagens search field"
  );

  s = replaceRequired(
    s,
    '        {trip.origin || "—"} → {trip.destination || "—"}',
    '        {trip.origin || trip.destination ? <>{trip.origin || "Origem não informada"} → {trip.destination || "Destino não informado"}</> : null}',
    "viagens empty route"
  );
  s = replaceRequired(
    s,
    '        <Badge>{integer(trip.kmDriven)} km</Badge>',
    '        {trip.kmDriven > 0 ? <Badge>{integer(trip.kmDriven)} km</Badge> : null}',
    "viagens empty km"
  );

  const deleteButtonBefore = lines(
    '          <Button variant="secondary" onClick={exportTripsExcel} disabled={compactRows.length === 0}>',
    '            Excel colorido',
    '          </Button>',
    '          <Button',
    '            onClick={() =>'
  );
  if (s.includes(deleteButtonBefore)) {
    s = s.replace(
      deleteButtonBefore,
      lines(
        '          <Button variant="secondary" onClick={exportTripsExcel} disabled={compactRows.length === 0}>',
        '            Excel colorido',
        '          </Button>',
        '          <Button',
        '            variant="ghost"',
        '            className="text-danger"',
        '            disabled={removeTrip.isPending}',
        '            onClick={() => {',
        '              if (selectedTrips.length === 0) {',
        '                document.getElementById("bulk-trip-selection")?.scrollIntoView({ behavior: "smooth", block: "center" });',
        '                toast.info("Selecione as viagens que deseja apagar.");',
        '                return;',
        '              }',
        '              void handleBulkDelete();',
        '            }}',
        '          >',
        '            <Trash2 className="size-4" />',
        '            {selectedTrips.length > 0 ? `Apagar selecionadas (${selectedTrips.length})` : "Apagar viagens"}',
        '          </Button>',
        '          <Button',
        '            onClick={() =>'
      )
    );
    s = s.replace(
      '      <section className="mt-6 rounded-xl border border-border bg-surface p-4">',
      '      <section id="bulk-trip-selection" className="mt-6 rounded-xl border border-border bg-surface p-4">'
    );
  }
  write(rel, s);
}

// ABASTECIMENTOS
{
  const rel = "src/routes/dono/abastecimentos.tsx";
  let s = read(rel);
  s = replaceRequired(
    s,
    'import { Button } from "@/components/ui/button";',
    lines(
      'import { Button } from "@/components/ui/button";',
      'import { SmartSearch, buildSmartSuggestions, smartSearchMatches } from "@/components/smart-search";'
    ),
    "fuel smart search import"
  );
  s = replaceRequired(
    s,
    '  const [fleetFilter, setFleetFilter] = useState("all");',
    lines(
      '  const [fleetFilter, setFleetFilter] = useState("all");',
      '  const [search, setSearch] = useState("");'
    ),
    "fuel search state"
  );

  s = replaceRequired(
    s,
    lines(
      '  const rows = useMemo(() => {',
      '    return fleetFilter === "all"',
      '      ? consumptionRows',
      '      : consumptionRows.filter((f) => f.fleetId === fleetFilter);',
      '  }, [consumptionRows, fleetFilter]);'
    ),
    lines(
      '  const rows = useMemo(() => {',
      '    let filtered = fleetFilter === "all" ? consumptionRows : consumptionRows.filter((f) => f.fleetId === fleetFilter);',
      '    filtered = filtered.filter((row) => {',
      '      const fleet = data?.fleets.find((f) => f.id === row.fleetId);',
      '      const driver = data?.drivers.find((d) => d.id === row.driverId);',
      '      return smartSearchMatches(search, [row.date, row.station, row.notes, driver?.name, fleet?.name, fleet?.tractorPlate, fleet?.trailerPlate]);',
      '    });',
      '    return filtered;',
      '  }, [consumptionRows, fleetFilter, search, data]);',
      '',
      '  const searchSuggestions = useMemo(() => buildSmartSuggestions(',
      '    (data?.fuelings ?? []).flatMap((row) => {',
      '      const fleet = data?.fleets.find((f) => f.id === row.fleetId);',
      '      const driver = data?.drivers.find((d) => d.id === row.driverId);',
      '      return [row.station, row.notes, driver?.name, fleet?.name, fleet?.tractorPlate, fleet?.trailerPlate];',
      '    }), search,',
      '  ), [data, search]);'
    ),
    "fuel filtered rows"
  );

  s = replaceRequired(
    s,
    lines(
      '      <div className="mt-6 max-w-sm">',
      '        <Field label="Filtrar por conjunto">'
    ),
    lines(
      '      <div className="mt-6 grid gap-3 sm:grid-cols-2">',
      '        <SmartSearch value={search} onChange={setSearch} suggestions={searchSuggestions} placeholder="Posto, motorista, conjunto ou placa — mínimo 3 letras" label="Pesquisar abastecimentos" />',
      '        <Field label="Filtrar por conjunto">'
    ),
    "fuel search ui"
  );

  s = replaceRequired(
    s,
    '                    <p className="font-display text-2xl font-semibold">{fleet?.name ?? "Conjunto"}</p>',
    '                    {fleet?.name ? <p className="font-display text-2xl font-semibold">{fleet.name}</p> : null}',
    "fuel blank fleet"
  );
  s = replaceRequired(
    s,
    '                      {formatDate(row.date)} · {driver?.name ?? "Sem motorista"}{row.station ? ` · ${row.station}` : ""}',
    '                      {[formatDate(row.date), driver?.name, row.station].filter(Boolean).join(" · ")}',
    "fuel compact header"
  );
  s = replaceRequired(
    s,
    '                  <Metric label="Odômetro" value={`${integer(row.km)} km`} compact />',
    '                  {row.km > 0 ? <Metric label="Odômetro" value={`${integer(row.km)} km`} compact /> : null}',
    "fuel hide zero odometer"
  );
  s = replaceRequired(
    s,
    '                  <Metric label="Carreta" value={fleet?.trailerPlate ?? "—"} compact />',
    '                  {fleet?.trailerPlate ? <Metric label="Carreta" value={fleet.trailerPlate} compact /> : null}',
    "fuel hide blank trailer"
  );
  write(rel, s);
}

// DESPESAS + ADIANTAMENTOS
{
  const rel = "src/routes/dono/despesas.tsx";
  let s = read(rel);
  s = replaceRequired(
    s,
    'import { Button } from "@/components/ui/button";',
    lines(
      'import { Button } from "@/components/ui/button";',
      'import { SmartSearch, buildSmartSuggestions, smartSearchMatches } from "@/components/smart-search";'
    ),
    "expense smart search import"
  );
  s = replaceRequired(
    s,
    '  const [section, setSection] = useState<"despesas" | "adiantamentos">("despesas");',
    lines(
      '  const [section, setSection] = useState<"despesas" | "adiantamentos">("despesas");',
      '  const [search, setSearch] = useState("");'
    ),
    "expense search state"
  );

  s = replaceRequired(
    s,
    lines(
      '    if (assetFilter !== "all") all = all.filter((e) => e.category !== "Adiantamento" && e.assetType === assetFilter);',
      '    return all;',
      '  }, [data, fleetFilter, assetFilter, section]);'
    ),
    lines(
      '    if (assetFilter !== "all") all = all.filter((e) => e.category !== "Adiantamento" && e.assetType === assetFilter);',
      '    all = all.filter((row) => {',
      '      const fleet = data?.fleets.find((f) => f.id === row.fleetId);',
      '      const driver = data?.drivers.find((d) => d.id === row.driverId);',
      '      return smartSearchMatches(search, [row.description, row.category, row.notes, row.date, driver?.name, fleet?.name, fleet?.tractorPlate, fleet?.trailerPlate]);',
      '    });',
      '    return all;',
      '  }, [data, fleetFilter, assetFilter, section, search]);',
      '',
      '  const searchSuggestions = useMemo(() => buildSmartSuggestions(',
      '    (data?.expenses ?? []).flatMap((row) => {',
      '      const fleet = data?.fleets.find((f) => f.id === row.fleetId);',
      '      const driver = data?.drivers.find((d) => d.id === row.driverId);',
      '      return [row.description, row.category, row.notes, driver?.name, fleet?.name, fleet?.tractorPlate, fleet?.trailerPlate];',
      '    }), search,',
      '  ), [data, search]);'
    ),
    "expense filtered rows"
  );

  s = replaceRequired(
    s,
    '      <div className="mt-6 flex gap-1 rounded-lg border border-border bg-surface p-1 sm:w-fit">',
    lines(
      '      <div className="mt-6 max-w-2xl">',
      '        <SmartSearch value={search} onChange={setSearch} suggestions={searchSuggestions} placeholder="Motorista, conjunto, descrição, categoria ou placa — mínimo 3 letras" label="Pesquisar despesas e adiantamentos" />',
      '      </div>',
      '',
      '      <div className="mt-6 flex gap-1 rounded-lg border border-border bg-surface p-1 sm:w-fit">'
    ),
    "expense search ui"
  );

  s = replaceRequired(
    s,
    '                      <span className="text-xs text-muted">{isAdvance ? driver?.name ?? "Motorista não informado" : plate ?? "Sem placa"}</span>',
    '                      {(isAdvance ? driver?.name : plate) ? <span className="text-xs text-muted">{isAdvance ? driver?.name : plate}</span> : null}',
    "expense blank subtitle"
  );
  s = replaceRequired(
    s,
    '                      {formatDate(row.date)} · {isAdvance ? driver?.name ?? "Motorista" : fleet?.name ?? "Conjunto"} · {row.category}',
    '                      {[formatDate(row.date), isAdvance ? driver?.name : fleet?.name, row.category].filter(Boolean).join(" · ")}',
    "expense compact info"
  );
  write(rel, s);
}

// CAIXA
{
  const rel = "src/routes/dono/lancamentos.tsx";
  let s = read(rel);
  s = replaceRequired(
    s,
    'import { Button } from "@/components/ui/button";',
    lines(
      'import { Button } from "@/components/ui/button";',
      'import { SmartSearch, buildSmartSuggestions, smartSearchMatches } from "@/components/smart-search";',
      'import { CaixaFixedGroupSummary, CaixaTicketSummary, type PendingTicketMetadata } from "@/components/caixa-ticket-summary";'
    ),
    "caixa imports"
  );
  s = replaceRequired(
    s,
    '  const [deletingSelected, setDeletingSelected] = useState(false);',
    lines(
      '  const [deletingSelected, setDeletingSelected] = useState(false);',
      '  const [search, setSearch] = useState("");'
    ),
    "caixa search state"
  );

  s = replaceRequired(
    s,
    lines(
      '  const pending = [...(data?.reports.filter((r) => r.status === "pendente") ?? [])].sort(byFreightMode);',
      '  const done = [...(data?.reports.filter((r) => r.status !== "pendente") ?? [])].sort(byFreightMode);'
    ),
    lines(
      '  const reportSearchValues = (report: DriverReport) => {',
      '    const driver = data?.drivers.find((d) => d.id === report.driverId);',
      '    const fleet = data?.fleets.find((f) => f.id === report.fleetId);',
      '    return [report.ticket, driver?.name, fleet?.name, fleet?.tractorPlate, fleet?.trailerPlate, report.freightMode, report.createdAt];',
      '  };',
      '  const allPending = data?.reports.filter((r) => r.status === "pendente") ?? [];',
      '  const allDone = data?.reports.filter((r) => r.status !== "pendente") ?? [];',
      '  const pending = [...allPending.filter((r) => smartSearchMatches(search, reportSearchValues(r)))].sort(byFreightMode);',
      '  const done = [...allDone.filter((r) => smartSearchMatches(search, reportSearchValues(r)))].sort(byFreightMode);',
      '  const searchSuggestions = buildSmartSuggestions(allPending.flatMap(reportSearchValues), search);'
    ),
    "caixa search filtering"
  );

  const oldPrice = '          pricePerTon: open.freightMode === "ton" && Number(closingTicketMeta?.pricePerTon) > 0 ? String(closingTicketMeta?.pricePerTon) : (open.freightMode === "ton" && Number(closingTicketMeta?.routePricePerTon) > 0 ? String(closingTicketMeta?.routePricePerTon) : ""),';
  const newPrice = '          pricePerTon: open.freightMode === "ton" ? String(Number(closingTicketMeta?.pricePerTon) > 0 ? closingTicketMeta?.pricePerTon : Number(closingTicketMeta?.routePricePerTon) > 0 ? closingTicketMeta?.routePricePerTon : Number(closingTicketMeta?.suggestedPricePerTon) > 0 ? closingTicketMeta?.suggestedPricePerTon : "") : "",';
  s = replaceRequired(s, oldPrice, newPrice, "caixa historical ton price");

  const intro = lines(
    '      <p className="mt-2 max-w-xl text-sm text-muted">',
    '        Motorista e conjunto são obrigatórios. Os tickets são automáticos e os lançamentos pendentes podem ser selecionados ou editados antes de fechar a viagem.',
    '      </p>'
  );
  s = replaceRequired(
    s,
    intro,
    lines(
      intro,
      '',
      '      <div className="mt-5 max-w-2xl">',
      '        <SmartSearch value={search} onChange={setSearch} suggestions={searchSuggestions} placeholder="Ticket, motorista, conjunto ou placa — mínimo 3 letras" label="Pesquisar Caixa" />',
      '      </div>'
    ),
    "caixa search ui"
  );

  s = s.replaceAll('<TicketMetadata reportId={r.id} mode={r.freightMode} />', '<CaixaTicketSummary report={r} data={data} />');
  s = s.replaceAll('<TicketMetadata reportId={open.id} mode={open.freightMode} />', '<CaixaTicketSummary report={open} data={data} />');

  const typeStart = s.indexOf("type PendingTicketMetadata = {");
  const nextType = s.indexOf("\ntype PendingReportEditPayload", typeStart);
  if (typeStart < 0 || nextType < 0) throw new Error("smart-ops: old TicketMetadata block missing");
  s = s.slice(0, typeStart) + s.slice(nextType + 1);

  const specialMarker = lines(
    '                {entry.special ? (',
    '                  <div className="mt-4 flex flex-wrap gap-2">'
  );
  s = replaceRequired(
    s,
    specialMarker,
    lines(
      '                {entry.special ? <CaixaFixedGroupSummary reports={groupReports} commissionPct={Number(driver?.commissionPct ?? 0)} /> : null}',
      specialMarker
    ),
    "caixa fixed group finance"
  );

  write(rel, s);
}

console.log("[smart-ops] ranked 3-letter search, compact cards, complete Caixa finances and prominent trip deletion applied");
