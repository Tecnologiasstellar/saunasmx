import { describe, expect, it } from 'vitest';
import { normalizeHost, parseHostMap, resolveHost } from '@/modules/marketplace-config/resolve-host';
import type { MarketplaceConfig } from '@/modules/marketplace-config/types';

/**
 * Foundation gate (docs/13-acceptance-criteria.md):
 *   - One shared app resolves marketplace by host.
 *   - Canonical domain and alias redirect behaviour are tested.
 *   - Unknown host fails safely.
 */

function config(slug: string, domain: string, aliases: string[] = []): MarketplaceConfig {
  return {
    id: slug,
    slug,
    name: slug,
    domain,
    aliases,
    category: 'sauna',
    localization: { locale: 'es-MX', currency: 'MXN', country: 'MX' },
    themeKey: 'warm-wellness',
    nav: [],
    contact: { legalName: 'Test SA de CV', email: 'hola@example.com', social: { instagram: null, tiktok: null } },
    features: {},
    seo: { defaultIndexing: true, pageEligibility: 'x', primaryCta: 'y' },
    questionnaire: { id: 'q', version: 1, locale: 'es-MX', submitLabel: 'Enviar proyecto', steps: [] },
    matching: {
      version: 1,
      reviewPolicy: 'manual',
      distribution: { mode: 'curated', maxProviders: 2 },
      eligibility: { required: [] },
      answerMapping: { service: 'type', budget: 'budget' },
      scoring: {},
      tieBreakers: ['provider_id_asc'],
      explanationsRequired: true,
      aiRole: 'disabled',
    },
    configVersion: 'test',
  };
}

const CONFIGS = [config('suanas-mx', 'saunas.mx', ['www.saunas.mx']), config('pergolas-mx', 'pergolas.example.mx')];

describe('normalizeHost', () => {
  it.each([
    ['Saunas.MX', 'saunas.mx'],
    ['saunas.mx:443', 'saunas.mx'],
    ['saunas.mx:80', 'saunas.mx'],
    ['saunas.mx.', 'saunas.mx'],
    ['  saunas.mx  ', 'saunas.mx'],
    ['https://saunas.mx/guias', 'saunas.mx'],
    ['user:pass@saunas.mx', 'saunas.mx'],
    ['localhost:3000', 'localhost:3000'],
  ])('normalizes %s to %s', (input, expected) => {
    expect(normalizeHost(input)).toBe(expected);
  });

  it('returns an empty string for a missing host', () => {
    expect(normalizeHost(null)).toBe('');
    expect(normalizeHost(undefined)).toBe('');
  });
});

describe('resolveHost', () => {
  it('resolves the canonical domain', () => {
    const result = resolveHost('saunas.mx', CONFIGS);
    expect(result.kind).toBe('canonical');
    if (result.kind !== 'canonical') throw new Error('unreachable');
    expect(result.config.slug).toBe('suanas-mx');
  });

  it('resolves a second marketplace from the same shared code path', () => {
    const result = resolveHost('pergolas.example.mx', CONFIGS);
    expect(result.kind).toBe('canonical');
    if (result.kind !== 'canonical') throw new Error('unreachable');
    expect(result.config.slug).toBe('pergolas-mx');
  });

  it('redirects an alias to the canonical host', () => {
    const result = resolveHost('www.saunas.mx', CONFIGS);
    expect(result.kind).toBe('redirect');
    if (result.kind !== 'redirect') throw new Error('unreachable');
    expect(result.canonicalHost).toBe('saunas.mx');
    expect(result.config.slug).toBe('suanas-mx');
  });

  it('does not redirect the canonical host to itself', () => {
    expect(resolveHost('saunas.mx', CONFIGS).kind).toBe('canonical');
  });

  it('is case and port insensitive', () => {
    expect(resolveHost('SAUNAS.MX:443', CONFIGS).kind).toBe('canonical');
  });

  it('fails safely on an unknown host', () => {
    const result = resolveHost('attacker.example', CONFIGS);
    expect(result.kind).toBe('unknown');
  });

  it('fails safely on a missing host header', () => {
    expect(resolveHost(null, CONFIGS).kind).toBe('unknown');
    expect(resolveHost('', CONFIGS).kind).toBe('unknown');
  });

  it('does not resolve a marketplace slug supplied as a hostname', () => {
    // A client must never select its tenant by name; only a configured host works.
    expect(resolveHost('suanas-mx', CONFIGS).kind).toBe('unknown');
  });

  it('applies a development host map without redirecting away from localhost', () => {
    const hostMap = parseHostMap('localhost:3000=suanas-mx,pergolas.localhost:3000=pergolas-mx');
    const result = resolveHost('localhost:3000', CONFIGS, { hostMap });
    expect(result.kind).toBe('canonical');
    if (result.kind !== 'canonical') throw new Error('unreachable');
    expect(result.config.slug).toBe('suanas-mx');
  });

  it('treats a host mapped to an unknown slug as unknown', () => {
    const hostMap = parseHostMap('localhost:3000=does-not-exist');
    expect(resolveHost('localhost:3000', CONFIGS, { hostMap }).kind).toBe('unknown');
  });
});

describe('parseHostMap', () => {
  it('returns an empty map for an unset variable', () => {
    expect(parseHostMap(undefined).size).toBe(0);
  });

  it('ignores malformed entries', () => {
    const map = parseHostMap('localhost:3000=suanas-mx,garbage,=,x=');
    expect([...map.entries()]).toEqual([['localhost:3000', 'suanas-mx']]);
  });
});
