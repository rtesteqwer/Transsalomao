import { createFileRoute } from "@tanstack/react-router";
import { getSql } from "@/lib/db";
import { ticketAccess, allowTicketRead } from "@/lib/ticket-auth.server";
import {
  json,
  normalizeFreightMode,
  readBody,
  ticketErrorResponse,
  TicketError,
  validateImage,
} from "@/lib/ticket-core";
import { finishTicketReading } from "@/lib/ticket-parser";

export const Route = createFileRoute("/api/ler-ticket")({
  server: { handlers: {
    GET: async ({ request }) => {
      try {
        const access = ticketAccess(request);
        return json({
          authenticated: true,
          ...access,
          available: true,
          engine: "chatgpt-vision",
          localOcrOnly: false,
          aiEnabled: true,
          provider: "openai",
        });
      } catch (error) { return ticketErrorResponse(error); }
    },

    POST: async ({ request }) => {
      try {
        const access = ticketAccess(request);
        const body = await readBody(request);
        const freightMode = normalizeFreightMode(body.freightMode);
        const selected = body.selectedFleet as Record<string, unknown> | undefined;
        const fleet = {
          tractorPlate: typeof selected?.tractorPlate === "string" ? selected.tractorPlate.slice(0, 20) : undefined,
          trailerPlate: typeof selected?.trailerPlate === "string" ? selected.trailerPlate.slice(0, 20) : undefined,
        };

        const sql = await getSql();
        if (access.driverId) {
          const drivers = await sql<{ status: string }>`select status from drivers where id=${access.driverId} limit 1`;
          if (drivers[0]?.status !== "ativo") throw new TicketError(403, "Motorista inativo. Consulte a gerência.");
        }
        await allowTicketRead(sql, `${access.role}:${access.username}`);

        const image = validateImage(body);
        const dataUrl = `data:${image.mime};base64,${image.base64}`;
        const result = await readTicketWithChatGPT(dataUrl, freightMode, fleet);
        return json(finishTicketReading(result, freightMode, fleet));
      } catch (error) { return ticketErrorResponse(error); }
    },
  } },
});

