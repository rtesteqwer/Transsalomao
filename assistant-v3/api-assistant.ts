import { createFileRoute } from "@tanstack/react-router";
import { getSql } from "@/lib/db";

export const Route = createFileRoute("/api/assistant")({
  server: {
    handlers: {
      GET: async () => {
        try {
          await requireManagement();
          return out({ ok: true, authenticated: true, aiConfigured: !!process.env.OPENAI_API_KEY?.trim(), model: modelName() });
        } catch {
          return out({ ok: false, authenticated: false }, 401);
        }
      },
      POST: async ({ request }) => {
        try { await requireManagement(); }
        catch { return out({ ok: false, code: "LOGIN_REQUIRED", answer: "Abra a aba Site, entre na Gerência e volte ao chat." }, 401); }
        if (request.headers.get("x-salomao-app") !== "1") return out({ ok: false, code: "APP_HEADER_REQUIRED" }, 403);
        let body: any = {};
        try { body = await request.json(); } catch { return out({ ok: false, code: "INVALID_JSON" }, 400); }
        const message = String(body?.message ?? "").trim().slice(0, 4000);
        if (!message) return out({ ok: false, code: "EMPTY_MESSAGE" }, 400);
        const history = Array.isArray(body?.history) ? body.history.slice(-16).map((x: any) => ({ role: x?.role === "assistant" ? "assistant" : "user", content: String(x?.content ?? "").slice(0, 2500) })).filter((x: any) => x.content.trim()) : [];
        const apiKey = process.env.OPENAI_API_KEY?.trim();
        if (apiKey) {
          try { return out({ ok: true, mode: "gpt", answer: await gptAnswer(message, history, apiKey) }); }
          catch (error) { console.error("[salomao-ai] GPT fallback", error); }
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

async function requireManagement() {
  const { assertManagementSession } = await import("@/lib/management-auth.server");
  return assertManagementSession();
}
function out(value: unknown, status = 200) { return Response.json(value, { status, headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } }); }
function modelName() { return process.env.OPENAI_ASSISTANT_MODEL?.trim() || "gpt-5.6-sol"; }
function n(v: unknown) { const x = Number(v ?? 0); return Number.isFinite(x) ? x : 0; }
function norm(v: unknown) { return String(v ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR").replace(/\s+/g, " ").trim(); }
function brl(v: number) { return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v); }
function dec(v: number, d = 2) { return new Intl.NumberFormat("pt-BR", { minimumFractionDigits: d, maximumFractionDigits: d }).format(v); }
function iso(v: unknown) { const s = String(v ?? "").slice(0, 10); return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : ""; }
function todayBR() { return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date()); }

async function snapshot(): Promise<Snapshot> {
  const sql = await getSql();
  const [drivers, fleets, trips, fuelings, expenses, reports, prices] = await Promise.all([
    sql<Row>`select * from drivers order by name`,
    sql<Row>`select * from fleets order by name`,
    sql<Row>`select * from trips order by date desc,code desc`,
    sql<Row>`select * from fuelings order by date desc,created_at desc`,
    sql<Row>`select * from expenses order by date desc,created_at desc`,
    sql<Row>`select * from reports order by created_at desc`,
    sql<Row>`select * from freight_prices`,
  ]);
  return { drivers, fleets, trips, fuelings, expenses, reports, prices };
}

function score(name: unknown, query: unknown) {
  const a = norm(name), b = norm(query); if (!a || !b) return 0;
  if (a === b) return 100; if (a.startsWith(b)) return 90; if (a.includes(b)) return 80;
  const bt = b.split(" ").filter((x) => x.length > 2), at = a.split(" ");
  const hits = bt.filter((x) => at.some((y) => y === x || y.startsWith(x) || x.startsWith(y))).length;
  return bt.length ? Math.round(hits / bt.length * 70) : 0;
}
function findDriver(s: Snapshot, query: string) {
  const ranked = s.drivers.map((x) => ({ x, s: score(x.name, query) })).filter((x) => x.s > 0).sort((a,b) => b.s-a.s);
  return { value: ranked[0]?.x ?? null, candidates: ranked.slice(0,5).map((x) => x.x.name) };
}
function findFleet(s: Snapshot, query: string) {
  const ranked = s.fleets.map((x) => ({ x, s: Math.max(score(x.name,query),score(x.tractor_plate,query),score(x.trailer_plate,query),score(x.model,query)) })).filter((x) => x.s > 0).sort((a,b)=>b.s-a.s);
  return { value: ranked[0]?.x ?? null, candidates: ranked.slice(0,5).map((x) => x.x.name) };
}
function freight(t: Row) { return t.freight_mode === "ton" ? n(t.net_weight) * n(t.price_per_ton) : n(t.price_per_trip); }
function dateOk(row: Row, from?: string | null, to?: string | null) { const d = iso(row.date); return (!from || !d || d >= from) && (!to || !d || d <= to); }
function labelMode(m: unknown) { return m === "trip" ? "Diária" : m === "cegonha" ? "Cegonha" : m === "caixinha" ? "Caixinha" : "Por tonelada"; }

function enrichTrip(s: Snapshot, t: Row) {
  const d = s.drivers.find((x) => x.id === t.driver_id), f = s.fleets.find((x) => x.id === t.fleet_id), value = freight(t);
  return { code: t.code, date: iso(t.date), client: t.client, origin: t.origin, destination: t.destination, driver: d?.name ?? "Motorista removido", fleet: f?.name ?? "Conjunto removido", tractorPlate: f?.tractor_plate ?? "", trailerPlate: f?.trailer_plate ?? "", mode: labelMode(t.freight_mode), netWeight: n(t.net_weight), pricePerTon: n(t.price_per_ton), pricePerTrip: n(t.price_per_trip), km: Math.max(0,n(t.km_end)-n(t.km_start)), freight: value, commission: value*n(d?.commission_pct) };
}

async function querySystem(args: Row) {
  const s = await snapshot();
  const op = String(args.operation ?? "system_summary");
  const from = iso(args.date_from) || null, to = iso(args.date_to) || null;
  const limit = Math.max(1, Math.min(100, Math.floor(n(args.limit) || 30)));
  const driverQ = String(args.driver ?? "").trim(), fleetQ = String(args.fleet ?? "").trim();
  const driverMatch = driverQ ? findDriver(s, driverQ) : { value: null, candidates: [] as string[] };
  const fleetMatch = fleetQ ? findFleet(s, fleetQ) : { value: null, candidates: [] as string[] };
  if (driverQ && !driverMatch.value) return { found: false, entity: "motorista", candidates: driverMatch.candidates };
  if (fleetQ && !fleetMatch.value) return { found: false, entity: "conjunto", candidates: fleetMatch.candidates };
  const d = driverMatch.value, f = fleetMatch.value;

  const trips = s.trips.filter((t) => (!d || t.driver_id === d.id) && (!f || t.fleet_id === f.id) && dateOk(t,from,to)).map((t) => enrichTrip(s,t));
  const fuels = s.fuelings.filter((x) => (!d || x.driver_id === d.id) && (!f || x.fleet_id === f.id) && dateOk(x,from,to)).map((x) => { const fl=s.fleets.find((y)=>y.id===x.fleet_id),dr=s.drivers.find((y)=>y.id===x.driver_id); return { date: iso(x.date), driver: dr?.name ?? "", fleet: fl?.name ?? "", station:x.station, km:n(x.km), liters:n(x.liters), pricePerLiter:n(x.price_per_liter), total:n(x.liters)*n(x.price_per_liter), notes:x.notes }; });
  const expenses = s.expenses.filter((x) => (!d || x.driver_id === d.id) && (!f || x.fleet_id === f.id) && dateOk(x,from,to)).map((x) => { const fl=s.fleets.find((y)=>y.id===x.fleet_id),dr=s.drivers.find((y)=>y.id===x.driver_id); return { date:iso(x.date),driver:dr?.name??"",fleet:fl?.name??"",category:x.category,description:x.description,amount:n(x.amount),notes:x.notes }; });
  const pending = s.reports.filter((x) => x.status === "pendente" && (!d || x.driver_id === d.id) && (!f || x.fleet_id === f.id)).map((x)=>({ ticket:x.ticket,driver:s.drivers.find((y)=>y.id===x.driver_id)?.name??"",fleet:s.fleets.find((y)=>y.id===x.fleet_id)?.name??"",mode:labelMode(x.freight_mode),tons:n(x.tons),dailyValue:n(x.daily_value),km:n(x.km),createdAt:String(x.created_at??"") }));
  const tripFreight = trips.reduce((a,x)=>a+x.freight,0), commissions = trips.reduce((a,x)=>a+x.commission,0), fuelCost = fuels.reduce((a,x)=>a+x.total,0), expenseTotal = expenses.reduce((a,x)=>a+x.amount,0);
  const summary = { tripCount:trips.length,netTons:trips.reduce((a,x)=>a+x.netWeight,0),km:trips.reduce((a,x)=>a+x.km,0),freight:tripFreight,commission:commissions,afterCommission:tripFreight-commissions,fuelCost,expenses:expenseTotal,pendingReports:pending.length };

  if (op === "driver_overview") return { found:!!d, driver:d ? { name:d.name,phone:d.phone,category:d.category,status:d.status,commissionPct:n(d.commission_pct) } : null, summary, fleets:[...new Set(s.trips.filter((t)=>d&&t.driver_id===d.id).map((t)=>s.fleets.find((x)=>x.id===t.fleet_id)?.name).filter(Boolean))], recentTrips:trips.slice(0,limit), recentFuelings:fuels.slice(0,limit), recentExpenses:expenses.slice(0,limit), pending:pending.slice(0,limit), period:{from,to} };
  if (op === "fleet_overview") return { found:!!f, fleet:f ? { name:f.name,tractorPlate:f.tractor_plate,trailerPlate:f.trailer_plate,model:f.model,status:f.status } : null, summary, recentTrips:trips.slice(0,limit), recentFuelings:fuels.slice(0,limit), recentExpenses:expenses.slice(0,limit), period:{from,to} };
  if (op === "trips") return { count:trips.length, totalFreight:tripFreight, rows:trips.slice(0,limit), period:{from,to} };
  if (op === "fuelings") return { count:fuels.length,totalCost:fuelCost,rows:fuels.slice(0,limit),period:{from,to} };
  if (op === "expenses") return { count:expenses.length,total:expenseTotal,rows:expenses.slice(0,limit),period:{from,to} };
  if (op === "pending") return { count:pending.length,rows:pending.slice(0,limit) };
  if (op === "financial_by_driver") {
    const rows = s.drivers.map((dr) => { const tt=s.trips.filter((t)=>t.driver_id===dr.id&&dateOk(t,from,to)).map((t)=>enrichTrip(s,t)); const fr=tt.reduce((a,x)=>a+x.freight,0),co=tt.reduce((a,x)=>a+x.commission,0); return { driver:dr.name,commissionPct:n(dr.commission_pct),trips:tt.length,netTons:tt.reduce((a,x)=>a+x.netWeight,0),km:tt.reduce((a,x)=>a+x.km,0),freight:fr,commission:co,afterCommission:fr-co }; }).sort((a,b)=>b.freight-a.freight); return { period:{from,to},rows,totals:{trips:rows.reduce((a,x)=>a+x.trips,0),freight:rows.reduce((a,x)=>a+x.freight,0),commission:rows.reduce((a,x)=>a+x.commission,0)} };
  }
  return { period:{from,to},activeDrivers:s.drivers.filter((x)=>x.status==="ativo").length,activeFleets:s.fleets.filter((x)=>x.status==="ativo").length,summary,pendingReports:s.reports.filter((x)=>x.status==="pendente").length,freightPrices:Object.fromEntries(s.prices.map((x)=>[x.mode,n(x.price)])) };
}

const tool = {
  type: "function",
  name: "query_trans_salomao",
  description: "Consulta dados reais do Trans Salomão. Use para motoristas, viagens, conjuntos, abastecimentos, despesas, lançamentos pendentes, faturamento, comissões e resumos.",
  strict: true,
  parameters: {
    type: "object",
    properties: {
      operation: { type:"string", enum:["driver_overview","fleet_overview","trips","fuelings","expenses","pending","financial_by_driver","system_summary"] },
      driver: { type:["string","null"], description:"Nome ou parte do nome do motorista, ou null" },
      fleet: { type:["string","null"], description:"Nome, placa ou modelo do conjunto, ou null" },
      date_from: { type:["string","null"], description:"Data inicial YYYY-MM-DD ou null" },
      date_to: { type:["string","null"], description:"Data final YYYY-MM-DD ou null" },
      limit: { type:"number", minimum:1, maximum:100 },
    },
    required:["operation","driver","fleet","date_from","date_to","limit"],
    additionalProperties:false,
  },
};

async function gptAnswer(message: string, history: Turn[], key: string) {
  const prior = history.map((x)=>`${x.role==="user"?"Usuário":"Salomão"}: ${x.content}`).join("\n") || "(sem histórico)";
  const instructions = `Você é Salomão IA, assistente operacional da transportadora Trans Salomão. Responda em português do Brasil com inteligência, naturalidade e objetividade. Para qualquer número, cadastro ou informação operacional, use query_trans_salomao e nunca invente. Faça quantas consultas forem necessárias. Entenda referências de conversa como "ele", "dele" e "esse motorista" usando o histórico. Se o nome for ambíguo, mostre opções. Diferencie faturamento, comissão, abastecimentos e despesas. Não exiba IDs internos. Hoje em America/Sao_Paulo é ${todayBR()}.`;
  let response = await openAI(key,{ model:modelName(),reasoning:{effort:"medium"},instructions,input:`Histórico:\n${prior}\n\nPedido atual:\n${message}`,tools:[tool],tool_choice:"auto",max_output_tokens:3000 });
  for (let i=0;i<6;i++) {
    const calls=(Array.isArray(response.output)?response.output:[]).filter((x:any)=>x?.type==="function_call");
    if (!calls.length) { const text=outputText(response); if(text) return text; throw new Error("Resposta vazia"); }
    const outputs=[];
    for(const call of calls){ let args={}; try{args=JSON.parse(call.arguments||"{}");}catch{} outputs.push({type:"function_call_output",call_id:call.call_id,output:JSON.stringify(await querySystem(args as Row))}); }
    response=await openAI(key,{model:modelName(),reasoning:{effort:"medium"},instructions,previous_response_id:response.id,input:outputs,tools:[tool],tool_choice:"auto",max_output_tokens:3000});
  }
  throw new Error("Limite de ferramentas excedido");
}
async function openAI(key:string,payload:Row){ const r=await fetch("https://api.openai.com/v1/responses",{method:"POST",headers:{Authorization:`Bearer ${key}`,"Content-Type":"application/json"},body:JSON.stringify(payload)}); const data=await r.json(); if(!r.ok) throw new Error(`OpenAI ${r.status}: ${JSON.stringify(data).slice(0,800)}`); return data as any; }
function outputText(r:any){ if(typeof r?.output_text==="string"&&r.output_text.trim()) return r.output_text.trim(); const p:string[]=[]; for(const x of Array.isArray(r?.output)?r.output:[]) if(x?.type==="message") for(const c of Array.isArray(x.content)?x.content:[]) if(c?.type==="output_text"&&typeof c.text==="string") p.push(c.text); return p.join("\n").trim(); }

function mentionedDriver(s:Snapshot,text:string){ let best:any=null,bestScore=0; for(const d of s.drivers){ let sc=norm(text).includes(norm(d.name))?100:0; for(const token of norm(d.name).split(" ").filter((x)=>x.length>=4)) if(norm(text).includes(token)) sc+=10; if(sc>bestScore){best=d;bestScore=sc;} } return bestScore>=10?best:null; }
function mentionedFleet(s:Snapshot,text:string){ let best:any=null,bestScore=0; for(const f of s.fleets){ const sc=Math.max(score(f.name,text),score(f.tractor_plate,text),score(f.trailer_plate,text)); if(sc>bestScore){best=f;bestScore=sc;} } return bestScore>=10?best:null; }
async function localAnswer(message:string,history:Turn[]){
  const s=await snapshot(), text=norm(message), ctx=norm(history.slice(-8).map((x)=>x.content).join(" ")), d=mentionedDriver(s,`${text} ${ctx}`), f=mentionedFleet(s,`${text} ${ctx}`);
  if(text.includes("abastec")||text.includes("diesel")||text.includes("combustivel")){const r:any=await querySystem({operation:"fuelings",driver:d?.name||null,fleet:f?.name||null,date_from:null,date_to:null,limit:30});return{answer:`Encontrei ${r.count} abastecimento(s)${d ? " de " + d.name : ""}, totalizando ${brl(r.totalCost)}.`,data:r};}
  if(text.includes("despesa")||text.includes("gasto")){const r:any=await querySystem({operation:"expenses",driver:d?.name||null,fleet:f?.name||null,date_from:null,date_to:null,limit:30});return{answer:`Encontrei ${r.count} despesa(s)${d ? " relacionadas a " + d.name : ""}, somando ${brl(r.total)}.`,data:r};}
  if(text.includes("pendente")||text.includes("caixa")||text.includes("lancamento")){const r:any=await querySystem({operation:"pending",driver:d?.name||null,fleet:f?.name||null,date_from:null,date_to:null,limit:50});return{answer:`Há ${r.count} lançamento(s) pendente(s)${d ? " de " + d.name : ""}.`,data:r};}
  if(text.includes("viagem")||text.includes("frete")){const r:any=await querySystem({operation:"trips",driver:d?.name||null,fleet:f?.name||null,date_from:null,date_to:null,limit:30});return{answer:`Encontrei ${r.count} viagem(ns)${d ? " de " + d.name : ""}, totalizando ${brl(r.totalFreight)} de frete.`,data:r};}
  if((text.includes("fatur")||text.includes("comissao")) && d){const r:any=await querySystem({operation:"driver_overview",driver:d.name,fleet:null,date_from:null,date_to:null,limit:20});return{answer:`${d.name} possui ${r.summary.tripCount} viagens e ${brl(r.summary.freight)} de faturamento. Comissão calculada: ${brl(r.summary.commission)}; após comissão: ${brl(r.summary.afterCommission)}.`,data:r};}
  if(text.includes("fatur")||text.includes("comissao")||text.includes("motoristas")){const r:any=await querySystem({operation:"financial_by_driver",driver:null,fleet:null,date_from:null,date_to:null,limit:50});return{answer:`O faturamento total registrado é ${brl(r.totals.freight)}, com ${brl(r.totals.commission)} em comissões e ${r.totals.trips} viagens.`,data:r};}
  if(text.includes("conjunto")||text.includes("carreta")||text.includes("placa")||f){const r:any=await querySystem({operation:"fleet_overview",driver:null,fleet:f?.name||message,date_from:null,date_to:null,limit:20});if(!r.found)return{answer:"Não consegui identificar esse conjunto."};return{answer:`${r.fleet.name}: cavalo ${r.fleet.tractorPlate}, carreta ${r.fleet.trailerPlate}, modelo ${r.fleet.model||"não informado"}. Possui ${r.summary.tripCount} viagens e ${brl(r.summary.freight)} de faturamento.`,data:r};}
  if(text.includes("motorista")||d){ const r:any=await querySystem({operation:"driver_overview",driver:d?.name||message,fleet:null,date_from:null,date_to:null,limit:20}); if(!r.found)return{answer:"Não consegui identificar o motorista."}; return{answer:`${r.driver.name} — ${r.driver.status}, categoria ${r.driver.category||"não informada"}, telefone ${r.driver.phone||"não informado"}, comissão ${dec(r.driver.commissionPct*100,0)}%. Possui ${r.summary.tripCount} viagens, ${dec(r.summary.netTons,3)} t líquidas, ${dec(r.summary.km,0)} km e ${brl(r.summary.freight)} de faturamento. Comissão calculada: ${brl(r.summary.commission)}. Há ${r.summary.pendingReports} lançamento(s) pendente(s).`,data:r}; }
  return{answer:"Consigo consultar diretamente os dados do sistema: motoristas, viagens, conjuntos, abastecimentos, despesas, Caixa, faturamento e comissões. Pergunte, por exemplo: “dados do Klebersom”, “abastecimentos do Luís” ou “faturamento por motorista”."};
}
