import fs from "node:fs";
import path from "node:path";

const target = path.resolve(process.argv[2] || "");
if (!process.argv[2] || !fs.existsSync(path.join(target, "src"))) {
  throw new Error("expense-batch: expected reconstructed application directory");
}

const repo = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const dst = (rel) => path.join(target, rel);
const src = (rel) => path.join(repo, rel);

function copy(from, to) {
  fs.mkdirSync(path.dirname(dst(to)), { recursive: true });
  fs.copyFileSync(src(from), dst(to));
}

copy(
  "render-overrides/financial-expense-batch-save-api-20261004.ts",
  "src/routes/api/lancar-despesas-comprovantes-lote.ts",
);

const rel = "src/components/financial-document-reader.tsx";
let s = fs.readFileSync(dst(rel), "utf8");

function replaceRequired(before, after, label) {
  if (s.includes(after)) return;
  if (!s.includes(before)) throw new Error("expense-batch: pattern not found (" + label + ")");
  s = s.replace(before, after);
}

replaceRequired(
`  function isReadyForBatch(item: BatchPdfItem) {
    return !!(
      item.result &&
      item.result.amount &&
      item.result.date &&
      item.result.time &&
      item.result.suggestedDriverId
    );
  }`,
`  function isReadyForBatch(item: BatchPdfItem) {
    if (!item.result || !item.result.amount || !item.result.date) return false;
    if (kind === "expense") return true;
    return !!(item.result.time && item.result.suggestedDriverId);
  }`,
  "batch readiness",
);

replaceRequired(
`      const successful = rows.filter((row) => row.result);
      if (selected.length === 1 && successful[0]?.result) {`,
`      const successful = rows.filter((row) => row.result);
      const readyIndexes = rows
        .map((item, index) => ({ item, index }))
        .filter(({ item }) => isReadyForBatch(item))
        .map(({ index }) => index);
      setSelectedBatch(new Set(readyIndexes));
      if (selected.length === 1 && successful[0]?.result) {`,
  "preselect batch expenses",
);

const saveStart = s.indexOf("  async function saveSelectedBatch() {");
const saveEnd = saveStart >= 0 ? s.indexOf("\n\n  return (", saveStart) : -1;
if (saveStart < 0 || saveEnd < 0) {
  throw new Error("expense-batch: saveSelectedBatch block not found");
}

const saveBlock = `  async function saveSelectedBatch() {
    const indexes = [...selectedBatch].sort((a, b) => a - b);
    if (!indexes.length) {
      setBatchActionMessage(kind === "expense" ? "Selecione pelo menos uma despesa pronta." : "Selecione pelo menos um comprovante pronto.");
      return;
    }

    const selectedItems = indexes
      .map((index) => ({ index, item: batchItems[index] }))
      .filter(({ item }) => isReadyForBatch(item));

    const items = selectedItems.map(({ item }) =>
      kind === "expense"
        ? {
            fileName: item.fileName,
            amount: item.result!.amount,
            date: item.result!.date,
            time: item.result!.time,
          }
        : {
            fileName: item.fileName,
            amount: item.result!.amount,
            date: item.result!.date,
            time: item.result!.time,
            driverId: item.result!.suggestedDriverId,
          }
    );

    if (!items.length) {
      setBatchActionMessage(kind === "expense" ? "Nenhuma despesa selecionada possui valor e data suficientes." : "Nenhum adiantamento selecionado está completo.");
      return;
    }

    setBatchSaving(true);
    setBatchActionMessage("");
    try {
      const endpoint = kind === "expense"
        ? "/api/lancar-despesas-comprovantes-lote"
        : "/api/lancar-adiantamentos-pdf-lote";

      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items }),
      });
      const payload: any = await response.json().catch(() => ({}));
      if (!response.ok || !payload?.ok) {
        throw new Error(payload?.message || (kind === "expense" ? "Não foi possível lançar as despesas selecionadas." : "Não foi possível lançar os adiantamentos selecionados."));
      }

      setBatchActionMessage(payload.message || (kind === "expense" ? "Despesas selecionadas lançadas." : "Adiantamentos selecionados lançados."));
      const failedCount = Array.isArray(payload.failed) ? payload.failed.length : 0;
      const createdCount = Array.isArray(payload.created) ? payload.created.length : 0;
      const skippedCount = Array.isArray(payload.skipped) ? payload.skipped.length : 0;

      if (createdCount > 0 && failedCount === 0) {
        setSelectedBatch(new Set());
        window.setTimeout(() => window.location.reload(), skippedCount > 0 ? 1200 : 900);
      }
    } catch (err) {
      setBatchActionMessage(err instanceof Error ? err.message : (kind === "expense" ? "Falha ao lançar as despesas selecionadas." : "Falha ao lançar os selecionados."));
    } finally {
      setBatchSaving(false);
    }
  }`;

s = s.slice(0, saveStart) + saveBlock + s.slice(saveEnd);

replaceRequired(
`          {kind === "advance" ? (
            <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-surface px-3 py-2">
              <Button type="button" size="sm" variant="secondary" disabled={busy || batchSaving} onClick={selectAllBatch}>
                Selecionar todos
              </Button>
              <Button
                type="button"
                size="sm"
                disabled={busy || batchSaving || selectedBatch.size === 0}
                onClick={() => void saveSelectedBatch()}
              >
                {batchSaving ? <LoaderCircle className="size-4 animate-spin" /> : null}
                Lançar selecionados ({selectedBatch.size})
              </Button>
              {selectedBatch.size ? (
                <button type="button" className="text-xs text-muted underline" onClick={() => setSelectedBatch(new Set())}>
                  Desmarcar
                </button>
              ) : null}
            </div>
          ) : null}`,
`          <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-surface px-3 py-2">
            <Button type="button" size="sm" variant="secondary" disabled={busy || batchSaving} onClick={selectAllBatch}>
              Selecionar todos
            </Button>
            <Button
              type="button"
              size="sm"
              disabled={busy || batchSaving || selectedBatch.size === 0}
              onClick={() => void saveSelectedBatch()}
            >
              {batchSaving ? <LoaderCircle className="size-4 animate-spin" /> : null}
              {kind === "expense" ? "Lançar despesas selecionadas" : "Lançar selecionados"} ({selectedBatch.size})
            </Button>
            {selectedBatch.size ? (
              <button type="button" className="text-xs text-muted underline" onClick={() => setSelectedBatch(new Set())}>
                Desmarcar
              </button>
            ) : null}
          </div>`,
  "batch action controls",
);

replaceRequired(
  `{kind === "advance" && item.result ? (`,
  `{item.result ? (`,
  "batch checkboxes for expenses",
);

s = s.replace(
  "Arquivos lidos. Toque em Preencher no comprovante que deseja usar nesta despesa.",
  "Arquivos lidos. As despesas completas foram selecionadas; confira e use Lançar despesas selecionadas.",
);

s = s.replace(
  '"Foto, PDF, vários arquivos ou ZIP pela Salomão IA. Preenche Valor, Data e Hora para conferência."',
  '"Foto, PDF, vários arquivos ou ZIP pela Salomão IA. Extrai Valor, Data e Hora de cada item; em lote, você pode selecionar e lançar todas as despesas identificadas."',
);

fs.writeFileSync(dst(rel), s);
console.log("[expense-batch] despesas em lote habilitadas para fotos, PDFs e ZIP");
