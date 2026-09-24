import { getSql } from "@/lib/db";

export function salomaoModel() {
  return process.env.OPENAI_ASSISTANT_MODEL?.trim() || "gpt-5.6-sol";
}

export async function getSalomaoOpenAIKeys() {
  const keys: string[] = [];

  // A Salomão IA pode guardar uma credencial privada no próprio banco.
  try {
    const sql = await getSql();
    const rows = await sql<{ secret_value: string }>`
      select secret_value
      from assistant_secrets
      where name = 'openai_api_key'
        and length(btrim(secret_value)) > 20
      order by 1
      limit 1
    `;
    const dbKey = rows[0]?.secret_value?.trim();
    if (dbKey) keys.push(dbKey);
  } catch {
    // Instalações antigas podem não ter a tabela; nesse caso usa o ambiente.
  }

  const envKey = process.env.OPENAI_API_KEY?.trim();
  if (envKey) keys.push(envKey);

  return [...new Set(keys)];
}
