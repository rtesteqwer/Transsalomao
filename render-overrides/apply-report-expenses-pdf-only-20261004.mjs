import fs from "node:fs";
import path from "node:path";
const target = path.resolve(process.argv[2] || "");
if (!process.argv[2] || !fs.existsSync(path.join(target, "src"))) throw new Error("report-expenses-pdf-only: target missing");
const p = (rel) => path.join(target, rel);
const read = (rel) => fs.readFileSync(p(rel), "utf8");
const write = (rel, s) => fs.writeFileSync(p(rel), s);
const must = (s, a, b, label) => { if (s.includes(a)) return s.replace(a, b); if (s.includes(b)) return s; throw new Error("report-expenses-pdf-only: " + label); };

{
  const rel = "src/routes/dono/totais.tsx";
  let s = read(rel);
  const start = s.indexOf("  const periodExpenses = useMemo(() => {");
  const end = s.indexOf("\n  const advancesForDriver =", start);
  if (start < 0 || end < 0) throw new Error("report-expenses-pdf-only: periodExpenses block");
  const block = [
    '  const periodExpenses = useMemo(() => {',
    '    if (!data) return [];',
    '    return data.expenses.filter((e) => e.category !== "Adiantamento" && inPeriod(e.date, period)).map((e) => {',
    '      const fleet = data.fleets.find((f) => String(f.id) === String(e.fleetId ?? ""));',
    '      let resolvedDriverId = String(e.driverId ?? "").trim();',
    '      if (!resolvedDriverId && e.fleetId) {',
    '        const fleetId = String(e.fleetId);',
    '        const expenseDate = String(e.date ?? "").slice(0, 10);',
    '        const sameDay = [...new Set(computed.filter((t: any) => String(t.fleetId ?? "") === fleetId && String(t.date ?? "").slice(0, 10) === expenseDate).map((t: any) => String(t.driverId ?? "")).filter(Boolean))];',
    '        if (sameDay.length === 1) resolvedDriverId = sameDay[0];',
    '        else {',
    '          const inPeriodDrivers = [...new Set(computed.filter((t: any) => String(t.fleetId ?? "") === fleetId).map((t: any) => String(t.driverId ?? "")).filter(Boolean))];',
    '          if (inPeriodDrivers.length === 1) resolvedDriverId = inPeriodDrivers[0];',
    '        }',
    '      }',
    '      const driver = data.drivers.find((d) => String(d.id) === resolvedDriverId);',
    '      const fleetName = fleet?.name ?? "—";',
    '      const vehicleLabel = e.assetType === "tractor" ? "Cavalo" + (fleet?.tractorPlate ? " · " + fleet.tractorPlate : fleetName !== "—" ? " · " + fleetName : "") : e.assetType === "trailer" ? "Carreta" + (fleet?.trailerPlate ? " · " + fleet.trailerPlate : fleetName !== "—" ? " · " + fleetName : "") : fleetName;',
    '      return { ...e, driverId: resolvedDriverId || e.driverId, driverName: driver?.name ?? "—", fleetName, vehicleLabel };',
    '    });',
    '  }, [data, period, computed]);',
  ].join("\n");
  s = s.slice(0, start) + block + s.slice(end);
  s = must(s,
    '  const advanceTotalForDriver = (driverId: string) => advancesForDriver(driverId).reduce((sum, e) => sum + e.amount, 0);',
    '  const advanceTotalForDriver = (driverId: string) => advancesForDriver(driverId).reduce((sum, e) => sum + e.amount, 0);\n  const expensesForDriver = (driverId: string) => periodExpenses.filter((e) => String(e.driverId ?? "") === String(driverId));',
    "expensesForDriver"
  );
  s = s.replaceAll('expenses: periodExpenses.filter((e) => e.driverId === selectedDriver.id),', 'expenses: expensesForDriver(selectedDriver.id),');
  s = s.replaceAll('expenses: periodExpenses.filter((e) => e.driverId === d.driverId),', 'expenses: expensesForDriver(d.driverId),');
  write(rel, s);
}

