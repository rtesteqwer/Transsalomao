import { createHash } from "node:crypto";
import { createFileRoute } from "@tanstack/react-router";
import { getSql } from "@/lib/db";
import { authenticateAssistantRequest } from "@/lib/assistant-auth.server";

export const Route = createFileRoute("/api/assistant")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const auth = await authenticateAssistantRequest(request);
        if (!auth) return out({ ok: false, authenticated: false }, 401);
        return out({
          ok: true,
          authenticated: true,
          username: auth.username,
          via: auth.via,
          aiConfigured: !!process.env.OPENAI_API_KEY?.trim(),
          model: modelName(),
          capabilities: ["consultar", "criar", "editar", "lançar", "aprovar", "configurar acesso"],
        });
      },

      POST: async ({ request }) => {
        const auth = await authenticateAssistantRequest(request);
        if (!auth) return out({ ok: false, code: "LOGIN_REQUIRED", answer: "Faça a autenticação do Salomão IA para liberar o acesso independente." }, 401);
        if (request.headers.get("x-salomao-app") !== "1") return out({ ok: false, code: "APP_HEADER_REQUIRED" }, 403);

        let body: any = {};
        try { body = await request.json(); } catch { return out({ ok: false, code: "INVALID_JSON" }, 400); }
        const message = String(body?.message ?? "").trim().slice(0, 5000);
        if (!message) return out({ ok: false, code: "EMPTY_MESSAGE" }, 400);

        const history: Turn[] = Array.isArray(body?.history)
          ? body.history.slice(-18).map((x: any) => ({
              role: x?.role === "assistant" ? "assistant" : "user",
              content: String(x?.content ?? "").slice(0, 2800),
            })).filter((x: Turn) => x.content.trim())
          : [];

        // Intenções de escrita claras têm prioridade absoluta sobre qualquer consulta/fuzzy match.
        const deterministic = await highPriorityAction(message, history, auth.username);
        if (deterministic) return out({ ok: true, mode: "action-router", ...deterministic });

        const apiKey = process.env.OPENAI_API_KEY?.trim();
        if (apiKey) {
          try {
            return out({ ok: true, mode: "gpt", answer: await gptAnswer(message, history, apiKey, auth.username) });
          } catch (error) {
            console.error("[salomao-ai-v4] GPT fallback", error);
          }
        }

        const local = await localAnswer(message, history);
        return out({ ok: true, mode: "local", ...local });
      },
    },
  },
});

type Row = Record<string, any>;
type Turn = { role: "user" | "assistant"; content: string };
type Snapshot = { drivers: Row[]; fleets: Row[]; trips: Row[]; fuelings: Row[]; expenses: Row[]; reports: Row[]; prices: Row[] };

function out(value: unknown, status = 200) {
  return Response.json(value, { status, headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } });
}
function modelName() { return process.env.OPENAI_ASSISTANT_MODEL?.trim() || "gpt-5.6-sol"; }
function n(v: unknown) { const x = Number(v ?? 0); return Number.isFinite(x) ? x : 0; }
function norm(v: unknown) { return String(v ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR").replace(/\s+/g, " ").trim(); }
function brl(v: number) { return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v); }
function dec(v: number, d = 2) { return new Intl.NumberFormat("pt-BR", { minimumFractionDigits: d, maximumFractionDigits: d }).format(v); }
function iso(v: unknown) { const s = String(v ?? "").slice(0, 10); return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : ""; }
function todayBR() { return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date()); }
function newId(prefix: string) { return `${prefix}_${crypto.randomUUID().replace(/-/g, "").slice(0, 10)}`; }
function passwordHash(v: string) { return createHash("sha256").update(v).digest("hex"); }
function hasAny(t: string, words: string[]) { return words.some((w) => t.includes(w)); }
function isWriteIntent(t: string) {
  return hasAny(t, ["adicionar", "adicione", "criar", "crie", "cadastrar", "cadastre", "registrar", "registre", "lancar", "lance", "editar", "edite", "alterar", "altere", "mudar", "mude", "aprovar", "aprove", "aceitar", "aceite", "rejeitar", "rejeite", "excluir", "exclua", "apagar", "apague", "desativar", "desative", "remover"]);
}
function isDestructive(t: string) { return hasAny(t, ["excluir", "exclua", "apagar", "apague", "remover tudo", "deletar", "delete"]); }
function explicitlyConfirmed(t: string) { return hasAny(t, ["confirmo", "confirmar", "pode executar", "pode apagar", "pode excluir", "sim, execute", "sim execute"]); }
function redactSecrets(text: string) {
  return text.replace(/(senha\s*(?:é|e|:|=)?\s*)(\S+)/gi, "$1••••••").replace(/(password\s*[:=]?\s*)(\S+)/gi, "$1••••••");
}

async function snapshot(): Promise<Snapshot> {
  const sql = await getSql();
  const [drivers, fleets, trips, fuelings, expenses, reports, prices] = await Promise.all([
    sql<Row>`select * from drivers order by name`,
    sql<Row>`select * from fleets order by name`,
    sql<Row>`select * from trips order by date desc, code desc`,
    sql<Row>`select * from fuelings order by date desc, created_at desc`,
    sql<Row>`select * from expenses order by date desc, created_at desc`,
    sql<Row>`select * from reports order by created_at desc`,
    sql<Row>`select * from freight_prices`,
  ]);
  return { drivers, fleets, trips, fuelings, expenses, reports, prices };
}

