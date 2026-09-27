import type { Sql } from "@/lib/db";

export type TicketVariableMemory = {
  ticket_id: number | string;
  numero_ticket: string | null;
  report_id: string | null;
  trip_id: string | null;
  driver_id: string | null;
  fleet_id: string | null;
  tractor_plate: string | null;
  trailer_plate: string | null;
  model_type: string | null;
  company: string | null;
  company_cnpj: string | null;
  transportadora: string | null;
  transportadora_cnpj: string | null;
  destinatario: string | null;
  destinatario_cnpj: string | null;
  product: string | null;
  route_group: string | null;
  origin: string | null;
  destination: string | null;
  freight_mode: string | null;
  price_per_ton: number | string | null;
  price_per_trip: number | string | null;
  ticket_pattern: string | null;
  variables: Record<string, unknown> | null;
};

export type TicketVariableMatch = {
  memory: TicketVariableMemory;
  score: number;
  confidence: number;
  reasons: string[];
  support: number;
};

export async function syncTicketVariableMemory(sql: Sql, reportId?: string | null) {
  await ensureTable(sql);

  const sync = async (onlyReport?: string | null) => {
    if (onlyReport) {
      await sql`
        insert into ticket_variable_memory(
          ticket_id,numero_ticket,report_id,trip_id,driver_id,fleet_id,tractor_plate,trailer_plate,
          model_type,company,company_cnpj,transportadora,transportadora_cnpj,destinatario,destinatario_cnpj,
          product,route_group,origin,destination,freight_mode,price_per_ton,price_per_trip,ticket_pattern,variables,updated_at
        )
        select
          tb.id,tb.numero_ticket,tb.report_id,coalesce(tb.viagem_id,r.trip_id),tb.driver_id,tb.fleet_id,
          tb.placa_veiculo,tb.placa_carreta,
          nullif(tb.ticket_data->>'model_type',''),
          coalesce(nullif(tb.ticket_data->>'contratante',''),nullif(tb.ticket_data->>'cliente',''),nullif(tb.ticket_data->>'empresa_documento',''),nullif(t.client,'')),
          nullif(tb.ticket_data->>'empresa_cnpj',''),
          coalesce(nullif(tb.transportadora,''),nullif(tb.ticket_data->>'transportadora','')),
          nullif(tb.ticket_data->>'transportadora_cnpj',''),
          coalesce(nullif(tb.destinatario,''),nullif(tb.ticket_data->>'destinatario','')),
          nullif(tb.ticket_data->>'destinatario_cnpj',''),
          coalesce(nullif(tb.produto,''),nullif(tb.ticket_data->>'produto','')),
          coalesce(nullif(tb.ticket_data->>'route_group',''),nullif(concat_ws(' -> ',nullif(t.origin,''),nullif(t.destination,'')),' -> ')),
          coalesce(nullif(tb.ticket_data->>'route_origin',''),nullif(tb.ticket_data->>'navio_origem',''),nullif(tb.ticket_data->>'remetente',''),nullif(t.origin,'')),
          coalesce(nullif(tb.ticket_data->>'route_destination',''),nullif(tb.ticket_data->>'navio_destino',''),nullif(tb.ticket_data->>'destinatario',''),nullif(t.destination,'')),
          coalesce(nullif(t.freight_mode,''),nullif(tb.freight_mode,''),nullif(r.freight_mode,''),nullif(tb.ticket_data->>'inferred_freight_mode','')),
          coalesce(
            nullif(t.price_per_ton,0),
            case when (tb.ticket_data->>'price_per_ton') ~ '^[0-9]+([.][0-9]+)?$' then nullif((tb.ticket_data->>'price_per_ton')::numeric,0) end,
            case when (tb.ticket_data->>'route_price_per_ton') ~ '^[0-9]+([.][0-9]+)?$' then nullif((tb.ticket_data->>'route_price_per_ton')::numeric,0) end,
            case when coalesce(t.freight_mode,tb.freight_mode,r.freight_mode,tb.ticket_data->>'inferred_freight_mode')='ton'
              and (tb.ticket_data->>'inferred_price') ~ '^[0-9]+([.][0-9]+)?$'
              then nullif((tb.ticket_data->>'inferred_price')::numeric,0) end
          ),
          coalesce(
            nullif(t.price_per_trip,0),nullif(r.daily_value,0),
            case when coalesce(t.freight_mode,tb.freight_mode,r.freight_mode,tb.ticket_data->>'inferred_freight_mode')<>'ton'
              and (tb.ticket_data->>'inferred_price') ~ '^[0-9]+([.][0-9]+)?$'
              then nullif((tb.ticket_data->>'inferred_price')::numeric,0) end
          ),
          regexp_replace(upper(coalesce(tb.numero_ticket,'')),'[0-9]+','#','g'),
          jsonb_strip_nulls(jsonb_build_object(
            'operadora',tb.ticket_data->>'operadora',
            'contratante',tb.ticket_data->>'contratante',
            'cliente',tb.ticket_data->>'cliente',
            'empresa_documento',tb.ticket_data->>'empresa_documento',
            'remetente',tb.ticket_data->>'remetente',
            'navio',tb.ticket_data->>'navio',
            'navio_origem',tb.ticket_data->>'navio_origem',
            'navio_destino',tb.ticket_data->>'navio_destino',
            'emissor',tb.ticket_data->>'emissor',
            'operador_pesagem',tb.ticket_data->>'operador_pesagem',
            'route_group',tb.ticket_data->>'route_group',
            'route_origin',tb.ticket_data->>'route_origin',
            'route_destination',tb.ticket_data->>'route_destination',
            'inferred_price_basis',tb.ticket_data->>'inferred_price_basis'
          )),
          now()
        from tickets_balanca tb
        left join reports r on r.id=tb.report_id
        left join trips t on t.id=coalesce(tb.viagem_id,r.trip_id)
        where tb.report_id=${onlyReport}
        on conflict(ticket_id) do update set
          numero_ticket=excluded.numero_ticket,report_id=excluded.report_id,trip_id=excluded.trip_id,
          driver_id=excluded.driver_id,fleet_id=excluded.fleet_id,tractor_plate=excluded.tractor_plate,trailer_plate=excluded.trailer_plate,
          model_type=coalesce(excluded.model_type,ticket_variable_memory.model_type),
          company=coalesce(excluded.company,ticket_variable_memory.company),
          company_cnpj=coalesce(excluded.company_cnpj,ticket_variable_memory.company_cnpj),
          transportadora=coalesce(excluded.transportadora,ticket_variable_memory.transportadora),
          transportadora_cnpj=coalesce(excluded.transportadora_cnpj,ticket_variable_memory.transportadora_cnpj),
          destinatario=coalesce(excluded.destinatario,ticket_variable_memory.destinatario),
          destinatario_cnpj=coalesce(excluded.destinatario_cnpj,ticket_variable_memory.destinatario_cnpj),
          product=coalesce(excluded.product,ticket_variable_memory.product),
          route_group=coalesce(excluded.route_group,ticket_variable_memory.route_group),
          origin=coalesce(excluded.origin,ticket_variable_memory.origin),
          destination=coalesce(excluded.destination,ticket_variable_memory.destination),
          freight_mode=coalesce(excluded.freight_mode,ticket_variable_memory.freight_mode),
          price_per_ton=coalesce(excluded.price_per_ton,ticket_variable_memory.price_per_ton),
          price_per_trip=coalesce(excluded.price_per_trip,ticket_variable_memory.price_per_trip),
          ticket_pattern=coalesce(excluded.ticket_pattern,ticket_variable_memory.ticket_pattern),
          variables=coalesce(ticket_variable_memory.variables,'{}'::jsonb)||coalesce(excluded.variables,'{}'::jsonb),
          updated_at=now()
      `;
      return;
    }

    await sql`
      insert into ticket_variable_memory(
        ticket_id,numero_ticket,report_id,trip_id,driver_id,fleet_id,tractor_plate,trailer_plate,
        model_type,company,company_cnpj,transportadora,transportadora_cnpj,destinatario,destinatario_cnpj,
        product,route_group,origin,destination,freight_mode,price_per_ton,price_per_trip,ticket_pattern,variables,updated_at
      )
      select
        tb.id,tb.numero_ticket,tb.report_id,coalesce(tb.viagem_id,r.trip_id),tb.driver_id,tb.fleet_id,
        tb.placa_veiculo,tb.placa_carreta,
        nullif(tb.ticket_data->>'model_type',''),
        coalesce(nullif(tb.ticket_data->>'contratante',''),nullif(tb.ticket_data->>'cliente',''),nullif(tb.ticket_data->>'empresa_documento',''),nullif(t.client,'')),
        nullif(tb.ticket_data->>'empresa_cnpj',''),
        coalesce(nullif(tb.transportadora,''),nullif(tb.ticket_data->>'transportadora','')),
        nullif(tb.ticket_data->>'transportadora_cnpj',''),
        coalesce(nullif(tb.destinatario,''),nullif(tb.ticket_data->>'destinatario','')),
        nullif(tb.ticket_data->>'destinatario_cnpj',''),
        coalesce(nullif(tb.produto,''),nullif(tb.ticket_data->>'produto','')),
        coalesce(nullif(tb.ticket_data->>'route_group',''),nullif(concat_ws(' -> ',nullif(t.origin,''),nullif(t.destination,'')),' -> ')),
        coalesce(nullif(tb.ticket_data->>'route_origin',''),nullif(tb.ticket_data->>'navio_origem',''),nullif(tb.ticket_data->>'remetente',''),nullif(t.origin,'')),
        coalesce(nullif(tb.ticket_data->>'route_destination',''),nullif(tb.ticket_data->>'navio_destino',''),nullif(tb.ticket_data->>'destinatario',''),nullif(t.destination,'')),
        coalesce(nullif(t.freight_mode,''),nullif(tb.freight_mode,''),nullif(r.freight_mode,''),nullif(tb.ticket_data->>'inferred_freight_mode','')),
        coalesce(
          nullif(t.price_per_ton,0),
          case when (tb.ticket_data->>'price_per_ton') ~ '^[0-9]+([.][0-9]+)?$' then nullif((tb.ticket_data->>'price_per_ton')::numeric,0) end,
          case when (tb.ticket_data->>'route_price_per_ton') ~ '^[0-9]+([.][0-9]+)?$' then nullif((tb.ticket_data->>'route_price_per_ton')::numeric,0) end,
          case when coalesce(t.freight_mode,tb.freight_mode,r.freight_mode,tb.ticket_data->>'inferred_freight_mode')='ton'
            and (tb.ticket_data->>'inferred_price') ~ '^[0-9]+([.][0-9]+)?$'
            then nullif((tb.ticket_data->>'inferred_price')::numeric,0) end
        ),
        coalesce(
          nullif(t.price_per_trip,0),nullif(r.daily_value,0),
          case when coalesce(t.freight_mode,tb.freight_mode,r.freight_mode,tb.ticket_data->>'inferred_freight_mode')<>'ton'
            and (tb.ticket_data->>'inferred_price') ~ '^[0-9]+([.][0-9]+)?$'
            then nullif((tb.ticket_data->>'inferred_price')::numeric,0) end
        ),
        regexp_replace(upper(coalesce(tb.numero_ticket,'')),'[0-9]+','#','g'),
        jsonb_strip_nulls(jsonb_build_object(
          'operadora',tb.ticket_data->>'operadora',
          'contratante',tb.ticket_data->>'contratante',
          'cliente',tb.ticket_data->>'cliente',
          'empresa_documento',tb.ticket_data->>'empresa_documento',
          'remetente',tb.ticket_data->>'remetente',
          'navio',tb.ticket_data->>'navio',
          'navio_origem',tb.ticket_data->>'navio_origem',
          'navio_destino',tb.ticket_data->>'navio_destino',
          'emissor',tb.ticket_data->>'emissor',
          'operador_pesagem',tb.ticket_data->>'operador_pesagem',
          'route_group',tb.ticket_data->>'route_group',
          'route_origin',tb.ticket_data->>'route_origin',
          'route_destination',tb.ticket_data->>'route_destination',
          'inferred_price_basis',tb.ticket_data->>'inferred_price_basis'
        )),
        now()
      from (
        select * from tickets_balanca order by id desc limit 2000
      ) tb
      left join reports r on r.id=tb.report_id
      left join trips t on t.id=coalesce(tb.viagem_id,r.trip_id)
      on conflict(ticket_id) do update set
        numero_ticket=excluded.numero_ticket,report_id=excluded.report_id,trip_id=excluded.trip_id,
        driver_id=excluded.driver_id,fleet_id=excluded.fleet_id,tractor_plate=excluded.tractor_plate,trailer_plate=excluded.trailer_plate,
        model_type=coalesce(excluded.model_type,ticket_variable_memory.model_type),
        company=coalesce(excluded.company,ticket_variable_memory.company),
        company_cnpj=coalesce(excluded.company_cnpj,ticket_variable_memory.company_cnpj),
        transportadora=coalesce(excluded.transportadora,ticket_variable_memory.transportadora),
        transportadora_cnpj=coalesce(excluded.transportadora_cnpj,ticket_variable_memory.transportadora_cnpj),
        destinatario=coalesce(excluded.destinatario,ticket_variable_memory.destinatario),
        destinatario_cnpj=coalesce(excluded.destinatario_cnpj,ticket_variable_memory.destinatario_cnpj),
        product=coalesce(excluded.product,ticket_variable_memory.product),
        route_group=coalesce(excluded.route_group,ticket_variable_memory.route_group),
        origin=coalesce(excluded.origin,ticket_variable_memory.origin),
        destination=coalesce(excluded.destination,ticket_variable_memory.destination),
        freight_mode=coalesce(excluded.freight_mode,ticket_variable_memory.freight_mode),
        price_per_ton=coalesce(excluded.price_per_ton,ticket_variable_memory.price_per_ton),
        price_per_trip=coalesce(excluded.price_per_trip,ticket_variable_memory.price_per_trip),
        ticket_pattern=coalesce(excluded.ticket_pattern,ticket_variable_memory.ticket_pattern),
        variables=coalesce(ticket_variable_memory.variables,'{}'::jsonb)||coalesce(excluded.variables,'{}'::jsonb),
        updated_at=now()
    `;
  };

  await sync(reportId || null);
}

