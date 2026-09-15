import fs from 'node:fs';
import path from 'node:path';

const target = process.argv[2];
if (!target) throw new Error('request-20260915: target missing');
const repo = process.cwd();

function file(rel) { return path.join(target, rel); }
function replaceRequired(text, needle, replacement, label) {
  if (text.includes(replacement)) return text;
  if (!text.includes(needle)) throw new Error(`request-20260915: pattern not found (${label})`);
  return text.replace(needle, replacement);
}

// Inclui também o modo Por viagem nos grupos visuais e na seleção em lote.
{
  const p = file('src/routes/dono/viagens.tsx');
  let s = fs.readFileSync(p, 'utf8');
  s = s.replaceAll(
    't.freightMode !== "caixinha" && t.freightMode !== "cegonha"',
    't.freightMode !== "caixinha" && t.freightMode !== "cegonha" && t.freightMode !== "trip"',
  );
  if (!s.includes('import { REPORT_LOGO_JPEG } from "@/lib/report-logo";')) {
    s = `import { REPORT_LOGO_JPEG } from "@/lib/report-logo";\n${s}`;
  }
  if (!s.includes('async function exportTripsExcel()')) {
    const exportStart = s.indexOf('  function exportCsv() {');
    const nextFunction = exportStart >= 0 ? s.indexOf('\n\n  async function handleBulkDelete', exportStart) : -1;
    if (exportStart < 0 || nextFunction < 0) throw new Error('request-20260915: trips CSV export block missing');
    const excel = fs.readFileSync(path.join(repo, 'render-overrides/viagens-excel.snippet.ts'), 'utf8').trimEnd();
    s = s.slice(0, exportStart) + '  ' + excel.replace(/\n/g, '\n  ') + s.slice(nextFunction);
  }
  s = s.replaceAll('onClick={exportCsv}', 'onClick={exportTripsExcel}');
  s = s.replaceAll('Exportar CSV', 'Excel colorido');
  const bulkMarker = '<p className="text-[11px] uppercase tracking-[0.16em] text-muted">Seleção em lote</p>';
  const bulkAt = s.indexOf(bulkMarker);
  if (bulkAt >= 0) {
    const sectionStart = s.lastIndexOf('      <section', bulkAt);
    const sectionEnd = s.indexOf('\n      </section>', bulkAt);
    const dialogsAt = s.indexOf('      <Dialog open={bulkEditing}', sectionEnd);
    if (sectionStart >= 0 && sectionEnd >= 0 && dialogsAt >= 0) {
      const bulkSection = s.slice(sectionStart, sectionEnd + '\n      </section>'.length);
      s = s.slice(0, sectionStart) + s.slice(sectionEnd + '\n      </section>'.length);
      const nextDialogsAt = s.indexOf('      <Dialog open={bulkEditing}');
      s = s.slice(0, nextDialogsAt) + bulkSection + '\n\n' + s.slice(nextDialogsAt);
    }
  }
  fs.writeFileSync(p, s);
}