function score(name: unknown, query: unknown) {
  const a = norm(name), b = norm(query);
  if (!a || !b) return 0;
  if (a === b) return 100;
  if (a.startsWith(b) || b.startsWith(a)) return 92;
  if (a.includes(b) || b.includes(a)) return 82;
  const bt = b.split(" ").filter((x) => x.length > 2), at = a.split(" ");
  const hits = bt.filter((x) => at.some((y) => y === x || y.startsWith(x) || x.startsWith(y))).length;
  return bt.length ? Math.round(hits / bt.length * 70) : 0;
}
function findDriver(s: Snapshot, query: string) {
  const ranked = s.drivers.map((x) => ({ x, s: score(x.name, query) })).filter((x) => x.s > 0).sort((a,b)=>b.s-a.s);
  return { value: ranked[0]?.x ?? null, score: ranked[0]?.s ?? 0, candidates: ranked.slice(0,5).map((x)=>x.x.name) };
}
function findFleet(s: Snapshot, query: string) {
  const ranked = s.fleets.map((x) => ({ x, s: Math.max(score(x.name,query),score(x.tractor_plate,query),score(x.trailer_plate,query),score(x.model,query)) })).filter((x)=>x.s>0).sort((a,b)=>b.s-a.s);
  return { value: ranked[0]?.x ?? null, score: ranked[0]?.s ?? 0, candidates: ranked.slice(0,5).map((x)=>x.x.name) };
}
function resolveUniqueDriver(s: Snapshot, query: string) {
  const match = findDriver(s, query);
  if (!match.value || match.score < 70) throw new Error(`Não encontrei um motorista com segurança para “${query}”.`);
  return match.value;
}
function resolveUniqueFleet(s: Snapshot, query: string) {
  const match = findFleet(s, query);
  if (!match.value || match.score < 70) throw new Error(`Não encontrei um conjunto com segurança para “${query}”.`);
  return match.value;
}
function freight(t: Row) { return t.freight_mode === "ton" ? n(t.net_weight) * n(t.price_per_ton) : n(t.price_per_trip); }
function dateOk(row: Row, from?: string | null, to?: string | null) { const d=iso(row.date); return (!from||!d||d>=from)&&(!to||!d||d<=to); }
function labelMode(m: unknown) { return m === "trip" ? "Diária" : m === "cegonha" ? "Cegonha" : m === "caixinha" ? "Caixinha" : "Por tonelada"; }

function enrichTrip(s: Snapshot, t: Row) {
  const d=s.drivers.find((x)=>x.id===t.driver_id), f=s.fleets.find((x)=>x.id===t.fleet_id), value=freight(t);
  return { code:t.code,date:iso(t.date),client:t.client,origin:t.origin,destination:t.destination,driver:d?.name??"Motorista removido",fleet:f?.name??"Conjunto removido",tractorPlate:f?.tractor_plate??"",trailerPlate:f?.trailer_plate??"",mode:labelMode(t.freight_mode),netWeight:n(t.net_weight),pricePerTon:n(t.price_per_ton),pricePerTrip:n(t.price_per_trip),km:Math.max(0,n(t.km_end)-n(t.km_start)),freight:value,commission:value*n(d?.commission_pct) };
}

