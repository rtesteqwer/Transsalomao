import { createHash, randomUUID } from "node:crypto";
import { createFileRoute } from "@tanstack/react-router";
import { getSql } from "@/lib/db";
import { managementSession } from "@/lib/management-auth.server";
import { analyzeOperationalImport, type ImportOperation } from "@/lib/operation-import-ai.server";
import { saveTicket, validateSave } from "@/lib/ticket-core";

type Row = Record<string, any>;

export const Route = createFileRoute("/api/operation-import")({
  server: { handlers: {
    POST: async ({ request }) => {
      if (!managementSession()) return json({ ok:false, message:"Entre na Gerência novamente." }, 401);
      let body:any={};
      try { body=await request.json(); } catch { return json({ok:false,message:"Arquivo inválido."},400); }

      const fileName=String(body?.fileName??"arquivo").slice(0,180);
      const mime=String(body?.mime??"application/octet-stream").slice(0,120);
      const text=typeof body?.text==="string" ? body.text.slice(0,180000) : "";
      const base64=typeof body?.base64==="string" ? body.base64 : "";
      if (!text && !base64) return json({ok:false,message:"Arquivo vazio."},400);
      if (base64.length>16000000) return json({ok:false,message:"Arquivo grande demais. Divida o material em arquivos menores."},413);

      const sql=await getSql();
      await ensureTables(sql);
      const drivers=await sql.unsafe("select id,name,status from drivers where status='ativo' order by name");
      const fleets=await sql.unsafe("select id,name,tractor_plate,trailer_plate,status from fleets where status='ativo' order by name");
      const selectedDriver=drivers.find((x:any)=>String(x.id)===String(body?.driverId??""))??null;
      const selectedFleet=fleets.find((x:any)=>String(x.id)===String(body?.fleetId??""))??null;

      let analysis;
      try {
        analysis=await analyzeOperationalImport({
          fileName,mime,text,base64,
          selectedDriverName:selectedDriver?.name??null,
          selectedFleetName:selectedFleet?.name??null,
          tractorPlate:selectedFleet?.tractor_plate??null,
          trailerPlate:selectedFleet?.trailer_plate??null,
        });
      } catch (error:any) {
        return json({ok:false,message:String(error?.message??error??"Não consegui interpretar o arquivo.")},503);
      }

      const sourceHash=createHash("sha256").update(fileName).update("\0").update(mime).update("\0").update(text||base64).digest("hex");
      const fileId=await saveSourceFile(sql,{fileName,mime,text,base64,sourceHash});
      const saved:any[]=[];
      const review:any[]=[];
      const duplicates:any[]=[];

      for (const operation of analysis.operations.slice(0,100)) {
        const identity=await resolveIdentity(sql,drivers,fleets,operation,selectedDriver,selectedFleet);
        const fingerprint=fingerprintFor(sourceHash,operation,identity.driver?.id,identity.fleet?.id);
        const previous=await sql.unsafe("select id,status,entity_type,entity_id from operation_import_items where fingerprint=$1 limit 1",[fingerprint]);
        if(previous[0]) {
          duplicates.push({kind:operation.kind,status:"duplicate",id:previous[0].id});
          continue;
        }

        try {
          const result=await applyOperation(sql,operation,identity,fileName,sourceHash);
          const itemId=id("imp");
          await sql.unsafe(
            "insert into operation_import_items(id,fingerprint,file_id,kind,status,entity_type,entity_id,result_json,created_at) values($1,$2,$3,$4,$5,$6,$7,$8::jsonb,now())",
            [itemId,fingerprint,fileId,operation.kind,result.saved?"saved":"review",result.entityType??null,result.entityId??null,JSON.stringify(result)],
          );
          (result.saved?saved:review).push(result);
        } catch (error:any) {
          const result={saved:false,kind:operation.kind,message:String(error?.message??error??"Não foi possível lançar."),operation};
          review.push(result);
          await sql.unsafe(
            "insert into operation_import_items(id,fingerprint,file_id,kind,status,result_json,created_at) values($1,$2,$3,$4,'review',$5::jsonb,now()) on conflict(fingerprint) do nothing",
            [id("imp"),fingerprint,fileId,operation.kind,JSON.stringify(result)],
          );
        }
      }

      return json({
        ok:true,fileId,fileName,summary:analysis.summary,warnings:analysis.warnings,extracted:analysis.operations.length,
        saved,review,duplicates,counts:{saved:saved.length,review:review.length,duplicates:duplicates.length},
      });
    },
  } },
});

