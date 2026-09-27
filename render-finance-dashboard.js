const http = require("http");

const PORT = process.env.PORT || 10000;

const trips = [
  {id:1,date:"2026-09-27",truck:"AXOR 2544",plate:"RTK-2H18",driver:"Luis Antônio",route:"Sportos Eco → Fertipar",gross:6840,diesel:1760,commission:1368,advances:500,expenses:180,status:"received"},
  {id:2,date:"2026-09-27",truck:"VOLVO FH 460",plate:"RKU-8J44",driver:"Klebersom Dutra",route:"Aimorés → Vitória",gross:5920,diesel:1490,commission:1184,advances:350,expenses:160,status:"pending"},
  {id:3,date:"2026-09-26",truck:"AXOR 2544",plate:"RTK-2H18",driver:"Luis Antônio",route:"Sportos Eco → Fertipar",gross:6280,diesel:1640,commission:1256,advances:0,expenses:120,status:"received"},
  {id:4,date:"2026-09-25",truck:"VOLVO FH 460",plate:"RKU-8J44",driver:"Klebersom Dutra",route:"Aimorés → Vitória",gross:6110,diesel:1710,commission:1222,advances:600,expenses:220,status:"received"},
  {id:5,date:"2026-09-24",truck:"SCANIA R450",plate:"QXZ-9A71",driver:"Micharle José",route:"Vitória → Belo Horizonte",gross:8460,diesel:2820,commission:1692,advances:450,expenses:380,status:"pending"},
  {id:6,date:"2026-09-23",truck:"AXOR 2544",plate:"RTK-2H18",driver:"Luis Antônio",route:"Sportos Eco → Fertipar",gross:6550,diesel:1690,commission:1310,advances:300,expenses:140,status:"received"},
  {id:7,date:"2026-09-22",truck:"VOLVO FH 460",plate:"RKU-8J44",driver:"Klebersom Dutra",route:"Aimorés → Vitória",gross:5880,diesel:1580,commission:1176,advances:0,expenses:230,status:"received"},
  {id:8,date:"2026-09-21",truck:"SCANIA R450",plate:"QXZ-9A71",driver:"Micharle José",route:"Vitória → Belo Horizonte",gross:8330,diesel:2750,commission:1666,advances:500,expenses:420,status:"received"},
  {id:9,date:"2026-09-18",truck:"AXOR 2544",plate:"RTK-2H18",driver:"Luis Antônio",route:"Sportos Eco → Fertipar",gross:6410,diesel:1685,commission:1282,advances:250,expenses:90,status:"received"},
  {id:10,date:"2026-09-15",truck:"VOLVO FH 460",plate:"RKU-8J44",driver:"Klebersom Dutra",route:"Aimorés → Vitória",gross:6120,diesel:1760,commission:1224,advances:400,expenses:310,status:"received"},
  {id:11,date:"2026-09-12",truck:"SCANIA R450",plate:"QXZ-9A71",driver:"Micharle José",route:"Aimorés → Governador Valadares",gross:4920,diesel:1880,commission:984,advances:300,expenses:420,status:"received"},
  {id:12,date:"2026-09-09",truck:"AXOR 2544",plate:"RTK-2H18",driver:"Luis Antônio",route:"Sportos Eco → Fertipar",gross:6620,diesel:1700,commission:1324,advances:0,expenses:115,status:"received"},
  {id:13,date:"2026-09-05",truck:"VOLVO FH 460",plate:"RKU-8J44",driver:"Klebersom Dutra",route:"Aimorés → Vitória",gross:5740,diesel:1610,commission:1148,advances:250,expenses:205,status:"pending"},
  {id:14,date:"2026-09-03",truck:"SCANIA R450",plate:"QXZ-9A71",driver:"Micharle José",route:"Vitória → Belo Horizonte",gross:8190,diesel:2790,commission:1638,advances:0,expenses:390,status:"received"},
  {id:15,date:"2026-08-28",truck:"AXOR 2544",plate:"RTK-2H18",driver:"Luis Antônio",route:"Sportos Eco → Fertipar",gross:6120,diesel:1650,commission:1224,advances:300,expenses:130,status:"received"},
  {id:16,date:"2026-08-25",truck:"VOLVO FH 460",plate:"RKU-8J44",driver:"Klebersom Dutra",route:"Aimorés → Vitória",gross:5580,diesel:1570,commission:1116,advances:0,expenses:190,status:"received"},
  {id:17,date:"2026-08-21",truck:"SCANIA R450",plate:"QXZ-9A71",driver:"Micharle José",route:"Vitória → Belo Horizonte",gross:7860,diesel:2660,commission:1572,advances:450,expenses:360,status:"received"},
  {id:18,date:"2026-08-18",truck:"AXOR 2544",plate:"RTK-2H18",driver:"Luis Antônio",route:"Sportos Eco → Fertipar",gross:6250,diesel:1680,commission:1250,advances:0,expenses:100,status:"received"},
  {id:19,date:"2026-08-15",truck:"VOLVO FH 460",plate:"RKU-8J44",driver:"Klebersom Dutra",route:"Aimorés → Vitória",gross:5690,diesel:1620,commission:1138,advances:350,expenses:240,status:"received"},
  {id:20,date:"2026-08-10",truck:"SCANIA R450",plate:"QXZ-9A71",driver:"Micharle José",route:"Aimorés → Governador Valadares",gross:4750,diesel:1810,commission:950,advances:250,expenses:410,status:"received"},
  {id:21,date:"2026-08-07",truck:"AXOR 2544",plate:"RTK-2H18",driver:"Luis Antônio",route:"Sportos Eco → Fertipar",gross:6040,diesel:1600,commission:1208,advances:200,expenses:125,status:"received"},
  {id:22,date:"2026-08-03",truck:"VOLVO FH 460",plate:"RKU-8J44",driver:"Klebersom Dutra",route:"Aimorés → Vitória",gross:5520,diesel:1565,commission:1104,advances:0,expenses:185,status:"received"}
];

