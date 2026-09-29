import fs from "node:fs";
import path from "node:path";

const target = path.resolve(process.argv[2] || "");
if (!process.argv[2] || !fs.existsSync(path.join(target, "src"))) {
  throw new Error("universal-file-readers: expected reconstructed application directory");
}
const repo = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const dst = (rel) => path.join(target, rel);
const src = (rel) => path.join(repo, rel);
const read = (rel) => fs.readFileSync(dst(rel), "utf8");
const write = (rel, value) => fs.writeFileSync(dst(rel), value);

function copy(from, to) {
  fs.mkdirSync(path.dirname(dst(to)), { recursive: true });
  fs.copyFileSync(src(from), dst(to));
}

function addImport(text, line, marker) {
  if (text.includes(marker)) return text;
  const matches = [...text.matchAll(/^import .*;\s*$/gm)];
  if (!matches.length) throw new Error("universal-file-readers: import block not found for " + marker);
  const last = matches[matches.length - 1];
  const end = (last.index || 0) + last[0].length;
  return text.slice(0, end) + "\n" + line + text.slice(end);
}

function replaceRequired(text, before, after, label) {
  if (text.includes(after)) return text;
  if (!text.includes(before)) throw new Error("universal-file-readers: pattern not found (" + label + ")");
  return text.replace(before, after);
}

copy("render-overrides/operational-file-reader-20260929.tsx", "src/components/operational-file-reader.tsx");

// jszip is required to open ZIP files from every launcher.
{
  const packagePath = dst("package.json");
  const pkg = JSON.parse(fs.readFileSync(packagePath, "utf8"));
  pkg.dependencies = { ...(pkg.dependencies || {}), jszip: pkg.dependencies?.jszip || "^3.10.1" };
  fs.writeFileSync(packagePath, JSON.stringify(pkg, null, 2) + "\n");
}

// Keep context-specific readers safe: a fueling reader must not accidentally launch a trip,
// and a trip reader must not create another type of operation.
{
  const rel = "src/routes/api/operation-import.ts";
  let s = read(rel);
  if (!s.includes("const expectedKindRaw=")) {
    s = replaceRequired(
      s,
      '      const contextText=typeof body?.contextText==="string" ? body.contextText.slice(0,12000) : "";',
      '      const contextText=typeof body?.contextText==="string" ? body.contextText.slice(0,12000) : "";\n' +
      '      const expectedKindRaw=String(body?.expectedKind??"").trim();\n' +
      '      const expectedKind=(expectedKindRaw==="trip"||expectedKindRaw==="fueling"||expectedKindRaw==="advance") ? expectedKindRaw : null;',
      "operation expected kind",
    );
  }
  if (!s.includes("Arquivo identificado como")) {
    s = replaceRequired(
      s,
      '      for (const operation of analysis.operations.slice(0,100)) {\n        const identity=await resolveIdentity(sql,drivers,fleets,operation,selectedDriver,selectedFleet);',
      '      for (const operation of analysis.operations.slice(0,100)) {\n' +
      '        const identity=await resolveIdentity(sql,drivers,fleets,operation,selectedDriver,selectedFleet);\n' +
      '        if(expectedKind && operation.kind!==expectedKind) {\n' +
      '          review.push({saved:false,kind:operation.kind,message:"Arquivo identificado como "+operation.kind+"; não lancei porque este leitor está aberto para "+expectedKind+".",operation});\n' +
      '          continue;\n' +
      '        }',
      "operation category guard",
    );
  }
  write(rel, s);
}

// Frete: the same reader travels with the trip form anywhere that form is used.
{
  const rel = "src/components/owner/trip-form.tsx";
  let s = read(rel);
  s = addImport(
    s,
    'import { OperationalFileReader } from "@/components/operational-file-reader";',
    'from "@/components/operational-file-reader"',
  );

  if (!s.includes('<OperationalFileReader expectedKind="trip"')) {
    const formMatch = s.match(/<form\b[^>]*>/);
    if (!formMatch || formMatch.index == null) throw new Error("universal-file-readers: trip form opening tag not found");
    const end = formMatch.index + formMatch[0].length;
    const block =
      '\n      <div className="mb-4">\n' +
      '        <OperationalFileReader\n' +
      '          expectedKind="trip"\n' +
      '          driverId={form.driverId || null}\n' +
      '          fleetId={form.fleetId || null}\n' +
      '          title="Leitor de frete"\n' +
      '          description="Foto, PDF, vários arquivos ou ZIP. A Trans Salomão IA extrai ticket, peso líquido, placas, motorista, rota e modalidade; quando estiver seguro, envia para o Caixa."\n' +
      '        />\n' +
      '      </div>';
    s = s.slice(0, end) + block + s.slice(end);
  }
  write(rel, s);
}