export async function loadTicketVariableMemories(sql: Sql) {
  await ensureTable(sql);
  return await sql<TicketVariableMemory>`
    select ticket_id,numero_ticket,report_id,trip_id,driver_id,fleet_id,tractor_plate,trailer_plate,
           model_type,company,company_cnpj,transportadora,transportadora_cnpj,destinatario,destinatario_cnpj,
           product,route_group,origin,destination,freight_mode,price_per_ton,price_per_trip,ticket_pattern,variables
    from ticket_variable_memory
    where
      model_type is not null or company is not null or transportadora is not null or product is not null or
      route_group is not null or origin is not null or destination is not null or freight_mode is not null
    order by updated_at desc
    limit 300
  `;
}

export function ticketVariableMemoryInstructions(rows: TicketVariableMemory[]) {
  const seen = new Set<string>();
  const compact: string[] = [];
  for (const row of rows) {
    const key = [
      norm(row.model_type),norm(row.company),norm(row.transportadora),norm(row.product),
      norm(row.route_group),norm(row.origin),norm(row.destination),norm(row.freight_mode),
      Number(row.price_per_ton || 0),Number(row.price_per_trip || 0)
    ].join("|");
    if (!key.replace(/[|0]/g,"") || seen.has(key)) continue;
    seen.add(key);
    compact.push(
      [
        row.model_type ? "modelo="+row.model_type : "",
        row.company ? "empresa="+row.company : "",
        row.company_cnpj ? "cnpj_empresa="+row.company_cnpj : "",
        row.transportadora ? "transportadora="+row.transportadora : "",
        row.transportadora_cnpj ? "cnpj_transportadora="+row.transportadora_cnpj : "",
        row.destinatario ? "destinatário="+row.destinatario : "",
        row.product ? "produto="+row.product : "",
        row.route_group ? "rota="+row.route_group : "",
        row.origin ? "origem="+row.origin : "",
        row.destination ? "destino="+row.destination : "",
        row.freight_mode ? "modo="+row.freight_mode : "",
        Number(row.price_per_ton || 0) > 0 ? "preço_t="+Number(row.price_per_ton) : "",
        Number(row.price_per_trip || 0) > 0 ? "preço_viagem="+Number(row.price_per_trip) : "",
        row.ticket_pattern ? "padrão_ticket="+row.ticket_pattern : "",
      ].filter(Boolean).join("; ")
    );
    if (compact.length >= 50) break;
  }
  return compact.length
    ? compact.map((line,index)=>"- memória "+(index+1)+": "+line).join("\n")
    : "Nenhuma memória de ticket consolidada ainda.";
}

