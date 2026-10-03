import { createFileRoute } from "@tanstack/react-router";
import { getSql } from "@/lib/db";
import { authenticateAssistantRequest } from "@/lib/assistant-auth.server";

export const Route = createFileRoute("/api/felipe-ia-bridge")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const auth = await authenticateAssistantRequest(request);
        if (!auth) return out({ ok: false, code: "LOGIN_REQUIRED" }, 401);
        if (request.headers.get("x-salomao-app") !== "1") return out({ ok: false, code: "APP_HEADER_REQUIRED" }, 403);

        let body: any = {};
        try {
          body = await request.json();
        } catch {
          return out({ ok: false, code: "INVALID_JSON" }, 400);
        }

        const action = String(body?.action || "").trim();
        const sql = await getSql();
        await ensureBridge(sql);
        await cleanup(sql);

        if (action === "worker_status") {
          const rows = await sql<any[]>`
            select id, username, model, version, last_seen,
                   (last_seen > now() - interval '20 seconds') as online
            from felipe_ia_worker_state
            where id='ubuntu-main'
            limit 1
          `;
          const worker = rows[0] || null;
          return out({
            ok: true,
            online: Boolean(worker?.online),
            worker: worker ? {
              username: worker.username,
              model: worker.model,
              version: worker.version,
              lastSeen: worker.last_seen,
            } : null,
          });
        }

        if (action === "enqueue") {
          const message = String(body?.message || "").trim().slice(0, 12000);
          if (!message) return out({ ok: false, code: "EMPTY_MESSAGE" }, 400);

          const history = normalizeHistory(body?.history);
          const messages = [...history, { role: "user", content: message }].slice(-40);
          const id = "fia_" + crypto.randomUUID().replace(/-/g, "").slice(0, 18);

          await sql`
            insert into felipe_ia_jobs(id, requested_by, messages, status, updated_at)
            values(${id}, ${auth.username}, ${JSON.stringify(messages)}::jsonb, 'queued', now())
          `;

          return out({ ok: true, id, status: "queued" }, 202);
        }

        if (action === "status") {
          const id = String(body?.id || "").trim();
          if (!id) return out({ ok: false, code: "ID_REQUIRED" }, 400);
          const worker = await isFelipeIdentity(sql, auth.username);
          const rows = await sql<any[]>`
            select id, requested_by, status, answer, error_text, created_at, claimed_at, completed_at, updated_at
            from felipe_ia_jobs
            where id=${id}
              and (lower(requested_by)=lower(${auth.username}) or ${worker})
            limit 1
          `;
          if (!rows[0]) return out({ ok: false, code: "NOT_FOUND" }, 404);
          const row = rows[0];
          return out({
            ok: true,
            id: row.id,
            status: row.status,
            answer: row.answer || "",
            error: row.error_text || "",
            createdAt: row.created_at,
            completedAt: row.completed_at,
          });
        }

        if (action === "cancel") {
          const id = String(body?.id || "").trim();
          if (!id) return out({ ok: false, code: "ID_REQUIRED" }, 400);
          const worker = await isFelipeIdentity(sql, auth.username);
          const rows = await sql<any[]>`
            update felipe_ia_jobs
            set status='cancelled', completed_at=now(), updated_at=now()
            where id=${id}
              and status in ('queued','processing')
              and (lower(requested_by)=lower(${auth.username}) or ${worker})
            returning id,status
          `;
          return out({ ok: true, change: rows[0] || null });
        }

        if (!await isFelipeIdentity(sql, auth.username)) {
          return out({ ok: false, code: "WORKER_FORBIDDEN" }, 403);
        }

        if (action === "worker_heartbeat") {
          await heartbeat(sql, auth.username, body);
          return out({ ok: true });
        }

        if (action === "worker_claim") {
          await heartbeat(sql, auth.username, body);
          await sql`
            update felipe_ia_jobs
            set status='queued', claimed_at=null, updated_at=now()
            where status='processing'
              and claimed_at < now() - interval '5 minutes'
          `;
          const rows = await sql<any[]>`
            with candidate as (
              select id
              from felipe_ia_jobs
              where status='queued'
              order by created_at
              limit 1
              for update skip locked
            )
            update felipe_ia_jobs j
            set status='processing', claimed_at=now(), updated_at=now()
            from candidate
            where j.id=candidate.id
            returning j.id,j.requested_by,j.messages,j.created_at
          `;
          const job = rows[0] || null;
          return out({ ok: true, job });
        }

        if (action === "worker_complete") {
          await heartbeat(sql, auth.username, body);
          const id = String(body?.id || "").trim();
          const answer = String(body?.answer || "").trim().slice(0, 30000);
          if (!id || !answer) return out({ ok: false, code: "RESULT_REQUIRED" }, 400);
          const rows = await sql<any[]>`
            update felipe_ia_jobs
            set status='done', answer=${answer}, error_text=null, completed_at=now(), updated_at=now()
            where id=${id} and status='processing'
            returning id,status
          `;
          if (!rows[0]) return out({ ok: false, code: "NOT_PROCESSING" }, 409);
          return out({ ok: true, change: rows[0] });
        }

        if (action === "worker_failed") {
          await heartbeat(sql, auth.username, body);
          const id = String(body?.id || "").trim();
          const errorText = String(body?.error || "Falha no Felipe IA local").trim().slice(0, 12000);
          if (!id) return out({ ok: false, code: "ID_REQUIRED" }, 400);
          const rows = await sql<any[]>`
            update felipe_ia_jobs
            set status='failed', error_text=${errorText}, completed_at=now(), updated_at=now()
            where id=${id} and status='processing'
            returning id,status
          `;
          if (!rows[0]) return out({ ok: false, code: "NOT_PROCESSING" }, 409);
          return out({ ok: true, change: rows[0] });
        }

        return out({ ok: false, code: "UNKNOWN_ACTION" }, 400);
      },
    },
  },
});

