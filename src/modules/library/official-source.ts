import { createHash } from 'node:crypto';
import type { DiscoveredLibraryResource, LibraryPlatform } from './types';

const TRACKING_PARAMS = new Set([
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_term',
  'utm_content',
  'si',
  'feature',
]);

/** Stable URL used for deduplication. It never invents or follows a destination. */
export function canonicalizeResourceUrl(raw: string): string {
  const url = new URL(raw);
  url.hash = '';
  for (const key of [...url.searchParams.keys()]) {
    if (TRACKING_PARAMS.has(key.toLowerCase())) url.searchParams.delete(key);
  }
  if (url.pathname.length > 1) url.pathname = url.pathname.replace(/\/+$/, '');
  url.hostname = url.hostname.toLowerCase();
  return url.toString();
}

export function metadataHash(resource: DiscoveredLibraryResource): string {
  return createHash('sha256')
    .update(
      JSON.stringify({
        externalId: resource.externalId,
        platform: resource.platform,
        title: resource.title,
        canonicalUrl: canonicalizeResourceUrl(resource.canonicalUrl),
        publishedAt: resource.publishedAt?.toISOString() ?? null,
        metadata: resource.metadata,
      }),
    )
    .digest('hex');
}

export function platformLabel(platform: LibraryPlatform): string {
  const labels: Record<LibraryPlatform, string> = {
    youtube: 'YouTube',
    spotify: 'Spotify',
    rss: 'sitio oficial',
    google_books: 'Google Books',
    pubmed: 'PubMed',
    website: 'sitio oficial',
  };
  return labels[platform];
}

export function slugifyResource(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 72);
}

