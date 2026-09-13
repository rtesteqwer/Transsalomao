import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  BadgeDollarSign,
  CalendarDays,
  ClipboardCheck,
  Fuel,
  Gauge,
  LogOut,
  Route as RouteIcon,
  Scale,
  Truck,
  UserRoundCheck,
} from "lucide-react";
import type { ReactNode } from "react";
import { toast } from "sonner";
import { BrandLockup } from "@/components/brand";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { enrichTrip, aggregateKpis } from "@/lib/calc";
import { getKlebersomFleetState } from "@/lib/api";
import { brl, formatDate, integer, num } from "@/lib/format";
import { getManagementSession, managementLogout } from "@/lib/management-auth";
import type { FleetState } from "@/lib/types";

export const Route = createFileRoute("/socio-klebersom")({ component: PartnerPage });

function PartnerPage() {
  const qc = useQueryClient();
  const session = useQuery({
    queryKey: ["management-session"],
    queryFn: () => getManagementSession(),
    staleTime: 30_000,
  });
  const fleet = useQuery({
    queryKey: ["klebersom-fleet"],
    queryFn: () => getKlebersomFleetState(),
    enabled: session.data?.authenticated === true,
    refetchInterval: 5000,
  });

  if (session.isLoading) return <LoadingScreen />;
  if (!session.data?.authenticated) return <Navigate to="/dono" />;
  if (session.data.role !== "partner" && session.data.role !== "admin") return <Navigate to="/dono" />;

  return (
    <PartnerDashboard
      data={fleet.data}
      loading={fleet.isLoading}
      onLogout={async () => {
        try {
          await managementLogout();
          qc.clear();
          toast.success("Sessão encerrada.");
          window.location.href = "/dono";
        } catch (err) {
          toast.error(err instanceof Error ? err.message : "Não foi possível sair.");
        }
      }}
    />
  );
}

function LoadingScreen() {
  return (
    <main className="grid min-h-dvh place-items-center bg-[#08111f] px-5 text-white">
      <div className="text-center">
        <BrandLockup to="/" subtitle="Motorista & Sócio" />
        <p className="mt-5 text-sm text-white/60">Carregando sua área exclusiva…</p>
      </div>
    </main>
  );
}