async function querySystem(args: Row) {
  const s=await snapshot(), op=String(args.operation??"system_summary");
  const from=iso(args.date_from)||null,to=iso(args.date_to)||null,limit=Math.max(1,Math.min(100,Math.floor(n(args.limit)||30)));
  const driverQ=String(args.driver??"").trim(),fleetQ=String(args.fleet??"").trim();
  const dm=driverQ?findDriver(s,driverQ):{value:null,score:0,candidates:[] as string[]};
  const fm=fleetQ?findFleet(s,fleetQ):{value:null,score:0,candidates:[] as string[]};
  if(driverQ&&(!dm.value||dm.score<55))return{found:false,entity:"motorista",candidates:dm.candidates};
  if(fleetQ&&(!fm.value||fm.score<55))return{found:false,entity:"conjunto",candidates:fm.candidates};
  const d=dm.value,f=fm.value;
  const trips=s.trips.filter((t)=>(!d||t.driver_id===d.id)&&(!f||t.fleet_id===f.id)&&dateOk(t,from,to)).map((t)=>enrichTrip(s,t));
  const fuels=s.fuelings.filter((x)=>(!d||x.driver_id===d.id)&&(!f||x.fleet_id===f.id)&&dateOk(x,from,to)).map((x)=>{const fl=s.fleets.find((y)=>y.id===x.fleet_id),dr=s.drivers.find((y)=>y.id===x.driver_id);return{date:iso(x.date),driver:dr?.name??"",fleet:fl?.name??"",station:x.station,km:n(x.km),liters:n(x.liters),pricePerLiter:n(x.price_per_liter),total:n(x.liters)*n(x.price_per_liter),notes:x.notes};});
  const expenses=s.expenses.filter((x)=>(!d||x.driver_id===d.id)&&(!f||x.fleet_id===f.id)&&dateOk(x,from,to)).map((x)=>{const fl=s.fleets.find((y)=>y.id===x.fleet_id),dr=s.drivers.find((y)=>y.id===x.driver_id);return{date:iso(x.date),driver:dr?.name??"",fleet:fl?.name??"",category:x.category,description:x.description,amount:n(x.amount),notes:x.notes};});
  const pending=s.reports.filter((x)=>x.status==="pendente"&&(!d||x.driver_id===d.id)&&(!f||x.fleet_id===f.id)).map((x)=>({id:x.id,ticket:x.ticket,driver:s.drivers.find((y)=>y.id===x.driver_id)?.name??"",fleet:s.fleets.find((y)=>y.id===x.fleet_id)?.name??"",mode:labelMode(x.freight_mode),tons:n(x.tons),dailyValue:n(x.daily_value),km:n(x.km),createdAt:String(x.created_at??"")}));
  const tripFreight=trips.reduce((a,x)=>a+x.freight,0),commissions=trips.reduce((a,x)=>a+x.commission,0),fuelCost=fuels.reduce((a,x)=>a+x.total,0),expenseTotal=expenses.reduce((a,x)=>a+x.amount,0);
  const summary={tripCount:trips.length,netTons:trips.reduce((a,x)=>a+x.netWeight,0),km:trips.reduce((a,x)=>a+x.km,0),freight:tripFreight,commission:commissions,afterCommission:tripFreight-commissions,fuelCost,expenses:expenseTotal,pendingReports:pending.length};

  if(op==="driver_overview")return{found:!!d,driver:d?{name:d.name,phone:d.phone,category:d.category,status:d.status,commissionPct:n(d.commission_pct)}:null,summary,fleets:[...new Set(s.trips.filter((t)=>d&&t.driver_id===d.id).map((t)=>s.fleets.find((x)=>x.id===t.fleet_id)?.name).filter(Boolean))],recentTrips:trips.slice(0,limit),recentFuelings:fuels.slice(0,limit),recentExpenses:expenses.slice(0,limit),pending:pending.slice(0,limit),period:{from,to}};
  if(op==="fleet_overview")return{found:!!f,fleet:f?{name:f.name,tractorPlate:f.tractor_plate,trailerPlate:f.trailer_plate,model:f.model,status:f.status}:null,summary,recentTrips:trips.slice(0,limit),recentFuelings:fuels.slice(0,limit),recentExpenses:expenses.slice(0,limit),period:{from,to}};
  if(op==="trips")return{count:trips.length,totalFreight:tripFreight,rows:trips.slice(0,limit),period:{from,to}};
  if(op==="fuelings")return{count:fuels.length,totalCost:fuelCost,rows:fuels.slice(0,limit),period:{from,to}};
  if(op==="expenses")return{count:expenses.length,total:expenseTotal,rows:expenses.slice(0,limit),period:{from,to}};
  if(op==="pending")return{count:pending.length,rows:pending.slice(0,limit)};
  if(op==="management_users"){
    const sql=await getSql();
    const rows=await sql<Row>`select username,role,status,created_at,updated_at from management_users order by lower(username)`;
    return{count:rows.length,rows};
  }
  if(op==="financial_by_driver"){
    const rows=s.drivers.map((dr)=>{const tt=s.trips.filter((t)=>t.driver_id===dr.id&&dateOk(t,from,to)).map((t)=>enrichTrip(s,t));const fr=tt.reduce((a,x)=>a+x.freight,0),co=tt.reduce((a,x)=>a+x.commission,0);return{driver:dr.name,commissionPct:n(dr.commission_pct),trips:tt.length,netTons:tt.reduce((a,x)=>a+x.netWeight,0),km:tt.reduce((a,x)=>a+x.km,0),freight:fr,commission:co,afterCommission:fr-co};}).sort((a,b)=>b.freight-a.freight);
    return{period:{from,to},rows,totals:{trips:rows.reduce((a,x)=>a+x.trips,0),freight:rows.reduce((a,x)=>a+x.freight,0),commission:rows.reduce((a,x)=>a+x.commission,0)}};
  }
  return{period:{from,to},activeDrivers:s.drivers.filter((x)=>x.status==="ativo").length,activeFleets:s.fleets.filter((x)=>x.status==="ativo").length,summary,pendingReports:s.reports.filter((x)=>x.status==="pendente").length,freightPrices:Object.fromEntries(s.prices.map((x)=>[x.mode,n(x.price)]))};
}

async function nextTicketCode() {
  const sql=await getSql();
  const rows=await sql<{next:number}>`select (greatest(coalesce((select max(code::int) from trips where code ~ '^[0-9]+$'),0),coalesce((select max(ticket::int) from reports where ticket ~ '^[0-9]+$'),0))+1)::int as next`;
  return String(Number(rows[0]?.next??1));
}
async function globalPrice(mode:string){
  const sql=await getSql();
  const rows=await sql<{price:number}>`select price from freight_prices where mode=${mode} limit 1`;
  return n(rows[0]?.price);
}

