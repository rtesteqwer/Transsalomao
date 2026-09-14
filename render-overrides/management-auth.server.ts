import { createHmac, timingSafeEqual } from "node:crypto";
import { deleteCookie, getCookie, setCookie } from "@tanstack/react-start/server";

const COOKIE_NAME = "transsalomao_gerencia";
const SESSION_SECONDS = 60 * 60 * 12;

function loginName() {
  return "admin";
}

function loginPassword() {
  return "admin";
}

function sessionSecret() {
  return (
    process.env.MANAGEMENT_SESSION_SECRET?.trim() ||
    "transsalomao-test-session"
  );
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
  if (!Number.isFinite(expiresAt) || expiresAt <= Math.floor(Date.now() / 1000)) return null;

  // Security rule: only the literal admin account can ever become a management session.
  // This also invalidates old driver cookies that were mistakenly issued as Gerência sessions.
  if (username !== loginName()) return null;

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
  if (!session || session.username !== "admin") {
    throw new Error("Sessão administrativa inválida. Somente admin possui acesso à Gerência.");
  }
  return session;
}

export async function loginManagement(username: string, password: string) {
  const cleanUsername = username.trim();

  if (cleanUsername === loginName() && password === loginPassword()) {
    const { logoutKlebersom } = await import("@/lib/klebersom-access.server");
    logoutKlebersom();
    setCookie(COOKIE_NAME, makeToken(loginName()), {
      path: "/",
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: SESSION_SECONDS,
    });
    return { ok: true as const, role: "admin" as const, username: loginName() };
  }

  // Any valid non-admin account is handled as a driver and receives a completely
  // separate driver cookie. Never issue a Gerência cookie to a driver.
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
