import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

export async function POST() {
  const response = NextResponse.json({ ok: true }, {
    headers: { 'Cache-Control': 'no-store' }
  });
  response.cookies.set('felipe_ia_session', '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/',
    maxAge: 0
  });
  return response;
}
