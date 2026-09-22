import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { createFileRoute } from "@tanstack/react-router";
import { getSql } from "@/lib/db";

type Row = Record<string, any>;

type Parsed = {
  kind: "trip" | "fueling" | "expense" | "unknown";
  confidence: number;
  driver: string | null;
  fleet: string | null;
  tractor_plate: string | null;
  trailer_plate: string | null;
  date: string | null;
  client: string | null;
  origin: string | null;
  destination: string | null;
  freight_mode: "ton" | "trip" | "cegonha" | "caixinha" | null;
  net_weight: number | null;
  gross_weight: number | null;
  loaded_tons: number | null;
  price_per_ton: number | null;
  fixed_value: number | null;
  km: number | null;
  liters: number | null;
  price_per_liter: number | null;
  station: string | null;
  category: string | null;
  description: string | null;
  asset_type: "tractor" | "trailer" | null;
  notes: string | null;
};

export const Route = createFileRoute("/api/whatsapp/webhook")({
  server: {
    handlers: {
      GET: async ({ request }) => verifyWebhook(request),
      POST: async ({ request }) => receiveWebhook(request),
    },
  },
});

function response(value: unknown, status = 200) {
  return Response.json(value, {
    status,
    headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" },
  });
}

function safeEqual(a: string, b: string) {
  const aa = Buffer.from(a);
  const bb = Buffer.from(b);
  return aa.length === bb.length && timingSafeEqual(aa, bb);
}

async function verifyWebhook(request: Request) {
  const url = new URL(request.url);
  const mode = url.searchParams.get("hub.mode") || "";
  const token = url.searchParams.get("hub.verify_token") || "";
  const challenge = url.searchParams.get("hub.challenge") || "";
  const expected = process.env.WHATSAPP_VERIFY_TOKEN?.trim() || "";

  if (mode === "subscribe" && expected && safeEqual(token, expected)) {
    return new Response(challenge, {
      status: 200,
      headers: { "Content-Type": "text/plain", "Cache-Control": "no-store" },
    });
  }
  return new Response("Forbidden", { status: 403 });
}

async function receiveWebhook(request: Request) {
  const raw = await request.text();
  const secret = process.env.WHATSAPP_APP_SECRET?.trim() || "";
  if (!secret) return response({ ok: false, code: "WHATSAPP_APP_SECRET_MISSING" }, 503);

  const supplied = request.headers.get("x-hub-signature-256") || "";
  const expected = "sha256=" + createHmac("sha256", secret).update(raw).digest("hex");
  if (!supplied || !safeEqual(supplied, expected)) {
    return response({ ok: false, code: "INVALID_SIGNATURE" }, 401);
  }

  let payload: any;
  try {
    payload = JSON.parse(raw);
  } catch {
    return response({ ok: false, code: "INVALID_JSON" }, 400);
  }

  const messages = collectMessages(payload);
  const results: Row[] = [];
  for (const item of messages) {
    try {
      results.push(await processMessage(item, payload));
    } catch (error: any) {
      console.error("[whatsapp-ai] message failed", item?.id, error);
      results.push({ ok: false, id: item?.id || "", error: String(error?.message || error) });
    }
  }
  return response({ ok: true, received: messages.length, results });
}

function collectMessages(payload: any) {
  const rows: any[] = [];
  for (const entry of Array.isArray(payload?.entry) ? payload.entry : []) {
    for (const change of Array.isArray(entry?.changes) ? entry.changes : []) {
      const value = change?.value || {};
      const contacts = Array.isArray(value?.contacts) ? value.contacts : [];
      const contactByWaId = new Map(contacts.map((c: any) => [String(c?.wa_id || ""), c]));
      for (const message of Array.isArray(value?.messages) ? value.messages : []) {
        const from = String(message?.from || "");
        const contact: any = contactByWaId.get(from);
        const text =
          message?.type === "text" ? String(message?.text?.body || "") :
          message?.type === "image" ? String(message?.image?.caption || "") :
          message?.type === "document" ? String(message?.document?.caption || "") :
          message?.type === "video" ? String(message?.video?.caption || "") : "";
        const mediaId =
          message?.image?.id || message?.document?.id || message?.video?.id ||
          message?.audio?.id || message?.voice?.id || null;
        rows.push({
          id: String(message?.id || ""),
          from,
          name: String(contact?.profile?.name || ""),
          type: String(message?.type || "unknown"),
          text: text.trim(),
          mediaId: mediaId ? String(mediaId) : null,
          timestamp: String(message?.timestamp || ""),
          message,
        });
      }
    }
  }
  return rows.filter((x) => x.id);
}

