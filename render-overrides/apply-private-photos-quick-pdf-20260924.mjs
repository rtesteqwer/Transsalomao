import fs from "node:fs";
import path from "node:path";

const target = process.argv[2];
if (!target || !fs.existsSync(target)) throw new Error("private-photos-quick-pdf: target missing");

function p(rel) { return path.join(target, rel); }
function read(rel) {
  const file = p(rel);
  if (!fs.existsSync(file)) throw new Error("private-photos-quick-pdf: missing " + rel);
  return fs.readFileSync(file, "utf8");
}
function write(rel, value) {
  fs.writeFileSync(p(rel), value);
}

// 1) Relatórios rápidos: tratamento explícito de geração, feedback e datas locais.
{
  const rel = "src/routes/dono/totais.tsx";
  let s = read(rel);

  if (!s.includes('import { toast } from "sonner";')) {
    s = s.replace(
      'import { useMemo, useState } from "react";',
      'import { useMemo, useState } from "react";\nimport { toast } from "sonner";',
    );
  }

  if (!s.includes("quickPdfBusy")) {
    s = s.replace(
      '  const [driverFilter, setDriverFilter] = useState("all");',
      '  const [driverFilter, setDriverFilter] = useState("all");\n  const [quickPdfBusy, setQuickPdfBusy] = useState<"day" | "week" | "month" | "all" | null>(null);',
    );
  }

  const start = s.indexOf('  function quickPdf(kind: "day" | "week" | "month" | "all") {');
  const end = s.indexOf('  async function exportExcelColorido', start);
  if (start < 0 || end < 0) throw new Error("private-photos-quick-pdf: quickPdf block not found");

  const replacement = `  async function quickPdf(kind: "day" | "week" | "month" | "all") {
    if (!data || quickPdfBusy) return;

    setQuickPdfBusy(kind);
    try {
      const today = new Date();
      const isoToday = [today.getFullYear(), String(today.getMonth() + 1).padStart(2, "0"), String(today.getDate()).padStart(2, "0")].join("-");

      const matchesPeriod = (date: string) => {
        if (kind === "day") return String(date).slice(0, 10) === isoToday;
        if (kind === "week") return inPeriod(date, "7d", today);
        if (kind === "month") return inPeriod(date, "month", today);
        return true;
      };

      const rows = data.trips
        .filter((trip) => matchesPeriod(trip.date))
        .map((trip) => enrichTrip(trip, data.drivers, data.fleets));

      const fuelRows = fuelingConsumptionRows(data.fuelings)
        .filter((fueling) => matchesPeriod(fueling.date))
        .map((fueling) => {
          const driver = data.drivers.find((d) => d.id === fueling.driverId);
          const fleet = data.fleets.find((x) => x.id === fueling.fleetId);
          return {
            ...fueling,
            driverName: driver?.name ?? "Sem motorista informado",
            fleetName: fleet?.name ?? "Conjunto removido",
            tractorPlate: fleet?.tractorPlate ?? "—",
            trailerPlate: fleet?.trailerPlate ?? "—",
          };
        });

      const advanceRows = data.expenses
        .filter((expense) => expense.category === "Adiantamento" && !!expense.driverId && matchesPeriod(expense.date))
        .map((expense) => ({
          driverId: expense.driverId!,
          driverName: data.drivers.find((d) => d.id === expense.driverId)?.name ?? "Motorista removido",
          date: expense.date,
          amount: expense.amount,
          description: expense.description,
        }));

      const expenseRows = data.expenses
        .filter((expense) => expense.category !== "Adiantamento" && matchesPeriod(expense.date))
        .map((expense) => ({
          ...expense,
          driverName: data.drivers.find((d) => d.id === expense.driverId)?.name ?? "—",
          fleetName: data.fleets.find((fleet) => fleet.id === expense.fleetId)?.name ?? "—",
        }));

      const label = kind === "day" ? "Diário" : kind === "week" ? "Semanal" : kind === "month" ? "Mensal" : "Completo";

      await downloadDriverReportPdf({
        driverName: "Todos os motoristas",
        trips: rows,
        fuelings: fuelRows,
        advances: advanceRows,
        expenses: expenseRows,
        periodLabel: label,
        sourceLabel: "Relatórios rápidos",
        reportTitle: "Relatório " + label + " da Gerência",
      });

      toast.success("PDF " + label + " gerado com sucesso.");
    } catch (error) {
      console.error("[quick-pdf] generation failed", error);
      toast.error(error instanceof Error ? error.message : "Não foi possível gerar o PDF.");
    } finally {
      setQuickPdfBusy(null);
    }
  }

`;

  s = s.slice(0, start) + replacement + s.slice(end);

  s = s.replace(
    'onClick={() => quickPdf(item.key as "day" | "week" | "month" | "all")}',
    'onClick={() => void quickPdf(item.key as "day" | "week" | "month" | "all")}\n              disabled={quickPdfBusy !== null}',
  );

  s = s.replace(
    '<strong className="block font-display text-xl font-semibold">PDF {item.label}</strong>',
    '<strong className="block font-display text-xl font-semibold">{quickPdfBusy === item.key ? "Gerando…" : "PDF " + item.label}</strong>',
  );

  write(rel, s);
}

// 2) Evita revogar o Blob antes de Android/WebView assumir o download.
{
  const rel = "src/lib/pdf.ts";
  let s = read(rel);
  const old = '  URL.revokeObjectURL(url);';
  const replacement = '  window.setTimeout(() => URL.revokeObjectURL(url), 30_000);';
  if (s.includes(old)) s = s.replace(old, replacement);
  else if (!s.includes("30_000")) throw new Error("private-photos-quick-pdf: PDF revoke block not found");
  write(rel, s);
}

console.log("[private-photos-quick-pdf] quick PDFs repaired; private photo templates are active");
