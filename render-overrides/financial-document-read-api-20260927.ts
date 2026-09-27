import { createFileRoute } from "@tanstack/react-router";
import { managementSession } from "@/lib/management-auth.server";
import { financialDocumentErrorResponse, readFinancialDocument } from "@/lib/financial-document-reader.server";

export const Route = createFileRoute("/api/ler-comprovante-financeiro")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (!managementSession()) {
          return Response.json({ ok: false, message: "Entre na Gerência novamente." }, { status: 401 });
        }
        try {
          const body: any = await request.json();
          const kind = body?.kind === "advance" ? "advance" : "expense";
          const reading = await readFinancialDocument({
            fileName: String(body?.fileName || "comprovante"),
            mime: String(body?.mime || ""),
            base64: String(body?.base64 || ""),
            kind,
          });
          return Response.json({
            ok: true,
            amount: reading.amount,
            date: reading.date,
            time: reading.time,
          }, { headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } });
        } catch (error) {
          return financialDocumentErrorResponse(error);
        }
      },
    },
  },
});
