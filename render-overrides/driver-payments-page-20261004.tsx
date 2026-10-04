import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { FileSignature, Plus, Trash2, WalletCards } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { enrichTrip } from "@/lib/calc";
import { brl, formatDateShort } from "@/lib/format";
import {
  createDriverPayment,
  deleteDriverPayment,
  listDriverPayments,
  type DriverPaymentRecord,
} from "@/lib/driver-payments";
import { useFleet } from "@/lib/use-fleet";

export const Route = createFileRoute("/dono/pagamentos")({ component: DriverPaymentsPage });

function isoToday() {
  const now = new Date();
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 10);
}

function firstDayOfMonth() {
  const today = isoToday();
  return today.slice(0, 8) + "01";
}

function currentMonthKey() {
  return isoToday().slice(0, 7);
}

function monthBounds(month: string) {
  const [year, monthNumber] = month.split("-").map(Number);
  if (!year || !monthNumber) return { start: firstDayOfMonth(), end: isoToday() };
  const lastDay = new Date(year, monthNumber, 0).getDate();
  return {
    start: `${year}-${String(monthNumber).padStart(2, "0")}-01`,
    end: `${year}-${String(monthNumber).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`,
  };
}

function monthLabel(month: string) {
  const [year, monthNumber] = month.split("-").map(Number);
  if (!year || !monthNumber) return month;
  return new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric", timeZone: "UTC" })
    .format(new Date(Date.UTC(year, monthNumber - 1, 1)));
}

function periodReferenceLabel(start: string, end: string) {
  const startMonth = start.slice(0, 7);
  const endMonth = end.slice(0, 7);
  if (startMonth === endMonth) return monthLabel(startMonth);
  return `${monthLabel(startMonth)} a ${monthLabel(endMonth)}`;
}

function monthsBetween(start: string, end: string) {
  const result: string[] = [];
  const startMonth = start.slice(0, 7);
  const endMonth = end.slice(0, 7);
  const [sy, sm] = startMonth.split("-").map(Number);
  const [ey, em] = endMonth.split("-").map(Number);
  if (!sy || !sm || !ey || !em) return result;
  let year = sy;
  let month = sm;
  while (year < ey || (year === ey && month <= em)) {
    result.push(`${year}-${String(month).padStart(2, "0")}`);
    month += 1;
    if (month > 12) {
      month = 1;
      year += 1;
    }
    if (result.length > 120) break;
  }
  return result;
}

function parseMoney(value: string) {
  const clean = value.trim().replace(/\s/g, "").replace(/\./g, "").replace(",", ".");
  const amount = Number(clean);
  return Number.isFinite(amount) ? amount : 0;
}

function inRange(date: string, start: string, end: string) {
  const key = String(date || "").slice(0, 10);
  return key >= start && key <= end;
}

function humanDate(date: string) {
  if (!date) return "—";
  const [y, m, d] = date.slice(0, 10).split("-");
  return y && m && d ? `${d}/${m}/${y}` : date;
}

