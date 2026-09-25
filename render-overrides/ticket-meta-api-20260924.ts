import { createFileRoute } from "@tanstack/react-router";
import { getSql } from "@/lib/db";
import { managementSession } from "@/lib/management-auth.server";
import { json } from "@/lib/ticket-core";

export const Route = createFileRoute("/api/ticket-meta")({
  server: { handlers: {
    GET: async ({ request }) => {
      if (!managementSession()) return json({ erro: "Não autorizado" }, 401);
      const reportId = new URL(request.url).searchParams.get("reportId")?.trim() || "";
      if (!reportId) return json({ erro: "Lançamento não informado" }, 400);
      const sql = await getSql();
      const rows = await sql<Record<string, unknown>>`
        select numero_ticket, placa_veiculo, placa_carreta, transportadora, destinatario,
               peso_liquido_kg, freight_mode, ticket_data
        from tickets_balanca
        where report_id = ${reportId}
        order by id desc
        limit 1
      `;
      const row = rows[0];
      if (!row) return json({ ok: true, ticket: null });
      return json({
        ok: true,
        ticket: {
          numeroTicket: row.numero_ticket,
          placaVeiculo: row.placa_veiculo,
          placaCarreta: row.placa_carreta,
          transportadora: row.transportadora,
          destinatario: row.destinatario,
          pesoLiquidoKg: row.peso_liquido_kg,
          freightMode: row.freight_mode,
          operadora: (row.ticket_data as Record<string, unknown> | null)?.operadora || null,
          contratante: (row.ticket_data as Record<string, unknown> | null)?.contratante || null,
          dataTicket: (row.ticket_data as Record<string, unknown> | null)?.data_ticket || null,
          horaTicket: (row.ticket_data as Record<string, unknown> | null)?.hora_ticket || null,
        },
      });
    },
  } },
});
