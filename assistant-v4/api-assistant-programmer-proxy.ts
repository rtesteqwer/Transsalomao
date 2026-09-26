import { createVerify, createPublicKey } from "node:crypto";
import { createFileRoute } from "@tanstack/react-router";
import { getSql } from "@/lib/db";
import { getSalomaoOpenAIKeys, salomaoModel } from "@/lib/salomao-ai.server";

export const Route = createFileRoute("/api/assistant/programmer-proxy")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const auth = await verifyGitHubOidc(request);
        if (!auth.ok) return Response.json({ ok:false, code:"OIDC_FORBIDDEN" }, { status:403 });

        let body:any={};
        try { body=await request.json(); } catch {
          return Response.json({ ok:false, code:"INVALID_JSON" }, { status:400 });
        }

        const action=String(body?.action??"");
        if(action==="claim") return claimFelipeChange();
        if(action==="update") return updateChange(body);
        if(action==="openai") return relayOpenAI(body);

        return Response.json({ ok:false, code:"UNKNOWN_ACTION" }, { status:400 });
      }
    }
  }
});

const EXPECTED_AUD="transsalomao-salomao-programmer";
const EXPECTED_REPO="rtesteqwer/Transsalomao";
const EXPECTED_REF="refs/heads/main";
const EXPECTED_WORKFLOW="Salomao IA - Programador Autonomo";
let jwksCache:{expires:number;keys:any[]}={expires:0,keys:[]};

async function verifyGitHubOidc(request:Request){
  try{
    const raw=String(request.headers.get("authorization")??"");
    if(!raw.toLowerCase().startsWith("bearer "))return{ok:false};
    const token=raw.slice(7).trim();
    const parts=token.split(".");
    if(parts.length!==3)return{ok:false};

    const header=JSON.parse(Buffer.from(parts[0],"base64url").toString("utf8"));
    const claims=JSON.parse(Buffer.from(parts[1],"base64url").toString("utf8"));
    if(header?.alg!=="RS256"||!header?.kid)return{ok:false};
    if(claims?.iss!=="https://token.actions.githubusercontent.com")return{ok:false};
    const aud=Array.isArray(claims?.aud)?claims.aud:[claims?.aud];
    if(!aud.includes(EXPECTED_AUD))return{ok:false};
    if(claims?.repository!==EXPECTED_REPO||claims?.ref!==EXPECTED_REF)return{ok:false};
    if(claims?.workflow!==EXPECTED_WORKFLOW)return{ok:false};
    if(!["push","schedule","workflow_dispatch"].includes(String(claims?.event_name??"")))return{ok:false};
    const now=Math.floor(Date.now()/1000);
    if(Number(claims?.exp??0)<now-5||Number(claims?.nbf??0)>now+30)return{ok:false};

    const keys=await getGitHubJwks();
    const jwk=keys.find((x:any)=>x?.kid===header.kid);
    if(!jwk)return{ok:false};
    const verify=createVerify("RSA-SHA256");
    verify.update(parts[0]+"."+parts[1]);
    verify.end();
    const valid=verify.verify(createPublicKey({key:jwk,format:"jwk"}),Buffer.from(parts[2],"base64url"));
    return valid?{ok:true,claims}:{ok:false};
  }catch{
    return{ok:false};
  }
}

async function getGitHubJwks(){
  if(jwksCache.expires>Date.now()&&jwksCache.keys.length)return jwksCache.keys;
  const r=await fetch("https://token.actions.githubusercontent.com/.well-known/jwks",{cache:"no-store"});
  if(!r.ok)throw new Error("GitHub JWKS indisponível");
  const data:any=await r.json();
  const keys=Array.isArray(data?.keys)?data.keys:[];
  jwksCache={expires:Date.now()+15*60*1000,keys};
  return keys;
}

async function ensureQueue(){
  const sql=await getSql();
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
}

