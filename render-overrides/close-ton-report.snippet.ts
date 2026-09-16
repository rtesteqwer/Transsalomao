const closeTonReportSchema = z.object({
  reportId: z.string().min(1),
  pricePerTon: z.number().positive("Informe o valor em R$/t."),
  date: z.string().min(8),
  client: z.string().trim().optional().default(""),
  origin: z.string().trim().optional().default(""),
  destination: z.string().trim().optional().default(""),
  loadedTons: z.number().min(0).optional().default(0),
  grossWeight: z.number().min(0).optional().default(0),
  netWeight: z.number().min(0).optional().default(0),
  kmStart: z.number().min(0).optional().default(0),
  kmEnd: z.number().min(0).optional().default(0),
  dieselLiters: z.number().min(0).optional().default(0),
  dieselPrice: z.number().min(0).optional().default(0),
});

export const closeTonReport = createServerFn({ method: "POST" })
  .validator(closeTonReportSchema)
  .handler(async ({ data }) => {
    await requireManagement();
    const sql = await getSql();
    const reports = await sql<{
      id: string;
      ticket: string;
      driver_id: string;
      fleet_id: string;
      km: number;
      tons: number;
      freight_mode: string;
      trip_id: string | null;
    }>`select id, ticket, driver_id, fleet_id, km, tons, freight_mode, trip_id
       from reports where id = ${data.reportId} limit 1`;
    const report = reports[0];
    if (!report) throw new Error("Lançamento não encontrado na Caixa.");
    if (report.freight_mode !== "ton") throw new Error("Este fechamento direto é exclusivo para viagens por tonelada.");

    const reportTons = Number(report.tons ?? 0);
    const netWeight = data.netWeight > 0 ? data.netWeight : reportTons;
    const loadedTons = data.loadedTons > 0 ? data.loadedTons : netWeight;
    const kmEnd = data.kmEnd > 0 ? data.kmEnd : Number(report.km ?? 0);
    if (netWeight <= 0) throw new Error("O lançamento não possui peso válido para fechar a viagem.");

    const code = String(report.ticket ?? "").trim().toUpperCase();
    if (!code) throw new Error("O lançamento não possui ticket válido.");
    const sameTicket = await sql<{ id: string }>`select id from trips where code = ${code} limit 1`;
    const existingId = String(report.trip_id ?? sameTicket[0]?.id ?? "").trim();
    const id = existingId || newId("trip");

    await sql`
      insert into trips (
        id, code, date, client, origin, destination, driver_id, fleet_id,
        loaded_tons, gross_weight, net_weight, freight_mode, trip_billing_type,
        price_per_ton, price_per_trip, km_start, km_end, diesel_liters, diesel_price
      ) values (
        ${id}, ${code}, ${data.date}, ${data.client}, ${data.origin}, ${data.destination},
        ${report.driver_id}, ${report.fleet_id}, ${loadedTons}, ${data.grossWeight}, ${netWeight},
        'ton', 'weight', ${data.pricePerTon}, 0, ${data.kmStart}, ${kmEnd},
        ${data.dieselLiters}, ${data.dieselPrice}
      )
      on conflict (id) do update set
        code = excluded.code,
        date = excluded.date,
        client = excluded.client,
        origin = excluded.origin,
        destination = excluded.destination,
        driver_id = excluded.driver_id,
        fleet_id = excluded.fleet_id,
        loaded_tons = excluded.loaded_tons,
        gross_weight = excluded.gross_weight,
        net_weight = excluded.net_weight,
        freight_mode = 'ton',
        trip_billing_type = 'weight',
        price_per_ton = excluded.price_per_ton,
        price_per_trip = 0,
        km_start = excluded.km_start,
        km_end = excluded.km_end,
        diesel_liters = excluded.diesel_liters,
        diesel_price = excluded.diesel_price
    `;
    await sql`
      update reports set
        status = 'aceito',
        trip_id = ${id},
        tons = ${netWeight},
        km = ${kmEnd},
        freight_mode = 'ton'
      where id = ${data.reportId}
    `;
    return { id };
  });
