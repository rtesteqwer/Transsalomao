import { createFileRoute } from "@tanstack/react-router";
import { getSql } from "@/lib/db";
import { ticketAccess } from "@/lib/ticket-auth.server";
import { json, readBody, validateSave, saveTicket, ticketErrorResponse, TicketError } from "@/lib/ticket-core";

export const Route = createFileRoute("/api/salvar-ticket")({
  server: { handlers: {
    POST: async ({ request }) => {
      try {
        const access = ticketAccess(request);
        const data = validateSave(await readBody(request, 32_000));
        if (access.driverId && access.driverId !== data.driverId) throw new TicketError(403, "Use o motorista vinculado ao seu login.");
        return json(await saveTicket(await getSql(), data), 201);
      } catch (error) { return ticketErrorResponse(error); }
    },
  } },
});