function digits(value: unknown) {
  return String(value || "").replace(/\D/g, "");
}

function phoneCore(value: unknown) {
  const d = digits(value);
  return d.length > 11 ? d.slice(-11) : d;
}

function norm(value: unknown) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("pt-BR")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function num(value: unknown) {
  const x = Number(value);
  return Number.isFinite(x) ? x : 0;
}

function isoDate(value: unknown) {
  const s = String(value || "").slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : "";
}

function todayBR() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

async function processMessage(item: any, fullPayload: any) {
  const sql = await getSql();
  const existing = await sql<Row>`
    select id,status,created_entity_type,created_entity_id
    from whatsapp_messages where provider_message_id=${item.id} limit 1
  `;
  if (existing[0]) return { ok: true, duplicate: true, ...existing[0] };

  const auditId = "wa_" + randomUUID().replace(/-/g, "").slice(0, 18);
  await sql`
    insert into whatsapp_messages
      (id,provider_message_id,sender_phone,sender_name,message_type,raw_text,media_id,raw_payload,status)
    values
      (${auditId},${item.id},${item.from},${item.name},${item.type},${item.text},${item.mediaId},
       ${JSON.stringify({ message: item.message, object: fullPayload?.object || "" })}::jsonb,'received')
  `;

  if (!item.text) {
    await sql`
      update whatsapp_messages
      set status='pending_media',processed_at=now()
      where id=${auditId}
    `;
    return { ok: true, status: "pending_media", id: auditId };
  }

  const driver = await findDriverByPhone(item.from);
  let parsed: Parsed;
  try {
    parsed = await parseWithAI(item.text, driver?.name || null);
  } catch (error: any) {
    await sql`
      update whatsapp_messages
      set status='ai_error',error_message=${String(error?.message || error).slice(0,1000)},processed_at=now()
      where id=${auditId}
    `;
    throw error;
  }

  await sql`
    update whatsapp_messages
    set parsed_action=${JSON.stringify(parsed)}::jsonb,confidence=${parsed.confidence}
    where id=${auditId}
  `;

  const minConfidence = Math.max(0.5, Math.min(0.99, Number(process.env.WHATSAPP_AI_MIN_CONFIDENCE || "0.86")));
  const autoCommit = process.env.WHATSAPP_AUTO_COMMIT !== "0";

  if (!autoCommit || parsed.kind === "unknown" || parsed.confidence < minConfidence) {
    await markPending(auditId, "pending_review");
    return { ok: true, status: "pending_review", id: auditId, parsed };
  }

  const matchedDriver = driver || await findDriverByName(parsed.driver);
  const fleet = await findFleet(parsed, matchedDriver?.id || null);

  let created: { type: string; id: string; summary: string } | null = null;
  try {
    if (parsed.kind === "trip") created = await createTrip(parsed, matchedDriver, fleet, item.id);
    if (parsed.kind === "fueling") created = await createFueling(parsed, matchedDriver, fleet, item.id);
    if (parsed.kind === "expense") created = await createExpense(parsed, matchedDriver, fleet, item.id);
  } catch (error: any) {
    const msg = String(error?.message || error).slice(0, 1000);
    await sql`
      update whatsapp_messages
      set status='pending_review',error_message=${msg},processed_at=now()
      where id=${auditId}
    `;
    return { ok: true, status: "pending_review", id: auditId, parsed, reason: msg };
  }

  if (!created) {
    await markPending(auditId, "pending_review");
    return { ok: true, status: "pending_review", id: auditId, parsed };
  }

  await sql`
    update whatsapp_messages
    set status='committed',created_entity_type=${created.type},created_entity_id=${created.id},
        processed_at=now()
    where id=${auditId}
  `;

  await sendWhatsAppText(item.from, "Trans Salomão: " + created.summary);
  return { ok: true, status: "committed", id: auditId, created };
}