async function ensureTables(sql:any) {
  await sql.unsafe("create table if not exists operation_import_files (id text primary key, source_hash text unique not null, file_name text not null, mime_type text, content_base64 text, text_content text, created_at timestamptz not null default now())");
  await sql.unsafe("create table if not exists operation_import_items (id text primary key, fingerprint text unique not null, file_id text references operation_import_files(id), kind text not null, status text not null, entity_type text, entity_id text, result_json jsonb, created_at timestamptz not null default now())");
  await sql.unsafe("create table if not exists fleet_odometer_history (id text primary key, fleet_id text not null, driver_id text, odometer_km integer not null, observed_date date not null, source_name text, source_hash text, notes text, created_at timestamptz not null default now())");
  await sql.unsafe("create index if not exists fleet_odometer_history_fleet_date_idx on fleet_odometer_history(fleet_id,observed_date desc,created_at desc)");
  await sql.unsafe("create table if not exists fleet_maintenance_history (id text primary key, fleet_id text not null, driver_id text, observed_date date not null, description text not null, amount numeric, odometer_km integer, source_name text, source_hash text, raw_data jsonb, created_at timestamptz not null default now())");
  await sql.unsafe("create index if not exists fleet_maintenance_history_fleet_date_idx on fleet_maintenance_history(fleet_id,observed_date desc,created_at desc)");
}

async function saveSourceFile(sql:any,input:{fileName:string;mime:string;text:string;base64:string;sourceHash:string}) {
  const found=await sql.unsafe("select id from operation_import_files where source_hash=$1 limit 1",[input.sourceHash]);
  if(found[0]) return String(found[0].id);
  const fileId=id("src");
  await sql.unsafe(
    "insert into operation_import_files(id,source_hash,file_name,mime_type,content_base64,text_content,created_at) values($1,$2,$3,$4,$5,$6,now())",
    [fileId,input.sourceHash,input.fileName,input.mime,input.base64||null,input.text||null],
  );
  return fileId;
}

async function resolveIdentity(sql:any,drivers:Row[],fleets:Row[],op:ImportOperation,selectedDriver:Row|null,selectedFleet:Row|null) {
  let driver=selectedDriver;
  let fleet=selectedFleet;

  if(!driver&&op.driver_name) {
    const q=norm(op.driver_name);
    const matches=drivers.filter((x:any)=>norm(x.name)===q || (q.length>=4&&(norm(x.name).includes(q)||q.includes(norm(x.name)))));
    if(matches.length===1) driver=matches[0];
  }

  if(!fleet) {
    const plates=[plate(op.tractor_plate),plate(op.trailer_plate)].filter(Boolean);
    if(plates.length) {
      const matches=fleets.filter((x:any)=>plates.includes(plate(x.tractor_plate))||plates.includes(plate(x.trailer_plate)));
      if(matches.length===1) fleet=matches[0];
    }
  }

  if(driver&&!fleet) {
    const rows=await sql.unsafe(
      "select fleet_id,count(*)::int uses from (select fleet_id from trips where driver_id=$1 union all select fleet_id from reports where driver_id=$1 union all select fleet_id from fuelings where driver_id=$1) x where fleet_id is not null group by fleet_id order by uses desc limit 2",
      [driver.id],
    );
    if(rows[0]&&(!rows[1]||Number(rows[0].uses)>Number(rows[1].uses))) {
      fleet=fleets.find((x:any)=>String(x.id)===String(rows[0].fleet_id))??null;
    }
  }

  if(fleet&&!driver) {
    const rows=await sql.unsafe(
      "select driver_id,count(*)::int uses from (select driver_id from trips where fleet_id=$1 union all select driver_id from reports where fleet_id=$1 union all select driver_id from fuelings where fleet_id=$1) x where driver_id is not null group by driver_id order by uses desc limit 2",
      [fleet.id],
    );
    if(rows[0]&&(!rows[1]||Number(rows[0].uses)>Number(rows[1].uses))) {
      driver=drivers.find((x:any)=>String(x.id)===String(rows[0].driver_id))??null;
    }
  }
  return {driver,fleet};
}

