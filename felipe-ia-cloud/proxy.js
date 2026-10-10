import { createHmac, timingSafeEqual } from 'node:crypto';
import { NextResponse } from 'next/server';

const COOKIE = 'felipe_ia_session';
const PUBLIC_PATHS = new Set(['/login', '/setup-required', '/api/auth/login']);

function validSession(request) {
  const secret = process.env.FELIPE_IA_SESSION_SECRET;
  if (!secret) return false;

  const value = request.cookies.get(COOKIE)?.value || '';
  const separator = value.indexOf('.');
  if (separator < 1) return false;

  const expires = value.slice(0, separator);
  const signature = value.slice(separator + 1);
  if (!/^\d{13}$/.test(expires) || Number(expires) <= Date.now() || !/^[a-f0-9]{64}$/.test(signature)) {
    return false;
  }

  const expected = createHmac('sha256', secret)
    .update('felipe-ia-session-v1:' + expires)
    .digest();
  const received = Buffer.from(signature, 'hex');
  return received.length === expected.length && timingSafeEqual(received, expected);
}

export function proxy(request) {
  const { pathname } = request.nextUrl;
  if (
    pathname.startsWith('/_next/') ||
    pathname === '/favicon.ico' ||
    pathname === '/robots.txt' ||
    pathname === '/sitemap.xml'
  ) return NextResponse.next();

  const configured = Boolean(
    process.env.FELIPE_IA_ACCESS_PASSWORD &&
    process.env.FELIPE_IA_SESSION_SECRET
  );

  if (!configured) {
    if (pathname === '/setup-required') return NextResponse.next();
    return NextResponse.redirect(new URL('/setup-required', request.url));
  }

  if (PUBLIC_PATHS.has(pathname)) {
    if (pathname === '/login' && validSession(request)) {
      return NextResponse.redirect(new URL('/', request.url));
    }
    return NextResponse.next();
  }

  if (pathname.startsWith('/api/') && !['GET', 'HEAD', 'OPTIONS'].includes(request.method)) {
    const origin = request.headers.get('origin');
    if (!origin || origin !== request.nextUrl.origin) {
      return NextResponse.json({ error: 'Origem da requisição não autorizada.' }, { status: 403 });
    }
  }

  if (!validSession(request)) {
    if (pathname.startsWith('/api/')) {
      return NextResponse.json({ error: 'Sessão ausente ou expirada. Entre novamente.' }, {
        status: 401,
        headers: { 'Cache-Control': 'no-store' }
      });
    }
    const loginUrl = new URL('/login', request.url);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml).*)']
};
