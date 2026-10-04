import { randomUUID } from "node:crypto";
import { createFileRoute } from "@tanstack/react-router";
import { getSql } from "@/lib/db";
import { ticketAccess } from "@/lib/ticket-auth.server";
import { TicketError } from "@/lib/ticket-core";

const MAX_FILE_BYTES = 30_000_000;
const MAX_CHUNK_B64 = 800_000;

export const Route = createFileRoute("/api/photo-upload")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let access: ReturnType<typeof ticketAccess>;
        try {
          access = ticketAccess(request);
        } catch (error) {
          if (error instanceof TicketError) return json({ ok: false, message: error.message }, error.status);
          return json({ ok: false, message: "Entre novamente para enviar a foto." }, 401);
        }

        let body: any = {};
        try {
          if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
            return json({ ok: false, message: "Envio inválido." }, 415);
          }
          body = await request.json();
        } catch {
          return json({ ok: false, message: "Dados de upload inválidos." }, 400);
        }

        const sql = await getSql();
        await ensureTables(sql);
        const action = String(body?.action || "");
        const owner = String(access.username || access.role || "usuario").slice(0, 200);

        if (action === "start") {
          const fileName = safeFileName(String(body?.fileName || "ticket.jpg"));
          const mimeType = String(body?.mimeType || "application/octet-stream").slice(0, 120);
          const size = Number(body?.size || 0);
          if (!Number.isSafeInteger(size) || size <= 0 || size > MAX_FILE_BYTES) {
            return json({ ok: false, message: "A foto deve ter até 30 MB." }, 413);
          }
          if (!mimeType.startsWith("image/") && !/\.(jpe?g|png|webp|heic|heif)$/i.test(fileName)) {
            return json({ ok: false, message: "Selecione uma imagem válida." }, 415);
          }
          const uploadId = "ticket_upload_" + randomUUID().replace(/-/g, "");
          await sql`
            insert into ticket_photo_upload_sessions
              (id, created_by, file_name, mime_type, declared_size, created_at)
            values
              (${uploadId}, ${owner}, ${fileName}, ${mimeType}, ${size}, now())
          `;
          return json({ ok: true, uploadId });
        }

        const uploadId = String(body?.uploadId || "").trim();
        if (!uploadId) return json({ ok: false, message: "Upload inválido." }, 400);

        const sessions = await sql<Record<string, any>>`
          select id, created_by, file_name, mime_type, declared_size
          from ticket_photo_upload_sessions
          where id=${uploadId}
          limit 1
        `;
        const session = sessions[0];
        if (!session) return json({ ok: false, message: "Upload expirado ou não encontrado." }, 404);
        if (String(session.created_by || "").toLocaleLowerCase("pt-BR") !== owner.toLocaleLowerCase("pt-BR") && access.role !== "admin") {
          return json({ ok: false, message: "Upload não autorizado." }, 403);
        }

        if (action === "chunk") {
          const index = Number(body?.index);
          const data = String(body?.data || "");
          if (!Number.isSafeInteger(index) || index < 0 || index > 100) return json({ ok: false, message: "Parte inválida." }, 400);
          if (!data || data.length > MAX_CHUNK_B64 || !/^[A-Za-z0-9+/]+={0,2}$/.test(data)) {
            return json({ ok: false, message: "Parte da foto inválida." }, 400);
          }
          await sql`
            insert into ticket_photo_upload_chunks (upload_id, chunk_index, data)
            values (${uploadId}, ${index}, ${data})
            on conflict (upload_id, chunk_index) do update set data=excluded.data
          `;
          return json({ ok: true, index });
        }

        if (action === "finish") {
          const chunks = await sql<Record<string, any>>`
            select chunk_index, data
            from ticket_photo_upload_chunks
            where upload_id=${uploadId}
            order by chunk_index asc
          `;
          if (!chunks.length) return json({ ok: false, message: "Nenhuma parte da foto foi recebida." }, 400);

          const buffers = chunks.map((row) => Buffer.from(String(row.data || ""), "base64"));
          const original = Buffer.concat(buffers);
          if (!original.length || original.length > MAX_FILE_BYTES) return json({ ok: false, message: "Foto inválida ou grande demais." }, 413);
          const declaredSize = Number(session.declared_size || 0);
          if (declaredSize > 0 && original.length !== declaredSize) {
            return json({ ok: false, message: "O upload ficou incompleto. Selecione a foto novamente." }, 409);
          }

          let sourceImage = original;
          const originalName = String(session.file_name || "");
          const originalMime = String(session.mime_type || "").toLowerCase();
          const needsHeicDecode = /\.(?:heic|heif)$/i.test(originalName) || /image\/hei[cf]/i.test(originalMime);

          if (needsHeicDecode) {
            try {
              const heicModule: any = await import("heic-convert");
              const convert: any = heicModule.default ?? heicModule;
              const converted = await convert({
                buffer: original,
                format: "JPEG",
                quality: 0.92,
              });
              sourceImage = Buffer.from(converted);
            } catch (error) {
              console.error("[photo-upload] HEIC conversion failed", error instanceof Error ? error.message : "unknown");
              return json({ ok: false, message: "Não foi possível abrir esta foto HEIC. Selecione a imagem novamente para tentar de novo." }, 415);
            }
          }

          let jpeg: Buffer;
          try {
            const sharp = (await import("sharp")).default;
            let width = 1800;
            let quality = 82;
            jpeg = await sharp(sourceImage, { failOn: "none" })
              .rotate()
              .resize({ width, height: width, fit: "inside", withoutEnlargement: true })
              .jpeg({ quality, mozjpeg: true })
              .toBuffer();
            while (jpeg.toString("base64").length > 2_700_000 && width > 800) {
              width -= 200;
              quality = Math.max(48, quality - 7);
              jpeg = await sharp(sourceImage, { failOn: "none" })
                .rotate()
                .resize({ width, height: width, fit: "inside", withoutEnlargement: true })
                .jpeg({ quality, mozjpeg: true })
                .toBuffer();
            }
          } catch (error) {
            console.error("[photo-upload] conversion failed", error instanceof Error ? error.message : "unknown");
            return json({ ok: false, message: "Não foi possível converter esta foto. Tente compartilhar a imagem como JPG ou PNG." }, 415);
          }

          const base64 = jpeg.toString("base64");
          if (base64.length > 2_700_000) return json({ ok: false, message: "Não foi possível reduzir esta foto para envio." }, 413);
          const imageData = "data:image/jpeg;base64," + base64;
          const photoId = "ticket_photo_" + randomUUID().replace(/-/g, "");
          const driverId = textValue(body?.driverId);
          const driverName = textValue(body?.driverName);
          const fleetId = textValue(body?.fleetId);
          const fleetName = textValue(body?.fleetName);
          const freightMode = textValue(body?.freightMode);
          const reportStatus = textValue(body?.reportStatus) || "aguardando leitura";

          await sql`
            insert into trip_ticket_photos
              (id, relation_type, relation_id, trip_code, driver_id, driver_name, fleet_id, fleet_name,
               trip_date, freight_mode, net_weight, report_status, file_name, mime_type, image_data, created_by)
            values
              (${photoId}, 'unlinked', 'pending', 'Aguardando vínculo', ${driverId}, ${driverName},
               ${fleetId}, ${fleetName}, current_date, ${freightMode}, null, ${reportStatus},
               ${session.file_name}, 'image/jpeg', ${imageData}, ${owner})
          `;

          await sql`delete from ticket_photo_upload_sessions where id=${uploadId}`;
          return json({
            ok: true,
            id: photoId,
            imageData,
            fileName: session.file_name,
            mimeType: "image/jpeg",
            originalMimeType: session.mime_type,
            originalSize: original.length,
          });
        }

        if (action === "cancel") {
          await sql`delete from ticket_photo_upload_sessions where id=${uploadId}`;
          return json({ ok: true });
        }

        return json({ ok: false, message: "Ação de upload inválida." }, 400);
      },
    },
  },
});

async function ensureTables(sql: any) {
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
      created_at timestamptz not null default now(),
      created_by text
    )
  `;
  await sql`
    create table if not exists ticket_photo_upload_sessions (
      id text primary key,
      created_by text not null,
      file_name text not null,
      mime_type text,
      declared_size bigint not null,
      created_at timestamptz not null default now()
    )
  `;
  await sql`
    create table if not exists ticket_photo_upload_chunks (
      upload_id text not null references ticket_photo_upload_sessions(id) on delete cascade,
      chunk_index integer not null,
      data text not null,
      primary key (upload_id, chunk_index)
    )
  `;
  await sql`delete from ticket_photo_upload_sessions where created_at < now() - interval '2 hours'`;
}

function safeFileName(value: string) {
  const clean = value.replace(/[^A-Za-z0-9._ -]/g, "_").trim().slice(0, 120);
  return clean || "ticket.jpg";
}

function textValue(value: unknown) {
  const text = String(value ?? "").trim();
  return text ? text.slice(0, 300) : null;
}

function json(value: unknown, status = 200) {
  return Response.json(value, {
    status,
    headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" },
  });
}
