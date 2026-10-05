import { clearPluginCredential, writePluginCredential } from '../../../../../lib/plugin-auth.js';

export const runtime = 'nodejs';

const TOKEN_PROVIDERS = new Set(['github', 'vercel', 'neon']);

async function verifyCredential(provider, token) {
  const headers = {
    Authorization: 'Bearer ' + token,
    Accept: 'application/json'
  };

  let url = '';
  if (provider === 'github') {
    url = 'https://api.github.com/user';
    headers['X-GitHub-Api-Version'] = '2022-11-28';
    headers['User-Agent'] = 'Felipe-IA';
  } else if (provider === 'vercel') {
    url = 'https://api.vercel.com/v2/user';
  } else if (provider === 'neon') {
    url = 'https://console.neon.tech/api/v2/projects?limit=1';
  }

  const response = await fetch(url, { headers, cache: 'no-store' });
  if (!response.ok) {
    throw new Error('Credencial recusada pelo provedor (HTTP ' + response.status + ').');
  }
}

export async function POST(request, context) {
  try {
    const { provider } = await context.params;
    if (!TOKEN_PROVIDERS.has(provider)) {
      return Response.json({ error: 'Este plugin usa OAuth.' }, { status: 400 });
    }

    const body = await request.json();
    const token = String(body?.token || '').trim();
    if (token.length < 12 || token.length > 4096) {
      return Response.json({ error: 'Credencial inválida.' }, { status: 400 });
    }

    await verifyCredential(provider, token);
    await writePluginCredential(provider, { accessToken: token });

    return Response.json({ ok: true, provider });
  } catch (error) {
    return Response.json({
      error: error instanceof Error ? error.message : 'Não foi possível conectar o plugin.'
    }, { status: 400 });
  }
}

export async function DELETE(_request, context) {
  const { provider } = await context.params;
  await clearPluginCredential(provider);
  return Response.json({ ok: true, provider });
}
