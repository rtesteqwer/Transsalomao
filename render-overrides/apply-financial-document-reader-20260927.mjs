import fs from "node:fs";
import path from "node:path";

const target = path.resolve(process.argv[2] || "");
if (!process.argv[2] || !fs.existsSync(path.join(target, "src"))) {
  throw new Error("financial-document-reader: expected reconstructed application directory");
}
const repo = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const dst = (rel) => path.join(target, rel);
const src = (rel) => path.join(repo, rel);
const read = (rel) => fs.readFileSync(dst(rel), "utf8");
const write = (rel, value) => fs.writeFileSync(dst(rel), value);
const copy = (from, to) => {
  fs.mkdirSync(path.dirname(dst(to)), { recursive: true });
  fs.copyFileSync(src(from), dst(to));
};
const replaceRequired = (value, search, replacement, label) => {
  if (!value.includes(search)) throw new Error("financial-document-reader: pattern not found (" + label + ")");
  return value.replace(search, replacement);
};

copy("render-overrides/financial-document-reader-20260927.server.ts", "src/lib/financial-document-reader.server.ts");
copy("render-overrides/financial-document-read-api-20260927.ts", "src/routes/api/ler-comprovante-financeiro.ts");
copy("render-overrides/financial-document-reader-ui-20260927.tsx", "src/components/financial-document-reader.tsx");
copy("render-overrides/0021_financial_document_reader.sql", "migrations/0021_financial_document_reader.sql");

// Expense type: preserve transaction time as a first-class field.
{
  const rel = "src/lib/types.ts";
  let s = read(rel);
  const start = s.indexOf("export type Expense = {");
  const end = start >= 0 ? s.indexOf("\n};", start) : -1;
  if (start < 0 || end < 0) throw new Error("financial-document-reader: Expense type not found");
  const block = s.slice(start, end);
  if (!block.includes("transactionTime:")) {
    const nextBlock = replaceRequired(block, "  date: string;\n", "  date: string;\n  transactionTime: string | null;\n", "expense transactionTime type");
    s = s.slice(0, start) + nextBlock + s.slice(end);
  }
  write(rel, s);
}

// Expense API: map, validate and persist transaction_time.
{
  const rel = "src/lib/api.ts";
  let s = read(rel);
  if (!s.includes("transactionTime: r.transaction_time")) {
    s = replaceRequired(
      s,
      "    driverId: r.driver_id ? str(r.driver_id) : null,\n    category: str(r.category),",
      "    driverId: r.driver_id ? str(r.driver_id) : null,\n    transactionTime: r.transaction_time ? str(r.transaction_time) : null,\n    category: str(r.category),",
      "expense API map",
    );
  }
  const schemaStart = s.indexOf("const expenseSchema = z.object({");
  const schemaEnd = schemaStart >= 0 ? s.indexOf("\n});", schemaStart) : -1;
  if (schemaStart < 0 || schemaEnd < 0) throw new Error("financial-document-reader: expense schema not found");
  const schemaBlock = s.slice(schemaStart, schemaEnd);
  if (!schemaBlock.includes("transactionTime:")) {
    const nextBlock = replaceRequired(
      schemaBlock,
      "  date: z.string().min(8),\n",
      "  date: z.string().min(8),\n  transactionTime: z.string().regex(/^(?:[01]\\d|2[0-3]):[0-5]\\d$/).nullable().optional(),\n",
      "expense schema transaction time",
    );
    s = s.slice(0, schemaStart) + nextBlock + s.slice(schemaEnd);
  }
  if (!s.includes("insert into expenses (id, date, transaction_time,")) {
    s = replaceRequired(
      s,
      "insert into expenses (id, date, fleet_id, asset_type, driver_id, category, description, amount, notes)",
      "insert into expenses (id, date, transaction_time, fleet_id, asset_type, driver_id, category, description, amount, notes)",
      "expense insert columns",
    );
    s = replaceRequired(
      s,
      "values (${id}, ${data.date}, ${isAdvance ? null : data.fleetId ?? null}, ${isAdvance ? null : data.assetType ?? null}, ${isAdvance ? data.driverId : null}, ${data.category}, ${data.description}, ${data.amount}, ${data.notes})",
      "values (${id}, ${data.date}, ${data.transactionTime ?? null}, ${isAdvance ? null : data.fleetId ?? null}, ${isAdvance ? null : data.assetType ?? null}, ${isAdvance ? data.driverId : null}, ${data.category}, ${data.description}, ${data.amount}, ${data.notes})",
      "expense insert values",
    );
    s = replaceRequired(
      s,
      "        date = excluded.date,\n        fleet_id = excluded.fleet_id,",
      "        date = excluded.date,\n        transaction_time = excluded.transaction_time,\n        fleet_id = excluded.fleet_id,",
      "expense update transaction time",
    );
  }
  write(rel, s);
}

