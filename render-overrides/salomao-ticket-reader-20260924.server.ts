import type { Sql } from "@/lib/db";
import type { TicketData, TicketFreightMode } from "@/lib/ticket-core";
import {
  extrairDadosTicketIA,
  OpenAIVisionUnavailable,
} from "@/lib/ocr-service.server";

export { OpenAIVisionUnavailable as SalomaoVisionUnavailable };

export async function readTicketWithSalomaoIA(
  _sql: Sql,
  image: { base64: string; mime: string },
  requestedMode: TicketFreightMode,
): Promise<TicketData> {
  return extrairDadosTicketIA(image, requestedMode);
}