function n(v){ return Number(v)||0 }
function cost(t){ return n(t.diesel)+n(t.commission)+n(t.advances)+n(t.expenses) }
function net(t){ return n(t.gross)-cost(t) }
function sum(arr, key){ return arr.reduce((a,x)=>a+(typeof key==="function"?key(x):n(x[key])),0) }
function isoDate(d){ return d.toISOString().slice(0,10) }
function monthKey(s){ return String(s).slice(0,7) }

function summarize(list){
  return {
    gross:sum(list,"gross"),
    diesel:sum(list,"diesel"),
    commission:sum(list,"commission"),
    advances:sum(list,"advances"),
    expenses:sum(list,"expenses"),
    cost:sum(list,cost),
    net:sum(list,net),
    count:list.length,
    received:sum(list.filter(x=>x.status==="received"),"gross"),
    pending:sum(list.filter(x=>x.status==="pending"),"gross")
  }
}

function group(list,key){
  const m=new Map();
  for(const row of list){
    const k=row[key];
    if(!m.has(k))m.set(k,[]);
    m.get(k).push(row);
  }
  return [...m.entries()].map(([name,rows])=>{
    const s=summarize(rows);
    return {name,...s,margin:s.gross?100*s.net/s.gross:0,costRate:s.gross?100*s.cost/s.gross:0};
  }).sort((a,b)=>b.gross-a.gross);
}