async function applyOperation(sql:any,op:ImportOperation,identity:{driver:Row|null;fleet:Row|null},sourceName:string,sourceHash:string) {
  const confidence=Number(op.confidence||0);
  const date=validDate(op.date)||todayBR();
  const driver=identity.driver;
  const fleet=identity.fleet;

  if(op.kind==="advance") {
    const amount=positive(op.amount);
    if(confidence<0.88||!driver||!amount) return review(op,"Adiantamento precisa de motorista, valor e evidência clara.");
    const entityId=id("exp");
    await sql.unsafe(
      "insert into expenses(id,date,fleet_id,asset_type,driver_id,category,description,amount,notes) values($1,$2,null,null,$3,'Adiantamento',$4,$5,$6)",
      [entityId,date,driver.id,op.description||"Adiantamento via PIX",amount,"Importado por Salomão IA · "+sourceName],
    );
    return {saved:true,kind:"advance",entityType:"expense",entityId,driver:driver.name,date,amount,message:"Adiantamento lançado para "+driver.name+"."};
  }

  if(op.kind==="fueling") {
    const liters=positive(op.liters);
    const price=positive(op.price_per_liter);
    if(confidence<0.88||!fleet||!liters||!price) return review(op,"Abastecimento precisa de conjunto, litros e preço por litro.");
    const entityId=id("fuel");
    const km=integer(op.odometer_km)||0;
    await sql.unsafe(
      "insert into fuelings(id,date,driver_id,fleet_id,station,km,liters,price_per_liter,notes) values($1,$2,$3,$4,$5,$6,$7,$8,$9)",
      [entityId,date,driver?.id??null,fleet.id,op.station||"",km,liters,price,"Importado por Salomão IA · "+sourceName],
    );
    if(km>0) await saveOdometer(sql,fleet.id,driver?.id??null,km,date,sourceName,sourceHash,"Odômetro captado no abastecimento");
    return {saved:true,kind:"fueling",entityType:"fueling",entityId,fleet:fleet.name,driver:driver?.name??null,date,liters,pricePerLiter:price,total:liters*price,message:"Abastecimento lançado."};
  }

  if(op.kind==="odometer") {
    const km=integer(op.odometer_km);
    if(confidence<0.88||!fleet||!km) return review(op,"Odômetro precisa de conjunto e KM legível.");
    const entityId=await saveOdometer(sql,fleet.id,driver?.id??null,km,date,sourceName,sourceHash,op.description||op.source_excerpt||"Odômetro informado pelo motorista");
    return {saved:true,kind:"odometer",entityType:"odometer",entityId,fleet:fleet.name,date,odometerKm:km,message:"Odômetro salvo no histórico do conjunto."};
  }

  if(op.kind==="mechanic") {
    if(confidence<0.84||!fleet) return review(op,"Nota mecânica precisa identificar o conjunto com segurança.");
    const amount=positive(op.amount);
    const km=integer(op.odometer_km);
    const description=String(op.description||op.source_excerpt||"Registro de mecânica").slice(0,1000);
    const entityId=id("maint");
    await sql.unsafe(
      "insert into fleet_maintenance_history(id,fleet_id,driver_id,observed_date,description,amount,odometer_km,source_name,source_hash,raw_data) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb)",
      [entityId,fleet.id,driver?.id??null,date,description,amount,km,sourceName,sourceHash,JSON.stringify(op)],
    );
    let expenseId:string|null=null;
    if(amount) {
      expenseId=id("exp");
      await sql.unsafe(
        "insert into expenses(id,date,fleet_id,asset_type,driver_id,category,description,amount,notes) values($1,$2,$3,'tractor',null,'Mecânica',$4,$5,$6)",
        [expenseId,date,fleet.id,description,amount,"Importado por Salomão IA · "+sourceName],
      );
    }
    if(km) await saveOdometer(sql,fleet.id,driver?.id??null,km,date,sourceName,sourceHash,"Odômetro captado em nota ou mensagem mecânica");
    return {saved:true,kind:"mechanic",entityType:"maintenance",entityId,expenseId,fleet:fleet.name,date,amount,odometerKm:km,message:amount?"Mecânica gravada no histórico e em Despesas.":"Mecânica gravada no histórico do conjunto."};
  }

  if(op.kind==="trip") {
    const mode=op.freight_mode;
    if(confidence<0.84||!driver||!fleet||!mode||!op.ticket_number) return review(op,"Viagem precisa de ticket, motorista, conjunto e modalidade.");
    if(mode==="ton"&&!integer(op.net_weight_kg)) return review(op,"Viagem por tonelada precisa do peso líquido.");
    const priceTon=positive(op.price_per_ton);
    const raw:any={
      numero_ticket:op.ticket_number,
      data_ticket:date,
      motorista:driver.name,
      placa_veiculo:op.tractor_plate,
      placa_carreta:op.trailer_plate,
      cliente:op.client,
      contratante:op.client,
      driverId:driver.id,
      fleetId:fleet.id,
      freightMode:mode,
      peso_liquido_kg:integer(op.net_weight_kg),
      route_price_per_ton:priceTon,
      route_confidence:priceTon?confidence:null,
      inferred_freight_mode:mode,
      inferred_price:priceTon||positive(op.price_per_trip),
      inferred_price_basis:priceTon?"preço identificado na conversa/documento":"importação mensal",
      inference_confidence:confidence,
      dailyValue:mode==="ton"?0:(positive(op.price_per_trip)||0),
      km_carreta:integer(op.odometer_km)||0,
      conferido:true,
      alertas:["Importado por Salomão IA de "+sourceName],
    };
    const validated=validateSave(raw);
    const saved=await saveTicket(sql,validated,{createdBy:"Importador Salomão IA"});
    const km=integer(op.odometer_km);
    if(km) await saveOdometer(sql,fleet.id,driver.id,km,date,sourceName,sourceHash,"Odômetro captado junto da viagem");
    return {saved:true,kind:"trip",entityType:"report",entityId:saved.reportId,ticket:saved.ticket,driver:driver.name,fleet:fleet.name,date,mode,message:saved.linkedExisting?"Viagem já existia; arquivo vinculado à importação.":"Viagem enviada ao Caixa."};
  }

  return review(op,"Informação mantida para revisão; não há lançamento automático seguro.");
}

