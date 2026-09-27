import { createFileRoute } from "@tanstack/react-router";
import { managementSession } from "@/lib/management-auth.server";
import { getSql } from "@/lib/db";
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
          const reader = body?.reader === "pdf_text" ? "pdf_text" : "ai";
          const reading = await readFinancialDocument({
            fileName: String(body?.fileName || "comprovante"),
            mime: String(body?.mime || ""),
            base64: String(body?.base64 || ""),
            kind,
            reader,
          });
          let suggestedDriverId: string | null = null;
          let suggestedDriverName: string | null = null;
          if (kind === "advance" && (reading.driver_name || reading.source_text)) {
            const sql = await getSql();
            const drivers = await sql`select id,name from drivers where status='ativo' order by name`;
            const rows = Array.isArray(drivers) ? drivers : [];
            const match = reading.driver_name ? matchDriver(reading.driver_name, rows) : null;
            const documentMatch = match ?? matchDriverFromDocument(reading.source_text || "", rows);
            suggestedDriverId = documentMatch?.id ?? null;
            suggestedDriverName = documentMatch?.name ?? null;
          }

          return Response.json({
            ok: true,
            amount: reading.amount,
            date: reading.date,
            time: reading.time,
            driverName: reading.driver_name,
            suggestedDriverId,
            suggestedDriverName,
          }, { headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } });
        } catch (error) {
          return financialDocumentErrorResponse(error);
        }
      },
    },
  },
});


function normalizeName(value: unknown) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("pt-BR")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}


function matchDriverFromDocument(documentText: string, drivers: any[]) {
  const haystack = " " + normalizeName(documentText) + " ";
  if (!haystack.trim()) return null;

  const exact = drivers.filter((row) => {
    const name = normalizeName(row?.name);
    return name.length >= 5 && haystack.includes(" " + name + " ");
  });
  if (exact.length === 1) return exact[0];

  const scored = drivers
    .map((row) => {
      const name = normalizeName(row?.name);
      const tokens = name.split(" ").filter((part) => part.length >= 3);
      if (tokens.length < 2) return { row, score: 0, shared: 0 };
      const shared = tokens.filter((token) => haystack.includes(" " + token + " ")).length;
      const score = shared / tokens.length;
      return { row, score, shared };
    })
    .filter((item) => item.shared >= 2 && item.score >= 0.75)
    .sort((a, b) => b.score - a.score);

  if (!scored.length) return null;
  if (scored.length > 1 && scored[0].score - scored[1].score < 0.2) return null;
  return scored[0].row;
}

function matchDriver(readName: string, drivers: any[]) {
  const wanted = normalizeName(readName);
  if (!wanted) return null;

  const exact = drivers.filter((row) => normalizeName(row?.name) === wanted);
  if (exact.length === 1) return exact[0];

  const contained = drivers.filter((row) => {
    const current = normalizeName(row?.name);
    return wanted.length >= 6 && current.length >= 6 && (wanted.includes(current) || current.includes(wanted));
  });
  if (contained.length === 1) return contained[0];

  const wantedTokens = wanted.split(" ").filter((part) => part.length >= 2);
  const scored = drivers
    .map((row) => {
      const current = normalizeName(row?.name);
      const tokens = current.split(" ").filter((part) => part.length >= 2);
      if (!tokens.length) return { row, score: 0, shared: 0 };
      const shared = tokens.filter((token) => wantedTokens.includes(token)).length;
      const score = shared / tokens.length;
      const edgeBonus =
        tokens.length >= 2 &&
        wantedTokens.length >= 2 &&
        tokens[0] === wantedTokens[0] &&
        tokens[tokens.length - 1] === wantedTokens[wantedTokens.length - 1]
          ? 0.2
          : 0;
      return { row, score: Math.min(1, score + edgeBonus), shared };
    })
    .filter((item) => item.shared >= 2 && item.score >= 0.8)
    .sort((a, b) => b.score - a.score);

  if (!scored.length) return null;
  if (scored.length > 1 && scored[0].score - scored[1].score < 0.15) return null;
  return scored[0].row;
}
