import fs from 'node:fs';
import path from 'node:path';

const target = process.argv[2];
if (!target) throw new Error('management-password-fix: target missing');

const authFile = path.join(target, 'src/lib/management-auth.server.ts');
if (!fs.existsSync(authFile)) throw new Error('management-password-fix: auth file missing');
let auth = fs.readFileSync(authFile, 'utf8');

const legacyBefore = [
  '  if (verified.legacy) {',
  '    const upgraded = await hashPassword(password);',
  '    await sql`update management_users set password_hash = ${upgraded}, must_change_password = true, updated_at = now() where id = ${row.id}`;',
  '  }',
].join('\n');
const legacyAfter = [
  '  // Legacy passwords shorter than the new minimum must still be allowed once',
  '  // so the owner can reach the password-change flow instead of receiving HTTP 500.',
  '  if (verified.legacy && password.length >= 10) {',
  '    const upgraded = await hashPassword(password);',
  '    await sql`update management_users set password_hash = ${upgraded}, must_change_password = true, updated_at = now() where id = ${row.id}`;',
  '  }',
].join('\n');
if (!auth.includes(legacyBefore)) throw new Error('management-password-fix: legacy block missing');
auth = auth.replace(legacyBefore, legacyAfter);

const marker = 'export async function completeManagementPasswordChange(newPassword: string) {';
const helper = [
  'export async function changeManagementPasswordWithCurrent(username: string, currentPassword: string, newPassword: string) {',
  '  const verified = await verifyManagementCredentials(username, currentPassword);',
  '  if (!verified.ok) return { ok: false as const };',
  '  const sql = await getSql();',
  '  const hash = await hashPassword(newPassword);',
  '  const rows = await sql<{ username: string }>`update management_users',
  '    set password_hash=${hash}, must_change_password=false, updated_at=now()',
  "    where lower(username)=lower(${verified.username}) and status='ativo'",
  '    returning username`;',
  '  const changed = rows[0]?.username;',
  '  if (!changed) return { ok: false as const };',
  '  await clearLoginFailures("management", changed);',
  '  return { ok: true as const, username: changed };',
  '}',
  '',
].join('\n');
if (!auth.includes(marker)) throw new Error('management-password-fix: helper marker missing');
auth = auth.replace(marker, helper + marker);


fs.writeFileSync(authFile, auth);

const routeFile = path.join(target, 'src/routes/api/management/password.ts');
fs.mkdirSync(path.dirname(routeFile), { recursive: true });
const routeSource = [
  'import { createFileRoute } from "@tanstack/react-router";',
  'import { changeManagementPasswordWithCurrent } from "@/lib/management-auth.server";',
  '',
  'export const Route = createFileRoute("/api/management/password")({',
  '  server: {',
  '    handlers: {',
  '      POST: async ({ request }) => {',
  '        let body: any = {};',
  '        try { body = await request.json(); } catch {}',
  '        const username = String(body?.username || "").trim();',
  '        const currentPassword = String(body?.currentPassword || "");',
  '        const newPassword = String(body?.newPassword || "");',
  '        if (!username || !currentPassword || !newPassword) {',
  '          return Response.json({ ok: false, code: "MISSING_FIELDS" }, { status: 400, headers: { "Cache-Control": "no-store" } });',
  '        }',
  '        try {',
  '          const result = await changeManagementPasswordWithCurrent(username, currentPassword, newPassword);',
  '          if (!result.ok) return Response.json({ ok: false, code: "INVALID_CREDENTIALS" }, { status: 401, headers: { "Cache-Control": "no-store" } });',
  '          return Response.json({ ok: true, username: result.username }, { headers: { "Cache-Control": "no-store" } });',
  '        } catch (error) {',
  '          const message = error instanceof Error ? error.message : "Falha ao alterar senha.";',
  '          return Response.json({ ok: false, code: "PASSWORD_CHANGE_FAILED", message }, { status: 400, headers: { "Cache-Control": "no-store" } });',
  '        }',
  '      },',
  '    },',
  '  },',
  '});',
  '',
].join('\n');
fs.writeFileSync(routeFile, routeSource);

console.log('[management-password-fix] legacy migration guard + authenticated password change endpoint installed');
