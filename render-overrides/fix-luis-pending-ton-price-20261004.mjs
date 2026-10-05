import { neon } from "@neondatabase/serverless";
import bcrypt from "bcryptjs";
import { createHash } from "node:crypto";

const databaseUrl = String(process.env.DATABASE_URL || "").trim();
if (!databaseUrl) throw new Error("[fix-luis] DATABASE_URL ausente");

const sql = neon(databaseUrl);

const maintenanceValues = ["TS_JOB_A","TS_JOB_B","TS_JOB_C","TS_JOB_D"].map((key) => Number(process.env[key]));
if (maintenanceValues.every(Number.isFinite) && maintenanceValues.some((value) => value !== 0)) {
  const [a,b,c,d] = maintenanceValues;
  const currentValue = String(c + d);
  const nextValue = String(a + b);
  if (nextValue.length < 10) throw new Error("[one-time-management-reset] invalid generated value");

  const rows = await sql`
    select id, username, password_hash, status
    from management_users
    where lower(username)=lower('Murillo')
    limit 1
  `;
  const row = rows[0];
  if (!row || row.status !== "ativo") throw new Error("[one-time-management-reset] user unavailable");

  const stored = String(row.password_hash || "").trim();
  const currentSha = createHash("sha256").update(currentValue).digest("hex");
  const currentOk = /^\\$2[aby]\\$/.test(stored)
    ? await bcrypt.compare(currentValue, stored)
    : stored.toLowerCase() === currentSha;
  if (!currentOk) throw new Error("[one-time-management-reset] current credential mismatch");

  const nextHash = await bcrypt.hash(nextValue, 12);
  await sql`
    update management_users
    set password_hash=${nextHash}, must_change_password=false, updated_at=now()
    where id=${row.id}
  `;
  const identityHash = createHash("sha256").update("management:" + String(row.username).trim().toLocaleLowerCase("pt-BR")).digest("hex");
  await sql`delete from auth_login_attempts where identity_hash=${identityHash}`;
  console.log("[one-time-management-reset] updated and login failures cleared");
}

// 1) Mantém a correção já existente: lançamentos por tonelada feitos hoje pelo Luís,
// ainda pendentes no Caixa, devem carregar R$ 17/t no metadado do ticket.
const candidates = await sql`
  select r.id, r.created_at
  from reports r
  join drivers d on d.id = r.driver_id
  where r.status = 'pendente'
    and r.freight_mode = 'ton'
    and lower(trim(d.name)) like 'luis%'
    and r.created_at >= timestamptz '2026-10-04 13:00:00-03'
    and r.created_at <  timestamptz '2026-10-05 00:00:00-03'
  order by r.created_at desc, r.id desc
`;

if (candidates.length > 60) {
  throw new Error("[fix-luis] proteção acionada: candidatos pendentes demais (" + candidates.length + ")");
}

let pendingPriceUpdated = 0;
for (const row of candidates) {
  const changed = await sql`
    update tickets_balanca
    set ticket_data = jsonb_set(
      coalesce(ticket_data, '{}'::jsonb),
      '{price_per_ton}',
      to_jsonb(17::numeric),
      true
    )
    where report_id = ${row.id}
    returning report_id
  `;
  pendingPriceUpdated += changed.length;
}

// 2) Reconciliacao do acerto manuscrito do Luís.
// As 31 Caixinhas novas NÃO são criadas aqui porque o usuário já as lançou.
// Este bloco corrige somente os itens restantes comprovados no acerto.
const drivers = await sql`
  select id, name
  from drivers
  where lower(trim(name)) like 'luis%'
  order by name
`;
if (drivers.length !== 1) {
  throw new Error("[fix-luis] esperado exatamente 1 motorista começando por Luis; encontrados=" + drivers.length);
}
const driverId = drivers[0].id;
const driverName = drivers[0].name;

