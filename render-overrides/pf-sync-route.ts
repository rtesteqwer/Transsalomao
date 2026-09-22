import { createFileRoute } from "@tanstack/react-router";
import { getSql } from "@/lib/db";
import { authenticateAssistantRequest, issueAssistantToken } from "@/lib/assistant-auth.server";

type Row = Record<string, any>;

const OWNER_NAME = process.env.PF_OWNER_DRIVER_NAME?.trim() || "Felipe Rocha Garcia";
const SHARE_RATE = 0.03;
const DRIVER_COMMISSION_RATE = 0.20;

function n(value: unknown) {
  const x = Number(value ?? 0);
  return Number.isFinite(x) ? x : 0;
}
function norm(value: unknown) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("pt-BR")
    .replace(/\s+/g, " ")
    .trim();
}
function iso(value: unknown) {
  const s = String(value ?? "").slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : "";
}
function todayBR() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}
function monthRange(count: number) {
  const today = todayBR();
  const [year, month] = today.slice(0, 7).split("-").map(Number);
  const keys: string[] = [];
  for (let i = count - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(year, month - 1 - i, 1));
    keys.push(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`);
  }
  return keys;
}
function freight(t: Row) {
  return t.freight_mode === "ton"
    ? n(t.net_weight) * n(t.price_per_ton)
    : n(t.price_per_trip);
}
function corsHeaders() {
  return {
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Authorization, Content-Type, X-Salomao-App",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  };
}
function out(value: unknown, status = 200) {
  return Response.json(value, { status, headers: corsHeaders() });
}
function findOwnerDriver(drivers: Row[]) {
  const target = norm(OWNER_NAME);
  const exact = drivers.find((d) => norm(d.name) === target);
  if (exact) return exact;
  const targetTokens = target.split(" ").filter((x) => x.length > 2);
  const ranked = drivers
    .map((d) => {
      const name = norm(d.name);
      const hits = targetTokens.filter((token) => name.includes(token)).length;
      return { d, score: hits };
    })
    .sort((a, b) => b.score - a.score);
  return ranked[0]?.score >= Math.max(2, targetTokens.length - 1) ? ranked[0].d : null;
}

export const Route = createFileRoute("/api/pf-sync")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: corsHeaders() }),

      POST: async ({ request }) => {
        let body: any = {};
        try { body = await request.json(); } catch {}
        const username = String(body?.username ?? "").trim();
        const password = String(body?.password ?? "");
        const deviceLabel = String(body?.deviceLabel ?? "Meu Capital PF").slice(0, 120);
        if (!username || !password) {
          return out({ ok: false, code: "MISSING_CREDENTIALS" }, 400);
        }
        const { verifyManagementCredentials } = await import("@/lib/management-auth.server");
        const verified = await verifyManagementCredentials(username, password);
        if (!verified.ok) {
          return out({ ok: false, code: "INVALID_CREDENTIALS" }, 401);
        }
        const issued = await issueAssistantToken(verified.username, deviceLabel);
        return out({
          ok: true,
          username: verified.username,
          token: issued.token,
          expiresInDays: issued.expiresInDays,
        });
      },

      GET: async ({ request }) => {
        const auth = await authenticateAssistantRequest(request);
        if (!auth) {
          return out({ ok: false, code: "LOGIN_REQUIRED" }, 401);
        }

        const url = new URL(request.url);
        const monthsRequested = Math.max(1, Math.min(60, Math.floor(Number(url.searchParams.get("months") || "24"))));
        const months = monthRange(monthsRequested);
        const startDate = `${months[0]}-01`;

        const sql = await getSql();
        const [drivers, fleets, trips] = await Promise.all([
          sql<Row>`select id,name,commission_pct,status from drivers order by lower(name)`,
          sql<Row>`select id,name,tractor_plate,trailer_plate from fleets`,
          sql<Row>`
            select
              id, code, date::text as date, client, origin, destination,
              driver_id, fleet_id, net_weight, freight_mode,
              price_per_ton, price_per_trip
            from trips
            where date >= ${startDate}
            order by date asc, code asc
          `,
        ]);

        const ownerDriver = findOwnerDriver(drivers);
        const fleetById = new Map(fleets.map((f) => [String(f.id), f]));
        const byMonth = new Map<string, {
          companyGross: number;
          ownerDriverGross: number;
          ownerDriverCommission: number;
          ownerTrips: number;
        }>();
        for (const month of months) {
          byMonth.set(month, { companyGross: 0, ownerDriverGross: 0, ownerDriverCommission: 0, ownerTrips: 0 });
        }

        const ownerTrips: any[] = [];
        for (const trip of trips) {
          const date = iso(trip.date);
          const month = date.slice(0, 7);
          const bucket = byMonth.get(month);
          if (!bucket) continue;
          const gross = freight(trip);
          bucket.companyGross += gross;

          if (ownerDriver && String(trip.driver_id) === String(ownerDriver.id)) {
            const commission = gross * DRIVER_COMMISSION_RATE;
            bucket.ownerDriverGross += gross;
            bucket.ownerDriverCommission += commission;
            bucket.ownerTrips += 1;
            const fleet = fleetById.get(String(trip.fleet_id));
            ownerTrips.push({
              id: String(trip.id),
              sourceId: `transsalomao:trip:${trip.id}:commission20`,
              code: String(trip.code ?? ""),
              date,
              month,
              client: String(trip.client ?? ""),
              origin: String(trip.origin ?? ""),
              destination: String(trip.destination ?? ""),
              fleet: String(fleet?.name ?? ""),
              tractorPlate: String(fleet?.tractor_plate ?? ""),
              trailerPlate: String(fleet?.trailer_plate ?? ""),
              freightMode: String(trip.freight_mode ?? ""),
              netWeight: n(trip.net_weight),
              grossFreight: gross,
              commissionRate: DRIVER_COMMISSION_RATE,
              commissionAmount: commission,
            });
          }
        }

        const monthRows = months.map((month) => {
          const b = byMonth.get(month)!;
          const ownerShare = b.companyGross * SHARE_RATE;
          return {
            month,
            companyGross: b.companyGross,
            shareRate: SHARE_RATE,
            ownerShare,
            shareSourceId: `transsalomao:share:${month}`,
            ownerDriverGross: b.ownerDriverGross,
            driverCommissionRate: DRIVER_COMMISSION_RATE,
            driverCommission: b.ownerDriverCommission,
            ownerTripCount: b.ownerTrips,
            totalEarned: ownerShare + b.ownerDriverCommission,
          };
        });

        return out({
          ok: true,
          source: "Trans Salomão",
          syncedAt: new Date().toISOString(),
          authenticatedAs: auth.username,
          owner: {
            name: OWNER_NAME,
            shareRate: SHARE_RATE,
            driverCommissionRate: DRIVER_COMMISSION_RATE,
            driverFound: !!ownerDriver,
            driverName: ownerDriver?.name ?? null,
            registeredCommissionPct: ownerDriver ? n(ownerDriver.commission_pct) : null,
          },
          months: monthRows,
          trips: ownerTrips,
        });
      },
    },
  },
});
