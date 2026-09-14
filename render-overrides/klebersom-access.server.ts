import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { Client } from "pg";
import { deleteCookie, getCookie, setCookie } from "@tanstack/react-start/server";

const COOKIE_NAME = "transsalomao_motorista";
const LEGACY_COOKIE_NAME = "transsalomao_klebersom";
const SESSION_SECONDS = 60 * 60 * 12;
const BUILTIN_KLEBERSOM_USERNAME = "KlebersomDutra";
const BUILTIN_KLEBERSOM_PASSWORD_SHA256 = "8d969eef6ecad3c29a3a629280e686cf0c3f5d5a86aff3ca12020c923adc6c92";
const BUILTIN_KLEBERSOM_DRIVER_ID = "drv_d0d50a32b1";

type DriverAccount = {
  username: string;
  driverId: string;
  password?: string;
  passwordSha256?: string;
};

function driverAccounts(): DriverAccount[] {
  const accounts: DriverAccount[] = [];
  const raw = process.env.DRIVER_ACCOUNTS_JSON?.trim();
  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        for (const item of parsed) {
          const username = String(item?.username ?? "").trim();
          const password = String(item?.password ?? "");
          const driverId = String(item?.driverId ?? "").trim();
          if (username && password && driverId) accounts.push({ username, password, driverId });
        }
      }
    } catch {
      throw new Error("DRIVER_ACCOUNTS_JSON inválido.");
    }
  }

  const legacyUsername = (process.env.KLEBERSOM_LOGIN ?? process.env.KLEBERSOM_ACCESS_LOGIN ?? "").trim();
  const legacyPassword = process.env.KLEBERSOM_PASSWORD ?? process.env.KLEBERSOM_ACCESS_PASSWORD ?? "";
  const legacyDriverId = process.env.KLEBERSOM_DRIVER_ID?.trim() ?? "";
  if (legacyUsername && legacyPassword && legacyDriverId) {
    const already = accounts.some((account) => account.username.toLowerCase() === legacyUsername.toLowerCase());
    if (!already) accounts.push({ username: legacyUsername, password: legacyPassword, driverId: legacyDriverId });
  }

  // Conta operacional fixa solicitada para o motorista Klebersom.
  // A senha não fica em texto puro no repositório; somente o SHA-256 é armazenado.
  if (!accounts.some((account) => account.username.toLowerCase() === BUILTIN_KLEBERSOM_USERNAME.toLowerCase())) {
    accounts.push({
      username: BUILTIN_KLEBERSOM_USERNAME,
      passwordSha256: BUILTIN_KLEBERSOM_PASSWORD_SHA256,
      driverId: BUILTIN_KLEBERSOM_DRIVER_ID,
    });
  }

  return accounts;
}

function accountByUsername(username: string) {
  const normalized = username.trim().toLowerCase();
  return driverAccounts().find((account) => account.username.toLowerCase() === normalized) ?? null;
}

function safeEqual(aValue: string, bValue: string) {
  const a = Buffer.from(aValue);
  const b = Buffer.from(bValue);
  return a.length === b.length && timingSafeEqual(a, b);
}

function passwordMatches(account: DriverAccount, password: string) {
  if (account.password !== undefined) return safeEqual(account.password, password);
  if (account.passwordSha256) {
    const digest = createHash("sha256").update(password).digest("hex");
    return safeEqual(account.passwordSha256, digest);
  }
  return false;
}

function sessionSecret() {
  const value =
    process.env.DRIVER_SESSION_SECRET?.trim() ||
    process.env.KLEBERSOM_SESSION_SECRET?.trim() ||
    process.env.MANAGEMENT_SESSION_SECRET?.trim() ||
    process.env.DATABASE_URL?.trim();
  if (!value) throw new Error("Segredo de sessão dos motoristas não configurado.");
  return value;
}

function signature(payload: string) {
  return createHmac("sha256", sessionSecret()).update(payload).digest("hex");
}

function makeToken(username: string, driverId: string) {
  const expiresAt = Math.floor(Date.now() / 1000) + SESSION_SECONDS;
  const payload = `${username}|${driverId}|${expiresAt}`;
  return `${payload}|${signature(payload)}`;
}

function parseToken(token: string | undefined) {
  if (!token) return null;
  const parts = token.split("|");
  if (parts.length !== 4) return null;
  const [username, driverId, expiresRaw, supplied] = parts;
  const expiresAt = Number(expiresRaw);
  if (!Number.isFinite(expiresAt) || expiresAt <= Math.floor(Date.now() / 1000)) return null;

  const account = accountByUsername(username);
  if (!account || account.driverId !== driverId) return null;

  const payload = `${username}|${driverId}|${expiresAt}`;
  const expected = signature(payload);
  if (!safeEqual(supplied, expected)) return null;
  return { username: account.username, driverId, expiresAt };
}