async function saveOdometer(sql:any,fleetId:string,driverId:string|null,km:number,date:string,sourceName:string,sourceHash:string,notes:string) {
  const found=await sql.unsafe("select id from fleet_odometer_history where fleet_id=$1 and odometer_km=$2 and observed_date=$3 limit 1",[fleetId,km,date]);
  if(found[0]) return String(found[0].id);
  const entityId=id("odo");
  await sql.unsafe(
    "insert into fleet_odometer_history(id,fleet_id,driver_id,odometer_km,observed_date,source_name,source_hash,notes) values($1,$2,$3,$4,$5,$6,$7,$8)",
    [entityId,fleetId,driverId,km,date,sourceName,sourceHash,notes],
  );
  return entityId;
}

function review(operation:ImportOperation,message:string) {
  return {saved:false,kind:operation.kind,message,operation};
}
function id(prefix:string) {
  return prefix+"_"+randomUUID().replace(/-/g,"");
}
function todayBR() {
  return new Intl.DateTimeFormat("en-CA",{timeZone:"America/Sao_Paulo"}).format(new Date());
}
function validDate(value:unknown) {
  const text=String(value??"").trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(text)?text:null;
}
function positive(value:unknown) {
  const number=Number(value);
  return Number.isFinite(number)&&number>0&&number<=100000000?number:null;
}
function integer(value:unknown) {
  const number=Number(value);
  const rounded=Math.round(number);
  return Number.isFinite(number)&&rounded>0&&rounded<=2147483647?rounded:null;
}
function norm(value:unknown) {
  return String(value??"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLocaleLowerCase("pt-BR").replace(/[^a-z0-9]+/g," ").trim();
}
function plate(value:unknown) {
  const p=String(value??"").toUpperCase().replace(/[^A-Z0-9]/g,"");
  return /^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$/.test(p)?p:null;
}
function fingerprintFor(sourceHash:string,op:ImportOperation,driverId?:string,fleetId?:string) {
  return createHash("sha256").update(JSON.stringify({
    sourceHash,kind:op.kind,date:op.date,amount:op.amount,driverId,fleetId,
    ticket:op.ticket_number,weight:op.net_weight_kg,liters:op.liters,
    price:op.price_per_liter,km:op.odometer_km,description:op.description,
  })).digest("hex");
}
function json(value:unknown,status=200) {
  return Response.json(value,{status,headers:{"Cache-Control":"no-store","X-Content-Type-Options":"nosniff"}});
}
