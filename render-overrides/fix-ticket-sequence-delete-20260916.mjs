import fs from 'node:fs';
import path from 'node:path';

const target = process.argv[2];
if (!target || !fs.existsSync(target)) throw new Error('fix-ticket-sequence-delete: target missing');
const file = (rel) => path.join(target, rel);

// API: ticket novo = maior ticket numérico existente + 1.
// Também torna a exclusão da aba Viagens simétrica à Caixa, removendo o report vinculado.
{
  const p = file('src/lib/api.ts');
  let s = fs.readFileSync(p, 'utf8');

  const nextStart = s.indexOf('async function nextTicketCode(');
  if (nextStart < 0) throw new Error('fix-ticket-sequence-delete: nextTicketCode missing');
  const nextEnd = s.indexOf('\n}', nextStart);
  if (nextEnd < 0) throw new Error('fix-ticket-sequence-delete: nextTicketCode end missing');
  const nextBlock = `async function nextTicketCode(sql: Awaited<ReturnType<typeof getSql>>) {
  const rows = await sql<{ next: number }>` + '`' + `
    select coalesce(greatest(
      (select max(code::bigint) from trips where code ~ '^[0-9]+$'),
      (select max(ticket::bigint) from reports where ticket ~ '^[0-9]+$')
    ), 0)::bigint + 1 as next
  ` + '`' + `;
  return String(Number(rows[0]?.next ?? 1));
}`;
  s = s.slice(0, nextStart) + nextBlock + s.slice(nextEnd + 2);

  const deleteStart = s.indexOf('export const deleteTrip = createServerFn');
  if (deleteStart < 0) throw new Error('fix-ticket-sequence-delete: deleteTrip missing');
  const deleteClose = s.indexOf('\n  });', deleteStart);
  if (deleteClose < 0) throw new Error('fix-ticket-sequence-delete: deleteTrip closing marker missing');
  const deleteEnd = deleteClose + '\n  });'.length;
  const deleteBlock = `export const deleteTrip = createServerFn({ method: "POST" })
  .validator(z.object({ id: z.string().min(1) }))
  .handler(async ({ data }) => {
    await requireManagement();
    const sql = await getSql();

    // Uma viagem fechada pode estar vinculada ao lançamento original do Caixa.
    // Apagamos os dois no mesmo comando para respeitar a FK reports.trip_id -> trips.id.
    await sql` + '`' + `
      with removed_reports as (
        delete from reports
        where trip_id = ${'${data.id}'}
        returning id
      )
      delete from trips
      where id = ${'${data.id}'}
    ` + '`' + `;

    return { ok: true };
  });`;
  s = s.slice(0, deleteStart) + deleteBlock + s.slice(deleteEnd);

  fs.writeFileSync(p, s);
}

// App do motorista: o ticket não é digitado. O servidor gera automaticamente.
{
  const p = file('src/routes/motorista.tsx');
  let s = fs.readFileSync(p, 'utf8');
  const valueAt = s.indexOf('value={ticket}');
  if (valueAt >= 0) {
    const fieldStart = s.lastIndexOf('<Field', valueAt);
    const fieldEnd = s.indexOf('</Field>', valueAt);
    if (fieldStart < 0 || fieldEnd < 0) throw new Error('fix-ticket-sequence-delete: ticket field bounds missing');
    let removeStart = fieldStart;
    while (removeStart > 0 && s[removeStart - 1] !== '\n') removeStart--;
    let removeEnd = fieldEnd + '</Field>'.length;
    if (s[removeEnd] === '\r') removeEnd++;
    if (s[removeEnd] === '\n') removeEnd++;
    s = s.slice(0, removeStart) + s.slice(removeEnd);
  }
  // Mesmo que algum cliente antigo envie um valor, a UI atual não reaproveita ticket manual.
  s = s.replace('const baseTicket = ticket.trim();', 'const baseTicket = "";');
  fs.writeFileSync(p, s);
}

console.log('[ticket-sequence-delete] automatic max+1 tickets, driver ticket field removed, trip delete synchronized');
