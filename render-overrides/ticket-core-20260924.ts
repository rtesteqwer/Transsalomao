import type { Sql } from "@/lib/db";

export class TicketError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

export const MAX_IMAGE_BASE64 = 3_500_000;
const MAX_INTEGER = 2_147_483_647;
export const freightModes = ["ton", "trip", "cegonha", "caixinha"] as const;
export type TicketFreightMode = typeof freightModes[number];
const textFields = ["numero_ticket", "status", "placa_veiculo", "placa_carreta", "produto", "pesagem_inicial_data", "pesagem_final_data", "numero_nf", "transportadora", "motorista", "cliente", "destinatario", "anotacoes_manuscritas", "operadora", "contratante", "remetente", "empresa_documento", "transportadora_cnpj", "destinatario_cnpj", "navio", "navio_origem", "navio_destino", "operador_pesagem", "emissor", "model_type"] as const;
const weightFields = ["pesagem_inicial_kg", "pesagem_final_kg", "peso_liquido_kg", "peso_origem_kg"] as const;
export type TicketData = Record<typeof textFields[number], string | null> & Record<typeof weightFields[number], number | null> & { alertas: string[]; placas_detectadas?: string[]; campos_ausentes?: string[] };

export function json(value: unknown, status = 200) {
  return Response.json(value, { status, headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } });
}

export function ticketErrorResponse(error: unknown) {
  if (error instanceof TicketError) return json({ erro: error.message }, error.status);
  console.error("[ticket] operation failed", error instanceof Error ? error.name : "unknown");
  return json({ erro: "Não foi possível concluir. Tente novamente; o ticket não será duplicado." }, 503);
}

export async function readBody(request: Request, maxBytes = 3_600_000): Promise<Record<string, unknown>> {
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) throw new TicketError(415, "Envie os dados em JSON.");
  if (Number(request.headers.get("content-length")) > maxBytes) throw new TicketError(413, "A foto é grande demais. Reduza a imagem.");
  const raw = await request.text();
  if (Buffer.byteLength(raw) > maxBytes) throw new TicketError(413, "A foto é grande demais. Reduza a imagem.");
  try {
    const value = JSON.parse(raw);
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error();
    return value;
  } catch { throw new TicketError(400, "Dados inválidos."); }
}