// Painel: Faturamento, comissão, diesel, após comissões e Total líquido.
{
  const p = file('src/routes/dono/index.tsx');
  let s = fs.readFileSync(p, 'utf8');
  if (!s.includes('FileText } from "lucide-react"')) {
    s = `import { FileText } from "lucide-react";\n${s}`;
  }
  if (!s.includes('import { Button } from "@/components/ui/button";')) {
    s = s.replace('import { Badge } from "@/components/ui/badge";', 'import { Badge } from "@/components/ui/badge";\nimport { Button } from "@/components/ui/button";');
  }
  if (!s.includes('import { downloadDriverReportPdf } from "@/lib/pdf";')) {
    s = s.replace('import type { DashboardKpis, PeriodKey } from "@/lib/types";', 'import { downloadDriverReportPdf } from "@/lib/pdf";\nimport type { DashboardKpis, PeriodKey } from "@/lib/types";');
  }
  const dashboardReturn = '  return (\n    <div>';
  if (!s.includes('function exportBillingPdf()')) {
    s = replaceRequired(s, dashboardReturn, `  function exportBillingPdf() {
    const advances = (data?.expenses ?? [])
      .filter((expense) => expense.category === "Adiantamento" && !!expense.driverId)
      .map((expense) => ({
        driverId: expense.driverId,
        driverName: data?.drivers.find((driver) => driver.id === expense.driverId)?.name ?? "Motorista",
        date: expense.date,
        amount: expense.amount,
        description: expense.description,
      }));
    void downloadDriverReportPdf({
      driverName: driverFilter === "all" ? "Todos os motoristas" : data?.drivers.find((driver) => driver.id === driverFilter)?.name ?? "Motorista",
      trips: computed,
      fuelings,
      advances,
      periodLabel: PERIODS.find((item) => item.key === period)?.label ?? "Período selecionado",
      sourceLabel: "Painel",
      reportTitle: "FATURAMENTO",
      operatorName: "admin",
    });
  }

${dashboardReturn}`, 'billing PDF function');
  }
  const periodControls = '        <div className="flex flex-wrap gap-1 rounded-lg border border-border bg-surface p-1">';
  if (!s.includes('> FATURAMENTO\n')) {
    s = replaceRequired(s, periodControls, `        <div className="flex flex-wrap items-center gap-2">
          <Button onClick={exportBillingPdf} disabled={computed.length === 0} title="Gerar PDF de faturamento">
            <FileText className="size-4" /> FATURAMENTO
          </Button>
          <div className="flex flex-wrap gap-1 rounded-lg border border-border bg-surface p-1">`, 'billing PDF button');
    const periodClose = `          ))}
        </div>
      </div>

      <div className="mt-5 max-w-sm">`;
    s = replaceRequired(s, periodClose, `          ))}
          </div>
        </div>
      </div>

      <div className="mt-5 max-w-sm">`, 'billing PDF controls close');
  }
  const start = s.indexOf('      <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">');
  const end = start < 0 ? -1 : s.indexOf('\n      </div>', start);
  if (start < 0 || end < 0) throw new Error('request-20260915: dashboard KPI block missing');
  const block = `      <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <Kpi label="Faturamento" value={brl(effectiveKpis.revenue)} delta={deltaOf(effectiveKpis, prevEffectiveKpis, "revenue")} large />
        <Kpi label="Valor da comissão" value={brl(kpis.commissions)} large />
        <Kpi label="Custo diesel" value={brl(effectiveKpis.dieselCost)} delta={deltaOf(effectiveKpis, prevEffectiveKpis, "dieselCost")} large />
        <Kpi label="Após comissões" value={brl(effectiveKpis.revenue - kpis.commissions)} large />
        <Kpi label="Total líquido" value={brl(effectiveKpis.afterCommission)} delta={deltaOf(effectiveKpis, prevEffectiveKpis, "afterCommission")} large />
      </div>`;
  s = s.slice(0, start) + block + s.slice(end + '\n      </div>'.length);
  s = s.replace(/^\s*<Kpi label="KM total"[^\n]*\n/m, '');
  s = s.replace(/^\s*<Kpi label="Peso bruto"[^\n]*\n/m, '');
  s = s.replace(/^\s*<Kpi label="Média KM\/L \(abastecimentos\)"[^\n]*\n/m, '');
  s = s.replaceAll('Após comissões', 'Total líquido').replaceAll('Após comissão', 'Total líquido');
  fs.writeFileSync(p, s);
}

// Caixa: mantém os lançamentos contíguos por motorista e modalidade.
{
  const p = file('src/routes/dono/lancamentos.tsx');
  let s = fs.readFileSync(p, 'utf8');
  s = replaceRequired(s,
    '  const pending = data?.reports.filter((r) => r.status === "pendente") ?? [];\n  const done = data?.reports.filter((r) => r.status !== "pendente") ?? [];',
    `  const modeOrder: Record<string, number> = { caixinha: 0, cegonha: 1, trip: 2, ton: 3 };
  const driverName = (report: DriverReport) => data?.drivers.find((driver) => driver.id === report.driverId)?.name ?? "Sem motorista";
  const byFreightMode = (a: DriverReport, b: DriverReport) =>
    driverName(a).localeCompare(driverName(b), "pt-BR") ||
    (modeOrder[String(a.freightMode)] ?? 9) - (modeOrder[String(b.freightMode)] ?? 9);
  const pending = [...(data?.reports.filter((r) => r.status === "pendente") ?? [])].sort(byFreightMode);
  const done = [...(data?.reports.filter((r) => r.status !== "pendente") ?? [])].sort(byFreightMode);`,
    'cash grouping');
  fs.writeFileSync(p, s);
}