async function mutateSystem(args: Row, actor: string) {
  const op=String(args.operation??"");
  const sql=await getSql();
  const s=await snapshot();

  if(op==="management_user_upsert"){
    const username=String(args.username??"").trim();
    const password=String(args.password??"");
    const role=String(args.role??"admin").trim()||"admin";
    if(!username)throw new Error("Informe o login que deve ser criado ou alterado.");
    const existing=await sql<Row>`select id,username from management_users where lower(username)=lower(${username}) limit 1`;
    if(!existing[0]&&!password)throw new Error("Informe também a senha do novo login.");
    const id=existing[0]?.id||newId("adm");
    if(password){
      await sql`
        insert into management_users(id,username,password_hash,role,status,updated_at)
        values(${id},${username},${passwordHash(password)},${role},'ativo',now())
        on conflict(id) do update set username=excluded.username,password_hash=excluded.password_hash,role=excluded.role,status='ativo',updated_at=now()
      `;
    }else{
      await sql`update management_users set username=${username},role=${role},status='ativo',updated_at=now() where id=${id}`;
    }
    return{ok:true,action:existing[0]?"updated":"created",username,role,actor};
  }

  if(op==="management_user_disable"){
    const username=String(args.username??"").trim();
    if(!username)throw new Error("Informe o login que deve ser desativado.");
    if(norm(username)===norm(actor))throw new Error("O Salomão não desativa o próprio login usado nesta sessão.");
    const rows=await sql<Row>`update management_users set status='inativo',updated_at=now() where lower(username)=lower(${username}) returning username`;
    if(!rows[0])throw new Error("Login não encontrado.");
    return{ok:true,action:"disabled",username:rows[0].username};
  }

  if(op==="driver_upsert"){
    const name=String(args.name??"").trim();
    if(!name)throw new Error("Informe o nome do motorista.");
    const existing=s.drivers.find((x)=>norm(x.name)===norm(name));
    const id=String(args.id??existing?.id??newId("drv"));
    const phone=String(args.phone??existing?.phone??"");
    const category=String(args.category??existing?.category??"E");
    const status=String(args.status??existing?.status??"ativo")==="inativo"?"inativo":"ativo";
    let pct=n(args.commission_pct ?? args.commissionPct ?? existing?.commission_pct ?? 0.2);
    if(pct>1)pct=pct/100;
    if(pct<0||pct>1)throw new Error("Comissão inválida.");
    await sql`
      insert into drivers(id,name,phone,category,status,commission_pct)
      values(${id},${name},${phone},${category},${status},${pct})
      on conflict(id) do update set name=excluded.name,phone=excluded.phone,category=excluded.category,status=excluded.status,commission_pct=excluded.commission_pct
    `;
    return{ok:true,action:existing?"updated":"created",entity:"driver",name,commissionPct:pct};
  }

  if(op==="fleet_upsert"){
    const name=String(args.name??"").trim();
    const tractor=String(args.tractor_plate??args.tractorPlate??"").trim();
    const trailer=String(args.trailer_plate??args.trailerPlate??"").trim();
    if(!name)throw new Error("Informe o nome do conjunto.");
    const existing=s.fleets.find((x)=>norm(x.name)===norm(name));
    if(!existing&&!tractor)throw new Error("Informe a placa do cavalo.");
    if(!existing&&!trailer)throw new Error("Informe a placa da carreta.");
    const id=String(args.id??existing?.id??newId("flt"));
    const model=String(args.model??existing?.model??"");
    const status=String(args.status??existing?.status??"ativo")==="inativo"?"inativo":"ativo";
    await sql`
      insert into fleets(id,name,tractor_plate,trailer_plate,model,status)
      values(${id},${name},${tractor||existing?.tractor_plate||""},${trailer||existing?.trailer_plate||""},${model},${status})
      on conflict(id) do update set name=excluded.name,tractor_plate=excluded.tractor_plate,trailer_plate=excluded.trailer_plate,model=excluded.model,status=excluded.status
    `;
    return{ok:true,action:existing?"updated":"created",entity:"fleet",name};
  }

  if(op==="freight_prices_update"){
    const trip=n(args.trip),cegonha=n(args.cegonha),caixinha=n(args.caixinha);
    if(trip<=0||cegonha<=0||caixinha<=0)throw new Error("Informe valores maiores que zero para Diária, Cegonha e Caixinha.");
    for(const [mode,price] of [["trip",trip],["cegonha",cegonha],["caixinha",caixinha]] as const){
      await sql`insert into freight_prices(mode,price,updated_at) values(${mode},${price},now()) on conflict(mode) do update set price=excluded.price,updated_at=now()`;
      await sql`update trips set price_per_trip=${price} where freight_mode=${mode}`;
    }
    return{ok:true,trip,cegonha,caixinha};
  }

  if(op==="fueling_upsert"){
    const fleet=resolveUniqueFleet(s,String(args.fleet??args.fleet_name??""));
    const driverQ=String(args.driver??args.driver_name??"").trim();
    const driver=driverQ?resolveUniqueDriver(s,driverQ):null;
    const liters=n(args.liters),price=n(args.price_per_liter??args.pricePerLiter);
    if(liters<=0)throw new Error("Informe os litros abastecidos.");
    const id=String(args.id??newId("fuel"));
    const date=iso(args.date)||todayBR();
    await sql`
      insert into fuelings(id,date,driver_id,fleet_id,station,km,liters,price_per_liter,notes)
      values(${id},${date},${driver?.id??null},${fleet.id},${String(args.station??"")},${n(args.km)},${liters},${price},${String(args.notes??"")})
      on conflict(id) do update set date=excluded.date,driver_id=excluded.driver_id,fleet_id=excluded.fleet_id,station=excluded.station,km=excluded.km,liters=excluded.liters,price_per_liter=excluded.price_per_liter,notes=excluded.notes
    `;
    return{ok:true,entity:"fueling",id,date,driver:driver?.name??null,fleet:fleet.name,total:liters*price};
  }

  if(op==="expense_upsert"){
    const category=String(args.category??"").trim(),description=String(args.description??"").trim(),amount=n(args.amount);
    if(!category||!description||amount<=0)throw new Error("Informe categoria, descrição e valor da despesa.");
    const isAdvance=norm(category)==="adiantamento";
    const driverQ=String(args.driver??"").trim(),fleetQ=String(args.fleet??"").trim();
    const driver=driverQ?resolveUniqueDriver(s,driverQ):null;
    const fleet=fleetQ?resolveUniqueFleet(s,fleetQ):null;
    if(isAdvance&&!driver)throw new Error("Informe o motorista que recebeu o adiantamento.");
    if(!isAdvance&&!fleet)throw new Error("Informe o conjunto da despesa.");
    const assetType=String(args.asset_type??args.assetType??"tractor")==="trailer"?"trailer":"tractor";
    const id=String(args.id??newId("exp")),date=iso(args.date)||todayBR();
    await sql`
      insert into expenses(id,date,fleet_id,asset_type,driver_id,category,description,amount,notes)
      values(${id},${date},${isAdvance?null:fleet?.id??null},${isAdvance?null:assetType},${isAdvance?driver?.id??null:null},${category},${description},${amount},${String(args.notes??"")})
      on conflict(id) do update set date=excluded.date,fleet_id=excluded.fleet_id,asset_type=excluded.asset_type,driver_id=excluded.driver_id,category=excluded.category,description=excluded.description,amount=excluded.amount,notes=excluded.notes
    `;
    return{ok:true,entity:"expense",id,date,amount};
  }

  if(op==="trip_upsert"){
    const driver=resolveUniqueDriver(s,String(args.driver??""));
    const fleet=resolveUniqueFleet(s,String(args.fleet??""));
    const mode=["ton","trip","cegonha","caixinha"].includes(String(args.freight_mode))?String(args.freight_mode):"ton";
    const id=String(args.id??newId("trip"));
    const code=args.id?String(args.code??"").trim():await nextTicketCode();
    const date=iso(args.date)||todayBR();
    const net=n(args.net_weight??args.tons),loaded=n(args.loaded_tons??args.net_weight??args.tons),gross=n(args.gross_weight);
    const pricePerTon=n(args.price_per_ton);
    let pricePerTrip=0;
    if(mode==="ton"&&pricePerTon<=0)throw new Error("Informe o preço por tonelada.");
    if(mode!=="ton"){pricePerTrip=await globalPrice(mode);if(pricePerTrip<=0)throw new Error(`Configure o preço de ${labelMode(mode)} antes de lançar.`);}
    await sql`
      insert into trips(id,code,date,client,origin,destination,driver_id,fleet_id,loaded_tons,gross_weight,net_weight,freight_mode,price_per_ton,price_per_trip,km_start,km_end,diesel_liters,diesel_price)
      values(${id},${code},${date},${String(args.client??"")},${String(args.origin??"")},${String(args.destination??"")},${driver.id},${fleet.id},${loaded},${gross},${net},${mode},${pricePerTon},${pricePerTrip},${n(args.km_start)},${n(args.km_end)},0,0)
      on conflict(id) do update set code=excluded.code,date=excluded.date,client=excluded.client,origin=excluded.origin,destination=excluded.destination,driver_id=excluded.driver_id,fleet_id=excluded.fleet_id,loaded_tons=excluded.loaded_tons,gross_weight=excluded.gross_weight,net_weight=excluded.net_weight,freight_mode=excluded.freight_mode,price_per_ton=excluded.price_per_ton,price_per_trip=excluded.price_per_trip,km_start=excluded.km_start,km_end=excluded.km_end
    `;
    return{ok:true,entity:"trip",id,code,date,driver:driver.name,fleet:fleet.name,freight:mode==="ton"?net*pricePerTon:pricePerTrip};
  }

  if(op==="report_accept"){
    const ticket=String(args.ticket??"").trim();
    if(!ticket)throw new Error("Informe o ticket a aceitar.");
    const rows=await sql<Row>`select * from reports where ticket=${ticket} and status='pendente' limit 1`;
    const report=rows[0];
    if(!report)throw new Error("Lançamento pendente não encontrado.");
    const mode=String(report.freight_mode??"");
    if(!["ton","trip","cegonha","caixinha"].includes(mode))throw new Error("O lançamento precisa de modo de frete antes de ser aceito.");
    let pricePerTrip=0;
    if(mode==="trip")pricePerTrip=n(report.daily_value);
    else if(mode!=="ton")pricePerTrip=await globalPrice(mode);
    if(mode!=="ton"&&pricePerTrip<=0)throw new Error("O preço desse modo de frete não está configurado.");
    const tripId=newId("trip"),code=await nextTicketCode(),date=iso(report.loading_date)||todayBR();
    const fleetId=String(report.fleet_id),kmEnd=n(report.km);
    const prev=await sql<Row>`select km_end from trips where fleet_id=${fleetId} and km_end<=${kmEnd} order by km_end desc limit 1`;
    const kmStart=n(prev[0]?.km_end),tons=n(report.tons);
    await sql`
      insert into trips(id,code,date,client,origin,destination,driver_id,fleet_id,loaded_tons,gross_weight,net_weight,freight_mode,price_per_ton,price_per_trip,km_start,km_end,diesel_liters,diesel_price)
      values(${tripId},${code},${date},'','','',${String(report.driver_id)},${fleetId},${tons},0,${tons},${mode},0,${pricePerTrip},${kmStart},${kmEnd},0,0)
    `;
    await sql`update reports set status='aceito',trip_id=${tripId},ticket=${code} where id=${String(report.id)}`;
    return{ok:true,entity:"report",action:"accepted",ticket:code,tripId};
  }

  if(op==="report_reject"){
    const ticket=String(args.ticket??"").trim();
    if(!ticket)throw new Error("Informe o ticket a rejeitar.");
    const rows=await sql<Row>`update reports set status='recusado' where ticket=${ticket} and status='pendente' returning ticket`;
    if(!rows[0])throw new Error("Lançamento pendente não encontrado.");
    return{ok:true,entity:"report",action:"rejected",ticket:rows[0].ticket};
  }

  const destructive=["delete_trip","delete_fueling","delete_expense","delete_report","delete_driver","delete_all_trips"];
  if(destructive.includes(op)){
    if(!args.confirmed)throw new Error("CONFIRMATION_REQUIRED");
    if(op==="delete_all_trips"){
      const count=await sql<{count:number}>`select count(*)::int as count from trips`;
      await sql`update reports set trip_id=null,status='pendente' where trip_id is not null`;
      await sql`delete from trips`;
      return{ok:true,deleted:Number(count[0]?.count??0)};
    }
    const id=String(args.id??"").trim();
    if(!id)throw new Error("Informe o identificador do registro.");
    if(op==="delete_trip"){await sql`update reports set trip_id=null,status='pendente' where trip_id=${id}`;await sql`delete from trips where id=${id}`;}
    if(op==="delete_fueling")await sql`delete from fuelings where id=${id}`;
    if(op==="delete_expense")await sql`delete from expenses where id=${id}`;
    if(op==="delete_report")await sql`delete from reports where id=${id}`;
    if(op==="delete_driver"){
      const linked=await sql<{count:number}>`select ((select count(*) from trips where driver_id=${id})+(select count(*) from reports where driver_id=${id})+(select count(*) from fuelings where driver_id=${id}))::int as count`;
      if(Number(linked[0]?.count??0)>0)throw new Error("Este motorista possui histórico. Altere o status para inativo em vez de excluir.");
      await sql`delete from drivers where id=${id}`;
    }
    return{ok:true,action:op,id};
  }

  throw new Error("Ação ainda não implementada.");
}

