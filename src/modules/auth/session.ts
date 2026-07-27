import { createHash, randomBytes } from 'node:crypto';
import { and, eq, gt, isNull } from 'drizzle-orm';
import type { Database } from '../database/client';
import { appUser, authSession, loginToken, providerTeamMembership, userRole } from '../database/schema';

/**
 * Session and role model.
 *
 * Passwordless by design: a short-lived emailed token is exchanged for a
 * session. Only hashes are stored, so a database leak does not yield usable
 * sessions or login links.
 *
 * The interface is deliberately small — swapping in Supabase Auth later means
 * replacing `issueLoginToken` / `consumeLoginToken` and keeping everything
 * below `resolveSession` unchanged.
 */

export const SESSION_COOKIE = 'mos_session';
export const SESSION_TTL_DAYS = 30;
export const LOGIN_TOKEN_TTL_MINUTES = 20;

export type AppRole =
  | 'consumer'
  | 'provider_owner'
  | 'provider_member'
  | 'operator'
  | 'content_editor'
  | 'finance_operator'
  | 'admin';

export type Session = {
  userId: string;
  email: string;
  name: string | null;
  roles: AppRole[];
  /** Companies this user may act for. Empty for operators. */
  providerCompanyIds: string[];
};

function hashToken(raw: string): string {
  return createHash('sha256').update(raw).digest('hex');
}

function newToken(): string {
  return randomBytes(32).toString('base64url');
}

/**
 * Issues a login token for an existing user.
 *
 * Returns null when the email is unknown — the caller must still report success
 * to the client, so the form cannot be used to enumerate accounts.
 */
export async function issueLoginToken(
  db: Database,
  email: string,
  now = new Date(),
): Promise<{ token: string; userId: string } | null> {
  const normalized = email.trim().toLowerCase();
  const [user] = await db.select({ id: appUser.id, status: appUser.status }).from(appUser).where(eq(appUser.email, normalized)).limit(1);
  if (!user || user.status === 'suspended') return null;

  const token = newToken();
  await db.insert(loginToken).values({
    email: normalized,
    tokenHash: hashToken(token),
    expiresAt: new Date(now.getTime() + LOGIN_TOKEN_TTL_MINUTES * 60_000),
  });
  return { token, userId: user.id };
}

/** Exchanges a login token for a session token. Single use. */
export async function consumeLoginToken(db: Database, token: string, now = new Date()): Promise<string | null> {
  const tokenHash = hashToken(token);

  return db.transaction(async (tx) => {
    const [row] = await tx
      .select()
      .from(loginToken)
      .where(and(eq(loginToken.tokenHash, tokenHash), isNull(loginToken.consumedAt), gt(loginToken.expiresAt, now)))
      .limit(1);
    if (!row) return null;

    // Marking consumed inside the transaction makes a replayed link a no-op.
    await tx.update(loginToken).set({ consumedAt: now }).where(eq(loginToken.id, row.id));

    const [user] = await tx.select({ id: appUser.id }).from(appUser).where(eq(appUser.email, row.email)).limit(1);
    if (!user) return null;

    const sessionToken = newToken();
    await tx.insert(authSession).values({
      userId: user.id,
      tokenHash: hashToken(sessionToken),
      expiresAt: new Date(now.getTime() + SESSION_TTL_DAYS * 86_400_000),
    });
    return sessionToken;
  });
}

export async function resolveSession(db: Database, sessionToken: string | undefined, now = new Date()): Promise<Session | null> {
  if (!sessionToken) return null;

  const [row] = await db
    .select({ userId: authSession.userId })
    .from(authSession)
    .where(
      and(
        eq(authSession.tokenHash, hashToken(sessionToken)),
        isNull(authSession.revokedAt),
        gt(authSession.expiresAt, now),
      ),
    )
    .limit(1);
  if (!row) return null;

  const [user] = await db.select().from(appUser).where(eq(appUser.id, row.userId)).limit(1);
  if (!user || user.status !== 'active') return null;

  const roles = await db.select({ role: userRole.role }).from(userRole).where(eq(userRole.userId, user.id));
  const memberships = await db
    .select({ providerCompanyId: providerTeamMembership.providerCompanyId })
    .from(providerTeamMembership)
    .where(eq(providerTeamMembership.userId, user.id));

  return {
    userId: user.id,
    email: user.email,
    name: user.name,
    roles: roles.map((entry) => entry.role),
    providerCompanyIds: memberships.map((entry) => entry.providerCompanyId),
  };
}

export async function revokeSession(db: Database, sessionToken: string, now = new Date()): Promise<void> {
  await db.update(authSession).set({ revokedAt: now }).where(eq(authSession.tokenHash, hashToken(sessionToken)));
}

export function hasRole(session: Session | null, ...roles: AppRole[]): boolean {
  if (!session) return false;
  return session.roles.some((role) => roles.includes(role));
}

export function isOperator(session: Session | null): boolean {
  return hasRole(session, 'operator', 'admin');
}

/** Deny by default: a company id is usable only if the session actually holds it. */
export function canActForCompany(session: Session | null, providerCompanyId: string): boolean {
  if (!session) return false;
  return session.providerCompanyIds.includes(providerCompanyId);
}
