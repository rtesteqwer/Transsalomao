import { createFileRoute } from "@tanstack/react-router";
import { felipeIaConfigured } from "@/lib/salomao-ai.server";

export const Route = createFileRoute("/api/assistant/status")({
  server: {
    handlers: {
      GET: async () => {
        const configured = felipeIaConfigured();
        return Response.json({
          ok: true,
          aiConfigured: configured,
          model: configured ? "Felipe IA Cloud" : "Modo local",
          provider: configured ? "felipe-ia-cloud" : "trans-salomao-local",
        }, { headers: { "Cache-Control": "no-store" } });
      },
    },
  },
});
