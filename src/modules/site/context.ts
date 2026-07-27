import { headers } from 'next/headers';
import { listMarketplaces } from '../marketplace-config/registry';
import { parseHostMap, resolveHost, type HostResolution } from '../marketplace-config/resolve-host';
import type { MarketplaceConfig } from '../marketplace-config/types';

/**
 * Request-time tenant resolution for server components.
 *
 * The marketplace always comes from the Host header (or a development host
 * map). A client can never select its tenant, so authorization decisions made
 * downstream cannot be steered by a request body or query parameter.
 */

export async function resolveRequestHost(): Promise<HostResolution> {
  const headerList = await headers();
  const host = headerList.get('x-forwarded-host') ?? headerList.get('host');
  const hostMap = isProduction() ? undefined : parseHostMap(process.env.LOCAL_HOST_MAP);
  return resolveHost(host, listMarketplaces(), { hostMap });
}

export function isProduction(): boolean {
  return process.env.APP_ENV === 'production';
}

/** Absolute canonical origin for the marketplace, used for canonical URLs and links in email. */
export function canonicalOrigin(config: MarketplaceConfig): string {
  if (isProduction()) return `https://${config.domain}`;
  const devHost = [...parseHostMap(process.env.LOCAL_HOST_MAP).entries()].find(([, slug]) => slug === config.slug)?.[0];
  return devHost ? `http://${devHost}` : `https://${config.domain}`;
}