type Turn = { role: "user" | "assistant"; content: string };

function normalizeHistory(value: unknown): Turn[] {
  if (!Array.isArray(value)) return [];
  return value
    .slice(-39)
    .map((item: any) => ({
      role: item?.role === "assistant" ? "assistant" : "user",
      content: String(item?.content || "").slice(0, 8000),
    }))
    .filter((item: Turn) => item.content.trim());
}

function out(value: unknown, status = 200) {
  return Response.json(value, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

async function ensureBridge(sql: any) {
  await sql`
    create table if not exists felipe_ia_jobs(
      id text primary key,
      requested_by text not null,
      messages jsonb not null,
      status text not null default 'queued',
      answer text,
      error_text text,
      created_at timestamptz not null default now(),
      claimed_at timestamptz,
      completed_at timestamptz,
      updated_at timestamptz not null default now()
    )
  `;
  await sql`create index if not exists felipe_ia_jobs_status_idx on felipe_ia_jobs(status,created_at)`;
  await sql`
    create table if not exists felipe_ia_worker_state(
      id text primary key,
      username text not null,
      model text,
      version text,
      last_seen timestamptz not null default now(),
      updated_at timestamptz not null default now()
    )
  `;
}

async function cleanup(sql: any) {
  await sql`
    delete from felipe_ia_jobs
    where created_at < now() - interval '7 days'
      and status in ('done','failed','cancelled')
  `;
}

async function isFelipeIdentity(sql: any, username: string) {
  const rows = await sql<any[]>`
    select id,status
    from management_users
    where lower(username)=lower(${String(username || "").trim()})
    limit 1
  `;
  return rows[0]?.id === "adm_felipe" && rows[0]?.status === "ativo";
}

async function heartbeat(sql: any, username: string, body: any) {
  const model = String(body?.model || "felipe-ai").slice(0, 120);
  const version = String(body?.version || "1").slice(0, 80);
  await sql`
    insert into felipe_ia_worker_state(id,username,model,version,last_seen,updated_at)
    values('ubuntu-main',${username},${model},${version},now(),now())
    on conflict(id) do update set
      username=excluded.username,
      model=excluded.model,
      version=excluded.version,
      last_seen=now(),
      updated_at=now()
  `;
}
