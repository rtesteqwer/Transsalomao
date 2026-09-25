import { createFileRoute } from "@tanstack/react-router";
import { getSql } from "@/lib/db";
import { ticketAccess, allowTicketRead } from "@/lib/ticket-auth.server";
import { json, normalizeFreightMode, readBody, ticketErrorResponse, TicketError } from "@/lib/ticket-core";
import { parseTicketOcr } from "@/lib/ticket-parser";

export const Route = createFileRoute("/api/ler-ticket")({
  server: { handlers: {
    GET: async ({ request }) => {
      try {
        const access = ticketAccess(request);
        return json({
          authenticated: true,
          ...access,
          available: true,
          engine: "ocr-local",
          localOcrOnly: true,
          aiEnabled: false,
        });
      } catch (error) { return ticketErrorResponse(error); }
    },

    POST: async ({ request }) => {
      try {
        const access = ticketAccess(request);
        const body = await readBody(request);
        const freightMode = normalizeFreightMode(body.freightMode);
        const selected = body.selectedFleet as Record<string, unknown> | undefined;
        const fleet = {
          tractorPlate: typeof selected?.tractorPlate === "string" ? selected.tractorPlate.slice(0, 20) : undefined,
          trailerPlate: typeof selected?.trailerPlate === "string" ? selected.trailerPlate.slice(0, 20) : undefined,
        };

        const sql = await getSql();
        if (access.driverId) {
          const drivers = await sql<{ status: string }>`select status from drivers where id=${access.driverId} limit 1`;
          if (drivers[0]?.status !== "ativo") throw new TicketError(403, "Motorista inativo. Consulte a gerência.");
        }
        await allowTicketRead(sql, `${access.role}:${access.username}`);

        if (typeof body.ocrText !== "string" || body.ocrText.trim().length < 8) {
          throw new TicketError(400, "O leitor usa somente OCR local. Leia a foto no aparelho antes de enviar.");
        }

        return json(parseTicketOcr(body.ocrText, freightMode, fleet));
      } catch (error) { return ticketErrorResponse(error); }
    },
  } },
});
