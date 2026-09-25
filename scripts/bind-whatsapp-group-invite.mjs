import { execFileSync } from "node:child_process";

const inviteUrl = process.env.TARGET_WHATSAPP_INVITE_URL || "";
const driverName = process.env.TARGET_DRIVER_NAME || "";
const token = process.env.WHATSAPP_ACCESS_TOKEN || "";
const phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID || "";
const versionRaw = process.env.WHATSAPP_GRAPH_VERSION || "v23.0";
const version = versionRaw.startsWith("v") ? versionRaw : "v" + versionRaw;
const databaseUrl = process.env.DATABASE_URL || "";

function fail(message) {
  console.error("[bind-whatsapp-group] " + message);
  process.exit(1);
}
function sqlLit(value) {
  return "'" + String(value).replaceAll("'", "''") + "'";
}
if (!inviteUrl || !driverName) fail("Convite ou motorista não informado.");
if (!token || !phoneId) fail("Credenciais do WhatsApp Business não estão disponíveis na produção.");
if (!databaseUrl) fail("DATABASE_URL não disponível na produção.");

let inviteCode = "";
try {
  const u = new URL(inviteUrl);
  inviteCode = u.pathname.split("/").filter(Boolean).at(-1) || "";
} catch {
  fail("Link de convite inválido.");
}
if (!inviteCode) fail("Código do convite não encontrado.");

async function graph(path) {
  const response = await fetch(`https://graph.facebook.com/${version}/${path}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
    signal: AbortSignal.timeout(20_000),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const msg = body?.error?.message || JSON.stringify(body).slice(0, 500);
    throw new Error(`Meta Graph ${response.status}: ${msg}`);
  }
  return body;
}

let groups = [];
let next = `${encodeURIComponent(phoneId)}/groups?limit=100`;
for (let page = 0; page < 20 && next; page++) {
  const body = await graph(next);
  groups.push(...(Array.isArray(body?.data) ? body.data : []));
  const nextUrl = body?.paging?.next;
  if (!nextUrl) { next = ""; break; }
  const parsed = new URL(nextUrl);
  next = parsed.pathname.replace(/^\/v[^/]+\//, "") + parsed.search;
}

if (!groups.length) fail("O número empresarial não retornou grupos ativos pela Groups API.");

let matched = null;
for (const group of groups) {
  const id = String(group?.id || "");
  if (!id) continue;
  try {
    const info = await graph(`${encodeURIComponent(id)}/invite_link`);
    const link = String(info?.invite_link || info?.link || "");
    if (!link) continue;
    const code = new URL(link).pathname.split("/").filter(Boolean).at(-1) || "";
    if (code === inviteCode) {
      matched = { id, subject: String(group?.subject || info?.subject || "") };
      break;
    }
  } catch (error) {
    console.warn("[bind-whatsapp-group] não foi possível consultar convite de um grupo:", id, String(error?.message || error).slice(0, 240));
  }
}

if (!matched) {
  fail("O convite não corresponde a nenhum grupo ativo visível para o número empresarial da Trans Salomão.");
}

const driverSql = `
  select id
  from drivers
  where status='ativo'
    and lower(regexp_replace(trim(name), '\\s+', ' ', 'g')) =
        lower(regexp_replace(trim(${sqlLit(driverName)}), '\\s+', ' ', 'g'))
  order by id;
`;
const ids = execFileSync("psql", [databaseUrl, "-At", "-v", "ON_ERROR_STOP=1", "-c", driverSql], {
  encoding: "utf8",
  stdio: ["ignore", "pipe", "inherit"],
}).trim().split(/\r?\n/).filter(Boolean);

if (ids.length !== 1) {
  fail(ids.length ? "Há mais de um motorista ativo com esse nome." : "Motorista ativo não encontrado: " + driverName);
}

const driverId = ids[0];
const upsertSql = `
  insert into whatsapp_group_drivers(group_id,driver_id,source,updated_at)
  values(${sqlLit(matched.id)},${sqlLit(driverId)},'manual_invite_link',now())
  on conflict (group_id) do update
    set driver_id=excluded.driver_id,
        source=excluded.source,
        updated_at=now();

  select g.group_id || '|' || d.name || '|' || g.source
  from whatsapp_group_drivers g
  join drivers d on d.id=g.driver_id
  where g.group_id=${sqlLit(matched.id)};
`;
const result = execFileSync("psql", [databaseUrl, "-At", "-v", "ON_ERROR_STOP=1", "-c", upsertSql], {
  encoding: "utf8",
  stdio: ["ignore", "pipe", "inherit"],
}).trim();

console.log("[bind-whatsapp-group] vínculo concluído:", result);
console.log("[bind-whatsapp-group] assunto:", matched.subject || "(sem assunto retornado)");
