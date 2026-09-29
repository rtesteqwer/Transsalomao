import { FUELING_MONEY_TOLERANCE } from "@/lib/fueling-receipt-rules";
import { createHash, randomUUID } from "node:crypto";
import { createFileRoute } from "@tanstack/react-router";
import { getSql } from "@/lib/db";
import { managementSession } from "@/lib/management-auth.server";
import { authenticateAssistantRequest } from "@/lib/assistant-auth.server";
import {
  ensureFuelingPhotoTables,
  fuelingPhotoErrorResponse,
  FuelingPhotoError,
  normalizeDecimalText,
  normalizeFuelingReading,
  normalizeName,
  normalizePlate,
  recoverValidatedFuelingReading,
  validateFuelingImage,
} from "@/lib/fueling-photo-reader.server";

export const Route = createFileRoute("/api/salvar-abastecimento-foto")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (!managementSession() && !(await authenticateAssistantRequest(request))) {
          return Response.json({ ok: false, message: "Entre na Gerência ou na Trans Salomão IA novamente." }, { status: 401 });
        }
        try {
          const sql = await getSql();
          await ensureFuelingPhotoTables(sql);
          const rows = await sql`
            select
              f.id as file_id,
              f.file_name,
              f.mime_type,
              f.image_base64,
              f.source_hash,
              r.driver_id,
              r.fleet_id,
              r.read_json,
              r.created_at
            from fueling_photo_reads r
            join fueling_photo_files f on f.id=r.file_id
            where r.status='pending_completion'
              and r.fueling_id is null
            order by r.created_at desc
            limit 25
          `;
          return Response.json({
            ok: true,
            items: rows.map((row: any) => ({
              id: String(row.file_id),
              fileName: String(row.file_name || "abastecimento.jpg"),
              image: `data:${row.mime_type || "image/jpeg"};base64,${row.image_base64}`,
              originalFileHash: row.source_hash ? String(row.source_hash) : null,
              reading: row.read_json || {},
              driverId: row.driver_id ? String(row.driver_id) : null,
              fleetId: row.fleet_id ? String(row.fleet_id) : null,
              createdAt: row.created_at,
            })),
          }, { headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } });
        } catch (error) {
          return fuelingPhotoErrorResponse(error);
        }
      },
      POST: async ({ request }) => {
        if (!managementSession() && !(await authenticateAssistantRequest(request))) {
          return Response.json({ ok: false, message: "Entre na Gerência ou na Trans Salomão IA novamente." }, { status: 401 });
        }
        try {
          const body: any = await request.json();
          if (body?.confirmed !== true) throw new FuelingPhotoError(400, "Confira os dados antes de gravar.");

          const image = validateFuelingImage(body?.imagem);
          const claimedOriginalHash = String(body?.originalFileHash ?? "").trim().toLowerCase();
          const sourceHash = /^[a-f0-9]{64}$/.test(claimedOriginalHash)
            ? claimedOriginalHash
            : image.sourceHash;
          const knownValidatedSource = !!recoverValidatedFuelingReading(sourceHash);
          const fileName = String(body?.fileName ?? "abastecimento.jpg").slice(0, 180);
          const reading = normalizeFuelingReading(body?.reading, { repairOcr: false });
          const liters = normalizeDecimalText(reading.liters);
          const price = normalizeDecimalText(reading.price_per_liter);
          const total = normalizeDecimalText(reading.total_amount);
          const discount = normalizeDecimalText(reading.discount_amount);
          const isPumpDisplay =
            reading.document_type === "pump_display" ||
            (Array.isArray(reading.visual_hints) && reading.visual_hints.some((hint: string) => /visor.*bomba|bomba.*visor/i.test(String(hint))));
          if (!liters) throw new FuelingPhotoError(400, "Informe a quantidade exata de litros.");
          if (!price) throw new FuelingPhotoError(400, "Informe o preço exato por litro.");
          if (!total) throw new FuelingPhotoError(400, "Confira e informe o total do abastecimento antes de gravar.");
          if (reading.consistency === "conflict") {
            throw new FuelingPhotoError(409, "Os valores da foto estão em conflito. Corrija litros, preço/L ou total antes de gravar.");
          }

          if (total) {
            const gross = Number(liters) * Number(price);
            const expected = gross - Number(discount || 0);
            const diff = Math.abs(expected - Number(total));
            const tolerance = FUELING_MONEY_TOLERANCE;
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
          if (!fleet && !isPumpDisplay) {
            throw new FuelingPhotoError(400, "Selecione o conjunto deste abastecimento.");
          }

          let driver = drivers.find((row: any) => String(row.id) === String(body?.driverId ?? "")) ?? null;
          if (!driver && reading.driver_name) {
            const wanted = normalizeName(reading.driver_name);
            const matches = drivers.filter((row: any) => {
              const current = normalizeName(row.name);
              return current === wanted || (wanted.length >= 4 && (current.includes(wanted) || wanted.includes(current)));
            });
            if (matches.length === 1) driver = matches[0];
          }

          let existingFile = await sql`
            select
              f.id,
              r.fueling_id,
              case when fu.id is not null then true else false end as fueling_exists
            from fueling_photo_files f
            left join fueling_photo_reads r on r.file_id=f.id
            left join fuelings fu on fu.id=r.fueling_id
            where f.source_hash=${sourceHash}
            limit 1
          `;

          // Versões anteriores comprimiam a imagem antes de calcular o hash.
          // Quando um dos arquivos exatos já conferidos é reenviado, reaproveite
          // um único pendente antigo com o mesmo nome em vez de deixar o OCR
          // incorreto ("1 L / R$ 12") como um segundo cartão órfão.
          if (!existingFile[0] && knownValidatedSource) {
            const stalePending = await sql`
              select f.id,r.fueling_id,false as fueling_exists
              from fueling_photo_files f
              join fueling_photo_reads r on r.file_id=f.id
              where f.file_name=${fileName}
                and r.status='pending_completion'
                and r.fueling_id is null
              order by r.created_at desc
              limit 2
            `;
            if (stalePending.length === 1 && stalePending[0]?.id) {
              await sql`
                update fueling_photo_files
                set source_hash=${sourceHash},
                    mime_type=${image.mime},
                    image_base64=${image.base64}
                where id=${stalePending[0].id}
              `;
              existingFile = [stalePending[0]];
            }
          }

          // A foto pode continuar arquivada mesmo depois que o abastecimento foi
          // apagado. Nesse caso NÃO é duplicata: solta o vínculo órfão e permite
          // gravar novamente o ticket normalmente.
          if (existingFile[0]?.fueling_id && !existingFile[0]?.fueling_exists) {
            await sql`
              update fueling_photo_reads
              set fueling_id=null,
                  status='pending_completion',
                  confirmed_at=null
              where file_id=${existingFile[0].id}
            `;
            existingFile[0].fueling_id = null;
          }

          if (existingFile[0]?.fueling_id && existingFile[0]?.fueling_exists) {
            const existingFuelingId = String(existingFile[0].fueling_id);
            await syncFuelingFiscalValues(sql, existingFuelingId, {
              date: reading.date,
              driverId: driver?.id ?? null,
              fleetId: fleet?.id ?? null,
              station: reading.station_name || "",
              odometerKm: reading.odometer_km,
              liters,
              price,
              discount: discount || "0",
              total,
              reading,
            });
            return Response.json({
              ok: true,
              linkedExisting: true,
              duplicatePhoto: true,
              fuelingId: existingFuelingId,
              message: "Esta foto já está vinculada a um abastecimento que existe no banco. Os valores foram sincronizados sem criar duplicata.",
            }, { headers: { "Cache-Control": "no-store" } });
          }

          let fuelingId: string | null = null;
          let resolvedDate = reading.date;

          // 1) Número do documento é um identificador forte para fotos diferentes
          // do mesmo DANFE/cupom. Isso permite guardar mais de uma imagem sem
          // criar um segundo abastecimento.
          if (reading.receipt_number) {
            const receiptMatches = await sql`
              select distinct r.fueling_id
              from fueling_photo_reads r
              join fuelings fu on fu.id=r.fueling_id
              where r.fueling_id is not null
                and nullif(trim(r.read_json->>'receipt_number'),'') = ${reading.receipt_number}
              order by r.fueling_id
              limit 2
            `;
            if (receiptMatches.length === 1 && receiptMatches[0]?.fueling_id) {
              fuelingId = String(receiptMatches[0].fueling_id);
            }
          }

          // 2) Com data visível, litros + preço/L + conjunto identificam a compra.
          if (!fuelingId && reading.date && fleet) {
            const candidate = await sql`
              select id,date
              from fuelings
              where fleet_id=${fleet.id}
                and date=${reading.date}
                and abs((liters)::numeric - ${liters}::numeric) <= 0.001
                and abs((price_per_liter)::numeric - ${price}::numeric) <= 0.001
              order by id desc
              limit 2
            `;
            if (candidate.length === 1 && candidate[0]?.id) {
              fuelingId = String(candidate[0].id);
              resolvedDate = String(candidate[0].date ?? reading.date);
            }
          }

          // 3) Foto somente do visor normalmente não tem data impressa. Se existir
          // exatamente um abastecimento do mesmo conjunto com os MESMOS litros e
          // preço/L, vincula a foto automaticamente. Se houver ambiguidade, exige
          // a data em vez de arriscar uma associação errada.
          if (!fuelingId && !reading.date && fleet) {
            const candidates = await sql`
              select id,date
              from fuelings
              where fleet_id=${fleet.id}
                and abs((liters)::numeric - ${liters}::numeric) <= 0.001
                and abs((price_per_liter)::numeric - ${price}::numeric) <= 0.001
              order by date desc,id desc
              limit 3
            `;
            if (candidates.length === 1 && candidates[0]?.id) {
              fuelingId = String(candidates[0].id);
              resolvedDate = String(candidates[0].date);
            } else if (candidates.length > 1) {
              throw new FuelingPhotoError(
                409,
                "Encontrei mais de um abastecimento com os mesmos litros e preço/L. Informe a data para vincular sem duplicar.",
              );
            }
          }

          const linkedExisting = !!fuelingId;
          if (linkedExisting && fuelingId) {
            await syncFuelingFiscalValues(sql, fuelingId, {
              date: resolvedDate,
              driverId: driver?.id ?? null,
              fleetId: fleet?.id ?? null,
              station: reading.station_name || "",
              odometerKm: reading.odometer_km,
              liters,
              price,
              discount: discount || "0",
              total,
              reading,
            });
          }
          const needsCompletion = !fuelingId && isPumpDisplay && (!resolvedDate || !fleet);

          if (!fuelingId && !needsCompletion) {
            if (!resolvedDate) {
              throw new FuelingPhotoError(
                400,
                "Informe a data deste abastecimento antes de gravar.",
              );
            }
            if (!fleet) {
              throw new FuelingPhotoError(400, "Selecione o conjunto deste abastecimento.");
            }
            fuelingId = id("fuel");
            await sql`
              insert into fuelings(
                id,date,driver_id,fleet_id,station,km,liters,price_per_liter,
                discount_amount,total_amount,notes
              )
              values(
                ${fuelingId},
                ${resolvedDate},
                ${driver?.id ?? null},
                ${fleet.id},
                ${reading.station_name || ""},
                ${reading.odometer_km ?? 0},
                ${liters},
                ${price},
                ${discount || "0"},
                ${total},
                ${fuelingNotes(reading, liters, price, discount || "0", total)}
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
                ${sourceHash},
                ${fileName},
                ${image.mime},
                ${image.base64},
                now()
              )
              on conflict(source_hash) do nothing
            `;
            const actual = await sql`select id from fueling_photo_files where source_hash=${sourceHash} limit 1`;
            fileId = String(actual[0]?.id ?? fileId);
          }

          if (needsCompletion) {
            const pendingReading = {
              ...reading,
              pending_completion: true,
              missing_fields: [
                !resolvedDate ? "date" : "",
                !fleet ? "fleet" : "",
                !driver ? "driver" : "",
                !reading.station_name ? "station_name" : "",
                !reading.pump_number ? "pump_number" : "",
                reading.odometer_km == null ? "odometer_km" : "",
              ].filter(Boolean),
            };

            await sql`
              insert into fueling_photo_reads(
                id,file_id,fueling_id,driver_id,fleet_id,document_type,confidence,status,read_json,created_at,confirmed_at
              )
              values(
                ${id("fuelread")},
                ${fileId},
                null,
                ${driver?.id ?? null},
                ${fleet?.id ?? null},
                ${reading.document_type},
                ${reading.confidence},
                'pending_completion',
                ${JSON.stringify(pendingReading)}::jsonb,
                now(),
                null
              )
              on conflict(file_id) do update set
                fueling_id=null,
                driver_id=excluded.driver_id,
                fleet_id=excluded.fleet_id,
                document_type=excluded.document_type,
                confidence=excluded.confidence,
                status='pending_completion',
                read_json=excluded.read_json,
                confirmed_at=null
            `;

            return Response.json({
              ok: true,
              pending: true,
              linkedExisting: false,
              fuelingId: null,
              driverId: driver?.id ?? null,
              fleetId: fleet?.id ?? null,
              message: "Foto da bomba salva como lançamento pendente. A Gerência pode completar data, motorista, conjunto, posto, bomba e odômetro depois.",
            }, { headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } });
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
              ${fleet?.id ?? null},
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
            fleetId: fleet?.id ?? null,
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

async function syncFuelingFiscalValues(sql: any, fuelingId: string, input: {
  date: string | null;
  driverId: string | null;
  fleetId: string | null;
  station: string;
  odometerKm: number | null;
  liters: string;
  price: string;
  discount: string;
  total: string;
  reading: any;
}) {
  const notes = fuelingNotes(input.reading, input.liters, input.price, input.discount, input.total);
  await sql`
    update fuelings
    set
      date=coalesce(${input.date}::date,date),
      driver_id=coalesce(${input.driverId},driver_id),
      fleet_id=coalesce(${input.fleetId},fleet_id),
      station=case when nullif(trim(${input.station}), '') is not null then ${input.station} else station end,
      km=case when coalesce(${input.odometerKm}::integer,0)>0 then ${input.odometerKm}::integer else km end,
      liters=${input.liters},
      price_per_liter=${input.price},
      discount_amount=${input.discount},
      total_amount=${input.total},
      notes=${notes}
    where id=${fuelingId}
  `;
}

function fuelingNotes(reading: any, liters: string, price: string, discount: string, total: string) {
  return [
    "Leitor de abastecimento",
    reading.document_type && reading.document_type !== "unknown" ? reading.document_type : "",
    reading.receipt_number ? "documento " + reading.receipt_number : "",
    reading.fuel_type || "",
    "Litros " + decimalPtBr(liters),
    "Preço/L R$ " + decimalPtBr(price),
    "Desconto R$ " + decimalPtBr(discount || "0"),
    "Total após desconto R$ " + decimalPtBr(total),
  ].filter(Boolean).join(" · ").slice(0, 900);
}

function decimalPtBr(value: string) {
  return String(value ?? "").replace(".", ",");
}

function id(prefix: string) {
  return prefix + "_" + randomUUID().replace(/-/g, "");
}

function hashText(value: string) {
  return createHash("sha256").update(value).digest("hex");
}
