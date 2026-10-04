const DEFAULT_QWEN3_VL_MODEL = "alibaba/qwen3-vl-instruct";
const DEFAULT_QWEN3_VL_RESPONSES_URL = "https://ai-gateway.vercel.sh/v1/responses";

export function qwen3VlModel() {
  return process.env.QWEN3_VL_MODEL?.trim() || DEFAULT_QWEN3_VL_MODEL;
}

export function qwen3VlResponsesUrl() {
  return process.env.QWEN3_VL_RESPONSES_URL?.trim() || DEFAULT_QWEN3_VL_RESPONSES_URL;
}

export function qwen3VlToken() {
  return (
    process.env.QWEN3_VL_API_KEY?.trim() ||
    process.env.AI_GATEWAY_API_KEY?.trim() ||
    process.env.VERCEL_OIDC_TOKEN?.trim() ||
    ""
  );
}

export function qwen3VlConfigured() {
  return Boolean(qwen3VlToken());
}
