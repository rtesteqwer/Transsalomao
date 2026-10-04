import { getVercelOidcToken } from "@vercel/oidc";

export function salomaoModel() {
  return process.env.QWEN3_VL_MODEL?.trim() || "alibaba/qwen3-vl-instruct";
}

export async function getSalomaoOpenAIKeys() {
  const token =
    process.env.QWEN3_VL_API_KEY?.trim() ||
    process.env.AI_GATEWAY_API_KEY?.trim() ||
    process.env.VERCEL_OIDC_TOKEN?.trim() ||
    "";
  return token ? [token] : [];
}

export function felipeIaUrl() {
  return (process.env.FELIPE_IA_URL?.trim() || "https://felipe-ia-transsalomao.vercel.app").replace(/\/$/, "");
}

export function felipeIaConfigured() {
  return true;
}

type FelipeTurn = { role: "user" | "assistant"; content: string };

export async function askFelipeIa(input: {
  message: string;
  history?: FelipeTurn[];
  context?: unknown;
  task?: string;
}) {
  const oidcToken = (await getVercelOidcToken())?.trim();
  if (!oidcToken) throw new Error("VERCEL_OIDC_TOKEN_UNAVAILABLE");

  const response = await fetch(felipeIaUrl() + "/api/transsalomao", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${oidcToken}`,
      "Content-Type": "application/json",
      "X-Trans-Salomao": "1",
      "x-vercel-trusted-oidc-idp-token": oidcToken,
    },
    body: JSON.stringify({
      message: String(input.message || "").slice(0, 12000),
      history: Array.isArray(input.history) ? input.history.slice(-24) : [],
      context: input.context ?? null,
      task: String(input.task || "answer").slice(0, 80),
    }),
    signal: AbortSignal.timeout(110000),
  });

  const data: any = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(String(data?.error || data?.code || `FELIPE_IA_HTTP_${response.status}`));
  }

  const text = String(data?.text || "").trim();
  if (!text) throw new Error("FELIPE_IA_EMPTY_RESPONSE");

  return {
    text,
    model: String(data?.model || "Felipe IA Cloud"),
  };
}
