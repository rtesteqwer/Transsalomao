import { createHash, randomBytes } from "node:crypto";
import { getSql } from "@/lib/db";

const TOKEN_DAYS = 90;

function sha256(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

export async function issueAssistantToken(username: string, deviceLabel = "Android") {
  const sql = await getSql();
  const token = randomBytes(32).toString("base64url");
  const hash = sha256(token);
  await sql`
    insert into assistant_sessions (token_hash, username, device_label, expires_at, last_used_at)
    values (${hash}, ${username}, ${deviceLabel.slice(0, 120)}, now() + interval '90 days', now())
  `;
  await sql`
    delete from assistant_sessions
    where expires_at <= now() or revoked_at is not null
  `;
  return { token, expiresInDays: TOKEN_DAYS };
}

export function readBearer(request: Request) {
  const raw = request.headers.get("authorization") || "";
  const match = raw.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || "";
}

export async function authenticateAssistantRequest(request: Request) {
  const bearer = readBearer(request);
  if (bearer) {
    const sql = await getSql();
    const hash = sha256(bearer);
    const rows = await sql<{ username: string }>`
      select username
      from assistant_sessions
      where token_hash = ${hash}
        and revoked_at is null
        and expires_at > now()
      limit 1
    `;
    if (rows[0]?.username) {
      await sql`update assistant_sessions set last_used_at = now() where token_hash = ${hash}`;
      return { username: rows[0].username, via: "device" as const };
    }
  }

  try {
    const { assertManagementSession } = await import("@/lib/management-auth.server");
    const session = assertManagementSession();
    return { username: session.username, via: "cookie" as const };
  } catch {
    return null;
  }
}

export async function revokeAssistantToken(request: Request) {
  const bearer = readBearer(request);
  if (!bearer) return false;
  const sql = await getSql();
  await sql`update assistant_sessions set revoked_at = now() where token_hash = ${sha256(bearer)}`;
  return true;
}