export function matchTicketVariableMemory(
  ticket: Record<string, unknown>,
  rows: TicketVariableMemory[],
  rawText = "",
): TicketVariableMatch | null {
  const text = norm(rawText);
  const pattern = ticketPattern(ticket.numero_ticket);
  const candidates = rows.map((row) => {
    let score = 0;
    const reasons: string[] = [];
    const add = (points:number, reason:string) => { score += points; reasons.push(reason); };

    const exactOrClose = (a:unknown,b:unknown,exact:number,close:number,reason:string) => {
      const x=norm(a), y=norm(b);
      if(!x||!y)return;
      if(x===y)add(exact,reason);
      else if(x.length>=5&&y.length>=5&&(x.includes(y)||y.includes(x)))add(close,reason+" semelhante");
    };

    exactOrClose(ticket.model_type,row.model_type,22,14,"mesmo modelo");
    exactOrClose(ticket.contratante || ticket.cliente || ticket.empresa_documento,row.company,24,15,"mesma empresa");
    exactOrClose(ticket.transportadora,row.transportadora,16,10,"mesma transportadora");
    exactOrClose(ticket.destinatario,row.destinatario,12,7,"mesmo destinatário");
    exactOrClose(ticket.produto,row.product,14,8,"mesmo produto");
    exactOrClose(ticket.route_group,row.route_group,24,15,"mesma rota");
    exactOrClose(ticket.route_origin || ticket.navio_origem || ticket.remetente,row.origin,11,7,"mesma origem");
    exactOrClose(ticket.route_destination || ticket.navio_destino || ticket.destinatario,row.destination,11,7,"mesmo destino");
    exactOrClose(ticket.transportadora_cnpj,row.transportadora_cnpj,30,0,"mesmo CNPJ transportadora");
    exactOrClose(ticket.destinatario_cnpj,row.destinatario_cnpj,30,0,"mesmo CNPJ destinatário");

    if(pattern && row.ticket_pattern && pattern===row.ticket_pattern)add(7,"mesmo padrão de ticket");

    if(text){
      const evidence:[unknown,number,string][]=[
        [row.company_cnpj,28,"CNPJ empresa no texto"],
        [row.transportadora_cnpj,28,"CNPJ transportadora no texto"],
        [row.destinatario_cnpj,28,"CNPJ destinatário no texto"],
        [row.company,18,"empresa no texto"],
        [row.transportadora,13,"transportadora no texto"],
        [row.product,11,"produto no texto"],
        [row.route_group,16,"rota no texto"],
        [row.origin,8,"origem no texto"],
        [row.destination,8,"destino no texto"],
      ];
      for(const [value,points,reason] of evidence){
        const needle=norm(value);
        if(needle.length>=4&&text.includes(needle))add(points,reason);
      }
    }

    return {row,score,reasons};
  }).filter((item)=>item.score>0).sort((a,b)=>b.score-a.score);

  const first=candidates[0];
  if(!first || first.score<20)return null;
  const second=candidates[1];
  const gap=first.score-(second?.score??0);
  const similar=candidates.filter((item)=>item.score>=Math.max(20,first.score-8));
  const modeVotes=new Map<string,number>();
  const priceVotes=new Map<string,{value:number;score:number;count:number}>();
  for(const item of similar){
    const mode=String(item.row.freight_mode||"");
    if(mode)modeVotes.set(mode,(modeVotes.get(mode)||0)+item.score);
    const price=mode==="ton"?Number(item.row.price_per_ton||0):Number(item.row.price_per_trip||0);
    if(price>0){
      const key=mode+"|"+price.toFixed(4);
      const vote=priceVotes.get(key)||{value:price,score:0,count:0};
      vote.score+=item.score;vote.count+=1;priceVotes.set(key,vote);
    }
  }

  const bestMode=[...modeVotes.entries()].sort((a,b)=>b[1]-a[1])[0]?.[0]||null;
  const bestPrice=[...priceVotes.entries()].sort((a,b)=>b[1].score-a[1].score)[0]?.[1]||null;
  const support=similar.filter((item)=>!bestMode||item.row.freight_mode===bestMode).length;
  let confidence=0.55+Math.min(0.3,first.score/180)+Math.min(0.08,Math.max(0,gap)/100)+Math.min(0.07,support*0.02);
  confidence=Math.min(0.99,confidence);

  const memory={...first.row};
  if(bestMode)memory.freight_mode=bestMode;
  if(bestPrice){
    if(bestMode==="ton")memory.price_per_ton=bestPrice.value;
    else memory.price_per_trip=bestPrice.value;
  }
  return {memory,score:first.score,confidence:Math.round(confidence*1000)/1000,reasons:first.reasons.slice(0,6),support};
}

