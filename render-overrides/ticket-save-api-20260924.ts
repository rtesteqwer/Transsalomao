import { createFileRoute } from "@tanstack/react-router";
import { getSql } from "@/lib/db";
import { ticketAccess } from "@/lib/ticket-auth.server";
import { json, readBody, validateSave, saveTicket, ticketErrorResponse, TicketError } from "@/lib/ticket-core";
import { syncTicketVariableMemory } from "@/lib/ticket-variable-memory.server";

export const Route = createFileRoute("/api/salvar-ticket")({
  server: { handlers: {
    POST: async ({ request }) => {
      try {
        const access = ticketAccess(request);
        const data = validateSave(await readBody(request));
        if (access.driverId && access.driverId !== data.driverId) throw new TicketError(403, "Use o motorista vinculado ao seu login.");
        const sql = await getSql();
        const saved = await saveTicket(sql, data, { createdBy: access.username });
        await syncTicketVariableMemory(sql, saved.reportId);
        return json(saved, 201);
      } catch (error) { return ticketErrorResponse(error); }
    },
  } },
});
