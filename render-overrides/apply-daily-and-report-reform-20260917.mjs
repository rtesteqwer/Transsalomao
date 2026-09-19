import fs from 'node:fs';
import path from 'node:path';

const target = process.argv[2];
if (!target) throw new Error('daily-report-reform: target missing');

function file(rel) { return path.join(target, rel); }
function mustReplace(text, before, after, label) {
  if (!text.includes(before)) throw new Error(`daily-report-reform: pattern not found (${label})`);
  return text.replace(before, after);
}
function patch(rel, fn) {
  const p = file(rel);
  if (!fs.existsSync(p)) throw new Error(`daily-report-reform: missing ${rel}`);
  const before = fs.readFileSync(p, 'utf8');
  const after = fn(before);
  if (after === before) throw new Error(`daily-report-reform: no changes in ${rel}`);
  fs.writeFileSync(p, after);
}

// 1) Keep the internal "trip" key for backwards compatibility, but present it as Diária.
patch('src/lib/calc.ts', (s) => mustReplace(s, 'if (mode === "trip") return "Por viagem";', 'if (mode === "trip") return "Diária";', 'freight label'));

// 2) reports already have daily_value in production. Expose it end-to-end without a DB migration.
patch('src/lib/types.ts', (s) => mustReplace(
  s,
  '  tons: number;\n  freightMode: FreightMode | null;',
  '  tons: number;\n  dailyValue: number;\n  freightMode: FreightMode | null;',
  'DriverReport dailyValue',
));

patch('src/lib/api.ts', (s) => {
  s = mustReplace(s,
    '    tons: num(r.tons),\n    freightMode: nullableFreightMode(r.freight_mode),',
    '    tons: num(r.tons),\n    dailyValue: num(r.daily_value),\n    freightMode: nullableFreightMode(r.freight_mode),',
    'mapReport dailyValue');
  s = mustReplace(s,
    '  tons: z.number().min(0).default(0),\n  freightMode: z.enum(["ton", "trip", "cegonha", "caixinha"]).nullable().optional().default(null),',
    '  tons: z.number().min(0).default(0),\n  dailyValue: z.number().min(0).default(0),\n  freightMode: z.enum(["ton", "trip", "cegonha", "caixinha"]).nullable().optional().default(null),',
    'report schema dailyValue');
  s = mustReplace(s,
    "      insert into reports (id, ticket, driver_id, fleet_id, km, tons, freight_mode, status)\n      values (${id}, ${ticket}, ${data.driverId}, ${data.fleetId}, ${data.km}, ${data.tons}, ${data.freightMode ?? null}, 'pendente')",
    "      insert into reports (id, ticket, driver_id, fleet_id, km, tons, daily_value, freight_mode, status)\n      values (${id}, ${ticket}, ${data.driverId}, ${data.fleetId}, ${data.km}, ${data.tons}, ${data.dailyValue}, ${data.freightMode ?? null}, 'pendente')",
    'report insert dailyValue');
  const modesBefore = 'const modes = [...new Set(reports.map((report) => nullableFreightMode(report.freight_mode)).filter((mode): mode is "trip" | "cegonha" | "caixinha" => mode === "trip" || mode === "cegonha" || mode === "caixinha"))];';
  const modesAfter = 'const modes = [...new Set(reports.map((report) => nullableFreightMode(report.freight_mode)).filter((mode): mode is "cegonha" | "caixinha" => mode === "cegonha" || mode === "caixinha"))];';
  if (s.includes(modesBefore)) s = s.replace(modesBefore, modesAfter);
  else if (!s.includes(modesAfter)) throw new Error('daily-report-reform: compatible bulk modes block not found');

  const priceBefore = '      const reportId = str(report.id); const mode = nullableFreightMode(report.freight_mode); const price = mode && mode !== "ton" ? (prices.get(mode) ?? 0) : 0;';
  const priceAfter = '      const reportId = str(report.id); const mode = nullableFreightMode(report.freight_mode); const price = mode === "trip" ? num(report.daily_value) : mode && mode !== "ton" ? (prices.get(mode) ?? 0) : 0;';
  if (s.includes(priceBefore)) s = s.replace(priceBefore, priceAfter);
  else if (!s.includes(priceAfter)) throw new Error('daily-report-reform: compatible bulk daily price block not found');
  return s;
});

