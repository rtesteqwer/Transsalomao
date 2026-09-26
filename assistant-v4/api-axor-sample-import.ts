
import { createHash, createPublicKey, createVerify } from "node:crypto";
import { createFileRoute } from "@tanstack/react-router";
import { getSql } from "@/lib/db";

type Row = Record<string, any>;

export const Route = createFileRoute("/api/assistant/axor-sample-import")({
  server: { handlers: {
    POST: async ({ request }) => {
      const auth = await verifyGitHubOidc(request);
      if (!auth.ok) return Response.json({ ok:false, code:"OIDC_FORBIDDEN" }, { status:403 });

      let body:any={};
      try { body=await request.json(); } catch { return Response.json({ok:false,code:"INVALID_JSON"},{status:400}); }
      if (String(body?.sourceName || "") !== "AXOR TRABALHO.zip") {
        return Response.json({ok:false,code:"SOURCE_NOT_ALLOWED"},{status:400});
      }

      const sql=await getSql();
      await ensureTables(sql);
      const drivers=await sql.unsafe("select id,name,status,commission_pct from drivers where status='ativo' order by name");
      const fleets=await sql.unsafe("select id,name,tractor_plate,trailer_plate,model,status from fleets where status='ativo' order by name");
      const driverCandidates=drivers.filter((row:any)=>isLuis(row.name));
      const fleetCandidates=fleets.filter((row:any)=>norm(row.name).includes("axor")||norm(row.model).includes("axor"));

      if(driverCandidates.length!==1 || fleetCandidates.length!==1){
        return Response.json({
          ok:false,code:"IDENTITY_AMBIGUOUS",
          driverCandidates:driverCandidates.map((x:any)=>({id:x.id,name:x.name})),
          fleetCandidates:fleetCandidates.map((x:any)=>({id:x.id,name:x.name,tractorPlate:x.tractor_plate,trailerPlate:x.trailer_plate,model:x.model}))
        },{status:409});
      }

      const driver=driverCandidates[0],fleet=fleetCandidates[0];
      const txtId=await saveSource(sql,"AXOR TRABALHO/chat.txt","text/plain",String(body?.chatText??"").slice(0,200000));
      const mdId=await saveSource(sql,"AXOR TRABALHO/chat.md","text/markdown",String(body?.chatMd??"").slice(0,200000));

      const trips=[
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
        ["20260919-113843","2026-09-19","11:38:43","Imagem sem legenda",null]
      ];

      let created=0,existing=0;
      const tripRows:any[]=[];
      for(const item of trips){
        const key=String(item[0]),date=String(item[1]),time=String(item[2]),caption=String(item[3]),mode=item[4] as string|null;
        const reportId="rep_axor_sample_"+key.replace(/-/g,"");
        const ticket="AMOSTRA-AXOR-"+key;
        const ts=date+"T"+time+"-03:00";

        const inserted=await sql.unsafe(
          "insert into reports(id,ticket,driver_id,fleet_id,km,tons,daily_value,freight_mode,status,loading_date,created_at) values($1,$2,$3,$4,0,0,0,$5,'pendente',$6,$7::timestamptz) on conflict(id) do nothing returning id",
          [reportId,ticket,driver.id,fleet.id,mode,date,ts]
        );
        if(inserted[0])created++;else existing++;

        const ticketData={
          sample:true,source_name:"AXOR TRABALHO.zip",source_file_id:txtId,sender:"Luís António",
          chat_date:date,chat_time:time,caption,
          media_status:"imagem ocultada na exportação; arquivo original ausente no ZIP",
          alertas:["AMOSTRA importada da conversa AXOR TRABALHO.","Peso, preço, litros e demais dados visuais não foram inventados."],
          inferred_freight_mode:mode,inference_confidence:mode==="cegonha"?0.99:null
        };
        await sql.unsafe(
          "insert into tickets_balanca(numero_ticket,placa_veiculo,placa_carreta,produto,pesagem_inicial_kg,pesagem_final_kg,peso_liquido_kg,data_pesagem,numero_nf,transportadora,destinatario,motorista,km_carreta,driver_id,fleet_id,report_id,ticket_data,freight_mode,criado_em) values($1,$2,$3,null,null,null,null,$4,null,null,null,$5,0,$6,$7,$8,$9::jsonb,$10,$11::timestamptz) on conflict(numero_ticket) do update set driver_id=excluded.driver_id,fleet_id=excluded.fleet_id,motorista=excluded.motorista,placa_veiculo=coalesce(excluded.placa_veiculo,tickets_balanca.placa_veiculo),placa_carreta=coalesce(excluded.placa_carreta,tickets_balanca.placa_carreta),ticket_data=coalesce(tickets_balanca.ticket_data,'{}'::jsonb)||excluded.ticket_data,freight_mode=coalesce(excluded.freight_mode,tickets_balanca.freight_mode)",
          [ticket,fleet.tractor_plate||null,fleet.trailer_plate||null,date+" "+time,driver.name,driver.id,fleet.id,reportId,JSON.stringify(ticketData),mode,ts]
        );
        const fp=hash("trip|"+ticket);
        await sql.unsafe(
          "insert into operation_import_items(id,fingerprint,file_id,kind,status,entity_type,entity_id,result_json,created_at) values($1,$2,$3,'trip','review','report',$4,$5::jsonb,$6::timestamptz) on conflict(fingerprint) do nothing",
          ["imp_"+fp.slice(0,24),fp,txtId,reportId,JSON.stringify({sample:true,ticket,caption,driver:driver.name,fleet:fleet.name,mediaMissing:true,note:mode==="cegonha"?"Modalidade Cegonha comprovada pela legenda.":"Modalidade, peso e preço aguardam a foto original."}),ts]
        );
        tripRows.push({id:reportId,ticket,caption,mode});
      }

      const fuelId="fuel_axor_sample_20260915_175742";
      let fuelingInserted=false;
      try{
        const rows=await sql.unsafe(
          "insert into fuelings(id,date,driver_id,fleet_id,station,km,liters,price_per_liter,notes) values($1,'2026-09-15',$2,$3,'AMOSTRA — Diesel',0,0,0,$4) on conflict(id) do nothing returning id",
          [fuelId,driver.id,fleet.id,"AMOSTRA importada de AXOR TRABALHO.zip. A imagem Diesel foi omitida; litros, preço e odômetro aguardam a mídia original."]
        );
        fuelingInserted=!!rows[0];
      }catch{}
      const fuelFp=hash("fuel|2026-09-15|17:57:42|diesel");
      await sql.unsafe(
        "insert into operation_import_items(id,fingerprint,file_id,kind,status,entity_type,entity_id,result_json,created_at) values($1,$2,$3,'fueling','review',$4,$5,$6::jsonb,'2026-09-15T17:57:42-03:00'::timestamptz) on conflict(fingerprint) do nothing",
        ["imp_"+fuelFp.slice(0,24),fuelFp,txtId,fuelingInserted?"fueling":null,fuelingInserted?fuelId:null,JSON.stringify({sample:true,driver:driver.name,fleet:fleet.name,caption:"Diesel",mediaMissing:true,message:"Imagem ausente; aguardando litros, preço/L e odômetro."})]
      );

      const advances=[
        ["exp_axor_sample_20260916_163304","2026-09-16","16:33:04","Vale ar"],
        ["exp_axor_sample_20260926_184945","2026-09-26","18:49:45","Vale"]
      ];
      const advanceRows:any[]=[];
      for(const item of advances){
        const expId=String(item[0]),date=String(item[1]),time=String(item[2]),label=String(item[3]);
        let inserted=false;
        try{
          const rows=await sql.unsafe(
            "insert into expenses(id,date,fleet_id,asset_type,driver_id,category,description,amount,notes) values($1,$2,null,null,$3,'Adiantamento',$4,0,$5) on conflict(id) do nothing returning id",
            [expId,date,driver.id,"AMOSTRA — "+label,"AMOSTRA importada de AXOR TRABALHO.zip. Documento "+label+" omitido; valor aguardando o arquivo original."]
          );
          inserted=!!rows[0];
        }catch{}
        const fp=hash("advance|"+date+"|"+time+"|"+label);
        await sql.unsafe(
          "insert into operation_import_items(id,fingerprint,file_id,kind,status,entity_type,entity_id,result_json,created_at) values($1,$2,$3,'advance','review',$4,$5,$6::jsonb,$7::timestamptz) on conflict(fingerprint) do nothing",
          ["imp_"+fp.slice(0,24),fp,txtId,inserted?"expense":null,inserted?expId:null,JSON.stringify({sample:true,driver:driver.name,fleet:fleet.name,label,mediaMissing:true,message:"Documento do vale ausente; valor não foi inventado."}),date+"T"+time+"-03:00"]
        );
        advanceRows.push({id:expId,label,inserted});
      }

      const forwardedFp=hash("review|2026-09-17|09:55:38|forwarded-image");
      await sql.unsafe(
        "insert into operation_import_items(id,fingerprint,file_id,kind,status,result_json,created_at) values($1,$2,$3,'other','review',$4::jsonb,'2026-09-17T09:55:38-03:00'::timestamptz) on conflict(fingerprint) do nothing",
        ["imp_"+forwardedFp.slice(0,24),forwardedFp,txtId,JSON.stringify({sample:true,driver:driver.name,fleet:fleet.name,sender:"Pai",caption:"Imagem encaminhada",mediaMissing:true,message:"Imagem encaminhada em 17/09 não está no ZIP; classificação aguarda a mídia original."})]
      );

      return Response.json({
        ok:true,
        driver:{id:driver.id,name:driver.name,commissionPct:Number(driver.commission_pct||0)},
        fleet:{id:fleet.id,name:fleet.name,tractorPlate:fleet.tractor_plate,trailerPlate:fleet.trailer_plate,model:fleet.model},
        sourceFiles:[txtId,mdId],
        tripSamples:{created,existing,rows:tripRows},
        fuelingSample:{id:fuelId,inserted:fuelingInserted},
        advanceSamples:advanceRows,
        reviewNote:"O ZIP não continha bytes das imagens/PDFs; os valores visuais ausentes ficaram sem preenchimento e marcados para revisão."
      },{headers:{"Cache-Control":"no-store"}});
    }
  }}
});

