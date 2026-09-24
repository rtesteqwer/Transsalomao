import { createFileRoute } from "@tanstack/react-router";
import { getSql } from "@/lib/db";

export const Route = createFileRoute("/api/salvar-ticket")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (!authorizedRequest(request)) {
          return json({ erro: "Não autorizado" }, 401);
        }

        let d: any = {};
        try {
          d = await request.json();
        } catch {
          return json({ erro: "Dados inválidos" }, 400);
        }

        const numeroTicket = String(d?.numero_ticket || "").trim();
        const pesoLiquidoKg = integerValue(d?.peso_liquido_kg);
        const driverId = String(d?.driverId || "").trim();
        const fleetId = String(d?.fleetId || "").trim();
        if (!numeroTicket || !pesoLiquidoKg) {
          return json({ erro: "Faltam número do ticket e/ou peso líquido" }, 400);
        }
        if (!driverId || !fleetId) {
          return json({ erro: "Escolha motorista e conjunto antes de lançar." }, 400);
        }

        const sql = await getSql();
        const [drivers, fleets] = await Promise.all([
          sql<any[]>`select id,status from drivers where id=${driverId} limit 1`,
          sql<any[]>`select id,status from fleets where id=${fleetId} limit 1`,
        ]);
        if (!drivers[0] || drivers[0].status !== "ativo") return json({ erro: "Motorista inválido ou inativo." }, 400);
        if (!fleets[0] || fleets[0].status !== "ativo") return json({ erro: "Conjunto inválido ou inativo." }, 400);

        const duplicate = await sql<any[]>`
          select numero_ticket as code from tickets_balanca where numero_ticket=${numeroTicket}
          union all
          select ticket as code from reports where ticket=${numeroTicket} and status <> 'recusado'
          union all
          select code from trips where code=${numeroTicket}
          limit 1
        `;
        if (duplicate[0]) {
          return json({ erro: `Ticket ${numeroTicket} já foi lançado` }, 409);
        }

        const reportId = newId("rep");
        const tons = pesoLiquidoKg / 1000;
        const km = Math.max(0, integerValue(d?.km_carreta) || 0);
        const ticketRows = await sql<any[]>`
          insert into tickets_balanca (
            numero_ticket, placa_veiculo, placa_carreta, produto,
            pesagem_inicial_kg, pesagem_final_kg, peso_liquido_kg,
            data_pesagem, numero_nf, transportadora, motorista, km_carreta,
            driver_id, fleet_id, report_id
          ) values (
            ${numeroTicket}, ${textValue(d?.placa_veiculo)}, ${textValue(d?.placa_carreta)}, ${textValue(d?.produto)},
            ${nullableInteger(d?.pesagem_inicial_kg)}, ${nullableInteger(d?.pesagem_final_kg)}, ${pesoLiquidoKg},
            ${textValue(d?.pesagem_final_data || d?.pesagem_inicial_data)}, ${textValue(d?.numero_nf)},
            ${textValue(d?.transportadora)}, ${textValue(d?.motorista)}, ${km},
            ${driverId}, ${fleetId}, ${reportId}
          )
          on conflict (numero_ticket) do nothing
          returning id
        `;

        if (!ticketRows[0]) {
          return json({ erro: `Ticket ${numeroTicket} já foi lançado` }, 409);
        }

        try {
          await sql`
            insert into reports (id, ticket, driver_id, fleet_id, km, tons, daily_value, freight_mode, status)
            values (${reportId}, ${numeroTicket}, ${driverId}, ${fleetId}, ${km}, ${tons}, 0, 'ton', 'pendente')
          `;
        } catch (error) {
          await sql`delete from tickets_balanca where id=${ticketRows[0].id} and report_id=${reportId}`;
          throw error;
        }

        return json({ ok: true, id: ticketRows[0].id, reportId, ticket: numeroTicket, tons }, 201);
      },
    },
  },
});

function authorizedRequest(request: Request) {
  const expected = process.env.TICKET_TOKEN?.trim() || "";
  const supplied = request.headers.get("x-app-token")?.trim() || "";
  if (expected && supplied && supplied === expected) return true;

  const fetchSite = request.headers.get("sec-fetch-site");
  if (fetchSite === "same-origin" || fetchSite === "same-site") return true;

  const origin = request.headers.get("origin");
  if (!origin) return false;
  try {
    return new URL(origin).origin === new URL(request.url).origin;
  } catch {
    return false;
  }
}

function integerValue(value: unknown) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.round(n) : 0;
}

function nullableInteger(value: unknown) {
  if (value == null || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? Math.round(n) : null;
}

function textValue(value: unknown) {
  const s = String(value ?? "").trim();
  return s || null;
}

function newId(prefix: string) {
  return `${prefix}_${crypto.randomUUID().replace(/-/g, "").slice(0, 10)}`;
}

function json(value: unknown, status = 200) {
  return Response.json(value, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