const queryTool = {
  type:"function",name:"query_trans_salomao",
  description:"Consulta dados reais do Trans Salomão. Use para motoristas, viagens, conjuntos, abastecimentos, despesas, Caixa, faturamento, comissões e logins administrativos.",
  strict:true,
  parameters:{type:"object",properties:{
    operation:{type:"string",enum:["driver_overview","fleet_overview","trips","fuelings","expenses","pending","financial_by_driver","system_summary","management_users"]},
    driver:{type:["string","null"]},fleet:{type:["string","null"]},date_from:{type:["string","null"]},date_to:{type:["string","null"]},limit:{type:"number",minimum:1,maximum:100}
  },required:["operation","driver","fleet","date_from","date_to","limit"],additionalProperties:false}
};

const actionTool = {
  type:"function",name:"mutate_trans_salomao",
  description:"Executa ações autorizadas no Trans Salomão: criar/editar login, motorista, conjunto, viagem, abastecimento, despesa, preços de frete, aceitar/rejeitar lançamento e exclusões confirmadas. Nunca use para mera consulta.",
  strict:false,
  parameters:{type:"object",properties:{
    operation:{type:"string",enum:["management_user_upsert","management_user_disable","driver_upsert","fleet_upsert","freight_prices_update","fueling_upsert","expense_upsert","trip_upsert","report_accept","report_reject","delete_trip","delete_fueling","delete_expense","delete_report","delete_driver","delete_all_trips"]},
    username:{type:"string"},password:{type:"string"},role:{type:"string"},
    name:{type:"string"},phone:{type:"string"},category:{type:"string"},status:{type:"string"},commission_pct:{type:"number"},
    tractor_plate:{type:"string"},trailer_plate:{type:"string"},model:{type:"string"},
    driver:{type:"string"},fleet:{type:"string"},date:{type:"string"},station:{type:"string"},km:{type:"number"},liters:{type:"number"},price_per_liter:{type:"number"},notes:{type:"string"},
    amount:{type:"number"},description:{type:"string"},asset_type:{type:"string"},
    client:{type:"string"},origin:{type:"string"},destination:{type:"string"},tons:{type:"number"},net_weight:{type:"number"},gross_weight:{type:"number"},loaded_tons:{type:"number"},freight_mode:{type:"string"},price_per_ton:{type:"number"},km_start:{type:"number"},km_end:{type:"number"},
    trip:{type:"number"},cegonha:{type:"number"},caixinha:{type:"number"},ticket:{type:"string"},id:{type:"string"},confirmed:{type:"boolean"}
  },required:["operation"],additionalProperties:true}
};

