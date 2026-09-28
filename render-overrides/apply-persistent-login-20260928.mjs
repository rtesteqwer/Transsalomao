import fs from 'node:fs';
import path from 'node:path';

const target = process.argv[2];
if (!target) throw new Error('persistent-login: target missing');

function edit(rel, fn) {
  const file = path.join(target, rel);
  if (!fs.existsSync(file)) throw new Error('persistent-login missing ' + rel);
  const before = fs.readFileSync(file, 'utf8');
  const after = fn(before);
  if (after === before) throw new Error('persistent-login made no changes in ' + rel);
  fs.writeFileSync(file, after);
  console.log('[persistent-login] ' + rel);
}
function rep(text, pattern, replacement, label) {
  const next = text.replace(pattern, replacement);
  if (next === text) throw new Error('persistent-login pattern missing: ' + label);
  return next;
}

edit('src/lib/management-auth.server.ts', (input) => {
  let s = input;
  s = rep(s, 'const SESSION_SECONDS = 60 * 60 * 12;\nconst RESET_SECONDS = 10 * 60;', 'const SESSION_SECONDS = 60 * 60 * 12;\nconst REMEMBER_SECONDS = 60 * 60 * 24 * 30;\nconst RESET_SECONDS = 10 * 60;', 'management duration');
  s = rep(s, 'export async function loginManagement(username: string, password: string) {', 'export async function loginManagement(username: string, password: string, remember = false) {', 'management signature');
  s = rep(s, '    deleteCookie(RESET_COOKIE_NAME, { path: "/" });\n    setCookie(COOKIE_NAME, makeToken(verified.username, "session", SESSION_SECONDS), { path: "/", httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", maxAge: SESSION_SECONDS });',
    '    deleteCookie(RESET_COOKIE_NAME, { path: "/" });\n    const sessionSeconds = remember ? REMEMBER_SECONDS : SESSION_SECONDS;\n    setCookie(COOKIE_NAME, makeToken(verified.username, "session", sessionSeconds), { path: "/", httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", maxAge: sessionSeconds });', 'management cookie');
  s = rep(s, '  const driverResult = await loginKlebersom(cleanUsername, password);', '  const driverResult = await loginKlebersom(cleanUsername, password, remember);', 'management driver fallback');
  return s;
});

edit('src/lib/management-auth.ts', (input) => {
  let s = input;
  s = rep(s, '  password: z.string().min(1, "Informe a senha"),\n});', '  password: z.string().min(1, "Informe a senha"),\n  remember: z.boolean().optional().default(false),\n});', 'management schema');
  s = rep(s, '    return loginManagement(data.username, data.password);', '    return loginManagement(data.username, data.password, data.remember);', 'management handler');
  return s;
});

edit('src/lib/klebersom-access.server.ts', (input) => {
  let s = input;
  s = rep(s, 'const SESSION_SECONDS = 60 * 60 * 12;\nconst RESET_SECONDS = 10 * 60;', 'const SESSION_SECONDS = 60 * 60 * 12;\nconst REMEMBER_SECONDS = 60 * 60 * 24 * 30;\nconst RESET_SECONDS = 10 * 60;', 'driver duration');
  s = rep(s, 'export async function loginKlebersom(username:string,password:string){', 'export async function loginKlebersom(username:string,password:string,remember=false){', 'driver signature');
  s = rep(s,
    '  deleteCookie(RESET_COOKIE_NAME,{path:"/"}); setCookie(COOKIE_NAME,makeToken(account.username,account.driver_id,"session",SESSION_SECONDS),{path:"/",httpOnly:true,sameSite:"lax",secure:process.env.NODE_ENV==="production",maxAge:SESSION_SECONDS});',
    '  deleteCookie(RESET_COOKIE_NAME,{path:"/"}); const sessionSeconds=remember?REMEMBER_SECONDS:SESSION_SECONDS; setCookie(COOKIE_NAME,makeToken(account.username,account.driver_id,"session",sessionSeconds),{path:"/",httpOnly:true,sameSite:"lax",secure:process.env.NODE_ENV==="production",maxAge:sessionSeconds});',
    'driver cookie');
  return s;
});

edit('src/lib/klebersom-access.ts', (input) => {
  let s = input;
  s = rep(s, '  password: z.string().min(1, "Informe a senha"),\n});', '  password: z.string().min(1, "Informe a senha"),\n  remember: z.boolean().optional().default(false),\n});', 'driver schema');
  s = rep(s, '    return loginKlebersom(data.username, data.password);', '    return loginKlebersom(data.username, data.password, data.remember);', 'driver handler');
  return s;
});

