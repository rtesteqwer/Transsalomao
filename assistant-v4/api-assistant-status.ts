import { createFileRoute } from "@tanstack/react-router";
import { getSql } from "@/lib/db";
import { SALOMAO_AI_IDENTITY } from "@/lib/salomao-identity.server";

export const Route = createFileRoute("/api/assistant/status")({
  server: {
    handlers: {
      GET: async () => {
        const env = process.env.OPENAI_API_KEY?.trim();
        let dbConfigured = false;
        if (!env) {
          try {
            const sql = await getSql();
            const rows = await sql<{ ok: boolean }>`
              select exists(
                select 1 from assistant_secrets
                where name='openai_api_key' and length(secret_value) > 20
              ) as ok
            `;
            dbConfigured = !!rows[0]?.ok;
          } catch {}
        }
        return Response.json({
          ok: true,
          aiConfigured: !!env || dbConfigured,
          identity: { id: SALOMAO_AI_IDENTITY.id, name: SALOMAO_AI_IDENTITY.name, organization: SALOMAO_AI_IDENTITY.organization, version: SALOMAO_AI_IDENTITY.version },
          model: process.env.OPENAI_ASSISTANT_MODEL?.trim() || "gpt-5.6-sol",
        }, { headers: { "Cache-Control": "no-store" } });
      },
    },
  },
});
