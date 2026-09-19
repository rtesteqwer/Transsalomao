import fs from 'node:fs';
import path from 'node:path';

const target = process.argv[2];
if (!target) throw new Error('ticket-performance: target missing');
const repo = process.cwd();
const file = (rel) => path.join(target, rel);

// Aceitação em lote: consultas independentes e inserts/updates são executados em paralelo.
{
  const p = file('src/lib/api.ts');
  let s = fs.readFileSync(p, 'utf8');
  const start = s.indexOf('export const acceptReports =');
  const end = s.indexOf('\nexport const rejectReport =', start);
  if (start < 0 || end < 0) throw new Error('ticket-performance: acceptReports block missing');
  const snippet = fs.readFileSync(path.join(repo, 'render-overrides/accept-reports-optimized.snippet.ts'), 'utf8').trimEnd();
  s = s.slice(0, start) + snippet + s.slice(end);

  // Todos os tickets antigos recebem uma numeração global e determinística. O cache
  // de módulo evita repetir a migração a cada polling do painel.
  if (!s.includes('let ticketNormalizationPromise')) {
    const helper = `
let ticketNormalizationPromise: Promise<void> | null = null;
async function normalizeTicketCodes(sql: Awaited<ReturnType<typeof getSql>>) {
  if (!ticketNormalizationPromise) {
    ticketNormalizationPromise = (async () => {
      await sql\`with ordered as (select id, row_number() over (order by date asc, created_at asc nulls first, id asc) as rn from trips) update trips t set code = ordered.rn::text from ordered where t.id = ordered.id\`;
      const countRows = await sql<{ count: number }>\`select count(*)::int as count from trips\`;
      const offset = Number(countRows[0]?.count ?? 0);
      await sql\`with ordered as (select id, row_number() over (order by created_at asc nulls first, id asc) as rn from reports where status = 'pendente') update reports r set ticket = (\${offset} + ordered.rn)::text from ordered where r.id = ordered.id\`;
      await sql\`update reports r set ticket = t.code from trips t where r.trip_id = t.id\`;
    })().catch((error) => { ticketNormalizationPromise = null; throw error; });
  }
  await ticketNormalizationPromise;
}
`;
    s = s.replace('async function requireManagement() {', helper + '\nasync function requireManagement() {');
  }
  // A renumeração histórica não pode bloquear o carregamento do painel. Ela fica
  // disponível como helper para uma migração controlada; o painel apenas lê os dados.

  // Novos lançamentos e novas viagens sempre usam o próximo número livre.
  if (!s.includes('async function nextTicketCode')) {
    const nextTicketHelper = [
      'async function nextTicketCode(sql: Awaited<ReturnType<typeof getSql>>) {',
      '  const rows = await sql<{ next: number }>`select (greatest(coalesce((select max(code::int) from trips where code ~ \'^[0-9]+$\'), 0), coalesce((select max(ticket::int) from reports where ticket ~ \'^[0-9]+$\'), 0)) + 1)::int as next`;',
      '  return String(Number(rows[0]?.next ?? 1));',
      '}',
      '',
      'function newId(prefix: string) {',
    ].join('\n');
    s = s.replace('function newId(prefix: string) {', () => nextTicketHelper);
  }
  s = s.replace('    const ticket = data.ticket.trim() ? data.ticket.toUpperCase() : autoTicket;', '    const ticket = await nextTicketCode(sql);');
  s = s.replace('    const code = data.code.toUpperCase();', '    const code = data.id ? data.code.toUpperCase() : await nextTicketCode(sql);');

  // Exclusão global usada pelo botão da aba Caixa.
  if (!s.includes('export const deleteAllTrips')) {
    const marker = '\nexport const deleteTrip = createServerFn';
    const block = `
export const deleteAllTrips = createServerFn({ method: "POST" })
  .handler(async () => {
    await requireManagement();
    const sql = await getSql();
    const countRows = await sql<{ count: number }>\`select count(*)::int as count from trips\`;
    await sql\`update reports set trip_id = null, status = 'pendente' where trip_id is not null\`;
    await sql\`delete from trips\`;
    return { ok: true, deleted: Number(countRows[0]?.count ?? 0) };
  });
`;
    s = s.replace(marker, block + marker);
  }
  fs.writeFileSync(p, s);
}

// Evita uma cascata de requisições para remover várias viagens selecionadas.
{
  const p = file('src/lib/use-fleet.ts');
  let s = fs.readFileSync(p, 'utf8');
  s = s.replace('  deleteTrip,', '  deleteAllTrips,\n  deleteTrip,');
  if (!s.includes('const removeAllTrips')) s = s.replace('  const removeTrip = useMutation({', '  const removeAllTrips = useMutation({ mutationFn: () => deleteAllTrips(), onSuccess: invalidate });\n  const removeTrip = useMutation({');
  s = s.replace('    removeTrip,', '    removeAllTrips,\n    removeTrip,');
  fs.writeFileSync(p, s);
}

// Botão para apagar todas as viagens na Caixa.
{
  const p = file('src/routes/dono/lancamentos.tsx');
  let s = fs.readFileSync(p, 'utf8');
  s = s.replace('  const { trip, acceptMany, reject, removeReport } = useFleetMutations();', '  const { trip, acceptMany, reject, removeReport, removeAllTrips } = useFleetMutations();');
  if (!s.includes('Apagar todas as viagens')) {
    const marker = '            <p className="text-xs text-subtle">Aceitos e recusados</p>';
    const replacement = `${marker}
            <Button size="sm" variant="ghost" className="text-danger" disabled={removeAllTrips.isPending} onClick={async () => {
              if (!window.confirm("Apagar todas as viagens do sistema? Os lançamentos serão devolvidos para pendentes.")) return;
              try { const result = await removeAllTrips.mutateAsync(); setSelected(new Set()); toast.success(String(result.deleted ?? 0) + " viagens apagadas."); } catch (err) { toast.error(err instanceof Error ? err.message : "Não foi possível apagar todas as viagens."); }
            }}><Trash2 className="size-4" /> {removeAllTrips.isPending ? "Apagando..." : "Apagar todas as viagens"}</Button>`;
    s = s.replace(marker, replacement);
  }
  fs.writeFileSync(p, s);
}

console.log('[ticket-performance] bulk accept optimized, sequential ticket numbering and delete-all button applied');
