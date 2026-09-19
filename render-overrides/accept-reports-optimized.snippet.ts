export const acceptReports = createServerFn({ method: "POST" })
  .validator(z.object({ ids: z.array(z.string().min(1)).min(1).max(500) }))
  .handler(async ({ data }) => {
    await requireManagement();
    const sql = await getSql();
    const ids = [...new Set(data.ids)];
    const reportRows = await Promise.all(ids.map(async (id) => (await sql<Record<string, unknown>>`
      select * from reports where id = ${id} and status = 'pendente' limit 1
    `)[0]));
    const reports = reportRows.filter(Boolean) as Record<string, unknown>[];
    reports.sort((a, b) => str(a.fleet_id).localeCompare(str(b.fleet_id)) || num(a.km) - num(b.km));

    const prices = new Map<string, number>();
    const modes = [...new Set(reports.map((report) => nullableFreightMode(report.freight_mode)).filter((mode): mode is "trip" | "cegonha" | "caixinha" => mode === "trip" || mode === "cegonha" || mode === "caixinha"))];
    await Promise.all(modes.map(async (mode) => { prices.set(mode, await getConfiguredTripPrice(sql, mode)); }));
    const existingTrips = await Promise.all(reports.map(async (report) => {
      const ticket = str(report.ticket).toUpperCase();
      const rows = await sql<{ id: string }>`select id from trips where code = ${ticket} limit 1`;
      return [str(report.id), rows[0]?.id ?? null] as const;
    }));
    const existingMap = new Map(existingTrips);
    const previousKms = await Promise.all(reports.map(async (report) => {
      const fleetId = str(report.fleet_id); const kmEnd = num(report.km);
      const rows = await sql<{ km_end: number }>`select km_end from trips where fleet_id = ${fleetId} and km_end <= ${kmEnd} order by km_end desc limit 1`;
      return [str(report.id), num(rows[0]?.km_end)] as const;
    }));
    const previousMap = new Map(previousKms);
    const maxCodeRows = await sql<{ max_code: number | string }[]>`select coalesce(max(code::bigint), 0) as max_code from trips where code ~ '^[0-9]+
    let needsReview = 0;
    for (const report of reports) {
      const reportId = str(report.id); const mode = nullableFreightMode(report.freight_mode); const price = mode && mode !== "ton" ? (prices.get(mode) ?? 0) : 0;
      if (!mode || (mode !== "ton" && price <= 0)) { needsReview += 1; continue; }
      let ticket = str(report.ticket).toUpperCase();
      if (existingMap.get(reportId)) ticket = String(nextNumericCode++);
      const created = report.created_at; const createdAt = created instanceof Date ? created.toISOString() : str(created);
      candidates.push({ report, tripId: newId("trip"), ticket, date: /^\d{4}-\d{2}-\d{2}/.test(createdAt) ? createdAt.slice(0, 10) : new Date().toISOString().slice(0, 10), tons: num(report.tons), mode, price, kmStart: previousMap.get(reportId) ?? 0 });
    }
    await Promise.all(candidates.map((item) => sql`
      insert into trips (id, code, date, client, origin, destination, driver_id, fleet_id, loaded_tons, gross_weight, net_weight, freight_mode, price_per_ton, price_per_trip, km_start, km_end, diesel_liters, diesel_price)
      values (${item.tripId}, ${item.ticket}, ${item.date}, '', '', '', ${str(item.report.driver_id)}, ${str(item.report.fleet_id)}, ${item.tons}, 0, ${item.tons}, ${item.mode}, 0, ${item.price}, ${item.kmStart}, ${num(item.report.km)}, 0, 0)
    `));
    await Promise.all(reports.map((report) => {
      const id = str(report.id); const created = candidates.find((item) => str(item.report.id) === id);
      if (created) return sql`update reports set status = 'aceito', trip_id = ${created.tripId}, ticket = ${created.ticket} where id = ${id}`;
      return Promise.resolve();
    }));
    return { ok: true, accepted: candidates.length, needsReview };
  });
`;
    let nextNumericCode = Number(maxCodeRows[0]?.max_code ?? 0) + 1;
    const candidates: Array<{ report: Record<string, unknown>; tripId: string; ticket: string; date: string; tons: number; mode: FreightMode; price: number; kmStart: number }> = [];
    let needsReview = 0;
    for (const report of reports) {
      const reportId = str(report.id); const mode = nullableFreightMode(report.freight_mode); const price = mode && mode !== "ton" ? (prices.get(mode) ?? 0) : 0;
      if (!mode || (mode !== "ton" && price <= 0)) { needsReview += 1; continue; }
      if (existingMap.get(reportId)) continue;
      const created = report.created_at; const createdAt = created instanceof Date ? created.toISOString() : str(created);
      candidates.push({ report, tripId: newId("trip"), ticket: str(report.ticket).toUpperCase(), date: /^\d{4}-\d{2}-\d{2}/.test(createdAt) ? createdAt.slice(0, 10) : new Date().toISOString().slice(0, 10), tons: num(report.tons), mode, price, kmStart: previousMap.get(reportId) ?? 0 });
    }
    await Promise.all(candidates.map((item) => sql`
      insert into trips (id, code, date, client, origin, destination, driver_id, fleet_id, loaded_tons, gross_weight, net_weight, freight_mode, price_per_ton, price_per_trip, km_start, km_end, diesel_liters, diesel_price)
      values (${item.tripId}, ${item.ticket}, ${item.date}, '', '', '', ${str(item.report.driver_id)}, ${str(item.report.fleet_id)}, ${item.tons}, 0, ${item.tons}, ${item.mode}, 0, ${item.price}, ${item.kmStart}, ${num(item.report.km)}, 0, 0)
    `));
    await Promise.all(reports.map((report) => {
      const id = str(report.id); const existing = existingMap.get(id); const created = candidates.find((item) => str(item.report.id) === id);
      if (existing) return sql`update reports set status = 'aceito', trip_id = ${existing} where id = ${id}`;
      if (created) return sql`update reports set status = 'aceito', trip_id = ${created.tripId} where id = ${id}`;
      return Promise.resolve();
    }));
    return { ok: true, accepted: existingMap.size + candidates.length, needsReview };
  });