async function gptAnswer(message:string,history:Turn[],key:string,actor:string){
  const prior=history.map((x)=>`${x.role==="user"?"Usuário":"Salomão"}: ${x.role==="user"?redactSecrets(x.content):x.content}`).join("\n")||"(sem histórico)";
  const instructions=`Você é Salomão IA, agente operacional da transportadora Trans Salomão. Fale em português do Brasil, natural e objetivo. Sua prioridade é entender a INTENÇÃO antes de escolher uma entidade. Verbos como criar, adicionar, cadastrar, alterar, lançar, aceitar, aprovar, rejeitar, excluir e configurar indicam AÇÃO; não transforme esses pedidos em consulta de motorista. "Login", "usuário", "administrador", "operador" e "acesso" significam conta de gerenciamento, nunca motorista. Exemplo obrigatório: "adicionar login João senha 123456" => mutate_trans_salomao(operation=management_user_upsert). Para números/dados reais use query_trans_salomao; para mudanças use mutate_trans_salomao. Se faltar um campo necessário, pergunte somente o que falta. Não invente. Não revele nem repita senhas. Para exclusões/apagar tudo, só chame a ferramenta quando o usuário tiver confirmado explicitamente; passe confirmed=true. Ações de criação/edição explícitas não precisam de confirmação extra. Use contexto para "ele/dele", mas nunca deixe um nome mencionado numa resposta anterior substituir a intenção atual. Usuário autenticado: ${actor}. Hoje: ${todayBR()}.`;
  let response=await openAI(key,{model:modelName(),reasoning:{effort:"high"},instructions,input:`Histórico:\n${prior}\n\nPedido atual:\n${message}`,tools:[queryTool,actionTool],tool_choice:"auto",max_output_tokens:4000});
  for(let i=0;i<8;i++){
    const calls=(Array.isArray(response.output)?response.output:[]).filter((x:any)=>x?.type==="function_call");
    if(!calls.length){const text=outputText(response);if(text)return text;throw new Error("Resposta vazia");}
    const outputs=[];
    for(const call of calls){
      let args:Row={};try{args=JSON.parse(call.arguments||"{}");}catch{}
      try{
        const result=call.name==="mutate_trans_salomao"?await mutateSystem(args,actor):await querySystem(args);
        outputs.push({type:"function_call_output",call_id:call.call_id,output:JSON.stringify(result)});
      }catch(error:any){
        outputs.push({type:"function_call_output",call_id:call.call_id,output:JSON.stringify({ok:false,error:String(error?.message||error)})});
      }
    }
    response=await openAI(key,{model:modelName(),reasoning:{effort:"high"},instructions,previous_response_id:response.id,input:outputs,tools:[queryTool,actionTool],tool_choice:"auto",max_output_tokens:4000});
  }
  throw new Error("Limite de ferramentas excedido");
}
async function openAI(key:string,payload:Row){
  const r=await fetch("https://api.openai.com/v1/responses",{method:"POST",headers:{Authorization:`Bearer ${key}`,"Content-Type":"application/json"},body:JSON.stringify(payload)});
  const data=await r.json();if(!r.ok)throw new Error(`OpenAI ${r.status}: ${JSON.stringify(data).slice(0,800)}`);return data as any;
}
function outputText(r:any){if(typeof r?.output_text==="string"&&r.output_text.trim())return r.output_text.trim();const p:string[]=[];for(const x of Array.isArray(r?.output)?r.output:[])if(x?.type==="message")for(const c of Array.isArray(x.content)?x.content:[])if(c?.type==="output_text"&&typeof c.text==="string")p.push(c.text);return p.join("\n").trim();}

