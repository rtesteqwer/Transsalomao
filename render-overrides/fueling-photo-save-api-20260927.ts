import { createHash, randomUUID } from "node:crypto";
import { createFileRoute } from "@tanstack/react-router";
import { getSql } from "@/lib/db";
import { managementSession } from "@/lib/management-auth.server";
import {
  ensureFuelingPhotoTables,
  fuelingPhotoErrorResponse,
  FuelingPhotoError,
  normalizeDecimalText,
  normalizeFuelingReading,
  normalizeName,
  normalizePlate,
  validateFuelingImage,
} from "@/lib/fueling-photo-reader.server";

export const Route = createFileRoute("/api/salvar-abastecimento-foto")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (!managementSession()) {
          return Response.json({ ok: false, message: "Entre na Gerência novamente." }, { status: 401 });
        }
        try {
          const body: any = await request.json();
          if (body?.confirmed !== true) throw new FuelingPhotoError(400, "Confira os dados antes de gravar.");

          const image = validateFuelingImage(body?.imagem);
          const reading = normalizeFuelingReading(body?.reading);
          const liters = normalizeDecimalText(reading.liters);
          const price = normalizeDecimalText(reading.price_per_liter);
          const total = normalizeDecimalText(reading.total_amount);
          const discount = normalizeDecimalText(reading.discount_amount);
          if (!reading.date) throw new FuelingPhotoError(400, "Informe a data do abastecimento.");
          if (!liters) throw new FuelingPhotoError(400, "Informe a quantidade exata de litros.");
          if (!price) throw new FuelingPhotoError(400, "Informe o preço exato por litro.");
          if (reading.consistency === "conflict") {
            throw new FuelingPhotoError(409, "Os valores da foto estão em conflito. Corrija litros, preço/L ou total antes de gravar.");
          }

          if (total) {
            const gross = Number(liters) * Number(price);
            const expected = gross - Number(discount || 0);
            const diff = Math.abs(expected - Number(total));
            const tolerance = Math.max(0.05, gross * 0.0015);
            if (diff > tolerance) {
              throw new FuelingPhotoError(
                409,
                discount
                  ? "Litros × preço/L menos o desconto não confere com o total final."
                  : "Litros × preço/L não confere com o total informado.",
              );
            }
          }

          const sql = await getSql();
          await ensureFuelingPhotoTables(sql);
          const drivers = await sql`select id,name,status from drivers where status='ativo' order by name`;
          const fleets = await sql`select id,name,tractor_plate,trailer_plate,status from fleets where status='ativo' order by name`;

          let fleet = fleets.find((row: any) => String(row.id) === String(body?.fleetId ?? "")) ?? null;
          if (!fleet && reading.plate) {
            const p = normalizePlate(reading.plate);
            const matches = fleets.filter((row: any) =>
              p && (normalizePlate(row.tractor_plate) === p || normalizePlate(row.trailer_plate) === p)
            );
            if (matches.length === 1) fleet = matches[0];
          }
          if (!fleet) throw new FuelingPhotoError(400, "Selecione o conjunto deste abastecimento.");

          let driver = drivers.find((row: any) => String(row.id) === String(body?.driverId ?? "")) ?? null;
          if (!driver && reading.driver_name) {
            const wanted = normalizeName(reading.driver_name);
            const matches = drivers.filter((row: any) => {
              const current = normalizeName(row.name);
              return current === wanted || (wanted.length >= 4 && (current.includes(wanted) || wanted.includes(current)));
            });
            if (matches.length === 1) driver = matches[0];
          }

          const existingFile = await sql`
            select f.id, r.fueling_id
            from fueling_photo_files f
            left join fueling_photo_reads r on r.file_id=f.id
            where f.source_hash=${image.sourceHash}
            limit 1
          `;
          if (existingFile[0]?.fueling_id) {
            return Response.json({
              ok: true,
              linkedExisting: true,
              duplicatePhoto: true,
              fuelingId: existingFile[0].fueling_id,
              message: "Esta foto já estava vinculada ao abastecimento.",
            }, { headers: { "Cache-Control": "no-store" } });
          }

          const candidate = await sql`
            select id
            from fuelings
            where fleet_id=${fleet.id}
              and date=${reading.date}
              and abs((liters)::numeric - ${liters}::numeric) <= 0.001
              and abs((price_per_liter)::numeric - ${price}::numeric) <= 0.001
            order by id desc
            limit 1
          `;

          let fuelingId = candidate[0]?.id ? String(candidate[0].id) : null;
          const linkedExisting = !!fuelingId;
          if (!fuelingId) {
            fuelingId = id("fuel");
            const notes = [
              "Leitor de abastecimento",
              reading.document_type !== "unknown" ? reading.document_type : "",
              reading.receipt_number ? "documento " + reading.receipt_number : "",
              reading.fuel_type || "",
            ].filter(Boolean).join(" · ").slice(0, 600);
            await sql`
              insert into fuelings(id,date,driver_id,fleet_id,station,km,liters,price_per_liter,notes)
              values(
                ${fuelingId},
                ${reading.date},
                ${driver?.id ?? null},
                ${fleet.id},
                ${reading.station_name || ""},
                ${reading.odometer_km ?? 0},
                ${liters},
                ${price},
                ${notes}
              )
            `;
          }

          let fileId = existingFile[0]?.id ? String(existingFile[0].id) : null;
          if (!fileId) {
            fileId = id("fuelimg");
            await sql`
              insert into fueling_photo_files(id,source_hash,file_name,mime_type,image_base64,created_at)
              values(
                ${fileId},
                ${image.sourceHash},
                ${String(body?.fileName ?? "abastecimento.jpg").slice(0,180)},
                ${image.mime},
                ${image.base64},
                now()
              )
              on conflict(source_hash) do nothing
            `;
            const actual = await sql`select id from fueling_photo_files where source_hash=${image.sourceHash} limit 1`;
            fileId = String(actual[0]?.id ?? fileId);
          }

          await sql`
            insert into fueling_photo_reads(
              id,file_id,fueling_id,driver_id,fleet_id,document_type,confidence,status,read_json,created_at,confirmed_at
            )
            values(
              ${id("fuelread")},
              ${fileId},
              ${fuelingId},
              ${driver?.id ?? null},
              ${fleet.id},
              ${reading.document_type},
              ${reading.confidence},
              'confirmed',
              ${JSON.stringify(reading)}::jsonb,
              now(),
              now()
            )
            on conflict(file_id) do update set
              fueling_id=excluded.fueling_id,
              driver_id=excluded.driver_id,
              fleet_id=excluded.fleet_id,
              document_type=excluded.document_type,
              confidence=excluded.confidence,
              status='confirmed',
              read_json=excluded.read_json,
              confirmed_at=now()
          `;

          const stationKeySource = [
            normalizeName(reading.station_name),
            String(reading.station_cnpj ?? "").replace(/\D/g, ""),
            normalizeName(reading.fuel_type),
            normalizeName(reading.pump_number),
            reading.document_type,
          ].join("|");
          if (stationKeySource.replace(/\|/g, "")) {
            const memoryKey = hashText(stationKeySource);
            await sql`
              insert into fueling_photo_memory(
                memory_key,station_name,station_cnpj,fuel_type,pump_number,document_type,uses,last_seen_at
              )
              values(
                ${memoryKey},
                ${reading.station_name},
                ${reading.station_cnpj},
                ${reading.fuel_type},
                ${reading.pump_number},
                ${reading.document_type},
                1,
                now()
              )
              on conflict(memory_key) do update set
                station_name=excluded.station_name,
                station_cnpj=excluded.station_cnpj,
                fuel_type=excluded.fuel_type,
                pump_number=excluded.pump_number,
                document_type=excluded.document_type,
                uses=fueling_photo_memory.uses+1,
                last_seen_at=now()
            `;
          }

          return Response.json({
            ok: true,
            linkedExisting,
            fuelingId,
            driverId: driver?.id ?? null,
            fleetId: fleet.id,
            message: linkedExisting
              ? "Foto vinculada a um abastecimento já existente, sem duplicar."
              : "Abastecimento gravado com a foto vinculada.",
          }, { headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } });
        } catch (error) {
          return fuelingPhotoErrorResponse(error);
        }
      },
    },
  },
});

function id(prefix: string) {
  return prefix + "_" + randomUUID().replace(/-/g, "");
}

function hashText(value: string) {
  return createHash("sha256").update(value).digest("hex");
}
