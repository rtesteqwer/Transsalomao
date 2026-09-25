import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { createFileRoute } from "@tanstack/react-router";
import { getSql } from "@/lib/db";

type Row = Record<string, any>;

type Parsed = {
  kind: "trip" | "fueling" | "expense" | "unknown";
  confidence: number;
  is_weighing_ticket: boolean;
  ticket_number: string | null;
  driver: string | null;
  fleet: string | null;
  tractor_plate: string | null;
  trailer_plate: string | null;
  date: string | null;
  client: string | null;
  origin: string | null;
  destination: string | null;
  carrier: string | null;
  operator: string | null;
  contractor: string | null;
  recipient: string | null;
  product: string | null;
  invoice_number: string | null;
  freight_mode: "ton" | "trip" | "cegonha" | "caixinha" | null;
  net_weight: number | null;
  net_weight_kg: number | null;
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
  if (Number(request.headers.get("content-length") || 0) > 1_000_000) {
    return response({ ok: false, code: "PAYLOAD_TOO_LARGE" }, 413);
  }
  const raw = await request.text();
  if (Buffer.byteLength(raw, "utf8") > 1_000_000) {
    return response({ ok: false, code: "PAYLOAD_TOO_LARGE" }, 413);
  }
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

  if (payload?.object !== "whatsapp_business_account") {
    return response({ ok: false, code: "INVALID_OBJECT" }, 400);
  }
  const phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID?.trim() || "";
  if (!phoneId) return response({ ok: false, code: "WHATSAPP_PHONE_NUMBER_ID_MISSING" }, 503);
  const messages = collectMessages(payload, phoneId);
  const results: Row[] = [];
  let failed = false;
  for (const item of messages) {
    try {
      results.push(await processMessage(item, payload));
    } catch (error: any) {
      failed = true;
      console.error("[whatsapp-ai] message failed", item?.id, error?.name || "Error");
      results.push({ ok: false, id: item?.id || "", code: "PROCESSING_FAILED" });
    }
  }
  return response({ ok: !failed, received: messages.length, results }, failed ? 503 : 200);
}

