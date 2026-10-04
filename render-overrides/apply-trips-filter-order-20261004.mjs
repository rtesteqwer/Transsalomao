import fs from "node:fs";
import path from "node:path";

const target = path.resolve(process.argv[2] || "");
if (!process.argv[2] || !fs.existsSync(path.join(target, "src"))) {
  throw new Error("trips-filter-order: expected reconstructed application directory");
}

const rel = "src/routes/dono/viagens.tsx";
const file = path.join(target, rel);
let s = fs.readFileSync(file, "utf8");

function rep(before, after, label) {
  if (s.includes(after)) return;
  if (!s.includes(before)) throw new Error("trips-filter-order: pattern not found (" + label + ")");
  s = s.replace(before, after);
}

rep(
  '  const [driverFilter, setDriverFilter] = useState("all");\n  const [editing, setEditing] = useState<TripDraft | null>(null);',
  '  const [driverFilter, setDriverFilter] = useState("all");\n  const [modeFilter, setModeFilter] = useState("all");\n  const [tripOrder, setTripOrder] = useState("latest_launch");\n  const [editing, setEditing] = useState<TripDraft | null>(null);',
  "filter and order state",
);

rep(
`    let all = data.trips.map((t) => enrichTrip(t, data.drivers, data.fleets));
    if (driverFilter !== "all") all = all.filter((t) => t.driverId === driverFilter);
    if (!smartSearchActive(q)) return all;
    return all.filter((t) => smartSearchMatches(q, [
      t.code, t.client, t.origin, t.destination, t.driverName, t.fleetName,
      t.tractorPlate, t.trailerPlate, freightModeLabel(t.freightMode), t.date,
    ]));
  }, [data, q, driverFilter]);`,
`    let all = data.trips.map((t) => enrichTrip(t, data.drivers, data.fleets));
    if (driverFilter !== "all") all = all.filter((t) => t.driverId === driverFilter);
    if (modeFilter !== "all") all = all.filter((t) => t.freightMode === modeFilter);
    if (smartSearchActive(q)) {
      all = all.filter((t) => smartSearchMatches(q, [
        t.code, t.client, t.origin, t.destination, t.driverName, t.fleetName,
        t.tractorPlate, t.trailerPlate, freightModeLabel(t.freightMode), t.date,
      ]));
    }

    if (tripOrder === "oldest_launch") {
      all = [...all].reverse();
    } else if (tripOrder === "date_desc" || tripOrder === "date_asc") {
      const direction = tripOrder === "date_desc" ? -1 : 1;
      all = [...all].sort((a, b) => {
        const byDate = String(a.date ?? "").localeCompare(String(b.date ?? ""));
        if (byDate !== 0) return byDate * direction;
        return String(a.code ?? "").localeCompare(String(b.code ?? ""), "pt-BR", { numeric: true }) * direction;
      });
    }
    // latest_launch preserva exatamente a ordem recebida do servidor,
    // que já vem por created_at DESC: o último lançamento feito aparece primeiro.
    return all;
  }, [data, q, driverFilter, modeFilter, tripOrder]);`,
  "filtered ordered rows",
);

rep(
`  ).sort((a, b) => a.driverName.localeCompare(b.driverName) || a.mode.localeCompare(b.mode));`,
`  );`,
  "group cards preserve filtered launch order",
);

rep(
`      <div className="mt-6 grid gap-3 sm:grid-cols-2">
        <SmartSearch value={q} onChange={setQ} suggestions={searchSuggestions} placeholder="Ticket, motorista, empresa, rota ou placa — mínimo 3 letras" label="Pesquisar viagens" />
        <Select value={driverFilter} onChange={(e) => setDriverFilter(e.target.value)}>
          <option value="all">Todos os motoristas</option>
          {(data?.drivers ?? []).map((d) => (
            <option key={d.id} value={d.id}>{d.name}</option>
          ))}
        </Select>
      </div>`,
`      <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <SmartSearch value={q} onChange={setQ} suggestions={searchSuggestions} placeholder="Ticket, motorista, empresa, rota ou placa — mínimo 3 letras" label="Pesquisar viagens" />
        <Select value={driverFilter} onChange={(e) => setDriverFilter(e.target.value)} aria-label="Filtrar por motorista">
          <option value="all">Todos os motoristas</option>
          {(data?.drivers ?? []).map((d) => (
            <option key={d.id} value={d.id}>{d.name}</option>
          ))}
        </Select>
        <Select value={modeFilter} onChange={(e) => setModeFilter(e.target.value)} aria-label="Filtrar por modalidade">
          <option value="all">Todas as modalidades</option>
          <option value="ton">Por tonelada</option>
          <option value="trip">Diária</option>
          <option value="cegonha">Cegonha</option>
          <option value="caixinha">Caixinha</option>
        </Select>
        <Select value={tripOrder} onChange={(e) => setTripOrder(e.target.value)} aria-label="Ordenar viagens">
          <option value="latest_launch">Últimos lançamentos — mais recentes primeiro</option>
          <option value="oldest_launch">Primeiros lançamentos — mais antigos primeiro</option>
          <option value="date_desc">Data da viagem — mais recente primeiro</option>
          <option value="date_asc">Data da viagem — mais antiga primeiro</option>
        </Select>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted">
        <span>Ordem atual:</span>
        <Badge>
          {tripOrder === "latest_launch"
            ? "Últimos lançamentos primeiro"
            : tripOrder === "oldest_launch"
              ? "Primeiros lançamentos primeiro"
              : tripOrder === "date_desc"
                ? "Data da viagem: recente → antiga"
                : "Data da viagem: antiga → recente"}
        </Badge>
        <span>{rows.length} viagem(ns) exibida(s)</span>
      </div>`,
  "trip filter toolbar",
);

fs.writeFileSync(file, s);
console.log("[trips-filter-order] motorista/modalidade filters and launch-order selector added; latest launches default");