async function markPending(id: string, status: string) {
  const sql = await getSql();
  await sql`update whatsapp_messages set status=${status},processed_at=now() where id=${id}`;
}

async function findDriverByPhone(phone: string) {
  const core = phoneCore(phone);
  if (!core) return null;
  const sql = await getSql();
  const rows = await sql<Row>`select * from drivers where status='ativo' order by name`;
  const exact = rows.filter((x) => phoneCore(x.phone) === core);
  return exact.length === 1 ? exact[0] : null;
}

async function findDriverByName(name: string | null) {
  if (!name) return null;
  const sql = await getSql();
  const rows = await sql<Row>`select * from drivers where status='ativo' order by name`;
  const q = norm(name);
  const matches = rows.filter((x) => {
    const n = norm(x.name);
    return n === q || n.includes(q) || q.includes(n);
  });
  return matches.length === 1 ? matches[0] : null;
}

async function findFleet(parsed: Parsed, driverId: string | null) {
  const sql = await getSql();
  const rows = await sql<Row>`select * from fleets where status='ativo' order by name`;
  const fleetQ = norm(parsed.fleet);
  const tractor = norm(parsed.tractor_plate).replace(/ /g, "");
  const trailer = norm(parsed.trailer_plate).replace(/ /g, "");

  const matches = rows.filter((x) => {
    const name = norm(x.name);
    const tr = norm(x.tractor_plate).replace(/ /g, "");
    const tl = norm(x.trailer_plate).replace(/ /g, "");
    return (fleetQ && (name === fleetQ || name.includes(fleetQ) || fleetQ.includes(name))) ||
      (tractor && tr === tractor) || (trailer && tl === trailer);
  });
  if (matches.length === 1) return matches[0];

  if (driverId) {
    const recent = await sql<Row>`
      select f.*
      from trips t join fleets f on f.id=t.fleet_id
      where t.driver_id=${driverId}
      order by t.date desc,t.code desc limit 2
    `;
    if (recent.length === 1 || (recent[0] && recent[1] && recent[0].id === recent[1].id)) return recent[0];
  }
  return null;
}

async function nextTicket() {
  const sql = await getSql();
  const rows = await sql<{ next: number }>`
    select (greatest(
      coalesce((select max(code::int) from trips where code ~ '^[0-9]+$'),0),
      coalesce((select max(ticket::int) from reports where ticket ~ '^[0-9]+$'),0)
    )+1)::int as next
  `;
  return String(rows[0]?.next || 1);
}

async function globalPrice(mode: string) {
  const sql = await getSql();
  const rows = await sql<{ price: number }>`select price from freight_prices where mode=${mode} limit 1`;
  return num(rows[0]?.price);
}

async function createTrip(parsed: Parsed, driver: Row | null, fleet: Row | null, sourceId: string) {
  if (!driver) throw new Error("Motorista não identificado com segurança.");
  if (!fleet) throw new Error("Conjunto não identificado com segurança.");
  const mode = parsed.freight_mode;
  if (!mode) throw new Error("Modo do frete não identificado.");
  const net = num(parsed.net_weight);
  const priceTon = num(parsed.price_per_ton);
  if (mode === "ton" && (net <= 0 || priceTon <= 0)) {
    throw new Error("Viagem por tonelada sem peso líquido ou preço por tonelada.");
  }

  let fixed = num(parsed.fixed_value);
  if (mode !== "ton" && fixed <= 0) fixed = await globalPrice(mode);
  if (mode !== "ton" && fixed <= 0) throw new Error("Valor do frete fixo não configurado.");

  const sql = await getSql();
  const id = "trip_" + randomUUID().replace(/-/g, "").slice(0, 12);
  const code = await nextTicket();
  const date = isoDate(parsed.date) || todayBR();
  const kmEnd = num(parsed.km);
  let kmStart = 0;
  if (kmEnd > 0) {
    const prev = await sql<Row>`
      select km_end from trips where fleet_id=${fleet.id} and km_end<=${kmEnd}
      order by km_end desc limit 1
    `;
    kmStart = num(prev[0]?.km_end);
  }

  await sql`
    insert into trips
      (id,code,date,client,origin,destination,driver_id,fleet_id,loaded_tons,gross_weight,net_weight,
       freight_mode,price_per_ton,price_per_trip,km_start,km_end,diesel_liters,diesel_price)
    values
      (${id},${code},${date},${parsed.client || ""},${parsed.origin || ""},${parsed.destination || ""},
       ${driver.id},${fleet.id},${num(parsed.loaded_tons) || net},${num(parsed.gross_weight)},${net},
       ${mode},${priceTon},${mode === "ton" ? 0 : fixed},${kmStart},${kmEnd},0,0)
  `;
  const freight = mode === "ton" ? net * priceTon : fixed;
  return { type: "trip", id, summary: `viagem ${code} lançada para ${driver.name}, ${fleet.name}, valor R$ ${freight.toFixed(2)}.` };
}

