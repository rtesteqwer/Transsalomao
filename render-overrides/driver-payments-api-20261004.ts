import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

export type DriverPaymentRecord = {
  id: string;
  driverId: string;
  driverName: string;
  date: string;
  amount: number;
  note: string;
  periodStart: string;
  periodEnd: string;
  createdBy: string | null;
  createdAt: string;
};

const createSchema = z.object({
  driverId: z.string().trim().min(1),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  amount: z.number().positive().max(100_000_000),
  note: z.string().trim().max(500).default(""),
  periodStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  periodEnd: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
}).refine((data) => data.periodStart <= data.periodEnd, {
  message: "O início do período deve ser anterior ou igual ao fim.",
});

const deleteSchema = z.object({ id: z.string().trim().min(1) });

async function adminSql() {
  const { assertManagementSession } = await import("@/lib/management-auth.server");
  const session = assertManagementSession();
  const { neon } = await import("@neondatabase/serverless");
  const databaseUrl = String(process.env.DATABASE_URL || "").trim();
  if (!databaseUrl) throw new Error("Banco de dados não configurado.");
  return { sql: neon(databaseUrl), username: String(session.username || "Gerência") };
}

export const listDriverPayments = createServerFn({ method: "GET" }).handler(async () => {
  const { sql } = await adminSql();
  const rows = await sql`
    select
      p.id,
      p.driver_id,
      d.name as driver_name,
      to_char(p.payment_date, 'YYYY-MM-DD') as payment_date,
      p.amount,
      p.note,
      to_char(p.period_start, 'YYYY-MM-DD') as period_start,
      to_char(p.period_end, 'YYYY-MM-DD') as period_end,
      p.created_by,
      p.created_at
    from driver_payments p
    join drivers d on d.id = p.driver_id
    order by p.payment_date desc, p.created_at desc
  `;

  return rows.map((row: any) => ({
    id: String(row.id),
    driverId: String(row.driver_id),
    driverName: String(row.driver_name || "Motorista"),
    date: String(row.payment_date),
    amount: Number(row.amount || 0),
    note: String(row.note || ""),
    periodStart: String(row.period_start),
    periodEnd: String(row.period_end),
    createdBy: row.created_by == null ? null : String(row.created_by),
    createdAt: String(row.created_at || ""),
  })) satisfies DriverPaymentRecord[];
});

export const createDriverPayment = createServerFn({ method: "POST" })
  .validator(createSchema)
  .handler(async ({ data }) => {
    const { sql, username } = await adminSql();
    const driver = await sql`select id from drivers where id = ${data.driverId} limit 1`;
    if (driver.length !== 1) throw new Error("Motorista não encontrado.");

    const { randomUUID } = await import("node:crypto");
    const id = "driver_payment_" + randomUUID();
    await sql`
      insert into driver_payments (
        id, driver_id, payment_date, amount, note,
        period_start, period_end, created_by, created_at
      )
      values (
        ${id}, ${data.driverId}, ${data.date}, ${data.amount}, ${data.note},
        ${data.periodStart}, ${data.periodEnd}, ${username}, now()
      )
    `;
    return { ok: true as const, id };
  });

export const deleteDriverPayment = createServerFn({ method: "POST" })
  .validator(deleteSchema)
  .handler(async ({ data }) => {
    const { sql } = await adminSql();
    const deleted = await sql`
      delete from driver_payments
      where id = ${data.id}
      returning id
    `;
    if (deleted.length !== 1) throw new Error("Pagamento não encontrado.");
    return { ok: true as const };
  });
