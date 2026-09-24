import fs from 'node:fs';
import path from 'node:path';

const target = process.argv[2];
if (!target) throw new Error('request-20260917: target missing');

const textExt = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.json', '.html']);
const files = [];
function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (['node_modules', '.git', '.vercel'].includes(entry.name)) continue;
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(p);
    else if (textExt.has(path.extname(entry.name))) files.push(p);
  }
}
walk(target);

let renderRefs = 0;
for (const p of files) {
  let s = fs.readFileSync(p, 'utf8');
  const before = s;
  const matches = s.match(/https?:\/\/[^\s"'`]*onrender\.com\/?/gi);
  if (matches) renderRefs += matches.length;
  s = s.replace(/https?:\/\/[^\s"'`]*onrender\.com\/?/gi, 'https://transsalomao.vercel.app/');
  s = s.replace(/transteste\.onrender\.com/gi, 'transsalomao.vercel.app');
  if (s !== before) fs.writeFileSync(p, s);
}

// Administração: acesso administrativo único do Felipe; a senha nunca fica em texto puro no repositório.
const serverAuthPath = path.join(target, 'src/lib/management-auth.server.ts');
fs.writeFileSync(serverAuthPath, `import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { deleteCookie, getCookie, setCookie } from "@tanstack/react-start/server";

const COOKIE_NAME = "transsalomao_gerencia";
const SESSION_SECONDS = 60 * 60 * 12;
const ADMINS = [
  { username: "Felipe", passwordHash: "8d969eef6ecad3c29a3a629280e686cf0c3f5d5a86aff3ca12020c923adc6c92" },
] as const;

function passwordHash(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function findAdmin(username: string) {
  const clean = username.trim().toLocaleLowerCase("pt-BR");
  return ADMINS.find((admin) => admin.username.toLocaleLowerCase("pt-BR") === clean) ?? null;
}

function sessionSecret() {
  return process.env.MANAGEMENT_SESSION_SECRET?.trim() || "transsalomao-test-session";
}

function signature(payload: string) {
  return createHmac("sha256", sessionSecret()).update(payload).digest("hex");
}

function makeToken(username: string) {
  const expiresAt = Math.floor(Date.now() / 1000) + SESSION_SECONDS;
  const payload = \`${'${username}'}|${'${expiresAt}'}\`;
  return \`${'${payload}'}|${'${signature(payload)}'}\`;
}

function parseToken(token: string | undefined) {
  if (!token) return null;
  const parts = token.split("|");
  if (parts.length !== 3) return null;
  const [username, expiresRaw, supplied] = parts;
  const expiresAt = Number(expiresRaw);
  if (!Number.isFinite(expiresAt) || expiresAt <= Math.floor(Date.now() / 1000)) return null;
  if (!ADMINS.some((admin) => admin.username === username)) return null;
  const payload = \`${'${username}'}|${'${expiresAt}'}\`;
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
  const admin = findAdmin(cleanUsername);
  if (admin && passwordHash(password) === admin.passwordHash) {
    const { logoutKlebersom } = await import("@/lib/klebersom-access.server");
    logoutKlebersom();
    setCookie(COOKIE_NAME, makeToken(admin.username), {
      path: "/",
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: SESSION_SECONDS,
    });
    return { ok: true as const, role: "admin" as const, username: admin.username };
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
`);

const clientAuthPath = path.join(target, 'src/lib/management-auth.ts');
fs.writeFileSync(clientAuthPath, `import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const loginSchema = z.object({
  username: z.string().trim().min(1, "Informe o login"),
  password: z.string().min(1, "Informe a senha"),
});

export const getManagementSession = createServerFn({ method: "GET" }).handler(async () => {
  const { managementSession } = await import("@/lib/management-auth.server");
  const session = managementSession();
  return session
    ? { authenticated: true as const, username: session.username, role: "admin" as const }
    : { authenticated: false as const, username: null, role: null };
});

export const managementLogin = createServerFn({ method: "POST" })
  .validator(loginSchema)
  .handler(async ({ data }) => {
    const { loginManagement } = await import("@/lib/management-auth.server");
    return loginManagement(data.username, data.password);
  });

const managementLogoutServer = createServerFn({ method: "POST" }).handler(async () => {
  const { logoutManagement } = await import("@/lib/management-auth.server");
  return logoutManagement();
});

export async function managementLogout() {
  const result = await managementLogoutServer();
  if (typeof window !== "undefined") {
    try {
      if ("serviceWorker" in navigator) {
        const registrations = await navigator.serviceWorker.getRegistrations();
        await Promise.all(registrations.map((registration) => registration.unregister()));
      }
      if ("caches" in window) {
        const keys = await caches.keys();
        await Promise.all(keys.map((key) => caches.delete(key)));
      }
    } catch {}
    window.location.replace("/");
  }
  return result;
}
`);

// Login da Gerência: usuário administrativo padrão é Felipe.
const managementRoutePath = path.join(target, 'src/routes/dono/route.tsx');
if (fs.existsSync(managementRoutePath)) {
  let route = fs.readFileSync(managementRoutePath, 'utf8');
  route = route
    .replace('const [username, setUsername] = useState("admin");', 'const [username, setUsername] = useState("Felipe");')
    .replace(/placeholder="admin"/g, 'placeholder="Felipe"')
    .replace(/\n\s*<p className="mt-5 rounded-md border border-border bg-bg px-3 py-2 text-xs text-muted">[\s\S]*?Acesso inicial configurado:[\s\S]*?<\/p>/m, '')
    .replace(/Acesso inicial configurado:[\s\S]*?admin[\s\S]*?admin\./g, '');
  fs.writeFileSync(managementRoutePath, route);
}

// Diesel/preço por litro: força 3 casas quando o formatter estiver associado ao preço do diesel/litro.
for (const p of files) {
  let s = fs.readFileSync(p, 'utf8');
  const before = s;
  if (/diesel|abastec|fuel|litro/i.test(s)) {
    s = s.replace(/((?:pricePerLiter|fuelPrice|dieselPrice|priceLiter|literPrice|price_per_liter)\b[^\n;]{0,120}\.toFixed\()2(\))/gi, '$13$2');
  }
  if (s !== before) fs.writeFileSync(p, s);
}

// Validação final: nenhuma URL do Render e nenhuma credencial admin/admin podem sobreviver no app final.
const leftovers = [];
for (const p of files) {
  const s = fs.readFileSync(p, 'utf8');
  if (/onrender\.com|transteste/i.test(s)) leftovers.push(`render:${path.relative(target, p)}`);
}
const serverAuth = fs.readFileSync(serverAuthPath, 'utf8');
if (/return\s+["']admin["']|password[^\n]{0,80}["']admin["']|username\s*!==\s*["']admin["']/i.test(serverAuth)) {
  leftovers.push('legacy-admin:src/lib/management-auth.server.ts');
}
if (leftovers.length) throw new Error(`request-20260917 validation failed: ${leftovers.join(', ')}`);
console.log(`[request-20260917] Render URLs removed=${renderRefs}; admin auth replaced; logout locked to /; legacy admin removed`);
