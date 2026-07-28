import { getDb } from '../database/client';
import { getMarketplaceId } from '../marketplace-config/publish';
import type { MarketplaceConfig } from '../marketplace-config/types';
import { canonicalOrigin, isProduction, resolveRequestHost } from '../site/context';
import type { DirectoryKind } from './details';
import {
  approvedProviderIds,
  countPublicProfiles,
  getPublicProfile,
  listPublicProfiles,
  listPublicStates,
  listRelatedProfiles,
} from './queries';
import { KIND_PATH, toProfileView, toProfileViews, type DirectoryProfileView } from './view-model';

/**
 * Everything the four directory routes need, so each route file stays a
 * composition rather than a copy of the one next to it (ADR-009: `src/app`
 * composes, it does not hold business rules).
 *
 * These pages render per request. Tenant resolution reads the Host header,
 * which already makes the route dynamic, so a profile an operator publishes or
 * edits is live on the next request — no rebuild, no cache to bust, no deploy.
 */

export type IndexData = {
  config: MarketplaceConfig;
  states: string[];
  activeState?: string;
  profiles: DirectoryProfileView[];
  total: number;
};

export type ProfileData = {
  config: MarketplaceConfig;
  profile: DirectoryProfileView;
  related: DirectoryProfileView[];
};

const RELATED_COUNT = 3;

/** Two published profiles is the point at which an index is worth a crawler's time. */
const MIN_PROFILES_TO_INDEX = 2;

function firstParam(params: Record<string, string | string[] | undefined>, key: string): string | undefined {
  const raw = params[key];
  const first = Array.isArray(raw) ? raw[0] : raw;
  return first && first.length > 0 ? first : undefined;
}

export async function loadIndex(
  kind: DirectoryKind,
  searchParams: Record<string, string | string[] | undefined>,
): Promise<IndexData | null> {
  const resolution = await resolveRequestHost();
  if (resolution.kind === 'unknown') return null;

  const db = await getDb();
  const marketplaceId = await getMarketplaceId(db, resolution.config.slug);

  const states = await listPublicStates(db, marketplaceId, kind);
  // Only a state this marketplace actually has survives, so a hand-typed query
  // string cannot render a filter chip that matches nothing.
  const candidate = firstParam(searchParams, 'estado');
  const activeState = candidate && states.includes(candidate) ? candidate : undefined;

  const rows = await listPublicProfiles(db, marketplaceId, kind, { state: activeState });
  const verified = await approvedProviderIds(db, marketplaceId, rows);

  return {
    config: resolution.config,
    states,
    activeState,
    profiles: toProfileViews(rows, verified),
    total: await countPublicProfiles(db, marketplaceId, kind),
  };
}

export async function loadProfile(kind: DirectoryKind, slug: string): Promise<ProfileData | null> {
  const resolution = await resolveRequestHost();
  if (resolution.kind === 'unknown') return null;

  const db = await getDb();
  const marketplaceId = await getMarketplaceId(db, resolution.config.slug);

  const row = await getPublicProfile(db, marketplaceId, kind, slug);
  if (!row) return null;

  const verified = await approvedProviderIds(db, marketplaceId, [row]);
  const profile = toProfileView(row, {
    verified: !!row.providerCompanyId && verified.has(row.providerCompanyId),
  });
  if (!profile) return null;

  const relatedRows = await listRelatedProfiles(db, marketplaceId, kind, {
    excludeId: row.id,
    state: row.state,
    limit: RELATED_COUNT,
  });

  return {
    config: resolution.config,
    profile,
    related: toProfileViews(relatedRows, await approvedProviderIds(db, marketplaceId, relatedRows)),
  };
}

/* -------------------------------------------------------------------------- */
/* Metadata                                                                   */
/* -------------------------------------------------------------------------- */

/** Indexing is earned: production, a marketplace that allows it, and enough listings to be useful. */
export function indexable(config: MarketplaceConfig, total: number): boolean {
  return isProduction() && config.seo.defaultIndexing && total >= MIN_PROFILES_TO_INDEX;
}

const DESCRIPTION_MAX = 158;

/**
 * A factual meta description built from stored fields.
 *
 * Trimmed on a word boundary so a snippet never ends mid-word, and never padded
 * with adjectives — the sentences come from the record's own source columns.
 */
export function metaDescription(profile: DirectoryProfileView): string {
  const full = [profile.blurb, profile.accessNote].filter(Boolean).join(' ');
  if (full.length <= DESCRIPTION_MAX) return full;
  const cut = full.slice(0, DESCRIPTION_MAX);
  const lastSpace = cut.lastIndexOf(' ');
  return `${cut.slice(0, lastSpace > 0 ? lastSpace : DESCRIPTION_MAX).replace(/[.,;:]$/, '')}…`;
}

export function profileTitle(profile: DirectoryProfileView): string {
  if (profile.kind === 'provider') return `${profile.name} · Proveedor de saunas`;
  return profile.locationLine ? `${profile.name} · Sauna en ${profile.locationLine}` : profile.name;
}

/* -------------------------------------------------------------------------- */
/* Structured data                                                            */
/* -------------------------------------------------------------------------- */

/**
 * Conservative JSON-LD: only fields the record actually establishes.
 *
 * No `aggregateRating`, no `priceRange`, no `openingHours`, no `image` — we
 * have not verified any of them, and marking up an unverified claim is both a
 * structured-data violation and a lie told at scale.
 */
export function profileJsonLd(profile: DirectoryProfileView, origin: string): Record<string, unknown> {
  const business: Record<string, unknown> = {
    '@type': profile.kind === 'place' ? 'LocalBusiness' : 'ProfessionalService',
    name: profile.name,
    url: `${origin}${profile.href}`,
  };

  if (profile.blurb) business.description = profile.blurb;
  if (profile.websiteUrl) business.sameAs = [profile.websiteUrl];
  if (profile.phone) business.telephone = profile.phone;

  if (profile.address || profile.locationLine) {
    business.address = {
      '@type': 'PostalAddress',
      ...(profile.address ? { streetAddress: profile.address } : {}),
      ...(profile.locationLine && profile.state && profile.locationLine !== profile.state
        ? { addressLocality: profile.locationLine.replace(`, ${profile.state}`, '') }
        : {}),
      ...(profile.state ? { addressRegion: profile.state } : {}),
      addressCountry: 'MX',
    };
  }

  const crumbs = [
    { name: 'Inicio', item: origin },
    { name: profile.kind === 'place' ? 'Lugares' : 'Proveedores', item: `${origin}${KIND_PATH[profile.kind]}` },
    { name: profile.name, item: `${origin}${profile.href}` },
  ];

  return {
    '@context': 'https://schema.org',
    '@graph': [
      business,
      {
        '@type': 'BreadcrumbList',
        itemListElement: crumbs.map((crumb, index) => ({
          '@type': 'ListItem',
          position: index + 1,
          name: crumb.name,
          item: crumb.item,
        })),
      },
    ],
  };
}

export async function siteOrigin(): Promise<string> {
  const resolution = await resolveRequestHost();
  return resolution.kind === 'unknown' ? 'https://saunas.mx' : canonicalOrigin(resolution.config);
}
