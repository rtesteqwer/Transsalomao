import { createHash, createVerify, createPublicKey } from "node:crypto";
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
        if(action==="axor_sample_import") return importAxorSamples(body);

        return Response.json({ ok:false, code:"UNKNOWN_ACTION" }, { status:400 });
      }
    }
  }
});

const EXPECTED_AUDS=["transsalomao-salomao-programmer","transsalomao-axor-sample-import"];
const EXPECTED_REPO="rtesteqwer/Transsalomao";
const EXPECTED_REF="refs/heads/main";
const EXPECTED_WORKFLOWS=["Salomao IA - Programador Autonomo","Import AXOR samples"];
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
    if(!EXPECTED_AUDS.some((item)=>aud.includes(item)))return{ok:false};
    if(claims?.repository!==EXPECTED_REPO||claims?.ref!==EXPECTED_REF)return{ok:false};
    if(!EXPECTED_WORKFLOWS.includes(String(claims?.workflow??"")))return{ok:false};
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


async function importAxorSamples(body:any){
  if(String(body?.sourceName??"")!=="AXOR TRABALHO.zip"){
    return Response.json({ok:false,code:"SOURCE_NOT_ALLOWED"},{status:400});
  }

  const sql=await getSql();
  await sql`
    create table if not exists operation_import_files(
      id text primary key,source_hash text unique not null,file_name text not null,mime_type text,
      content_base64 text,text_content text,created_at timestamptz not null default now()
    )
  `;
  await sql`
    create table if not exists operation_import_items(
      id text primary key,fingerprint text unique not null,file_id text references operation_import_files(id),
      kind text not null,status text not null,entity_type text,entity_id text,result_json jsonb,
      created_at timestamptz not null default now()
    )
  `;

  const [drivers,fleets]=await Promise.all([
    sql<any>`select id,name,status,commission_pct from drivers where status='ativo' order by name`,
    sql<any>`select id,name,tractor_plate,trailer_plate,model,status from fleets where status='ativo' order by name`,
  ]);
  const driverCandidates=drivers.filter((row:any)=>isLuisImport(row.name));
  const fleetCandidates=fleets.filter((row:any)=>normImport(row.name).includes("axor")||normImport(row.model).includes("axor"));
  if(driverCandidates.length!==1||fleetCandidates.length!==1){
    return Response.json({
      ok:false,code:"IDENTITY_AMBIGUOUS",
      driverCandidates:driverCandidates.map((x:any)=>({id:x.id,name:x.name})),
      fleetCandidates:fleetCandidates.map((x:any)=>({id:x.id,name:x.name,tractorPlate:x.tractor_plate,trailerPlate:x.trailer_plate,model:x.model}))
    },{status:409});
  }

  const driver=driverCandidates[0],fleet=fleetCandidates[0];
  const txtId=await saveAxorSource(sql,"AXOR TRABALHO/chat.txt","text/plain",String(body?.chatText??"").slice(0,200000));
  const mdId=await saveAxorSource(sql,"AXOR TRABALHO/chat.md","text/markdown",String(body?.chatMd??"").slice(0,200000));

  const priceRows=await sql<any>`select price from freight_prices where mode='caixinha' limit 1`;
  const caixinhaPrice=Number(priceRows[0]?.price??0);
  if(!Number.isFinite(caixinhaPrice)||caixinhaPrice<=0){
    return Response.json({ok:false,code:"CAIXINHA_PRICE_MISSING",message:"Preço de Caixinha não está configurado no site."},{status:409});
  }

  // Felipe confirmou que estes lançamentos do Luís são viagens reais:
  // 16 + 6 + 15 = 37 viagens, todas na modalidade Caixinha.
  const groups=[
    {key:"20260911-141416",date:"2026-09-11",batch:"A",count:16,caption:"16 viagem"},
    {key:"20260911-141742",date:"2026-09-11",batch:"B",count:6,caption:"6 viagem"},
    {key:"20260913-095118",date:"2026-09-13",batch:"C",count:15,caption:"15 viagem"},
  ];

  // Remove somente os registros sintéticos criados pela importação anterior
  // ("AMOSTRA"), sem tocar em qualquer viagem operacional cadastrada por outro fluxo.
  await sql`
    delete from tickets_balanca
    where report_id in (
      select id from reports
      where driver_id=${driver.id}
        and fleet_id=${fleet.id}
        and (id like 'rep_axor_sample_%' or id like 'rep_axor_cx_%' or id like 'rep_axor_real_cx_%')
    )
  `;
  await sql`
    delete from reports
    where driver_id=${driver.id}
      and fleet_id=${fleet.id}
      and (id like 'rep_axor_sample_%' or id like 'rep_axor_cx_%' or id like 'rep_axor_real_cx_%')
  `;
  await sql`
    delete from operation_import_items
    where file_id=${txtId}
      and kind='trip'
      and coalesce(result_json->>'source','')='AXOR TRABALHO.zip'
  `;

  let created=0;
  const rowsOut:any[]=[];
  for(const group of groups){
    for(let seq=1;seq<=group.count;seq++){
      const seqText=String(seq).padStart(2,"0");
      const reportId="rep_axor_real_cx_"+group.key+"_"+seqText;
      const internalCode="CAIXINHA-LUIS-"+group.date.replaceAll("-","")+"-"+group.batch+"-"+seqText;
      const inserted=await sql<any>`
        insert into reports(id,ticket,driver_id,fleet_id,km,tons,daily_value,freight_mode,status,loading_date)
        values(${reportId},${internalCode},${driver.id},${fleet.id},0,0,${caixinhaPrice},'caixinha','pendente',${group.date})
        on conflict(id) do update set
          ticket=excluded.ticket,
          driver_id=excluded.driver_id,
          fleet_id=excluded.fleet_id,
          km=0,
          tons=0,
          daily_value=excluded.daily_value,
          freight_mode='caixinha',
          status='pendente',
          loading_date=excluded.loading_date
        returning id
      `;
      if(inserted[0])created++;

      const fp=axorHash("real-caixinha|"+group.key+"|"+seqText);
      const evidence={
        sample:false,
        confirmed:true,
        confirmed_by:"Felipe",
        source:"AXOR TRABALHO.zip",
        driver:driver.name,
        fleet:fleet.name,
        mode:"caixinha",
        price:caixinhaPrice,
        price_basis:"Preço de Caixinha cadastrado no Trans Salomão",
        group_count:group.count,
        group_sequence:seq,
        source_caption:group.caption,
        source_date:group.date,
        note:"Viagem confirmada como verdadeira pelo Felipe. Caixinha não exige número de ticket."
      };
      await sql`
        insert into operation_import_items(id,fingerprint,file_id,kind,status,entity_type,entity_id,result_json)
        values(${"imp_"+fp.slice(0,24)},${fp},${txtId},'trip','saved','report',${reportId},${JSON.stringify(evidence)}::jsonb)
        on conflict(fingerprint) do update set
          status='saved',
          entity_type='report',
          entity_id=excluded.entity_id,
          result_json=excluded.result_json
      `;

      rowsOut.push({id:reportId,code:internalCode,date:group.date,mode:"caixinha",price:caixinhaPrice});
    }
  }

  return Response.json({
    ok:true,
    confirmedReal:true,
    driver:{id:driver.id,name:driver.name,commissionPct:Number(driver.commission_pct||0)},
    fleet:{id:fleet.id,name:fleet.name,tractorPlate:fleet.tractor_plate,trailerPlate:fleet.trailer_plate,model:fleet.model},
    sourceFiles:[txtId,mdId],
    caixinha:{count:37,price:caixinhaPrice,created,rows:rowsOut},
    note:"As 37 viagens do Luís foram gravadas como viagens reais de Caixinha, pendentes no Caixa, sem exigir ticket."
  },{headers:{"Cache-Control":"no-store"}});
}

async function saveAxorSource(sql:any,fileName:string,mime:string,text:string){
  const sourceHash=axorHash(fileName+"\0"+text);
  const existing=await sql<any>`select id from operation_import_files where source_hash=${sourceHash} limit 1`;
  if(existing[0])return String(existing[0].id);
  const id="src_"+sourceHash.slice(0,24);
  await sql`
    insert into operation_import_files(id,source_hash,file_name,mime_type,text_content)
    values(${id},${sourceHash},${fileName},${mime},${text})
    on conflict(source_hash) do nothing
  `;
  return id;
}
function axorHash(value:string){return createHash("sha256").update(value).digest("hex");}
function normImport(value:unknown){return String(value??"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLocaleLowerCase("pt-BR").replace(/[^a-z0-9]+/g," ").trim();}
function isLuisImport(value:unknown){const n=normImport(value);return (n.includes("luis")||n.includes("luiz"))&&(n.includes("antonio")||n==="luis"||n==="luiz");}

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