function parseLoginCommand(message:string){
  const t=norm(message);
  if(!hasAny(t,["login","usuario","acesso","administrador","operador"]))return null;
  const raw=message.trim();
  const userMatch=raw.match(/(?:login|usu[aá]rio|administrador|operador)\s+([A-Za-zÀ-ÿ0-9._-]+)/i) || raw.match(/(?:nome)\s+([A-Za-zÀ-ÿ0-9._-]+)/i);
  const passMatch=raw.match(/senha\s*(?:é|e|:|=)?\s*([^\s,;]+)/i);
  return{t,username:userMatch?.[1]?.trim()||"",password:passMatch?.[1]||""};
}

async function highPriorityAction(message:string,history:Turn[],actor:string){
  const text=norm(message);
  if(!isWriteIntent(text))return null;

  const login=parseLoginCommand(message);
  if(login){
    if(hasAny(text,["listar","mostrar","quais","ver logins","usuarios cadastrados"])) {
      const r:any=await querySystem({operation:"management_users",driver:null,fleet:null,date_from:null,date_to:null,limit:100});
      return{answer:r.rows.length?`Logins cadastrados: ${r.rows.map((x:any)=>x.username+" ("+x.status+")").join(", ")}.`:"Não há logins cadastrados."};
    }
    if(hasAny(text,["desativar","desative","bloquear","bloqueie"])){
      if(!login.username)return{answer:"Qual login você quer desativar?"};
      try{const r:any=await mutateSystem({operation:"management_user_disable",username:login.username},actor);return{answer:`Login ${r.username} desativado.`};}
      catch(e:any){return{answer:String(e?.message||e)};}
    }
    if(hasAny(text,["adicionar","adicione","criar","crie","cadastrar","cadastre","alterar","altere","mudar","mude","editar","edite"])){
      if(!login.username&&!login.password)return{answer:"Para criar o acesso, diga o nome do login e a senha. Exemplo: “adicionar login João senha 123456”."};
      if(!login.username)return{answer:"Qual será o nome do login?"};
      if(!login.password)return{answer:`Qual senha devo definir para o login ${login.username}?`};
      try{
        const r:any=await mutateSystem({operation:"management_user_upsert",username:login.username,password:login.password,role:"admin"},actor);
        return{answer:r.action==="created"?`Login ${r.username} criado como administrador.`:`Login ${r.username} atualizado. A senha foi alterada e não será exibida.`};
      }catch(e:any){return{answer:String(e?.message||e)};}
    }
  }

  // Em modo local, para outras ações não arriscar uma operação errada: explicar o que falta.
  if(hasAny(text,["motorista"])&&hasAny(text,["adicionar","criar","cadastrar"])){
    return{answer:"Posso cadastrar o motorista. Informe pelo menos nome, categoria da CNH e comissão; telefone é opcional."};
  }
  if(hasAny(text,["conjunto","carreta"])&&hasAny(text,["adicionar","criar","cadastrar"])){
    return{answer:"Posso cadastrar o conjunto. Informe nome do conjunto, placa do cavalo e placa da carreta."};
  }
  if(hasAny(text,["abastecimento","abastecer"])&&hasAny(text,["adicionar","registrar","lancar"])){
    return{answer:"Posso registrar o abastecimento. Informe conjunto, litros e preço por litro; motorista, posto, km e data podem ser incluídos."};
  }
  if(hasAny(text,["viagem"])&&hasAny(text,["adicionar","registrar","lancar","criar"])){
    return{answer:"Posso lançar a viagem. Informe motorista, conjunto, modo de frete e os valores necessários (toneladas/preço por tonelada ou modo fixo)."};
  }
  if(isDestructive(text)&&!explicitlyConfirmed(text))return{answer:"Essa é uma ação destrutiva. Repita o pedido incluindo “confirmo” para eu executar."};
  return{answer:"Entendi que você quer executar uma ação no sistema. Com a IA avançada conectada eu consigo extrair os campos do seu pedido e chamar a função correta; no modo local, diga a ação e os dados principais de forma explícita para eu não alterar o registro errado."};
}