// Expense/advance dialog: photo/PDF reader fills amount/date/time and, for advances, links a unique registered driver match.
{
  const rel = "src/routes/dono/despesas.tsx";
  let s = read(rel);
  if (!s.includes('from "@/components/financial-document-reader"')) {
    s = replaceRequired(
      s,
      'import { Button } from "@/components/ui/button";',
      'import { Button } from "@/components/ui/button";\nimport { FinancialDocumentReader } from "@/components/financial-document-reader";',
      "reader import",
    );
  }
  if (!s.includes('const [transactionTime, setTransactionTime] = useState("");')) {
    s = replaceRequired(
      s,
      '  const [amount, setAmount] = useState("");',
      '  const [amount, setAmount] = useState("");\n  const [transactionTime, setTransactionTime] = useState("");',
      "reader time state",
    );
  }
  if (!s.includes('setTransactionTime(value.transactionTime ?? "");')) {
    s = replaceRequired(
      s,
      '    setAmount(value.amount ? String(value.amount) : "");',
      '    setAmount(value.amount ? String(value.amount) : "");\n    setTransactionTime(value.transactionTime ?? "");',
      "reader time reset",
    );
  }
  if (!s.includes("transactionTime: transactionTime || null,")) {
    s = replaceRequired(
      s,
      "                date: date || new Date().toISOString().slice(0, 10),",
      "                date: date || new Date().toISOString().slice(0, 10),\n                transactionTime: transactionTime || null,",
      "reader time submit",
    );
  }
  if (!s.includes('<Field label="Hora"><Input type="time"')) {
    s = replaceRequired(
      s,
      '<div className="grid gap-3 sm:grid-cols-2">\n              <Field label="Data"><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} required /></Field>',
      '<div className="grid gap-3 sm:grid-cols-3">\n              <Field label="Data"><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} required /></Field>\n              <Field label="Hora"><Input type="time" value={transactionTime} onChange={(e) => setTransactionTime(e.target.value)} /></Field>',
      "reader time field",
    );
  }
  if (!s.includes("<FinancialDocumentReader")) {
    const marker = '            <Field label={isAdvance ? "Descrição do adiantamento" : "Descrição da despesa"}>';
    const compactMarker = '            <Field label={isAdvance ? "Descrição do adiantamento" : "Descrição da despesa"}><Input';
    const reader = [
      '            <FinancialDocumentReader',
      '              kind={isAdvance ? "advance" : "expense"}',
      '              onRead={(result) => {',
      '                if (result.amount) setAmount(result.amount.replace(".", ","));',
      '                if (result.date) setDate(result.date);',
      '                if (result.time) setTransactionTime(result.time);',
      '                if (isAdvance && result.suggestedDriverId) setDriverId(result.suggestedDriverId);',
      '                toast.success(isAdvance && result.suggestedDriverName ? "Valor, data, hora e motorista vinculados para conferência." : "Valor, data e hora preenchidos para conferência.");',
      '              }}',
      '            />',
      '',
    ].join("\n");
    if (s.includes(marker)) s = s.replace(marker, reader + marker);
    else if (s.includes(compactMarker)) s = s.replace(compactMarker, reader + compactMarker);
    else throw new Error("financial-document-reader: description field insertion point not found");
  }
  const compactInfo = '{[formatDate(row.date), isAdvance ? driver?.name : fleet?.name, row.category].filter(Boolean).join(" · ")}';
  if (s.includes(compactInfo)) {
    s = s.replace(compactInfo, '{[formatDate(row.date), row.transactionTime || null, isAdvance ? driver?.name : fleet?.name, row.category].filter(Boolean).join(" · ")}');
  } else {
    const legacyInfo = '{formatDate(row.date)} · {isAdvance ? driver?.name ?? "Motorista" : fleet?.name ?? "Conjunto"} · {row.category}';
    if (s.includes(legacyInfo)) {
      s = s.replace(legacyInfo, '{formatDate(row.date)}{row.transactionTime ? " · " + row.transactionTime : ""} · {isAdvance ? driver?.name ?? "Motorista" : fleet?.name ?? "Conjunto"} · {row.category}');
    }
  }
  write(rel, s);
}

console.log("[financial-document-reader] photo/PDF reader installed; advances auto-link a uniquely matched registered driver");