function metrics(target=120000,reservePct=40,truckPrice=650000){
  const today="2026-09-27";
  const month="2026-09";
  const prev="2026-08";
  const weekStart="2026-09-21";
  const monthTrips=trips.filter(x=>monthKey(x.date)===month);
  const prevTrips=trips.filter(x=>monthKey(x.date)===prev);
  const dayTrips=trips.filter(x=>x.date===today);
  const weekTrips=trips.filter(x=>x.date>=weekStart && x.date<=today);
  const ms=summarize(monthTrips);
  const ps=summarize(prevTrips);
  const trucks=group(monthTrips,"truck");
  const drivers=group(monthTrips,"driver");
  const routes=group(monthTrips,"route");
  const fleetCostRate=ms.gross?100*ms.cost/ms.gross:0;
  const alerts=[];
  for(const r of routes){
    if(r.margin<18)alerts.push({level:"high",title:"Rota com margem baixa",detail:r.name+" está com margem líquida de "+r.margin.toFixed(1)+"%."});
  }
  for(const t of trucks){
    if(t.costRate>fleetCostRate+6)alerts.push({level:"medium",title:"Carreta com custo acima da média",detail:t.name+" está com custo de "+t.costRate.toFixed(1)+"% do faturamento, acima da média da frota ("+fleetCostRate.toFixed(1)+"%)."});
  }
  for(const d of drivers){
    if(d.costRate>fleetCostRate+6)alerts.push({level:"medium",title:"Motorista com custo fora do padrão",detail:d.name+" está com custo de "+d.costRate.toFixed(1)+"% do faturamento no mês."});
  }
  const dieselRate=ms.gross?100*ms.diesel/ms.gross:0;
  if(dieselRate>30)alerts.push({level:"high",title:"Diesel pressionando margem",detail:"Diesel representa "+dieselRate.toFixed(1)+"% do faturamento mensal."});
  if(!alerts.length)alerts.push({level:"ok",title:"Custos dentro do padrão",detail:"Nenhum desvio relevante foi encontrado no mês."});
  const comparison = ps.gross ? ((ms.gross-ps.gross)/ps.gross)*100 : 0;
  const reserve = Math.max(0,ms.net*(reservePct/100));
  const monthsToTruck = reserve>0 ? truckPrice/reserve : null;
  return {
    demo:true,
    asOf:today,
    day:summarize(dayTrips),
    week:summarize(weekTrips),
    month:ms,
    previousMonth:ps,
    comparison,
    target,
    remaining:Math.max(0,target-ms.gross),
    targetPct:target?Math.min(100,100*ms.gross/target):0,
    reservePct,
    reserve,
    truckPrice,
    monthsToTruck,
    fleetCostRate,
    trucks,drivers,routes,alerts,
    receivables:{
      received:ms.received,
      pending:ms.pending,
      total:ms.received+ms.pending
    }
  }
}

function json(res,obj,status=200){
  const body=JSON.stringify(obj);
  res.writeHead(status,{"content-type":"application/json; charset=utf-8","cache-control":"no-store","access-control-allow-origin":"*"});
  res.end(body);
}