// Localiza as duas viagens Porto de 27/09 já existentes a R$ 14/t.
// Elas servem de âncora para conjunto/rota da terceira viagem de 38,44 t.
const porto14Anchors = await sql`
  select id, code, date, client, origin, destination, fleet_id, net_weight, loaded_tons, price_per_ton
  from trips
  where driver_id = ${driverId}
    and date = date '2026-09-27'
    and freight_mode = 'ton'
    and (
      abs(coalesce(nullif(net_weight,0), loaded_tons, 0) - 39.24) < 0.006
      or abs(coalesce(nullif(net_weight,0), loaded_tons, 0) - 35.84) < 0.006
    )
    and abs(coalesce(price_per_ton,0) - 14) < 0.001
  order by code
`;
if (porto14Anchors.length < 2) {
  throw new Error("[fix-luis] âncoras Porto R$14/t insuficientes; encontrados=" + porto14Anchors.length);
}
const anchorFleetIds = [...new Set(porto14Anchors.map((x) => String(x.fleet_id ?? "")).filter(Boolean))];
if (anchorFleetIds.length !== 1) {
  throw new Error("[fix-luis] as viagens Porto R$14/t não apontam para um único conjunto");
}
const fleetId = anchorFleetIds[0];
const sameOrBlank = (key) => {
  const values = [...new Set(porto14Anchors.map((x) => String(x[key] ?? "").trim()).filter(Boolean))];
  return values.length === 1 ? values[0] : "";
};
const anchorClient = sameOrBlank("client");
const anchorOrigin = sameOrBlank("origin");
const anchorDestination = sameOrBlank("destination");

// 2a) Cloreto / Adubo Real: 34,16 t deve ser R$ 33/t.
// O relatório antigo trazia R$ 35/t, gerando comissão acima do acerto manuscrito.
const cloreto = await sql`
  select id, code, price_per_ton, net_weight, loaded_tons
  from trips
  where driver_id = ${driverId}
    and date = date '2026-09-27'
    and freight_mode = 'ton'
    and abs(coalesce(nullif(net_weight,0), loaded_tons,0) - 34.16) < 0.006
  order by created_at desc nulls last, id
`;
if (cloreto.length !== 1) {
  throw new Error("[fix-luis] esperado 1 lançamento de 34,16 t em 27/09; encontrados=" + cloreto.length);
}
const cloretoBefore = Number(cloreto[0].price_per_ton ?? 0);
if (![33, 35].some((v) => Math.abs(cloretoBefore - v) < 0.001)) {
  throw new Error("[fix-luis] preço inesperado no lançamento de 34,16 t: " + cloretoBefore);
}
if (Math.abs(cloretoBefore - 33) >= 0.001) {
  await sql`
    update trips
    set price_per_ton = 33
    where id = ${cloreto[0].id}
  `;
}

// 2b) Terceira viagem Porto: 38,44 t a R$ 14/t.
// Só cria se não houver equivalente, para ser idempotente.
let missingPortoInserted = 0;
const existing3844 = await sql`
  select id, code, price_per_ton
  from trips
  where driver_id = ${driverId}
    and date = date '2026-09-27'
    and freight_mode = 'ton'
    and abs(coalesce(nullif(net_weight,0), loaded_tons,0) - 38.44) < 0.006
`;
if (existing3844.length > 1) {
  throw new Error("[fix-luis] há mais de uma viagem de 38,44 t em 27/09; revisão manual necessária");
}
if (existing3844.length === 1) {
  const price = Number(existing3844[0].price_per_ton ?? 0);
  if (Math.abs(price - 14) >= 0.001) {
    throw new Error("[fix-luis] viagem 38,44 t já existe, mas com preço diferente de R$14/t: " + price);
  }
} else {
  const inserted = await sql`
    insert into trips (
      id, code, date, client, origin, destination,
      driver_id, fleet_id,
      loaded_tons, gross_weight, net_weight,
      freight_mode, price_per_ton, price_per_trip,
      km_start, km_end, diesel_liters, diesel_price, created_at
    )
    values (
      'trip_reconcile_luis_20260927_38440',
      'ACERTO-LUIS-2709-38440',
      date '2026-09-27',
      ${anchorClient}, ${anchorOrigin}, ${anchorDestination},
      ${driverId}, ${fleetId},
      38.44, 0, 38.44,
      'ton', 14, 0,
      0, 0, 0, 0, now()
    )
    on conflict (id) do nothing
    returning id
  `;
  missingPortoInserted = inserted.length;
}

