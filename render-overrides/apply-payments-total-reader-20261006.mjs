import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const work = process.argv[2];
if (!work || !fs.existsSync(work)) throw new Error('Payments total/reader patch: reconstructed work directory is required');

function replaceRequired(text, before, after, label) {
  if (!text.includes(before)) throw new Error('payments-total-reader: pattern not found (' + label + ')');
  return text.replace(before, after);
}

function writePatched(rel, transform) {
  const file = path.join(work, rel);
  if (!fs.existsSync(file)) throw new Error('payments-total-reader: missing ' + rel);
  const original = fs.readFileSync(file, 'utf8');
  const next = transform(original);
  if (next === original) throw new Error('payments-total-reader: no changes in ' + rel);
  fs.writeFileSync(file, next);
}

writePatched('src/routes/dono/pagamentos.tsx', (input) => {
  let s = input;
  s = replaceRequired(
    s,
    'const [periodMode, setPeriodMode] = useState<"monthly" | "days" | "custom">("monthly");',
    'const [periodMode, setPeriodMode] = useState<"monthly" | "days" | "custom" | "total">("monthly");',
    'period mode type',
  );

  const daysEffect = `  useEffect(() => {\n    if (periodMode !== "days") return;\n    setPeriodStart(startDateForDays(periodEnd, Number(dayCount)));\n  }, [periodMode, periodEnd, dayCount]);\n`;
  s = replaceRequired(
    s,
    daysEffect,
    daysEffect + `\n  useEffect(() => {\n    if (periodMode !== "total") return;\n    setPeriodStart("1900-01-01");\n    setPeriodEnd(isoToday());\n  }, [periodMode]);\n`,
    'total period effect',
  );

  s = replaceRequired(
    s,
    '  }, [data, driverId, periodStart, periodEnd, paymentsQuery.data, computedTrips, allAdvanceRows]);',
    '  }, [data, driverId, periodMode, periodStart, periodEnd, paymentsQuery.data, computedTrips, allAdvanceRows]);',
    'settlement deps',
  );
  s = replaceRequired(
    s,
    '  const monthSummary = useMemo(() => {\n    if (!data || !driverId) return [];',
    '  const monthSummary = useMemo(() => {\n    if (!data || !driverId || periodMode === "total") return [];',
    'skip monthly breakdown for total',
  );

  s = replaceRequired(
    s,
    `        periodMode === "monthly"\n          ? "RECIBO MENSAL E TERMO DE ACERTO DO MOTORISTA"\n          : periodMode === "days"\n            ? "TERMO DE ACERTO POR DIAS"\n            : "TERMO DE ACERTO POR COMPETÊNCIAS",`,
    `        periodMode === "monthly"\n          ? "RECIBO MENSAL E TERMO DE ACERTO DO MOTORISTA"\n          : periodMode === "days"\n            ? "TERMO DE ACERTO POR DIAS"\n            : periodMode === "total"\n              ? "TERMO DE ACERTO — HISTÓRICO TOTAL"\n              : "TERMO DE ACERTO POR COMPETÊNCIAS",`,
    'pdf title total',
  );
  s = replaceRequired(
    s,
    'doc.text(periodMode === "monthly" ? "Competência" : "Período do acerto", 112, y);',
    'doc.text(periodMode === "monthly" ? "Competência" : periodMode === "total" ? "Período" : "Período do acerto", 112, y);',
    'pdf period label',
  );
  s = replaceRequired(
    s,
    `        periodMode === "monthly"\n          ? monthLabel(monthKey)\n          : \`\${humanDate(periodStart)} a \${humanDate(periodEnd)}\`,`,
    `        periodMode === "monthly"\n          ? monthLabel(monthKey)\n          : periodMode === "total"\n            ? "Todo o histórico"\n            : \`\${humanDate(periodStart)} a \${humanDate(periodEnd)}\`,`,
    'pdf total label',
  );
  s = replaceRequired(
    s,
    `      const referenceText = periodMode === "monthly"\n        ? \`competência \${monthLabel(monthKey)}\`\n        : periodMode === "days"\n          ? \`\${Math.max(1, Number(dayCount) || 1)} dia(s), de \${humanDate(periodStart)} a \${humanDate(periodEnd)}\`\n          : \`período de \${humanDate(periodStart)} a \${humanDate(periodEnd)}\`;`,
    `      const referenceText = periodMode === "monthly"\n        ? \`competência \${monthLabel(monthKey)}\`\n        : periodMode === "days"\n          ? \`\${Math.max(1, Number(dayCount) || 1)} dia(s), de \${humanDate(periodStart)} a \${humanDate(periodEnd)}\`\n          : periodMode === "total"\n            ? "todo o histórico disponível"\n            : \`período de \${humanDate(periodStart)} a \${humanDate(periodEnd)}\`;`,
    'pdf declaration total',
  );
  s = replaceRequired(
    s,
    `      const fileName = periodMode === "monthly"\n        ? \`Recibo_Mensal_\${safeName(selectedDriver.name)}_\${monthKey}.pdf\`\n        : periodMode === "days"\n          ? \`Acerto_Dias_\${safeName(selectedDriver.name)}_\${periodStart}_a_\${periodEnd}.pdf\`\n          : \`Acerto_\${safeName(selectedDriver.name)}_\${periodStart}_a_\${periodEnd}.pdf\`;`,
    `      const fileName = periodMode === "monthly"\n        ? \`Recibo_Mensal_\${safeName(selectedDriver.name)}_\${monthKey}.pdf\`\n        : periodMode === "days"\n          ? \`Acerto_Dias_\${safeName(selectedDriver.name)}_\${periodStart}_a_\${periodEnd}.pdf\`\n          : periodMode === "total"\n            ? \`Acerto_Total_\${safeName(selectedDriver.name)}.pdf\`\n            : \`Acerto_\${safeName(selectedDriver.name)}_\${periodStart}_a_\${periodEnd}.pdf\`;`,
    'pdf filename total',
  );

  s = replaceRequired(
    s,
    'setPeriodMode(event.target.value as "monthly" | "days" | "custom")',
    'setPeriodMode(event.target.value as "monthly" | "days" | "custom" | "total")',
    'period select cast',
  );
  s = replaceRequired(
    s,
    '              <option value="days">Por dias</option>\n              <option value="custom">Intervalo personalizado</option>',
    '              <option value="days">Por dias</option>\n              <option value="custom">Intervalo personalizado</option>\n              <option value="total">Total / todo o histórico</option>',
    'period total option',
  );

  const customBlock = `          ) : (\n            <>\n              <Field label="Início do período">\n                <Input type="date" value={periodStart} onChange={(event) => setPeriodStart(event.target.value)} />\n              </Field>\n              <Field label="Fim do período">\n                <Input type="date" value={periodEnd} onChange={(event) => setPeriodEnd(event.target.value)} />\n              </Field>\n            </>\n          )}`;
  s = replaceRequired(
    s,
    customBlock,
    `          ) : periodMode === "total" ? (\n            <div className="rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm sm:col-span-2">\n              <p className="font-semibold">Todo o histórico</p>\n              <p className="mt-1 text-xs text-muted">Soma todas as viagens, comissões, adiantamentos, acertos e pagamentos registrados até hoje.</p>\n            </div>\n          ) : (\n            <>\n              <Field label="Início do período">\n                <Input type="date" value={periodStart} onChange={(event) => setPeriodStart(event.target.value)} />\n              </Field>\n              <Field label="Fim do período">\n                <Input type="date" value={periodEnd} onChange={(event) => setPeriodEnd(event.target.value)} />\n              </Field>\n            </>\n          )}`,
    'total period ui',
  );

  s = replaceRequired(
    s,
    `          {periodMode === "monthly"\n            ? \`Competência selecionada: \${monthLabel(monthKey)}.\`\n            : periodMode === "days"\n              ? \`\${Math.max(1, Number(dayCount) || 1)} dia(s): \${humanDate(periodStart)} a \${humanDate(periodEnd)}.\`\n              : \`Período selecionado: \${humanDate(periodStart)} a \${humanDate(periodEnd)}.\`}`,
    `          {periodMode === "monthly"\n            ? \`Competência selecionada: \${monthLabel(monthKey)}.\`\n            : periodMode === "days"\n              ? \`\${Math.max(1, Number(dayCount) || 1)} dia(s): \${humanDate(periodStart)} a \${humanDate(periodEnd)}.\`\n              : periodMode === "total"\n                ? "Período selecionado: todo o histórico disponível."\n                : \`Período selecionado: \${humanDate(periodStart)} a \${humanDate(periodEnd)}.\`}`,
    'total period summary',
  );

  s = replaceRequired(
    s,
    '<p>{humanDate(periodStart)} a {humanDate(periodEnd)} · comissão menos adiantamentos, acertos e pagamentos.</p>',
    '<p>{periodMode === "total" ? "Todo o histórico" : `${humanDate(periodStart)} a ${humanDate(periodEnd)}`} · comissão menos adiantamentos, acertos e pagamentos.</p>',
    'drivers total label',
  );
  s = replaceRequired(
    s,
    '<p className="break-words">{selectedDriver ? `${selectedDriver.name} · ${humanDate(periodStart)} a ${humanDate(periodEnd)}` : "Selecione um motorista"}</p>',
    '<p className="break-words">{selectedDriver ? `${selectedDriver.name} · ${periodMode === "total" ? "Todo o histórico" : `${humanDate(periodStart)} a ${humanDate(periodEnd)}`}` : "Selecione um motorista"}</p>',
    'selected driver total label',
  );

  const paymentFieldsEnd = `            </div>\n            <Field label="Nota / referência">`;
  s = replaceRequired(
    s,
    paymentFieldsEnd,
    `            </div>\n\n            <FinancialDocumentReader\n              kind="payment"\n              onRead={(result) => {\n                if (result.amount) onAmountChange(result.amount.replace(".", ","));\n                if (result.date) onDateChange(result.date);\n                if (result.suggestedDriverId) onDriverChange(result.suggestedDriverId);\n                const details = [result.description, result.notes].filter(Boolean).join(" · ");\n                const timeNote = result.time ? \`Comprovante \${result.time}\` : "";\n                if (details || timeNote) onNoteChange([details, timeNote].filter(Boolean).join(" · "));\n                if (!result.amount || !result.date) {\n                  toast.warning("Confira o valor e a data do comprovante antes de registrar o pagamento.");\n                } else if (!result.suggestedDriverId) {\n                  toast.warning("Confira o motorista do comprovante antes de registrar o pagamento.");\n                }\n              }}\n            />\n\n            <Field label="Nota / referência">`,
    'payment reader ui',
  );
  s = replaceRequired(
    s,
    '              Este lançamento será vinculado ao período de {humanDate(periodStart)} a {humanDate(periodEnd)} e abatido do saldo de comissão do motorista.',
    '              Este lançamento será vinculado a {periodStart === "1900-01-01" ? "todo o histórico" : `o período de ${humanDate(periodStart)} a ${humanDate(periodEnd)}`} e abatido do saldo de comissão do motorista.',
    'payment total period note',
  );
  return s;
});

