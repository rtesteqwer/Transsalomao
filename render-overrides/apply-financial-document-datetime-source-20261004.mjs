import fs from "node:fs";
import path from "node:path";

const target = path.resolve(process.argv[2] || "");
if (!process.argv[2] || !fs.existsSync(path.join(target, "src"))) {
  throw new Error("financial-document-datetime-source: expected reconstructed application directory");
}

const dst = (rel) => path.join(target, rel);
const read = (rel) => fs.readFileSync(dst(rel), "utf8");
const write = (rel, value) => fs.writeFileSync(dst(rel), value);

function replaceRequired(text, before, after, label) {
  if (text.includes(after)) return text;
  if (!text.includes(before)) {
    throw new Error("financial-document-datetime-source: pattern not found (" + label + ")");
  }
  return text.replace(before, after);
}

// Novas despesas/adiantamentos começam sem data artificial.
// A data e a hora devem vir do comprovante/foto; edição preserva o valor já salvo.
{
  const rel = "src/routes/dono/despesas.tsx";
  let s = read(rel);

  // O layout atual abre o diálogo por um setEditing inline. Remova qualquer
  // preenchimento automático com a data do sistema, sem depender da versão visual.
  s = s.replaceAll(
    'date: new Date().toISOString().slice(0, 10),',
    'date: "",',
  );
  s = s.replaceAll('date: today,', 'date: "",');
  s = s.replace(
    /\n\s*const today = new Date\(\)\.toISOString\(\)\.slice\(0, 10\);/,
    "",
  );
  if (/date:\s*(?:today|new Date\(\)\.toISOString\(\)\.slice\(0, 10\))/.test(s)) {
    throw new Error("financial-document-datetime-source: current-date default still present in expense draft");
  }

  s = replaceRequired(
    s,
    '    setDate(value.date ?? new Date().toISOString().slice(0, 10));',
    '    setDate(value.date ?? "");',
    "reset date without today fallback",
  );

  s = replaceRequired(
    s,
    '                date: date || new Date().toISOString().slice(0, 10),\n                transactionTime: transactionTime || null,',
    '                date,\n                transactionTime: transactionTime || null,',
    "submit date without today fallback",
  );

  s = replaceRequired(
    s,
    '            const parsedAmount = parseLocaleNumberOrZero(amount);',
    '            if (!date) return toast.error("A data deve ser lida do comprovante/foto ou informada após conferência.");\n            const parsedAmount = parseLocaleNumberOrZero(amount);',
    "require verified date",
  );

  s = s.replace(
    '<Field label="Data"><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} required /></Field>',
    '<Field label="Data do documento"><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} required /></Field>',
  );
  s = s.replace(
    '<Field label="Hora"><Input type="time" value={transactionTime} onChange={(e) => setTransactionTime(e.target.value)} /></Field>',
    '<Field label="Hora do documento"><Input type="time" value={transactionTime} onChange={(e) => setTransactionTime(e.target.value)} /></Field>',
  );

  s = replaceRequired(
    s,
    '                toast.success(isAdvance && result.suggestedDriverName ? "Valor, data/hora do PDF e motorista vinculados para conferência." : "Valor e data/hora do PDF preenchidos para conferência.");',
    '                if (!result.date || !result.time) {\n                  toast.warning("Data ou hora não identificadas no comprovante. Não usei a data/hora atual; confira o documento.");\n                } else {\n                  toast.success(isAdvance && result.suggestedDriverName ? "Valor, data/hora do documento e motorista vinculados para conferência." : "Valor, data/hora do documento preenchidos para conferência.");\n                }',
    "reader feedback",
  );

  write(rel, s);
}

// Em lote, só considerar uma despesa pronta quando VALOR + DATA + HORA forem realmente extraídos.
{
  const rel = "src/components/financial-document-reader.tsx";
  let s = read(rel);

  s = replaceRequired(
    s,
    `  function isReadyForBatch(item: BatchPdfItem) {
    if (!item.result || !item.result.amount || !item.result.date) return false;
    if (kind === "expense") return true;
    return !!(item.result.time && item.result.suggestedDriverId);
  }`,
    `  function isReadyForBatch(item: BatchPdfItem) {
    if (!item.result || !item.result.amount || !item.result.date || !item.result.time) return false;
    if (kind === "expense") return true;
    return !!item.result.suggestedDriverId;
  }`,
    "batch requires date and time",
  );

  s = s.replace(
    "Nenhuma despesa selecionada possui valor e data suficientes.",
    "Nenhuma despesa selecionada possui valor, data e hora suficientes.",
  );

  s = s.replace(
    "Foto, PDF, vários arquivos ou ZIP pela Salomão IA. Extrai Valor, Data e Hora de cada item; em lote, você pode selecionar e lançar todas as despesas identificadas.",
    "Foto, PDF, vários arquivos ou ZIP pela Salomão IA. Extrai Valor, Data e Hora diretamente de cada documento; não usa a data/hora do envio nem a data atual. Em lote, só ficam prontas as despesas com esses dados identificados.",
  );

  write(rel, s);
}

// API de despesas em lote: não gravar horário ausente como se o item estivesse completo.
{
  const rel = "src/routes/api/lancar-despesas-comprovantes-lote.ts";
  let s = read(rel);

  s = replaceRequired(
    s,
    "            if (!amount || !date) {",
    "            if (!amount || !date || !time) {",
    "batch API requires time",
  );
  s = s.replace(
    "Valor ou data não identificados neste comprovante.",
    "Valor, data ou hora não identificados neste comprovante.",
  );

  write(rel, s);
}

// Regra do leitor visual: data/hora vêm exclusivamente do conteúdo visível do comprovante.
{
  const rel = "src/lib/financial-document-reader.server.ts";
  let s = read(rel);

  s = replaceRequired(
    s,
    '    "6A. Nunca use a data atual do sistema, data de download, data de geração/emissão do PDF ou horário do arquivo como data/hora da transação. Se a data/hora da transação não estiver explícita, retorne null.",',
    '    "6A. date e time devem vir EXCLUSIVAMENTE da data e hora da transação/pagamento impressas ou visíveis no conteúdo do comprovante/foto.",\n    "6B. Nunca use data atual do sistema, data/hora do upload, nome do arquivo, metadados/EXIF, data de download, geração/emissão do PDF ou horário do arquivo. Se a data/hora da transação não estiver explícita, retorne null.",',
    "strict document datetime prompt",
  );

  write(rel, s);
}

console.log("[financial-document-datetime-source] document/photo date and time are authoritative; current-time fallback removed");
