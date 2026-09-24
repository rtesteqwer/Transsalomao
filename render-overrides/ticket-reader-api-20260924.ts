import { createFileRoute } from "@tanstack/react-router";

const PROMPT = `Você lê fotos de tickets de pesagem de balança rodoviária (Brasil).
Extraia os dados e responda SOMENTE com um JSON, sem texto extra e sem crases, neste formato:
{
  "numero_ticket": string|null,
  "status": string|null,
  "placa_veiculo": string|null,
  "placa_carreta": string|null,
  "produto": string|null,
  "pesagem_inicial_kg": number|null,
  "pesagem_inicial_data": "YYYY-MM-DD HH:mm"|null,
  "pesagem_final_kg": number|null,
  "pesagem_final_data": "YYYY-MM-DD HH:mm"|null,
  "peso_liquido_kg": number|null,
  "peso_origem_kg": number|null,
  "numero_nf": string|null,
  "transportadora": string|null,
  "motorista": string|null,
  "cliente": string|null,
  "anotacoes_manuscritas": string|null,
  "alertas": [string]
}
Regras:
- Use SEMPRE os valores impressos. Anotações escritas à mão vão só em "anotacoes_manuscritas".
- Se um campo estiver em branco ou ilegível, use null. Nunca invente.
- Se algum campo estiver duvidoso (foto torta, borrada, cortada), explique em "alertas".
- Placas em maiúsculas, sem hífen.
- Números sem separador de milhar (35810, não 35.810).
- O peso líquido deve permanecer em quilogramas.`;

const rateMap = globalThis as typeof globalThis & {
  __ticketReaderRate?: Map<string, { count: number; resetAt: number }>;
};

export const Route = createFileRoute("/api/ler-ticket")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (!authorizedRequest(request)) {
          return json({ erro: "Não autorizado" }, 401);
        }
        if (!rateAllowed(request)) {
          return json({ erro: "Muitas leituras em pouco tempo. Tente novamente em instantes." }, 429);
        }

        let body: any = {};
        try {
          body = await request.json();
        } catch {
          return json({ erro: "Dados inválidos" }, 400);
        }

        const imagem = String(body?.imagem || "");
        const tipo = normalizeMime(String(body?.tipo || "image/jpeg"));
        if (!imagem) return json({ erro: "Envie 'imagem' em base64" }, 400);
        if (imagem.length > 5_500_000) return json({ erro: "A foto é grande demais. Reduza a imagem antes de enviar." }, 413);

        const key = process.env.ANTHROPIC_API_KEY?.trim() || "";
        if (!key) {
          return json({ erro: "Leitura de ticket indisponível: ANTHROPIC_API_KEY não configurada." }, 503);
        }

        try {
          const response = await fetch("https://api.anthropic.com/v1/messages", {
            method: "POST",
            signal: AbortSignal.timeout(35_000),
            headers: {
              "Content-Type": "application/json",
              "x-api-key": key,
              "anthropic-version": "2023-06-01",
            },
            body: JSON.stringify({
              model: process.env.CLAUDE_MODEL?.trim() || "claude-sonnet-5",
              max_tokens: 1200,
              messages: [{
                role: "user",
                content: [
                  {
                    type: "image",
                    source: {
                      type: "base64",
                      media_type: tipo,
                      data: imagem.replace(/^data:image\/[^;]+;base64,/, ""),
                    },
                  },
                  { type: "text", text: PROMPT },
                ],
              }],
            }),
          });

          const data: any = await response.json().catch(() => ({}));
          if (!response.ok) {
            const detail = data?.error?.message ? String(data.error.message) : "Erro " + response.status;
            return json({ erro: "Falha na leitura do ticket", detalhe: detail }, 502);
          }

          const texto = (Array.isArray(data?.content) ? data.content : [])
            .map((c: any) => c?.type === "text" ? String(c.text || "") : "")
            .join("")
            .trim();
          if (!texto) return json({ erro: "A leitura retornou vazia." }, 502);

          const parsed = parseJsonObject(texto);
          const dados = normalizeTicket(parsed);
          const alertas = [...dados.alertas];

          const ini = dados.pesagem_inicial_kg;
          const fim = dados.pesagem_final_kg;
          const liq = dados.peso_liquido_kg;
          if (ini != null && fim != null && liq != null && Math.abs(ini - fim) !== liq) {
            alertas.push(
              `Peso líquido (${liq}) não bate com a diferença das pesagens (${Math.abs(ini - fim)}). Confira.`,
            );
          }
          if (!dados.numero_ticket) alertas.push("Número do ticket não foi identificado. Confira antes de lançar.");
          if (liq == null || liq <= 0) alertas.push("Peso líquido não foi identificado com segurança.");

          return json({ ...dados, alertas });
        } catch (error) {
          return json({
            erro: "Erro ao processar a foto",
            detalhe: error instanceof Error ? error.message : String(error),
          }, 500);
        }
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

function rateAllowed(request: Request) {
  const now = Date.now();
  const forwarded = request.headers.get("x-forwarded-for") || "";
  const ip = forwarded.split(",")[0]?.trim() || "unknown";
  const map = rateMap.__ticketReaderRate ??= new Map();
  const current = map.get(ip);
  if (!current || now >= current.resetAt) {
    map.set(ip, { count: 1, resetAt: now + 60_000 });
    return true;
  }
  if (current.count >= 20) return false;
  current.count += 1;
  return true;
}

function parseJsonObject(text: string) {
  const clean = text.replace(/```json|```/gi, "").trim();
  try {
    return JSON.parse(clean);
  } catch {
    const start = clean.indexOf("{");
    const end = clean.lastIndexOf("}");
    if (start >= 0 && end > start) return JSON.parse(clean.slice(start, end + 1));
    throw new Error("A IA não devolveu um JSON válido.");
  }
}

function normalizeTicket(value: any) {
  const nullableText = (v: unknown) => {
    const s = String(v ?? "").trim();
    return s ? s : null;
  };
  const nullableNumber = (v: unknown) => {
    if (v == null || v === "") return null;
    const n = Number(v);
    return Number.isFinite(n) ? Math.round(n) : null;
  };
  const plate = (v: unknown) => {
    const s = String(v ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
    return s || null;
  };
  return {
    numero_ticket: nullableText(value?.numero_ticket),
    status: nullableText(value?.status),
    placa_veiculo: plate(value?.placa_veiculo),
    placa_carreta: plate(value?.placa_carreta),
    produto: nullableText(value?.produto),
    pesagem_inicial_kg: nullableNumber(value?.pesagem_inicial_kg),
    pesagem_inicial_data: nullableText(value?.pesagem_inicial_data),
    pesagem_final_kg: nullableNumber(value?.pesagem_final_kg),
    pesagem_final_data: nullableText(value?.pesagem_final_data),
    peso_liquido_kg: nullableNumber(value?.peso_liquido_kg),
    peso_origem_kg: nullableNumber(value?.peso_origem_kg),
    numero_nf: nullableText(value?.numero_nf),
    transportadora: nullableText(value?.transportadora),
    motorista: nullableText(value?.motorista),
    cliente: nullableText(value?.cliente),
    anotacoes_manuscritas: nullableText(value?.anotacoes_manuscritas),
    alertas: Array.isArray(value?.alertas) ? value.alertas.map((x: unknown) => String(x)).filter(Boolean) : [],
  };
}

function normalizeMime(value: string) {
  return value === "image/png" || value === "image/webp" || value === "image/gif"
    ? value
    : "image/jpeg";
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
