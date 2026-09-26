import { createFileRoute } from "@tanstack/react-router";
import { getSql } from "@/lib/db";
import { managementSession } from "@/lib/management-auth.server";
import { json } from "@/lib/ticket-core";

type Row = Record<string, any>;

export const Route = createFileRoute("/api/ticket-meta")({
  server: { handlers: {
    GET: async ({ request }) => {
      if (!managementSession()) return json({ erro: "Não autorizado" }, 401);
      const reportId = new URL(request.url).searchParams.get("reportId")?.trim() || "";
      if (!reportId) return json({ erro: "Lançamento não informado" }, 400);
      const sql = await getSql();

      const rows = await sql<Row>`
        select tb.id, tb.numero_ticket, tb.placa_veiculo, tb.placa_carreta, tb.transportadora,
               tb.destinatario, tb.peso_liquido_kg, tb.freight_mode, tb.ticket_data,
               tb.driver_id, tb.fleet_id, r.tons, r.created_at
        from tickets_balanca tb
        left join reports r on r.id=tb.report_id
        where tb.report_id=${reportId}
        order by tb.id desc
        limit 1
      `;
      const row = rows[0];
      if (!row) return json({ ok: true, ticket: null });

      const td = (row.ticket_data && typeof row.ticket_data === "object") ? row.ticket_data as Row : {};
      const explicit = positive(td.price_per_ton);
      const routePrice = positive(td.route_price_per_ton);
      let suggestedPrice = explicit || routePrice || null;
      let inferenceConfidence = explicit ? 1 : routePrice ? Math.max(0.9, Number(td.route_confidence ?? 0.9)) : null;
      let inferenceBasis = explicit ? "preço já gravado no ticket" : routePrice ? "preço da rota identificada" : null;
      let inferenceSupport = explicit || routePrice ? 1 : 0;

      const probableTon =
        String(row.freight_mode || "") === "ton" ||
        String(td.inferred_freight_mode || "") === "ton" ||
        Number(row.tons || 0) > 0 ||
        Number(row.peso_liquido_kg || 0) > 0;

      if (!suggestedPrice && probableTon) {
        const inferred = await inferHistoricalTonPrice(sql, row, td);
        if (inferred) {
          suggestedPrice = inferred.price;
          inferenceConfidence = inferred.confidence;
          inferenceBasis = inferred.basis;
          inferenceSupport = inferred.support;

          // Para os lançamentos pendentes antigos, aprende automaticamente apenas
          // quando o histórico realmente converge. Isso permite que o fechamento
          // em lote use o preço sem pedir nova digitação.
          if (inferred.confidence >= 0.88) {
            await sql`
              update tickets_balanca
              set ticket_data=coalesce(ticket_data,'{}'::jsonb) || jsonb_build_object(
                'price_per_ton', ${inferred.price},
                'price_inference_confidence', ${inferred.confidence},
                'price_inference_basis', ${inferred.basis},
                'price_inference_support', ${inferred.support}
              )
              where id=${row.id}
            `;
          }
        }
      }

      return json({
        ok: true,
        ticket: {
          numeroTicket: row.numero_ticket,
          placaVeiculo: row.placa_veiculo,
          placaCarreta: row.placa_carreta,
          transportadora: row.transportadora,
          destinatario: row.destinatario,
          pesoLiquidoKg: row.peso_liquido_kg,
          freightMode: row.freight_mode || (probableTon ? "ton" : null),
          pricePerTon: explicit,
          suggestedPricePerTon: suggestedPrice,
          priceInferenceConfidence: inferenceConfidence,
          priceInferenceBasis: inferenceBasis,
          priceInferenceSupport: inferenceSupport,
          operadora: td.operadora || null,
          contratante: td.contratante || null,
          cliente: td.cliente || null,
          produto: td.produto || null,
          remetente: td.remetente || null,
          navio: td.navio || null,
          navioOrigem: td.navio_origem || null,
          navioDestino: td.navio_destino || null,
          empresaDocumento: td.empresa_documento || null,
          dataTicket: td.data_ticket || null,
          horaTicket: td.hora_ticket || null,
          modelType: td.model_type || null,
          routeGroup: td.route_group || null,
          routeOrigin: td.route_origin || null,
          routeDestination: td.route_destination || null,
          routePricePerTon: routePrice,
          routeConfidence: td.route_confidence ?? null,
        },
      });
    },
  } },
});

function positive(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 && number <= 100_000_000 ? number : null;
}

