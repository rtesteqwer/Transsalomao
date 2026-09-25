import pg from "pg";

const { Client } = pg;
const inviteUrl = "https://chat.whatsapp.com/EDDKxm4IZ7VFFVFhCP88rf?s=cl&p=a&mlu=4&ilr=4";
const driverName = "Murillo Rocha Garcia";
const sourceTag = "manual_invite_EDDKxm4IZ7VFFVFhCP88rf";

const token = process.env.WHATSAPP_ACCESS_TOKEN?.trim() || "";
const phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID?.trim() || "";
const databaseUrl = process.env.DATABASE_URL?.trim() || "";
const versionRaw = process.env.WHATSAPP_GRAPH_VERSION?.trim() || "v23.0";
const version = versionRaw.startsWith("v") ? versionRaw : "v" + versionRaw;
const productionUrl = String(process.env.VERCEL_PROJECT_PRODUCTION_URL || "").toLowerCase();

function log(message) {
  console.log("[bind-murillo-group] " + message);
}

if (process.env.VERCEL !== "1" || !productionUrl.includes("transsalomao.vercel.app")) {
  log("skipped outside Trans Salomao production build");
  process.exit(0);
}
if (!token || !phoneId || !databaseUrl) {
  log("skipped: WhatsApp/DB production credentials are not available in this build environment");
  process.exit(0);
}

const client = new Client({ connectionString: databaseUrl, ssl: { rejectUnauthorized: true } });

async function graph(path) {
  const response = await fetch(`https://graph.facebook.com/${version}/${path}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
    signal: AbortSignal.timeout(20_000),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(body?.error?.message || `Meta Graph HTTP ${response.status}`);
  }
  return body;
}

try {
  await client.connect();

  const existing = await client.query(
    `select g.group_id,d.name
       from whatsapp_group_drivers g
       join drivers d on d.id=g.driver_id
      where g.source=$1
      limit 1`,
    [sourceTag],
  );
  if (existing.rows[0]) {
    log(`already bound: ${existing.rows[0].group_id} -> ${existing.rows[0].name}`);
    process.exitCode = 0;
  } else {
    const driver = await client.query(
      `select id,name
         from drivers
        where status='ativo'
          and lower(regexp_replace(trim(name), '\\s+', ' ', 'g')) =
              lower(regexp_replace(trim($1), '\\s+', ' ', 'g'))
        order by id`,
      [driverName],
    );
    if (driver.rows.length !== 1) {
      log(driver.rows.length ? "not bound: duplicate active driver name" : "not bound: active driver not found");
      process.exitCode = 0;
    } else {
      const inviteCode = new URL(inviteUrl).pathname.split("/").filter(Boolean).at(-1);
      let next = `${encodeURIComponent(phoneId)}/groups?limit=100`;
      let matched = null;

      for (let page = 0; page < 20 && next && !matched; page++) {
        const list = await graph(next);
        for (const group of Array.isArray(list?.data) ? list.data : []) {
          const groupId = String(group?.id || "");
          if (!groupId) continue;
          try {
            const info = await graph(`${encodeURIComponent(groupId)}/invite_link`);
            const link = String(info?.invite_link || info?.link || "");
            if (!link) continue;
            const code = new URL(link).pathname.split("/").filter(Boolean).at(-1);
            if (code === inviteCode) {
              matched = { id: groupId, subject: String(group?.subject || info?.subject || "") };
              break;
            }
          } catch (error) {
            log(`invite lookup skipped for group ${groupId}: ${String(error?.message || error).slice(0,180)}`);
          }
        }
        if (matched) break;
        const nextUrl = list?.paging?.next;
        if (!nextUrl) break;
        const u = new URL(nextUrl);
        next = u.pathname.replace(/^\/v[^/]+\//, "") + u.search;
      }

      if (!matched) {
        log("not bound: invite is not visible among active groups for the Trans Salomao business number");
        process.exitCode = 0;
      } else {
        await client.query(
          `insert into whatsapp_group_drivers(group_id,driver_id,source,updated_at)
           values($1,$2,$3,now())
           on conflict (group_id) do update
             set driver_id=excluded.driver_id,
                 source=excluded.source,
                 updated_at=now()`,
          [matched.id, driver.rows[0].id, sourceTag],
        );
        log(`BOUND ${matched.id} -> ${driver.rows[0].name}; subject=${matched.subject || "(not returned)"}`);
        process.exitCode = 0;
      }
    }
  }
} catch (error) {
  log("not bound: " + String(error?.message || error).slice(0, 400));
  process.exitCode = 0;
} finally {
  await client.end().catch(() => {});
}
