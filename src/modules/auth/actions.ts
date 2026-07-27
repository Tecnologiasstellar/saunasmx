'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { getDb } from '../database/client';
import { getEmailProvider } from '../messaging/email';
import { log } from '../observability/logger';
import { clientKey, rateLimit } from '../security/rate-limit';
import { headers } from 'next/headers';
import { issueLoginToken, revokeSession, SESSION_COOKIE } from './session';

/**
 * Magic-link sign in.
 *
 * The login email is sent directly rather than through the outbox: no business
 * record depends on it, the user is waiting for it, and "request another link"
 * is a better retry than a background queue.
 */

const LOGIN_REQUESTS_PER_HOUR = 5;

/**
 * Brute-force control. Fixed at 5/hour in production and not overridable there:
 * an env var that can weaken this is a bigger risk than the inconvenience it
 * saves. Outside production a browser suite signs many seeded users in from one
 * address, so it may raise the ceiling.
 */
function loginRequestsPerHour(): number {
  if (process.env.APP_ENV === 'production') return LOGIN_REQUESTS_PER_HOUR;
  const override = Number(process.env.LOGIN_REQUESTS_PER_HOUR);
  return Number.isInteger(override) && override > 0 ? override : LOGIN_REQUESTS_PER_HOUR;
}

export async function requestLoginLink(formData: FormData): Promise<void> {
  const email = String(formData.get('email') ?? '').trim().toLowerCase();
  const next = String(formData.get('next') ?? '/portal');

  const headerList = await headers();
  const limit = rateLimit(clientKey(headerList, 'login'), loginRequestsPerHour(), 3600);
  if (!limit.allowed) redirect('/entrar?error=rate_limited');

  const db = await getDb();
  const issued = await issueLoginToken(db, email);

  // Always report success: this form must not reveal which emails exist.
  if (!issued) {
    log.warn('auth.login_requested_unknown_email');
    redirect(`/entrar?sent=1&next=${encodeURIComponent(next)}`);
  }

  const origin = headerList.get('x-forwarded-host') ?? headerList.get('host') ?? 'localhost:3000';
  const protocol = process.env.APP_ENV === 'production' ? 'https' : 'http';
  const link = `${protocol}://${origin}/entrar/verificar?token=${issued.token}&next=${encodeURIComponent(next)}`;

  try {
    await getEmailProvider().send({
      to: email,
      subject: 'Tu enlace de acceso',
      text: `Entra con este enlace. Caduca en 20 minutos y solo puede usarse una vez.\n\n${link}`,
    });
  } catch (error) {
    log.error('auth.login_email_failed', { error: (error as Error).message });
    redirect('/entrar?error=email_failed');
  }

  // Outside production the link is surfaced in the UI so local development and
  // E2E tests need no mailbox. Never in production.
  if (process.env.APP_ENV !== 'production') {
    redirect(`/entrar?sent=1&devToken=${encodeURIComponent(issued.token)}&next=${encodeURIComponent(next)}`);
  }
  redirect(`/entrar?sent=1&next=${encodeURIComponent(next)}`);
}

export async function signOut(): Promise<void> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (token) {
    const db = await getDb();
    await revokeSession(db, token);
  }
  store.delete(SESSION_COOKIE);
  redirect('/entrar');
}
