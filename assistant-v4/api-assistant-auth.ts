import { createFileRoute } from "@tanstack/react-router";
import { authenticateAssistantRequest, issueAssistantToken, revokeAssistantToken } from "@/lib/assistant-auth.server";

export const Route = createFileRoute("/api/assistant/auth")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const auth = await authenticateAssistantRequest(request);
        return Response.json(auth ? { ok: true, authenticated: true, username: auth.username, via: auth.via } : { ok: false, authenticated: false }, { status: auth ? 200 : 401, headers: { "Cache-Control": "no-store" } });
      },
      POST: async ({ request }) => {
        let body: any = {};
        try { body = await request.json(); } catch {}
        const action = String(body?.action || "login");
        const deviceLabel = String(body?.deviceLabel || "Android").slice(0, 120);

        if (action === "pair") {
          const auth = await authenticateAssistantRequest(request);
          if (!auth) return Response.json({ ok: false, code: "LOGIN_REQUIRED" }, { status: 401 });
          const issued = await issueAssistantToken(auth.username, deviceLabel);
          return Response.json({ ok: true, username: auth.username, ...issued }, { headers: { "Cache-Control": "no-store" } });
        }

        const username = String(body?.username || "").trim();
        const password = String(body?.password || "");
        if (!username || !password) return Response.json({ ok: false, code: "MISSING_CREDENTIALS" }, { status: 400 });
        const { verifyManagementCredentials } = await import("@/lib/management-auth.server");
        const verified = await verifyManagementCredentials(username, password);
        if (!verified.ok) return Response.json({ ok: false, code: "INVALID_CREDENTIALS" }, { status: 401 });
        const issued = await issueAssistantToken(verified.username, deviceLabel);
        return Response.json({ ok: true, username: verified.username, ...issued }, { headers: { "Cache-Control": "no-store" } });
      },
      DELETE: async ({ request }) => {
        const ok = await revokeAssistantToken(request);
        return Response.json({ ok });
      },
    },
  },
});
