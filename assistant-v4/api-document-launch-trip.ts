import { createFileRoute } from "@tanstack/react-router";
import { getSql } from "@/lib/db";
import { authenticateAssistantRequest } from "@/lib/assistant-auth.server";
import { saveTicket, ticketErrorResponse, TicketError, validateSave } from "@/lib/ticket-core";
import { syncTicketVariableMemory } from "@/lib/ticket-variable-memory.server";

const MODES = ["ton", "trip", "cegonha", "caixinha"] as const;

export const Route = createFileRoute("/api/assistant/document-launch-trip")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const auth = await authenticateAssistantRequest(request);
        if (!auth) {
          return Response.json(
            { ok: false, message: "Autentique a Trans Salomão IA novamente." },
            { status: 401, headers: { "Cache-Control": "no-store" } },
          );
        }
        if (request.headers.get("x-salomao-app") !== "1") {
          return Response.json(
            { ok: false, message: "Requisição não autorizada." },
            { status: 403, headers: { "Cache-Control": "no-store" } },
          );
        }

        try {
          const body: any = await request.json();
          const r = body?.result && typeof body.result === "object" ? body.result : {};
          const links = body?.links && typeof body.links === "object" ? body.links : {};
          if (r.category !== "viagem" || Number(r.confidence || 0) < 0.82) {
            throw new TicketError(409, "O documento ainda não tem confiança suficiente para lançamento automático como viagem.");
          }

          const freightMode = MODES.includes(r.freight_mode) ? r.freight_mode : null;
          if (!freightMode) throw new TicketError(400, "A modalidade da viagem não foi identificada com segurança.");

          const numeroTicket = String(r.ticket_number || r.document_number || "").trim();
          if (!numeroTicket) throw new TicketError(400, "O número do ticket não foi identificado.");

          const driverId = String(links.suggestedDriverId || "").trim();
          const fleetId = String(links.suggestedFleetId || "").trim();
          if (!driverId || !fleetId) throw new TicketError(400, "Motorista ou conjunto não pôde ser vinculado com segurança.");

          const kg = r.net_weight_kg == null ? null : Number(r.net_weight_kg);
          if (freightMode === "ton" && (!Number.isSafeInteger(kg) || Number(kg) <= 0)) {
            throw new TicketError(400, "O peso líquido precisa estar confirmado em quilogramas inteiros.");
          }

          const imageDataUrl = typeof body?.imageDataUrl === "string" ? body.imageDataUrl : "";
          const mime = String(body?.mime || "").toLowerCase();
          const payload: Record<string, unknown> = {
            conferido: true,
            freightMode,
            driverId,
            fleetId,
            km_carreta: 0,
            dailyValue: freightMode === "trip" ? safeMoney(r.price_per_trip) : 0,
            numero_ticket: numeroTicket,
            placa_veiculo: cleanPlate(r.tractor_plate),
            placa_carreta: cleanPlate(r.trailer_plate),
            produto: null,
            pesagem_inicial_data: null,
            pesagem_final_data: cleanText(r.date, 40),
            data_ticket: cleanText(r.date, 40),
            hora_ticket: cleanText(r.time, 40),
            transportadora: cleanText(r.supplier, 240),
            motorista: cleanText(r.driver_name, 240),
            cliente: cleanText(r.client, 240),
            destinatario: cleanText(r.destination || r.recipient_name, 300),
            anotacoes_manuscritas: cleanText(r.handwritten_notes, 1000),
            route_group: cleanText(r.route_key, 200),
            route_origin: cleanText(r.origin, 300),
            route_destination: cleanText(r.destination, 300),
            route_price_per_ton: safeMoney(r.price_per_ton),
            route_confidence: safeConfidence(r.route_confidence),
            inferred_freight_mode: freightMode,
            inferred_price: freightMode === "ton" ? safeMoney(r.price_per_ton) : safeMoney(r.price_per_trip),
            inferred_price_basis: cleanText(r.price_basis, 300),
            inference_confidence: safeConfidence(r.confidence),
            peso_liquido_kg: freightMode === "ton" ? kg : null,
            placas_detectadas: [cleanPlate(r.tractor_plate), cleanPlate(r.trailer_plate)].filter(Boolean),
            alertas: Array.isArray(r.warnings)
              ? r.warnings.filter((x: unknown) => typeof x === "string").slice(0, 12)
              : [],
            fileName: cleanText(body?.fileName, 120) || "ticket.jpg",
          };

          if (imageDataUrl) {
            if (!["image/jpeg", "image/png", "image/webp"].includes(mime)) {
              throw new TicketError(415, "A foto da viagem deve ser JPG, PNG ou WebP.");
            }
            payload.imagem = imageDataUrl;
            payload.tipo = mime;
          }

          const data = validateSave(payload);
          const sql = await getSql();
          const saved = await saveTicket(sql, data, { createdBy: auth.username });
          await syncTicketVariableMemory(sql, saved.reportId);

          return Response.json(
            { ok: true, ...saved },
            { status: 201, headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } },
          );
        } catch (error) {
          return ticketErrorResponse(error);
        }
      },
    },
  },
});

function cleanText(value: unknown, max: number) {
  const text = typeof value === "string" || typeof value === "number" ? String(value).trim() : "";
  return text ? text.slice(0, max) : null;
}

function cleanPlate(value: unknown) {
  const plate = String(value ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  return /^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$/.test(plate) ? plate : null;
}

function safeMoney(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 && number <= 100_000_000 ? number : 0;
}

function safeConfidence(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 && number <= 1 ? number : null;
}
