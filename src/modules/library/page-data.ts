import { getDb } from '../database/client';
import { getMarketplaceId } from '../marketplace-config/publish';
import type { MarketplaceConfig } from '../marketplace-config/types';
import { canonicalOrigin, isProduction, resolveRequestHost } from '../site/context';
import { getPublishedResource, listPublishedResources, type LibraryResourceCard, type LibraryResourceDetail } from './queries';
import type { LibraryResourceFormat } from './types';

const FORMATS = ['video', 'podcast_episode', 'book', 'article', 'research', 'report', 'course'] as const;

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function format(value: string | undefined): LibraryResourceFormat | undefined {
  return FORMATS.includes(value as LibraryResourceFormat) ? (value as LibraryResourceFormat) : undefined;
}

export async function loadLibraryIndex(
  searchParams: Record<string, string | string[] | undefined>,
): Promise<{ config: MarketplaceConfig; resources: LibraryResourceCard[]; query?: string; format?: LibraryResourceFormat } | null> {
  const resolution = await resolveRequestHost();
  if (resolution.kind === 'unknown' || !resolution.config.features.library) return null;
  const query = first(searchParams.q)?.trim() || undefined;
  const selectedFormat = format(first(searchParams.formato));
  const db = await getDb();
  const marketplaceId = await getMarketplaceId(db, resolution.config.slug);
  return {
    config: resolution.config,
    resources: await listPublishedResources(db, marketplaceId, { query, format: selectedFormat }),
    query,
    format: selectedFormat,
  };
}

export async function loadLibraryResource(
  slug: string,
): Promise<{ config: MarketplaceConfig; resource: LibraryResourceDetail; origin: string } | null> {
  const resolution = await resolveRequestHost();
  if (resolution.kind === 'unknown' || !resolution.config.features.library) return null;
  const resource = await getPublishedResource(
    await getDb(),
    await getMarketplaceId(await getDb(), resolution.config.slug),
    slug,
  );
  if (!resource) return null;
  return { config: resolution.config, resource, origin: canonicalOrigin(resolution.config) };
}

export function libraryIndexable(config: MarketplaceConfig): boolean {
  return isProduction() && config.seo.defaultIndexing;
}

