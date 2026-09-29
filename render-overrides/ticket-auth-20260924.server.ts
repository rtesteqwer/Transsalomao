import { createHash, timingSafeEqual } from "node:crypto";
import { managementSession } from "@/lib/management-auth.server";
import { klebersomSession } from "@/lib/klebersom-access.server";
import { TicketError } from "@/lib/ticket-core";
import type { Sql } from "@/lib/db";

export function ticketAccess(request: Request) {
  const expected = process.env.TICKET_TOKEN?.trim();
  const supplied = request.headers.get("x-app-token") || "";
  if (expected && expected.length >= 32 && Buffer.byteLength(supplied) === Buffer.byteLength(expected) && timingSafeEqual(Buffer.from(supplied), Buffer.from(expected))) {
    return { role: "service" as const, username: "integração", driverId: null };
  }
  const origin = request.headers.get("origin");
  if ((origin && origin !== new URL(request.url).origin) || request.headers.get("sec-fetch-site") === "cross-site") throw new TicketError(403, "Origem não autorizada.");
  const driver = klebersomSession();
  if (driver) return { role: "driver" as const, username: driver.username, driverId: driver.driverId };
  // Unlike the historical management helper, tickets never accept the public test secret.
  if (process.env.MANAGEMENT_SESSION_SECRET?.trim() || process.env.DATABASE_URL?.trim()) {
    const manager = managementSession();
    if (manager) return { role: "admin" as const, username: manager.username, driverId: null };
  }
  throw new TicketError(401, "Entre com seu login para ler e lançar o ticket pela foto.");
}

export async function allowTicketRead(sql: Sql, identity: string) {
  const key = createHash("sha256").update(identity).digest("hex");
  const rows = await sql<{ used: number }>`
    insert into ticket_read_limits (identity_hash, window_start, used) values (${key}, now(), 1)
    on conflict (identity_hash) do update set
      window_start = case when ticket_read_limits.window_start < now() - interval '1 minute' then now() else ticket_read_limits.window_start end,
      used = case when ticket_read_limits.window_start < now() - interval '1 minute' then 1 else ticket_read_limits.used + 1 end
    where ticket_read_limits.window_start < now() - interval '1 minute' or ticket_read_limits.used < 20
    returning used
  `;
  if (!rows[0]) throw new TicketError(429, "Muitas leituras em pouco tempo. Aguarde um minuto.");
}