export function validateImage(body: Record<string, unknown>) {
  if (typeof body.imagem !== "string" || !body.imagem) throw new TicketError(400, "Escolha uma foto do ticket.");
  const dataUrl = body.imagem.match(/^data:([^;]+);base64,(.*)$/s);
  const mime = String(body.tipo || dataUrl?.[1] || "image/jpeg");
  const base64 = dataUrl?.[2] ?? body.imagem;
  if (base64.length > MAX_IMAGE_BASE64) throw new TicketError(413, "A foto é grande demais. Reduza a imagem.");
  if (dataUrl && dataUrl[1] !== mime) throw new TicketError(400, "Formato da foto inconsistente.");
  if (!base64 || base64.length % 4 !== 0 || !/^[A-Za-z0-9+/]+={0,2}$/.test(base64)) throw new TicketError(400, "Foto inválida. Escolha novamente.");
  const bytes = Buffer.from(base64, "base64");
  const valid = (
    (mime === "image/jpeg" && bytes.subarray(0, 3).equals(Buffer.from([255, 216, 255]))) ||
    (mime === "image/png" && bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) ||
    (mime === "image/webp" && bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WEBP")
  );
  if (!valid || bytes.length < 12) throw new TicketError(415, "Use uma foto JPG, PNG ou WebP válida.");
  return { base64, mime };
}

function nullableText(value: unknown) {
  return typeof value === "string" || typeof value === "number" ? String(value).trim().slice(0, 2000) || null : null;
}

export function kilograms(value: unknown) {
  if (value == null || value === "") return null;
  if (typeof value !== "number" && typeof value !== "string") return null;
  let raw = String(value).trim();
  if (/^\d{1,3}(\.\d{3})+(,0+)?$/.test(raw)) raw = raw.replace(/\./g, "").replace(",", ".");
  else if (/^\d{1,3}(,\d{3})+(\.0+)?$/.test(raw)) raw = raw.replace(/,/g, "");
  else raw = raw.replace(",", ".");
  if (!/^\d+(\.\d+)?$/.test(raw)) return null;
  const number = Number(raw);
  return Number.isSafeInteger(number) && number >= 0 && number <= MAX_INTEGER ? number : null;
}

export function normalizeFreightMode(value: unknown): TicketFreightMode {
  return freightModes.includes(value as TicketFreightMode) ? value as TicketFreightMode : "ton";
}

export function normalizeTicket(value: unknown): TicketData {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new TicketError(502, "A leitura não retornou dados válidos. Tente outra foto.");
  const source = value as Record<string, unknown>;
  const result = {} as TicketData;
  for (const key of textFields) result[key] = nullableText(source[key]);
  if (!result.destinatario && result.cliente) result.destinatario = result.cliente;
  if (!result.cliente && result.destinatario) result.cliente = result.destinatario;
  for (const key of ["placa_veiculo", "placa_carreta"] as const) result[key] = result[key]?.toUpperCase().replace(/[^A-Z0-9]/g, "") || null;
  for (const key of ["placa_veiculo", "placa_carreta"] as const) {
    if (result[key] && !/^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$/.test(result[key]!)) result[key] = null;
  }
  result.placas_detectadas = Array.isArray(source.placas_detectadas)
    ? [...new Set(source.placas_detectadas.filter((x): x is string => typeof x === "string").map(x => x.toUpperCase().replace(/[^A-Z0-9]/g, "")).filter(x => /^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$/.test(x)))].slice(0, 8) : [];
  for (const key of weightFields) result[key] = kilograms(source[key]);
  result.alertas = Array.isArray(source.alertas) ? source.alertas.filter((x): x is string => typeof x === "string").slice(0, 20).map(x => x.slice(0, 500)) : [];
  const { pesagem_inicial_kg: ini, pesagem_final_kg: fim, peso_liquido_kg: liq } = result;
  if (ini != null && fim != null && liq != null && Math.abs(ini - fim) !== liq) result.alertas.push(`Peso líquido (${liq} kg) diferente das pesagens (${Math.abs(ini - fim)} kg). Confira o valor impresso.`);
  if (!result.numero_ticket) result.alertas.push("Número do ticket não identificado. Confira na foto.");
  if (liq == null || liq <= 0) result.alertas.push("Peso líquido não identificado com segurança. Confira na foto.");
  return result;
}

export function ticketForMode(ticket: TicketData, mode: TicketFreightMode): TicketData {
  if (mode === "ton") return ticket;
  return {
    ...ticket,
    pesagem_inicial_kg: null,
    pesagem_final_kg: null,
    peso_liquido_kg: null,
    peso_origem_kg: null,
    alertas: ticket.alertas.filter((alerta) => !/peso|pesagem/i.test(alerta)),
  };
}

export function parseTicketResponse(text: string, mode: TicketFreightMode = "ton") {
  try { return ticketForMode(normalizeTicket(JSON.parse(text.replace(/^\`\`\`(?:json)?\s*|\s*\`\`\`$/gi, "").trim())), mode); }
  catch (error) { if (error instanceof TicketError) throw error; throw new TicketError(502, "A leitura ficou incompleta. Tente outra foto."); }
}

export function validateSave(body: Record<string, unknown>) {
  if (body.conferido !== true) throw new TicketError(400, "Confirme a conferência do ticket antes de lançar.");
  const freightMode = normalizeFreightMode(body.freightMode);
  const normalized = normalizeTicket(body);
  const ticket = ticketForMode(normalized, freightMode);
  const numero = ticket.numero_ticket?.trim().toUpperCase();
  if (!numero || numero.length > 80 || /[\x00-\x1f]/.test(numero)) throw new TicketError(400, "Confira o número do ticket (até 80 caracteres).");

  let tons = 0;
  if (freightMode === "ton") {
    if (typeof body.peso_liquido_kg !== "number" || !Number.isSafeInteger(body.peso_liquido_kg) || body.peso_liquido_kg <= 0 || body.peso_liquido_kg > MAX_INTEGER) {
      throw new TicketError(400, "Informe o peso líquido em kg inteiros, maior que zero.");
    }
    tons = body.peso_liquido_kg / 1000;
  }

  const driverId = typeof body.driverId === "string" ? body.driverId.trim() : "";
  const fleetId = typeof body.fleetId === "string" ? body.fleetId.trim() : "";
  if (!driverId || !fleetId || driverId.length > 100 || fleetId.length > 100) throw new TicketError(400, "Escolha motorista e conjunto.");
  const km = body.km_carreta ?? 0;
  if (typeof km !== "number" || !Number.isSafeInteger(km) || km < 0 || km > MAX_INTEGER) throw new TicketError(400, "Informe uma quilometragem válida.");
  const dailyValueRaw = freightMode === "trip" ? Number(body.dailyValue ?? 0) : 0;
  if (!Number.isFinite(dailyValueRaw) || dailyValueRaw < 0 || dailyValueRaw > 100_000_000) throw new TicketError(400, "Informe um valor de diária válido.");
  return { ticket: { ...ticket, numero_ticket: numero }, driverId, fleetId, km, tons, dailyValue: dailyValueRaw, freightMode };
}

export async function saveTicket(sql: Sql, data: ReturnType<typeof validateSave>) {
  const { ticket: d, driverId, fleetId, km, tons, dailyValue, freightMode } = data;
  const [drivers, fleets] = await Promise.all([
    sql<{ name: string; status: string }>`select name,status from drivers where id=${driverId} limit 1`,
    sql<{ status: string }>`select status from fleets where id=${fleetId} limit 1`,
  ]);
  if (drivers[0]?.status !== "ativo") throw new TicketError(400, "Motorista inválido ou inativo.");
  if (fleets[0]?.status !== "ativo") throw new TicketError(400, "Conjunto inválido ou inativo.");
  const reportId = `rep_${crypto.randomUUID().replace(/-/g, "")}`;

  const rows = await sql<{ id: number; report_id: string }>`
    with saved_ticket as (
      insert into tickets_balanca (numero_ticket, placa_veiculo, placa_carreta, produto,
        pesagem_inicial_kg, pesagem_final_kg, peso_liquido_kg, data_pesagem,
        numero_nf, transportadora, destinatario, motorista, km_carreta, driver_id, fleet_id,
        report_id, ticket_data, freight_mode)
      select ${d.numero_ticket}, ${d.placa_veiculo}, ${d.placa_carreta}, ${d.produto},
        ${d.pesagem_inicial_kg}, ${d.pesagem_final_kg}, ${d.peso_liquido_kg}, ${d.pesagem_final_data || d.pesagem_inicial_data},
        ${d.numero_nf}, ${d.transportadora}, ${d.destinatario}, ${drivers[0].name}, ${km}, ${driverId}, ${fleetId},
        ${reportId}, ${JSON.stringify(d)}::jsonb, ${freightMode}
      where not exists (select 1 from tickets_balanca where upper(btrim(numero_ticket)) = ${d.numero_ticket})
      on conflict (numero_ticket) do nothing returning id, report_id
    ), saved_report as (
      insert into reports (id, ticket, driver_id, fleet_id, km, tons, daily_value, freight_mode, status)
      select report_id, ${d.numero_ticket}, ${driverId}, ${fleetId}, ${km}, ${tons}, ${dailyValue}, ${freightMode}, 'pendente'
      from saved_ticket returning id
    )
    select t.id, t.report_id from saved_ticket t join saved_report r on r.id=t.report_id
  `;
  if (!rows[0]) throw new TicketError(409, `Ticket ${d.numero_ticket} já foi lançado.`);
  return { ok: true, id: rows[0].id, reportId: rows[0].report_id, ticket: d.numero_ticket, tons, freightMode };
}
