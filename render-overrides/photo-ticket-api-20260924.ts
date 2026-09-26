import { createHash } from "node:crypto";
import { createFileRoute } from "@tanstack/react-router";
import { getSql } from "@/lib/db";
import { managementSession } from "@/lib/management-auth.server";

function felipeSession() {
  const session = managementSession();
  if (!session) return { ok: false as const, status: 401, message: "Entre na Gerência para acessar as fotos dos tickets." };
  if (String(session.username || "").trim().toLocaleLowerCase("pt-BR") !== "felipe") {
    return { ok: false as const, status: 403, message: "Esta área é exclusiva do usuário Felipe." };
  }
  return { ok: true as const, session };
}

function sameOriginMutation(request: Request) {
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) return false;
  return request.headers.get("sec-fetch-site") !== "cross-site";
}

export const Route = createFileRoute("/api/photo-intake")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const access = felipeSession();
        if (!access.ok) return json({ ok: false, message: access.message }, access.status);
        const session = access.session;

        const sql = await getSql();
        await ensureTable(sql);
        const url = new URL(request.url);
        const id = String(url.searchParams.get("id") || "").trim();

        if (id) {
          const rows = await sql<Record<string, any>>`
            select image_data, mime_type, file_name
            from trip_ticket_photos
            where id=${id}
            limit 1
          `;
          const row = rows[0];
          if (!row) return json({ ok: false, message: "Foto não encontrada." }, 404);

          const match = String(row.image_data || "").match(/^data:([^;]+);base64,(.+)$/);
          if (!match) return json({ ok: false, message: "Arquivo de imagem inválido." }, 500);
          const bytes = Buffer.from(match[2], "base64");
          return new Response(bytes, {
            status: 200,
            headers: {
              "Content-Type": String(row.mime_type || match[1] || "image/jpeg"),
              "Content-Disposition": 'inline; filename="' + safeFileName(String(row.file_name || "ticket.jpg")) + '"',
              "Cache-Control": "private, no-store",
              "X-Content-Type-Options": "nosniff",
            },
          });
        }

        const rows = await sql<Record<string, any>>`
          select
            id,
            relation_type,
            relation_id,
            trip_code,
            driver_name,
            fleet_name,
            trip_date,
            freight_mode,
            net_weight,
            file_name,
            created_at,
            created_by
          from trip_ticket_photos
          order by created_at desc
          limit 250
        `;

        return json({
          ok: true,
          photos: rows.map((row) => ({
            id: row.id,
            relationType: row.relation_type,
            relationId: row.relation_id,
            tripCode: row.trip_code,
            driverName: row.driver_name,
            fleetName: row.fleet_name,
            tripDate: row.trip_date,
            freightMode: row.freight_mode,
            netWeight: row.net_weight == null ? null : Number(row.net_weight),
            fileName: row.file_name,
            createdAt: row.created_at,
            createdBy: row.created_by,
          })),
        });
      },

      POST: async ({ request }) => {
        const access = felipeSession();
        if (!access.ok) return json({ ok: false, message: access.message }, access.status);
        if (!sameOriginMutation(request)) return json({ ok: false, message: "Origem não autorizada." }, 403);
        const session = access.session;

        let body: any = {};
        try {
          body = await request.json();
        } catch {
          return json({ ok: false, message: "Dados inválidos." }, 400);
        }

        const image = String(body?.image || "");
        const fileName = safeFileName(String(body?.fileName || "ticket.jpg"));
        const relationType = String(body?.relationType || "") as "trip" | "report";
        const relationId = String(body?.relationId || "").trim();
        const tripCode = String(body?.tripCode || "").trim();

        if (relationType !== "trip" && relationType !== "report") return json({ ok: false, message: "Tipo de vínculo inválido." }, 400);
        if (!relationId || !tripCode) return json({ ok: false, message: "Escolha a viagem correta antes de salvar a foto." }, 400);
        if (!image.startsWith("data:image/") || image.length > 3_000_000) return json({ ok: false, message: "Imagem inválida ou grande demais." }, 413);

        const mime = image.match(/^data:([^;]+);base64,/)?.[1] || "image/jpeg";
        const id = "ticket_photo_" + createHash("sha256").update(relationType + ":" + relationId + ":" + image).digest("hex").slice(0, 28);
        const sql = await getSql();
        await ensureTable(sql);

        const driverId = textValue(body?.driverId);
        const driverName = textValue(body?.driverName);
        const fleetId = textValue(body?.fleetId);
        const fleetName = textValue(body?.fleetName);
        const tripDate = isoDate(body?.tripDate) || null;
        const freightMode = textValue(body?.freightMode);
        const netWeight = nullableNumber(body?.netWeight);
        const reportStatus = textValue(body?.reportStatus);
        const createdBy = textValue((session as any)?.username) || textValue((session as any)?.name) || "Gerência";

        const existing = await sql<Record<string, any>>`select id from trip_ticket_photos where id=${id} limit 1`;
        if (existing[0]) return json({ ok: true, alreadyExists: true, id, message: "Esta foto já estava salva nesta viagem." });

        await sql`
          insert into trip_ticket_photos
            (id, relation_type, relation_id, trip_code, driver_id, driver_name, fleet_id, fleet_name,
             trip_date, freight_mode, net_weight, report_status, file_name, mime_type, image_data, created_by)
          values
            (${id}, ${relationType}, ${relationId}, ${tripCode}, ${driverId}, ${driverName}, ${fleetId}, ${fleetName},
             ${tripDate}, ${freightMode}, ${netWeight}, ${reportStatus}, ${fileName}, ${mime}, ${image}, ${createdBy})
        `;

        return json({ ok: true, id, message: "Foto do ticket salva e relacionada à viagem." });
      },

      DELETE: async ({ request }) => {
        const access = felipeSession();
        if (!access.ok) return json({ ok: false, message: access.message }, access.status);
        if (!sameOriginMutation(request)) return json({ ok: false, message: "Origem não autorizada." }, 403);

        const id = String(new URL(request.url).searchParams.get("id") || "").trim();
        if (!id) return json({ ok: false, message: "Foto inválida." }, 400);

        const sql = await getSql();
        await ensureTable(sql);
        await sql`delete from trip_ticket_photos where id=${id}`;
        return json({ ok: true });
      },
    },
  },
});

async function ensureTable(sql: any) {
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
  await sql`create index if not exists trip_ticket_photos_relation_idx on trip_ticket_photos (relation_type, relation_id)`;
  await sql`create index if not exists trip_ticket_photos_created_idx on trip_ticket_photos (created_at desc)`;
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

function textValue(value: unknown) {
  const valueText = String(value ?? "").trim();
  return valueText || null;
}

function nullableNumber(value: unknown) {
  if (value == null || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function isoDate(value: unknown) {
  const valueText = String(value ?? "").trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(valueText) ? valueText : "";
}

function safeFileName(value: string) {
  const clean = value.replace(/[^A-Za-z0-9._ -]/g, "_").trim().slice(0, 120);
  return clean || "ticket.jpg";
}