function norm(value: unknown) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("pt-BR")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function same(a: unknown, b: unknown) {
  const x = norm(a), y = norm(b);
  return !!x && !!y && x === y;
}

function closeText(a: unknown, b: unknown) {
  const x = norm(a), y = norm(b);
  if (!x || !y) return false;
  return x === y || (x.length >= 5 && y.length >= 5 && (x.includes(y) || y.includes(x)));
}

async function inferHistoricalTonPrice(sql: Awaited<ReturnType<typeof getSql>>, current: Row, td: Row) {
  const history = await sql<Row>`
    select tb.id, tb.numero_ticket, tb.driver_id, tb.fleet_id, tb.transportadora,
           tb.destinatario, tb.ticket_data,
           t.price_per_ton, t.client, t.origin, t.destination, t.date
    from tickets_balanca tb
    left join trips t on t.id=tb.viagem_id
    where tb.id<>${current.id}
      and (tb.freight_mode='ton' or t.freight_mode='ton')
    order by tb.criado_em desc
    limit 500
  `;

  const groups = new Map<string, { price:number; weight:number; support:number; best:number; reasons:Set<string> }>();
  for (const candidate of history) {
    const data = candidate.ticket_data && typeof candidate.ticket_data === "object" ? candidate.ticket_data as Row : {};
    const price = positive(data.price_per_ton) || positive(data.route_price_per_ton) || positive(candidate.price_per_ton);
    if (!price) continue;

    let score = 0;
    const reasons: string[] = [];

    if (same(td.route_group, data.route_group)) { score += 14; reasons.push("mesma rota"); }
    if (same(td.route_origin || td.navio_origem || td.remetente, data.route_origin || data.navio_origem || data.remetente || candidate.origin)) { score += 5; reasons.push("mesma origem"); }
    if (same(td.route_destination || td.navio_destino || td.destinatario, data.route_destination || data.navio_destino || data.destinatario || candidate.destination)) { score += 5; reasons.push("mesmo destino"); }

    const currentCompany = td.contratante || td.cliente || td.empresa_documento;
    const candidateCompany = data.contratante || data.cliente || data.empresa_documento || candidate.client;
    if (same(currentCompany, candidateCompany)) { score += 10; reasons.push("mesma empresa"); }
    else if (closeText(currentCompany, candidateCompany)) { score += 6; reasons.push("empresa semelhante"); }

    if (same(current.transportadora || td.transportadora, candidate.transportadora || data.transportadora)) { score += 5; reasons.push("mesma transportadora"); }
    if (same(td.produto, data.produto)) { score += 4; reasons.push("mesmo produto"); }
    if (same(td.model_type, data.model_type)) { score += 4; reasons.push("mesmo modelo de ticket"); }
    if (current.driver_id && current.driver_id === candidate.driver_id) { score += 1; reasons.push("mesmo motorista"); }
    if (current.fleet_id && current.fleet_id === candidate.fleet_id) { score += 1; reasons.push("mesmo conjunto"); }

    if (score < 4) continue;
    const key = price.toFixed(4);
    const group = groups.get(key) ?? { price, weight: 0, support: 0, best: 0, reasons: new Set<string>() };
    group.weight += score;
    group.support += 1;
    group.best = Math.max(group.best, score);
    reasons.forEach((reason) => group.reasons.add(reason));
    groups.set(key, group);
  }

  const ranked = [...groups.values()].sort((a,b) => b.weight-a.weight || b.support-a.support || b.best-a.best);
  const top = ranked[0];
  if (!top) return null;

  const second = ranked[1];
  const dominance = second ? top.weight / Math.max(1, second.weight) : 2;
  let confidence = 0.58 + Math.min(0.2, top.best / 80) + Math.min(0.13, top.support * 0.025) + Math.min(0.08, Math.max(0, dominance - 1) * 0.08);
  if (top.best >= 20) confidence += 0.05;
  if (top.support >= 3) confidence += 0.04;
  confidence = Math.min(0.98, confidence);

  // Um único precedente só é aceito quando a semelhança é muito forte.
  if (top.support === 1 && top.best < 20) confidence = Math.min(confidence, 0.79);

  const reasonText = [...top.reasons].slice(0,4).join(", ");
  return {
    price: top.price,
    confidence: Math.round(confidence * 1000) / 1000,
    support: top.support,
    basis: (top.support + (top.support === 1 ? " viagem semelhante" : " viagens semelhantes")) + (reasonText ? " · " + reasonText : ""),
  };
}