edit('src/routes/dono/route.tsx', (input) => {
  let s = input;
  s = rep(s, '  const [password, setPassword] = useState("");\n  const [submitting, setSubmitting] = useState(false);', '  const [password, setPassword] = useState("");\n  const [remember, setRemember] = useState(true);\n  const [submitting, setSubmitting] = useState(false);', 'management state');
  s = rep(s, '                    data: { username: username.trim(), password },', '                    data: { username: username.trim(), password, remember },', 'management submit');
  s = rep(s, '              <Button type="submit" size="lg" disabled={submitting}>',
    '              <label className="flex items-center gap-3 text-sm text-muted">\n                <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} className="size-4 accent-current" />\n                <span>Manter conectado neste dispositivo por 30 dias</span>\n              </label>\n              <Button type="submit" size="lg" disabled={submitting}>', 'management checkbox');
  return s;
});

edit('src/routes/klebersom.tsx', (input) => {
  let s = input;
  s = rep(s, '  const [password, setPassword] = useState("");\n  const [error, setError] = useState("");', '  const [password, setPassword] = useState("");\n  const [remember, setRemember] = useState(true);\n  const [error, setError] = useState("");', 'driver state');
  s = rep(s, '                const result = await klebersomLogin({ data: { username: username.trim(), password } });', '                const result = await klebersomLogin({ data: { username: username.trim(), password, remember } });', 'driver submit');
  s = rep(s, '            {error ? <p className="rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">{error}</p> : null}\n            <button className="h-12 rounded-lg bg-fg px-4 font-semibold text-bg disabled:opacity-50" type="submit" disabled={submitting}>{submitting ? "Entrando..." : "Entrar"}</button>',
    '            <label className="flex items-center gap-3 text-sm text-muted"><input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} className="size-4 accent-current" /><span>Manter conectado neste dispositivo por 30 dias</span></label>\n            {error ? <p className="rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">{error}</p> : null}\n            <button className="h-12 rounded-lg bg-fg px-4 font-semibold text-bg disabled:opacity-50" type="submit" disabled={submitting}>{submitting ? "Entrando..." : "Entrar"}</button>', 'driver checkbox');
  return s;
});

edit('src/components/ticket-photo-access.tsx', (input) => {
  let s = input;
  s = rep(s, '  const [password, setPassword] = useState("");\n  const [error, setError] = useState("");', '  const [password, setPassword] = useState("");\n  const [remember, setRemember] = useState(true);\n  const [error, setError] = useState("");', 'ticket state');
  s = rep(s, '      const result = await managementLogin({ data: { username, password } });', '      const result = await managementLogin({ data: { username, password, remember } });', 'ticket submit');
  s = rep(s, '      {error ? <p role="alert" className="text-sm text-danger">{error}</p> : null}\n      <Button type="button" onClick={() => void login()} disabled={busy || !username.trim() || !password}>',
    '      <label className="flex items-center gap-3 text-sm text-muted"><input type="checkbox" checked={remember} onChange={event => setRemember(event.target.checked)} className="size-4 accent-current" /><span>Manter conectado neste dispositivo por 30 dias</span></label>\n      {error ? <p role="alert" className="text-sm text-danger">{error}</p> : null}\n      <Button type="button" onClick={() => void login()} disabled={busy || !username.trim() || !password}>', 'ticket checkbox');
  return s;
});

edit('src/lib/assistant-auth.server.ts', (input) => {
  let s = input;
  s = rep(s, 'import { createHash, randomBytes } from "node:crypto";\nimport { getSql } from "@/lib/db";', 'import { createHash, randomBytes } from "node:crypto";\nimport { deleteCookie, getCookie, setCookie } from "@tanstack/react-start/server";\nimport { getSql } from "@/lib/db";', 'assistant imports');
  s = rep(s, 'const TOKEN_DAYS = 90;', 'const TOKEN_DAYS = 90;\nconst COOKIE_NAME = "transsalomao_assistant";\nconst REMEMBER_SECONDS = 60 * 60 * 24 * 30;', 'assistant constants');
  s = rep(s, 'export function readBearer(request: Request) {',
    'export function persistAssistantSession(token: string, remember: boolean) {\n  deleteCookie(COOKIE_NAME, { path: "/" });\n  if (remember && token) setCookie(COOKIE_NAME, token, { path: "/", httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", maxAge: REMEMBER_SECONDS });\n}\n\nexport function readBearer(request: Request) {', 'assistant persist helper');
  s = rep(s, '  const bearer = readBearer(request);\n  if (bearer) {', '  const bearer = readBearer(request) || getCookie(COOKIE_NAME) || "";\n  if (bearer) {', 'assistant cookie auth');
  s = rep(s, 'export async function revokeAssistantToken(request: Request) {\n  const bearer = readBearer(request);\n  if (!bearer) return false;',
    'export async function revokeAssistantToken(request: Request) {\n  const bearer = readBearer(request) || getCookie(COOKIE_NAME) || "";\n  deleteCookie(COOKIE_NAME, { path: "/" });\n  if (!bearer) return false;', 'assistant cookie logout');
  return s;
});