// Abastecimentos: preserve the specialized image reader and add the complete PDF/ZIP/multi-file intake
// using the same selected driver and fleet.
{
  const rel = "src/components/fueling-photo-reader.tsx";
  let s = read(rel);
  s = addImport(
    s,
    'import { OperationalFileReader } from "@/components/operational-file-reader";',
    'from "@/components/operational-file-reader"',
  );

  if (!s.includes('<OperationalFileReader expectedKind="fueling"')) {
    const marker = '      {progress ? <p className="mt-4 text-sm text-muted">{progress}</p> : null}';
    if (!s.includes(marker)) throw new Error("universal-file-readers: fueling insertion point not found");
    const block =
      '      <div className="mt-4">\n' +
      '        <OperationalFileReader\n' +
      '          expectedKind="fueling"\n' +
      '          driverId={driverId || null}\n' +
      '          fleetId={fleetId || null}\n' +
      '          title="Arquivos de abastecimento"\n' +
      '          description="Use foto, PDF, vários arquivos ou ZIP. A IA extrai posto, data/hora, litros, preço por litro, total e placa; só grava automaticamente quando os dados de abastecimento estiverem seguros."\n' +
      '        />\n' +
      '      </div>\n\n' +
      marker;
    s = s.replace(marker, block);
  }
  write(rel, s);
}