const EXPECTED_AUD="transsalomao-axor-sample-import";
const EXPECTED_REPO="rtesteqwer/Transsalomao";
const EXPECTED_REF="refs/heads/main";
const EXPECTED_WORKFLOW="Import AXOR samples";
let jwksCache:{expires:number;keys:any[]}={expires:0,keys:[]};

async function verifyGitHubOidc(request:Request){
  try{
    const raw=String(request.headers.get("authorization")??"");
    if(!raw.toLowerCase().startsWith("bearer "))return{ok:false};
    const token=raw.slice(7).trim(),parts=token.split(".");
    if(parts.length!==3)return{ok:false};
    const header=JSON.parse(Buffer.from(parts[0],"base64url").toString("utf8"));
    const claims=JSON.parse(Buffer.from(parts[1],"base64url").toString("utf8"));
    if(header?.alg!=="RS256"||!header?.kid)return{ok:false};
    if(claims?.iss!=="https://token.actions.githubusercontent.com")return{ok:false};
    const aud=Array.isArray(claims?.aud)?claims.aud:[claims?.aud];
    if(!aud.includes(EXPECTED_AUD)||claims?.repository!==EXPECTED_REPO||claims?.ref!==EXPECTED_REF||claims?.workflow!==EXPECTED_WORKFLOW)return{ok:false};
    if(!["push","workflow_dispatch"].includes(String(claims?.event_name??"")))return{ok:false};
    const now=Math.floor(Date.now()/1000);
    if(Number(claims?.exp??0)<now-5||Number(claims?.nbf??0)>now+30)return{ok:false};
    const keys=await getGitHubJwks(),jwk=keys.find((x:any)=>x?.kid===header.kid);
    if(!jwk)return{ok:false};
    const verify=createVerify("RSA-SHA256");verify.update(parts[0]+"."+parts[1]);verify.end();
    return verify.verify(createPublicKey({key:jwk,format:"jwk"}),Buffer.from(parts[2],"base64url"))?{ok:true,claims}:{ok:false};
  }catch{return{ok:false};}
}

