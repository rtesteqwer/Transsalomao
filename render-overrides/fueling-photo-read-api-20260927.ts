import { FUELING_READER_VERSION } from "@/lib/fueling-receipt-rules";
import { createFileRoute } from "@tanstack/react-router";
import { getSql } from "@/lib/db";
import { managementSession } from "@/lib/management-auth.server";
import { authenticateAssistantRequest } from "@/lib/assistant-auth.server";
import {
  fuelingPhotoErrorResponse,
  normalizeName,
  normalizePlate,
  readFuelingPhoto,
  validateFuelingImage,
} from "@/lib/fueling-photo-reader.server";

export const Route = createFileRoute("/api/ler-abastecimento")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (!managementSession() && !(await authenticateAssistantRequest(request))) {
          return Response.json({ ok: false, message: "Entre na Gerência ou na Trans Salomão IA novamente." }, { status: 401, headers: { "X-Fueling-Reader-Version": FUELING_READER_VERSION } });
        }
        try {
          const body: any = await request.json();
          const image = validateFuelingImage(body?.imagem);
          const sql = await getSql();
          const drivers = await sql`select id,name,status from drivers where status='ativo' order by name`;
          const fleets = await sql`select id,name,tractor_plate,trailer_plate,status from fleets where status='ativo' order by name`;

          const selectedDriver = drivers.find((row: any) => String(row.id) === String(body?.driverId ?? "")) ?? null;
          const selectedFleet = fleets.find((row: any) => String(row.id) === String(body?.fleetId ?? "")) ?? null;

          const reading = await readFuelingPhoto(sql, {
            imageDataUrl: image.dataUrl,
            selectedDriverName: selectedDriver?.name ?? null,
            selectedFleetName: selectedFleet?.name ?? null,
            tractorPlate: selectedFleet?.tractor_plate ?? null,
            trailerPlate: selectedFleet?.trailer_plate ?? null,
          });

          let suggestedFleet = selectedFleet;
          if (!suggestedFleet && reading.plate) {
            const plate = normalizePlate(reading.plate);
            const matches = fleets.filter((row: any) =>
              plate && (normalizePlate(row.tractor_plate) === plate || normalizePlate(row.trailer_plate) === plate)
            );
            if (matches.length === 1) suggestedFleet = matches[0];
          }

          let suggestedDriver = selectedDriver;
          if (!suggestedDriver && reading.driver_name) {
            const wanted = normalizeName(reading.driver_name);
            const matches = drivers.filter((row: any) => {
              const current = normalizeName(row.name);
              return current === wanted || (wanted.length >= 4 && (current.includes(wanted) || wanted.includes(current)));
            });
            if (matches.length === 1) suggestedDriver = matches[0];
          }

          return Response.json({
            ok: true,
            reading,
            suggestedDriverId: suggestedDriver?.id ?? null,
            suggestedFleetId: suggestedFleet?.id ?? null,
          }, { headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff", "X-Fueling-Reader-Version": FUELING_READER_VERSION } });
        } catch (error) {
          return fuelingPhotoErrorResponse(error);
        }
      },
    },
  },
});
