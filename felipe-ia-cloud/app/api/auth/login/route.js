import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

export async function POST(request) {
  try {
    const expectedOrigin = new URL(request.url).origin;
    if (request.headers.get('origin') !== expectedOrigin) {
      return Response.json({ error: 'Origem não autorizada.' }, { status: 403 });
    }

    const password = process.env.FELIPE_IA_ACCESS_PASSWORD;
    const secret = process.env.FELIPE_IA_SESSION_SECRET;
    if (!password || !secret) {
      return Response.json({ error: 'A autenticação ainda não foi configurada no servidor.' }, { status: 503 });
    }

    const length = Number(request.headers.get('content-length') || 0);
    if (length > 4096) {
      return Response.json({ error: 'Requisição muito grande.' }, { status: 413 });
    }

    const body = await request.json();
    const supplied = typeof body?.password === 'string' ? body.password : '';
    if (!supplied || supplied.length > 512) {
      return Response.json({ error: 'Código de acesso inválido.' }, { status: 401 });
    }

    const suppliedHash = createHash('sha256').update(supplied).digest();
    const expectedHash = createHash('sha256').update(password).digest();
    if (!timingSafeEqual(suppliedHash, expectedHash)) {
      return Response.json({ error: 'Código de acesso inválido.' }, {
        status: 401,
        headers: { 'Cache-Control': 'no-store' }
      });
    }

    const expires = String(Date.now() + 8 * 60 * 60 * 1000);
    const signature = createHmac('sha256', secret)
      .update('felipe-ia-session-v1:' + expires)
      .digest('hex');
    const response = NextResponse.json({ ok: true }, {
      headers: { 'Cache-Control': 'no-store' }
    });

    response.cookies.set('felipe_ia_session', expires + '.' + signature, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      path: '/',
      maxAge: 8 * 60 * 60
    });
    return response;
  } catch {
    return Response.json({ error: 'Não foi possível iniciar a sessão.' }, { status: 400 });
  }
}