writePatched('src/components/financial-document-reader.tsx', (input) => {
  let s = input;
  s = replaceRequired(s, 'kind: "advance" | "expense";', 'kind: "advance" | "expense" | "payment";', 'reader kind type');
  s = replaceRequired(
    s,
    '        setBatchActionMessage("Arquivos lidos. Os campos de cada despesa foram extraídos; o primeiro item foi preenchido acima e as despesas completas ficaram selecionadas para lançamento em lote.");',
    `        setBatchActionMessage(\n          kind === "payment"\n            ? "Arquivos lidos. O primeiro comprovante completo preencheu o Novo pagamento. Use Preencher em outro item para trocar o comprovante antes de registrar."\n            : "Arquivos lidos. Os campos de cada despesa foram extraídos; o primeiro item foi preenchido acima e as despesas completas ficaram selecionadas para lançamento em lote.",\n        );`,
    'payment zip message',
  );
  s = replaceRequired(
    s,
    '  async function saveSelectedBatch() {\n    const indexes = [...selectedBatch].sort((a, b) => a - b);',
    '  async function saveSelectedBatch() {\n    if (kind === "payment") {\n      setBatchActionMessage("Para pagamento, escolha um comprovante e toque em Preencher. O registro só é salvo pelo botão Registrar pagamento.");\n      return;\n    }\n    const indexes = [...selectedBatch].sort((a, b) => a - b);',
    'prevent payment auto batch save',
  );
  s = replaceRequired(
    s,
    `            {kind === "advance"\n              ? "Lê Valor, Data, Hora e o Nome do Recebedor. Aceita foto, PDF, vários arquivos e ZIP; o recebedor é comparado com o cadastro e vinculado como motorista quando houver correspondência segura."\n              : "Foto, PDF, vários arquivos ou ZIP pela Salomão IA. Extrai Valor, Data e Hora diretamente de cada documento; não usa a data/hora do envio nem a data atual. Em lote, só ficam prontas as despesas com esses dados identificados."}`,
    `            {kind === "advance"\n              ? "Lê Valor, Data, Hora e o Nome do Recebedor. Aceita foto, PDF, vários arquivos e ZIP; o recebedor é comparado com o cadastro e vinculado como motorista quando houver correspondência segura."\n              : kind === "payment"\n                ? "Lê Valor, Data, Hora e o Nome do Recebedor do pagamento. Aceita as mesmas opções do adiantamento: foto, PDF, vários arquivos e ZIP. O leitor preenche o pagamento para conferência antes de registrar."\n                : "Foto, PDF, vários arquivos ou ZIP pela Salomão IA. Extrai Valor, Data e Hora diretamente de cada documento; não usa a data/hora do envio nem a data atual. Em lote, só ficam prontas as despesas com esses dados identificados."}`,
    'payment reader description',
  );
  s = replaceRequired(
    s,
    '      <p className="mt-2 text-[11px] text-muted">No Android, você pode selecionar fotos, PDFs, vários arquivos de uma vez ou ZIP. A Salomão IA abre cada item, identifica RECEBEDOR, VALOR, DATA e HORA e, nos adiantamentos, cruza o recebedor com os motoristas cadastrados. Itens incompletos ficam para conferência e duplicados são ignorados.</p>',
    '      <p className="mt-2 text-[11px] text-muted">No Android, você pode selecionar fotos, PDFs, vários arquivos de uma vez ou ZIP. A Salomão IA abre cada item, identifica RECEBEDOR, VALOR, DATA e HORA e, em adiantamentos e pagamentos, cruza o recebedor com os motoristas cadastrados. Itens incompletos ficam para conferência.</p>',
    'reader android text',
  );

  const toolbar = `          <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-surface px-3 py-2">\n            <Button type="button" size="sm" variant="secondary" disabled={busy || batchSaving} onClick={selectAllBatch}>\n              Selecionar todos\n            </Button>\n            <Button\n              type="button"\n              size="sm"\n              disabled={busy || batchSaving || selectedBatch.size === 0}\n              onClick={() => void saveSelectedBatch()}\n            >\n              {batchSaving ? <LoaderCircle className="size-4 animate-spin" /> : null}\n              {kind === "expense" ? "Lançar despesas selecionadas" : "Lançar selecionados"} ({selectedBatch.size})\n            </Button>\n            {selectedBatch.size ? (\n              <button type="button" className="text-xs text-muted underline" onClick={() => setSelectedBatch(new Set())}>\n                Desmarcar\n              </button>\n            ) : null}\n          </div>`;
  s = replaceRequired(
    s,
    toolbar,
    `          {kind === "payment" ? (\n            <p className="rounded-lg border border-border bg-surface px-3 py-2 text-xs text-muted">\n              Para Novo pagamento, escolha o comprovante desejado e toque em <strong className="text-foreground">Preencher</strong>. Nada é lançado automaticamente.\n            </p>\n          ) : (\n            <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-surface px-3 py-2">\n              <Button type="button" size="sm" variant="secondary" disabled={busy || batchSaving} onClick={selectAllBatch}>\n                Selecionar todos\n              </Button>\n              <Button\n                type="button"\n                size="sm"\n                disabled={busy || batchSaving || selectedBatch.size === 0}\n                onClick={() => void saveSelectedBatch()}\n              >\n                {batchSaving ? <LoaderCircle className="size-4 animate-spin" /> : null}\n                {kind === "expense" ? "Lançar despesas selecionadas" : "Lançar selecionados"} ({selectedBatch.size})\n              </Button>\n              {selectedBatch.size ? (\n                <button type="button" className="text-xs text-muted underline" onClick={() => setSelectedBatch(new Set())}>\n                  Desmarcar\n                </button>\n              ) : null}\n            </div>\n          )}`,
    'payment batch toolbar',
  );

  s = replaceRequired(s, '{kind === "advance" ? (\n                        <span>', '{kind !== "expense" ? (\n                        <span>', 'payment driver in batch');
  s = replaceRequired(s, '{kind === "advance" && item.result && !item.result.suggestedDriverId ? (', '{kind !== "expense" && item.result && !item.result.suggestedDriverId ? (', 'payment unmatched driver');
  s = replaceRequired(s, 'className={"mt-3 grid gap-2 " + (kind === "advance" ? "sm:grid-cols-4" : "sm:grid-cols-3")}', 'className={"mt-3 grid gap-2 " + (kind !== "expense" ? "sm:grid-cols-4" : "sm:grid-cols-3")}', 'payment reading columns');
  s = replaceRequired(s, '{kind === "advance" ? (\n            <ReadValue', '{kind !== "expense" ? (\n            <ReadValue', 'payment reading driver');
  return s;
});