function PartnerDashboard({ data, loading, onLogout }: { data: FleetState | undefined; loading: boolean; onLogout: () => Promise<void> }) {
  const driver = data?.drivers[0];
  const fleet = data?.fleets[0];
  const trips = data ? data.trips.map((trip) => enrichTrip(trip, data.drivers, data.fleets)) : [];
  const kpis = aggregateKpis(trips);
  const latestTripOdometer = trips.reduce((max, t) => Math.max(max, t.kmEnd), 0);
  const latestFuelOdometer = (data?.fuelings ?? []).reduce((max, f) => Math.max(max, f.km), 0);
  const currentOdometer = Math.max(latestTripOdometer, latestFuelOdometer);
  const fuelingCost = (data?.fuelings ?? []).reduce((sum, f) => sum + f.liters * f.pricePerLiter, 0);
  const fuelingLiters = (data?.fuelings ?? []).reduce((sum, f) => sum + f.liters, 0);

  return (
    <main className="min-h-dvh bg-[#f5f8fc] text-[#0b1220]">
      <header className="sticky top-0 z-20 border-b border-[#dce5f0] bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-4 sm:px-6 lg:px-8">
          <BrandLockup to="/" subtitle="Motorista & Sócio" />
          <Button variant="ghost" onClick={onLogout} className="text-[#0b1220] hover:bg-[#eaf2ff]">
            <LogOut className="size-4" /><span className="hidden sm:inline">Sair</span>
          </Button>
        </div>
      </header>

      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        <section className="overflow-hidden rounded-2xl bg-[#07182f] text-white shadow-panel">
          <div className="grid gap-6 p-6 sm:p-8 lg:grid-cols-[1.4fr_0.8fr] lg:items-end">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full bg-[#1677ff]/20 px-3 py-1 text-xs font-semibold uppercase tracking-[0.12em] text-[#82b8ff]">
                <UserRoundCheck className="size-4" /> Acesso exclusivo
              </div>
              <h1 className="mt-5 font-display text-4xl font-semibold tracking-tight sm:text-5xl">{driver?.name ?? "Klebersom Dutra"}</h1>
              <p className="mt-2 text-sm text-white/65">Motorista e sócio · dados sincronizados com o Painel da Gerência</p>
              <div className="mt-6 flex flex-wrap gap-2 text-sm">
                <span className="inline-flex items-center gap-2 rounded-lg bg-white/10 px-3 py-2"><Truck className="size-4 text-[#5da2ff]" /> {fleet?.name ?? "VOLVO KLEBERSOM"}</span>
                {fleet?.tractorPlate ? <span className="rounded-lg bg-white/10 px-3 py-2">Cavalo {fleet.tractorPlate}</span> : null}
                {fleet?.trailerPlate ? <span className="rounded-lg bg-white/10 px-3 py-2">Carreta {fleet.trailerPlate}</span> : null}
              </div>
            </div>
            <div className="rounded-xl border border-white/10 bg-white/5 p-5">
              <p className="text-xs uppercase tracking-[0.15em] text-white/55">Odômetro atual registrado</p>
              <div className="mt-2 flex items-center gap-3"><Gauge className="size-7 text-[#4f9bff]" /><strong className="font-display text-4xl tracking-tight">{currentOdometer > 0 ? integer(currentOdometer) : "—"}</strong><span className="mt-2 text-sm text-white/55">km</span></div>
            </div>
          </div>
        </section>

        {!loading && (!driver || !fleet) ? <div className="mt-5 rounded-xl border border-[#f2c26b] bg-[#fff8e8] p-4 text-sm text-[#4a3510]">O cadastro exclusivo foi preparado, mas o motorista ou conjunto ainda não foi localizado no banco atual.</div> : null}

        <section className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <MetricCard icon={BadgeDollarSign} label="Faturamento" value={brl(kpis.revenue)} detail={`${trips.length} viagens`} />
          <MetricCard icon={RouteIcon} label="KM rodados" value={integer(kpis.totalKm)} detail="odômetro inicial → final" />
          <MetricCard icon={Scale} label="Peso líquido" value={`${num(kpis.netWeight, 1)} t`} detail="total transportado" />
          <MetricCard icon={Fuel} label="Abastecimentos" value={`${num(fuelingLiters, 1)} L`} detail={brl(fuelingCost)} />
        </section>

        <section className="mt-6 grid gap-6 xl:grid-cols-[1.35fr_0.65fr]">
          <WhitePanel title="Viagens e odômetros" icon={Truck}>
            {trips.length === 0 ? <EmptyState text="Nenhuma viagem do Klebersom com o VOLVO KLEBERSOM foi registrada ainda." /> : (
              <div className="divide-y divide-[#e5ebf3]">{trips.map((trip) => (
                <article key={trip.id} className="grid gap-3 py-4 first:pt-0 last:pb-0 md:grid-cols-[1fr_auto] md:items-center">
                  <div><div className="flex flex-wrap items-center gap-2"><strong className="font-display text-xl tracking-wide text-[#0b1220]">{trip.code}</strong><Badge>{formatDate(trip.date)}</Badge></div><p className="mt-1 text-sm text-[#596579]">{[trip.origin, trip.destination].filter(Boolean).join(" → ") || trip.client || "Viagem registrada"}</p><p className="mt-2 inline-flex items-center gap-2 text-sm font-medium text-[#0b1220]"><Gauge className="size-4 text-[#1677ff]" />{integer(trip.kmStart)} → {integer(trip.kmEnd)} km <span className="text-[#7a879a]">({integer(trip.kmDriven)} km)</span></p></div>
                  <div className="md:text-right"><p className="font-display text-2xl font-semibold text-[#0b1220]">{brl(trip.freight)}</p><p className="text-xs text-[#6c788b]">{num(trip.netWeight, 1)} t · {trip.freightMode === "trip" ? "por viagem" : "por tonelada"}</p></div>
                </article>
              ))}</div>
            )}
          </WhitePanel>

          <div className="grid gap-6 content-start">
            <DarkPanel title="Resumo financeiro" icon={BadgeDollarSign}><SummaryRow label="Faturamento" value={brl(kpis.revenue)} /><SummaryRow label="Comissão" value={brl(kpis.commissions)} /><SummaryRow label="Após comissão" value={brl(kpis.afterCommission)} strong /></DarkPanel>
            <WhitePanel title="Lançamentos" icon={ClipboardCheck}>{(data?.reports ?? []).length === 0 ? <EmptyState text="Nenhum lançamento encontrado." /> : <div className="space-y-3">{(data?.reports ?? []).slice(0, 8).map((report) => <div key={report.id} className="flex items-center justify-between gap-3 rounded-lg bg-[#f5f8fc] p-3"><div><p className="font-semibold text-[#0b1220]">{report.ticket}</p><p className="text-xs text-[#6b778a]">Odômetro {integer(report.km)} km · {num(report.tons, 1)} t</p></div><Badge tone={report.status === "aceito" ? "ok" : report.status === "recusado" ? "danger" : "warn"}>{report.status}</Badge></div>)}</div>}</WhitePanel>
          </div>
        </section>

        <section className="mt-6"><WhitePanel title="Abastecimentos do conjunto" icon={Fuel}>{(data?.fuelings ?? []).length === 0 ? <EmptyState text="Nenhum abastecimento vinculado ao VOLVO KLEBERSOM." /> : <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{(data?.fuelings ?? []).map((fueling) => <article key={fueling.id} className="rounded-xl border border-[#e0e7f0] bg-[#f9fbfe] p-4 text-[#0b1220]"><div className="flex items-center justify-between gap-3"><span className="inline-flex items-center gap-2 text-sm font-semibold"><CalendarDays className="size-4 text-[#1677ff]" />{formatDate(fueling.date)}</span><strong>{brl(fueling.liters * fueling.pricePerLiter)}</strong></div><p className="mt-3 text-sm text-[#5d697c]">{fueling.station || "Posto não informado"}</p><div className="mt-3 flex flex-wrap gap-2 text-xs"><span className="rounded-md bg-white px-2 py-1 shadow-sm">Odômetro {integer(fueling.km)} km</span><span className="rounded-md bg-white px-2 py-1 shadow-sm">{num(fueling.liters, 1)} L</span><span className="rounded-md bg-white px-2 py-1 shadow-sm">{brl(fueling.pricePerLiter)}/L</span></div>{fueling.notes ? <p className="mt-3 text-xs text-[#657186]">Nota: {fueling.notes}</p> : null}</article>)}</div>}</WhitePanel></section>

        <footer className="py-8 text-center text-xs text-[#7b8799]">Esta área é somente leitura e mostra exclusivamente dados vinculados a Klebersom Dutra + VOLVO KLEBERSOM.</footer>
      </div>
    </main>
  );
}

function MetricCard({ icon: Icon, label, value, detail }: { icon: typeof Gauge; label: string; value: string; detail: string }) { return <div className="rounded-xl border border-[#dde6f0] bg-white p-5 text-[#0b1220] shadow-sm"><div className="flex items-start justify-between gap-4"><div><p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#6c788c]">{label}</p><p className="mt-2 font-display text-3xl font-semibold tracking-tight">{value}</p><p className="mt-1 text-xs text-[#7b8799]">{detail}</p></div><span className="grid size-11 shrink-0 place-items-center rounded-xl bg-[#e8f2ff] text-[#1677ff]"><Icon className="size-5" /></span></div></div>; }
function WhitePanel({ title, icon: Icon, children }: { title: string; icon: typeof Gauge; children: ReactNode }) { return <section className="rounded-2xl border border-[#dde6f0] bg-white p-5 text-[#0b1220] shadow-sm sm:p-6"><div className="mb-5 flex items-center gap-3"><span className="grid size-10 place-items-center rounded-lg bg-[#e8f2ff] text-[#1677ff]"><Icon className="size-5" /></span><h2 className="font-display text-2xl font-semibold tracking-tight">{title}</h2></div>{children}</section>; }
function DarkPanel({ title, icon: Icon, children }: { title: string; icon: typeof Gauge; children: ReactNode }) { return <section className="rounded-2xl bg-[#07182f] p-5 text-white shadow-sm sm:p-6"><div className="mb-5 flex items-center gap-3"><span className="grid size-10 place-items-center rounded-lg bg-[#1677ff]/20 text-[#67a8ff]"><Icon className="size-5" /></span><h2 className="font-display text-2xl font-semibold tracking-tight">{title}</h2></div>{children}</section>; }
function SummaryRow({ label, value, strong }: { label: string; value: string; strong?: boolean }) { return <div className="flex items-center justify-between gap-4 border-b border-white/10 py-3 last:border-0"><span className="text-sm text-white/60">{label}</span><strong className={strong ? "font-display text-2xl text-[#78b2ff]" : "text-white"}>{value}</strong></div>; }
function EmptyState({ text }: { text: string }) { return <p className="rounded-xl bg-[#f5f8fc] p-4 text-sm text-[#667287]">{text}</p>; }
