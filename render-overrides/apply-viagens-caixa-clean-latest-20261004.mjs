import fs from "node:fs";
import path from "node:path";

const target = path.resolve(process.argv[2] || "");
if (!process.argv[2] || !fs.existsSync(path.join(target, "src"))) {
  throw new Error("viagens-caixa-clean-latest: expected reconstructed application directory");
}

const read = (rel) => fs.readFileSync(path.join(target, rel), "utf8");
const write = (rel, value) => fs.writeFileSync(path.join(target, rel), value);

function replaceOnce(source, before, after, label, required = true) {
  if (source.includes(after)) return source;
  if (!source.includes(before)) {
    if (required) throw new Error("viagens-caixa-clean-latest: pattern not found (" + label + ")");
    console.log("[viagens-caixa-clean-latest] optional pattern skipped: " + label);
    return source;
  }
  return source.replace(before, after);
}

// Expose the report creation timestamp to the browser when possible.
{
  const rel = "src/lib/types.ts";
  let s = read(rel);
  const start = s.indexOf("export type DriverReport = {");
  if (start >= 0) {
    const end = s.indexOf("\n};", start);
    if (end > start) {
      const block = s.slice(start, end);
      if (!block.includes("createdAt?: string;") && !block.includes("createdAt: string;")) {
        const idNeedle = "  id: string;";
        const idAt = s.indexOf(idNeedle, start);
        if (idAt >= start && idAt < end) {
          const insertAt = idAt + idNeedle.length;
          s = s.slice(0, insertAt) + "\n  createdAt?: string;" + s.slice(insertAt);
        }
      }
    }
  }
  write(rel, s);
}

