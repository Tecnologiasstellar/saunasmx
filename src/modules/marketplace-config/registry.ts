import { loadMarketplaceConfigs } from './loader';
import type { MarketplaceConfig } from './types';

/**
 * In-process registry of published marketplace configuration.
 *
 * docs/01-architecture.md requires cached configuration with explicit
 * invalidation. Outside production the cache is skipped so editing a YAML file
 * is visible on the next request.
 */

let cache: MarketplaceConfig[] | null = null;

function isProduction(): boolean {
  return process.env.APP_ENV === 'production' || process.env.NODE_ENV === 'production';
}

export function listMarketplaces(): MarketplaceConfig[] {
  if (!isProduction()) return loadMarketplaceConfigs();
  cache ??= loadMarketplaceConfigs();
  return cache;
}

export function invalidateMarketplaceRegistry(): void {
  cache = null;
}

export function getMarketplaceBySlug(slug: string): MarketplaceConfig | null {
  return listMarketplaces().find((config) => config.slug === slug) ?? null;
}

/** Throws when the slug is unknown. Use for trusted, server-side lookups. */
export function requireMarketplaceBySlug(slug: string): MarketplaceConfig {
  const config = getMarketplaceBySlug(slug);
  if (!config) throw new Error(`Unknown marketplace slug: ${slug}`);
  return config;
}
