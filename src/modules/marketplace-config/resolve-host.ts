import type { MarketplaceConfig } from './types';

/**
 * Host → marketplace resolution.
 *
 * Pure function over an explicit config list so it is directly unit-testable.
 * See docs/01-architecture.md ("Request-time tenant resolution") and the
 * foundation gate in docs/13-acceptance-criteria.md.
 *
 * Authorization never derives from a client-supplied marketplace id; it derives
 * from the resolved host or from a server-side session.
 */

export type HostResolution =
  | { kind: 'canonical'; config: MarketplaceConfig }
  | { kind: 'redirect'; config: MarketplaceConfig; canonicalHost: string }
  | { kind: 'unknown'; host: string };

/** Strips protocol, path, credentials, whitespace and case from a Host header. */
export function normalizeHost(rawHost: string | null | undefined): string {
  if (!rawHost) return '';
  let host = rawHost.trim().toLowerCase();
  // A Host header should never contain these, but proxies and tests are messy.
  host = host.replace(/^https?:\/\//, '');
  const at = host.lastIndexOf('@');
  if (at !== -1) host = host.slice(at + 1);
  host = host.split('/')[0] ?? '';
  host = host.split('?')[0] ?? '';
  // Default ports carry no meaning for identity.
  host = host.replace(/:(80|443)$/, '');
  // A trailing dot is a valid FQDN form but not how configs are written.
  host = host.replace(/\.$/, '');
  return host;
}

/**
 * Development host overrides, e.g. `localhost:3000=suanas-mx,pergolas.localhost:3000=pergolas-mx`.
 * Ignored in production so a stray env var cannot repoint a live domain.
 */
export function parseHostMap(value: string | undefined): Map<string, string> {
  const map = new Map<string, string>();
  if (!value) return map;
  for (const pair of value.split(',')) {
    const [host, slug] = pair.split('=').map((part) => part?.trim());
    if (host && slug) map.set(normalizeHost(host), slug);
  }
  return map;
}

export function resolveHost(
  rawHost: string | null | undefined,
  configs: MarketplaceConfig[],
  options: { hostMap?: Map<string, string> } = {},
): HostResolution {
  const host = normalizeHost(rawHost);
  if (!host) return { kind: 'unknown', host: '' };

  const mappedSlug = options.hostMap?.get(host);
  if (mappedSlug) {
    const config = configs.find((candidate) => candidate.slug === mappedSlug);
    // A dev mapping is treated as canonical; redirecting localhost to the real
    // domain would make local development impossible.
    if (config) return { kind: 'canonical', config };
    return { kind: 'unknown', host };
  }

  for (const config of configs) {
    if (normalizeHost(config.domain) === host) return { kind: 'canonical', config };
  }

  for (const config of configs) {
    if (config.aliases.some((alias) => normalizeHost(alias) === host)) {
      return { kind: 'redirect', config, canonicalHost: normalizeHost(config.domain) };
    }
  }

  return { kind: 'unknown', host };
}
