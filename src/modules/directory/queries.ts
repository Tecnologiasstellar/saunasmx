import { and, asc, eq, inArray, ne, sql } from 'drizzle-orm';
import type { Database } from '../database/client';
import { directoryProfile, providerMarketplace } from '../database/schema';
import type { DirectoryKind } from './details';

/**
 * Public read model for the directory.
 *
 * One predicate governs every query in this file: a profile is public only when
 * an operator published it *and* the research evidence supports a public page.
 * `verify` records — an announced-but-unopened club, a listing whose only source
 * is a third-party marketplace page — are invisible here no matter what the
 * publication column says. Both halves are enforced in SQL rather than filtered
 * afterwards, so a new call site cannot forget one.
 *
 * Nothing is returned that the row does not store. There is no rating, no
 * review count and no distance, because there is no column for any of them.
 */

export type DirectoryRow = typeof directoryProfile.$inferSelect;

/** Published, and backed by evidence strong enough to show a stranger. */
function isPublic(marketplaceId: string, kind?: DirectoryKind) {
  return and(
    eq(directoryProfile.marketplaceId, marketplaceId),
    eq(directoryProfile.publicationStatus, 'published'),
    inArray(directoryProfile.evidenceStatus, ['core', 'secondary']),
    ...(kind ? [eq(directoryProfile.kind, kind)] : []),
  );
}

export type ProfileFilters = {
  /** Exact `directory_profile.state`. */
  state?: string;
  limit?: number;
};

const DEFAULT_LIMIT = 100;

export async function listPublicProfiles(
  db: Database,
  marketplaceId: string,
  kind: DirectoryKind,
  filters: ProfileFilters = {},
): Promise<DirectoryRow[]> {
  const where = filters.state
    ? and(isPublic(marketplaceId, kind), eq(directoryProfile.state, filters.state))
    : isPublic(marketplaceId, kind);

  return db
    .select()
    .from(directoryProfile)
    .where(where)
    // `core` before `secondary`: the enum's own order is the confidence order,
    // so the best-evidenced listings lead the page without a separate column.
    .orderBy(asc(directoryProfile.evidenceStatus), asc(directoryProfile.name))
    .limit(filters.limit ?? DEFAULT_LIMIT);
}

export async function getPublicProfile(
  db: Database,
  marketplaceId: string,
  kind: DirectoryKind,
  slug: string,
): Promise<DirectoryRow | null> {
  const [row] = await db
    .select()
    .from(directoryProfile)
    .where(and(isPublic(marketplaceId, kind), eq(directoryProfile.slug, slug)))
    .limit(1);
  return row ?? null;
}

/**
 * Neighbours for the bottom of a profile page: same state first, then anything
 * else public of the same kind. Deliberately not "most recent" — a directory
 * that shows an unrelated listing is padding, and one that shows the same three
 * every time teaches a visitor to ignore the section.
 */
export async function listRelatedProfiles(
  db: Database,
  marketplaceId: string,
  kind: DirectoryKind,
  args: { excludeId: string; state?: string | null; limit: number },
): Promise<DirectoryRow[]> {
  const notItself = and(isPublic(marketplaceId, kind), ne(directoryProfile.id, args.excludeId));

  const sameState = args.state
    ? await db
        .select()
        .from(directoryProfile)
        .where(and(notItself, eq(directoryProfile.state, args.state)))
        .orderBy(asc(directoryProfile.evidenceStatus), asc(directoryProfile.name))
        .limit(args.limit)
    : [];

  if (sameState.length >= args.limit) return sameState;

  const seen = new Set(sameState.map((row) => row.id));
  const rest = await db
    .select()
    .from(directoryProfile)
    .where(notItself)
    .orderBy(asc(directoryProfile.evidenceStatus), asc(directoryProfile.name))
    .limit(args.limit + seen.size);

  return [...sameState, ...rest.filter((row) => !seen.has(row.id))].slice(0, args.limit);
}

/** The states that actually have public profiles. Drives the filter UI, so it can never offer an empty result. */
export async function listPublicStates(db: Database, marketplaceId: string, kind: DirectoryKind): Promise<string[]> {
  const rows = await db
    .selectDistinct({ state: directoryProfile.state })
    .from(directoryProfile)
    .where(isPublic(marketplaceId, kind))
    .orderBy(asc(directoryProfile.state));
  return rows.map((row) => row.state).filter((state): state is string => !!state);
}

export async function countPublicProfiles(db: Database, marketplaceId: string, kind: DirectoryKind): Promise<number> {
  const [row] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(directoryProfile)
    .where(isPublic(marketplaceId, kind));
  return row?.total ?? 0;
}

/** Every public profile path, for the sitemap. */
export async function listPublicPaths(db: Database, marketplaceId: string): Promise<string[]> {
  const rows = await db
    .select({ kind: directoryProfile.kind, slug: directoryProfile.slug })
    .from(directoryProfile)
    .where(isPublic(marketplaceId))
    .orderBy(asc(directoryProfile.kind), asc(directoryProfile.slug));
  return rows.map((row) => `${row.kind === 'place' ? '/lugares' : '/proveedores'}/${row.slug}`);
}

/**
 * Which of these profiles belong to a provider approved on this marketplace.
 *
 * A directory listing is research about a business; approval is that business
 * having signed up and been reviewed. Only the second earns a verified badge,
 * so the badge is resolved from `provider_marketplace` rather than from
 * anything the import wrote.
 */
export async function approvedProviderIds(
  db: Database,
  marketplaceId: string,
  rows: DirectoryRow[],
): Promise<Set<string>> {
  const companyIds = rows.map((row) => row.providerCompanyId).filter((id): id is string => !!id);
  if (companyIds.length === 0) return new Set();

  const approved = await db
    .select({ id: providerMarketplace.providerCompanyId })
    .from(providerMarketplace)
    .where(
      and(
        eq(providerMarketplace.marketplaceId, marketplaceId),
        eq(providerMarketplace.status, 'approved'),
        inArray(providerMarketplace.providerCompanyId, companyIds),
      ),
    );

  return new Set(approved.map((row) => row.id));
}
