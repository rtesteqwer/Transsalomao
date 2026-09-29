import { useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, RefreshCw, Trash2, Wrench } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

type FuelingDuplicate = {
  key: string;
  rows: Array<{
    id: string;
    date: string;
    driverName: string | null;
    fleetName: string | null;
    station: string | null;
    liters: number;
    pricePerLiter: number;
    discountAmount: number;
    totalAmount: number;
    photoLinks: number;
  }>;
};

type IntegrityData = {
  checkedAt: string;
  orphanFuelingLinks: Array<{
    id: string;
    fileId: string;
    missingFuelingId: string;
    fileName: string;
    receiptNumber: string | null;
    date: string | null;
  }>;
  duplicateFuelings: FuelingDuplicate[];
  orphanTicketPhotos: Array<{
    id: string;
    relationType: string;
    relationId: string;
    tripCode: string;
    fileName: string;
  }>;
};

export function DataIntegrityPanel({ scope }: { scope: "fueling" | "tickets" }) {
  const [data, setData] = useState<IntegrityData | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState("");

  async function refresh() {
    setLoading(true);
    try {
      const response = await fetch("/api/integridade-dados", {
        credentials: "same-origin",
        cache: "no-store",
        headers: { Accept: "application/json" },
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload?.ok) throw new Error(payload?.message || "Não foi possível verificar os dados.");
      setData(payload as IntegrityData);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível verificar os dados.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refresh();
  }, []);

  async function action(body: Record<string, unknown>, key: string) {
    setBusy(key);
    try {
      const response = await fetch("/api/integridade-dados", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(body),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload?.ok) throw new Error(payload?.message || "A correção não foi concluída.");
      toast.success(payload?.message || "Dados corrigidos.");
      await refresh();
      window.dispatchEvent(new Event("focus"));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "A correção não foi concluída.");
    } finally {
      setBusy("");
    }
  }

  const orphanFueling = data?.orphanFuelingLinks.length ?? 0;
  const duplicates = data?.duplicateFuelings.length ?? 0;
  const orphanTickets = data?.orphanTicketPhotos.length ?? 0;
  const hasIssue = scope === "fueling" ? orphanFueling > 0 || duplicates > 0 : orphanTickets > 0;

  return (
    <section className="mt-6 rounded-xl border border-border bg-surface p-4 sm:p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            {hasIssue ? <AlertTriangle className="size-5 text-warning" /> : <CheckCircle2 className="size-5 text-success" />}
            <h2 className="font-display text-xl font-semibold">Integridade dos lançamentos</h2>
          </div>
          <p className="mt-1 max-w-3xl text-sm text-muted">
            Confere o que realmente existe no banco. Nada duplicado é apagado automaticamente: você vê os candidatos e confirma antes.
          </p>
        </div>
        <Button type="button" size="sm" variant="secondary" disabled={loading || !!busy} onClick={() => void refresh()}>
          <RefreshCw className={"size-4 " + (loading ? "animate-spin" : "")} />
          {loading ? "Conferindo…" : "Conferir agora"}
        </Button>
      </div>

      {scope === "fueling" ? (
        <div className="mt-4 grid gap-4">
          <div className="rounded-lg border border-border bg-bg p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <strong>Tickets de abastecimento com vínculo antigo</strong>
                <p className="mt-1 text-xs text-muted">
                  {orphanFueling
                    ? orphanFueling + " foto(s) ainda apontavam para abastecimentos que já foram apagados."
                    : "Nenhum ticket órfão encontrado."}
                </p>
              </div>
              {orphanFueling > 0 ? (
                <Button
                  type="button"
                  size="sm"
                  disabled={!!busy}
                  onClick={() => {
                    if (!window.confirm("Liberar estes vínculos antigos? As fotos não serão apagadas; elas ficarão disponíveis para relançamento.")) return;
                    void action({ action: "release_orphan_fueling_links" }, "orphan-fueling");
                  }}
                >
                  <Wrench className="size-4" />
                  {busy === "orphan-fueling" ? "Corrigindo…" : "Liberar para relançar"}
                </Button>
              ) : null}
            </div>
          </div>

          <div className="rounded-lg border border-border bg-bg p-4">
            <strong>Possíveis abastecimentos duplicados</strong>
            <p className="mt-1 text-xs text-muted">
              São mostrados somente grupos com mesma data, motorista, conjunto, litros, preço/L e total final.
            </p>

            {duplicates === 0 ? (
              <p className="mt-3 text-sm text-muted">Nenhuma duplicata exata encontrada.</p>
            ) : (
              <div className="mt-3 grid gap-3">
                {(data?.duplicateFuelings ?? []).map((group, groupIndex) => {
                  const keep = group.rows[0];
                  return (
                    <div key={group.key} className="rounded-lg border border-border p-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="text-sm">
                          <strong>{keep.date} · {keep.driverName || "Sem motorista"} · {keep.fleetName || "Sem conjunto"}</strong>
                          <p className="mt-1 text-xs text-muted">
                            {formatNumber(keep.liters, 3)} L · R$ {formatNumber(keep.pricePerLiter, 3)}/L · total R$ {formatNumber(keep.totalAmount, 2)}
                          </p>
                        </div>
                        <span className="rounded-full border border-border px-2 py-1 text-xs">{group.rows.length} registros</span>
                      </div>

                      <div className="mt-3 grid gap-2">
                        {group.rows.map((row, index) => (
                          <div key={row.id} className="flex flex-col gap-2 rounded-md bg-surface px-3 py-2 sm:flex-row sm:items-center sm:justify-between">
                            <div className="min-w-0 text-xs">
                              <b>{index === 0 ? "Manter" : "Duplicata"}</b>
                              {" · "}{row.station || "Posto não informado"}
                              {" · "}{row.photoLinks} foto(s) vinculada(s)
                              <div className="mt-1 truncate text-[10px] text-subtle">ID {row.id}</div>
                            </div>
                            {index > 0 ? (
                              <Button
                                type="button"
                                size="sm"
                                variant="ghost"
                                className="text-danger"
                                disabled={!!busy}
                                onClick={() => {
                                  if (!window.confirm("Confirmar que estes dois registros são o mesmo abastecimento? Será mantido somente um e as fotos serão preservadas no registro mantido.")) return;
                                  void action(
                                    { action: "delete_duplicate_fueling", keepId: keep.id, deleteId: row.id },
                                    "dup-" + groupIndex + "-" + row.id,
                                  );
                                }}
                              >
                                <Trash2 className="size-4" />
                                {busy === "dup-" + groupIndex + "-" + row.id ? "Apagando…" : "Apagar duplicata"}
                              </Button>
                            ) : null}
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="mt-4 rounded-lg border border-border bg-bg p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <strong>Fotos ligadas a viagens/lançamentos apagados</strong>
              <p className="mt-1 text-xs text-muted">
                {orphanTickets
                  ? orphanTickets + " foto(s) estão ligadas a registros que já não existem."
                  : "Nenhuma foto com vínculo quebrado encontrada."}
              </p>
            </div>
            {orphanTickets > 0 ? (
              <Button
                type="button"
                size="sm"
                disabled={!!busy}
                onClick={() => {
                  if (!window.confirm("Liberar os vínculos quebrados? As fotos serão preservadas e poderão ser relacionadas novamente ou excluídas normalmente.")) return;
                  void action({ action: "unlink_orphan_ticket_photos" }, "orphan-tickets");
                }}
              >
                <Wrench className="size-4" />
                {busy === "orphan-tickets" ? "Corrigindo…" : "Liberar vínculos"}
              </Button>
            ) : null}
          </div>
          {orphanTickets > 0 ? (
            <div className="mt-3 grid gap-1 text-xs text-muted">
              {(data?.orphanTicketPhotos ?? []).slice(0, 12).map((photo) => (
                <div key={photo.id}>{photo.tripCode || photo.relationId} · {photo.fileName}</div>
              ))}
              {orphanTickets > 12 ? <div>+ {orphanTickets - 12} outro(s)</div> : null}
            </div>
          ) : null}
        </div>
      )}
    </section>
  );
}

function formatNumber(value: number, digits: number) {
  return new Intl.NumberFormat("pt-BR", { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(Number(value || 0));
}
