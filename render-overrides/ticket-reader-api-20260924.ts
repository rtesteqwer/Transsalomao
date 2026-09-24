import { createFileRoute } from "@tanstack/react-router";
import { getSql } from "@/lib/db";
import { ticketAccess, allowTicketRead } from "@/lib/ticket-auth.server";
import { json, normalizeFreightMode, readBody, validateImage, ticketErrorResponse, TicketError } from "@/lib/ticket-core";
import { readWithProvider, ticketProvider } from "@/lib/ticket-provider.server";

export const Route = createFileRoute("/api/ler-ticket")({
  server: { handlers: {
    GET: async ({ request }) => {
      try {
        const access = ticketAccess(request);
        return json({ authenticated: true, ...access, available: !!ticketProvider() });
      } catch (error) { return ticketErrorResponse(error); }
    },
    POST: async ({ request }) => {
      try {
        const access = ticketAccess(request);
        const body = await readBody(request);
        const image = validateImage(body);
        const freightMode = normalizeFreightMode(body.freightMode);
        if (!ticketProvider()) throw new TicketError(503, "A leitura por foto ainda precisa ser configurada pela gerência.");
        const sql = await getSql();
        if (access.driverId) {
          const drivers = await sql<{ status: string }>`select status from drivers where id=${access.driverId} limit 1`;
          if (drivers[0]?.status !== "ativo") throw new TicketError(403, "Motorista inativo. Consulte a gerência.");
        }
        await allowTicketRead(sql, `${access.role}:${access.username}`);
        return json(await readWithProvider(image, freightMode));
      } catch (error) { return ticketErrorResponse(error); }
    },
  } },
});
