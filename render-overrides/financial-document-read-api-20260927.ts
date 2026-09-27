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
          const reading = await readFinancialDocument({
            fileName: String(body?.fileName || "comprovante"),
            mime: String(body?.mime || ""),
            base64: String(body?.base64 || ""),
            kind,
          });
          let suggestedDriverId: string | null = null;
          let suggestedDriverName: string | null = null;
          if (kind === "advance" && reading.driver_name) {
            const sql = await getSql();
            const drivers = await sql.unsafe("select id,name from drivers where status='ativo' order by name");
            const match = matchDriver(reading.driver_name, Array.isArray(drivers) ? drivers : []);
            suggestedDriverId = match?.id ?? null;
            suggestedDriverName = match?.name ?? null;
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
