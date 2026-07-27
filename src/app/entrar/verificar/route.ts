import { NextResponse, type NextRequest } from 'next/server';
import { consumeLoginToken, SESSION_COOKIE, SESSION_TTL_DAYS } from '@/modules/auth/session';
import { getDb } from '@/modules/database/client';
import { log } from '@/modules/observability/logger';

/**
 * Exchanges a magic-link token for a session cookie.
 *
 * A route handler rather than a page: cookies may only be set on a response,
 * not during a server component render.
 */
export const runtime = 'nodejs';

/**
 * The origin the browser actually asked for. `request.url` can carry the
 * server's own origin, which would redirect the user to a different host than
 * the one the session cookie was set for.
 */
function requestOrigin(request: NextRequest): string {
  const host = request.headers.get('x-forwarded-host') ?? request.headers.get('host');
  if (!host) return request.nextUrl.origin;
  const protocol = request.headers.get('x-forwarded-proto') ?? (process.env.APP_ENV === 'production' ? 'https' : 'http');
  return `${protocol}://${host}`;
}

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get('token');
  const requestedNext = request.nextUrl.searchParams.get('next');
  // Relative paths only — an attacker-supplied `next` must not become an open redirect.
  const next = requestedNext && requestedNext.startsWith('/') && !requestedNext.startsWith('//') ? requestedNext : '/portal';

  const origin = requestOrigin(request);

  if (!token) return NextResponse.redirect(new URL('/entrar?error=invalid_token', origin));

  const db = await getDb();
  const sessionToken = await consumeLoginToken(db, token);
  if (!sessionToken) {
    log.warn('auth.login_token_rejected');
    return NextResponse.redirect(new URL('/entrar?error=invalid_token', origin));
  }

  const response = NextResponse.redirect(new URL(next, origin));
  response.cookies.set(SESSION_COOKIE, sessionToken, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.APP_ENV === 'production',
    path: '/',
    maxAge: SESSION_TTL_DAYS * 86_400,
  });
  log.info('auth.session_created');
  return response;
}