{
  const rel = "src/lib/pdf.ts";
  let s = read(rel);
  s = must(s,
    '  expenses?: Array<{ driverId?: string | null; driverName?: string; date: string; amount: number; category?: string; description?: string; fleetName?: string; notes?: string }>;',
    '  expenses?: Array<{ driverId?: string | null; driverName?: string; date: string; amount: number; category?: string; description?: string; fleetName?: string; assetType?: string | null; vehicleLabel?: string; notes?: string }>;',
    "pdf expense type"
  );
  s = must(s,
    '  const totalAdvances = advances.reduce((sum, item) => sum + Number(item.amount ?? 0), 0);',
    '  const totalAdvances = advances.reduce((sum, item) => sum + Number(item.amount ?? 0), 0);\n  const totalExpenses = expenses.reduce((sum, item) => sum + Number(item.amount ?? 0), 0);',
    "pdf expense total"
  );
  s = must(s,
    '    head: [["Faturamento total", "Custo diesel", "Comissão total", "Faturamento líquido", "Fretes"]],\n    body: [[brl(totalFreight), brl(totalDiesel), brl(totalCommission), brl(totalNetRevenue), String(trips.length)]],',
    '    head: [["Faturamento total", "Custo diesel", "Comissão total", "Despesas", "Faturamento líquido", "Fretes"]],\n    body: [[brl(totalFreight), brl(totalDiesel), brl(totalCommission), brl(totalExpenses), brl(totalNetRevenue), String(trips.length)]],',
    "pdf summary"
  );
  s = must(s,
    '    columnStyles: { 0: { cellWidth: 80 }, 1: { cellWidth: 80 }, 2: { cellWidth: 80 }, 3: { cellWidth: 80 }, 4: { cellWidth: 80 } },',
    '    columnStyles: { 0: { cellWidth: 65 }, 1: { cellWidth: 65 }, 2: { cellWidth: 65 }, 3: { cellWidth: 65 }, 4: { cellWidth: 65 }, 5: { cellWidth: 65 } },',
    "pdf widths"
  );
  s = must(s,
    '  addDetailTable("DESPESAS", ["Data", "Categoria", "Descrição", "Motorista", "Valor"], expenses.map((e: any) => [formatDate(e.date), e.category ?? "Despesa", e.description ?? "—", e.driverName ?? "—", brl(Number(e.amount ?? 0))]));',
    '  addDetailTable("DESPESAS", ["Data", "Categoria", "Descrição", "Motorista", "Cavalo / referência", "Valor"], expenses.map((e: any) => { const ref = String(e.vehicleLabel ?? "").trim() || (e.assetType === "tractor" ? "Cavalo · " + String(e.fleetName ?? "—") : e.assetType === "trailer" ? "Carreta · " + String(e.fleetName ?? "—") : String(e.fleetName ?? "Motorista")); return [formatDate(e.date), e.category ?? "Despesa", e.description ?? "—", e.driverName ?? "—", ref, brl(Number(e.amount ?? 0))]; }));',
    "pdf expense table"
  );
  s = must(s,
    '    doc.text(`Faturamento: ${brl(totalFreight)}  •  Comissão: ${brl(totalCommission)}  •  Diesel: ${brl(totalDiesel)}  •  Líquido: ${brl(totalNetRevenue)}`, reportMargin, pageHeight - 7);',
    '    doc.text(`Faturamento: ${brl(totalFreight)}  •  Comissão: ${brl(totalCommission)}  •  Diesel: ${brl(totalDiesel)}  •  Despesas: ${brl(totalExpenses)}  •  Líquido: ${brl(totalNetRevenue)}`, reportMargin, pageHeight - 7);',
    "pdf footer"
  );
  write(rel, s);
}