async function getGitHubJwks(){
  if(jwksCache.expires>Date.now()&&jwksCache.keys.length)return jwksCache.keys;
  const response=await fetch("https://token.actions.githubusercontent.com/.well-known/jwks",{cache:"no-store"});
  if(!response.ok)throw new Error("GitHub JWKS indisponível");
  const data:any=await response.json();
  jwksCache={expires:Date.now()+15*60*1000,keys:Array.isArray(data?.keys)?data.keys:[]};
  return jwksCache.keys;
}

async function ensureTables(sql:any){
  await sql.unsafe("create table if not exists operation_import_files(id text primary key,source_hash text unique not null,file_name text not null,mime_type text,content_base64 text,text_content text,created_at timestamptz not null default now())");
  await sql.unsafe("create table if not exists operation_import_items(id text primary key,fingerprint text unique not null,file_id text references operation_import_files(id),kind text not null,status text not null,entity_type text,entity_id text,result_json jsonb,created_at timestamptz not null default now())");
}

async function saveSource(sql:any,fileName:string,mime:string,text:string){
  const sourceHash=hash(fileName+"\0"+text);
  const found=await sql.unsafe("select id from operation_import_files where source_hash=$1 limit 1",[sourceHash]);
  if(found[0])return String(found[0].id);
  const id="src_"+sourceHash.slice(0,24);
  await sql.unsafe("insert into operation_import_files(id,source_hash,file_name,mime_type,text_content,created_at) values($1,$2,$3,$4,$5,now()) on conflict(source_hash) do nothing",[id,sourceHash,fileName,mime,text]);
  return id;
}

function hash(value:string){return createHash("sha256").update(value).digest("hex");}
function norm(value:unknown){return String(value??"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLocaleLowerCase("pt-BR").replace(/[^a-z0-9]+/g," ").trim();}
function isLuis(value:unknown){const n=norm(value);return (n.includes("luis")||n.includes("luiz"))&&(n.includes("antonio")||n==="luis"||n==="luiz");}
