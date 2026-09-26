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

  const events=[
    ["20260911-141243","2026-09-11","14:12:43","Imagem sem legenda",null],
    ["20260911-141416","2026-09-11","14:14:16","16 viagem",null],
    ["20260911-141642","2026-09-11","14:16:42","Imagem sem legenda",null],
    ["20260911-141742","2026-09-11","14:17:42","6 viagem",null],
    ["20260913-094934","2026-09-13","09:49:34","Imagem sem legenda",null],
    ["20260913-095118","2026-09-13","09:51:18","15 viagem",null],
    ["20260913-170023","2026-09-13","17:00:23","Imagem sem legenda",null],
    ["20260914-053630","2026-09-14","05:36:30","Imagem sem legenda",null],
    ["20260917-064739","2026-09-17","06:47:39","Imagem sem legenda",null],
    ["20260919-052320","2026-09-19","05:23:20","7 viagem cegonha","cegonha"],
    ["20260919-113620","2026-09-19","11:36:20","Imagem sem legenda",null],
    ["20260919-113843","2026-09-19","11:38:43","Imagem sem legenda",null],
  ];

  let created=0,existing=0;
  const rowsOut:any[]=[];
  for(const raw of events){
    const key=String(raw[0]),date=String(raw[1]),time=String(raw[2]),caption=String(raw[3]),mode=raw[4] as string|null;
    const reportId="rep_axor_sample_"+key.replace(/-/g,"");
    const ticket="AMOSTRA-AXOR-"+key;
    const inserted=await sql<any>`
      insert into reports(id,ticket,driver_id,fleet_id,km,tons,daily_value,freight_mode,status)
      values(${reportId},${ticket},${driver.id},${fleet.id},0,0,0,${mode},'pendente')
      on conflict(id) do nothing returning id
    `;
    if(inserted[0])created++;else existing++;

    const ticketData={
      sample:true,source_name:"AXOR TRABALHO.zip",source_file_id:txtId,sender:"Luís António",
      chat_date:date,chat_time:time,caption,
      media_status:"imagem ocultada na exportação; arquivo original ausente no ZIP",
      alertas:["AMOSTRA importada da conversa AXOR TRABALHO.","Peso, preço e demais dados visuais não foram inventados."],
      inferred_freight_mode:mode,inference_confidence:mode==="cegonha"?0.99:null
    };
    await sql`
      insert into tickets_balanca(
        numero_ticket,placa_veiculo,placa_carreta,produto,pesagem_inicial_kg,pesagem_final_kg,peso_liquido_kg,
        data_pesagem,numero_nf,transportadora,destinatario,motorista,km_carreta,driver_id,fleet_id,report_id,ticket_data,freight_mode
      )
      values(
        ${ticket},${fleet.tractor_plate||null},${fleet.trailer_plate||null},null,null,null,null,
        ${date+" "+time},null,null,null,${driver.name},0,${driver.id},${fleet.id},${reportId},${JSON.stringify(ticketData)}::jsonb,${mode}
      )
      on conflict(numero_ticket) do update set
        driver_id=excluded.driver_id,fleet_id=excluded.fleet_id,motorista=excluded.motorista,
        placa_veiculo=coalesce(excluded.placa_veiculo,tickets_balanca.placa_veiculo),
        placa_carreta=coalesce(excluded.placa_carreta,tickets_balanca.placa_carreta),
        ticket_data=coalesce(tickets_balanca.ticket_data,'{}'::jsonb)||excluded.ticket_data,
        freight_mode=coalesce(excluded.freight_mode,tickets_balanca.freight_mode)
    `;
    const fp=axorHash("trip|"+ticket);
    await sql`
      insert into operation_import_items(id,fingerprint,file_id,kind,status,entity_type,entity_id,result_json)
      values(${"imp_"+fp.slice(0,24)},${fp},${txtId},'trip','review','report',${reportId},${JSON.stringify({
        sample:true,ticket,caption,driver:driver.name,fleet:fleet.name,mediaMissing:true,
        note:mode==="cegonha"?"Modalidade Cegonha comprovada pela legenda.":"Modalidade, peso e preço aguardam a foto original."
      })}::jsonb)
      on conflict(fingerprint) do nothing
    `;
    rowsOut.push({id:reportId,ticket,caption,mode});
  }

  const fuelId="fuel_axor_sample_20260915_175742";
  let fuelingInserted=false;
  try{
    const result=await sql<any>`
      insert into fuelings(id,date,driver_id,fleet_id,station,km,liters,price_per_liter,notes)
      values(${fuelId},'2026-09-15',${driver.id},${fleet.id},'AMOSTRA — Diesel',0,0,0,
        'AMOSTRA importada de AXOR TRABALHO.zip. Imagem Diesel omitida; litros, preço e odômetro aguardam a mídia original.')
      on conflict(id) do nothing returning id
    `;
    fuelingInserted=!!result[0];
  }catch{}
  const fuelFp=axorHash("fuel|2026-09-15|17:57:42|diesel");
  await sql`
    insert into operation_import_items(id,fingerprint,file_id,kind,status,entity_type,entity_id,result_json)
    values(${"imp_"+fuelFp.slice(0,24)},${fuelFp},${txtId},'fueling','review',${fuelingInserted?"fueling":null},${fuelingInserted?fuelId:null},
      ${JSON.stringify({sample:true,driver:driver.name,fleet:fleet.name,caption:"Diesel",mediaMissing:true,message:"Imagem ausente; aguardando litros, preço/L e odômetro."})}::jsonb)
    on conflict(fingerprint) do nothing
  `;

  const advances=[
    ["exp_axor_sample_20260916_163304","2026-09-16","Vale ar"],
    ["exp_axor_sample_20260926_184945","2026-09-26","Vale"],
  ];
  const advanceRows:any[]=[];
  for(const raw of advances){
    const expId=String(raw[0]),date=String(raw[1]),label=String(raw[2]);
    let inserted=false;
    try{
      const result=await sql<any>`
        insert into expenses(id,date,fleet_id,asset_type,driver_id,category,description,amount,notes)
        values(${expId},${date},null,null,${driver.id},'Adiantamento',${"AMOSTRA — "+label},0,
          ${"AMOSTRA importada de AXOR TRABALHO.zip. Documento "+label+" omitido; valor aguardando o arquivo original."})
        on conflict(id) do nothing returning id
      `;
      inserted=!!result[0];
    }catch{}
    const fp=axorHash("advance|"+date+"|"+label);
    await sql`
      insert into operation_import_items(id,fingerprint,file_id,kind,status,entity_type,entity_id,result_json)
      values(${"imp_"+fp.slice(0,24)},${fp},${txtId},'advance','review',${inserted?"expense":null},${inserted?expId:null},
        ${JSON.stringify({sample:true,driver:driver.name,fleet:fleet.name,label,mediaMissing:true,message:"Documento do vale ausente; valor não foi inventado."})}::jsonb)
      on conflict(fingerprint) do nothing
    `;
    advanceRows.push({id:expId,label,inserted});
  }

  const forwardedFp=axorHash("review|2026-09-17|09:55:38|forwarded-image");
  await sql`
    insert into operation_import_items(id,fingerprint,file_id,kind,status,result_json)
    values(${"imp_"+forwardedFp.slice(0,24)},${forwardedFp},${txtId},'other','review',
      ${JSON.stringify({sample:true,driver:driver.name,fleet:fleet.name,sender:"Pai",caption:"Imagem encaminhada",mediaMissing:true,message:"Imagem de 17/09 não está no ZIP; classificação aguarda a mídia original."})}::jsonb)
    on conflict(fingerprint) do nothing
  `;

  return Response.json({
    ok:true,
    driver:{id:driver.id,name:driver.name,commissionPct:Number(driver.commission_pct||0)},
    fleet:{id:fleet.id,name:fleet.name,tractorPlate:fleet.tractor_plate,trailerPlate:fleet.trailer_plate,model:fleet.model},
    sourceFiles:[txtId,mdId],
    tripSamples:{created,existing,rows:rowsOut},
    fuelingSample:{id:fuelId,inserted:fuelingInserted},
    advanceSamples:advanceRows,
    reviewNote:"O ZIP não continha bytes das imagens/PDFs; valores visuais ausentes ficaram sem preenchimento e marcados para revisão."
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