export function klebersomSession() {
  return parseToken(getCookie(COOKIE_NAME));
}

// Mantém o nome exportado anterior para compatibilidade com a rota existente.
// Nunca aceita cookie da Gerência/admin como sessão de motorista.
export function klebersomAuthorizedSession() {
  return klebersomSession();
}

export function loginKlebersom(username: string, password: string) {
  const account = accountByUsername(username);
  if (!account || !passwordMatches(account, password)) {
    return { ok: false as const, message: "Login ou senha inválidos." };
  }

  deleteCookie(LEGACY_COOKIE_NAME, { path: "/" });
  setCookie(COOKIE_NAME, makeToken(account.username, account.driverId), {
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: SESSION_SECONDS,
  });
  return { ok: true as const, role: "driver" as const, username: account.username, driverId: account.driverId };
}

export function logoutKlebersom() {
  deleteCookie(COOKIE_NAME, { path: "/" });
  deleteCookie(LEGACY_COOKIE_NAME, { path: "/" });
  return { ok: true as const };
}

function numberValue(value: unknown) {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function dateValue(value: unknown) {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value ?? "").slice(0, 10);
}

export async function getKlebersomDashboardData() {
  const session = klebersomAuthorizedSession();
  if (!session) throw new Error("Sessão de motorista expirada. Faça login novamente pelo Painel da Gerência.");

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL não configurado.");

  const client = new Client({ connectionString });
  await client.connect();
  try {
    const [driverResult, tripsResult, expensesResult, fuelingsResult, reportsResult] = await Promise.all([
      client.query(
        `select id, name, commission_pct, status from drivers where id = $1 limit 1`,
        [session.driverId],
      ),
      client.query(
        `select t.id, t.code, t.date, t.client, t.origin, t.destination,
                t.loaded_tons, t.gross_weight, t.net_weight, t.price_per_ton, t.price_per_trip,
                t.freight_mode, t.trip_billing_type, t.km_start, t.km_end,
                t.diesel_liters, t.diesel_price, t.fleet_id,
                f.name as fleet_name, f.tractor_plate, f.trailer_plate
           from trips t
           left join fleets f on f.id = t.fleet_id
          where t.driver_id = $1
          order by t.date desc, case when t.code ~ '^[0-9]+$' then t.code::int else 0 end desc`,
        [session.driverId],
      ),
      client.query(
        `select e.id, e.date, e.fleet_id, e.asset_type, e.category, e.description, e.amount, e.notes,
                f.name as fleet_name, f.tractor_plate, f.trailer_plate
           from expenses e
           left join fleets f on f.id = e.fleet_id
          where e.driver_id = $1
          order by e.date desc, e.created_at desc`,
        [session.driverId],
      ),
      client.query(
        `select fu.id, fu.date, fu.fleet_id, fu.station, fu.km, fu.liters, fu.price_per_liter, fu.notes,
                f.name as fleet_name, f.tractor_plate, f.trailer_plate
           from fuelings fu
           left join fleets f on f.id = fu.fleet_id
          where fu.driver_id = $1
          order by fu.date desc, fu.created_at desc`,
        [session.driverId],
      ),
      client.query(
        `select r.id, r.ticket, r.trip_id, r.fleet_id, r.km, r.tons, r.status,
                r.created_at, r.loading_date, r.loading_time, r.quantity,
                r.freight_mode, r.trip_billing_type,
                t.date as trip_date, t.net_weight, t.price_per_ton, t.price_per_trip,
                f.name as fleet_name, f.tractor_plate, f.trailer_plate
           from reports r
           left join trips t on t.id = r.trip_id and t.driver_id = $1
           left join fleets f on f.id = r.fleet_id
          where r.driver_id = $1
          order by coalesce(r.loading_date, t.date, r.created_at::date) desc,
                   case when r.ticket ~ '^[0-9]+$' then r.ticket::int else 0 end desc`,
        [session.driverId],
      ),
    ]);

    const driverRow = driverResult.rows[0];
    if (!driverRow) throw new Error("Motorista vinculado ao acesso não encontrado.");

    const commissionPct = numberValue(driverRow.commission_pct);
    const trips = tripsResult.rows.map((row) => {
      const loadedTons = numberValue(row.loaded_tons);
      const grossWeight = numberValue(row.gross_weight);
      const netWeight = numberValue(row.net_weight);
      const pricePerTon = numberValue(row.price_per_ton);
      const pricePerTrip = numberValue(row.price_per_trip);
      const freightMode = String(row.freight_mode ?? "ton");
      const freight = freightMode === "ton" ? netWeight * pricePerTon : pricePerTrip;
      const commission = freight * commissionPct;
      const kmStart = numberValue(row.km_start);
      const kmEnd = numberValue(row.km_end);
      const kmRun = kmEnd >= kmStart ? kmEnd - kmStart : 0;
      const dieselLiters = numberValue(row.diesel_liters);
      const dieselPrice = numberValue(row.diesel_price);
      return {
        id: String(row.id),
        code: String(row.code),
        date: dateValue(row.date),
        client: String(row.client ?? ""),
        origin: String(row.origin ?? ""),
        destination: String(row.destination ?? ""),
        loadedTons,
        grossWeight,
        netWeight,
        pricePerTon,
        pricePerTrip,
        freightMode,
        tripBillingType: String(row.trip_billing_type ?? ""),
        freight,
        commission,
        afterCommission: freight - commission,
        kmStart,
        kmEnd,
        kmRun,
        dieselLiters,
        dieselPrice,
        dieselCost: dieselLiters * dieselPrice,
        fleetId: String(row.fleet_id ?? ""),
        fleetName: String(row.fleet_name ?? ""),
        tractorPlate: String(row.tractor_plate ?? ""),
        trailerPlate: String(row.trailer_plate ?? ""),
      };
    });

    const expenses = expensesResult.rows.map((row) => ({
      id: String(row.id),
      date: dateValue(row.date),
      fleetId: String(row.fleet_id ?? ""),
      fleetName: String(row.fleet_name ?? ""),
      tractorPlate: String(row.tractor_plate ?? ""),
      trailerPlate: String(row.trailer_plate ?? ""),
      assetType: String(row.asset_type ?? ""),
      category: String(row.category ?? ""),
      description: String(row.description ?? ""),
      amount: numberValue(row.amount),
      notes: String(row.notes ?? ""),
    }));

    const fuelings = fuelingsResult.rows.map((row) => {
      const liters = numberValue(row.liters);
      const pricePerLiter = numberValue(row.price_per_liter);
      return {
        id: String(row.id),
        date: dateValue(row.date),
        fleetId: String(row.fleet_id ?? ""),
        fleetName: String(row.fleet_name ?? ""),
        tractorPlate: String(row.tractor_plate ?? ""),
        trailerPlate: String(row.trailer_plate ?? ""),
        station: String(row.station ?? ""),
        km: numberValue(row.km),
        liters,
        pricePerLiter,
        amount: liters * pricePerLiter,
        notes: String(row.notes ?? ""),
      };
    });

    const reports = reportsResult.rows.map((row) => {
      const tons = numberValue(row.tons);
      const netWeight = numberValue(row.net_weight);
      const pricePerTon = numberValue(row.price_per_ton);
      const pricePerTrip = numberValue(row.price_per_trip);
      const freightMode = String(row.freight_mode ?? "ton");
      const freight = row.trip_id
        ? (freightMode === "ton" ? netWeight * pricePerTon : pricePerTrip)
        : 0;
      return {
        id: String(row.id),
        ticket: String(row.ticket ?? ""),
        tripId: String(row.trip_id ?? ""),
        date: dateValue(row.loading_date ?? row.trip_date ?? row.created_at),
        km: numberValue(row.km),
        tons,
        status: String(row.status ?? ""),
        quantity: Number(row.quantity ?? 0),
        freightMode,
        tripBillingType: String(row.trip_billing_type ?? ""),
        freight,
        commission: freight * commissionPct,
        fleetId: String(row.fleet_id ?? ""),
        fleetName: String(row.fleet_name ?? ""),
        tractorPlate: String(row.tractor_plate ?? ""),
        trailerPlate: String(row.trailer_plate ?? ""),
      };
    });

    const billing = trips.reduce((total, trip) => total + trip.freight, 0);
    const commission = trips.reduce((total, trip) => total + trip.commission, 0);
    const explicitExpenses = expenses.reduce((total, expense) => total + expense.amount, 0);
    const fuelExpenses = fuelings.reduce((total, fueling) => total + fueling.amount, 0);
    const totalExpenses = explicitExpenses + fuelExpenses;
    const result = billing - commission - totalExpenses;
    const totalTons = trips.reduce((total, trip) => total + trip.netWeight, 0);
    const totalKm = trips.reduce((total, trip) => total + trip.kmRun, 0);

    return {
      username: session.username,
      driver: {
        id: String(driverRow.id),
        name: String(driverRow.name),
        commissionPct,
        status: String(driverRow.status ?? ""),
      },
      totals: {
        billing,
        commission,
        explicitExpenses,
        fuelExpenses,
        totalExpenses,
        result,
        totalTons,
        totalKm,
        trips: trips.length,
        reports: reports.length,
      },
      trips,
      expenses,
      fuelings,
      reports,
    };
  } finally {
    await client.end();
  }
}