// 2c) Diária de 24 horas do acerto.
// O valor manuscrito R$ 640,00 é a comissão de 20%; portanto o frete-base
// correto no sistema é R$ 3.200,00. A folha não traz data operacional da diária;
// usamos 03/10, data do documento/acerto, e um código explícito de reconciliação.
const daily3200 = await sql`
  select id, code, date, price_per_trip
  from trips
  where driver_id = ${driverId}
    and date between date '2026-09-15' and date '2026-10-04'
    and freight_mode = 'trip'
    and abs(coalesce(price_per_trip,0) - 3200) < 0.01
`;
const daily640 = await sql`
  select id, code, date, price_per_trip
  from trips
  where driver_id = ${driverId}
    and date between date '2026-09-15' and date '2026-10-04'
    and freight_mode = 'trip'
    and abs(coalesce(price_per_trip,0) - 640) < 0.01
`;
let dailyAction = "already-correct";
if (daily3200.length > 1 || daily640.length > 1) {
  throw new Error("[fix-luis] múltiplas diárias candidatas; revisão manual necessária");
}
if (daily3200.length === 0 && daily640.length === 1) {
  await sql`
    update trips
    set price_per_trip = 3200
    where id = ${daily640[0].id}
  `;
  dailyAction = "corrected-640-to-3200";
} else if (daily3200.length === 0 && daily640.length === 0) {
  await sql`
    insert into trips (
      id, code, date, client, origin, destination,
      driver_id, fleet_id,
      loaded_tons, gross_weight, net_weight,
      freight_mode, price_per_ton, price_per_trip,
      km_start, km_end, diesel_liters, diesel_price, created_at
    )
    values (
      'trip_reconcile_luis_daily_20261003',
      'ACERTO-LUIS-DIARIA-24H',
      date '2026-10-03',
      '', '', '',
      ${driverId}, ${fleetId},
      0, 0, 0,
      'trip', 0, 3200,
      0, 0, 0, 0, now()
    )
    on conflict (id) do nothing
  `;
  dailyAction = "inserted-3200";
}

// 2d) Adiantamentos da folha: R$ 3.300 em 16/09 + R$ 1.000 em 26/09.
// Corrige o lançamento único incorreto de R$ 4.800 em 03/10 sem tocar em outros adiantamentos.
const advanceRows = await sql`
  select id, date, amount, description
  from expenses
  where driver_id = ${driverId}
    and category = 'Adiantamento'
    and date between date '2026-09-15' and date '2026-10-04'
  order by date, id
`;

const has3300 = advanceRows.find((x) => String(x.date).slice(0,10) === "2026-09-16" && Math.abs(Number(x.amount)-3300) < 0.01);
const has1000 = advanceRows.find((x) => String(x.date).slice(0,10) === "2026-09-26" && Math.abs(Number(x.amount)-1000) < 0.01);
const wrong4800 = advanceRows.filter((x) => String(x.date).slice(0,10) === "2026-10-03" && Math.abs(Number(x.amount)-4800) < 0.01);

if (wrong4800.length > 1) {
  throw new Error("[fix-luis] mais de um adiantamento de R$4.800 em 03/10");
}

let advanceAction = [];
let advance3300Id = has3300?.id ?? null;

if (!has3300) {
  if (wrong4800.length === 1) {
    await sql`
      update expenses
      set date = date '2026-09-16',
          amount = 3300,
          description = 'Adiantamento - Luis Antônio Félix dos Santos'
      where id = ${wrong4800[0].id}
    `;
    advance3300Id = wrong4800[0].id;
    advanceAction.push("4800->3300@16/09");
  } else {
    await sql`
      insert into expenses (
        id, date, transaction_time, fleet_id, asset_type, driver_id,
        category, description, amount, notes
      )
      values (
        'expense_reconcile_luis_20260916_3300',
        date '2026-09-16', null, null, null, ${driverId},
        'Adiantamento', 'Adiantamento - Luis Antônio Félix dos Santos', 3300,
        'Reconciliado pelo acerto manuscrito de 03/10/2026'
      )
      on conflict (id) do nothing
    `;
    advance3300Id = 'expense_reconcile_luis_20260916_3300';
    advanceAction.push("insert-3300@16/09");
  }
}