async function claimFelipeChange(){
  await ensureQueue();
  const sql=await getSql();
  const rows=await sql<any[]>`
    with candidate as (
      select c.id
      from salomao_code_changes c
      join management_users u on lower(u.username)=lower(c.requested_by)
      where c.status='queued'
        and u.id='adm_felipe'
        and u.status='ativo'
      order by c.created_at
      limit 1
      for update of c skip locked
    )
    update salomao_code_changes c
    set status='programming',started_at=coalesce(c.started_at,now()),updated_at=now()
    from candidate
    where c.id=candidate.id
    returning c.id,c.requested_by,c.title,c.request_text,c.scope,c.publish_requested,c.status,c.created_at
  `;
  return Response.json({ok:true,change:rows[0]??null},{headers:{"Cache-Control":"no-store"}});
}

async function updateChange(body:any){
  await ensureQueue();
  const sql=await getSql();
  const id=String(body?.id??"").trim();
  const status=String(body?.status??"").trim();
  if(!id||!["programmed","ready","published","failed","cancelled"].includes(status)){
    return Response.json({ok:false,code:"INVALID_UPDATE"},{status:400});
  }
  const branch=body?.branch==null?null:String(body.branch).slice(0,240);
  const commit=body?.commit_sha==null?null:String(body.commit_sha).slice(0,100);
  const pr=body?.pull_request_url==null?null:String(body.pull_request_url).slice(0,600);
  const summary=body?.result_summary==null?null:String(body.result_summary).slice(0,12000);
  const error=body?.error_text==null?null:String(body.error_text).slice(0,12000);
  const rows=await sql<any[]>`
    update salomao_code_changes c
    set status=${status},
        branch=coalesce(${branch},c.branch),
        commit_sha=coalesce(${commit},c.commit_sha),
        pull_request_url=coalesce(${pr},c.pull_request_url),
        result_summary=coalesce(${summary},c.result_summary),
        error_text=${error},
        completed_at=case when ${status} in ('ready','published','failed','cancelled') then now() else c.completed_at end,
        updated_at=now()
    where c.id=${id}
      and exists(
        select 1 from management_users u
        where lower(u.username)=lower(c.requested_by)
          and u.id='adm_felipe'
      )
    returning c.id,c.status,c.branch,c.commit_sha,c.pull_request_url
  `;
  if(!rows[0])return Response.json({ok:false,code:"NOT_FOUND"},{status:404});
  return Response.json({ok:true,change:rows[0]},{headers:{"Cache-Control":"no-store"}});
}

async function relayOpenAI(body:any){
  const payload=body?.payload;
  if(!payload||typeof payload!=="object")return Response.json({ok:false,code:"INVALID_PAYLOAD"},{status:400});
  const serialized=JSON.stringify(payload);
  if(serialized.length>1500000)return Response.json({ok:false,code:"PAYLOAD_TOO_LARGE"},{status:413});

  const safePayload={
    ...payload,
    model:salomaoModel(),
    reasoning:{effort:"high"},
    parallel_tool_calls:false,
    max_output_tokens:Math.min(6000,Math.max(1000,Number(payload?.max_output_tokens??5000))),
  };

  const keys=await getSalomaoOpenAIKeys();
  if(!keys.length)return Response.json({ok:false,code:"OPENAI_NOT_CONFIGURED"},{status:503});

  let lastStatus=500,lastBody:any={};
  for(const key of keys){
    const r=await fetch("https://api.openai.com/v1/responses",{
      method:"POST",
      headers:{Authorization:"Bearer "+key,"Content-Type":"application/json"},
      body:JSON.stringify(safePayload)
    });
    const data=await r.json().catch(()=>({}));
    if(r.ok)return Response.json({ok:true,response:data},{headers:{"Cache-Control":"no-store"}});
    lastStatus=r.status;lastBody=data;
  }
  return Response.json({ok:false,code:"OPENAI_ERROR",status:lastStatus,error:lastBody},{status:502});
}
