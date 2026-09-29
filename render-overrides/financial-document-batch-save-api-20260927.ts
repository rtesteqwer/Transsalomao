import { createFileRoute } from "@tanstack/react-router";
import { managementSession } from "@/lib/management-auth.server";
import { authenticateAssistantRequest } from "@/lib/assistant-auth.server";
import { getSql } from "@/lib/db";

type BatchItem = {
  fileName?: unknown;
  amount?: unknown;
  date?: unknown;
  time?: unknown;
  driverId?: unknown;
  sourceArchive?: unknown;
};

export const Route = createFileRoute("/api/lancar-adiantamentos-pdf-lote")({
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
            return Response.json({ ok: false, message: "Selecione pelo menos um comprovante." }, { status: 400 });
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
            const driverId = String(item.driverId || "").trim();
            const sourceArchive = cleanFileName(item.sourceArchive || "");

            if (!amount || !date || !time || !driverId) {
              failed.push({
                index,
                fileName,
                message: !driverId
                  ? "Motorista não identificado. Confira o recebedor antes de lançar."
                  : "Valor, data ou hora não identificados neste comprovante.",
              });
              continue;
            }

            const driverRows = await sql`
              select id, name
              from drivers
              where id = ${driverId}
                and status = 'ativo'
              limit 1
            `;
            const driver = Array.isArray(driverRows) ? driverRows[0] : null;
            if (!driver) {
              failed.push({ index, fileName, message: "Motorista cadastrado não encontrado ou inativo." });
              continue;
            }

            const duplicates = await sql`
              select id
              from expenses
              where category = 'Adiantamento'
                and driver_id = ${driverId}
                and date = ${date}
                and amount = ${amount}
                and coalesce(transaction_time, '') = coalesce(${time}, '')
              limit 1
            `;
            if (Array.isArray(duplicates) && duplicates.length) {
              skipped.push({ index, fileName, driverName: driver.name, reason: "duplicado" });
              continue;
            }

            const id = crypto.randomUUID();
            const description = "Adiantamento via PIX";
            const notes = sourceArchive
              ? "Importado do PDF: " + fileName + " · ZIP: " + sourceArchive
              : fileName ? "Importado do PDF: " + fileName : "Importado de comprovante PDF";

            await sql`
              insert into expenses (
                id, date, transaction_time, fleet_id, asset_type, driver_id,
                category, description, amount, notes
              )
              values (
                ${id}, ${date}, ${time}, ${null}, ${null}, ${driverId},
                'Adiantamento', ${description}, ${amount}, ${notes}
              )
            `;

            created.push({
              index,
              id,
              fileName,
              driverId,
              driverName: driver.name,
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
              " adiantamento(s) lançado(s), " +
              skipped.length +
              " duplicado(s) ignorado(s) e " +
              failed.length +
              " pendente(s).",
          }, { headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } });
        } catch (error) {
          console.error("[financial-document-batch-save]", error);
          return Response.json({
            ok: false,
            message: error instanceof Error ? error.message : "Falha ao lançar os adiantamentos selecionados.",
          }, { status: 500 });
        }
      },
    },
  },
});

function cleanFileName(value: unknown) {
  return String(value || "comprovante.pdf")
    .replace(/[\r\n\t]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 160);
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