function safeName(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

async function deliverPdf(blob: Blob, fileName: string) {
  const mobile = typeof navigator !== "undefined" && /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
  if (mobile && typeof navigator.share === "function") {
    const file = new File([blob], fileName, { type: "application/pdf" });
    const payload = { files: [file], title: fileName };
    if (typeof navigator.canShare !== "function" || navigator.canShare(payload)) {
      try {
        await navigator.share(payload);
        return;
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;
      }
    }
  }
  const url = URL.createObjectURL(blob);
  if (mobile) {
    window.location.assign(url);
    window.setTimeout(() => URL.revokeObjectURL(url), 120_000);
    return;
  }
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.rel = "noopener";
  document.body.appendChild(link);
  link.click();
  window.setTimeout(() => {
    link.remove();
    URL.revokeObjectURL(url);
  }, 120_000);
}

function DriverPaymentsPage() {
  const { data, isError, refetch } = useFleet();
  const qc = useQueryClient();
  const paymentsQuery = useQuery({
    queryKey: ["driver-payments"],
    queryFn: () => listDriverPayments(),
    staleTime: 15_000,
  });

  const [driverId, setDriverId] = useState("");
  const [periodMode, setPeriodMode] = useState<"monthly" | "custom">("monthly");
  const [monthKey, setMonthKey] = useState(currentMonthKey);
  const [periodStart, setPeriodStart] = useState(() => monthBounds(currentMonthKey()).start);
  const [periodEnd, setPeriodEnd] = useState(() => monthBounds(currentMonthKey()).end);
  const [paymentDate, setPaymentDate] = useState(isoToday);
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState(false);

  useEffect(() => {
    if (!driverId && data?.drivers?.[0]?.id) setDriverId(data.drivers[0].id);
  }, [data, driverId]);

  useEffect(() => {
    if (periodMode !== "monthly") return;
    const bounds = monthBounds(monthKey);
    setPeriodStart(bounds.start);
    setPeriodEnd(bounds.end);
  }, [periodMode, monthKey]);

  const selectedDriver = data?.drivers.find((driver) => driver.id === driverId) ?? null;

  const settlement = useMemo(() => {
    if (!data || !driverId) {
      return { commission: 0, advances: [], advanceTotal: 0, payments: [], paymentTotal: 0, totalReceived: 0, remaining: 0, tripCount: 0 };
    }

    const trips = data.trips
      .filter((trip) => trip.driverId === driverId && inRange(trip.date, periodStart, periodEnd))
      .map((trip) => enrichTrip(trip, data.drivers, data.fleets));
    const commission = trips.reduce((sum, trip: any) => sum + Number(trip.commissionValue ?? 0), 0);

    const advances = data.expenses
      .filter((expense) =>
        expense.driverId === driverId &&
        expense.category === "Adiantamento" &&
        inRange(expense.date, periodStart, periodEnd)
      )
      .map((expense) => ({
        id: expense.id,
        date: expense.date,
        amount: Number(expense.amount || 0),
        note: expense.description || "Adiantamento",
      }))
      .sort((a, b) => a.date.localeCompare(b.date));

    const payments = (paymentsQuery.data ?? [])
      .filter((payment) =>
        payment.driverId === driverId &&
        payment.periodStart <= periodEnd &&
        payment.periodEnd >= periodStart
      )
      .sort((a, b) => a.date.localeCompare(b.date) || a.createdAt.localeCompare(b.createdAt));

    const advanceTotal = advances.reduce((sum, row) => sum + row.amount, 0);
    const paymentTotal = payments.reduce((sum, row) => sum + row.amount, 0);
    const totalReceived = advanceTotal + paymentTotal;

    return {
      commission,
      advances,
      advanceTotal,
      payments,
      paymentTotal,
      totalReceived,
      remaining: commission - totalReceived,
      tripCount: trips.length,
    };
  }, [data, driverId, periodStart, periodEnd, paymentsQuery.data]);

  const monthSummary = useMemo(() => {
    if (!data || !driverId) return [];
    return monthsBetween(periodStart, periodEnd).map((month) => {
      const bounds = monthBounds(month);
      const start = bounds.start < periodStart ? periodStart : bounds.start;
      const end = bounds.end > periodEnd ? periodEnd : bounds.end;

      const trips = data.trips
        .filter((trip) => trip.driverId === driverId && inRange(trip.date, start, end))
        .map((trip) => enrichTrip(trip, data.drivers, data.fleets));
      const commission = trips.reduce((sum, trip: any) => sum + Number(trip.commissionValue ?? 0), 0);

      const advances = data.expenses
        .filter((expense) =>
          expense.driverId === driverId &&
          expense.category === "Adiantamento" &&
          inRange(expense.date, start, end)
        )
        .reduce((sum, expense) => sum + Number(expense.amount || 0), 0);

      const monthlyPayments = (paymentsQuery.data ?? [])
        .filter((payment) => {
          if (payment.driverId !== driverId) return false;
          const paymentStartMonth = payment.periodStart.slice(0, 7);
          const paymentEndMonth = payment.periodEnd.slice(0, 7);
          if (paymentStartMonth === paymentEndMonth) return paymentStartMonth === month;
          return payment.date.slice(0, 7) === month;
        })
        .reduce((sum, payment) => sum + Number(payment.amount || 0), 0);

      return {
        month,
        label: monthLabel(month),
        commission,
        advances,
        payments: monthlyPayments,
        received: advances + monthlyPayments,
        remaining: commission - advances - monthlyPayments,
      };
    });
  }, [data, driverId, periodStart, periodEnd, paymentsQuery.data]);

  async function savePayment() {
    const value = parseMoney(amount);
    if (!driverId) return toast.error("Selecione o motorista.");
    if (periodStart > periodEnd) return toast.error("Confira o período do acerto.");
    if (value <= 0) return toast.error("Informe um valor de pagamento maior que zero.");
    setSaving(true);
    try {
      await createDriverPayment({
        data: {
          driverId,
          date: paymentDate,
          amount: value,
          note: note.trim(),
          periodStart,
          periodEnd,
        },
      });
      setAmount("");
      setNote("");
      await qc.invalidateQueries({ queryKey: ["driver-payments"] });
      toast.success("Pagamento registrado.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível registrar o pagamento.");
    } finally {
      setSaving(false);
    }
  }

  async function removePayment(payment: DriverPaymentRecord) {
    if (!window.confirm(`Excluir o pagamento de ${brl(payment.amount)}?`)) return;
    try {
      await deleteDriverPayment({ data: { id: payment.id } });
      await qc.invalidateQueries({ queryKey: ["driver-payments"] });
      toast.success("Pagamento excluído.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível excluir.");
    }
  }

  async function generateSettlementPdf() {
    if (!selectedDriver) return toast.error("Selecione o motorista.");
    setGenerating(true);
    try {
      const { jsPDF } = await import("jspdf");
      const doc = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait" });
      const money = (value: number) => brl(Number(value || 0));
      const black = [25, 25, 25] as [number, number, number];
      const gray = [92, 99, 112] as [number, number, number];
      const blue = [28, 92, 180] as [number, number, number];
      let y = 18;

      doc.setTextColor(...black);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(18);
      doc.text("TRANS SALOMÃO", 15, y);
      doc.setFontSize(13);
      doc.text(
        periodMode === "monthly"
          ? "RECIBO MENSAL E TERMO DE ACERTO DO MOTORISTA"
          : "TERMO DE ACERTO POR COMPETÊNCIAS",
        15,
        y + 8,
      );
      doc.setDrawColor(...blue);
      doc.setLineWidth(0.6);
      doc.line(15, y + 12, 195, y + 12);
      y += 22;

      doc.setFont("helvetica", "normal");
      doc.setFontSize(10);
      doc.setTextColor(...gray);
      doc.text("Motorista", 15, y);
      doc.text(periodMode === "monthly" ? "Competência" : "Período do acerto", 112, y);
      doc.setTextColor(...black);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(11);
      doc.text(selectedDriver.name, 15, y + 6);
      doc.text(
        periodMode === "monthly"
          ? monthLabel(monthKey)
          : `${humanDate(periodStart)} a ${humanDate(periodEnd)}`,
        112,
        y + 6,
      );
      y += 16;

      const cards = [
        ["Comissão apurada", money(settlement.commission)],
        ["Adiantamentos", money(settlement.advanceTotal)],
        ["Outros pagamentos", money(settlement.paymentTotal)],
        [settlement.remaining > 0.005 ? "Ainda falta pagar" : settlement.remaining < -0.005 ? "Pago acima do apurado" : "Situação", settlement.remaining > 0.005 ? money(settlement.remaining) : settlement.remaining < -0.005 ? money(Math.abs(settlement.remaining)) : "QUITADO"],
      ];

      const cardWidth = 43.5;
      cards.forEach((item, index) => {
        const x = 15 + index * 45;
        doc.setDrawColor(205, 210, 218);
        doc.roundedRect(x, y, cardWidth, 20, 2, 2);
        doc.setFont("helvetica", "normal");
        doc.setFontSize(7.5);
        doc.setTextColor(...gray);
        doc.text(item[0], x + 3, y + 6);
        doc.setFont("helvetica", "bold");
        doc.setFontSize(10.5);
        doc.setTextColor(...black);
        doc.text(item[1], x + 3, y + 14);
      });
      y += 28;

      if (monthSummary.length > 0) {
        doc.setFont("helvetica", "bold");
        doc.setFontSize(11);
        doc.text(monthSummary.length === 1 ? "Resumo da competência" : "Resumo por competência", 15, y);
        y += 5;

        doc.setFillColor(238, 242, 248);
        doc.rect(15, y, 180, 8, "F");
        doc.setFontSize(7.4);
        doc.text("COMPETÊNCIA", 17, y + 5.2);
        doc.text("COMISSÃO", 71, y + 5.2, { align: "right" });
        doc.text("ADIANT.", 101, y + 5.2, { align: "right" });
        doc.text("PAGAMENTOS", 137, y + 5.2, { align: "right" });
        doc.text("SALDO", 192, y + 5.2, { align: "right" });
        y += 8;

        for (const row of monthSummary) {
          if (y > 235) {
            doc.addPage();
            y = 18;
          }
          doc.setFont("helvetica", "normal");
          doc.setFontSize(8.2);
          doc.setTextColor(...black);
          doc.text(row.label, 17, y + 5.4);
          doc.text(money(row.commission), 71, y + 5.4, { align: "right" });
          doc.text(money(row.advances), 101, y + 5.4, { align: "right" });
          doc.text(money(row.payments), 137, y + 5.4, { align: "right" });
          doc.setFont("helvetica", "bold");
          doc.text(
            row.remaining > 0.005 ? money(row.remaining) : row.remaining < -0.005 ? "-" + money(Math.abs(row.remaining)) : "QUITADO",
            192,
            y + 5.4,
            { align: "right" },
          );
          doc.setDrawColor(226, 229, 235);
          doc.line(15, y + 8, 195, y + 8);
          y += 8;
        }
        y += 8;
      }

      const rows = [
        ...settlement.advances.map((row) => ({
          type: "Adiantamento",
          date: row.date,
          reference: monthLabel(row.date.slice(0, 7)),
          note: row.note,
          amount: row.amount,
        })),
        ...settlement.payments.map((row) => ({
          type: "Pagamento",
          date: row.date,
          reference: periodReferenceLabel(row.periodStart, row.periodEnd),
          note: row.note || "Pagamento ao motorista",
          amount: row.amount,
        })),
      ].sort((a, b) => a.date.localeCompare(b.date));

      const drawTableHeader = () => {
        doc.setFillColor(238, 242, 248);
        doc.rect(15, y, 180, 8, "F");
        doc.setFont("helvetica", "bold");
        doc.setFontSize(8.5);
        doc.setTextColor(...black);
        doc.text("DATA", 17, y + 5.3);
        doc.text("TIPO", 40, y + 5.3);
        doc.text("COMPETÊNCIA / REFERÊNCIA", 68, y + 5.3);
        doc.text("NOTA", 112, y + 5.3);
        doc.text("VALOR", 192, y + 5.3, { align: "right" });
        y += 8;
      };

      doc.setFont("helvetica", "bold");
      doc.setFontSize(11);
      doc.text("Valores já recebidos", 15, y);
      y += 5;
      drawTableHeader();

      if (rows.length === 0) {
        doc.setFont("helvetica", "normal");
        doc.setFontSize(9);
        doc.setTextColor(...gray);
        doc.text("Nenhum adiantamento ou pagamento registrado para este período.", 17, y + 6);
        y += 12;
      } else {
        for (const row of rows) {
          if (y > 225) {
            doc.addPage();
            y = 18;
            drawTableHeader();
          }
          const referenceLines = doc.splitTextToSize(row.reference || "—", 39);
          const noteLines = doc.splitTextToSize(row.note || "—", 68);
          const rowHeight = Math.max(9, 5 + Math.max(referenceLines.length, noteLines.length) * 4);
          doc.setDrawColor(226, 229, 235);
          doc.line(15, y + rowHeight, 195, y + rowHeight);
          doc.setFont("helvetica", "normal");
          doc.setFontSize(8.1);
          doc.setTextColor(...black);
          doc.text(humanDate(row.date), 17, y + 5.5);
          doc.text(row.type, 40, y + 5.5);
          doc.text(referenceLines, 68, y + 5.5);
          doc.text(noteLines, 112, y + 5.5);
          doc.setFont("helvetica", "bold");
          doc.text(money(row.amount), 192, y + 5.5, { align: "right" });
          y += rowHeight;
        }
      }

      y += 9;
      if (y > 235) {
        doc.addPage();
        y = 20;
      }

      const totalAlreadyReceived = settlement.totalReceived;
      doc.setFont("helvetica", "normal");
      doc.setFontSize(10);
      doc.setTextColor(...black);
      const referenceText = periodMode === "monthly"
        ? `competência ${monthLabel(monthKey)}`
        : `período de ${humanDate(periodStart)} a ${humanDate(periodEnd)}`;
      const declaration = settlement.remaining > 0.005
        ? `Declaro que recebi, até a presente data, o total de ${money(totalAlreadyReceived)} referente aos adiantamentos e pagamentos discriminados neste documento, relativos à ${referenceText}. A comissão apurada é de ${money(settlement.commission)}, restando ainda ${money(settlement.remaining)} a receber.`
        : settlement.remaining < -0.005
          ? `Declaro que recebi o total de ${money(totalAlreadyReceived)} referente à ${referenceText}. Esse valor supera em ${money(Math.abs(settlement.remaining))} a comissão apurada de ${money(settlement.commission)}, ficando o acerto sujeito à conferência da Gerência.`
          : `Declaro que recebi o total de ${money(totalAlreadyReceived)}, correspondente ao valor apurado de ${money(settlement.commission)} referente à ${referenceText}, dando quitação dos valores discriminados neste termo.`;
      const declarationLines = doc.splitTextToSize(declaration, 178);
      doc.text(declarationLines, 15, y);
      y += declarationLines.length * 5 + 9;

      doc.setFont("helvetica", "bold");
      doc.text("Resumo do acerto", 15, y);
      y += 6;
      doc.setFont("helvetica", "normal");
      doc.text(`Viagens consideradas: ${settlement.tripCount}`, 15, y);
      doc.text(`Total já recebido: ${money(totalAlreadyReceived)}`, 105, y);
      y += 7;
      doc.text(`Comissão apurada: ${money(settlement.commission)}`, 15, y);
      doc.text(
        settlement.remaining > 0.005
          ? `Saldo a pagar: ${money(settlement.remaining)}`
          : settlement.remaining < -0.005
            ? `Excedente: ${money(Math.abs(settlement.remaining))}`
            : "Saldo a pagar: R$ 0,00 — QUITADO",
        105,
        y,
      );

      y += 24;
      if (y > 255) {
        doc.addPage();
        y = 35;
      }
      doc.setDrawColor(...black);
      doc.line(20, y, 92, y);
      doc.line(118, y, 190, y);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
      doc.text(selectedDriver.name, 56, y + 5, { align: "center" });
      doc.text("Motorista", 56, y + 10, { align: "center" });
      doc.text("Responsável — Trans Salomão", 154, y + 5, { align: "center" });
      doc.text("Assinatura", 154, y + 10, { align: "center" });
      y += 22;
      doc.text("Data: ____/____/________", 15, y);
      doc.text("Documento do motorista: ______________________________", 92, y);

      const pages = doc.getNumberOfPages();
      for (let p = 1; p <= pages; p += 1) {
        doc.setPage(p);
        doc.setFont("helvetica", "normal");
        doc.setFontSize(7.5);
        doc.setTextColor(...gray);
        doc.text(`Emitido em ${new Date().toLocaleString("pt-BR")} · Página ${p}/${pages}`, 105, 290, { align: "center" });
      }

      const blob = doc.output("blob");
      const fileName = periodMode === "monthly"
        ? `Recibo_Mensal_${safeName(selectedDriver.name)}_${monthKey}.pdf`
        : `Acerto_${safeName(selectedDriver.name)}_${periodStart}_a_${periodEnd}.pdf`;
      await deliverPdf(blob, fileName);
      toast.success("Termo de acerto gerado para assinatura.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível gerar o termo.");
    } finally {
      setGenerating(false);
    }
  }

  if (isError) {
    return (
      <div className="dashboard-panel" role="alert">
        <h1>Pagamentos de motoristas</h1>
        <p className="my-4 text-muted">Não foi possível carregar os dados.</p>
        <Button onClick={() => void refetch()}>Tentar novamente</Button>
      </div>
    );
  }

  return (
    <div className="grid gap-5">
      <div className="dashboard-title">
        <div>
          <h1>Pagamentos de motoristas</h1>
          <p className="dashboard-subtitle">Registre pagamentos, consolide adiantamentos e gere o termo para assinatura.</p>
        </div>
        <Button onClick={() => void generateSettlementPdf()} disabled={!selectedDriver || generating}>
          <FileSignature className="size-4" />
          {generating ? "Gerando…" : "Gerar termo para assinatura"}
        </Button>
      </div>

      <section className="dashboard-panel">
        <div className="panel-heading">
          <div>
            <h2>Acerto do motorista</h2>
            <p>Os adiantamentos são puxados automaticamente da aba Despesas.</p>
          </div>
        </div>
        <div className="grid gap-4 md:grid-cols-4">
          <Field label="Motorista">
            <Select value={driverId} onChange={(event) => setDriverId(event.target.value)}>
              <option value="">Selecione</option>
              {(data?.drivers ?? []).map((driver) => <option key={driver.id} value={driver.id}>{driver.name}</option>)}
            </Select>
          </Field>
          <Field label="Tipo do acerto">
            <Select value={periodMode} onChange={(event) => setPeriodMode(event.target.value as "monthly" | "custom")}>
              <option value="monthly">Mensal / por competência</option>
              <option value="custom">Vários meses / período personalizado</option>
            </Select>
          </Field>
          {periodMode === "monthly" ? (
            <Field label="Mês de referência">
              <Input type="month" value={monthKey} onChange={(event) => setMonthKey(event.target.value)} />
            </Field>
          ) : (
            <>
              <Field label="Início do período">
                <Input type="date" value={periodStart} onChange={(event) => setPeriodStart(event.target.value)} />
              </Field>
              <Field label="Fim do período">
                <Input type="date" value={periodEnd} onChange={(event) => setPeriodEnd(event.target.value)} />
              </Field>
            </>
          )}
        </div>
        <p className="mt-3 text-xs text-muted">
          {periodMode === "monthly"
            ? `O documento será emitido para a competência ${monthLabel(monthKey)}.`
            : `O documento pode abranger vários meses e mostrará os valores separados por competência.`}
        </p>

        <div className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-5">
          <Summary label="Comissão apurada" value={brl(settlement.commission)} />
          <Summary label="Adiantamentos" value={brl(settlement.advanceTotal)} />
          <Summary label="Pagamentos" value={brl(settlement.paymentTotal)} />
          <Summary label="Total recebido" value={brl(settlement.totalReceived)} />
          <Summary
            label={settlement.remaining > 0.005 ? "Falta pagar" : settlement.remaining < -0.005 ? "Pago a maior" : "Situação"}
            value={settlement.remaining > 0.005 ? brl(settlement.remaining) : settlement.remaining < -0.005 ? brl(Math.abs(settlement.remaining)) : "QUITADO"}
            emphasis
          />
        </div>
      </section>

      <section className="dashboard-panel">
        <div className="panel-heading">
          <div>
            <h2>Novo pagamento</h2>
            <p>
              O pagamento fica vinculado ao motorista e à referência selecionada acima
              {periodMode === "monthly" ? ` — ${monthLabel(monthKey)}` : ` — ${periodReferenceLabel(periodStart, periodEnd)}`}.
            </p>
          </div>
          <WalletCards className="size-5 text-muted" />
        </div>
        <div className="grid gap-4 md:grid-cols-[180px_180px_1fr_auto] md:items-end">
          <Field label="Data do pagamento">
            <Input type="date" value={paymentDate} onChange={(event) => setPaymentDate(event.target.value)} />
          </Field>
          <Field label="Valor (R$)">
            <Input inputMode="decimal" placeholder="0,00" value={amount} onChange={(event) => setAmount(event.target.value)} />
          </Field>
          <Field label="Nota / referência">
            <Input placeholder="Ex.: pagamento parcial, Pix, acerto semanal…" value={note} onChange={(event) => setNote(event.target.value)} maxLength={500} />
          </Field>
          <Button onClick={() => void savePayment()} disabled={saving || !selectedDriver}>
            <Plus className="size-4" />
            {saving ? "Salvando…" : "Registrar"}
          </Button>
        </div>
      </section>

      <section className="dashboard-panel">
        <div className="panel-heading">
          <div>
            <h2>Valores já recebidos</h2>
            <p>{selectedDriver ? `${selectedDriver.name} · ${humanDate(periodStart)} a ${humanDate(periodEnd)}` : "Selecione um motorista"}</p>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="text-[10px] uppercase tracking-[0.14em] text-muted">
              <tr>
                {["Data", "Tipo", "Competência / referência", "Nota", "Valor", "Ação"].map((label) => (
                  <th key={label} className="border-b border-border px-3 py-2 font-medium">{label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {settlement.advances.map((row) => (
                <tr key={"advance-" + row.id} className="border-b border-border/70">
                  <td className="px-3 py-3">{formatDateShort(row.date)}</td>
                  <td className="px-3 py-3 font-semibold">Adiantamento</td>
                  <td className="px-3 py-3">{monthLabel(row.date.slice(0, 7))}</td>
                  <td className="px-3 py-3">{row.note || "Adiantamento"}</td>
                  <td className="px-3 py-3 font-semibold tabular">{brl(row.amount)}</td>
                  <td className="px-3 py-3 text-xs text-muted">Editar em Despesas</td>
                </tr>
              ))}
              {settlement.payments.map((row) => (
                <tr key={row.id} className="border-b border-border/70">
                  <td className="px-3 py-3">{formatDateShort(row.date)}</td>
                  <td className="px-3 py-3 font-semibold">Pagamento</td>
                  <td className="px-3 py-3">{periodReferenceLabel(row.periodStart, row.periodEnd)}</td>
                  <td className="px-3 py-3">{row.note || "Pagamento ao motorista"}</td>
                  <td className="px-3 py-3 font-semibold tabular">{brl(row.amount)}</td>
                  <td className="px-3 py-3">
                    <button
                      type="button"
                      onClick={() => void removePayment(row)}
                      className="inline-flex min-h-9 items-center gap-1 rounded-md px-2 text-xs font-semibold text-danger hover:bg-surface-2"
                    >
                      <Trash2 className="size-4" /> Excluir
                    </button>
                  </td>
                </tr>
              ))}
              {settlement.advances.length === 0 && settlement.payments.length === 0 ? (
                <tr><td colSpan={6} className="px-3 py-8 text-center text-sm text-muted">Nenhum valor recebido registrado para este período.</td></tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function Summary({ label, value, emphasis = false }: { label: string; value: string; emphasis?: boolean }) {
  return (
    <div className={`rounded-lg border border-border p-4 ${emphasis ? "bg-surface-2" : "bg-surface"}`}>
      <p className="text-[10px] uppercase tracking-[0.14em] text-muted">{label}</p>
      <p className="mt-2 font-display text-xl font-semibold tabular">{value}</p>
    </div>
  );
}