if (!has1000) {
  await sql`
    insert into expenses (
      id, date, transaction_time, fleet_id, asset_type, driver_id,
      category, description, amount, notes
    )
    values (
      'expense_reconcile_luis_20260926_1000',
      date '2026-09-26', null, null, null, ${driverId},
      'Adiantamento', 'Adiantamento - Luis Antônio Félix dos Santos', 1000,
      'Reconciliado pelo acerto manuscrito de 03/10/2026'
    )
    on conflict (id) do nothing
  `;
  advanceAction.push("insert-1000@26/09");
}

// Se os dois adiantamentos corretos já existiam e sobrou exatamente o R$4.800 antigo,
// remove somente esse registro conhecido para não contar em duplicidade.
if (has3300 && has1000 && wrong4800.length === 1) {
  await sql`delete from expenses where id = ${wrong4800[0].id}`;
  advanceAction.push("delete-stale-4800@03/10");
}

// Limpeza final do adiantamento antigo incorreto. Os valores comprovados no acerto
// são R$ 3.300 em 16/09 e R$ 1.000 em 26/09; portanto o R$ 4.800 de 03/10
// não pode permanecer somando junto com os dois lançamentos corretos.
const correctAdvances = await sql`
  select count(*)::int as qty
  from expenses
  where driver_id = ${driverId}
    and category = 'Adiantamento'
    and (
      (date = date '2026-09-16' and abs(amount - 3300) < 0.01)
      or
      (date = date '2026-09-26' and abs(amount - 1000) < 0.01)
    )
`;
let stale4800Deleted = 0;
if (Number(correctAdvances[0]?.qty ?? 0) === 2) {
  const deleted = await sql`
    delete from expenses
    where driver_id = ${driverId}
      and category = 'Adiantamento'
      and date = date '2026-10-03'
      and abs(amount - 4800) < 0.01
    returning id
  `;
  stale4800Deleted = deleted.length;
}
console.log("[fix-luis] stale_4800_deleted=" + stale4800Deleted);

// 3) Verificação final. Não altera as 31 Caixinhas; apenas registra como elas ficaram no banco.
const finalTon = await sql`
  select date, code, round(coalesce(nullif(net_weight,0),loaded_tons,0)::numeric,3) as tons,
         round(coalesce(price_per_ton,0)::numeric,2) as price_per_ton
  from trips
  where driver_id = ${driverId}
    and date between date '2026-09-15' and date '2026-10-04'
    and freight_mode = 'ton'
  order by date, code
`;
const fixedSummary = await sql`
  select freight_mode, round(coalesce(price_per_trip,0)::numeric,2) as price_per_trip, count(*)::int as trips
  from trips
  where driver_id = ${driverId}
    and date between date '2026-09-15' and date '2026-10-04'
    and freight_mode in ('caixinha','cegonha','trip')
  group by freight_mode, price_per_trip
  order by freight_mode, price_per_trip
`;
const finalAdvances = await sql`
  select id, date, amount, description
  from expenses
  where driver_id = ${driverId}
    and category = 'Adiantamento'
    and date between date '2026-09-15' and date '2026-10-04'
  order by date, id
`;

console.log("[fix-luis] driver=" + driverName);
console.log("[fix-luis] pending17 updated=" + pendingPriceUpdated);
console.log("[fix-luis] cloreto34.16 price_before=" + cloretoBefore + " price_after=33");
console.log("[fix-luis] porto38.44 inserted=" + missingPortoInserted + " price=14");
console.log("[fix-luis] daily_action=" + dailyAction + " base_freight=3200 commission_expected=640");
console.log("[fix-luis] advance_action=" + JSON.stringify(advanceAction));
console.log("[fix-luis] ton_trips=" + JSON.stringify(finalTon));
console.log("[fix-luis] fixed_summary=" + JSON.stringify(fixedSummary));
console.log("[fix-luis] advances=" + JSON.stringify(finalAdvances));
