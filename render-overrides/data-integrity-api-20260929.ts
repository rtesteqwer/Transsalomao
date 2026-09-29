import { createFileRoute } from "@tanstack/react-router";
import { getSql } from "@/lib/db";
import { managementSession } from "@/lib/management-auth.server";

type FuelingRow = {
  id: string;
  date: string;
  driver_id: string | null;
  driver_name: string | null;
  fleet_id: string;
  fleet_name: string | null;
  station: string | null;
  liters: string | number;
  price_per_liter: string | number;
  discount_amount: string | number | null;
  total_amount: string | number | null;
  photo_links: string | number;
};

export const Route = createFileRoute("/api/integridade-dados")({
  server: {
    handlers: {
      GET: async () => {
        const session = managementSession();
        if (!session) return json({ ok: false, message: "Entre na Gerência novamente." }, 401);
        try {
          const sql = await getSql();
          const [fuelPhotoTable, ticketPhotoTable] = await Promise.all([
            sql<{ name: string | null }[]>`select to_regclass('public.fueling_photo_reads')::text as name`,
            sql<{ name: string | null }[]>`select to_regclass('public.trip_ticket_photos')::text as name`,
          ]);

          let orphanFuelingLinks: any[] = [];
          if (fuelPhotoTable[0]?.name) {
            orphanFuelingLinks = await sql<Record<string, any>[]>`
              select
                r.id,
                r.file_id,
                r.fueling_id,
                f.file_name,
                r.created_at,
                r.read_json->>'receipt_number' as receipt_number,
                r.read_json->>'date' as ticket_date,
                r.read_json->>'liters' as liters,
                r.read_json->>'price_per_liter' as price_per_liter,
                r.read_json->>'total_amount' as total_amount
              from fueling_photo_reads r
              join fueling_photo_files f on f.id=r.file_id
              left join fuelings fu on fu.id=r.fueling_id
              where r.fueling_id is not null
                and fu.id is null
              order by r.created_at desc
              limit 200
            `;
          }

          const fuelings = await sql<FuelingRow[]>`
            select
              f.id,
              f.date::text as date,
              f.driver_id,
              d.name as driver_name,
              f.fleet_id,
              fl.name as fleet_name,
              f.station,
              f.liters,
              f.price_per_liter,
              coalesce(f.discount_amount,0) as discount_amount,
              f.total_amount,
              case
                when ${Boolean(fuelPhotoTable[0]?.name)}
                then (select count(*) from fueling_photo_reads r where r.fueling_id=f.id)
                else 0
              end as photo_links
            from fuelings f
            left join drivers d on d.id=f.driver_id
            left join fleets fl on fl.id=f.fleet_id
            where coalesce(f.liters,0)>0
              and coalesce(f.price_per_liter,0)>0
            order by f.date desc, f.id desc
            limit 1000
          `;

          const duplicateMap = new Map<string, any[]>();
          for (const row of fuelings) {
            const liters = Number(row.liters || 0);
            const price = Number(row.price_per_liter || 0);
            const discount = Number(row.discount_amount || 0);
            const total = row.total_amount == null ? Math.max(0, liters * price - discount) : Number(row.total_amount);
            const key = [
              row.date,
              row.driver_id || "",
              row.fleet_id || "",
              liters.toFixed(3),
              price.toFixed(3),
              total.toFixed(2),
            ].join("|");
            const list = duplicateMap.get(key) || [];
            list.push({
              id: String(row.id),
              date: row.date,
              driverId: row.driver_id,
              driverName: row.driver_name,
              fleetId: row.fleet_id,
              fleetName: row.fleet_name,
              station: row.station,
              liters,
              pricePerLiter: price,
              discountAmount: discount,
              totalAmount: total,
              photoLinks: Number(row.photo_links || 0),
            });
            duplicateMap.set(key, list);
          }
          const duplicateFuelings = [...duplicateMap.entries()]
            .filter(([, rows]) => rows.length > 1)
            .map(([key, rows]) => ({
              key,
              rows: [...rows].sort((a, b) => b.photoLinks - a.photoLinks || a.id.localeCompare(b.id)),
            }))
            .slice(0, 100);

          let orphanTicketPhotos: any[] = [];
          if (ticketPhotoTable[0]?.name) {
            orphanTicketPhotos = await sql<Record<string, any>[]>`
              select p.id,p.relation_type,p.relation_id,p.trip_code,p.file_name,p.created_at
              from trip_ticket_photos p
              left join trips t on p.relation_type='trip' and t.id=p.relation_id
              left join reports r on p.relation_type='report' and r.id=p.relation_id
              where (p.relation_type='trip' and t.id is null)
                 or (p.relation_type='report' and r.id is null)
              order by p.created_at desc
              limit 200
            `;
          }

          return json({
            ok: true,
            checkedAt: new Date().toISOString(),
            orphanFuelingLinks: orphanFuelingLinks.map((row) => ({
              id: String(row.id),
              fileId: String(row.file_id),
              missingFuelingId: String(row.fueling_id),
              fileName: String(row.file_name || "ticket"),
              receiptNumber: row.receipt_number || null,
              date: row.ticket_date || null,
              liters: row.liters || null,
              pricePerLiter: row.price_per_liter || null,
              totalAmount: row.total_amount || null,
              createdAt: row.created_at,
            })),
            duplicateFuelings,
            orphanTicketPhotos: orphanTicketPhotos.map((row) => ({
              id: String(row.id),
              relationType: String(row.relation_type),
              relationId: String(row.relation_id),
              tripCode: String(row.trip_code || ""),
              fileName: String(row.file_name || "ticket"),
              createdAt: row.created_at,
            })),
          });
        } catch (error) {
          console.error("[data-integrity] GET failed", error);
          return json({ ok: false, message: error instanceof Error ? error.message : "Falha ao verificar integridade." }, 500);
        }
      },

      POST: async ({ request }) => {
        const session = managementSession();
        if (!session) return json({ ok: false, message: "Entre na Gerência novamente." }, 401);
        if (!sameOrigin(request)) return json({ ok: false, message: "Origem não autorizada." }, 403);

        try {
          const body: any = await request.json();
          const action = String(body?.action || "");
          const sql = await getSql();

          if (action === "release_orphan_fueling_links") {
            const table = await sql<{ name: string | null }[]>`select to_regclass('public.fueling_photo_reads')::text as name`;
            if (!table[0]?.name) return json({ ok: true, changed: 0 });
            const changed = await sql<Record<string, any>[]>`
              update fueling_photo_reads r
              set fueling_id=null,
                  status='pending_completion',
                  confirmed_at=null
              where r.fueling_id is not null
                and not exists(select 1 from fuelings f where f.id=r.fueling_id)
              returning r.id
            `;
            return json({ ok: true, changed: changed.length, message: changed.length ? changed.length + " vínculo(s) antigo(s) liberado(s) para relançamento." : "Nenhum vínculo órfão encontrado." });
          }

          if (action === "unlink_orphan_ticket_photos") {
            const table = await sql<{ name: string | null }[]>`select to_regclass('public.trip_ticket_photos')::text as name`;
            if (!table[0]?.name) return json({ ok: true, changed: 0 });
            const changed = await sql<Record<string, any>[]>`
              update trip_ticket_photos p
              set relation_type='unlinked',
                  relation_id='pending',
                  report_status=null
              where (p.relation_type='trip' and not exists(select 1 from trips t where t.id=p.relation_id))
                 or (p.relation_type='report' and not exists(select 1 from reports r where r.id=p.relation_id))
              returning p.id
            `;
            return json({ ok: true, changed: changed.length, message: changed.length ? changed.length + " foto(s) com vínculo apagado foram liberadas para nova associação." : "Nenhuma foto órfã encontrada." });
          }

          if (action === "delete_duplicate_fueling") {
            const keepId = String(body?.keepId || "").trim();
            const deleteId = String(body?.deleteId || "").trim();
            if (!keepId || !deleteId || keepId === deleteId) return json({ ok: false, message: "Duplicata inválida." }, 400);

            const rows = await sql<Record<string, any>[]>`
              select
                id,
                date::text as date,
                coalesce(driver_id,'') as driver_id,
                coalesce(fleet_id,'') as fleet_id,
                round(coalesce(liters,0)::numeric,3)::text as liters,
                round(coalesce(price_per_liter,0)::numeric,3)::text as price,
                round(coalesce(total_amount, greatest(0,coalesce(liters,0)*coalesce(price_per_liter,0)-coalesce(discount_amount,0)))::numeric,2)::text as total
              from fuelings
              where id=${keepId} or id=${deleteId}
              order by id
            `;
            if (rows.length !== 2) return json({ ok: false, message: "Um dos abastecimentos já não existe. Atualize a verificação." }, 409);

            const fingerprint = (row: any) => [row.date,row.driver_id,row.fleet_id,row.liters,row.price,row.total].join("|");
            if (fingerprint(rows[0]) !== fingerprint(rows[1])) {
              return json({ ok: false, message: "Os registros mudaram e não são mais duplicatas exatas. Nada foi apagado." }, 409);
            }

            const photoTable = await sql<{ name: string | null }[]>`select to_regclass('public.fueling_photo_reads')::text as name`;
            if (photoTable[0]?.name) {
              await sql`update fueling_photo_reads set fueling_id=${keepId} where fueling_id=${deleteId}`;
            }
            const deleted = await sql<Record<string, any>[]>`delete from fuelings where id=${deleteId} returning id`;
            if (!deleted[0]) return json({ ok: false, message: "A duplicata não foi apagada. Atualize e tente novamente." }, 409);

            return json({ ok: true, keptId: keepId, deletedId: deleteId, message: "Duplicata apagada; um único abastecimento foi mantido." });
          }

          return json({ ok: false, message: "Ação inválida." }, 400);
        } catch (error) {
          console.error("[data-integrity] POST failed", error);
          return json({ ok: false, message: error instanceof Error ? error.message : "Falha ao corrigir integridade." }, 500);
        }
      },
    },
  },
});

function sameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) return false;
  return request.headers.get("sec-fetch-site") !== "cross-site";
}

function json(value: unknown, status = 200) {
  return Response.json(value, {
    status,
    headers: {
      "Cache-Control": "no-store, no-cache, must-revalidate",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
