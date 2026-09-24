import { createFileRoute } from "@tanstack/react-router";
import { getSql } from "@/lib/db";
import { ticketAccess, allowTicketRead } from "@/lib/ticket-auth.server";
import { json, normalizeFreightMode, readBody, validateImage, ticketErrorResponse, TicketError } from "@/lib/ticket-core";
import {
  readTicketWithSalomaoIA,
  readTicketFromSalomaoOcr,
  SalomaoVisionUnavailable,
} from "@/lib/salomao-ticket-reader.server";

export const Route = createFileRoute("/api/ler-ticket")({
  server: { handlers: {
    GET: async ({ request }) => {
      try {
        const access = ticketAccess(request);
        return json({
          authenticated: true,
          ...access,
          available: true,
          engine: "salomao-ia",
          localOcrFallback: true,
        });
      } catch (error) { return ticketErrorResponse(error); }
    },

    POST: async ({ request }) => {
      try {
        const access = ticketAccess(request);
        const body = await readBody(request);
        const freightMode = normalizeFreightMode(body.freightMode);

        // OCR local do celular volta para a Salomão IA apenas para interpretação.
        if (typeof body.ocrText === "string") {
          const fileName = typeof body.fileName === "string" ? body.fileName.slice(0, 160) : "";
          return json(readTicketFromSalomaoOcr(body.ocrText, freightMode, fileName));
        }

        const image = validateImage(body);
        const sql = await getSql();
        if (access.driverId) {
          const drivers = await sql<{ status: string }>`select status from drivers where id=${access.driverId} limit 1`;
          if (drivers[0]?.status !== "ativo") throw new TicketError(403, "Motorista inativo. Consulte a gerência.");
        }
        await allowTicketRead(sql, `${access.role}:${access.username}`);

        try {
          return json(await readTicketWithSalomaoIA(sql, image, freightMode));
        } catch (error) {
          if (error instanceof SalomaoVisionUnavailable) {
            return json({
              erro: error.message,
              code: "SALOMAO_LOCAL_OCR",
              ocrFallback: true,
            }, 503);
          }
          throw error;
        }
      } catch (error) { return ticketErrorResponse(error); }
    },
  } },
});
