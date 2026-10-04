import { createFileRoute } from "@tanstack/react-router";
import { managementSession } from "@/lib/management-auth.server";
import { authenticateAssistantRequest } from "@/lib/assistant-auth.server";
import { getSql } from "@/lib/db";

type BatchItem = {
  fileName?: unknown;
  amount?: unknown;
  date?: unknown;
  time?: unknown;
  sourceArchive?: unknown;
};

export const Route = createFileRoute("/api/lancar-despesas-comprovantes-lote")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (!managementSession() && !(await authenticateAssistantRequest(request))) {
          return Response.json({ ok: false, message: "Entre na Gerência ou na Trans Salomão IA novamente." }, { status: 401 });
        }

        try {
          const body: any = await request.json();
          const items = Array.isArray(body?.items) ? body.items.slice(0, 100) : [];
          if (!items.length) {
            return Response.json({ ok: false, message: "Selecione pelo menos uma despesa." }, { status: 400 });
          }

          const sql = await getSql();
          const created: any[] = [];
          const skipped: any[] = [];
          const failed: any[] = [];

          for (let index = 0; index < items.length; index += 1) {
            const item: BatchItem = items[index] || {};
            const fileName = cleanFileName(item.fileName);
            const amount = parseAmount(item.amount);
            const date = parseDate(item.date);
            const time = parseTime(item.time);
            const sourceArchive = cleanFileName(item.sourceArchive || "");

            if (!amount || !date) {
              failed.push({
                index,
                fileName,
                message: "Valor ou data não identificados neste comprovante.",
              });
              continue;
            }

            const description = makeDescription(fileName);
            const notes = sourceArchive
              ? "Importado do comprovante: " + fileName + " · ZIP: " + sourceArchive
              : fileName ? "Importado do comprovante: " + fileName : "Importado de comprovante";

            const duplicates = await sql`
              select id
              from expenses
              where category = 'Despesa'
                and date = ${date}
                and amount = ${amount}
                and coalesce(transaction_time, '') = coalesce(${time}, '')
                and coalesce(notes, '') = ${notes}
              limit 1
            `;

            if (Array.isArray(duplicates) && duplicates.length) {
              skipped.push({ index, fileName, reason: "duplicado" });
              continue;
            }

            const id = crypto.randomUUID();
            await sql`
              insert into expenses (
                id, date, transaction_time, fleet_id, asset_type, driver_id,
                category, description, amount, notes
              )
              values (
                ${id}, ${date}, ${time}, ${null}, ${null}, ${null},
                'Despesa', ${description}, ${amount}, ${notes}
              )
            `;

            created.push({
              index,
              id,
              fileName,
              amount,
              date,
              time,
            });
          }

          return Response.json({
            ok: true,
            created,
            skipped,
            failed,
            message:
              created.length +
              " despesa(s) lançada(s), " +
              skipped.length +
              " duplicada(s) ignorada(s) e " +
              failed.length +
              " pendente(s).",
          }, { headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } });
        } catch (error) {
          console.error("[financial-expense-batch-save]", error);
          return Response.json({
            ok: false,
            message: error instanceof Error ? error.message : "Falha ao lançar as despesas selecionadas.",
          }, { status: 500 });
        }
      },
    },
  },
});

function cleanFileName(value: unknown) {
  return String(value || "comprovante")
    .replace(/[\r\n\t]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 160);
}

function makeDescription(fileName: string) {
  const base = String(fileName || "")
    .replace(/^.*[\\/]/, "")
    .replace(/\.(?:pdf|jpe?g|png|webp)$/i, "")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return base ? ("Despesa importada · " + base).slice(0, 180) : "Despesa importada de comprovante";
}

function parseAmount(value: unknown) {
  let raw = String(value ?? "").trim().replace(/^R\$/i, "").replace(/\s+/g, "");
  if (/^\d{1,3}(?:\.\d{3})+,\d{2}$/.test(raw)) raw = raw.replace(/\./g, "").replace(",", ".");
  else if (/^\d+,\d{2}$/.test(raw)) raw = raw.replace(",", ".");
  raw = raw.replace(/,/g, "");
  if (!/^\d+(?:\.\d+)?$/.test(raw)) return null;
  const number = Number(raw);
  return Number.isFinite(number) && number > 0 && number <= 100000000 ? number : null;
}

function parseDate(value: unknown) {
  const raw = String(value || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null;
  const date = new Date(raw + "T12:00:00Z");
  return Number.isNaN(date.getTime()) ? null : raw;
}

function parseTime(value: unknown) {
  const raw = String(value || "").trim();
  if (!raw) return null;
  const match = raw.match(/^([01]\d|2[0-3]):([0-5]\d)(?::[0-5]\d)?$/);
  return match ? match[1] + ":" + match[2] : null;
}
