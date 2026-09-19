// validation probe: inspect reconstructed acceptReports before production deploy
export const acceptReports = createServerFn({ method: "POST" })
  .validator(z.object({ ids: z.array(z.string().min(1)).min(1).max(500) }))
  .handler(async ({ data }) => {
    await requireManagement();
    const sql = await getSql();
    const ids = [...new Set(data.ids)];
    const reports = (await Promise.all(ids.map(async (id) => (await sql<Record<string, unknown>>`
      select * from reports where id = ${id} and status = 'pendente' limit 1
    `)[0]))).filter(Boolean) as Record<string, unknown>[];

    reports.sort((a, b) => str(a.fleet_id).localeCompare(str(b.fleet_id)) || num(a.km) - num(b.km));

    const prices = new Map<string, number>();
    const modes = [...new Set(reports.map((report) => nullableFreightMode(report.freight_mode)).filter((mode): mode is "trip" | "cegonha" | "caixinha" => mode === "trip" || mode === "cegonha" || mode === "caixinha"))];
    await Promise.all(modes.map(async (mode) => prices.set(mode, await getConfiguredTripPrice(sql, mode))));

    const maxRows = await sql<{ max_code: number }>`
      select greatest(
        coalesce((select max(code::int) from trips where code ~ '^[0-9]+$'), 0),
        coalesce((select max(ticket::int) from reports where ticket ~ '^[0-9]+$'), 0)
      )::int as max_code
    `;
    let nextCode = Number(maxRows[0]?.max_code ?? 0) + 1;
    const reserved = new Set<string>();
    let accepted = 0;
    let needsReview = 0;

    for (const report of reports) {
      const linkedId = str(report.trip_id);
      if (linkedId) {
        const linked = await sql<{ id: string }>`select id from trips where id = ${linkedId} limit 1`;
        if (linked[0]?.id) {
          await sql`update reports set status = 'aceito' where id = ${str(report.id)}`;
          accepted += 1;
          continue;
        }
      }

      const reportId = str(report.id); const mode = nullableFreightMode(report.freight_mode); const price = mode && mode !== "ton" ? (prices.get(mode) ?? 0) : 0;
      if (!mode || (mode !== "ton" && price <= 0)) {
        needsReview += 1;
        continue;
      }

      let ticket = str(report.ticket).toUpperCase();
      const collision = ticket ? await sql<{ id: string }>`select id from trips where code = ${ticket} limit 1` : [];
      if (!ticket || collision[0]?.id || reserved.has(ticket)) {
        while (reserved.has(String(nextCode)) || (await sql<{ id: string }>`select id from trips where code = ${String(nextCode)} limit 1`)[0]?.id) nextCode += 1;
        ticket = String(nextCode++);
      }
      reserved.add(ticket);

      const tripId = newId("trip");
      const created = report.created_at;
      const createdAt = created instanceof Date ? created.toISOString() : str(created);
      const date = /^\d{4}-\d{2}-\d{2}/.test(createdAt) ? createdAt.slice(0, 10) : new Date().toISOString().slice(0, 10);
      const fleetId = str(report.fleet_id);
      const kmEnd = num(report.km);
      const prev = await sql<{ km_end: number }>`select km_end from trips where fleet_id = ${fleetId} and km_end <= ${kmEnd} order by km_end desc limit 1`;
      const kmStart = num(prev[0]?.km_end);
      const tons = num(report.tons);

      await sql`
        insert into trips (id, code, date, client, origin, destination, driver_id, fleet_id, loaded_tons, gross_weight, net_weight, freight_mode, price_per_ton, price_per_trip, km_start, km_end, diesel_liters, diesel_price)
        values (${tripId}, ${ticket}, ${date}, '', '', '', ${str(report.driver_id)}, ${fleetId}, ${tons}, 0, ${tons}, ${mode}, 0, ${price}, ${kmStart}, ${kmEnd}, 0, 0)
      `;
      await sql`update reports set status = 'aceito', trip_id = ${tripId}, ticket = ${ticket} where id = ${reportId}`;
      accepted += 1;
    }

    return { ok: true, accepted, needsReview };
  });