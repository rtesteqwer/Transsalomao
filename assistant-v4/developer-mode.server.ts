import { getSql } from "@/lib/db";

type Row = Record<string, any>;

function norm(value: unknown) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("pt-BR")
    .replace(/\s+/g, " ")
    .trim();
}

export async function isFelipeDeveloperIdentity(actor: string) {
  const sql = await getSql();
  const rows = await sql<Row>`
    select id, username, status
    from management_users
    where lower(username) = lower(${String(actor ?? "").trim()})
    limit 1
  `;
  return rows[0]?.id === "adm_felipe" && rows[0]?.status === "ativo";
}

export async function ensureDeveloperTables() {
  const sql = await getSql();
  await sql`
    create table if not exists salomao_code_changes (
      id text primary key,
      requested_by text not null,
      title text not null,
      request_text text not null,
      scope text not null default 'full',
      publish_requested boolean not null default false,
      status text not null default 'queued',
      branch text,
      commit_sha text,
      pull_request_url text,
      result_summary text,
      error_text text,
      created_at timestamptz not null default now(),
      started_at timestamptz,
      completed_at timestamptz,
      updated_at timestamptz not null default now()
    )
  `;
  await sql`create index if not exists salomao_code_changes_status_idx on salomao_code_changes(status, created_at)`;
}

export async function developerSystemChange(args: Row, actor: string) {
  if (!(await isFelipeDeveloperIdentity(actor))) {
    throw new Error("DEVELOPER_FORBIDDEN");
  }

  await ensureDeveloperTables();
  const sql = await getSql();
  const action = String(args.action ?? "request");

  if (action === "request") {
    const title = String(args.title ?? "").trim().slice(0, 180);
    const requestText = String(args.request ?? "").trim().slice(0, 12000);
    const scope = ["web", "android", "backend", "database", "full"].includes(String(args.scope))
      ? String(args.scope)
      : "full";
    const publish = args.publish_to_production === true;

    if (!title || !requestText) {
      throw new Error("Informe o título e a alteração que deve ser programada.");
    }

    const id = "chg_" + crypto.randomUUID().replace(/-/g, "").slice(0, 12);
    await sql`
      insert into salomao_code_changes
        (id, requested_by, title, request_text, scope, publish_requested, status, updated_at)
      values
        (${id}, ${actor}, ${title}, ${requestText}, ${scope}, ${publish}, 'queued', now())
    `;

    return {
      ok: true,
      action: "queued",
      id,
      title,
      scope,
      publishRequested: publish,
      status: "queued",
      requestedBy: actor,
    };
  }

  if (action === "list") {
    const rows = await sql<Row>`
      select id,title,scope,publish_requested,status,branch,commit_sha,pull_request_url,result_summary,error_text,created_at,started_at,completed_at
      from salomao_code_changes
      where requested_by = ${actor}
      order by created_at desc
      limit 25
    `;
    return { ok: true, action: "list", rows };
  }

  const id = String(args.change_id ?? "").trim();
  if (!id) throw new Error("Informe o identificador da alteração.");

  if (action === "cancel") {
    const rows = await sql<Row>`
      update salomao_code_changes
      set status='cancelled', updated_at=now()
      where id=${id} and requested_by=${actor} and status='queued'
      returning id,title,status
    `;
    if (!rows[0]) throw new Error("Alteração não encontrada ou já está em processamento.");
    return { ok: true, action: "cancelled", ...rows[0] };
  }

  const rows = await sql<Row>`
    select id,title,scope,publish_requested,status,branch,commit_sha,pull_request_url,result_summary,error_text,created_at,started_at,completed_at
    from salomao_code_changes
    where id=${id} and requested_by=${actor}
    limit 1
  `;
  if (!rows[0]) throw new Error("Alteração não encontrada.");
  return { ok: true, action: "status", change: rows[0] };
}

export async function protectFelipeTarget(actor: string, targetUsername: string) {
  const sql = await getSql();
  const rows = await sql<Row>`
    select id, username
    from management_users
    where lower(username) = lower(${targetUsername})
    limit 1
  `;
  if ((rows[0]?.id === "adm_felipe" || norm(targetUsername) === "felipe") && !(await isFelipeDeveloperIdentity(actor))) {
    throw new Error("Somente Felipe pode alterar o próprio acesso privilegiado.");
  }
}