async function createFueling(parsed: Parsed, driver: Row | null, fleet: Row | null, sourceId: string) {
  if (!fleet) throw new Error("Conjunto não identificado com segurança.");
  const liters = num(parsed.liters);
  const price = num(parsed.price_per_liter);
  if (liters <= 0 || price <= 0) throw new Error("Abastecimento sem litros ou preço por litro.");
  const sql = await getSql();
  const id = "fuel_" + randomUUID().replace(/-/g, "").slice(0, 12);
  const date = isoDate(parsed.date) || todayBR();
  await sql`
    insert into fuelings(id,date,driver_id,fleet_id,station,km,liters,price_per_liter,notes)
    values(${id},${date},${driver?.id || null},${fleet.id},${parsed.station || ""},${num(parsed.km)},
      ${liters},${price},${[parsed.notes, "WhatsApp " + sourceId].filter(Boolean).join(" | ")})
  `;
  return { type: "fueling", id, summary: `abastecimento de ${liters} L registrado para ${fleet.name}.` };
}

async function createExpense(parsed: Parsed, driver: Row | null, fleet: Row | null, sourceId: string) {
  const amount = num(parsed.fixed_value);
  if (amount <= 0) throw new Error("Despesa sem valor.");
  const category = parsed.category || "Outros";
  const isAdvance = norm(category) === "adiantamento";
  if (isAdvance && !driver) throw new Error("Adiantamento sem motorista identificado.");
  if (!isAdvance && !fleet) throw new Error("Despesa sem conjunto identificado.");

  const sql = await getSql();
  const id = "exp_" + randomUUID().replace(/-/g, "").slice(0, 12);
  const date = isoDate(parsed.date) || todayBR();
  const asset = parsed.asset_type === "trailer" ? "trailer" : "tractor";
  await sql`
    insert into expenses(id,date,fleet_id,asset_type,driver_id,category,description,amount,notes)
    values(${id},${date},${isAdvance ? null : fleet?.id || null},${isAdvance ? null : asset},
      ${isAdvance ? driver?.id || null : null},${category},${parsed.description || "Lançamento via WhatsApp"},
      ${amount},${[parsed.notes, "WhatsApp " + sourceId].filter(Boolean).join(" | ")})
  `;
  return { type: "expense", id, summary: `despesa de R$ ${amount.toFixed(2)} registrada.` };
}