{
  const rel = "src/lib/excel-report.ts";
  let s = read(rel);
  s = must(s,
    '    const excelExpensesSource = (data?.expenses ?? []).filter((e: any) => inPeriod(e.date, period) && (!driverScope || String(e.driverId ?? "") === String(driverScope.id)));',
    '    const excelExpensesSource = (data?.expenses ?? []).filter((e: any) => String(e.category ?? "") === "Adiantamento" && inPeriod(e.date, period) && (!driverScope || String(e.driverId ?? "") === String(driverScope.id)));',
    "Excel advances only"
  );
  s = s.replace('      if (String(expense.category ?? "") === "Adiantamento") row.advances += Number(expense.amount ?? 0);\n      else row.expenses += Number(expense.amount ?? 0);', '      row.advances += Number(expense.amount ?? 0);');
  s = s.replace(' || item.expenses !== 0)', ')');
  s = s.replace(/^\s*const totalOtherExpenses = .*\n/m, '');
  s = s.replace('      "Adiantamentos", totalAdvances,\n      "Despesas", totalOtherExpenses,', '      "Adiantamentos", totalAdvances,');
  s = s.replace('    tripHeader.values = ["Motorista", "Viagens", "Faturamento bruto", "Comissão", "Total líquido", "Adiantamentos", "Abastecimentos", "Despesas", "Saldo após custos"];', '    tripHeader.values = ["Motorista", "Viagens", "Faturamento bruto", "Comissão", "Total líquido", "Adiantamentos", "Abastecimentos", "Saldo após custos"];');
  s = s.replace('      const operationalBalance = item.afterCommission - item.fuelings - item.advances - item.expenses;', '      const operationalBalance = item.afterCommission - item.fuelings - item.advances;');
  s = s.replace('        item.fuelings,\n        item.expenses,\n        operationalBalance,', '        item.fuelings,\n        operationalBalance,');
  s = s.replace('      for (let c = 3; c <= 9; c += 1) {', '      for (let c = 3; c <= 8; c += 1) {');
  s = s.replace('    sheet.autoFilter = { from: "A6", to: "I" + Math.max(6, driverSummaryEndRow) };', '    sheet.autoFilter = { from: "A6", to: "H" + Math.max(6, driverSummaryEndRow) };');
  const g0 = s.indexOf('    addSection("DESPESAS",');
  const g1 = g0 >= 0 ? s.indexOf('    addSection("CADASTROS - MOTORISTAS E CONJUNTOS",', g0) : -1;
  if (g0 >= 0 && g1 > g0) s = s.slice(0, g0) + s.slice(g1);
  s = s.replace(/^\s*const totalExpensesDriver = .*\n/m, '');
  s = s.replace('        const totalOperationalDriver = totalAfterCommissionDriver - totalDieselDriver - totalAdvancesDriver - totalExpensesDriver;', '        const totalOperationalDriver = totalAfterCommissionDriver - totalDieselDriver - totalAdvancesDriver;');
  s = s.replace('          "  •  Adiantamentos: " + brl(totalAdvancesDriver) +\n          "  •  Despesas: " + brl(totalExpensesDriver) +\n          "  •  Saldo após custos: " + brl(totalOperationalDriver);', '          "  •  Adiantamentos: " + brl(totalAdvancesDriver) +\n          "  •  Saldo após custos: " + brl(totalOperationalDriver);');
  const d0 = s.indexOf('        addDriverSection("DESPESAS",');
  const d1 = d0 >= 0 ? s.indexOf('        [17, 18, 24, 22, 22, 18, 18, 18, 20, 18, 15, 18, 18, 20]', d0) : -1;
  if (d0 >= 0 && d1 > d0) s = s.slice(0, d0) + s.slice(d1);
  if (s.includes('"Despesas", totalOtherExpenses') || s.includes('totalExpensesDriver') || s.includes('addSection("DESPESAS"') || s.includes('addDriverSection("DESPESAS"')) throw new Error("report-expenses-pdf-only: Excel expense output remains");
  write(rel, s);
}
console.log("[report-expenses-pdf-only] despesas do motorista/cavalo no PDF; despesas removidas dos Excels");
