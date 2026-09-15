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
  fs.writeFileSync(p, s);
}

// Painel: Faturamento, comissão, diesel, após comissões e Total líquido.
{
  const p = file('src/routes/dono/index.tsx');
  let s = fs.readFileSync(p, 'utf8');
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
  fs.writeFileSync(p, s);
}

// Caixa: mantém os lançamentos contíguos por modalidade (Caixinha, Cegonha e Por viagem).
{
  const p = file('src/routes/dono/lancamentos.tsx');
  let s = fs.readFileSync(p, 'utf8');
  s = replaceRequired(s,
    '  const pending = data?.reports.filter((r) => r.status === "pendente") ?? [];\n  const done = data?.reports.filter((r) => r.status !== "pendente") ?? [];',
    `  const modeOrder: Record<string, number> = { caixinha: 0, cegonha: 1, trip: 2, ton: 3 };
  const byFreightMode = (a: DriverReport, b: DriverReport) =>
    (modeOrder[String(a.freightMode)] ?? 9) - (modeOrder[String(b.freightMode)] ?? 9) ||
    String(a.driverId).localeCompare(String(b.driverId));
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
    const excel = fs.readFileSync(path.join(repo, 'render-overrides/admin-excel.snippet.ts'), 'utf8').trimEnd();
    totals = totals.slice(0, exportStart) + '  ' + excel.replace(/\n/g, '\n  ') + totals.slice(returnStart);
  }
  totals = totals.replace(/<button type="button" onClick=\{(?:exportCurrent|exportExcelColorido)\}[\s\S]*?<\/button>/m,
    '<button type="button" onClick={exportExcelColorido} className="h-11 rounded-md border border-accent bg-bg px-4 text-sm font-semibold text-fg hover:bg-surface-2" title="Baixar Excel colorido">Planilha Geral</button>');
  fs.writeFileSync(totalsPath, totals);

  const pdfPath = file('src/lib/pdf.ts');
  let pdf = fs.readFileSync(pdfPath, 'utf8');
  if (!pdf.includes('REPORT_LOGO_JPEG')) pdf = `import { REPORT_LOGO_JPEG } from "@/lib/report-logo";\n${pdf}`;
  const pdfStart = pdf.indexOf('export function downloadDriverReportPdf({');
  if (pdfStart < 0) throw new Error('request-20260915: PDF function missing');
  pdf = pdf.slice(0, pdfStart) + fs.readFileSync(path.join(repo, 'render-overrides/pdf-export.snippet.ts'), 'utf8').trimEnd() + '\n';
  fs.writeFileSync(pdfPath, pdf);
}

// Azul claro e radiante; qualquer texto preto fica sobre branco.
{
  const p = file('src/styles.css');
  let s = fs.readFileSync(p, 'utf8');
  s += `\n\n/* Trans Salomão — azul radiante 2026-09-15 */
:root { --color-bg:#eef8ff; --color-surface:#ffffff; --color-surface-2:#dff2ff; --color-fg:#071b2e; --color-muted:#42627d; --color-subtle:#58758d; --color-accent:#19a8ff; --color-accent-fg:#ffffff; --color-border:#79cfff; --color-ring:#19a8ff; }
html,body{background:#eef8ff!important;color:#071b2e!important} .bg-bg{background-color:#eef8ff!important}.bg-surface{background-color:#fff!important}.bg-surface-2{background-color:#dff2ff!important}.text-black,[class*="text-black"]{background-color:#fff!important}.bg-accent{background:linear-gradient(135deg,#19a8ff,#0877ff)!important;color:#fff!important}.border-border{border-color:#79cfff!important}
`;
  fs.writeFileSync(p, s);
}

console.log('[request-20260915] dashboard, expenses tabs, reports and radiant theme applied');
