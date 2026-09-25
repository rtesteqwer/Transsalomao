import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { deleteCookie, getCookie, setCookie } from "@tanstack/react-start/server";
import { getSql } from "@/lib/db";

const COOKIE_NAME = "transsalomao_gerencia";
const SESSION_SECONDS = 60 * 60 * 12;
const LEGACY_ADMINS = [
  { username: "Felipe", passwordHash: "3d14c2d4e4ced81e459e4ace7c01466a700000fb94a3bbe944a55fb92693e879" },
  { username: "Emanuel", passwordHash: "0013fa1710b8b0e4816d6eaad9668dab6dfa7ea9f1d07291fa5072e857e94522" },
  { username: "Murillo", passwordHash: "0013fa1710b8b0e4816d6eaad9668dab6dfa7ea9f1d07291fa5072e857e94522" },
] as const;

export function passwordHash(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function sameHash(a: string, b: string) {
  const aa = Buffer.from(a);
  const bb = Buffer.from(b);
  return aa.length === bb.length && timingSafeEqual(aa, bb);
}

export async function verifyManagementCredentials(username: string, password: string) {
  const clean = username.trim();
  const supplied = passwordHash(password);
  try {
    const sql = await getSql();
    const rows = await sql<{ username: string; password_hash: string; role: string; status: string }>`
      select username, password_hash, role, status
      from management_users
      where lower(username) = lower(${clean})
      limit 1
    `;
    const row = rows[0];
    if (row && row.status === "ativo" && sameHash(supplied, row.password_hash)) {
      return { ok: true as const, username: row.username, role: row.role || "admin" };
    }
    if (row) return { ok: false as const };
  } catch (error) {
    console.error("[management-auth] database lookup fallback", error);
  }

  const legacy = LEGACY_ADMINS.find((x) => x.username.toLocaleLowerCase("pt-BR") === clean.toLocaleLowerCase("pt-BR"));
  return legacy && sameHash(supplied, legacy.passwordHash)
    ? { ok: true as const, username: legacy.username, role: "admin" }
    : { ok: false as const };
}

function sessionSecret() {
  return process.env.MANAGEMENT_SESSION_SECRET?.trim() || "transsalomao-test-session";
}
function signature(payload: string) {
  return createHmac("sha256", sessionSecret()).update(payload).digest("hex");
}
function makeToken(username: string) {
  const expiresAt = Math.floor(Date.now() / 1000) + SESSION_SECONDS;
  const payload = `${username}|${expiresAt}`;
  return `${payload}|${signature(payload)}`;
}
function parseToken(token: string | undefined) {
  if (!token) return null;
  const parts = token.split("|");
  if (parts.length !== 3) return null;
  const [username, expiresRaw, supplied] = parts;
  const expiresAt = Number(expiresRaw);
  if (!username || !Number.isFinite(expiresAt) || expiresAt <= Math.floor(Date.now() / 1000)) return null;
  const payload = `${username}|${expiresAt}`;
  const expected = signature(payload);
  const a = Buffer.from(supplied);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  return { username, expiresAt };
}

export function managementSession() {
  return parseToken(getCookie(COOKIE_NAME));
}
export function assertManagementSession() {
  const session = managementSession();
  if (!session) throw new Error("Sessão administrativa inválida.");
  return session;
}

export async function loginManagement(username: string, password: string) {
  const cleanUsername = username.trim();
  const verified = await verifyManagementCredentials(cleanUsername, password);
  if (verified.ok) {
    const { logoutKlebersom } = await import("@/lib/klebersom-access.server");
    logoutKlebersom();
    setCookie(COOKIE_NAME, makeToken(verified.username), {
      path: "/",
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: SESSION_SECONDS,
    });
    return { ok: true as const, role: "admin" as const, username: verified.username };
  }

  const { loginKlebersom } = await import("@/lib/klebersom-access.server");
  const driverResult = loginKlebersom(cleanUsername, password);
  if (driverResult.ok) {
    deleteCookie(COOKIE_NAME, { path: "/" });
    return driverResult;
  }
  return { ok: false as const, message: "Login ou senha inválidos." };
}

export function logoutManagement() {
  deleteCookie(COOKIE_NAME, { path: "/" });
  return { ok: true as const };
}