async function parseWithAI(message: string, driverName: string | null): Promise<Parsed> {
  const key = process.env.OPENAI_API_KEY?.trim() || "";
  if (!key) throw new Error("OPENAI_API_KEY não configurada.");
  const model =
    process.env.OPENAI_WHATSAPP_MODEL?.trim() ||
    process.env.OPENAI_ASSISTANT_MODEL?.trim() ||
    "gpt-5.6-sol";

  const nullableString = { type: ["string", "null"] };
  const nullableNumber = { type: ["number", "null"] };
  const schema = {
    type: "object",
    additionalProperties: false,
    properties: {
      kind: { type: "string", enum: ["trip", "fueling", "expense", "unknown"] },
      confidence: { type: "number", minimum: 0, maximum: 1 },
      driver: nullableString,
      fleet: nullableString,
      tractor_plate: nullableString,
      trailer_plate: nullableString,
      date: nullableString,
      client: nullableString,
      origin: nullableString,
      destination: nullableString,
      freight_mode: { type: ["string", "null"], enum: ["ton", "trip", "cegonha", "caixinha", null] },
      net_weight: nullableNumber,
      gross_weight: nullableNumber,
      loaded_tons: nullableNumber,
      price_per_ton: nullableNumber,
      fixed_value: nullableNumber,
      km: nullableNumber,
      liters: nullableNumber,
      price_per_liter: nullableNumber,
      station: nullableString,
      category: nullableString,
      description: nullableString,
      asset_type: { type: ["string", "null"], enum: ["tractor", "trailer", null] },
      notes: nullableString,
    },
    required: [
      "kind","confidence","driver","fleet","tractor_plate","trailer_plate","date","client","origin",
      "destination","freight_mode","net_weight","gross_weight","loaded_tons","price_per_ton","fixed_value",
      "km","liters","price_per_liter","station","category","description","asset_type","notes"
    ],
  };

  const instructions = `Você extrai lançamentos operacionais recebidos pelo WhatsApp da transportadora Trans Salomão.
Responda somente pelo schema fornecido. Não invente dados ausentes.
Classifique como trip, fueling, expense ou unknown.
"por tonelada", "R$/t", peso/toneladas => freight_mode "ton".
"diária" ou "por viagem" => freight_mode "trip"; cegonha => "cegonha"; caixinha => "caixinha".
Para peso brasileiro como 41.860 em contexto de carga/toneladas, interprete como 41.860 toneladas, não quarenta e um mil toneladas.
Valores monetários devem ser números em reais. Datas em YYYY-MM-DD quando conhecidas.
Motorista já associado ao telefone: ${driverName || "(não identificado)"}.
Use esse motorista como contexto, mas não invente conjunto/placa.
Só dê confiança >= 0.86 quando existirem dados suficientes para criar o registro com segurança.
Hoje em São Paulo: ${todayBR()}.`;

  const r = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      reasoning: { effort: "low" },
      instructions,
      input: message.slice(0, 5000),
      text: { format: { type: "json_schema", name: "trans_salomao_whatsapp_event", strict: true, schema } },
      max_output_tokens: 1800,
    }),
  });
  const data: any = await r.json();
  if (!r.ok) throw new Error(`OpenAI ${r.status}: ${JSON.stringify(data).slice(0,800)}`);
  const text = outputText(data);
  if (!text) throw new Error("OpenAI retornou resposta vazia.");
  const parsed = JSON.parse(text);
  parsed.confidence = Math.max(0, Math.min(1, Number(parsed.confidence || 0)));
  return parsed as Parsed;
}

function outputText(r: any) {
  if (typeof r?.output_text === "string" && r.output_text.trim()) return r.output_text.trim();
  const parts: string[] = [];
  for (const item of Array.isArray(r?.output) ? r.output : []) {
    if (item?.type !== "message") continue;
    for (const c of Array.isArray(item?.content) ? item.content : []) {
      if (c?.type === "output_text" && typeof c.text === "string") parts.push(c.text);
    }
  }
  return parts.join("\n").trim();
}

async function sendWhatsAppText(to: string, body: string) {
  const token = process.env.WHATSAPP_ACCESS_TOKEN?.trim() || "";
  const phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID?.trim() || "";
  const version = process.env.WHATSAPP_GRAPH_VERSION?.trim() || "";
  if (!token || !phoneId || !version || !to) return false;
  try {
    const r = await fetch(`https://graph.facebook.com/${version}/${phoneId}/messages`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to,
        type: "text",
        text: { body: body.slice(0, 1500) },
      }),
    });
    if (!r.ok) console.error("[whatsapp-ai] reply failed", r.status, (await r.text()).slice(0,500));
    return r.ok;
  } catch (error) {
    console.error("[whatsapp-ai] reply error", error);
    return false;
  }
}