// Despesas/Adiantamentos: broaden the existing reader shown in the user's screenshot.
// Multiple selection now accepts photos + PDFs, and ZIP works in both kinds.
{
  const rel = "src/components/financial-document-reader.tsx";
  let s = read(rel);

  s = replaceRequired(
    s,
    '    const allPdf = selected.every((file) => file.type === "application/pdf" || /\\.pdf$/i.test(file.name));\n' +
    '    if (selected.length > 1) {\n' +
    '      if (!allPdf) {\n' +
    '        setError("Para selecionar vários arquivos de uma vez, escolha somente PDFs.");\n' +
    '        if (fileInput.current) fileInput.current.value = "";\n' +
    '        return;\n' +
    '      }\n' +
    '      await handlePdfBatch(selected);\n' +
    '      return;\n' +
    '    }\n' +
    '    await handleFile(selected[0], allPdf ? "pdf_text" : "ai");',
    '    const firstIsPdf = selected[0]?.type === "application/pdf" || /\\.pdf$/i.test(selected[0]?.name || "");\n' +
    '    if (selected.length > 1) {\n' +
    '      await handlePdfBatch(selected);\n' +
    '      return;\n' +
    '    }\n' +
    '    await handleFile(selected[0], firstIsPdf ? "pdf_text" : "ai");',
    "financial multi any",
  );

  s = replaceRequired(
    s,
    '        setBatchProgress("Lendo PDF " + (index + 1) + " de " + selected.length + ": " + (file.name || "comprovante.pdf"));\n' +
    '        try {\n' +
    '          const result = await readOne(file, "pdf_text");',
    '        setBatchProgress("Lendo arquivo " + (index + 1) + " de " + selected.length + ": " + (file.name || "comprovante"));\n' +
    '        try {\n' +
    '          const isPdf = file.type === "application/pdf" || /\\.pdf$/i.test(file.name);\n' +
    '          const result = await readOne(file, isPdf ? "pdf_text" : "ai");',
    "financial batch mixed read",
  );

  if (s.includes('    if (kind !== "advance") {\n      setError("ZIP de comprovantes é usado para lançar adiantamentos de motoristas.");\n      return;\n    }')) {
    s = s.replace(
      '    if (kind !== "advance") {\n      setError("ZIP de comprovantes é usado para lançar adiantamentos de motoristas.");\n      return;\n    }\n',
      "",
    );
  }

  s = replaceRequired(
    s,
    '      const pdfEntries = Object.entries(archive)\n        .filter(([name, bytes]) => !name.startsWith("__MACOSX/") && /\\.pdf$/i.test(name) && bytes.length > 0);\n\n      if (!pdfEntries.length) {\n        throw new Error("Não encontrei nenhum PDF dentro deste ZIP.");\n      }\n      if (pdfEntries.length > 100) {\n        throw new Error("O ZIP possui mais de 100 PDFs. Divida em dois arquivos ZIP para processar.");\n      }\n\n      for (let index = 0; index < pdfEntries.length; index += 1) {\n        const [entryName, bytes] = pdfEntries[index];\n        const displayName = entryName.replace(/^.*[\\\\/]/, "") || ("comprovante-" + (index + 1) + ".pdf");\n        setBatchProgress("Lendo PDF " + (index + 1) + " de " + pdfEntries.length + " do ZIP: " + displayName);',
    '      const pdfEntries = Object.entries(archive)\n        .filter(([name, bytes]) => !name.startsWith("__MACOSX/") && /\\.(?:pdf|jpe?g|png|webp)$/i.test(name) && bytes.length > 0);\n\n      if (!pdfEntries.length) {\n        throw new Error("Não encontrei PDF ou foto compatível dentro deste ZIP.");\n      }\n      if (pdfEntries.length > 100) {\n        throw new Error("O ZIP possui mais de 100 arquivos compatíveis. Divida em dois ZIPs para processar.");\n      }\n\n      for (let index = 0; index < pdfEntries.length; index += 1) {\n        const [entryName, bytes] = pdfEntries[index];\n        const displayName = entryName.replace(/^.*[\\\\/]/, "") || ("comprovante-" + (index + 1));\n        setBatchProgress("Lendo arquivo " + (index + 1) + " de " + pdfEntries.length + " do ZIP: " + displayName);',
    "financial zip mixed entries",
  );

  s = replaceRequired(
    s,
    '          const pdfFile = new File([copy.buffer], displayName, { type: "application/pdf" });\n          const result = await readOne(pdfFile, "pdf_text");',
    '          const mime = /\\.pdf$/i.test(displayName) ? "application/pdf" : /\\.png$/i.test(displayName) ? "image/png" : /\\.webp$/i.test(displayName) ? "image/webp" : "image/jpeg";\n' +
    '          const archiveFile = new File([copy.buffer], displayName, { type: mime });\n' +
    '          const result = await readOne(archiveFile, mime === "application/pdf" ? "pdf_text" : "ai");',
    "financial zip file type",
  );

  if (!s.includes('if (kind !== "advance") {\n        setBatchActionMessage("Arquivos lidos. Toque em Preencher')) {
    const marker = '      if (!readyIndexes.length) {\n        setBatchActionMessage("Os PDFs foram lidos, mas nenhum contém RECEBEDOR, VALOR, DATA e HORA suficientes para lançar automaticamente.");\n        return;\n      }\n\n      setBatchSaving(true);';
    if (!s.includes(marker)) throw new Error("universal-file-readers: financial ZIP save marker not found");
    s = s.replace(
      marker,
      '      if (kind !== "advance") {\n' +
      '        setBatchActionMessage("Arquivos lidos. Toque em Preencher no comprovante que deseja usar nesta despesa.");\n' +
      '        return;\n' +
      '      }\n\n' +
      '      if (!readyIndexes.length) {\n' +
      '        setBatchActionMessage("Os arquivos foram lidos, mas nenhum contém RECEBEDOR, VALOR, DATA e HORA suficientes para lançar automaticamente.");\n' +
      '        return;\n' +
      '      }\n\n' +
      '      setBatchSaving(true);',
    );
  }

  s = s.replace(
    'Selecionar vários PDFs',
    'Selecionar vários arquivos',
  );
  s = s.replace(
    '{kind === "advance" ? (\n            <Button type="button" size="sm" variant="secondary" disabled={busy || batchSaving} onClick={() => zipInput.current?.click()}>\n              {busy ? <LoaderCircle className="size-4 animate-spin" /> : <Archive className="size-4" />} ZIP de PDFs\n            </Button>\n          ) : null}',
    '<Button type="button" size="sm" variant="secondary" disabled={busy || batchSaving} onClick={() => zipInput.current?.click()}>\n            {busy ? <LoaderCircle className="size-4 animate-spin" /> : <Archive className="size-4" />} ZIP de arquivos\n          </Button>',
  );
  s = s.replace(
    'accept="application/pdf,.pdf"\n        multiple\n        onChange={(event) => void handlePdfBatch(event.target.files)}',
    'accept="application/pdf,image/jpeg,image/png,image/webp,.pdf,.jpg,.jpeg,.png,.webp"\n        multiple\n        onChange={(event) => void handlePdfBatch(event.target.files)}',
  );
  s = s.replaceAll("PDFs processados", "Arquivos processados");
  s = s.replaceAll("PDF(s)", "arquivo(s)");
  s = s.replace(
    'No Android, você pode selecionar PDFs separados ou tocar em “ZIP de PDFs”. No ZIP, a Salomão IA abre os PDFs, identifica RECEBEDOR, VALOR, DATA e HORA de cada Pix, cruza o recebedor com os motoristas cadastrados e lança automaticamente os comprovantes completos. PDFs incompletos ficam pendentes e duplicados são ignorados.',
    'No Android, você pode selecionar fotos, PDFs, vários arquivos de uma vez ou ZIP. A Salomão IA abre cada item, identifica RECEBEDOR, VALOR, DATA e HORA e, nos adiantamentos, cruza o recebedor com os motoristas cadastrados. Itens incompletos ficam para conferência e duplicados são ignorados.',
  );
  s = s.replace(
    '"Lê Valor, Data, Hora e o Nome do Recebedor. O recebedor é comparado com o cadastro e vinculado como motorista quando houver correspondência segura. Aceita vários PDFs e também ZIP com PDFs, lançando automaticamente os comprovantes completos."',
    '"Lê Valor, Data, Hora e o Nome do Recebedor. Aceita foto, PDF, vários arquivos e ZIP; o recebedor é comparado com o cadastro e vinculado como motorista quando houver correspondência segura."',
  );
  s = s.replace(
    '"Foto ou PDF pela Salomão IA, ou PDF automático pelo próprio texto do arquivo. Preenche Valor, Data e Hora para conferência."',
    '"Foto, PDF, vários arquivos ou ZIP pela Salomão IA. Preenche Valor, Data e Hora para conferência."',
  );

  write(rel, s);
}

console.log("[universal-file-readers] same photo/PDF/multi/ZIP options added to freight, fueling, advances and expenses");
