import {
  TicketError,
  normalizeFreightMode,
  normalizeTicket,
  ticketForMode,
  type TicketData,
  type TicketFreightMode,
} from "@/lib/ticket-core";
import { SYSTEM_PROMPT_OCR } from "@/lib/ocr-prompts";
import { getSalomaoOpenAIKeys } from "@/lib/salomao-ai.server";

export class OpenAIVisionUnavailable extends TicketError {}

export function ticketOcrModel() {
  return process.env.OPENAI_OCR_MODEL?.trim() || "gpt-4o-mini";
}

function outputText(data: any) {
  return Array.isArray(data?.output)
    ? data.output
        .flatMap((item: any) => (Array.isArray(item?.content) ? item.content : []))
        .filter((part: any) => part?.type === "output_text")
        .map((part: any) => String(part.text || ""))
        .join("")
    : "";
}

async function requestVision(
  key: string,
  image: { base64: string; mime: string },
  userInstruction: string,
  timeoutMs: number,
) {
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    signal: AbortSignal.timeout(timeoutMs),
    headers: {
      Authorization: "Bearer " + key,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: ticketOcrModel(),
      store: false,
      instructions: SYSTEM_PROMPT_OCR,
      input: [{
        role: "user",
        content: [
          {
            type: "input_text",
            text: userInstruction + "\nRetorne somente o objeto JSON solicitado.",
          },
          {
            type: "input_image",
            image_url: `data:${image.mime};base64,${image.base64}`,
            detail: "high",
          },
        ],
      }],
      max_output_tokens: 2200,
    }),
  });

  const data: any = await response.json().catch(() => null);
  return { response, data };
}

function parseVision(data: any, mode: TicketFreightMode) {
  const text = outputText(data);
  if (!text.trim()) {
    throw new TicketError(502, "A IA não retornou dados do ticket. Tente outra foto.");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text.replace(/^\`\`\`(?:json)?\s*|\s*\`\`\`$/gi, "").trim());
  } catch {
    throw new TicketError(502, "A IA não conseguiu estruturar os dados do ticket. Tente novamente.");
  }

  return ticketForMode(normalizeTicket(parsed), mode);
}

function missingPriorityCount(ticket: TicketData, mode: TicketFreightMode) {
  let missing = 0;
  if (!ticket.numero_ticket) missing++;
  if (!ticket.placa_veiculo) missing++;
  if (!ticket.placa_carreta) missing++;
  if (!ticket.transportadora) missing++;
  if (!ticket.operadora && !ticket.contratante && !ticket.destinatario && !ticket.cliente) missing++;
  if (mode === "ton" && !ticket.peso_liquido_kg) missing++;
  return missing;
}

function mergeReadings(primary: TicketData, focused: TicketData, mode: TicketFreightMode) {
  const merged: TicketData = {
    ...primary,
    alertas: [...(primary.alertas || [])],
  };

  const fields: Array<keyof TicketData> = [
    "numero_ticket",
    "status",
    "placa_veiculo",
    "placa_carreta",
    "produto",
    "pesagem_inicial_kg",
    "pesagem_inicial_data",
    "pesagem_final_kg",
    "pesagem_final_data",
    "peso_liquido_kg",
    "peso_origem_kg",
    "numero_nf",
    "transportadora",
    "operadora",
    "contratante",
    "motorista",
    "cliente",
    "destinatario",
    "navio",
    "emissor",
    "operador_pesagem",
    "item_codigo",
    "anotacoes_manuscritas",
  ];

  for (const field of fields) {
    if ((merged as any)[field] == null && (focused as any)[field] != null) {
      (merged as any)[field] = (focused as any)[field];
    }
  }

  merged.alertas = Array.from(new Set([
    ...merged.alertas,
    ...(focused.alertas || []),
    "A IA fez uma segunda conferência automática dos campos prioritários.",
  ]));

  return ticketForMode(normalizeTicket(merged), mode);
}

export async function extrairDadosTicketIA(
  image: { base64: string; mime: string },
  requestedMode: TicketFreightMode,
): Promise<TicketData> {
  const mode = normalizeFreightMode(requestedMode);
  const keys = await getSalomaoOpenAIKeys();

  if (!keys.length) {
    throw new OpenAIVisionUnavailable(
      503,
      "A leitura por IA está sem credencial OpenAI configurada.",
    );
  }

  const primaryInstruction = mode === "ton"
    ? [
        "Leia este ticket de pesagem completo.",
        "Prioridade máxima: número do ticket, Peso Entrada/Pesagem Inicial, Peso Saída/Pesagem Final, Peso Líquido, placa do veículo, placa da carreta, transportadora, operadora, motorista e navio.",
        "Confira matematicamente o peso líquido pela diferença absoluta entre as duas pesagens.",
      ].join("\n")
    : [
        "Leia este documento operacional completo.",
        "Priorize número do ticket, placas, transportadora, operadora, contratante, destinatário, motorista e navio.",
        "Este modo não usa peso; deixe todos os campos de peso como null.",
      ].join("\n");

  const focusedInstruction = [
    "SEGUNDA CONFERÊNCIA VISUAL.",
    "Examine novamente a imagem inteira, inclusive textos pequenos e as duas caixas de placas.",
    "Em recibos VPORTS estreitos: a primeira placa/caixa à esquerda em 'Placas' é a CARRETA e a segunda à direita é o VEÍCULO/cavalo.",
    "Em VPORTS, o campo 'Operador' com nome de empresa (ex.: LOG CONSULTING) é a OPERADORA, não operador_pesagem.",
    "Não use nome do arquivo como número do ticket.",
    "Nunca invente dados.",
  ].join("\n");

  let lastStatus = 0;

  for (const key of keys) {
    try {
      const first = await requestVision(key, image, primaryInstruction, 45_000);
      lastStatus = first.response.status;

      if (!first.response.ok) {
        const code = String(first.data?.error?.code || first.data?.error?.type || "");
        console.warn("[ocr-openai] vision request unavailable", {
          status: first.response.status,
          code: code.slice(0, 80),
          model: ticketOcrModel(),
        });

        if ([401, 403, 404, 429].includes(first.response.status) || first.response.status >= 500) {
          continue;
        }

        throw new TicketError(502, "A IA não conseguiu concluir a leitura desta foto.");
      }

      const primary = parseVision(first.data, mode);

      if (missingPriorityCount(primary, mode) >= 2) {
        try {
          const second = await requestVision(
            key,
            image,
            primaryInstruction + "\n\n" + focusedInstruction,
            35_000,
          );

          if (second.response.ok) {
            return mergeReadings(primary, parseVision(second.data, mode), mode);
          }
        } catch (error) {
          console.warn("[ocr-openai] focused retry failed", {
            name: error instanceof Error ? error.name : "unknown",
          });
        }
      }

      return primary;
    } catch (error) {
      if (error instanceof TicketError && !(error instanceof OpenAIVisionUnavailable)) {
        throw error;
      }

      if (error instanceof Error && ["TimeoutError", "AbortError"].includes(error.name)) {
        lastStatus = 408;
        continue;
      }
    }
  }

  const reason =
    lastStatus === 401 || lastStatus === 403
      ? "A credencial OpenAI da leitura por IA foi recusada."
      : lastStatus === 429
        ? "A leitura por IA atingiu o limite temporário da OpenAI."
        : "A leitura por IA está temporariamente indisponível.";

  throw new OpenAIVisionUnavailable(503, reason + " Tente novamente em instantes.");
}