// Reports and trips are read in the real launch order. Ticket/document dates are
// only business dates and never decide the ordering of Viagens/Caixa.
{
  const rel = "src/lib/api.ts";
  let s = read(rel);

  const stateStart = s.indexOf("export const getFleetState");
  if (stateStart >= 0) {
    const stateEndCandidate = s.indexOf("\nexport const ", stateStart + 24);
    const stateEnd = stateEndCandidate >= 0 ? stateEndCandidate : s.length;
    let block = s.slice(stateStart, stateEnd);
    if (/select \* from reports(?![\s\S]{0,40}where)/.test(block)) {
      block = block.replace(
        /select \* from reports(?:\s+order by [^\`]+)?/,
        "select * from reports order by created_at desc nulls last, id desc",
      );
    }
    s = s.slice(0, stateStart) + block + s.slice(stateEnd);
  }

  const mapperStartCandidates = [
    s.indexOf("function mapReport"),
    s.indexOf("const mapReport"),
  ].filter((value) => value >= 0);
  if (mapperStartCandidates.length) {
    const mapperStart = Math.min(...mapperStartCandidates);
    const returnAt = s.indexOf("return {", mapperStart);
    const mapperEnd = returnAt >= 0 ? s.indexOf("\n  };", returnAt) : -1;
    if (returnAt >= 0 && mapperEnd > returnAt) {
      const block = s.slice(mapperStart, mapperEnd);
      if (!block.includes("createdAt:")) {
        const idMatch = /\n\s*id:\s*str\(r\.id\),/.exec(block);
        if (idMatch && idMatch.index != null) {
          const absolute = mapperStart + idMatch.index + idMatch[0].length;
          s =
            s.slice(0, absolute) +
            "\n    createdAt: r.created_at instanceof Date ? r.created_at.toISOString() : str(r.created_at)," +
            s.slice(absolute);
        }
      }
    }
  }

  write(rel, s);
}

// CAIXA: newest system launch first, regardless of ticket date.
{
  const rel = "src/routes/dono/lancamentos.tsx";
  let s = read(rel);

  if (!s.includes("function reportLaunchTime(")) {
    const marker = "function LancamentosPage() {";
    const helper = `function reportLaunchTime(report: any) {
  const raw = report?.createdAt ?? report?.created_at ?? "";
  const parsed = Date.parse(String(raw));
  return Number.isFinite(parsed) ? parsed : 0;
}

`;
    if (!s.includes(marker)) {
      console.log("[viagens-caixa-clean-latest] Caixa helper marker not found; preserving existing Caixa implementation");
    } else {
      s = s.replace(marker, helper + marker);
    }
  }

  if (!/const pending =[\s\S]{0,500}reportLaunchTime\(b\)/.test(s)) {
    const pendingStart = s.indexOf("  const pending =");
    if (pendingStart < 0) {
      console.log("[viagens-caixa-clean-latest] pending declaration not found; preserving existing Caixa order");
    } else {
      // The Caixa expression has changed across releases and can be multiline or
      // semicolon-free. Only rewrite it when a complete, recognizable statement exists.
      const pendingEndCandidates = [
        s.indexOf(";\n", pendingStart),
        s.indexOf("\n  const ", pendingStart + 16),
      ].filter((value) => value > pendingStart);
      const pendingEnd = pendingEndCandidates.length ? Math.min(...pendingEndCandidates) : -1;
      if (pendingEnd < 0) {
        console.log("[viagens-caixa-clean-latest] pending declaration end not found; preserving existing Caixa order");
      } else {
        const hasSemicolon = s.slice(pendingStart, pendingEnd + 2).includes(";");
        const statementEnd = hasSemicolon ? pendingEnd + 1 : pendingEnd;
        const statement = s.slice(pendingStart, statementEnd);
        const equalAt = statement.indexOf("=");
        let expression = statement.slice(equalAt + 1).trim().replace(/;$/, "").trim();
        if (!expression.includes("reports") || !expression.includes("pendente")) {
          console.log("[viagens-caixa-clean-latest] unrecognized pending expression; preserving existing Caixa order");
        } else {
          const replacement =
            "  const pending = [...(" + expression + ")].sort((a, b) => reportLaunchTime(b) - reportLaunchTime(a));";
          s = s.slice(0, pendingStart) + replacement + s.slice(statementEnd);
        }
      }
    }
  }

  s = s.replace(
    /Motorista e conjunto são obrigatórios\.[^"<]*Os tickets são automáticos[^"<]*/g,
    "Os últimos lançamentos feitos no sistema aparecem primeiro. A data impressa no ticket é mantida no lançamento, mas não altera a ordem da Caixa.",
  );

  write(rel, s);
}

// VIAGENS: one simple chronological feed by launch time. Fixed modes are no
// longer hidden behind grouped cards; every launch remains individually visible.
{
  const rel = "src/routes/dono/viagens.tsx";
  let s = read(rel);

  s = replaceOnce(
    s,
    '  const [tripOrder, setTripOrder] = useState("latest_launch");',
    '  const tripOrder = "latest_launch";',
    "fixed latest launch order",
    false,
  );

  {
    const compactStart = s.indexOf("  const compactRows =");
    if (compactStart < 0) {
      console.log("[viagens-caixa-clean-latest] compactRows declaration not found; preserving existing Viagens rows");
    } else {
      const compactEnd = s.indexOf(";\n", compactStart);
      if (compactEnd < 0) {
        console.log("[viagens-caixa-clean-latest] compactRows declaration end not found; preserving existing Viagens rows");
      } else {
        const statement = s.slice(compactStart, compactEnd + 1);
        if (statement !== "  const compactRows = rows;") {
          s = s.slice(0, compactStart) + "  const compactRows = rows;" + s.slice(compactEnd + 1);
        }
      }
    }
  }

  s = s.replace(
    '{groupedModeRows.length > 0 ? (',
    '{false && groupedModeRows.length > 0 ? (',
  );

  const orderSelect = `        <Select value={tripOrder} onChange={(e) => setTripOrder(e.target.value)} aria-label="Ordenar viagens">
          <option value="latest_launch">Últimos lançamentos — mais recentes primeiro</option>
          <option value="oldest_launch">Primeiros lançamentos — mais antigos primeiro</option>
          <option value="date_desc">Data da viagem — mais recente primeiro</option>
          <option value="date_asc">Data da viagem — mais antiga primeiro</option>
        </Select>
`;
  if (s.includes(orderSelect)) s = s.replace(orderSelect, "");

  s = s.replace(
    '      <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">',
    '      <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">',
  );

  const orderInfo = `      <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted">
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
      </div>`;
  const simpleInfo = `      <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted">
        <Badge>Últimos lançamentos primeiro</Badge>
        <span>{rows.length} viagem(ns) exibida(s)</span>
        <span>• A data do ticket não altera esta ordem.</span>
      </div>`;
  if (s.includes(orderInfo)) s = s.replace(orderInfo, simpleInfo);

  write(rel, s);
}

console.log("[viagens-caixa-clean-latest] Viagens/Caixa simplified and fixed to real launch order");