export function applyTicketVariableMemory(ticket: Record<string, any>, match: TicketVariableMatch | null) {
  if(!match || match.confidence<0.72)return ticket;
  const memory=match.memory;
  const safeFill=(key:string,value:unknown)=>{
    if((ticket[key]==null||String(ticket[key]).trim()==="")&&value!=null&&String(value).trim()!=="")ticket[key]=value;
  };

  safeFill("model_type",memory.model_type);
  safeFill("transportadora",memory.transportadora);
  safeFill("destinatario",memory.destinatario);
  safeFill("produto",memory.product);
  safeFill("route_group",memory.route_group);
  safeFill("route_origin",memory.origin);
  safeFill("route_destination",memory.destination);

  const strong = match.score >= 32 && match.confidence >= 0.80;
  if(strong){
    if(!ticket.inferred_freight_mode && ["ton","trip","cegonha","caixinha"].includes(String(memory.freight_mode||""))){
      ticket.inferred_freight_mode=memory.freight_mode;
    }
    const mode=String(ticket.inferred_freight_mode||memory.freight_mode||"");
    const price=mode==="ton"?Number(memory.price_per_ton||0):Number(memory.price_per_trip||0);
    const explicit=Number(ticket.inferred_price||0)>0 && /manuscrit|impresso|explícito/i.test(String(ticket.inferred_price_basis||""));
    if(!explicit && price>0 && match.confidence>=0.84){
      ticket.inferred_price=price;
      ticket.inferred_price_basis="memória de tickets semelhantes ("+match.reasons.join(", ")+")";
      ticket.inference_confidence=Math.max(Number(ticket.inference_confidence||0),match.confidence);
    }
  }

  ticket.memory_match_confidence=match.confidence;
  ticket.memory_match_support=match.support;
  ticket.memory_match_basis=match.reasons.join(", ");
  if(match.confidence>=0.86){
    ticket.memory_driver_id=memory.driver_id||null;
    ticket.memory_fleet_id=memory.fleet_id||null;
  }
  ticket.alertas=Array.isArray(ticket.alertas)?ticket.alertas:[];
  if(match.confidence>=0.84){
    ticket.alertas.push("Memória de tickets: "+match.reasons.join(", ")+" · confiança "+Math.round(match.confidence*100)+"%.");
  }
  return ticket;
}