// Despesas: abas internas independentes, mantendo todos os adiantamentos do banco.
{
  const p = file('src/routes/dono/despesas.tsx');
  let s = fs.readFileSync(p, 'utf8');
  s = replaceRequired(s,
    '  const [assetFilter, setAssetFilter] = useState<AssetFilter>("all");',
    '  const [assetFilter, setAssetFilter] = useState<AssetFilter>("all");\n  const [section, setSection] = useState<"despesas" | "adiantamentos">("despesas");',
    'expense tab state');
  s = replaceRequired(s,
    '    let all = data?.expenses ?? [];',
    '    let all = (data?.expenses ?? []).filter((e) => section === "adiantamentos" ? e.category === "Adiantamento" : e.category !== "Adiantamento");',
    'expense tab rows');
  s = s.replace('  }, [data, fleetFilter, assetFilter]);', '  }, [data, fleetFilter, assetFilter, section]);');
  const metrics = '      <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">';
  const tabs = `      <div className="mt-6 flex gap-1 rounded-lg border border-border bg-surface p-1 sm:w-fit">
        <button type="button" onClick={() => setSection("despesas")} className={\`h-10 rounded-md px-4 text-sm font-semibold ${'${section === "despesas" ? "bg-accent text-accent-fg" : "text-muted"}'}\`}>Despesas</button>
        <button type="button" onClick={() => setSection("adiantamentos")} className={\`h-10 rounded-md px-4 text-sm font-semibold ${'${section === "adiantamentos" ? "bg-accent text-accent-fg" : "text-muted"}'}\`}>Adiantamentos ({allExpenses.filter((e) => e.category === "Adiantamento").length})</button>
      </div>

${metrics}`;
  s = replaceRequired(s, metrics, tabs, 'expense tabs UI');
  s = s.replace('<Button onClick={() => setEditing({ date: new Date().toISOString().slice(0, 10), fleetId: data?.fleets[0]?.id ?? null, assetType: "tractor", driverId: null, category: "Manutenção", description: "", amount: 0, notes: "" })}>', '<Button onClick={() => setEditing({ date: new Date().toISOString().slice(0, 10), fleetId: section === "adiantamentos" ? null : data?.fleets[0]?.id ?? null, assetType: section === "adiantamentos" ? null : "tractor", driverId: null, category: section === "adiantamentos" ? "Adiantamento" : "Manutenção", description: "", amount: 0, notes: "" })}>');
  s = s.replace('<Plus className="size-4" /> Nova despesa', '<Plus className="size-4" /> {section === "adiantamentos" ? "Novo adiantamento" : "Nova despesa"}');
  s = s.replace('      <div className="mt-6 grid gap-3 sm:grid-cols-2">\n        <Field label="Filtrar por conjunto">', '      {section === "despesas" ? <div className="mt-6 grid gap-3 sm:grid-cols-2">\n        <Field label="Filtrar por conjunto">');
  s = s.replace('        </Field>\n      </div>\n\n      {rows.length === 0 ?', '        </Field>\n      </div> : null}\n\n      {rows.length === 0 ?');
  fs.writeFileSync(p, s);
}