function mentionedDriver(s:Snapshot,text:string){let best:any=null,bestScore=0;for(const d of s.drivers){let sc=norm(text).includes(norm(d.name))?100:0;for(const token of norm(d.name).split(" ").filter((x)=>x.length>=4))if(norm(text).includes(token))sc+=10;if(sc>bestScore){best=d;bestScore=sc;}}return bestScore>=10?best:null;}
function mentionedFleet(s:Snapshot,text:string){let best:any=null,bestScore=0;for(const f of s.fleets){const sc=Math.max(score(f.name,text),score(f.tractor_plate,text),score(f.trailer_plate,text));if(sc>bestScore){best=f;bestScore=sc;}}return bestScore>=10?best:null;}

async function localAnswer(message:string,history:Turn[]){
  const s=await snapshot(),text=norm(message);
  const userHistory=history.filter((x)=>x.role==="user").slice(-5).map((x)=>x.content).join(" ");
  const needsContext=hasAny(text,["ele","dele","dela","esse motorista","essa motorista","esse conjunto","desse motorista","desse conjunto"]);
  const contextText=needsContext?`${message} ${userHistory}`:message;
  const d=mentionedDriver(s,contextText),f=mentionedFleet(s,contextText);

  if(hasAny(text,["login","usuario","acesso","administrador","operador"])){
    const r:any=await querySystem({operation:"management_users",driver:null,fleet:null,date_from:null,date_to:null,limit:100});
    return{answer:r.rows.length?`Há ${r.rows.length} login(s) de gerenciamento: ${r.rows.map((x:any)=>x.username+" ("+x.status+")").join(", ")}.`:"Não há logins cadastrados."};
  }
  if(text.includes("abastec")||text.includes("diesel")||text.includes("combustivel")){const r:any=await querySystem({operation:"fuelings",driver:d?.name||null,fleet:f?.name||null,date_from:null,date_to:null,limit:30});return{answer:`Encontrei ${r.count} abastecimento(s)${d?" de "+d.name:""}, totalizando ${brl(r.totalCost)}.`,data:r};}
  if(text.includes("despesa")||text.includes("gasto")){const r:any=await querySystem({operation:"expenses",driver:d?.name||null,fleet:f?.name||null,date_from:null,date_to:null,limit:30});return{answer:`Encontrei ${r.count} despesa(s)${d?" relacionadas a "+d.name:""}, somando ${brl(r.total)}.`,data:r};}
  if(text.includes("pendente")||text.includes("caixa")||text.includes("lancamento")){const r:any=await querySystem({operation:"pending",driver:d?.name||null,fleet:f?.name||null,date_from:null,date_to:null,limit:50});return{answer:`Há ${r.count} lançamento(s) pendente(s)${d?" de "+d.name:""}.`,data:r};}
  if(text.includes("viagem")||text.includes("frete")){const r:any=await querySystem({operation:"trips",driver:d?.name||null,fleet:f?.name||null,date_from:null,date_to:null,limit:30});return{answer:`Encontrei ${r.count} viagem(ns)${d?" de "+d.name:""}, totalizando ${brl(r.totalFreight)} de frete.`,data:r};}
  if((text.includes("fatur")||text.includes("comissao"))&&d){const r:any=await querySystem({operation:"driver_overview",driver:d.name,fleet:null,date_from:null,date_to:null,limit:20});return{answer:`${d.name} possui ${r.summary.tripCount} viagens e ${brl(r.summary.freight)} de faturamento. Comissão: ${brl(r.summary.commission)}; após comissão: ${brl(r.summary.afterCommission)}.`,data:r};}
  if(text.includes("fatur")||text.includes("comissao")||text.includes("motoristas")){const r:any=await querySystem({operation:"financial_by_driver",driver:null,fleet:null,date_from:null,date_to:null,limit:50});return{answer:`O faturamento total registrado é ${brl(r.totals.freight)}, com ${brl(r.totals.commission)} em comissões e ${r.totals.trips} viagens.`,data:r};}
  if(text.includes("conjunto")||text.includes("carreta")||text.includes("placa")||f){const r:any=await querySystem({operation:"fleet_overview",driver:null,fleet:f?.name||message,date_from:null,date_to:null,limit:20});if(!r.found)return{answer:"Não consegui identificar esse conjunto."};return{answer:`${r.fleet.name}: cavalo ${r.fleet.tractorPlate}, carreta ${r.fleet.trailerPlate}, modelo ${r.fleet.model||"não informado"}. Possui ${r.summary.tripCount} viagens e ${brl(r.summary.freight)} de faturamento.`,data:r};}
  if(text.includes("motorista")||d){const r:any=await querySystem({operation:"driver_overview",driver:d?.name||message,fleet:null,date_from:null,date_to:null,limit:20});if(!r.found)return{answer:"Não consegui identificar o motorista."};return{answer:`${r.driver.name} — ${r.driver.status}, categoria ${r.driver.category||"não informada"}, telefone ${r.driver.phone||"não informado"}, comissão ${dec(r.driver.commissionPct*100,0)}%. Possui ${r.summary.tripCount} viagens, ${dec(r.summary.netTons,3)} t líquidas, ${dec(r.summary.km,0)} km e ${brl(r.summary.freight)} de faturamento. Comissão calculada: ${brl(r.summary.commission)}. Há ${r.summary.pendingReports} lançamento(s) pendente(s).`,data:r};}
  return{answer:"Posso consultar dados e também executar funções do Trans Salomão. Para inteligência conversacional no nível do ChatGPT, conecte a IA avançada; enquanto isso, o roteador local separa consultas de ações para não confundir login com motorista."};
}
