export const runtime = 'nodejs';

export async function GET() {
  return Response.json({
    ok: true,
    service: 'Felipe IA Cloud',
    cloud: true,
    ubuntuRequired: false,
    ollamaRequired: false,
    models: {
      assistant: process.env.FELIPE_MODEL || 'alibaba/qwen3-vl-thinking',
      code: process.env.FELIPE_CODE_MODEL || 'alibaba/qwen3-coder-next'
    }
  });
}
