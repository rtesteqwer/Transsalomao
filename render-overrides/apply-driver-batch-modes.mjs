import fs from 'node:fs';
import path from 'node:path';

const target = process.argv[2];
if (!target || !fs.existsSync(target)) throw new Error('apply-driver-batch-modes: target missing');

function file(rel) { return path.join(target, rel); }
function read(rel) { return fs.readFileSync(file(rel), 'utf8'); }
function write(rel, text) { fs.writeFileSync(file(rel), text); }
function replaceRequired(text, search, replacement, label) {
  const next = text.replace(search, replacement);
  if (next === text) throw new Error(`apply-driver-batch-modes: pattern not found (${label})`);
  return next;
}

// App do motorista:
// - remove KM da carreta de todos os modos;
// - Por tonelada / Por viagem continuam com Toneladas;
// - Cegonha / Caixinha usam Quantidade de viagens e criam vários lançamentos de uma vez.
{
  let s = read('src/routes/motorista.tsx');

  s = replaceRequired(
    s,
    `  const [ticket, setTicket] = useState("");\n  const [km, setKm] = useState("");\n  const [tons, setTons] = useState("");\n  const [freightMode, setFreightMode] = useState<FreightMode | "">("");`,
    `  const [ticket, setTicket] = useState("");\n  const [tons, setTons] = useState("");\n  const [tripCount, setTripCount] = useState("1");\n  const [freightMode, setFreightMode] = useState<FreightMode | "">("");`,
    'driver states',
  );

  s = replaceRequired(
    s,
    `    const kmN = parseLocaleNumber(km);\n    const tonsN = parseLocaleNumber(tons);`,
    `    const tonsN = parseLocaleNumber(tons);\n    const batchMode = freightMode === "cegonha" || freightMode === "caixinha";\n    const tripCountN = Number.parseInt(tripCount, 10);`,
    'submit parsed values',
  );

  s = replaceRequired(
    s,
    `    if (!fleetId) return toast.error("Escolha o conjunto.");\n    if (!freightMode) return toast.error("Escolha o modo de frete.");\n    try {\n      const res = await report.mutateAsync({\n        ticket: ticket.trim(),\n        driverId,\n        fleetId,\n        km: kmN ?? 0,\n        tons: tonsN ?? 0,\n        freightMode,\n      });`,
    `    if (!fleetId) return toast.error("Escolha o conjunto.");\n    if (!freightMode) return toast.error("Escolha o modo de frete.");\n    if (batchMode && (!Number.isInteger(tripCountN) || tripCountN < 1 || tripCountN > 100)) {\n      return toast.error("Informe uma quantidade de viagens entre 1 e 100.");\n    }\n    try {\n      const count = batchMode ? tripCountN : 1;\n      let firstTicket = "";\n      for (let index = 0; index < count; index += 1) {\n        const baseTicket = ticket.trim();\n        const itemTicket = baseTicket && count > 1\n          ? \`${'${baseTicket}'}-${'${String(index + 1).padStart(2, "0")}'}\`\n          : baseTicket;\n        const res = await report.mutateAsync({\n          ticket: itemTicket,\n          driverId,\n          fleetId,\n          km: 0,\n          tons: batchMode ? 0 : (tonsN ?? 0),\n          freightMode,\n        });\n        if (!firstTicket) firstTicket = res.ticket;\n      }`,
    'batch submit reports',
  );

  s = replaceRequired(
    s,
    `      setSentTicket(res.ticket);\n      setTicket("");\n      setKm("");\n      setTons("");\n      toast.success(\`Ticket ${'${res.ticket}'} enviado ao Painel Gerência.\`);`,
    `      setSentTicket(count > 1 ? \`${'${firstTicket}'} + ${'${count - 1}'} viagem(ns)\` : firstTicket);\n      setTicket("");\n      setTons("");\n      if (batchMode) setTripCount("1");\n      toast.success(count > 1\n        ? \`${'${count}'} viagens enviadas ao Painel Gerência.\`\n        : \`Ticket ${'${firstTicket}'} enviado ao Painel Gerência.\`);`,
    'batch success cleanup',
  );

  s = replaceRequired(
    s,
    '          Escolha motorista, conjunto e o modo de frete. Ticket, KM e toneladas podem ser completados pela gerência.',
    '          Escolha motorista, conjunto e o modo de frete. Em Cegonha e Caixinha você pode lançar várias viagens de uma vez.',
    'driver intro without km',
  );

  s = replaceRequired(
    s,
    `          <div className="grid grid-cols-2 gap-3">\n            <Field label="KM da carreta" hint="Opcional">\n              <Input\n                value={km}\n                onChange={(e) => setKm(e.target.value)}\n                inputMode="numeric"\n                placeholder="223540"\n                className="h-14 font-display text-2xl tabular tracking-wide"\n              />\n            </Field>\n            <Field label="Toneladas" hint="Opcional">\n              <Input\n                value={tons}\n                onChange={(e) => setTons(e.target.value)}\n                inputMode="decimal"\n                placeholder="32,6"\n                className="h-14 font-display text-2xl tabular tracking-wide"\n              />\n            </Field>\n          </div>`,
    `          {freightMode === "cegonha" || freightMode === "caixinha" ? (\n            <Field label="Quantidade de viagens" hint="Lançadas ao mesmo tempo">\n              <Input\n                value={tripCount}\n                onChange={(e) => setTripCount(e.target.value.replace(/\\D/g, ""))}\n                inputMode="numeric"\n                placeholder="1"\n                className="h-14 font-display text-2xl tabular tracking-wide"\n              />\n              <p className="mt-2 text-xs text-muted">Cada quantidade gera um lançamento separado no Painel Gerência.</p>\n            </Field>\n          ) : (\n            <Field label="Toneladas" hint="Opcional">\n              <Input\n                value={tons}\n                onChange={(e) => setTons(e.target.value)}\n                inputMode="decimal"\n                placeholder="32,6"\n                className="h-14 font-display text-2xl tabular tracking-wide"\n              />\n            </Field>\n          )}`,
    'conditional tons or trip count',
  );

  write('src/routes/motorista.tsx', s);
}