// 3) Driver launch form: Diária gets its own value and sends it to Gerência.
patch('src/routes/motorista.tsx', (s) => {
  s = mustReplace(s,
    '  const [tripCount, setTripCount] = useState("1");',
    '  const [tripCount, setTripCount] = useState("1");\n  const [dailyValue, setDailyValue] = useState("");',
    'daily state');
  s = mustReplace(s,
    '    const tonsN = parseLocaleNumber(tons);',
    '    const tonsN = parseLocaleNumber(tons);\n    const dailyValueN = parseLocaleNumber(dailyValue);',
    'daily parse');
  s = mustReplace(s,
    '    if (!freightMode) return toast.error("Escolha o modo de frete.");',
    '    if (!freightMode) return toast.error("Escolha o modo de frete.");\n    if (freightMode === "trip" && (!(dailyValueN != null) || dailyValueN <= 0)) return toast.error("Informe o valor da diária.");',
    'daily validation');
  s = mustReplace(s,
    '          tons: batchMode ? 0 : (tonsN ?? 0),\n          freightMode,',
    '          tons: batchMode || freightMode === "trip" ? 0 : (tonsN ?? 0),\n          dailyValue: freightMode === "trip" ? (dailyValueN ?? 0) : 0,\n          freightMode,',
    'daily submit');
  s = mustReplace(s,
    '      setTons("");\n      if (batchMode) setTripCount("1");',
    '      setTons("");\n      setDailyValue("");\n      if (batchMode) setTripCount("1");',
    'clear daily');
  const tonBranch = ') : (\n            <Field label="Toneladas" hint="Opcional">';
  const dailyBranch = `) : freightMode === "trip" ? (\n            <Field label="Valor da diária (R$)" hint="Obrigatório — este valor será enviado para a Gerência">\n              <Input\n                value={dailyValue}\n                onChange={(e) => setDailyValue(e.target.value)}\n                inputMode="decimal"\n                placeholder="0,00"\n                className="h-14 font-display text-2xl tabular tracking-wide"\n              />\n              <p className="mt-2 text-xs text-muted">A comissão do motorista será calculada sobre o valor desta diária.</p>\n            </Field>\n          ) : (\n            <Field label="Toneladas" hint="Opcional">`;
  s = mustReplace(s, tonBranch, dailyBranch, 'daily input branch');
  return s;
});

// 4) Closing a driver report must preserve the driver's daily value instead of replacing it with a global price.
patch('src/routes/dono/lancamentos.tsx', (s) => {
  s = mustReplace(s,
    '          freightMode: open.freightMode ?? "ton",\n          dieselPrice: String(lastDieselPrice(data.trips)),',
    '          freightMode: open.freightMode ?? "ton",\n          pricePerTrip: open.freightMode === "trip" ? String(open.dailyValue || "") : "",\n          dieselPrice: String(lastDieselPrice(data.trips)),',
    'seed daily in close');
  s = mustReplace(s,
    '{r.freightMode === "cegonha" || r.freightMode === "caixinha" ? "Lançamento" : "Toneladas"}',
    '{r.freightMode === "trip" ? "Valor da diária" : r.freightMode === "cegonha" || r.freightMode === "caixinha" ? "Lançamento" : "Toneladas"}',
    'pending daily label');
  s = mustReplace(s,
    '{r.freightMode === "cegonha" || r.freightMode === "caixinha" ? "1 viagem" : `${num(r.tons, 2)} t`}',
    '{r.freightMode === "trip" ? new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(r.dailyValue || 0) : r.freightMode === "cegonha" || r.freightMode === "caixinha" ? "1 viagem" : `${num(r.tons, 2)} t`}',
    'pending daily value');
  return s;
});