edit('src/routes/api/assistant/auth.ts', (input) => {
  let s = input;
  s = rep(s, 'import { authenticateAssistantRequest, issueAssistantToken, revokeAssistantToken } from "@/lib/assistant-auth.server";',
    'import { authenticateAssistantRequest, issueAssistantToken, persistAssistantSession, revokeAssistantToken } from "@/lib/assistant-auth.server";', 'assistant import');
  s = rep(s, '        const deviceLabel = String(body?.deviceLabel || "Android").slice(0, 120);',
    '        const deviceLabel = String(body?.deviceLabel || "Android").slice(0, 120);\n        const remember = body?.remember === true;', 'assistant request');
  s = rep(s, '        const issued = await issueAssistantToken(verified.username, deviceLabel);\n        return Response.json({ ok: true, username: verified.username, ...issued }, { headers: { "Cache-Control": "no-store" } });',
    '        const issued = await issueAssistantToken(verified.username, deviceLabel);\n        persistAssistantSession(issued.token, remember);\n        return Response.json({ ok: true, username: verified.username, ...issued }, { headers: { "Cache-Control": "no-store" } });', 'assistant login persistence');
  return s;
});

function editAssistantPage(rel) {
  const file = path.join(target, rel);
  if (!fs.existsSync(file)) return;
  const before = fs.readFileSync(file, 'utf8');
  let s = before;
  s = rep(s, '  const [password, setPassword] = useState("");\n  const [developerMode, setDeveloperMode] = useState(false);',
    '  const [password, setPassword] = useState("");\n  const [remember, setRemember] = useState(true);\n  const [developerMode, setDeveloperMode] = useState(false);', rel + ' state');
  s = rep(s, '          password,\n          deviceLabel: "Salomão IA Web • PC",', '          password,\n          remember,\n          deviceLabel: "Salomão IA Web • PC",', rel + ' request');
  s = rep(s, '      setToken(String(data.token));', '      setToken(remember ? "" : String(data.token));', rel + ' token');
  s = rep(s, '        setPassword={setPassword}\n        onSubmit={login}', '        setPassword={setPassword}\n        remember={remember}\n        setRemember={setRemember}\n        onSubmit={login}', rel + ' props');
  s = rep(s, '  setPassword,\n  onSubmit,', '  setPassword,\n  remember,\n  setRemember,\n  onSubmit,', rel + ' signature');
  s = rep(s, '  setPassword: (value: string) => void;\n  onSubmit: (event: FormEvent) => void;',
    '  setPassword: (value: string) => void;\n  remember: boolean;\n  setRemember: (value: boolean) => void;\n  onSubmit: (event: FormEvent) => void;', rel + ' types');
  s = rep(s, '              autoCapitalize="none"\n              autoCorrect="off"', '              autoCapitalize="none"\n              autoCorrect="off"\n              autoComplete="username"', rel + ' autocomplete');
  s = rep(s, '          {error ? (',
    '          <label className="mt-4 flex items-center gap-3 text-sm text-[#aebac1]">\n            <input type="checkbox" checked={remember} onChange={(event) => setRemember(event.target.checked)} className="size-4 accent-[#00a884]" />\n            <span>Manter conectado neste dispositivo por 30 dias</span>\n          </label>\n\n          {error ? (', rel + ' checkbox');
  s = s.replaceAll('Salomão IA', 'Trans Salomão IA');
  s = s.replace('A sessão da Trans Salomão IA fica somente nesta aba do navegador.', 'Marque “Manter conectado” para não precisar entrar novamente neste dispositivo.');
  if (s === before) throw new Error('persistent-login made no changes in ' + rel);
  fs.writeFileSync(file, s);
  console.log('[persistent-login] ' + rel);
}

editAssistantPage('src/routes/salomao-ia.tsx');
editAssistantPage('src/routes/trans-salomao-ia.tsx');

console.log('[persistent-login] secure remembered sessions installed');
