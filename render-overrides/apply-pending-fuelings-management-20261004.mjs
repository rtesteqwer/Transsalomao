import fs from "node:fs";
import path from "node:path";

const target = path.resolve(process.argv[2] || "");
if (!process.argv[2] || !fs.existsSync(path.join(target, "src"))) {
  throw new Error("pending-fuelings-management: expected reconstructed application directory");
}

const read = (rel) => fs.readFileSync(path.join(target, rel), "utf8");
const write = (rel, value) => fs.writeFileSync(path.join(target, rel), value);
const rep = (s, before, after, label) => {
  if (s.includes(after)) return s;
  if (!s.includes(before)) throw new Error("pending-fuelings-management: pattern not found (" + label + ")");
  return s.replace(before, after);
};

// API: carregar TODOS os pendentes e permitir excluir somente um pendente sem abastecimento confirmado.
{
  const rel = "src/routes/api/salvar-abastecimento-foto.ts";
  let s = read(rel);

  s = rep(
    s,
    `            order by r.created_at desc
            limit 25
          `;`,
    `            order by r.created_at desc
          `;`,
    "list every pending fueling",
  );

  s = rep(
    s,
    `      POST: async ({ request }) => {`,
    `      DELETE: async ({ request }) => {
        if (!managementSession() && !(await authenticateAssistantRequest(request))) {
          return Response.json({ ok: false, message: "Entre na Gerência ou na Trans Salomão IA novamente." }, { status: 401 });
        }
        try {
          const url = new URL(request.url);
          const fileId = String(url.searchParams.get("fileId") || "").trim();
          if (!fileId) throw new FuelingPhotoError(400, "Lançamento pendente inválido.");

          const sql = await getSql();
          await ensureFuelingPhotoTables(sql);
          const current = await sql\`
            select r.file_id,r.status,r.fueling_id
            from fueling_photo_reads r
            where r.file_id=\${fileId}
            limit 1
          \`;
          if (!current[0]) {
            return Response.json({ ok: true, removed: false, message: "O lançamento pendente já não existe." }, { headers: { "Cache-Control": "no-store" } });
          }
          if (String(current[0].status || "") !== "pending_completion" || current[0].fueling_id) {
            throw new FuelingPhotoError(409, "Este item já deixou de ser pendente e não pode ser apagado por esta opção.");
          }

          await sql\`delete from fueling_photo_reads where file_id=\${fileId} and status='pending_completion' and fueling_id is null\`;
          await sql\`
            delete from fueling_photo_files f
            where f.id=\${fileId}
              and not exists (select 1 from fueling_photo_reads r where r.file_id=f.id)
          \`;

          return Response.json({
            ok: true,
            removed: true,
            fileId,
            message: "Lançamento pendente excluído.",
          }, { headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } });
        } catch (error) {
          return fuelingPhotoErrorResponse(error);
        }
      },
      POST: async ({ request }) => {`,
    "delete pending fueling API",
  );

  s = rep(
    s,
    `              fuelingId: null,
              driverId: driver?.id ?? null,`,
    `              fuelingId: null,
              fileId,
              driverId: driver?.id ?? null,`,
    "return pending file id",
  );

  write(rel, s);
}

