import { createFileRoute } from "@tanstack/react-router";
import { getSql } from "@/lib/db";
import { authenticateAssistantRequest } from "@/lib/assistant-auth.server";

export const Route = createFileRoute("/api/assistant/developer")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const auth = await authenticateAssistantRequest(request);
        if (!auth) return Response.json({ ok:false, code:"LOGIN_REQUIRED" }, { status:401 });
        const sql = await getSql();
        const user = await sql<{id:string;status:string}[]> `
          select id,status from management_users
          where lower(username)=lower(${auth.username})
          limit 1
        `;
        if (user[0]?.id !== "adm_felipe" || user[0]?.status !== "ativo") {
          return Response.json({ ok:false, code:"DEVELOPER_FORBIDDEN" }, { status:403 });
        }
        await ensureQueue(sql);
        const rows = await sql`
          select id,title,scope,publish_requested,status,branch,commit_sha,pull_request_url,result_summary,error_text,created_at,started_at,completed_at
          from salomao_code_changes
          where requested_by=${auth.username}
          order by created_at desc limit 25
        `;
        return Response.json({ ok:true, authorized:true, rows }, { headers:{ "Cache-Control":"no-store" } });
      },

      POST: async ({ request }) => {
        const auth = await authenticateAssistantRequest(request);
        if (!auth) return Response.json({ ok:false, code:"LOGIN_REQUIRED" }, { status:401 });
        if (request.headers.get("x-salomao-app") !== "1") {
          return Response.json({ ok:false, code:"APP_HEADER_REQUIRED" }, { status:403 });
        }

        const sql = await getSql();
        const user = await sql<{id:string;status:string}[]> `
          select id,status from management_users
          where lower(username)=lower(${auth.username})
          limit 1
        `;
        if (user[0]?.id !== "adm_felipe" || user[0]?.status !== "ativo") {
          return Response.json({
            ok:false,
            code:"DEVELOPER_FORBIDDEN",
            answer:"Somente Felipe pode autorizar a Trans Salomão IA a programar ou publicar alterações do sistema."
          }, { status:403 });
        }

        let body:any={};
        try { body=await request.json(); } catch {
          return Response.json({ ok:false, code:"INVALID_JSON" }, { status:400 });
        }
        await ensureQueue(sql);

        const action=String(body?.action??"request");
        if(action==="list"){
          const rows=await sql`
            select id,title,scope,publish_requested,status,branch,commit_sha,pull_request_url,result_summary,error_text,created_at,started_at,completed_at
            from salomao_code_changes
            where requested_by=${auth.username}
            order by created_at desc limit 25
          `;
          return Response.json({ok:true,rows},{headers:{"Cache-Control":"no-store"}});
        }

        if(action==="status"){
          const id=String(body?.id??"").trim();
          const rows=id?await sql`
            select id,title,scope,publish_requested,status,branch,commit_sha,pull_request_url,result_summary,error_text,created_at,started_at,completed_at
            from salomao_code_changes
            where id=${id} and requested_by=${auth.username}
            limit 1
          `:[];
          if(!rows[0])return Response.json({ok:false,code:"NOT_FOUND"},{status:404});
          return Response.json({ok:true,change:rows[0]},{headers:{"Cache-Control":"no-store"}});
        }

        if(action==="cancel"){
          const id=String(body?.id??"").trim();
          const rows=await sql`
            update salomao_code_changes
            set status='cancelled',completed_at=now(),updated_at=now()
            where id=${id} and requested_by=${auth.username} and status='queued'
            returning id,title,status
          `;
          if(!rows[0])return Response.json({ok:false,code:"NOT_CANCELLABLE"},{status:409});
          return Response.json({ok:true,change:rows[0]});
        }

        const requestText=String(body?.request??"").trim().slice(0,12000);
        if(!requestText)return Response.json({ok:false,code:"EMPTY_REQUEST"},{status:400});
        const title=String(body?.title??requestText.split(/\n/)[0]??"Alteração Trans Salomão IA").trim().slice(0,180);
        const scope=["web","android","backend","database","full"].includes(String(body?.scope))?String(body.scope):"full";
        const publish=body?.publish===true || /\b(publique|publicar|produção|producao|aplique|aplicar no site|coloque em produção|coloque em producao)\b/i.test(requestText);
        const id="chg_"+crypto.randomUUID().replace(/-/g,"").slice(0,12);

        await sql`
          insert into salomao_code_changes
            (id,requested_by,title,request_text,scope,publish_requested,status,updated_at)
          values
            (${id},${auth.username},${title},${requestText},${scope},${publish},'queued',now())
        `;

        return Response.json({
          ok:true,
          id,
          status:"queued",
          publishRequested:publish,
          answer: publish
            ? "Pedido de programação autorizado por Felipe e enviado ao executor. Após os testes, o pipeline tentará publicar automaticamente."
            : "Pedido de programação autorizado por Felipe e enviado ao executor. Ele criará uma alteração testada em branch/PR sem publicar automaticamente."
        }, { status:202, headers:{ "Cache-Control":"no-store" } });
      }
    }
  }
});

async function ensureQueue(sql:any){
  await sql`
    create table if not exists salomao_code_changes(
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
  await sql`create index if not exists salomao_code_changes_status_idx on salomao_code_changes(status,created_at)`;
}