async function readTicketWithChatGPT(
  imageDataUrl: string,
  freightMode: "ton" | "trip" | "cegonha" | "caixinha",
  fleet: { tractorPlate?: string; trailerPlate?: string },
) {
  const key = process.env.OPENAI_API_KEY?.trim() || "";
  if (!key) throw new TicketError(503, "Leitor ChatGPT não configurado. Falta OPENAI_API_KEY.");

  const model =
    process.env.OPENAI_TICKET_MODEL?.trim() ||
    process.env.OPENAI_WHATSAPP_MODEL?.trim() ||
    "gpt-5.6-sol";

  const nullableString = { type: ["string", "null"] };
  const nullableInteger = { type: ["integer", "null"] };
  const schema = {
    type: "object",
    additionalProperties: false,
    properties: {
      numero_ticket: nullableString,
      status: nullableString,
      placa_veiculo: nullableString,
      placa_carreta: nullableString,
      produto: nullableString,
      pesagem_inicial_data: nullableString,
      pesagem_final_data: nullableString,
      data_ticket: nullableString,
      hora_ticket: nullableString,
      transportadora: nullableString,
      motorista: nullableString,
      cliente: nullableString,
      destinatario: nullableString,
      anotacoes_manuscritas: nullableString,
      operadora: nullableString,
      contratante: nullableString,
      remetente: nullableString,
      empresa_documento: nullableString,
      transportadora_cnpj: nullableString,
      destinatario_cnpj: nullableString,
      navio: nullableString,
      navio_origem: nullableString,
      navio_destino: nullableString,
      operador_pesagem: nullableString,
      emissor: nullableString,
      model_type: nullableString,
      pesagem_inicial_kg: nullableInteger,
      pesagem_final_kg: nullableInteger,
      peso_liquido_kg: nullableInteger,
      peso_origem_kg: nullableInteger,
      placas_detectadas: { type: "array", items: { type: "string" }, maxItems: 8 },
      alertas: { type: "array", items: { type: "string" }, maxItems: 12 },
    },
    required: [
      "numero_ticket","status","placa_veiculo","placa_carreta","produto",
      "pesagem_inicial_data","pesagem_final_data","data_ticket","hora_ticket","transportadora",
      "motorista","cliente","destinatario","anotacoes_manuscritas","operadora",
      "contratante","remetente","empresa_documento","transportadora_cnpj",
      "destinatario_cnpj","navio","navio_origem","navio_destino",
      "operador_pesagem","emissor","model_type","pesagem_inicial_kg",
      "pesagem_final_kg","peso_liquido_kg","peso_origem_kg",
      "placas_detectadas","alertas"
    ],
  };

  const selectedFleetText = [
    fleet.tractorPlate ? `cavalo selecionado=${fleet.tractorPlate}` : "",
    fleet.trailerPlate ? `carreta selecionada=${fleet.trailerPlate}` : "",
  ].filter(Boolean).join("; ");

  const instructions = `Você é o leitor de tickets de pesagem da Trans Salomão.
Analise SOMENTE o que está visível na foto e devolva os campos pelo schema. Não invente dados.

REGRAS CRÍTICAS:
1. numero_ticket é o número físico do ticket/tiquete/comprovante de pesagem. Nunca use número de agendamento, NF, CNPJ, chave de acesso ou código aleatório.
2. peso_liquido_kg deve ser o PESO LÍQUIDO impresso, em quilogramas inteiros. Se estiver em toneladas, converta para kg (38,470 t = 38470 kg). Não confunda bruto, tara, entrada ou saída com peso líquido.
3. Se peso líquido não estiver legível, mas bruto e tara estiverem claramente legíveis, pode calcular a diferença e escrever um alerta informando que foi calculado.
4. placa_veiculo = cavalo/veículo; placa_carreta = carreta/reboque. Normalize placa brasileira para 7 caracteres sem hífen. Não troque as duas.
5. transportadora, operadora, empresa contratante, destinatário/recebedor e produto são papéis diferentes. Não coloque rótulos ("Nota Fiscal", "Produto", "Empresa") como valores.
6. Não extraia nem devolva número de Nota Fiscal. Nota fiscal não faz mais parte dos dados da Trans Salomão.
7. data_ticket = data impressa no ticket/documento. Se houver várias datas, prefira a data de fechamento/saída/pesagem final; se houver apenas uma, use essa. Normalize para DD/MM/AAAA quando for inequívoco.
8. hora_ticket = horário correspondente à data escolhida. Se houver vários horários, prefira fechamento/saída/pesagem final. Use HH:MM ou HH:MM:SS conforme estiver legível. Se data ou hora não estiverem visíveis com segurança, use null.
9. Preserve nomes de empresas de forma legível quando a foto permitir. Ex.: RAS TRANSPORTES, LOG CONSULTING, HERINGER, MULTILIFT, ADUBOS REAL, VPORTS.
10. model_type pode ser "multilift", "adubos_real", "vports_recibo", "vports_relatorio", "log_consulting" ou "desconhecido".
11. placas_detectadas deve listar todas as placas plausíveis vistas na foto.
12. Em modo diferente de "ton", ainda leia metadados do ticket, incluindo data e horário, mas os pesos serão descartados pelo servidor.
13. Conjunto selecionado: ${selectedFleetText || "nenhum"}. Use isso somente para desambiguar um caractere que esteja VISIVELMENTE muito próximo na foto; nunca preencha uma placa que não apareça.
14. Se algum campo estiver incerto, use null e inclua um alerta curto. É melhor deixar vazio do que adivinhar.

Modo atual da viagem: ${freightMode}.`;

  let response: Response;
  try {
    response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      signal: AbortSignal.timeout(35_000),
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        reasoning: { effort: "low" },
        instructions,
        input: [{
          role: "user",
          content: [
            { type: "input_text", text: "Leia este ticket de pesagem e extraia os campos com máxima precisão." },
            { type: "input_image", image_url: imageDataUrl, detail: "high" },
          ],
        }],
        text: {
          format: {
            type: "json_schema",
            name: "trans_salomao_ticket",
            strict: true,
            schema,
          },
        },
        max_output_tokens: 2200,
      }),
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "TimeoutError") {
      throw new TicketError(504, "O ChatGPT demorou para ler a foto. Tente novamente.");
    }
    throw error;
  }

  const data: any = await response.json().catch(() => ({}));
  if (!response.ok) {
    console.error("[ticket-chatgpt] OpenAI error", response.status, JSON.stringify(data).slice(0, 800));
    throw new TicketError(502, "O ChatGPT não conseguiu ler o ticket agora. Tente novamente.");
  }

  const text = outputText(data);
  if (!text) throw new TicketError(502, "O ChatGPT retornou a leitura vazia. Tente outra foto.");

  try {
    return JSON.parse(text);
  } catch {
    throw new TicketError(502, "A leitura do ChatGPT veio incompleta. Tente outra foto.");
  }
}

function outputText(value: any) {
  if (typeof value?.output_text === "string" && value.output_text.trim()) return value.output_text.trim();
  const parts: string[] = [];
  for (const item of Array.isArray(value?.output) ? value.output : []) {
    if (item?.type !== "message") continue;
    for (const content of Array.isArray(item?.content) ? item.content : []) {
      if (content?.type === "output_text" && typeof content.text === "string") parts.push(content.text);
    }
  }
  return parts.join("\n").trim();
}