// UI: ícones explícitos de editar/excluir para pendentes e atualização imediata da lista.
{
  const rel = "src/components/fueling-photo-reader.tsx";
  let s = read(rel);

  s = rep(
    s,
    'import { AlertTriangle, Camera, CheckCircle2, Fuel, LoaderCircle, Trash2, Upload } from "lucide-react";',
    'import { AlertTriangle, Camera, CheckCircle2, Fuel, LoaderCircle, Pencil, Trash2, Upload } from "lucide-react";',
    "pending edit icon",
  );

  s = rep(
    s,
    '  fuelingId?: string | null;\n  saving?: boolean;',
    '  fuelingId?: string | null;\n  pendingFileId?: string | null;\n  removingPending?: boolean;\n  saving?: boolean;',
    "pending metadata",
  );

  s = rep(
    s,
    `          originalFileHash: row.originalFileHash ? String(row.originalFileHash) : undefined,
          pending: true,`,
    `          originalFileHash: row.originalFileHash ? String(row.originalFileHash) : undefined,
          pendingFileId: row.id ? String(row.id) : null,
          pending: true,`,
    "capture pending file id",
  );

  s = rep(
    s,
    `              saved: true,
              fuelingId: payload?.fuelingId ? String(payload.fuelingId) : null,
              pending: Boolean(payload?.pending),`,
    `              saved: true,
              fuelingId: payload?.fuelingId ? String(payload.fuelingId) : null,
              pendingFileId: payload?.pending
                ? (payload?.fileId ? String(payload.fileId) : row.pendingFileId || null)
                : null,
              pending: Boolean(payload?.pending),`,
    "retain pending file id after save",
  );

  s = rep(
    s,
    `  async function removeSavedItem(item: ReadItem) {`,
    `  function editPendingItem(item: ReadItem) {
    if (!item.pending) return;
    setItems((current) => current.map((row) =>
      row.id === item.id
        ? {
            ...row,
            saved: false,
            message: "Edite os campos abaixo e clique em Completar lançamento.",
          }
        : row
    ));
  }

  async function removePendingItem(item: ReadItem) {
    if (!item.pending || !item.pendingFileId || item.removingPending) return;
    if (!window.confirm("Excluir este abastecimento pendente? A foto e o pendente serão removidos.")) return;

    setItems((current) => current.map((row) =>
      row.id === item.id ? { ...row, removingPending: true } : row
    ));
    try {
      const response = await fetch("/api/salvar-abastecimento-foto?fileId=" + encodeURIComponent(item.pendingFileId), {
        method: "DELETE",
        credentials: "same-origin",
        headers: { "Accept": "application/json" },
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload?.message || "Não foi possível excluir o lançamento pendente.");
      setItems((current) => current.filter((row) => row.id !== item.id));
      setProgress("Lançamento pendente excluído.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Não foi possível excluir o lançamento pendente.";
      setItems((current) => current.map((row) =>
        row.id === item.id ? { ...row, removingPending: false, message } : row
      ));
      setErrors((current) => [...current, item.fileName + ": " + message]);
    }
  }

  async function removeSavedItem(item: ReadItem) {`,
    "pending edit delete actions",
  );

  s = rep(
    s,
    `              onRemove={() => void removeSavedItem(item)}
              removing={removingId === item.id}
            />`,
    `              onRemove={() => void removeSavedItem(item)}
              removing={removingId === item.id}
              onEditPending={() => editPendingItem(item)}
              onRemovePending={() => void removePendingItem(item)}
            />`,
    "pass pending actions",
  );

  s = rep(
    s,
    `  onRemove,
  removing,
}: {
  item: ReadItem;
  onChange: (patch: Partial<FuelingReading>) => void;
  onSave: () => void;
  onRemove: () => void;
  removing: boolean;
}) {`,
    `  onRemove,
  removing,
  onEditPending,
  onRemovePending,
}: {
  item: ReadItem;
  onChange: (patch: Partial<FuelingReading>) => void;
  onSave: () => void;
  onRemove: () => void;
  removing: boolean;
  onEditPending: () => void;
  onRemovePending: () => void;
}) {`,
    "pending card props",
  );

  s = rep(
    s,
    `        {item.saved && item.fuelingId ? (
          <Button`,
    `        {item.pending && item.pendingFileId ? (
          <>
            <Button
              type="button"
              variant="secondary"
              onClick={onEditPending}
              disabled={item.removingPending}
              title="Editar abastecimento pendente"
              aria-label="Editar abastecimento pendente"
            >
              <Pencil className="size-4" />
              Editar pendente
            </Button>
            <Button
              type="button"
              variant="ghost"
              className="text-danger"
              onClick={onRemovePending}
              disabled={item.removingPending}
              title="Excluir abastecimento pendente"
              aria-label="Excluir abastecimento pendente"
            >
              {item.removingPending ? <LoaderCircle className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
              {item.removingPending ? "Excluindo…" : "Excluir pendente"}
            </Button>
          </>
        ) : null}
        {item.saved && item.fuelingId ? (
          <Button`,
    "pending buttons",
  );

  write(rel, s);
}

console.log("[pending-fuelings-management] all pending fuelings shown with edit and delete controls");