const html = String.raw`<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Trans Salomão • Inteligência Financeira</title>
<style>
:root{--bg:#07111f;--panel:#0d1b2a;--panel2:#10243a;--line:#1c3a57;--text:#f3f7fb;--muted:#91a8bd;--blue:#2f86ff;--green:#36d399;--amber:#ffbf47;--red:#ff667a;--shadow:0 20px 50px rgba(0,0,0,.25);font-family:Inter,ui-sans-serif,system-ui,-apple-system,Segoe UI,sans-serif}
*{box-sizing:border-box}body{margin:0;background:radial-gradient(circle at 20% -10%,#16395f 0,transparent 34%),var(--bg);color:var(--text)}
header{position:sticky;top:0;z-index:20;backdrop-filter:blur(14px);background:rgba(7,17,31,.82);border-bottom:1px solid rgba(255,255,255,.06)}
.wrap{max-width:1450px;margin:auto;padding:0 22px}.head{min-height:76px;display:flex;align-items:center;justify-content:space-between;gap:16px}.brand{display:flex;align-items:center;gap:12px}.logo{width:42px;height:42px;border-radius:13px;display:grid;place-items:center;background:linear-gradient(145deg,#2f86ff,#0d54b6);font-weight:900}.brand b{font-size:17px}.brand small,.muted{color:var(--muted)}
.badge{padding:9px 12px;border-radius:999px;background:rgba(255,191,71,.12);border:1px solid rgba(255,191,71,.25);font-size:12px;color:#ffd98b;font-weight:800}
main{padding:28px 0 54px}.hero{display:flex;align-items:end;justify-content:space-between;gap:20px;margin-bottom:20px}.hero h1{font-size:clamp(28px,4vw,48px);margin:0 0 8px;letter-spacing:-1.5px}.hero p{margin:0;color:var(--muted)}
.controls{display:flex;gap:10px;flex-wrap:wrap}.control{background:var(--panel);border:1px solid var(--line);border-radius:14px;padding:10px 12px;display:flex;gap:8px;align-items:center}.control label{font-size:11px;color:var(--muted);font-weight:800;text-transform:uppercase}.control input{width:110px;background:transparent;border:0;color:var(--text);font-weight:800;outline:none}
.grid{display:grid;gap:14px}.kpis{grid-template-columns:repeat(6,minmax(0,1fr))}.card{background:linear-gradient(180deg,rgba(16,36,58,.96),rgba(11,26,42,.96));border:1px solid rgba(255,255,255,.07);border-radius:20px;box-shadow:var(--shadow);padding:18px}
.kpi small{display:block;color:var(--muted);font-weight:700;margin-bottom:9px}.kpi strong{font-size:clamp(20px,2.2vw,31px);letter-spacing:-.7px}.kpi span{display:block;margin-top:8px;font-size:12px;color:var(--muted)}.good{color:var(--green)!important}.bad{color:var(--red)!important}.warn{color:var(--amber)!important}
.section{margin-top:16px}.section h2{font-size:17px;margin:0 0 14px}.split{grid-template-columns:1.1fr .9fr}.triple{grid-template-columns:repeat(3,minmax(0,1fr))}
.progress{height:12px;border-radius:999px;background:#08131e;overflow:hidden;border:1px solid rgba(255,255,255,.05)}.progress>i{display:block;height:100%;background:linear-gradient(90deg,#2f86ff,#36d399);width:0;transition:.5s}
.meta{display:flex;justify-content:space-between;gap:20px;margin-top:12px}.meta strong{font-size:25px}.meta small{color:var(--muted)}
table{width:100%;border-collapse:collapse;font-size:13px}th{text-align:left;color:#90a9bf;font-size:11px;text-transform:uppercase;letter-spacing:.04em;padding:0 10px 10px}td{padding:12px 10px;border-top:1px solid rgba(255,255,255,.06);vertical-align:middle}.num{text-align:right;font-variant-numeric:tabular-nums}.pill{display:inline-flex;padding:5px 8px;border-radius:999px;font-size:11px;font-weight:800;background:rgba(54,211,153,.1);color:#7fe8c0}.pill.low{background:rgba(255,102,122,.12);color:#ff91a0}.pill.mid{background:rgba(255,191,71,.12);color:#ffd27d}
.alerts{display:grid;gap:10px}.alert{display:grid;grid-template-columns:12px 1fr;gap:12px;padding:13px;border:1px solid rgba(255,255,255,.07);border-radius:14px;background:#0a1725}.dot{width:10px;height:10px;border-radius:50%;margin-top:5px;background:var(--green)}.dot.high{background:var(--red)}.dot.medium{background:var(--amber)}.alert b{font-size:13px}.alert p{margin:4px 0 0;color:var(--muted);font-size:12px;line-height:1.45}
.barrow{display:grid;grid-template-columns:145px 1fr 115px;gap:10px;align-items:center;margin:12px 0}.bar{height:10px;background:#08131e;border-radius:999px;overflow:hidden}.bar i{display:block;height:100%;background:linear-gradient(90deg,#2f86ff,#36d399)}.barrow small{color:var(--muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.footer-note{margin-top:14px;color:var(--muted);font-size:12px;line-height:1.5}
@media(max-width:1150px){.kpis{grid-template-columns:repeat(3,1fr)}.split,.triple{grid-template-columns:1fr 1fr}.triple>.card:last-child{grid-column:1/-1}}
@media(max-width:720px){.wrap{padding:0 14px}.head{align-items:flex-start;padding:14px 0}.badge{max-width:170px;text-align:center}.hero{align-items:flex-start;flex-direction:column}.controls{width:100%}.control{flex:1;min-width:145px}.kpis,.split,.triple{grid-template-columns:1fr}.triple>.card:last-child{grid-column:auto}.card{padding:15px;overflow:auto}.meta{flex-direction:column}.barrow{grid-template-columns:105px 1fr 90px}table{min-width:680px}}
</style>
</head>
<body>
<header><div class="wrap head"><div class="brand"><div class="logo">TS</div><div><b>Trans Salomão</b><small style="display:block">Inteligência Financeira</small></div></div><div class="badge">AMBIENTE DE TESTE • DADOS DEMONSTRATIVOS</div></div></header>
<main class="wrap">
<section class="hero"><div><h1>Painel de resultado real da frota</h1><p>Faturamento, lucro, custo, rotas, recebimentos, metas e alertas em uma única visão.</p></div><div class="controls"><div class="control"><label>Meta mensal</label><input id="target" type="number" value="120000"/></div><div class="control"><label>Guardar</label><input id="reservePct" type="number" min="0" max="100" value="40"/><span>%</span></div><div class="control"><label>Nova carreta</label><input id="truckPrice" type="number" value="650000"/></div></div></section>

<section class="grid kpis">
<div class="card kpi"><small>Faturamento hoje</small><strong id="dayGross">—</strong><span id="dayNet">—</span></div>
<div class="card kpi"><small>Faturamento semana</small><strong id="weekGross">—</strong><span id="weekNet">—</span></div>
<div class="card kpi"><small>Faturamento mês</small><strong id="monthGross">—</strong><span id="monthCount">—</span></div>
<div class="card kpi"><small>Lucro líquido real</small><strong id="monthNet">—</strong><span id="netMargin">—</span></div>
<div class="card kpi"><small>Diesel no mês</small><strong id="diesel">—</strong><span id="dieselPct">—</span></div>
<div class="card kpi"><small>Comparação mês anterior</small><strong id="comparison">—</strong><span id="previousGross">—</span></div>
</section>

<section class="section grid split">
<div class="card"><h2>Meta mensal</h2><div class="progress"><i id="targetBar"></i></div><div class="meta"><div><small>Já faturado</small><strong id="targetGross">—</strong></div><div><small>Falta faturar</small><strong id="remaining">—</strong></div><div><small>Meta atingida</small><strong id="targetPct">—</strong></div></div></div>
<div class="card"><h2>Reserva para comprar outra carreta</h2><div class="meta"><div><small>Valor guardável no mês</small><strong class="good" id="reserve">—</strong></div><div><small>Preço-alvo</small><strong id="truckPriceOut">—</strong></div></div><p class="footer-note" id="monthsToTruck">—</p></div>
</section>

<section class="section grid triple">
<div class="card"><h2>Recebimentos</h2><div class="meta"><div><small>Já recebido</small><strong class="good" id="received">—</strong></div><div><small>A receber</small><strong class="warn" id="pending">—</strong></div></div><p class="footer-note">Considera os fretes demonstrativos classificados como recebidos ou pendentes.</p></div>
<div class="card"><h2>Estrutura de custos</h2><div id="costBars"></div></div>
<div class="card"><h2>Alertas automáticos</h2><div class="alerts" id="alerts"></div></div>
</section>

<section class="section card"><h2>Resultado por carreta</h2><table><thead><tr><th>Carreta</th><th class="num">Produziu</th><th class="num">Custou</th><th class="num">Lucro</th><th class="num">Margem</th><th class="num">Diesel</th></tr></thead><tbody id="trucks"></tbody></table></section>
<section class="section card"><h2>Resultado por motorista</h2><table><thead><tr><th>Motorista</th><th class="num">Faturamento</th><th class="num">Custo total</th><th class="num">Lucro</th><th class="num">Diesel</th><th class="num">Margem</th></tr></thead><tbody id="drivers"></tbody></table></section>

<section class="section grid split">
<div class="card"><h2>Rotas mais e menos lucrativas</h2><table><thead><tr><th>Rota</th><th class="num">Faturamento</th><th class="num">Lucro</th><th class="num">Margem</th></tr></thead><tbody id="routes"></tbody></table></div>
<div class="card"><h2>Faturamento por carreta</h2><div id="truckBars"></div><p class="footer-note">As barras mostram participação de cada carreta no faturamento do mês.</p></div>
</section>
</main>
<script>
const brl=v=>new Intl.NumberFormat("pt-BR",{style:"currency",currency:"BRL",maximumFractionDigits:2}).format(v||0);
const pct=v=>(Number(v)||0).toFixed(1).replace(".",",")+"%";
const esc=s=>String(s).replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;","\\"":"&quot;","'":"&#39;"}[m]));
async function load(){
  const target=Number(localStorage.getItem("tsTarget")||document.querySelector("#target").value);
  const reservePct=Number(localStorage.getItem("tsReserve")||document.querySelector("#reservePct").value);
  const truckPrice=Number(localStorage.getItem("tsTruckPrice")||document.querySelector("#truckPrice").value);
  target&& (document.querySelector("#target").value=target);
  document.querySelector("#reservePct").value=reservePct;
  document.querySelector("#truckPrice").value=truckPrice;
  const d=await fetch("/api/metrics?target="+encodeURIComponent(target)+"&reservePct="+encodeURIComponent(reservePct)+"&truckPrice="+encodeURIComponent(truckPrice),{cache:"no-store"}).then(r=>r.json());
  document.querySelector("#dayGross").textContent=brl(d.day.gross);
  document.querySelector("#dayNet").textContent="Líquido "+brl(d.day.net);
  document.querySelector("#weekGross").textContent=brl(d.week.gross);
  document.querySelector("#weekNet").textContent="Líquido "+brl(d.week.net);
  document.querySelector("#monthGross").textContent=brl(d.month.gross);
  document.querySelector("#monthCount").textContent=d.month.count+" viagens";
  document.querySelector("#monthNet").textContent=brl(d.month.net);
  document.querySelector("#netMargin").textContent="Margem "+pct(d.month.gross?100*d.month.net/d.month.gross:0);
  document.querySelector("#diesel").textContent=brl(d.month.diesel);
  document.querySelector("#dieselPct").textContent=pct(d.month.gross?100*d.month.diesel/d.month.gross:0)+" do faturamento";
  const cmp=document.querySelector("#comparison"); cmp.textContent=(d.comparison>=0?"+":"")+pct(d.comparison); cmp.className=d.comparison>=0?"good":"bad";
  document.querySelector("#previousGross").textContent="Agosto: "+brl(d.previousMonth.gross);
  document.querySelector("#targetGross").textContent=brl(d.month.gross);
  document.querySelector("#remaining").textContent=brl(d.remaining);
  document.querySelector("#targetPct").textContent=pct(d.targetPct);
  document.querySelector("#targetBar").style.width=d.targetPct+"%";
  document.querySelector("#reserve").textContent=brl(d.reserve);
  document.querySelector("#truckPriceOut").textContent=brl(d.truckPrice);
  document.querySelector("#monthsToTruck").textContent=d.monthsToTruck?("Mantendo esse lucro e guardando "+d.reservePct+"%, a referência seria cerca de "+d.monthsToTruck.toFixed(1).replace(".",",")+" meses para formar "+brl(d.truckPrice)+"."):"Sem lucro positivo não há projeção de reserva.";
  document.querySelector("#received").textContent=brl(d.receivables.received);
  document.querySelector("#pending").textContent=brl(d.receivables.pending);

  const maxTruck=Math.max(...d.trucks.map(x=>x.gross),1);
  document.querySelector("#truckBars").innerHTML=d.trucks.map(x=>'<div class="barrow"><small>'+esc(x.name)+'</small><div class="bar"><i style="width:'+Math.round(100*x.gross/maxTruck)+'%"></i></div><b class="num">'+brl(x.gross)+'</b></div>').join("");
  const costs=[["Diesel",d.month.diesel],["Comissões",d.month.commission],["Adiantamentos",d.month.advances],["Despesas",d.month.expenses]];
  const maxCost=Math.max(...costs.map(x=>x[1]),1);
  document.querySelector("#costBars").innerHTML=costs.map(x=>'<div class="barrow"><small>'+x[0]+'</small><div class="bar"><i style="width:'+Math.round(100*x[1]/maxCost)+'%"></i></div><b class="num">'+brl(x[1])+'</b></div>').join("");

  document.querySelector("#alerts").innerHTML=d.alerts.map(a=>'<div class="alert"><i class="dot '+a.level+'"></i><div><b>'+esc(a.title)+'</b><p>'+esc(a.detail)+'</p></div></div>').join("");
  document.querySelector("#trucks").innerHTML=d.trucks.map(x=>'<tr><td><b>'+esc(x.name)+'</b></td><td class="num">'+brl(x.gross)+'</td><td class="num">'+brl(x.cost)+'</td><td class="num '+(x.net>=0?"good":"bad")+'"><b>'+brl(x.net)+'</b></td><td class="num"><span class="pill '+(x.margin<18?"low":x.margin<25?"mid":"")+'">'+pct(x.margin)+'</span></td><td class="num">'+brl(x.diesel)+'</td></tr>').join("");
  document.querySelector("#drivers").innerHTML=d.drivers.map(x=>'<tr><td><b>'+esc(x.name)+'</b></td><td class="num">'+brl(x.gross)+'</td><td class="num">'+brl(x.cost)+'</td><td class="num '+(x.net>=0?"good":"bad")+'"><b>'+brl(x.net)+'</b></td><td class="num">'+brl(x.diesel)+'</td><td class="num"><span class="pill '+(x.margin<18?"low":x.margin<25?"mid":"")+'">'+pct(x.margin)+'</span></td></tr>').join("");
  document.querySelector("#routes").innerHTML=d.routes.map(x=>'<tr><td><b>'+esc(x.name)+'</b></td><td class="num">'+brl(x.gross)+'</td><td class="num '+(x.net>=0?"good":"bad")+'">'+brl(x.net)+'</td><td class="num"><span class="pill '+(x.margin<18?"low":x.margin<25?"mid":"")+'">'+pct(x.margin)+'</span></td></tr>').join("");
}
["target","reservePct","truckPrice"].forEach(id=>document.querySelector("#"+id).addEventListener("change",()=>{
 const map={target:"tsTarget",reservePct:"tsReserve",truckPrice:"tsTruckPrice"}; localStorage.setItem(map[id],document.querySelector("#"+id).value); load();
}));
load().catch(e=>{document.body.insertAdjacentHTML("beforeend","<p style='padding:20px;color:#ff667a'>Falha ao carregar painel: "+esc(e.message)+"</p>")});
</script>
</body></html>`;

const server=http.createServer((req,res)=>{
  const url=new URL(req.url,"http://localhost");
  if(url.pathname==="/api/metrics"){
    const target=Math.max(0,n(url.searchParams.get("target"))||120000);
    const reservePct=Math.max(0,Math.min(100,n(url.searchParams.get("reservePct"))||40));
    const truckPrice=Math.max(0,n(url.searchParams.get("truckPrice"))||650000);
    return json(res,metrics(target,reservePct,truckPrice));
  }
  if(url.pathname==="/health"){
    res.writeHead(200,{"content-type":"text/plain"}); return res.end("ok");
  }
  res.writeHead(200,{"content-type":"text/html; charset=utf-8","cache-control":"no-store","x-content-type-options":"nosniff","x-frame-options":"DENY"});
  res.end(html);
});

server.listen(PORT,"0.0.0.0",()=>console.log("Trans Salomao finance test running on "+PORT));