// Relatórios: Excel verdadeiro/colorido e PDF geral com logo e linhas compactas.
{
  const pkgPath = file('package.json');
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
  pkg.dependencies = { ...pkg.dependencies, exceljs: '4.4.0', jspdf: '3.0.1', 'jspdf-autotable': '5.0.2' };
  fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');
  fs.copyFileSync(path.join(repo, 'render-overrides/report-logo.ts'), file('src/lib/report-logo.ts'));

  const totalsPath = file('src/routes/dono/totais.tsx');
  let totals = fs.readFileSync(totalsPath, 'utf8');
  if (!totals.includes('REPORT_LOGO_JPEG')) totals = `import { REPORT_LOGO_JPEG } from "@/lib/report-logo";\n${totals}`;
  if (!totals.includes('function exportExcelColorido')) {
    const exportStart = totals.indexOf('  function exportCurrent() {');
    const returnStart = exportStart >= 0 ? totals.indexOf('\n\n  return (', exportStart) : -1;
    if (exportStart < 0 || returnStart < 0) throw new Error('request-20260915: report export block missing');
    const excel = fs.readFileSync(path.join(repo, 'render-overrides/admin-excel-one-page.snippet.ts'), 'utf8').trimEnd();
    totals = totals.slice(0, exportStart) + '  ' + excel.replace(/\n/g, '\n  ') + totals.slice(returnStart);
  }
  if (!totals.includes('const periodExpenses = useMemo')) {
    totals = totals.replace('  const advancesForDriver = (driverId: string) => periodAdvances.filter((e) => e.driverId === driverId);', `  const periodExpenses = useMemo(() => {
    if (!data) return [];
    return data.expenses.filter((e) => e.category !== "Adiantamento" && inPeriod(e.date, period)).map((e) => ({
      ...e,
      driverName: data.drivers.find((d) => d.id === e.driverId)?.name ?? "—",
      fleetName: data.fleets.find((f) => f.id === e.fleetId)?.name ?? "—",
    }));
  }, [data, period]);
  const advancesForDriver = (driverId: string) => periodAdvances.filter((e) => e.driverId === driverId);`);
  }
  totals = totals.replaceAll('advances: advancesForDriver(selectedDriver.id),\n      periodLabel', 'advances: advancesForDriver(selectedDriver.id),\n      expenses: periodExpenses.filter((e) => e.driverId === selectedDriver.id),\n      periodLabel');
  totals = totals.replace('      advances: advanceRows,\n      periodLabel: label,', `      advances: advanceRows,
      expenses: data.expenses.filter((e) => e.category !== "Adiantamento" && (kind === "all" || kind === "day" && e.date === isoToday || kind === "week" && inPeriod(e.date, "7d", today) || kind === "month" && inPeriod(e.date, "month", today))).map((e) => ({ ...e, driverName: data.drivers.find((d) => d.id === e.driverId)?.name ?? "—", fleetName: data.fleets.find((f) => f.id === e.fleetId)?.name ?? "—" })),
      periodLabel: label,`);
  totals = totals.replace('              fuelings,\n              periodLabel,', '              fuelings,\n              advances: periodAdvances,\n              expenses: periodExpenses,\n              periodLabel,');
  totals = totals.replaceAll('fuelings: fuelForDriver(d.driverId),\n                    periodLabel', 'fuelings: fuelForDriver(d.driverId),\n                    advances: advancesForDriver(d.driverId),\n                    expenses: periodExpenses.filter((e) => e.driverId === d.driverId),\n                    periodLabel');
  totals = totals.replace(/<button type="button" onClick=\{(?:exportCurrent|exportExcelColorido)\}[\s\S]*?<\/button>/m,
    '<button type="button" onClick={exportExcelColorido} className="h-11 rounded-md border border-accent bg-bg px-4 text-sm font-semibold text-fg hover:bg-surface-2" title="Baixar Excel colorido">Planilha Geral</button>');
  fs.writeFileSync(totalsPath, totals);

  const pdfPath = file('src/lib/pdf.ts');
  let pdf = fs.readFileSync(pdfPath, 'utf8');
  if (!pdf.includes('REPORT_LOGO_JPEG')) pdf = `import { REPORT_LOGO_JPEG } from "@/lib/report-logo";\n${pdf}`;
  const pdfStart = pdf.indexOf('export function downloadDriverReportPdf({');
  if (pdfStart < 0) throw new Error('request-20260915: PDF function missing');
  const compactPdf = fs.readFileSync(path.join(repo, 'render-overrides/pdf-export-complete.snippet.ts'), 'utf8')
    .replace('new Set(["trip", "cegonha", "caixinha"])', 'new Set(["ton", "trip", "cegonha", "caixinha"])')
    .trimEnd();
  pdf = pdf.slice(0, pdfStart) + compactPdf + '\n';
  fs.writeFileSync(pdfPath, pdf);
}