patch('src/components/owner/trip-form.tsx', (s) => {
  s = mustReplace(s, '    if (form.freightMode === "ton") return;', '    if (form.freightMode === "ton" || form.freightMode === "trip") return;', 'do not overwrite daily');
  s = mustReplace(s,
    '                          opt.key === "trip"\n                            ? globalPrices.trip || ""',
    '                          opt.key === "trip"\n                            ? f.pricePerTrip || ""',
    'mode click preserves daily');
  s = mustReplace(s,
    ': `Por viagem: valor automático definido pela Gerência (${brl(globalPrices.trip)}) por viagem.`}',
    ': "Diária: informe o valor da diária para esta viagem."}',
    'daily help');
  s = mustReplace(s,
    '? "Preço automático — Por viagem"',
    '? "Valor da diária (R$)"',
    'daily form field label');
  s = mustReplace(s, '              readOnly\n', '              readOnly={form.freightMode !== "trip"}\n', 'daily editable');
  return s.replace(/(["'])Por viagem\1/g, '$1Diária$1');
});

// Consistent mode naming anywhere else in the application without changing phrases like "por viagem" used as a unit.
for (const rel of [
  'src/routes/dono/index.tsx',
  'src/routes/dono/totais.tsx',
  'src/routes/dono/viagens.tsx',
  'src/routes/dono/cadastros.tsx',
  'src/routes/klebersom.tsx',
]) {
  const p = file(rel);
  if (!fs.existsSync(p)) continue;
  let s = fs.readFileSync(p, 'utf8');
  s = s.replace(/(["'])Por viagem\1/g, '$1Diária$1');
  fs.writeFileSync(p, s);
}

// 5) PDF: real diesel is the sum of fuelings; net = freight - diesel - commission.
// Remove the weight category, remove COMISSÃO A PAGAR balloon, enlarge logo, and list every freight in the general PDF.
patch('src/lib/pdf.ts', (s) => {
  s = mustReplace(s,
    '  const commissionPayable = totalCommission - totalAdvances;\n  const totalFreight = trips.reduce((sum, trip) => sum + Number((trip as any).freight ?? 0), 0);\n  const totalDiesel = trips.reduce((sum, trip) => sum + Number((trip as any).dieselCost ?? 0), 0);\n  const totalGrossResult = totalFreight - totalDiesel;\n  const totalNetRevenue = totalGrossResult - totalCommission;\n  const totalFuelings = fuelings.reduce((sum, item: any) => sum + Number(item.liters ?? 0) * Number(item.pricePerLiter ?? 0), 0);',
    '  const totalFreight = trips.reduce((sum, trip) => sum + Number((trip as any).freight ?? 0), 0);\n  const totalDiesel = fuelings.reduce((sum, item: any) => sum + Number(item.liters ?? 0) * Number(item.pricePerLiter ?? 0), 0);\n  const totalGrossResult = totalFreight - totalDiesel;\n  const totalNetRevenue = totalFreight - totalDiesel - totalCommission;\n  const totalFuelings = totalDiesel;',
    'pdf totals');

  const rowsStart = s.indexOf('  const compactTrips = (() => {');
  const rowsEnd = s.indexOf('  const drawHeader = () => {', rowsStart);
  if (rowsStart < 0 || rowsEnd < 0) throw new Error('daily-report-reform: PDF rows block not found');
  const rowsBlock = `  const modeLabelCompact = (mode: string) => mode === "trip" ? "Diária" : mode === "cegonha" ? "Cegonha" : mode === "caixinha" ? "Caixinha" : "Por tonelada";\n  const sortedTrips = [...trips].sort((a: any, b: any) => String(a.driverName ?? "").localeCompare(String(b.driverName ?? ""), "pt-BR") || reportDateKey(a.date).localeCompare(reportDateKey(b.date)) || String(a.code ?? "").localeCompare(String(b.code ?? ""), "pt-BR", { numeric: true }));\n  const rowForTrip = (trip: any) => {\n    const mode = String(trip.freightMode ?? "ton");\n    const details = mode === "ton"\n      ? \`Peso líquido: \${tons(Number(trip.netWeight ?? 0))}  •  \${brl(Number(trip.pricePerTon ?? 0))}/t\`\n      : mode === "trip"\n        ? \`Valor da diária: \${brl(Number(trip.pricePerTrip ?? trip.freight ?? 0))}\`\n        : \`\${modeLabelCompact(mode)} • 1 frete\`;\n    return [formatDate(trip.date), \`\${String(trip.code ?? "—")} • \${modeLabelCompact(mode)}\`, String(trip.driverName ?? driverName ?? "—"), details, brl(Number(trip.freight ?? 0)), brl(Number(trip.commissionValue ?? trip.commission ?? 0)), brl(Number(trip.afterCommission ?? (Number(trip.freight ?? 0) - Number(trip.commissionValue ?? trip.commission ?? 0))))];\n  };\n  const generalRows = sortedTrips.map(rowForTrip);\n  const compactRows = (() => {\n    const rows: any[][] = [];\n    const grouped = new Map<string, any>();\n    sortedTrips.forEach((trip: any) => {\n      const mode = String(trip.freightMode ?? "ton");\n      if (mode === "ton") { rows.push(rowForTrip(trip)); return; }\n      const name = String(trip.driverName ?? driverName ?? "Motorista");\n      const key = String(trip.driverId ?? name) + "|" + mode;\n      const current = grouped.get(key) ?? { mode, name, count: 0, firstDate: reportDateKey(trip.date), lastDate: reportDateKey(trip.date), freight: 0, commission: 0, after: 0 };\n      current.count += 1; const d = reportDateKey(trip.date); if (d < current.firstDate) current.firstDate = d; if (d > current.lastDate) current.lastDate = d; current.freight += Number(trip.freight ?? 0); current.commission += Number(trip.commissionValue ?? trip.commission ?? 0); current.after += Number(trip.afterCommission ?? (Number(trip.freight ?? 0) - Number(trip.commissionValue ?? trip.commission ?? 0))); grouped.set(key, current);\n    });\n    grouped.forEach((item) => { const dateText = item.firstDate === item.lastDate ? formatDate(item.firstDate) : \`\${formatDate(item.firstDate)} a \${formatDate(item.lastDate)}\`; rows.push([dateText, \`\${modeLabelCompact(item.mode)} • \${item.count} fretes\`, item.name, \`\${item.count} fretes\`, brl(item.freight), brl(item.commission), brl(item.after)]); });\n    return rows;\n  })();\n  const isGeneralReport = String(driverName ?? "").toLocaleLowerCase("pt-BR").includes("todos os motoristas");\n  const rows = isGeneralReport ? generalRows : compactRows;\n\n`;
  s = s.slice(0, rowsStart) + rowsBlock + s.slice(rowsEnd);

  s = mustReplace(s,
    '    doc.rect(0, 0, 297, 24, "F");\n    doc.addImage(REPORT_LOGO_JPEG, "JPEG", 7, 1.7, 42, 21.9, undefined, "FAST");',
    '    doc.rect(0, 0, 297, 32, "F");\n    doc.addImage(REPORT_LOGO_JPEG, "JPEG", 6, 1.5, 56, 29, undefined, "FAST");',
    'pdf bigger logo');
  s = mustReplace(s,
    '    doc.text(driverName || "Motorista", 145, 8.7, { align: "center" });',
    '    doc.text(driverName || "Motorista", 150, 10.5, { align: "center" });',
    'pdf title position');
  s = mustReplace(s,
    '    doc.text(reportTitle || "Relatório operacional por motorista", 145, 13.2, { align: "center" });\n    doc.text(`${periodLabel || "Período selecionado"}  •  ${sourceLabel || "Gerência"}  •  Operador: ${operatorName || "admin"}`, 145, 17.1, { align: "center" });',
    '    doc.text(reportTitle || "Relatório operacional por motorista", 150, 16.2, { align: "center" });\n    doc.text(`${periodLabel || "Período selecionado"}  •  ${sourceLabel || "Gerência"}  •  Operador: ${operatorName || "admin"}`, 150, 21.3, { align: "center" });',
    'pdf subtitle position');

  s = s.replace(/\n\s*doc\.setFillColor\(\.\.\.dark\);\n\s*doc\.roundedRect\(218, 3\.2, 72, 16\.5, 1\.4, 1\.4, "F"\);[\s\S]*?doc\.text\(brl\(commissionPayable\), 254, 14\.7, \{ align: "center" \}\);/m, '');
  if (s.includes('COMISSÃO A PAGAR')) throw new Error('daily-report-reform: commission balloon still present');
  s = mustReplace(s, '    doc.line(7, 22.3, 290, 22.3);', '    doc.line(7, 30.5, 290, 30.5);', 'pdf header line');
  s = s.replace(/startY: 25,/g, 'startY: 34,').replace(/top: 25, right: 7, bottom: 9, left: 7/g, 'top: 34, right: 7, bottom: 9, left: 7').replace(/finalY \?\? 25/g, 'finalY ?? 34').replace(/summaryY = 29;/g, 'summaryY = 36;').replace(/y = 29;/g, 'y = 36;');

  s = mustReplace(s,
    '    head: [["Faturamento total", "Custo diesel", "Resultado bruto", "Comissão total", "Faturamento líquido", "Abastecimentos"]],\n    body: [[brl(totalFreight), brl(totalDiesel), brl(totalGrossResult), brl(totalCommission), brl(totalNetRevenue), brl(totalFuelings)]],',
    '    head: [["Faturamento total", "Custo diesel (abastecimentos)", "Resultado bruto", "Comissão total", "Faturamento líquido", "Fretes"]],\n    body: [[brl(totalFreight), brl(totalDiesel), brl(totalGrossResult), brl(totalCommission), brl(totalNetRevenue), String(trips.length)]],',
    'pdf summary diesel');
  s = mustReplace(s,
    '    head: [["Data", "Ticket / modalidade", "Motorista", "Conjunto", "Peso", "Frete", "Comissão", "Resultado"]],',
    '    head: [["Data", "Ticket / modalidade", "Motorista", "Detalhes do frete", "Frete", "Comissão", "Após comissão"]],',
    'pdf trip headers');
  s = mustReplace(s,
    '      0: { cellWidth: 22 }, 1: { cellWidth: 43 }, 2: { cellWidth: 40 }, 3: { cellWidth: 42 },\n      4: { cellWidth: 28 }, 5: { cellWidth: 36 }, 6: { cellWidth: 36 }, 7: { cellWidth: 36 },',
    '      0: { cellWidth: 21 }, 1: { cellWidth: 52 }, 2: { cellWidth: 44 }, 3: { cellWidth: 64 },\n      4: { cellWidth: 34 }, 5: { cellWidth: 34 }, 6: { cellWidth: 34 },',
    'pdf trip widths');

  s = mustReplace(s,
    '      brl(item.advances),\n      brl(item.commission - item.advances),\n      brl(item.billing - item.commission),',
    '      brl(item.advances),\n      brl(item.billing - item.commission),',
    'pdf commission rows');
  s = mustReplace(s,
    '    head: [["Motorista", "Fretes", "Faturamento", "Comissão bruta", "Adiantamentos", "Comissão a pagar", "Faturamento líquido"]],',
    '    head: [["Motorista", "Fretes", "Faturamento", "Comissão", "Adiantamentos", "Faturamento líquido"]],',
    'pdf commission headers');
  s = mustReplace(s,
    '      0: { cellWidth: 60 },\n      1: { cellWidth: 18, halign: "center" },\n      2: { cellWidth: 42, halign: "right" },\n      3: { cellWidth: 42, halign: "right" },\n      4: { cellWidth: 38, halign: "right" },\n      5: { cellWidth: 42, halign: "right" },\n      6: { cellWidth: 42, halign: "right" },',
    '      0: { cellWidth: 70 },\n      1: { cellWidth: 22, halign: "center" },\n      2: { cellWidth: 48, halign: "right" },\n      3: { cellWidth: 48, halign: "right" },\n      4: { cellWidth: 45, halign: "right" },\n      5: { cellWidth: 48, halign: "right" },',
    'pdf commission widths');

  s = mustReplace(s,
    '  addDetailTable("ABASTECIMENTOS", ["Data", "Motorista", "Conjunto", "Posto", "Litros", "Preço/L", "Custo", "KM"], fuelings.map((f: any) => [formatDate(f.date), f.driverName ?? "Sem motorista", f.fleetName ?? "—", f.station ?? "—", liters(Number(f.liters ?? 0)), brl(Number(f.pricePerLiter ?? 0)), brl(Number(f.liters ?? 0) * Number(f.pricePerLiter ?? 0)), integer(Number(f.km ?? 0))]));',
    '  addDetailTable("ABASTECIMENTOS / CUSTO DIESEL", ["Data", "Motorista", "Posto", "Litros", "Preço/L", "Custo diesel"], fuelings.map((f: any) => [formatDate(f.date), f.driverName ?? "Sem motorista", f.station ?? "—", liters(Number(f.liters ?? 0)), brl(Number(f.pricePerLiter ?? 0)), brl(Number(f.liters ?? 0) * Number(f.pricePerLiter ?? 0))]));',
    'pdf fuel detail');
  s = mustReplace(s,
    '  addDetailTable("DESPESAS", ["Data", "Categoria", "Descrição", "Motorista", "Conjunto", "Valor"], expenses.map((e: any) => [formatDate(e.date), e.category ?? "Despesa", e.description ?? "—", e.driverName ?? "—", e.fleetName ?? "—", brl(Number(e.amount ?? 0))]));',
    '  addDetailTable("DESPESAS", ["Data", "Categoria", "Descrição", "Motorista", "Valor"], expenses.map((e: any) => [formatDate(e.date), e.category ?? "Despesa", e.description ?? "—", e.driverName ?? "—", brl(Number(e.amount ?? 0))]));',
    'pdf expenses simplify');

  s = s.replace(/\s*•\s*Comissão a pagar: \$\{brl\(commissionPayable\)\}/g, '');
  if (s.includes('commissionPayable')) throw new Error('daily-report-reform: commissionPayable still referenced');
  return s.replace(/(["'])Por viagem\1/g, '$1Diária$1');
});

// 6) General XLSX: correct net, larger standardized logo/fonts, no weight category,
// and clean advances/expenses without ID, observations, or fleet columns.
patch('src/routes/dono/totais.tsx', (s) => {
  s = s.replace(/(["'])Por viagem\1/g, '$1Diária$1');
  s = mustReplace(s,
    'sheet.addImage(logoId, { tl: { col: 0.15, row: 0.05 }, ext: { width: 245, height: 128 } });',
    'sheet.addImage(logoId, { tl: { col: 0.08, row: 0.02 }, ext: { width: 305, height: 155 } });',
    'excel bigger logo');
  s = mustReplace(s,
    'sheet.getCell("D1").font = { bold: true, size: 20, color: { argb: white } };',
    'sheet.getCell("D1").font = { bold: true, size: 24, color: { argb: white } };',
    'excel title font');
  s = mustReplace(s,
    'sheet.getRow(1).height = 48; sheet.getRow(2).height = 46; sheet.getRow(3).height = 25;',
    'sheet.getRow(1).height = 58; sheet.getRow(2).height = 54; sheet.getRow(3).height = 30;',
    'excel header heights');
  s = mustReplace(s,
    'cell.font = { bold: true, color: { argb: white }, size: 10 };',
    'cell.font = { bold: true, color: { argb: white }, size: 12 };',
    'excel header font');
  s = mustReplace(s,
    'cell.font = { color: { argb: black }, size: 9 };',
    'cell.font = { color: { argb: black }, size: 11 };',
    'excel row font');
  s = mustReplace(s,
    'cell.font = { bold: true, size: 12, color: { argb: white } };',
    'cell.font = { bold: true, size: 14, color: { argb: white } };',
    'excel section font');

  s = mustReplace(s,
    '    const totalAdvances = Array.from(advancesByDriver.values()).reduce((sum: number, value: number) => sum + value, 0);\n    const totalNetRevenue = totalRevenue - totalFueling - totalCommission - totalAdvances;',
    '    const totalAdvances = Array.from(advancesByDriver.values()).reduce((sum: number, value: number) => sum + value, 0);\n    const totalNetRevenue = totalRevenue - totalFueling - totalCommission;',
    'excel net formula');
  s = mustReplace(s,
    'summary.values = ["Faturamento total", totalRevenue, "Faturamento líquido", totalNetRevenue, "Total de comissão", totalCommission, "Total de abastecimentos", totalFueling];',
    'summary.values = ["Faturamento total", totalRevenue, "Faturamento líquido", totalNetRevenue, "Total de comissão", totalCommission, "Custo diesel", totalFueling];',
    'excel diesel summary');

  s = mustReplace(s,
    '    const tripHeader = sheet.getRow(6); tripHeader.values = ["Motorista", "Modalidade", "Viagens", "Peso líquido", "Faturamento", "Comissão", "Adiantamentos", "Total líquido"]; tripHeader.height = 27; styleHeader(tripHeader);\n    const seenDrivers = new Set<string>();\n    Array.from(grouped.values()).sort((a: any, b: any) => a.driverName.localeCompare(b.driverName, "pt-BR") || modeName(a.mode).localeCompare(modeName(b.mode), "pt-BR")).forEach((item: any, index: number) => { const driverKey = String(item.driverId ?? normalize(item.driverName)); const advance = seenDrivers.has(driverKey) ? 0 : (advancesByDriver.get(driverKey) ?? advancesByDriver.get(normalize(item.driverName)) ?? 0); seenDrivers.add(driverKey); const row = sheet.addRow([item.driverName, modeName(item.mode), item.count, item.weight, item.revenue, item.commission, advance, item.revenue - item.commission - advance]); styleRow(row, index); row.getCell(4).numFmt = \'0.00 "t"\'; for (let c = 5; c <= 8; c += 1) row.getCell(c).numFmt = \'R$ #,##0.00\'; });',
    '    const dieselByDriver = new Map<string, number>();\n    fuelings.forEach((f: any) => { const driver = (data?.drivers ?? []).find((d: any) => String(d.id) === String(f.driverId ?? "")); const key = String(f.driverId ?? normalize(driver?.name)); if (!key) return; dieselByDriver.set(key, (dieselByDriver.get(key) ?? 0) + Number(f.liters ?? 0) * Number(f.pricePerLiter ?? 0)); });\n    const tripHeader = sheet.getRow(6); tripHeader.values = ["Motorista", "Modalidade", "Fretes", "Faturamento", "Comissão", "Adiantamentos", "Custo diesel", "Faturamento líquido"]; tripHeader.height = 32; styleHeader(tripHeader);\n    const seenDrivers = new Set<string>();\n    Array.from(grouped.values()).sort((a: any, b: any) => a.driverName.localeCompare(b.driverName, "pt-BR") || modeName(a.mode).localeCompare(modeName(b.mode), "pt-BR")).forEach((item: any, index: number) => { const driverKey = String(item.driverId ?? normalize(item.driverName)); const firstDriverRow = !seenDrivers.has(driverKey); const advance = firstDriverRow ? (advancesByDriver.get(driverKey) ?? advancesByDriver.get(normalize(item.driverName)) ?? 0) : 0; const diesel = firstDriverRow ? (dieselByDriver.get(driverKey) ?? dieselByDriver.get(normalize(item.driverName)) ?? 0) : 0; seenDrivers.add(driverKey); const row = sheet.addRow([item.driverName, modeName(item.mode), item.count, item.revenue, item.commission, advance, diesel, item.revenue - item.commission - diesel]); styleRow(row, index); for (let c = 4; c <= 8; c += 1) row.getCell(c).numFmt = \'R$ #,##0.00\'; });',
    'excel grouped rows');

  s = mustReplace(s,
    '    addSection("ABASTECIMENTOS", ["Data", "Motorista", "Conjunto", "Posto", "Litros", "Preço/L", "Custo total"]);\n    fuelings.forEach((f: any, index: number) => { const row = sheet.addRow([formatDate(f.date), f.driverName ?? (data?.drivers ?? []).find((d: any) => d.id === f.driverId)?.name ?? "Sem motorista", f.fleetName ?? "—", f.station ?? "—", Number(f.liters ?? 0), Number(f.pricePerLiter ?? 0), Number(f.liters ?? 0) * Number(f.pricePerLiter ?? 0)]); styleRow(row, index); row.getCell(5).numFmt = \'0.00 "L"\'; row.getCell(6).numFmt = row.getCell(7).numFmt = \'R$ #,##0.00\'; });',
    '    addSection("ABASTECIMENTOS / CUSTO DIESEL", ["Data", "Motorista", "Posto", "Litros", "Preço/L", "Custo diesel"]);\n    fuelings.forEach((f: any, index: number) => { const row = sheet.addRow([formatDate(f.date), f.driverName ?? (data?.drivers ?? []).find((d: any) => d.id === f.driverId)?.name ?? "Sem motorista", f.station ?? "—", Number(f.liters ?? 0), Number(f.pricePerLiter ?? 0), Number(f.liters ?? 0) * Number(f.pricePerLiter ?? 0)]); styleRow(row, index); row.getCell(4).numFmt = \'0.00 "L"\'; row.getCell(5).numFmt = row.getCell(6).numFmt = \'R$ #,##0.00\'; });',
    'excel fuelings');
  s = mustReplace(s,
    '    addSection("ADIANTAMENTOS", ["Data", "Motorista", "Descrição", "Valor", "Categoria", "Conjunto", "Observações", "ID"]);\n    periodExpenses.filter((e: any) => e.category === "Adiantamento").forEach((e: any, index: number) => { const driver = (data?.drivers ?? []).find((d: any) => String(d.id) === String(e.driverId ?? "")); const fleet = (data?.fleets ?? []).find((f: any) => String(f.id) === String(e.fleetId ?? "")); const row = sheet.addRow([formatDate(e.date), driver?.name ?? "Motorista removido", e.description ?? "—", Number(e.amount ?? 0), e.category, fleet?.name ?? "—", e.notes ?? "—", e.id]); styleRow(row, index); row.getCell(4).numFmt = \'R$ #,##0.00\'; });',
    '    addSection("ADIANTAMENTOS", ["Data", "Motorista", "Descrição", "Valor"]);\n    periodExpenses.filter((e: any) => e.category === "Adiantamento").forEach((e: any, index: number) => { const driver = (data?.drivers ?? []).find((d: any) => String(d.id) === String(e.driverId ?? "")); const row = sheet.addRow([formatDate(e.date), driver?.name ?? "Motorista removido", e.description ?? "—", Number(e.amount ?? 0)]); styleRow(row, index); row.getCell(4).numFmt = \'R$ #,##0.00\'; });',
    'excel advances clean');
  s = mustReplace(s,
    '    addSection("DESPESAS", ["Data", "Categoria", "Descrição", "Valor", "Motorista", "Conjunto", "Observações", "Ativo"]);\n    periodExpenses.filter((e: any) => e.category !== "Adiantamento").forEach((e: any, index: number) => { const driver = (data?.drivers ?? []).find((d: any) => String(d.id) === String(e.driverId ?? "")); const fleet = (data?.fleets ?? []).find((f: any) => String(f.id) === String(e.fleetId ?? "")); const row = sheet.addRow([formatDate(e.date), e.category, e.description ?? "—", Number(e.amount ?? 0), driver?.name ?? "—", fleet?.name ?? "—", e.notes ?? "—", e.assetType ?? "—"]); styleRow(row, index); row.getCell(4).numFmt = \'R$ #,##0.00\'; });',
    '    addSection("DESPESAS", ["Data", "Categoria", "Descrição", "Valor", "Motorista"]);\n    periodExpenses.filter((e: any) => e.category !== "Adiantamento").forEach((e: any, index: number) => { const driver = (data?.drivers ?? []).find((d: any) => String(d.id) === String(e.driverId ?? "")); const row = sheet.addRow([formatDate(e.date), e.category, e.description ?? "—", Number(e.amount ?? 0), driver?.name ?? "—"]); styleRow(row, index); row.getCell(4).numFmt = \'R$ #,##0.00\'; });',
    'excel expenses clean');
  s = mustReplace(s,
    '[29, 19, 18, 18, 18, 18, 18, 20].forEach((width, i) => { sheet.getColumn(i + 1).width = width; });',
    '[34, 23, 18, 24, 24, 24, 24, 27].forEach((width, i) => { sheet.getColumn(i + 1).width = width; });',
    'excel widths');
  return s;
});

console.log('[daily-report-reform] Diária + driver value + PDF/Excel reform applied');
