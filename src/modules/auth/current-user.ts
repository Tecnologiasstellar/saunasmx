import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { getDb } from '../database/client';
import { DomainError, ERROR_CODES } from '../errors';
import { hasRole, isOperator, resolveSession, SESSION_COOKIE, type Session } from './session';

/**
 * Server-side session access for pages, server actions and route handlers.
 *
 * Authorization is enforced here and in every query that touches
 * provider-scoped data. Nothing trusts a value supplied by the client.
 */

export async function currentSession(): Promise<Session | null> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const db = await getDb();
  return resolveSession(db, token);
}

export async function requireOperator(returnTo = '/ops'): Promise<Session> {
  const session = await currentSession();
  if (!session) redirect(`/entrar?next=${encodeURIComponent(returnTo)}`);
  if (!isOperator(session)) redirect('/entrar?error=forbidden');
  return session;
}

export async function requireContentEditor(returnTo = '/ops/biblioteca'): Promise<Session> {
  const session = await currentSession();
  if (!session) redirect(`/entrar?next=${encodeURIComponent(returnTo)}`);
  if (!hasRole(session, 'content_editor', 'operator', 'admin')) redirect('/entrar?error=forbidden');
  return session;
}

/**
 * Commercial records: operators, admins, and the finance role that exists
 * precisely so billing work does not require full operator rights.
 */
export async function requireFinanceAccess(returnTo = '/ops/planes'): Promise<Session> {
  const session = await currentSession();
  if (!session) redirect(`/entrar?next=${encodeURIComponent(returnTo)}`);
  if (!hasRole(session, 'operator', 'admin', 'finance_operator')) redirect('/entrar?error=forbidden');
  return session;
}

/** A provider user with at least one company. */
export async function requireProviderUser(returnTo = '/portal'): Promise<Session> {
  const session = await currentSession();
  if (!session) redirect(`/entrar?next=${encodeURIComponent(returnTo)}`);
  if (session.providerCompanyIds.length === 0) redirect('/entrar?error=forbidden');
  return session;
}

/** Throws rather than redirects — for server actions and API handlers. */
export function assertCompanyAccess(session: Session, providerCompanyId: string): void {
  if (!session.providerCompanyIds.includes(providerCompanyId)) {
    throw new DomainError(ERROR_CODES.FORBIDDEN, 'You do not have access to this company.', 403);
  }
}