writePatched('src/routes/api/ler-comprovante-financeiro.ts', (input) => {
  let s = input;
  s = replaceRequired(
    s,
    `          const kind = body?.kind === "advance" ? "advance" : "expense";\n          const reader = body?.reader === "pdf_text" ? "pdf_text" : "ai";\n          const reading = await readFinancialDocument({\n            fileName: String(body?.fileName || "comprovante"),\n            mime: String(body?.mime || ""),\n            base64: String(body?.base64 || ""),\n            kind,\n            reader,\n          });`,
    `          const kind = body?.kind === "advance" ? "advance" : body?.kind === "payment" ? "payment" : "expense";\n          const reader = body?.reader === "pdf_text" ? "pdf_text" : "ai";\n          const financialKind = kind === "expense" ? "expense" : "advance";\n          const reading = await readFinancialDocument({\n            fileName: String(body?.fileName || "comprovante"),\n            mime: String(body?.mime || ""),\n            base64: String(body?.base64 || ""),\n            kind: financialKind,\n            reader,\n          });`,
    'api payment kind',
  );
  s = replaceRequired(s, 'if (kind === "advance" && (reading.driver_name || reading.source_text)) {', 'if (kind !== "expense" && (reading.driver_name || reading.source_text)) {', 'api payment driver match');
  return s;
});

const checks = {
  'src/routes/dono/pagamentos.tsx': '25458222e2941ff294a5e7f351874535e609ddeab09359b988bae15d4b2e090a',
  'src/components/financial-document-reader.tsx': 'd4cca2ffe1566ebeda0d451be6deb7a301926493884e56b6d0671c1dd0e4c66e',
  'src/routes/api/ler-comprovante-financeiro.ts': 'd5a42d31311e4b7c19f46e16c6a25ba532e8d56c53069e66c88f7943551c0874',
};
for (const [rel, expected] of Object.entries(checks)) {
  const actual = crypto.createHash('sha256').update(fs.readFileSync(path.join(work, rel))).digest('hex');
  if (actual !== expected) throw new Error('payments-total-reader: final hash mismatch ' + rel + ' => ' + actual);
}

console.log('[payments-total-reader] total period + payment PDF/photo reader applied');
