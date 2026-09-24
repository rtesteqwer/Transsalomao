import { createHash } from "node:crypto";
import { createFileRoute } from "@tanstack/react-router";
import { getSql } from "@/lib/db";
import { ticketAccess, allowTicketRead } from "@/lib/ticket-auth.server";
import { json, normalizeFreightMode, readBody, validateImage, ticketErrorResponse, TicketError } from "@/lib/ticket-core";
import {
  readTicketWithSalomaoIA,
  readTicketFromSalomaoOcr,
  SalomaoVisionUnavailable,
} from "@/lib/salomao-ticket-reader.server";

export const Route = createFileRoute("/api/ler-ticket")({
  server: { handlers: {
    GET: async ({ request }) => {
      try {
        const access = ticketAccess(request);
        return json({
          authenticated: true,
          ...access,
          available: true,
          engine: "salomao-ia",
          localOcrFallback: true,
        });
      } catch (error) { return ticketErrorResponse(error); }
    },

    POST: async ({ request }) => {
      let archiveId = "";
      let sql: any = null;
      try {
        const access = ticketAccess(request);
        const body = await readBody(request);
        const freightMode = normalizeFreightMode(body.freightMode);

        // OCR local do celular volta para a Salomão IA apenas para interpretação.
        // A foto original já foi arquivada na primeira tentativa com imagem.
        if (typeof body.ocrText === "string") {
          const fileName = typeof body.fileName === "string" ? body.fileName.slice(0, 160) : "";
          return json(readTicketFromSalomaoOcr(body.ocrText, freightMode, fileName));
        }

        const image = validateImage(body);
        sql = await getSql();
        if (access.driverId) {
          const drivers = await sql<{ status: string }>`select status from drivers where id=${access.driverId} limit 1`;
          if (drivers[0]?.status !== "ativo") throw new TicketError(403, "Motorista inativo. Consulte a gerência.");
        }
        await allowTicketRead(sql, `${access.role}:${access.username}`);

        // Toda foto realmente enviada ao leitor fica arquivada de forma privada.
        // O arquivo não é exposto ao motorista nem aos demais administradores.
        archiveId = await archiveOriginalPhoto(sql, {
          image,
          fileName: typeof body.fileName === "string" ? body.fileName : "ticket.jpg",
          freightMode,
          access,
          fleetId: typeof body.fleetId === "string" ? body.fleetId : null,
          fleetName: typeof body.fleetName === "string" ? body.fleetName : null,
        });

        try {
          const result = await readTicketWithSalomaoIA(sql, image, freightMode);
          await finalizeArchivedPhoto(sql, archiveId, result, "lido");
          return json(result);
        } catch (error) {
          if (error instanceof SalomaoVisionUnavailable) {
            await markArchivedPhoto(sql, archiveId, "aguardando_ocr_local", error.message);
            return json({
              erro: error.message,
              code: "SALOMAO_LOCAL_OCR",
              ocrFallback: true,
            }, 503);
          }
          await markArchivedPhoto(sql, archiveId, "erro_leitura", error instanceof Error ? error.message : "Falha na leitura");
          throw error;
        }
      } catch (error) {
        if (archiveId && sql) {
          await markArchivedPhoto(sql, archiveId, "erro_leitura", error instanceof Error ? error.message : "Falha na leitura").catch(() => {});
        }
        return ticketErrorResponse(error);
      }
    },
  } },
});

async function ensurePhotoArchive(sql: any) {
  await sql`
    create table if not exists trip_ticket_photos (
      id text primary key,
      relation_type text not null,
      relation_id text not null,
      trip_code text not null,
      driver_id text,
      driver_name text,
      fleet_id text,
      fleet_name text,
      trip_date date,
      freight_mode text,
      net_weight double precision,
      report_status text,
      file_name text not null,
      mime_type text not null,
      image_data text not null,
      ticket_data jsonb,
      notes text,
      created_at timestamptz not null default now(),
      created_by text,
      updated_at timestamptz not null default now(),
      updated_by text
    )
  `;
  await sql`alter table trip_ticket_photos add column if not exists ticket_data jsonb`;
  await sql`alter table trip_ticket_photos add column if not exists notes text`;
  await sql`alter table trip_ticket_photos add column if not exists updated_at timestamptz not null default now()`;
  await sql`alter table trip_ticket_photos add column if not exists updated_by text`;
  await sql`create index if not exists trip_ticket_photos_created_idx on trip_ticket_photos (created_at desc)`;
}

async function archiveOriginalPhoto(sql: any, input: {
  image: { base64: string; mime: string };
  fileName: string;
  freightMode: string;
  access: { role: string; username: string; driverId: string | null };
  fleetId: string | null;
  fleetName: string | null;
}) {
  await ensurePhotoArchive(sql);
  const dataUrl = `data:${input.image.mime};base64,${input.image.base64}`;
  const id = "auto_photo_" + createHash("sha256")
    .update(input.access.username + ":" + input.fileName + ":" + input.image.base64)
    .digest("hex")
    .slice(0, 28);
  const safeName = String(input.fileName || "ticket.jpg").replace(/[^A-Za-z0-9._ -]/g, "_").trim().slice(0, 120) || "ticket.jpg";

  await sql`
    insert into trip_ticket_photos
      (id, relation_type, relation_id, trip_code, driver_id, driver_name, fleet_id, fleet_name,
       freight_mode, report_status, file_name, mime_type, image_data, ticket_data, created_by, updated_by)
    values
      (${id}, 'reading', ${id}, 'Leitura pendente', ${input.access.driverId}, ${input.access.username},
       ${input.fleetId}, ${input.fleetName}, ${input.freightMode}, 'recebido', ${safeName},
       ${input.image.mime}, ${dataUrl}, ${JSON.stringify({})}::jsonb, ${input.access.username}, ${input.access.username})
    on conflict (id) do update set
      updated_at=now(),
      report_status='recebido',
      updated_by=excluded.updated_by
  `;
  return id;
}

async function finalizeArchivedPhoto(sql: any, id: string, ticket: any, status: string) {
  if (!id) return;
  const code = String(ticket?.numero_ticket || "Leitura sem número").trim().slice(0, 120);
  const netWeight = ticket?.peso_liquido_kg == null ? null : Number(ticket.peso_liquido_kg);
  await sql`
    update trip_ticket_photos
    set trip_code=${code},
        net_weight=${Number.isFinite(netWeight) ? netWeight : null},
        report_status=${status},
        ticket_data=${JSON.stringify(ticket || {})}::jsonb,
        updated_at=now()
    where id=${id}
  `;
}

async function markArchivedPhoto(sql: any, id: string, status: string, note: string) {
  if (!id) return;
  await sql`
    update trip_ticket_photos
    set report_status=${status},
        notes=${String(note || "").slice(0, 1000)},
        updated_at=now()
    where id=${id}
  `;
}