// Acesso de motorista: login solicitado aponta exclusivamente para Klebersom Dutra Da Silva.
{
  for (const [source, destination] of [
    ['management-auth.ts', 'src/lib/management-auth.ts'],
    ['management-auth.server.ts', 'src/lib/management-auth.server.ts'],
    ['klebersom-access.ts', 'src/lib/klebersom-access.ts'],
    ['klebersom-access.server.ts', 'src/lib/klebersom-access.server.ts'],
    ['klebersom.tsx', 'src/routes/klebersom.tsx'],
  ]) {
    const destinationPath = file(destination);
    fs.mkdirSync(path.dirname(destinationPath), { recursive: true });
    fs.copyFileSync(path.join(repo, 'render-overrides', source), destinationPath);
  }
  const p = file('src/lib/klebersom-access.server.ts');
  let s = fs.readFileSync(p, 'utf8');
  if (!s.includes('BUILTIN_KLEBERSOM_REQUESTED_USERNAME')) {
    s = s.replace('const BUILTIN_KLEBERSOM_USERNAME = "KlebersomDutra";', 'const BUILTIN_KLEBERSOM_USERNAME = "KlebersomDutra";\nconst BUILTIN_KLEBERSOM_REQUESTED_USERNAME = "KlebersomDruta";');
    const marker = '  return accounts;';
    s = s.replace(marker, `  if (!accounts.some((account) => account.username.toLowerCase() === BUILTIN_KLEBERSOM_REQUESTED_USERNAME.toLowerCase())) {
    accounts.push({ username: BUILTIN_KLEBERSOM_REQUESTED_USERNAME, passwordSha256: BUILTIN_KLEBERSOM_PASSWORD_SHA256, driverId: BUILTIN_KLEBERSOM_DRIVER_ID });
  }

${marker}`);
  }
  fs.writeFileSync(p, s);

  const routePath = file('src/routes/dono/route.tsx');
  let route = fs.readFileSync(routePath, 'utf8');
  if (!route.includes('result.role === "driver"')) {
    route = route.replace('                  await qc.invalidateQueries({ queryKey: sessionKey });', `                  if (result.role === "driver") {
                    window.location.assign("/klebersom");
                    return;
                  }
                  await qc.invalidateQueries({ queryKey: sessionKey });`);
    route = route.replace('Entre com o login administrativo para acessar cadastros, viagens,', 'Entre com seu login. Administradores acessam toda a Gerência; motoristas visualizam somente os próprios dados.');
  }
  fs.writeFileSync(routePath, route);
}

// Azul claro e radiante; qualquer texto preto fica sobre branco.
{
  const p = file('src/styles.css');
  let s = fs.readFileSync(p, 'utf8');
  s += `\n\n/* Trans Salomão — azul radiante 2026-09-15 */
:root { --color-bg:#eef8ff; --color-surface:#ffffff; --color-surface-2:#dff2ff; --color-fg:#071b2e; --color-muted:#42627d; --color-subtle:#58758d; --color-accent:#19a8ff; --color-accent-fg:#ffffff; --color-border:#79cfff; --color-ring:#19a8ff; }
html,body{background:#eef8ff!important;color:#071b2e!important} .bg-bg{background-color:#eef8ff!important}.bg-surface{background-color:#fff!important}.bg-surface-2{background-color:#dff2ff!important}.text-black,[class*="text-black"]{background-color:#fff!important}.bg-accent{background:linear-gradient(135deg,#19a8ff,#0877ff)!important;color:#fff!important}.border-border{border-color:#79cfff!important}
html,body,#root{min-height:100%;height:auto!important;overflow-x:hidden!important;overflow-y:auto!important;overscroll-behavior-y:auto;touch-action:pan-y pinch-zoom}body[data-scroll-locked]{overflow-y:auto!important;padding-right:0!important}
`;
  fs.writeFileSync(p, s);
}

console.log('[request-20260915] dashboard, expenses tabs, reports and radiant theme applied');
