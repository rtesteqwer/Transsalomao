import { FreightModeBadge } from "@/components/owner/freight-mode-badge";
import { createFileRoute } from "@tanstack/react-router";
import { CheckCheck, Pencil, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  emptyDraft,
  TripForm,
  type TripDraft,
} from "@/components/owner/trip-form";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { freightModeLabel, lastDieselPrice, lastKmForFleet } from "@/lib/calc";
import { formatDate, integer, num } from "@/lib/format";
import { parseLocaleNumberOrZero } from "@/lib/parse";
import type { DriverReport } from "@/lib/types";
import { useFleet, useFleetMutations } from "@/lib/use-fleet";

export const Route = createFileRoute("/dono/lancamentos")({
  component: LancamentosPage,
});

function ticketDateForInput(value?: string | null) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const match = raw.match(/^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{4})$/);
  if (!match) return "";
  const [, day, month, year] = match;
  return year + "-" + month.padStart(2, "0") + "-" + day.padStart(2, "0");
}

function LancamentosPage() {
  const { data } = useFleet();
  const { trip, acceptMany, reject, removeReport, removeAllTrips, editReport } = useFleetMutations();
  const [open, setOpen] = useState<DriverReport | null>(null);
  const [editingReport, setEditingReport] = useState<DriverReport | null>(null);
  const [editingForClose, setEditingForClose] = useState(false);
  const [closingTicketMeta, setClosingTicketMeta] = useState<PendingTicketMetadata | null>(null);
  const [selected, setSelected] = useState<Set<string>>(() => new Set());

  const modeOrder: Record<string, number> = { caixinha: 0, cegonha: 1, trip: 2, ton: 3 };
  const driverName = (report: DriverReport) => data?.drivers.find((driver) => driver.id === report.driverId)?.name ?? "Sem motorista";
  const byFreightMode = (a: DriverReport, b: DriverReport) =>
    driverName(a).localeCompare(driverName(b), "pt-BR") ||
    (modeOrder[String(a.freightMode)] ?? 9) - (modeOrder[String(b.freightMode)] ?? 9);
  const pending = [...(data?.reports.filter((r) => r.status === "pendente") ?? [])].sort(byFreightMode);
  const done = [...(data?.reports.filter((r) => r.status !== "pendente") ?? [])].sort(byFreightMode);
  const pendingRows = (() => {
    const groups = new Map<string, DriverReport[]>();
    const rows: Array<{ key: string; reports: DriverReport[]; special: boolean }> = [];
    for (const report of pending) {
      const special = report.freightMode === "cegonha" || report.freightMode === "caixinha";
      if (!special) { rows.push({ key: report.id, reports: [report], special: false }); continue; }
      const key = String(report.driverId) + "|" + String(report.fleetId) + "|" + String(report.freightMode);
      const list = groups.get(key) ?? []; list.push(report); groups.set(key, list);
    }
    for (const [key, reports] of groups) rows.push({ key: "group|" + key, reports, special: true });
    return rows.sort((a, b) => byFreightMode(a.reports[0], b.reports[0]));
  })();
  const selectedPending = pending.filter((r) => selected.has(r.id));
  const selectedCount = selectedPending.length;
  const allSelected = pending.length > 0 && selectedCount === pending.length;

  const draft: TripDraft | null =
    open && data
      ? emptyDraft(data.drivers, data.fleets, data.trips, {
          reportId: open.id,
          code: closingTicketMeta?.numeroTicket || open.ticket,
          date: ticketDateForInput(closingTicketMeta?.dataTicket) || new Date().toISOString().slice(0, 10),
          client: closingTicketMeta?.contratante || closingTicketMeta?.cliente || "",
          origin: closingTicketMeta?.navioOrigem || closingTicketMeta?.remetente || "",
          destination: closingTicketMeta?.navioDestino || closingTicketMeta?.destinatario || "",
          driverId: open.driverId,
          fleetId: open.fleetId,
          kmEnd: open.km > 0 ? String(open.km) : "",
          kmStart: String(lastKmForFleet(data.trips, open.fleetId) ?? ""),
          loadedTons: String(open.tons),
          netWeight: String(open.tons),
          freightMode: open.freightMode ?? "ton",
          pricePerTrip: open.freightMode === "trip" ? String(open.dailyValue || "") : "",
          dieselPrice: String(lastDieselPrice(data.trips)),
        })
      : null;

  async function openReportForClose(report: DriverReport) {
    let ticket: PendingTicketMetadata | null = null;
    try {
      const response = await fetch("/api/ticket-meta?reportId=" + encodeURIComponent(report.id), {
        credentials: "same-origin",
        cache: "no-store",
      });
      const result = response.ok ? await response.json() : null;
      ticket = result?.ticket ?? null;
    } catch {
      ticket = null;
    }
    setClosingTicketMeta(ticket);
    setOpen(report);
  }

  function toggleSelected(id: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleGroup(ids: string[]) {
    setSelected((current) => {
      const next = new Set(current);
      const all = ids.every((id) => next.has(id));
      ids.forEach((id) => all ? next.delete(id) : next.add(id));
      return next;
    });
  }

  async function acceptGroup(reports: DriverReport[]) {
    try {
      const result = await acceptMany.mutateAsync(reports.map((r) => r.id));
      setSelected((current) => { const next = new Set(current); reports.forEach((r) => next.delete(r.id)); return next; });
      toast.success(String(result.accepted ?? 0) + " viagem(ns) do grupo aceita(s).");
    } catch (err) { toast.error(err instanceof Error ? err.message : "Não foi possível aceitar o grupo."); }
  }

  async function rejectGroup(reports: DriverReport[]) {
    try {
      for (const report of reports) await reject.mutateAsync(report.id);
      toast.success(reports.length + " lançamento(ns) recusado(s).");
    } catch (err) { toast.error(err instanceof Error ? err.message : "Não foi possível recusar o grupo."); }
  }

  async function deleteGroup(reports: DriverReport[]) {
    if (!window.confirm("Excluir todos os " + reports.length + " lançamentos deste grupo?")) return;
    try {
      for (const report of reports) await removeReport.mutateAsync(report.id);
      toast.success(reports.length + " lançamento(ns) excluído(s).");
    } catch (err) { toast.error(err instanceof Error ? err.message : "Não foi possível excluir o grupo."); }
  }

  function toggleAll() {
    if (allSelected) {
      setSelected(new Set());
      return;
    }
    setSelected(new Set(pending.map((r) => r.id)));
  }

  async function acceptSelected() {
    const ids = selectedPending.map((r) => r.id);
    if (ids.length === 0) return;
    try {
      const result = await acceptMany.mutateAsync(ids);
      setSelected(new Set());
      const count = result.accepted ?? 0;
      const review = result.needsReview ?? 0;
      if (review > 0) {
        toast.success(`${count} aceita${count === 1 ? "" : "s"}; ${review} lançamento${review === 1 ? "" : "s"} ficou${review === 1 ? "" : "ram"} para a gerência definir o modo de frete.`);
      } else {
        toast.success(`${count} viagem${count === 1 ? "" : "s"} aceita${count === 1 ? "" : "s"} com sucesso.`);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Não foi possível aceitar as viagens selecionadas.");
    }
  }

  async function handleDeleteReport(report: DriverReport) {
    if (!window.confirm(`Excluir o lançamento ${report.ticket}?`)) return;
    try {
      await removeReport.mutateAsync(report.id);
      toast.success("Lançamento excluído.");
      if (open?.id === report.id) setOpen(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Não foi possível excluir.");
    }
  }

  return (
    <div>
      <p className="text-[11px] uppercase tracking-[0.18em] text-muted">
        Caixa de lançamentos
      </p>
      <h1 className="mt-1 font-display text-4xl font-semibold tracking-tight">
        Do motorista
      </h1>
      <p className="mt-2 max-w-xl text-sm text-muted">
        Motorista e conjunto são obrigatórios. Os tickets são automáticos e os lançamentos pendentes podem ser selecionados ou editados antes de fechar a viagem.
      </p>

      <section className="mt-8">
        <h2 className="text-[11px] uppercase tracking-[0.16em] text-muted">
          Pendentes
        </h2>
        {pending.length === 0 ? (
          <p className="mt-4 rounded-lg border border-dashed border-border px-4 py-10 text-center text-sm text-subtle">
            Nenhum lançamento na caixa. Quando o motorista depositar um ticket,
            ele aparece aqui.
          </p>
        ) : (
          <>
            <div className="mt-4 flex flex-col gap-3 rounded-xl border border-border bg-surface p-3 sm:flex-row sm:items-center sm:justify-between">
              <label className="flex cursor-pointer items-center gap-3 text-sm font-medium">
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={toggleAll}
                  className="size-5 cursor-pointer accent-current"
                  aria-label="Marcar todas as viagens pendentes"
                />
                <span>Selecionar todos ({pending.length})</span>
              </label>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs text-muted">
                  {selectedCount} selecionada{selectedCount === 1 ? "" : "s"}
                </span>
                <Button
                  onClick={acceptSelected}
                  disabled={selectedCount === 0 || acceptMany.isPending}
                >
                  <CheckCheck className="size-4" />
                  {acceptMany.isPending ? "Aceitando..." : "Aceitar selecionadas"}
                </Button>
              </div>
            </div>

            <ul className="mt-3 grid gap-3">
            {pendingRows.map((entry) => {
              const r = entry.reports[0];
              const groupReports = entry.reports;
              const groupIds = groupReports.map((item) => item.id);
              const groupSelected = groupIds.every((id) => selected.has(id));
              const driver = data?.drivers.find((d) => d.id === r.driverId);
              const fleet = data?.fleets.find((f) => f.id === r.fleetId);
              return (
                <li
                  key={entry.key}
                  className={`rounded-xl border bg-surface p-4 transition sm:p-5 ${
                    (entry.special ? groupSelected : selected.has(r.id)) ? "border-foreground/40 ring-1 ring-foreground/20" : "border-border"
                  }`}
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="flex items-start gap-3">
                      <input
                        type="checkbox"
                        checked={entry.special ? groupSelected : selected.has(r.id)}
                        onChange={() => entry.special ? toggleGroup(groupIds) : toggleSelected(r.id)}
                        className="mt-2 size-5 shrink-0 cursor-pointer accent-current"
                        aria-label={entry.special ? "Selecionar grupo " + freightModeLabel(r.freightMode!) : "Selecionar viagem " + r.ticket}
                      />
                      <div>
                      <p className="font-display text-3xl font-semibold tracking-wide">
                        {entry.special ? freightModeLabel(r.freightMode!) + " · " + groupReports.length + (groupReports.length === 1 ? " viagem" : " viagens") : r.ticket}
                      </p>
                      <p className="mt-1 text-sm text-muted">
                        {driver?.name ?? "Motorista"} · {fleet?.name ?? "Conjunto"}{" "}
                        · carreta {fleet?.trailerPlate ?? "—"}
                      </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <FreightModeBadge mode={r.freightMode} />
                      <Badge tone="warn">Pendente</Badge>
                    </div>
                  </div>
                  <dl className="mt-4 grid grid-cols-2 gap-3">
                    <div>
                      <dt className="text-[10px] uppercase tracking-[0.14em] text-subtle">
                        {!r.freightMode ? "Peso líquido" : r.freightMode === "trip" ? "Valor da diária" : r.freightMode === "cegonha" || r.freightMode === "caixinha" ? "Lançamento" : "Toneladas"}
                      </dt>
                      <dd className="mt-1 font-display text-xl tabular">
                        {r.freightMode === "trip" ? new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(r.dailyValue || 0) : r.freightMode === "cegonha" || r.freightMode === "caixinha" ? groupReports.length + (groupReports.length === 1 ? " viagem" : " viagens") : `${new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 3, maximumFractionDigits: 3 }).format(Number(r.tons ?? 0))} t`}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-[10px] uppercase tracking-[0.14em] text-subtle">
                        Enviado
                      </dt>
                      <dd className="mt-1 text-sm text-muted">
                        {formatDate(r.createdAt.slice(0, 10))}
                      </dd>
                    </div>
                  </dl>
                  {!entry.special ? <TicketMetadata reportId={r.id} mode={r.freightMode} /> : null}
                {entry.special ? (
                  <div className="mt-4 flex flex-wrap gap-2">
                    <Button onClick={() => void acceptGroup(groupReports)} disabled={acceptMany.isPending}>Aceitar grupo ({groupReports.length})</Button>
                    <Button variant="ghost" onClick={() => void rejectGroup(groupReports)}>Recusar grupo</Button>
                    <Button variant="ghost" className="text-danger" onClick={() => void deleteGroup(groupReports)}>Excluir grupo</Button>
                  </div>
                ) : (
                <div className="mt-4 flex flex-wrap gap-2">
                    <Button onClick={() => {
                      if (r.freightMode) void openReportForClose(r);
                      else { setEditingForClose(true); setEditingReport(r); }
                    }}>{r.freightMode ? "Fechar viagem" : "Definir tipo e fechar"}</Button>
                    <Button variant="secondary" onClick={() => { setEditingForClose(false); setEditingReport(r); }} title={`Editar ${r.ticket}`}>
                      <Pencil className="size-4" /> Editar
                    </Button>
                    <Button
                      variant="ghost"
                      onClick={async () => {
                        await reject.mutateAsync(r.id);
                        toast.success("Lançamento recusado.");
                      }}
                    >
                      Recusar
                    </Button>
                    <Button
                      variant="ghost"
                      className="text-danger"
                      disabled={removeReport.isPending}
                      title={`Excluir ${r.ticket}`}
                      onClick={() => handleDeleteReport(r)}
                    >
                      <Trash2 className="size-4" /> Excluir
                    </Button>
                  </div>
                )}
                </li>
              );
            })}
            </ul>
          </>
        )}
      </section>

      {done.length > 0 ? (
        <section className="mt-10">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-[11px] uppercase tracking-[0.16em] text-muted">
              Histórico
            </h2>
            <p className="text-xs text-subtle">Aceitos e recusados</p>
            <Button size="sm" variant="ghost" className="text-danger" disabled={removeAllTrips.isPending} onClick={async () => {
              if (!window.confirm("Apagar todas as viagens do sistema? Os lançamentos serão devolvidos para pendentes.")) return;
              try { const result = await removeAllTrips.mutateAsync(); setSelected(new Set()); toast.success(String(result.deleted ?? 0) + " viagens apagadas."); } catch (err) { toast.error(err instanceof Error ? err.message : "Não foi possível apagar todas as viagens."); }
            }}><Trash2 className="size-4" /> {removeAllTrips.isPending ? "Apagando..." : "Apagar todas as viagens"}</Button>
          </div>
          <ul className="mt-3 divide-y divide-border rounded-lg border border-border">
            {done.map((r) => {
              const driver = data?.drivers.find((d) => d.id === r.driverId);
              return (
                <li
                  key={r.id}
                  className="flex items-center justify-between gap-3 px-4 py-3"
                >
                  <div>
                    <p className="font-medium">{r.ticket}</p>
                    <p className="text-xs text-muted">
                      {driver?.name} · {r.tons > 0 ? `${new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 3, maximumFractionDigits: 3 }).format(Number(r.tons ?? 0))} t · ` : ""}{r.freightMode ? freightModeLabel(r.freightMode) : "A definir pela Gerência"}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge tone={r.status === "aceito" ? "ok" : "danger"}>
                      {r.status}
                    </Badge>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-danger"
                      disabled={removeReport.isPending}
                      title={`Excluir ${r.ticket}`}
                      onClick={() => handleDeleteReport(r)}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}

      <Dialog open={!!editingReport} onOpenChange={(v) => { if (!v) { setEditingReport(null); setEditingForClose(false); } }}>
        {editingReport && data ? (
          <DialogContent title={`Editar lançamento ${editingReport.ticket}`}>
            <PendingReportEditor
              key={editingReport.id}
              report={editingReport}
              drivers={data.drivers}
              fleets={data.fleets}
              pending={editReport.isPending}
              onCancel={() => setEditingReport(null)}
              onSave={async (payload) => {
                await editReport.mutateAsync(payload);
                const shouldClose = editingForClose;
                const edited = editingReport
                  ? { ...editingReport, driverId: payload.driverId, fleetId: payload.fleetId, tons: payload.tons, dailyValue: payload.dailyValue, freightMode: payload.freightMode }
                  : null;
                toast.success(shouldClose ? "Tipo definido. Complete o fechamento da viagem." : "Lançamento atualizado.");
                setEditingReport(null);
                setEditingForClose(false);
                if (shouldClose && edited) await openReportForClose(edited);
              }}
            />
          </DialogContent>
        ) : null}
      </Dialog>

      <Dialog open={!!open} onOpenChange={(v) => { if (!v) { setOpen(null); setClosingTicketMeta(null); } }}>
        {draft && data ? (
          <DialogContent title={`Fechar ${draft.code}`}>
            {open ? <TicketMetadata reportId={open.id} mode={open.freightMode} /> : null}
            <TripForm
              key={draft.reportId}
              drivers={data.drivers}
              fleets={data.fleets}
              trips={data.trips}
              initial={draft}
              submitLabel="Lançar no painel"
              pending={trip.isPending}
              onSubmit={async (payload) => {
                await trip.mutateAsync(payload);
                toast.success(`Viagem ${payload.code} lançada.`);
                setOpen(null);
              }}
            />
          </DialogContent>
        ) : null}
      </Dialog>
    </div>
  );
}


type PendingTicketMetadata = {
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
};

function TicketMetadata({ reportId, mode }: { reportId: string; mode?: string | null }) {
  const [ticket, setTicket] = useState<PendingTicketMetadata | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/ticket-meta?reportId=" + encodeURIComponent(reportId), {
      credentials: "same-origin",
      cache: "no-store",
      signal: controller.signal,
    })
      .then((response) => response.ok ? response.json() : null)
      .then((result) => { if (!controller.signal.aborted) setTicket(result?.ticket ?? null); })
      .catch(() => {});
    return () => controller.abort();
  }, [reportId]);

  if (!ticket) return null;
  return (
    <div className="mt-4 rounded-lg border border-border bg-bg p-3 text-xs">
      <p className="font-semibold text-fg">Dados captados da foto</p>
      <div className="mt-2 grid gap-1 text-muted sm:grid-cols-2">
        <span>Ticket: <b className="text-fg">{ticket.numeroTicket || "—"}</b></span>
        <span>Veículo: <b className="text-fg">{ticket.placaVeiculo || "—"}</b></span>
        <span>Carreta: <b className="text-fg">{ticket.placaCarreta || "—"}</b></span>
        <span>Transportadora: <b className="text-fg">{ticket.transportadora || "—"}</b></span>
        <span>Operadora: <b className="text-fg">{ticket.operadora || "—"}</b></span>
        <span>Contratante: <b className="text-fg">{ticket.contratante || "—"}</b></span>
        <span>Destinatário: <b className="text-fg">{ticket.destinatario || "—"}</b></span>
        <span>Produto: <b className="text-fg">{ticket.produto || "—"}</b></span>
        <span>Remetente: <b className="text-fg">{ticket.remetente || "—"}</b></span>
        <span>Navio: <b className="text-fg">{ticket.navio || "—"}</b></span>
        <span>Navio origem: <b className="text-fg">{ticket.navioOrigem || "—"}</b></span>
        <span>Navio destino: <b className="text-fg">{ticket.navioDestino || "—"}</b></span>
        <span>Data do ticket: <b className="text-fg">{ticket.dataTicket || "—"}</b></span>
        <span>Horário do ticket: <b className="text-fg">{ticket.horaTicket || "—"}</b></span>
        {mode === "ton" && ticket.pesoLiquidoKg ? (
          <span>Peso líquido: <b className="text-fg">{new Intl.NumberFormat("pt-BR").format(ticket.pesoLiquidoKg)} kg</b></span>
        ) : null}
      </div>
    </div>
  );
}

type PendingReportEditPayload = {
  id: string;
  driverId: string;
  fleetId: string;
  tons: number;
  dailyValue: number;
  freightMode: "ton" | "trip" | "cegonha" | "caixinha";
};

function PendingReportEditor({
  report,
  drivers,
  fleets,
  pending,
  onSave,
  onCancel,
}: {
  report: DriverReport;
  drivers: Array<{ id: string; name: string }>;
  fleets: Array<{ id: string; name: string; trailerPlate: string }>;
  pending: boolean;
  onSave: (payload: PendingReportEditPayload) => Promise<void>;
  onCancel: () => void;
}) {
  const [driverId, setDriverId] = useState(report.driverId);
  const [fleetId, setFleetId] = useState(report.fleetId);
  const [mode, setMode] = useState<"" | PendingReportEditPayload["freightMode"]>(report.freightMode ?? "");
  const [tonsValue, setTonsValue] = useState(report.tons > 0 ? String(report.tons).replace(".", ",") : "");
  const [dailyValue, setDailyValue] = useState(report.dailyValue > 0 ? String(report.dailyValue).replace(".", ",") : "");

  return (
    <form
      className="grid gap-4"
      onSubmit={async (event) => {
        event.preventDefault();
        const tons = mode === "ton" ? parseLocaleNumberOrZero(tonsValue) : 0;
        const daily = mode === "trip" ? parseLocaleNumberOrZero(dailyValue) : 0;
        if (!driverId || !fleetId) return toast.error("Escolha motorista e conjunto.");
        if (!mode) return toast.error("Escolha o tipo da viagem.");
        if (mode === "ton" && tons <= 0) return toast.error("Informe o peso líquido/toneladas.");
        if (mode === "trip" && daily <= 0) return toast.error("Informe o valor da diária.");
        await onSave({ id: report.id, driverId, fleetId, tons, dailyValue: daily, freightMode: mode });
      }}
    >
      <div className="rounded-lg border border-border bg-surface-2 px-4 py-3 text-sm">
        <span className="text-muted">Ticket automático</span>
        <strong className="ml-2 font-display text-lg">{report.ticket}</strong>
      </div>
      <Field label="Motorista">
        <Select value={driverId} onChange={(event) => setDriverId(event.target.value)}>
          {drivers.map((driver) => <option key={driver.id} value={driver.id}>{driver.name}</option>)}
        </Select>
      </Field>
      <Field label="Conjunto">
        <Select value={fleetId} onChange={(event) => setFleetId(event.target.value)}>
          {fleets.map((fleet) => <option key={fleet.id} value={fleet.id}>{fleet.name} · {fleet.trailerPlate}</option>)}
        </Select>
      </Field>
      <Field label="Modo de frete">
        <Select value={mode} onChange={(event) => setMode(event.target.value as "" | PendingReportEditPayload["freightMode"])}>
          <option value="">A definir pela Gerência</option>
          <option value="ton">Por tonelada</option>
          <option value="trip">Diária</option>
          <option value="cegonha">Cegonha</option>
          <option value="caixinha">Caixinha</option>
        </Select>
      </Field>
      {mode === "ton" ? (
        <Field label="Peso líquido / toneladas">
          <Input value={tonsValue} onChange={(event) => setTonsValue(event.target.value)} inputMode="decimal" placeholder="0,000" />
        </Field>
      ) : mode === "trip" ? (
        <Field label="Valor da diária (R$)">
          <Input value={dailyValue} onChange={(event) => setDailyValue(event.target.value)} inputMode="decimal" placeholder="0,00" />
        </Field>
      ) : null}
      <div className="flex flex-wrap justify-end gap-2 pt-2">
        <Button type="button" variant="ghost" onClick={onCancel} disabled={pending}>Cancelar</Button>
        <Button type="submit" disabled={pending}>{pending ? "Salvando..." : "Salvar edição"}</Button>
      </div>
    </form>
  );
}