function collectMessages(payload: any, phoneId: string) {
  const rows: any[] = [];
  for (const entry of Array.isArray(payload?.entry) ? payload.entry : []) {
    for (const change of Array.isArray(entry?.changes) ? entry.changes : []) {
      const value = change?.value || {};
      if (change?.field !== "messages" || value?.messaging_product !== "whatsapp") continue;
      if (String(value?.metadata?.phone_number_id || "") !== phoneId) continue;
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
          groupId: typeof message?.group_id === "string" && message.group_id.trim()
            ? message.group_id.trim() : null,
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
  return rows.filter((x) => x.id && x.from);
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
  const auditId = "wa_" + randomUUID().replace(/-/g, "").slice(0, 18);
  const inserted = await sql<Row>`
    insert into whatsapp_messages
      (id,provider_message_id,sender_phone,sender_name,group_id,message_type,raw_text,media_id,raw_payload,status)
    values
      (${auditId},${item.id},${item.from},${item.name},${item.groupId},${item.type},${item.text},${item.mediaId},
       ${JSON.stringify({ message: item.message, object: fullPayload?.object || "" })}::jsonb,'received')
    on conflict (provider_message_id) do nothing
    returning id
  `;
  if (!inserted[0]) {
    const existing = await sql<Row>`
      select id,status,created_entity_type,created_entity_id
      from whatsapp_messages where provider_message_id=${item.id} limit 1
    `;
    return { ok: true, duplicate: true, ...existing[0] };
  }

  const allowedGroups = (process.env.WHATSAPP_ALLOWED_GROUP_IDS || "")
    .split(",").map((id) => id.trim()).filter(Boolean);
  if (item.groupId && !allowedGroups.includes(item.groupId)) {
    await markPending(auditId, "pending_group_authorization");
    return { ok: true, status: "pending_group_authorization", id: auditId };
  }

  const driver = await resolveDriverForMessage(item);
  if (!driver) {
    await markPending(auditId, "pending_sender_authorization");
    return { ok: true, status: "pending_sender_authorization", id: auditId };
  }

  let imageDataUrl: string | null = null;
  if (item.type === "image" && item.mediaId) {
    try {
      imageDataUrl = await downloadWhatsAppImage(item.mediaId);
    } catch (error: any) {
      await sql`
        update whatsapp_messages
        set status='pending_media',error_message=${String(error?.message || error).slice(0,1000)},processed_at=now()
        where id=${auditId}
      `;
      return { ok: true, status: "pending_media", id: auditId };
    }
  }

  if (!item.text && !imageDataUrl) {
    await sql`
      update whatsapp_messages
      set status='pending_media',processed_at=now()
      where id=${auditId}
    `;
    return { ok: true, status: "pending_media", id: auditId };
  }

  let parsed: Parsed;
  try {
    parsed = await parseWithAI(item.text, driver?.name || null, imageDataUrl);
  } catch (error: any) {
    await sql`
      update whatsapp_messages
      set status='ai_error',error_message=${String(error?.message || error).slice(0,1000)},processed_at=now()
      where id=${auditId}
    `;
    return { ok: true, status: "ai_error", id: auditId };
  }

  await sql`
    update whatsapp_messages
    set parsed_action=${JSON.stringify(parsed)}::jsonb,confidence=${parsed.confidence}
    where id=${auditId}
  `;

  const configuredConfidence = Number(process.env.WHATSAPP_AI_MIN_CONFIDENCE || "0.86");
  const minConfidence = Number.isFinite(configuredConfidence)
    ? Math.max(0.86, Math.min(0.99, configuredConfidence)) : 0.86;
  const autoCommit = process.env.WHATSAPP_AUTO_COMMIT === "1";

  if (parsed.kind === "unknown" || parsed.confidence < minConfidence) {
    await markPending(auditId, "pending_review");
    return { ok: true, status: "pending_review", id: auditId, parsed };
  }

  const imageGroupTrip =
    !!item.groupId &&
    item.type === "image" &&
    parsed.kind === "trip" &&
    parsed.is_weighing_ticket === true;
  if (!imageGroupTrip && !autoCommit) {
    await markPending(auditId, "pending_review");
    return { ok: true, status: "pending_review", id: auditId, parsed };
  }

  const matchedDriver = driver;
  if (parsed.driver && norm(parsed.driver) !== norm(driver.name)) {
    const namedDriver = await findDriverByName(parsed.driver);
    if (!namedDriver || namedDriver.id !== driver.id) {
      await markPending(auditId, "pending_review");
      return { ok: true, status: "pending_review", id: auditId, reason: "Motorista informado difere do remetente cadastrado." };
    }
  }
  const fleet = await findFleet(parsed, matchedDriver?.id || null);

  // Fotos de pesagem recebidas em grupo entram primeiro na Caixa.
  // Assim o peso líquido é capturado automaticamente sem adivinhar preço por tonelada.
  if (imageGroupTrip) {
    try {
      const created = await createImageReport(parsed, matchedDriver, fleet, item.id, imageDataUrl);
      if (process.env.WHATSAPP_SEND_CONFIRMATIONS === "1") {
        await sendWhatsAppText(item.groupId, "Trans Salomão: " + created.summary, true);
      }
      return { ok: true, status: "committed", id: auditId, created };
    } catch (error: any) {
      const msg = String(error?.message || error).slice(0, 1000);
      await sql`
        update whatsapp_messages
        set status='pending_review',error_message=${msg},processed_at=now()
        where id=${auditId}
      `;
      return { ok: true, status: "pending_review", id: auditId, parsed, reason: msg };
    }
  }

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

  if (process.env.WHATSAPP_SEND_CONFIRMATIONS === "1") {
    await sendWhatsAppText(item.groupId || item.from, "Trans Salomão: " + created.summary, !!item.groupId);
  }
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

function configuredGroupDriver(groupId: string | null) {
  if (!groupId) return "";
  const raw = process.env.WHATSAPP_GROUP_DRIVER_MAP?.trim() || "";
  if (!raw) return "";
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return String(parsed[groupId] || "").trim();
    }
  } catch {
    // Também aceita: groupId=Motorista;groupId2=Motorista 2
  }
  for (const pair of raw.split(";")) {
    const i = pair.indexOf("=");
    if (i <= 0) continue;
    if (pair.slice(0, i).trim() === groupId) return pair.slice(i + 1).trim();
  }
  return "";
}

async function findDriverForGroup(groupId: string | null) {
  if (!groupId) return null;
  const sql = await getSql();
  const rows = await sql<Row>`
    select d.*
    from whatsapp_group_drivers g
    join drivers d on d.id=g.driver_id
    where g.group_id=${groupId} and d.status='ativo'
    limit 1
  `;
  return rows[0] || null;
}

async function bindGroupToDriver(groupId: string, driver: Row, source: string) {
  const sql = await getSql();
  await sql`
    insert into whatsapp_group_drivers(group_id,driver_id,source)
    values(${groupId},${driver.id},${source})
    on conflict (group_id) do nothing
  `;
}

async function resolveDriverForMessage(item: any) {
  const groupId = item.groupId || null;

  // Once a group is bound, every ticket in that group belongs to that driver,
  // regardless of which authorized participant forwards the photo.
  const persisted = await findDriverForGroup(groupId);
  if (persisted) return persisted;

  // Explicit environment mapping has priority for first-time group setup.
  const configured = configuredGroupDriver(groupId);
  if (configured) {
    const byName = await findDriverByName(configured);
    if (byName) {
      if (groupId) await bindGroupToDriver(groupId, byName, "configured");
      return byName;
    }
  }

  // Safe auto-learning: bind only when the actual sender phone matches exactly
  // one active driver. Never bind a group merely from a contact/profile name.
  const byPhone = await findDriverByPhone(item.from);
  if (byPhone && groupId) await bindGroupToDriver(groupId, byPhone, "sender_phone");
  return byPhone;
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
  // Uma placa informada nunca deve ser substituída silenciosamente pelo último conjunto.
  if (fleetQ || tractor || trailer) return null;

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

async function createImageReport(
  parsed: Parsed,
  driver: Row | null,
  fleet: Row | null,
  sourceId: string,
  imageDataUrl: string | null,
) {
  if (!driver) throw new Error("Motorista do grupo não identificado com segurança.");
  if (!fleet) throw new Error("Conjunto não identificado com segurança.");
  if (!parsed.is_weighing_ticket) throw new Error("A imagem não foi confirmada como ticket de pesagem.");

  const ticket = String(parsed.ticket_number || "").trim().toUpperCase().replace(/[^A-Z0-9./_-]/g, "");
  if (!ticket || ticket.length > 80) throw new Error("Número físico do ticket não identificado com segurança.");

  const kg = Math.round(num(parsed.net_weight_kg));
  if (!Number.isSafeInteger(kg) || kg < 1000 || kg > 100000) {
    throw new Error("Peso líquido em kg não identificado com segurança na foto.");
  }
  const tons = kg / 1000;

  const sql = await getSql();
  const reportId = "report_" + randomUUID().replace(/-/g, "").slice(0, 12);
  const photoId = "ticket_photo_" + randomUUID().replace(/-/g, "").slice(0, 18);
  const date = isoDate(parsed.date) || todayBR();
  const mime = imageDataUrl?.match(/^data:([^;]+);base64,/)?.[1] || "image/jpeg";
  const ticketData = {
    source: "whatsapp_chatgpt",
    ticket_number: ticket,
    is_weighing_ticket: true,
    tractor_plate: parsed.tractor_plate,
    trailer_plate: parsed.trailer_plate,
    carrier: parsed.carrier,
    operator: parsed.operator,
    contractor: parsed.contractor,
    recipient: parsed.recipient,
    product: parsed.product,
    invoice_number: parsed.invoice_number,
    confidence: parsed.confidence,
    notes: parsed.notes,
  };

  const rows = await sql<Row>`
    with saved_ticket as (
      insert into tickets_balanca
        (numero_ticket,placa_veiculo,placa_carreta,produto,peso_liquido_kg,data_pesagem,
         numero_nf,transportadora,motorista,km_carreta,driver_id,fleet_id,report_id,
         destinatario,freight_mode,ticket_data)
      values
        (${ticket},${parsed.tractor_plate},${parsed.trailer_plate},${parsed.product},${kg},${date},
         ${parsed.invoice_number},${parsed.carrier},${driver.name},${num(parsed.km)},${driver.id},
         ${fleet.id},${reportId},${parsed.recipient},null,${JSON.stringify(ticketData)}::jsonb)
      on conflict (numero_ticket) do nothing
      returning report_id
    ), saved_report as (
      insert into reports
        (id,ticket,driver_id,fleet_id,km,tons,status,freight_mode,loading_date,quantity,trip_billing_type,daily_value)
      select
        report_id,${ticket},${driver.id},${fleet.id},${num(parsed.km)},${tons},
        'pendente',null,${date},1,'fixed',0
      from saved_ticket
      returning id
    ), saved_photo as (
      insert into trip_ticket_photos
        (id,relation_type,relation_id,trip_code,driver_id,driver_name,fleet_id,fleet_name,
         trip_date,freight_mode,net_weight,report_status,file_name,mime_type,image_data,created_by)
      select
        ${photoId},'report',report_id,${ticket},${driver.id},${driver.name},${fleet.id},${fleet.name},
        ${date},null,${tons},'pendente',${"whatsapp-ticket-" + ticket + ".jpg"},${mime},
        ${imageDataUrl || ""},'WhatsApp + ChatGPT'
      from saved_ticket
      where ${imageDataUrl || ""} <> ''
      returning id
    ), marked as (
      update whatsapp_messages
      set status='committed',created_entity_type='report',created_entity_id=${reportId},processed_at=now()
      where provider_message_id=${sourceId}
        and exists (select 1 from saved_report)
      returning id
    )
    select r.id as report_id from saved_report r
  `;

  if (!rows[0]) throw new Error(`Ticket ${ticket} já foi lançado ou não pôde ser registrado.`);

  return {
    type: "report",
    id: reportId,
    summary: `ticket ${ticket} lançado na Caixa para ${driver.name}: peso líquido ${tons.toFixed(3)} t; modalidade a definir pela Gerência.`,
  };
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
    with created as (
    insert into trips
      (id,code,date,client,origin,destination,driver_id,fleet_id,loaded_tons,gross_weight,net_weight,
       freight_mode,price_per_ton,price_per_trip,km_start,km_end,diesel_liters,diesel_price)
    values
      (${id},${code},${date},${parsed.client || ""},${parsed.origin || ""},${parsed.destination || ""},
       ${driver.id},${fleet.id},${num(parsed.loaded_tons) || net},${num(parsed.gross_weight)},${net},
       ${mode},${priceTon},${mode === "ton" ? 0 : fixed},${kmStart},${kmEnd},0,0)
    returning id
    )
    update whatsapp_messages
    set status='committed',created_entity_type='trip',created_entity_id=created.id,processed_at=now()
    from created where provider_message_id=${sourceId}
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
    with created as (
    insert into fuelings(id,date,driver_id,fleet_id,station,km,liters,price_per_liter,notes)
    values(${id},${date},${driver?.id || null},${fleet.id},${parsed.station || ""},${num(parsed.km)},
      ${liters},${price},${[parsed.notes, "WhatsApp " + sourceId].filter(Boolean).join(" | ")})
    returning id
    )
    update whatsapp_messages
    set status='committed',created_entity_type='fueling',created_entity_id=created.id,processed_at=now()
    from created where provider_message_id=${sourceId}
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
    with created as (
    insert into expenses(id,date,fleet_id,asset_type,driver_id,category,description,amount,notes)
    values(${id},${date},${isAdvance ? null : fleet?.id || null},${isAdvance ? null : asset},
      ${isAdvance ? driver?.id || null : null},${category},${parsed.description || "Lançamento via WhatsApp"},
      ${amount},${[parsed.notes, "WhatsApp " + sourceId].filter(Boolean).join(" | ")})
    returning id
    )
    update whatsapp_messages
    set status='committed',created_entity_type='expense',created_entity_id=created.id,processed_at=now()
    from created where provider_message_id=${sourceId}
  `;
  return { type: "expense", id, summary: `despesa de R$ ${amount.toFixed(2)} registrada.` };
}

async function downloadWhatsAppImage(mediaId: string) {
  const token = process.env.WHATSAPP_ACCESS_TOKEN?.trim() || "";
  const version = process.env.WHATSAPP_GRAPH_VERSION?.trim() || "";
  if (!token || !version) throw new Error("Credenciais de mídia do WhatsApp não configuradas.");

  const meta = await fetch(`https://graph.facebook.com/${version}/${encodeURIComponent(mediaId)}`, {
    signal: AbortSignal.timeout(10_000),
    headers: { Authorization: `Bearer ${token}` },
  });
  const info: any = await meta.json().catch(() => ({}));
  if (!meta.ok || !info?.url) throw new Error(`Falha ao obter mídia do WhatsApp (${meta.status}).`);

  const mime = String(info?.mime_type || "image/jpeg").toLowerCase();
  if (!mime.startsWith("image/")) throw new Error("A mídia recebida não é uma imagem.");

  const media = await fetch(String(info.url), {
    signal: AbortSignal.timeout(15_000),
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!media.ok) throw new Error(`Falha ao baixar imagem do WhatsApp (${media.status}).`);
  const bytes = Buffer.from(await media.arrayBuffer());
  if (!bytes.length || bytes.length > 12_000_000) throw new Error("Imagem vazia ou acima do limite de 12 MB.");
  return `data:${mime};base64,${bytes.toString("base64")}`;
}

async function parseWithAI(message: string, driverName: string | null, imageDataUrl: string | null = null): Promise<Parsed> {
  const key = process.env.OPENAI_API_KEY?.trim() || "";
  if (!key) throw new Error("OPENAI_API_KEY não configurada.");
  const model =
    process.env.OPENAI_WHATSAPP_MODEL?.trim() ||
    process.env.OPENAI_TICKET_MODEL?.trim() ||
    process.env.OPENAI_ASSISTANT_MODEL?.trim() ||
    "gpt-5.6-sol";

  const nullableString = { type: ["string", "null"] };
  const nullableNumber = { type: ["number", "null"] };
  const nullableInteger = { type: ["integer", "null"] };
  const schema = {
    type: "object",
    additionalProperties: false,
    properties: {
      kind: { type: "string", enum: ["trip", "fueling", "expense", "unknown"] },
      confidence: { type: "number", minimum: 0, maximum: 1 },
      is_weighing_ticket: { type: "boolean" },
      ticket_number: nullableString,
      driver: nullableString,
      fleet: nullableString,
      tractor_plate: nullableString,
      trailer_plate: nullableString,
      date: nullableString,
      client: nullableString,
      origin: nullableString,
      destination: nullableString,
      carrier: nullableString,
      operator: nullableString,
      contractor: nullableString,
      recipient: nullableString,
      product: nullableString,
      invoice_number: nullableString,
      freight_mode: { type: ["string", "null"], enum: ["ton", "trip", "cegonha", "caixinha", null] },
      net_weight: nullableNumber,
      net_weight_kg: nullableInteger,
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
      "kind","confidence","is_weighing_ticket","ticket_number","driver","fleet",
      "tractor_plate","trailer_plate","date","client","origin","destination","carrier",
      "operator","contractor","recipient","product","invoice_number","freight_mode",
      "net_weight","net_weight_kg","gross_weight","loaded_tons","price_per_ton",
      "fixed_value","km","liters","price_per_liter","station","category","description",
      "asset_type","notes"
    ],
  };

  const instructions = `Você analisa mensagens e fotos operacionais recebidas no WhatsApp da transportadora Trans Salomão.
Responda somente pelo schema. Não invente dados ausentes.

REGRAS PARA FOTO:
- is_weighing_ticket=true SOMENTE quando a imagem for claramente um ticket, tiquete, comprovante ou relatório de pesagem de carga/caminhão.
- Foto comum, documento não relacionado, conversa, veículo, selfie ou imagem sem comprovante de pesagem => is_weighing_ticket=false.
- Em ticket de pesagem: kind="trip"; leia o NÚMERO FÍSICO DO TICKET em ticket_number. Não use agendamento, NF, CNPJ ou outro código.
- Leia o PESO LÍQUIDO impresso em net_weight_kg como inteiro em kg. Se estiver em toneladas, converta (38,470 t = 38470 kg).
- net_weight deve ser o mesmo peso em TONELADAS (38470 kg = 38.470 t). loaded_tons deve repetir esse valor.
- Não confunda bruto, tara, peso de entrada ou peso de saída com peso líquido.
- Se peso líquido não estiver legível mas bruto e tara estiverem claramente legíveis, pode calcular a diferença e explicar em notes.
- Leia placas, transportadora, operadora, contratante, destinatário, produto e NF somente quando realmente visíveis.
- Para foto de ticket, freight_mode=null. A modalidade é escolhida pela Gerência ao fechar na Caixa.
- Se legenda disser cegonha/caixinha/diária/tonelada, preserve apenas em notes; não escolha freight_mode para a foto.
- Só dê confidence >= 0.86 quando ticket_number e net_weight_kg estiverem confiáveis e a imagem for ticket de pesagem.

REGRAS PARA TEXTO:
- "por tonelada", "R$/t" => freight_mode="ton".
- "diária" ou "por viagem" => freight_mode="trip"; cegonha => "cegonha"; caixinha => "caixinha".
- Peso como 41.860 no contexto brasileiro de carga representa 41.860 toneladas, não 41.860 kg.
- Valores monetários em reais; datas em YYYY-MM-DD quando conhecidas.

Motorista já associado ao remetente/grupo: ${driverName || "(não identificado)"}.
Esse nome é apenas contexto de roteamento; não invente conjunto ou placa.
Hoje em São Paulo: ${todayBR()}.`;

  const r = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    signal: AbortSignal.timeout(35_000),
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      reasoning: { effort: "low" },
      instructions,
      input: imageDataUrl ? [{
        role: "user",
        content: [
          {
            type: "input_text",
            text: message?.trim()
              ? `Legenda/mensagem do WhatsApp: ${message.slice(0, 5000)}\nAnalise a imagem.`
              : "Analise a imagem. Só marque como viagem automática se for claramente um ticket de pesagem.",
          },
          { type: "input_image", image_url: imageDataUrl, detail: "high" },
        ],
      }] : message.slice(0, 5000),
      text: { format: { type: "json_schema", name: "trans_salomao_whatsapp_event", strict: true, schema } },
      max_output_tokens: 2200,
    }),
  });
  const data: any = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`OpenAI ${r.status}: ${JSON.stringify(data).slice(0,800)}`);
  const text = outputText(data);
  if (!text) throw new Error("OpenAI retornou resposta vazia.");
  const parsed = JSON.parse(text);
  const confidence = Number(parsed.confidence);
  parsed.confidence = Number.isFinite(confidence) ? Math.max(0, Math.min(1, confidence)) : 0;

  if (parsed.net_weight_kg != null) {
    const kg = Math.round(Number(parsed.net_weight_kg));
    parsed.net_weight_kg = Number.isSafeInteger(kg) && kg > 0 ? kg : null;
    if (parsed.net_weight_kg) {
      parsed.net_weight = parsed.net_weight_kg / 1000;
      parsed.loaded_tons = parsed.net_weight_kg / 1000;
    }
  }

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

async function sendWhatsAppText(to: string, body: string, isGroup = false) {
  const token = process.env.WHATSAPP_ACCESS_TOKEN?.trim() || "";
  const phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID?.trim() || "";
  const version = process.env.WHATSAPP_GRAPH_VERSION?.trim() || "";
  if (!token || !phoneId || !version || !to) return false;
  try {
    const r = await fetch(`https://graph.facebook.com/${version}/${phoneId}/messages`, {
      method: "POST",
      signal: AbortSignal.timeout(10_000),
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        ...(isGroup ? { recipient_type: "group" } : {}),
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
