import { neon } from "@neondatabase/serverless";
import bcrypt from "bcryptjs";

const databaseUrl = String(process.env.DATABASE_URL || "").trim();
const password = String(process.env.MURILLO_PASSWORD_RESET || "");

if (!databaseUrl) throw new Error("[murillo-password-reset] DATABASE_URL ausente");
if (!password) throw new Error("[murillo-password-reset] senha temporária ausente");

const sql = neon(databaseUrl);
const hash = await bcrypt.hash(password, 12);

const rows = await sql`
  update management_users
  set password_hash = ${hash},
      must_change_password = false,
      updated_at = now()
  where lower(username) = lower('Murillo')
    and status = 'ativo'
  returning username
`;

if (rows.length !== 1) {
  throw new Error("[murillo-password-reset] usuário Murillo ativo não encontrado de forma única");
}

console.log("[murillo-password-reset] senha atualizada para " + rows[0].username);
