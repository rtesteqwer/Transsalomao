import { useEffect, useState } from "react";
import { brl } from "@/lib/format";
import type { DriverReport } from "@/lib/types";

export type PendingTicketMetadata = {
  numeroTicket: string | null;
  placaVeiculo: string | null;
  placaCarreta: string | null;
  transportadora: string | null;
  destinatario: string | null;
  operadora: string | null;
  contratante: string | null;
  cliente: string | null;
  produto: string | null;
  remetente: string | null;
  navio: string | null;
  navioOrigem: string | null;
  navioDestino: string | null;
  empresaDocumento: string | null;
  dataTicket: string | null;
  horaTicket: string | null;
  pesoLiquidoKg: number | null;
  freightMode: string | null;
  pricePerTon: number | null;
  routeGroup: string | null;
  routeOrigin: string | null;
  routeDestination: string | null;
  routePricePerTon: number | null;
  routeConfidence: number | null;
  suggestedPricePerTon: number | null;
  priceInferenceConfidence: number | null;
  priceInferenceBasis: string | null;
  priceInferenceSupport: number | null;
};

export function CaixaTicketSummary({ report, data }: { report: DriverReport; data: any }) {
  const [ticket, setTicket] = useState<PendingTicketMetadata | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/ticket-meta?reportId=" + encodeURIComponent(report.id), {
      credentials: "same-origin",
      cache: "no-store",
      signal: controller.signal,
    })
      .then((response) => response.ok ? response.json() : null)
      .then((result) => {
        if (!controller.signal.aborted) setTicket(result?.ticket ?? null);
      })
      .catch(() => {});
    return () => controller.abort();
  }, [report.id]);

  if (!ticket) return null;

  const mode = report.freightMode || ticket.freightMode;
  const explicitPrice = positive(ticket.pricePerTon);
  const routePrice = positive(ticket.routePricePerTon);
  const suggestedPrice = positive(ticket.suggestedPricePerTon);
  const pricePerTon = explicitPrice || routePrice || suggestedPrice || 0;

  const driver = data?.drivers?.find((item: any) => item.id === report.driverId);
  const commissionPct = Number(driver?.commissionPct ?? 0);
  const gross = mode === "ton"
    ? Number(report.tons ?? 0) * pricePerTon
    : Number(report.dailyValue ?? 0);
  const commission = gross > 0 ? gross * commissionPct : 0;
  const liquid = gross - commission;

  const month = monthKey(ticket.dataTicket) || String(report.createdAt || "").slice(0, 7);
  const fuelings = (data?.fuelings ?? []).filter((item: any) =>
    item.driverId === report.driverId &&
    (!month || String(item.date || "").slice(0, 7) === month)
  );
  const dieselLiters = fuelings.reduce((sum: number, item: any) => sum + Number(item.liters ?? 0), 0);
  const dieselCost = fuelings.reduce(
    (sum: number, item: any) => sum + Number(item.liters ?? 0) * Number(item.pricePerLiter ?? 0),
    0,
  );

  const info: Array<[string, unknown]> = [
    ["Ticket", ticket.numeroTicket],
    ["Veículo", ticket.placaVeiculo],
    ["Carreta", ticket.placaCarreta],
    ["Transportadora", ticket.transportadora],
    ["Operadora", ticket.operadora],
    ["Contratante", ticket.contratante],
    ["Cliente", ticket.cliente],
    ["Destinatário", ticket.destinatario],
    ["Produto", ticket.produto],
    ["Remetente", ticket.remetente],
    ["Navio", ticket.navio],
    ["Navio origem", ticket.navioOrigem],
    ["Navio destino", ticket.navioDestino],
    ["Data do ticket", ticket.dataTicket],
    ["Horário", ticket.horaTicket],
    ["Rota", ticket.routeGroup],
  ].filter(([, value]) => String(value ?? "").trim());

  return (
    <div className="mt-4 grid gap-3">
      {gross > 0 ? (
        <div className="grid grid-cols-2 gap-2 rounded-xl border border-border bg-surface-2 p-3 sm:grid-cols-5">
          {mode === "ton" && pricePerTon > 0 ? <MetricBox label="Preço/t" value={brl(pricePerTon) + "/t"} /> : null}
          <MetricBox label="Frete bruto" value={brl(gross)} />
          <MetricBox
            label={commissionPct > 0
              ? "Comissão " + new Intl.NumberFormat("pt-BR", { style: "percent", maximumFractionDigits: 2 }).format(commissionPct)
              : "Comissão"}
            value={brl(commission)}
          />
          <MetricBox label="Líquido após comissão" value={brl(liquid)} />
          {dieselCost > 0 ? (
            <MetricBox
              label="Diesel motorista no mês"
              value={brl(dieselCost) + " · " + new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 3 }).format(dieselLiters) + " L"}
            />
          ) : null}
        </div>
      ) : null}

      {mode === "ton" && pricePerTon > 0 && !explicitPrice && ticket.priceInferenceBasis ? (
        <p className="rounded-lg border border-accent/25 bg-accent/5 px-3 py-2 text-xs text-muted">
          Preço/t sugerido pelo histórico: <b className="text-fg">{brl(pricePerTon)}/t</b>
          {" · " + ticket.priceInferenceBasis}
          {Number(ticket.priceInferenceConfidence) > 0
            ? " · confiança " + Math.round(Number(ticket.priceInferenceConfidence) * 100) + "%"
            : ""}
        </p>
      ) : null}

      {info.length > 0 || (mode === "ton" && ticket.pesoLiquidoKg) ? (
        <div className="rounded-lg border border-border bg-bg p-3 text-xs">
          <p className="font-semibold text-fg">Dados identificados</p>
          <div className="mt-2 grid gap-1 text-muted sm:grid-cols-2">
            {info.map(([label, value]) => (
              <span key={label}>{label}: <b className="text-fg">{String(value)}</b></span>
            ))}
            {mode === "ton" && ticket.pesoLiquidoKg ? (
              <span>
                Peso líquido: <b className="text-fg">{new Intl.NumberFormat("pt-BR").format(ticket.pesoLiquidoKg)} kg</b>
              </span>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function CaixaFixedGroupSummary({ reports, commissionPct }: { reports: DriverReport[]; commissionPct: number }) {
  const gross = reports.reduce((sum, item) => sum + Number(item.dailyValue ?? 0), 0);
  if (gross <= 0) return null;
  return (
    <div className="mt-4 grid grid-cols-3 gap-2 rounded-lg border border-border bg-bg p-3 text-xs">
      <MetricBox label="Frete bruto" value={brl(gross)} />
      <MetricBox label="Comissão" value={brl(gross * commissionPct)} />
      <MetricBox label="Líquido" value={brl(gross * (1 - commissionPct))} />
    </div>
  );
}

function MetricBox({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-bg px-3 py-2">
      <p className="text-[9px] uppercase tracking-[0.1em] text-muted">{label}</p>
      <strong className="mt-1 block text-sm tabular text-fg">{value}</strong>
    </div>
  );
}

function positive(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
}

function monthKey(value: unknown) {
  const raw = String(value ?? "").trim();
  const iso = raw.match(/^(\d{4})-(\d{1,2})/);
  if (iso) return iso[1] + "-" + iso[2].padStart(2, "0");
  const br = raw.match(/^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{4})/);
  return br ? br[3] + "-" + br[2].padStart(2, "0") : "";
}