// Caixa de lançamentos da Gerência: não mostrar KM 0 vindo do app do motorista.
// O KM continua podendo ser preenchido pela Gerência ao fechar/editar a viagem.
{
  let s = read('src/routes/dono/lancamentos.tsx');

  s = replaceRequired(
    s,
    `          kmEnd: String(open.km),`,
    `          kmEnd: open.km > 0 ? String(open.km) : "",`,
    'pending report km end',
  );

  s = replaceRequired(
    s,
    `                  <dl className="mt-4 grid grid-cols-3 gap-3">\n                    <div>\n                      <dt className="text-[10px] uppercase tracking-[0.14em] text-subtle">\n                        KM carreta\n                      </dt>\n                      <dd className="mt-1 font-display text-xl tabular">\n                        {integer(r.km)}\n                      </dd>\n                    </div>\n                    <div>\n                      <dt className="text-[10px] uppercase tracking-[0.14em] text-subtle">\n                        Toneladas\n                      </dt>\n                      <dd className="mt-1 font-display text-xl tabular">\n                        {num(r.tons, 2)} t\n                      </dd>\n                    </div>`,
    `                  <dl className="mt-4 grid grid-cols-2 gap-3">\n                    <div>\n                      <dt className="text-[10px] uppercase tracking-[0.14em] text-subtle">\n                        {r.freightMode === "cegonha" || r.freightMode === "caixinha" ? "Lançamento" : "Toneladas"}\n                      </dt>\n                      <dd className="mt-1 font-display text-xl tabular">\n                        {r.freightMode === "cegonha" || r.freightMode === "caixinha" ? "1 viagem" : \`${'${num(r.tons, 2)}'} t\`}\n                      </dd>\n                    </div>`,
    'pending report metrics without km',
  );

  s = replaceRequired(
    s,
    `{driver?.name} · {integer(r.km)} km · {num(r.tons, 1)} t · {freightModeLabel(r.freightMode)}`,
    `{driver?.name} · {r.tons > 0 ? \`${'${num(r.tons, 1)}'} t · \` : ""}{freightModeLabel(r.freightMode)}`,
    'done report summary without km',
  );

  write('src/routes/dono/lancamentos.tsx', s);
}

console.log('[driver-batch-modes] no driver KM + Cegonha/Caixinha batch trip quantity applied');
