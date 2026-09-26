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
import { finishTicketReading, parseTicketOcr } from "@/lib/ticket-parser";

export const Route = createFileRoute("/api/ler-ticket")({
  server: { handlers: {
    GET: async ({ request }) => {
      try {
        const access = ticketAccess(request);
        return json({
          authenticated: true,
          ...access,
          available: true,
          engine: "chatgpt-vision+local-ocr-fallback",
          localOcrOnly: false,
          ocrFallback: true,
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
        const autoDetectMode = body.autoDetectMode === true;
        const readMode = autoDetectMode ? "ton" : freightMode;
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

        const routeMemories = await loadTicketRouteMemories(sql);

        // Segunda leitura automática: o aparelho executa Tesseract e envia só o
        // texto quando ChatGPT Vision está sem crédito, em timeout ou indisponível.
        if (typeof body.ocrText === "string" && body.ocrText.trim()) {
          const ocrText = body.ocrText.slice(0, 30_000);
          const ticket = parseTicketOcr(ocrText, readMode, fleet);
          const routeMatch = matchRouteFromOcr(ocrText, routeMemories);
          if (routeMatch) {
            applyRoute(ticket, routeMatch.route, routeMatch.confidence);
            ticket.inferred_freight_mode = "ton";
            ticket.inferred_price = Number(routeMatch.route.price_per_ton);
            ticket.inferred_price_basis = "preço aprendido da rota identificada";
            ticket.inference_confidence = Math.max(ticket.inference_confidence ?? 0, routeMatch.confidence);
          }
          ticket.alertas = [
            "Contingência automática: a API de visão não respondeu; os dados foram extraídos pelo OCR local.",
            ...ticket.alertas.filter((alerta) => !/^Contingência automática:/.test(alerta)),
          ];
          return json(ticket);
        }

        const image = validateImage(body);
        const dataUrl = `data:${image.mime};base64,${image.base64}`;
        const result = await readTicketWithChatGPT(dataUrl, freightMode, fleet, routeMemories, autoDetectMode);
        const ticket = finishTicketReading(result, readMode, fleet);
        const routeKey = typeof result?.route_key === "string" ? result.route_key.trim() : "";
        const routeConfidence = Number(result?.route_confidence);
        const route = Number.isFinite(routeConfidence) && routeConfidence >= 0.85
          ? routeMemories.find((item) => item.route_key === routeKey)
          : undefined;
        if (route) {
          applyRoute(ticket, route, routeConfidence);
          if (!ticket.inferred_freight_mode) ticket.inferred_freight_mode = "ton";
          if (!ticket.inferred_price) ticket.inferred_price = Number(route.price_per_ton);
          if (!ticket.inferred_price_basis) ticket.inferred_price_basis = "preço aprendido da rota identificada";
          ticket.inference_confidence = Math.max(ticket.inference_confidence ?? 0, routeConfidence);
        }
        return json(ticket);
      } catch (error) { return ticketErrorResponse(error); }
    },
  } },
});

type RouteMemory = {
  route_key: string;
  route_name: string;
  origin: string | null;
  destination: string | null;
  price_per_ton: number | string;
  match_hints: string;
};

async function loadTicketRouteMemories(sql: Awaited<ReturnType<typeof getSql>>): Promise<RouteMemory[]> {
  await sql`
    create table if not exists ticket_route_memory (
      route_key text primary key,
      route_name text not null,
      origin text,
      destination text,
      price_per_ton numeric not null,
      match_hints text not null default '',
      source text,
      active boolean not null default true,
      updated_at timestamptz not null default now()
    )
  `;
  await sql`
    insert into ticket_route_memory
      (route_key, route_name, origin, destination, price_per_ton, match_hints, source, active, updated_at)
    values
      ('sportos-eco-festipar', 'Sportos - Eco x Festipar', 'Sportos - Eco', 'Festipar', 40,
       'SPORTOS;ECO;FESTIPAR;FERTIPAR', 'motorista_confirmado_2026-09-26', true, now()),
      ('papaleguas-ureia-adubos-real', 'Papaléguas - Uréia (Adubos Real)', null, null, 35,
       'ADUBOS REAL;UREIA;URÉIA;PAPALEGUAS;PAPALÉGUAS', 'motorista_confirmado_2026-09-26', true, now()),
      ('rota-do-sol-eco', 'Rota do Sol - Eco', null, null, 17,
       'ECOLOGISTICS;ECO LOGISTICS;ROTA DO SOL;ECO;OPATEM', 'motorista_confirmado_2026-09-26', true, now()),
      ('papaleguas-rota-do-sol-map', 'Papaléguas / Rota do Sol - MAP', null, null, 33,
       'ADUBOS REAL;MAP;FOSFATO MONOAMONICO;FOSFATO MONOAMÔNICO;PAPALEGUAS;PAPALÉGUAS;ROTA DO SOL', 'motorista_confirmado_2026-09-26', true, now()),
      ('transportadora-ras', 'Transportadora - RAS', null, null, 14,
       'LOG CONSULTING;SPORTOS;YARA VIX 1;NITRABOR;BELISLAND RECEPCAO;BELISLAND RECEPÇÃO', 'motorista_confirmado_2026-09-26', true, now())
    on conflict (route_key) do update set
      route_name=excluded.route_name,
      origin=excluded.origin,
      destination=excluded.destination,
      price_per_ton=excluded.price_per_ton,
      match_hints=excluded.match_hints,
      source=excluded.source,
      active=true,
      updated_at=now()
  `;
  return await sql<RouteMemory>`
    select route_key, route_name, origin, destination, price_per_ton, match_hints
    from ticket_route_memory
    where active=true
    order by updated_at desc
    limit 20
  `;
}

function routeMemoryInstructions(routes: RouteMemory[]) {
  if (!routes.length) return "Nenhuma rota conhecida cadastrada.";
  return routes.map((route) =>
    `- ${route.route_key}: ${route.route_name}; origem=${route.origin || "não definida"}; destino=${route.destination || "não definido"}; preço/t=${route.price_per_ton}; pistas=${route.match_hints || "nenhuma"}`
  ).join("\n");
}

function applyRoute(ticket: ReturnType<typeof finishTicketReading>, route: RouteMemory, confidence: number) {
  ticket.route_group = route.route_name;
  ticket.route_origin = route.origin;
  ticket.route_destination = route.destination;
  ticket.route_price_per_ton = Number(route.price_per_ton);
  ticket.route_confidence = confidence;
  ticket.alertas = ticket.alertas.filter((alerta) => !/rota não identificada/i.test(alerta));
}

function matchRouteFromOcr(text: string, routes: RouteMemory[]) {
  const u = String(text || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase();
  const has = (pattern: RegExp) => pattern.test(u);
  const get = (key: string) => routes.find((route) => route.route_key === key);

  // Ordem específica evita colisões: ECOLOGISTICS com MAP continua sendo a
  // rota Rota do Sol - Eco, enquanto ADUBOS REAL + MAP é a rota de R$33/t.
  if (has(/LOG\s+CONSULTING/) && has(/SPORTOS/) && has(/YARA\s+VIX\s*1|NITRABOR|BELISLAND/)) {
    const route = get("transportadora-ras");
    if (route) return { route, confidence: 0.99 };
  }
  if (has(/ECOLOGISTICS|ECO\s*LOGISTICS/) && has(/BOLETIM\s+DE\s+PESAGEM|OPATEM/)) {
    const route = get("rota-do-sol-eco");
    if (route) return { route, confidence: 0.97 };
  }
  if (has(/ADUBOS\s+REAL/) && has(/\bMAP\b|FOSFATO\s+MONOAMONICO|FOSFATO\s+MONOAMONICO/)) {
    const route = get("papaleguas-rota-do-sol-map");
    if (route) return { route, confidence: 0.95 };
  }
  if (has(/ADUBOS\s+REAL/) && has(/UREIA|PAPALEGUAS/)) {
    const route = get("papaleguas-ureia-adubos-real");
    if (route) return { route, confidence: 0.94 };
  }
  if (has(/SPORTOS/) && has(/ECO/) && has(/FESTIPAR|FERTIPAR/)) {
    const route = get("sportos-eco-festipar");
    if (route) return { route, confidence: 0.96 };
  }
  return null;
}

async function readTicketWithChatGPT(
  imageDataUrl: string,
  freightMode: "ton" | "trip" | "cegonha" | "caixinha",
  fleet: { tractorPlate?: string; trailerPlate?: string },
  routeMemories: RouteMemory[],
  autoDetectMode = false,
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
      route_key: nullableString,
      route_confidence: { type: ["number", "null"], minimum: 0, maximum: 1 },
      inferred_freight_mode: { type: ["string", "null"], enum: ["ton", "trip", "cegonha", "caixinha", null] },
      inferred_price: { type: ["number", "null"], minimum: 0 },
      inferred_price_basis: nullableString,
      inference_confidence: { type: ["number", "null"], minimum: 0, maximum: 1 },
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
      "operador_pesagem","emissor","model_type","route_key","route_confidence","inferred_freight_mode","inferred_price","inferred_price_basis","inference_confidence","pesagem_inicial_kg",
      "pesagem_final_kg","peso_liquido_kg","peso_origem_kg",
      "placas_detectadas","alertas"
    ],
  };

  const selectedFleetText = [
    fleet.tractorPlate ? `cavalo selecionado=${fleet.tractorPlate}` : "",
    fleet.trailerPlate ? `carreta selecionada=${fleet.trailerPlate}` : "",
  ].filter(Boolean).join("; ");
  const knownRoutesText = routeMemoryInstructions(routeMemories);

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
15. route_key só pode ser uma das chaves da lista de rotas conhecidas abaixo. Classifique apenas quando houver evidência VISÍVEL no ticket compatível com a rota; nunca escolha rota só pelo preço, motorista ou conjunto. Se não houver evidência suficiente, use null.
16. route_confidence deve ser de 0 a 1. Só use 0,85 ou mais quando a identificação da rota estiver realmente clara. Caso contrário, use null.
17. As pistas de match_hints são exemplos de evidência e NÃO devem ser tratadas como palavras independentes suficientes. Prefira uma combinação de pelo menos 2 sinais distintivos ou um nome de rota manuscrito claramente legível.
18. A palavra SPORTOS sozinha NÃO identifica a rota Sportos - Eco x Festipar. Essa rota exige evidência adicional de ECO/FESTIPAR/FERTIPAR. Tickets LOG CONSULTING + SPORTOS + YARA VIX 1 + NITRABOR/BELISLAND correspondem ao grupo Transportadora - RAS quando o conjunto de sinais estiver claro.
19. Cruze TODAS as pistas disponíveis: layout do documento, títulos, empresas, produto, rota, observações manuscritas, pesos, valores, data e hora. Não decida por uma palavra isolada.
20. inferred_freight_mode deve indicar a modalidade mais provável: "ton" para frete por tonelada; "cegonha" e "caixinha" quando o layout/palavras padronizadas identificarem esses tickets; "trip" para preço fixo por viagem. ${autoDetectMode ? "A modalidade escolhida na tela NÃO deve influenciar a classificação: identifique pela foto." : "Use a modalidade da tela apenas como contexto secundário."}
21. inferred_price deve ser o preço operacional da viagem quando puder ser descoberto com segurança. Para "ton", prefira o preço/t aprendido da rota ou explicitamente indicado. Para "cegonha", "caixinha" e "trip", use preço POR VIAGEM. Não confunda peso, número de ticket, NF, CNPJ ou horário com preço.
22. inferred_price_basis explique em poucas palavras de onde veio o preço (ex.: "rota Papaléguas-Uréia", "valor R$ impresso", "padrão de cegonha"). inference_confidence deve refletir a segurança da modalidade/preço.
23. Quando data e hora existirem, associe a hora à mesma pesagem escolhida para data_ticket; prefira saída/fechamento/pesagem final. Retorne os dois juntos sempre que forem legíveis.
24. No modo por tonelada, peso_liquido_kg é o ÚNICO dado operacional obrigatório. Continue extraindo todos os demais campos para facilitar conferência, mas nunca invente um campo ausente.

ROTAS CONHECIDAS NO BANCO:
${knownRoutesText}

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
