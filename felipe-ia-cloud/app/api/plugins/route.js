import { getPluginCatalog } from '../../../lib/plugins.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const plugins = await getPluginCatalog();
  return Response.json({ plugins }, {
    headers: {
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff'
    }
  });
}