async function ensureTable(sql: Sql) {
  await sql`
    create table if not exists ticket_variable_memory(
      ticket_id bigint primary key,
      numero_ticket text,
      report_id text,
      trip_id text,
      driver_id text,
      fleet_id text,
      tractor_plate text,
      trailer_plate text,
      model_type text,
      company text,
      company_cnpj text,
      transportadora text,
      transportadora_cnpj text,
      destinatario text,
      destinatario_cnpj text,
      product text,
      route_group text,
      origin text,
      destination text,
      freight_mode text,
      price_per_ton numeric,
      price_per_trip numeric,
      ticket_pattern text,
      variables jsonb not null default '{}'::jsonb,
      updated_at timestamptz not null default now()
    )
  `;
  await sql`create index if not exists ticket_variable_memory_model_idx on ticket_variable_memory(model_type)`;
  await sql`create index if not exists ticket_variable_memory_company_idx on ticket_variable_memory(company)`;
  await sql`create index if not exists ticket_variable_memory_route_idx on ticket_variable_memory(route_group)`;
  await sql`create index if not exists ticket_variable_memory_mode_idx on ticket_variable_memory(freight_mode)`;
  await sql`create index if not exists ticket_variable_memory_fleet_idx on ticket_variable_memory(fleet_id)`;
}

function ticketPattern(value:unknown){
  const text=String(value??"").trim().toUpperCase();
  return text?text.replace(/[0-9]+/g,"#"):null;
}
function norm(value:unknown){
  return String(value??"")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g,"")
    .toLocaleLowerCase("pt-BR")
    .replace(/[^a-z0-9]+/g," ")
    .replace(/\s+/g," ")
    .trim();
}
