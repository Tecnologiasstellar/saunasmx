import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { loadMarketplaceConfigs, loadMarketplaceConfigsSafe } from '@/modules/marketplace-config/loader';

/**
 * Foundation gate (docs/13-acceptance-criteria.md):
 *   - Config schema rejects duplicate/invalid identifiers.
 *   - Two marketplace configs render distinct name/theme/content.
 */

const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

type Overrides = { marketplace?: string; questionnaire?: unknown; matching?: string };

const VALID_QUESTIONNAIRE = {
  id: 'demo-v1',
  version: 1,
  locale: 'es-MX',
  steps: [
    { id: 'location', type: 'postal_code', label: '¿Dónde?', required: true },
    {
      id: 'budget',
      type: 'single_select',
      label: 'Presupuesto',
      required: true,
      options: [
        { value: 'a', label: 'Opción A' },
        { value: 'b', label: 'Opción B' },
      ],
    },
    { id: 'contact', type: 'contact', label: 'Contacto', required: true, fields: ['name', 'email', 'phone'] },
    { id: 'consent', type: 'consent', label: 'Acepto', required: true },
  ],
};

const VALID_MATCHING = `version: 1
review_policy: manual
distribution:
  mode: curated
  max_providers: 2
eligibility:
  required:
    - provider_marketplace_status_approved
    - territory_matches_location
answer_mapping:
  service: budget
  budget: budget
scoring:
  geography: 50
  specialization: 50
tie_breakers:
  - assignment_load_asc
  - provider_id_asc
explanations_required: true
ai_role: attribute_extraction_and_summary_only
`;

function marketplaceYaml(slug: string, domain: string, extra = ''): string {
  return `id: ${slug}
slug: ${slug}
name: ${slug} test
domain: ${domain}
aliases: []
category: sauna
localization:
  locale: es-MX
  currency: MXN
  country: MX
theme: warm-wellness
questionnaire: ./questionnaire.json
matching: ./matching.yaml
contact:
  email: hola@example.com
features:
  providerPortal: true
seo:
  defaultIndexing: true
  pageEligibility: provider_count_gte_2
  primaryCta: obtener-cotizaciones
${extra}`;
}

function makeRoot(dirs: Record<string, Overrides>): string {
  const root = mkdtempSync(join(tmpdir(), 'mkt-config-'));
  roots.push(root);
  for (const [slug, overrides] of Object.entries(dirs)) {
    const dir = join(root, slug);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'marketplace.yaml'), overrides.marketplace ?? marketplaceYaml(slug, `${slug}.example`));
    writeFileSync(join(dir, 'questionnaire.json'), JSON.stringify(overrides.questionnaire ?? VALID_QUESTIONNAIRE));
    writeFileSync(join(dir, 'matching.yaml'), overrides.matching ?? VALID_MATCHING);
  }
  return root;
}

describe('marketplace config loader', () => {
  it('loads the two configurations shipped in the repository', () => {
    const configs = loadMarketplaceConfigs();
    const slugs = configs.map((config) => config.slug).sort();
    expect(slugs).toEqual(['pergolas-mx', 'suanas-mx']);

    const suanas = configs.find((config) => config.slug === 'suanas-mx')!;
    const pergolas = configs.find((config) => config.slug === 'pergolas-mx')!;

    // Distinct brand, category, theme and questionnaire — from config alone.
    expect(suanas.name).not.toEqual(pergolas.name);
    expect(suanas.themeKey).not.toEqual(pergolas.themeKey);
    expect(suanas.category).toBe('sauna');
    expect(pergolas.category).toBe('pergola');
    expect(suanas.questionnaire.id).not.toEqual(pergolas.questionnaire.id);
    expect(suanas.configVersion).not.toEqual(pergolas.configVersion);
  });

  it('gives each marketplace its own public navigation', () => {
    const configs = loadMarketplaceConfigs();
    const suanas = configs.find((config) => config.slug === 'suanas-mx')!;
    const pergolas = configs.find((config) => config.slug === 'pergolas-mx')!;

    expect(suanas.nav.map((link) => link.href)).toContain('/blog');
    // The editorial corpus is sauna-only: pergolas must not link to it.
    expect(pergolas.nav.map((link) => link.href)).not.toContain('/blog');
    expect(pergolas.features.blog).toBe(false);

    // Every declared destination is a site-relative path or an anchor, so the
    // shared header can never render an off-site or dead link.
    for (const config of configs) {
      for (const link of config.nav) {
        expect(link.href).toMatch(/^(\/|#)/);
        expect(link.href).not.toBe('#');
        expect(link.label.length).toBeGreaterThan(0);
      }
    }
  });

  it('defaults nav to an empty list rather than inventing links', () => {
    const root = makeRoot({ 'no-nav': {} });
    const [config] = loadMarketplaceConfigs(root);
    expect(config!.nav).toEqual([]);
  });

  it('rejects a nav link that points nowhere', () => {
    const root = makeRoot({
      bad: {
        marketplace: marketplaceYaml('bad', 'bad.example', 'nav:\n  - label: Roto\n    href: "#"\n'),
      },
    });
    const { issues } = loadMarketplaceConfigsSafe(root);
    expect(issues.join('\n')).toContain('nav.0.href');
  });

  it('rejects a nav link that leaves the site', () => {
    const root = makeRoot({
      bad: {
        marketplace: marketplaceYaml('bad', 'bad.example', 'nav:\n  - label: Fuera\n    href: https://example.com\n'),
      },
    });
    const { issues } = loadMarketplaceConfigsSafe(root);
    expect(issues.join('\n')).toContain('nav.0.href');
  });

  it('refuses a marketplace with no contact address', () => {
    // A site that collects a name and a phone number has to say where to write
    // to get them deleted. Missing contact must fail the build, not default.
    const root = makeRoot({
      bad: {
        marketplace: marketplaceYaml('bad', 'bad.example').replace('contact:\n  email: hola@example.com\n', ''),
      },
    });
    const { issues } = loadMarketplaceConfigsSafe(root);
    expect(issues.join('\n')).toContain('contact');
  });

  it('rejects a contact address that is not an email', () => {
    const root = makeRoot({
      bad: {
        marketplace: marketplaceYaml('bad', 'bad.example').replace('hola@example.com', 'escríbenos por instagram'),
      },
    });
    const { issues } = loadMarketplaceConfigsSafe(root);
    expect(issues.join('\n')).toContain('contact.email');
  });

  it('defaults social handles to null rather than guessing a profile URL', () => {
    const [config] = loadMarketplaceConfigs(makeRoot({ 'no-social': {} }));
    expect(config!.contact.social).toEqual({ instagram: null, tiktok: null });
  });

  it('carries a social handle through as a bare handle, not a URL', () => {
    const root = makeRoot({
      social: {
        marketplace: marketplaceYaml('social', 'social.example').replace(
          '  email: hola@example.com',
          '  email: hola@example.com\n  social:\n    instagram: saunasmx',
        ),
      },
    });
    const [config] = loadMarketplaceConfigs(root);
    expect(config!.contact.social.instagram).toBe('saunasmx');
    expect(config!.contact.social.tiktok).toBeNull();
  });

  it('reads the real saunas.mx contact address from configuration', () => {
    const suanas = loadMarketplaceConfigs().find((config) => config.slug === 'suanas-mx')!;
    expect(suanas.contact.email).toBe('tecnologiasstellar@gmail.com');
  });

  it('normalizes select options to string values', () => {
    const suanas = loadMarketplaceConfigs().find((config) => config.slug === 'suanas-mx')!;
    const capacity = suanas.questionnaire.steps.find((step) => step.id === 'capacity');
    expect(capacity?.type).toBe('single_select');
    if (capacity?.type !== 'single_select') throw new Error('unreachable');
    // The source JSON mixes numbers and labelled objects; storage keys must be strings.
    expect(capacity.options.map((option) => option.value)).toEqual(['2', '4', '6', '8', 'more_than_8']);
    // A number is its own label; a key is not.
    expect(capacity.options.map((option) => option.label)).toEqual(['2', '4', '6', '8', 'Más de 8']);
  });

  it('never shows a raw key to a consumer in any configured marketplace', () => {
    // The bug this guards: options shipped as bare keys, so the questionnaire
    // asked buyers to choose between "indoor" and "more_than_8".
    for (const config of loadMarketplaceConfigs()) {
      for (const step of config.questionnaire.steps) {
        if (step.type !== 'single_select' && step.type !== 'multi_select') continue;
        for (const option of step.options) {
          // Numeric options legitimately equal their label; keys must not.
          if (/^\d+$/.test(option.value)) continue;
          expect(option.label, `${config.slug}/${step.id}/${option.value}`).not.toBe(option.value);
          expect(option.label).not.toMatch(/_/);
        }
      }
    }
  });

  it('rejects a bare string option with an actionable message', () => {
    const root = makeRoot({
      'suanas-mx': {
        questionnaire: {
          ...VALID_QUESTIONNAIRE,
          steps: VALID_QUESTIONNAIRE.steps.map((step) =>
            step.id === 'budget' ? { ...step, options: ['indoor', 'outdoor'] } : step,
          ),
        },
      },
    });
    const { issues } = loadMarketplaceConfigsSafe(root);
    expect(issues.join('\n')).toContain('would show the raw key to consumers');
  });

  it('rejects an option whose label is blank', () => {
    const root = makeRoot({
      'suanas-mx': {
        questionnaire: {
          ...VALID_QUESTIONNAIRE,
          steps: VALID_QUESTIONNAIRE.steps.map((step) =>
            step.id === 'budget' ? { ...step, options: [{ value: 'a', label: '' }, { value: 'b', label: 'B' }] } : step,
          ),
        },
      },
    });
    expect(loadMarketplaceConfigsSafe(root).issues.length).toBeGreaterThan(0);
  });

  it('rejects a slug that does not match its directory name', () => {
    const root = makeRoot({ 'suanas-mx': { marketplace: marketplaceYaml('something-else', 'a.example') } });
    const { issues } = loadMarketplaceConfigsSafe(root);
    expect(issues.join('\n')).toContain('must match its directory name');
  });

  it('rejects two marketplaces claiming the same hostname', () => {
    const root = makeRoot({
      'one-mx': { marketplace: marketplaceYaml('one-mx', 'shared.example') },
      'two-mx': { marketplace: marketplaceYaml('two-mx', 'shared.example') },
    });
    const { issues } = loadMarketplaceConfigsSafe(root);
    expect(issues.join('\n')).toContain('is claimed by both');
  });

  it('rejects an alias that repeats the canonical domain', () => {
    const yaml = marketplaceYaml('one-mx', 'one.example').replace('aliases: []', 'aliases:\n  - one.example');
    const root = makeRoot({ 'one-mx': { marketplace: yaml } });
    const { issues } = loadMarketplaceConfigsSafe(root);
    expect(issues.join('\n')).toContain('must not also be listed as an alias');
  });

  it('rejects a domain that carries a protocol or path', () => {
    const root = makeRoot({ 'one-mx': { marketplace: marketplaceYaml('one-mx', 'https://one.example/x') } });
    const { issues } = loadMarketplaceConfigsSafe(root);
    expect(issues.join('\n')).toContain('bare hostname');
  });

  it('rejects an unknown key in marketplace.yaml', () => {
    const root = makeRoot({ 'one-mx': { marketplace: `${marketplaceYaml('one-mx', 'one.example')}\nsurprise: true\n` } });
    const { issues } = loadMarketplaceConfigsSafe(root);
    expect(issues.join('\n')).toMatch(/surprise/i);
  });

  it('rejects an unknown eligibility rule instead of silently ignoring it', () => {
    const matching = VALID_MATCHING.replace('    - territory_matches_location', '    - territroy_matches_location');
    const root = makeRoot({ 'one-mx': { matching } });
    const { issues } = loadMarketplaceConfigsSafe(root);
    expect(issues.join('\n')).toContain('eligibility.required');
  });

  it('rejects scoring weights that do not total 100', () => {
    const matching = VALID_MATCHING.replace('geography: 50', 'geography: 40');
    const root = makeRoot({ 'one-mx': { matching } });
    const { issues } = loadMarketplaceConfigsSafe(root);
    expect(issues.join('\n')).toContain('scoring weights must total 100, got 90');
  });

  it('rejects tie breakers without a deterministic final ordering', () => {
    const matching = VALID_MATCHING.replace('  - provider_id_asc\n', '');
    const root = makeRoot({ 'one-mx': { matching } });
    const { issues } = loadMarketplaceConfigsSafe(root);
    expect(issues.join('\n')).toContain('deterministic order');
  });

  it('rejects a distribution maximum above the ADR-008 ceiling', () => {
    const matching = VALID_MATCHING.replace('max_providers: 2', 'max_providers: 25');
    const root = makeRoot({ 'one-mx': { matching } });
    const { issues } = loadMarketplaceConfigsSafe(root);
    expect(issues.join('\n')).toContain('distribution.max_providers');
  });

  it('rejects a questionnaire with no consent step', () => {
    const questionnaire = {
      ...VALID_QUESTIONNAIRE,
      steps: VALID_QUESTIONNAIRE.steps.filter((step) => step.type !== 'consent'),
    };
    const root = makeRoot({ 'one-mx': { questionnaire } });
    const { issues } = loadMarketplaceConfigsSafe(root);
    expect(issues.join('\n')).toContain('exactly one consent step');
  });

  it('rejects an optional consent step', () => {
    const questionnaire = {
      ...VALID_QUESTIONNAIRE,
      steps: VALID_QUESTIONNAIRE.steps.map((step) => (step.type === 'consent' ? { ...step, required: false } : step)),
    };
    const root = makeRoot({ 'one-mx': { questionnaire } });
    const { issues } = loadMarketplaceConfigsSafe(root);
    expect(issues.join('\n')).toContain('consent step must be required');
  });

  it('rejects a questionnaire with duplicate step ids', () => {
    const first = VALID_QUESTIONNAIRE.steps[0]!;
    const questionnaire = { ...VALID_QUESTIONNAIRE, steps: [...VALID_QUESTIONNAIRE.steps, first] };
    const root = makeRoot({ 'one-mx': { questionnaire } });
    const { issues } = loadMarketplaceConfigsSafe(root);
    expect(issues.join('\n')).toContain('duplicate step id');
  });

  it('rejects a questionnaire whose locale contradicts the marketplace locale', () => {
    const questionnaire = { ...VALID_QUESTIONNAIRE, locale: 'en-US' };
    const root = makeRoot({ 'one-mx': { questionnaire } });
    const { issues } = loadMarketplaceConfigsSafe(root);
    expect(issues.join('\n')).toContain('does not match marketplace locale');
  });

  it('reports every problem in one pass rather than only the first', () => {
    const root = makeRoot({
      'one-mx': { marketplace: marketplaceYaml('wrong-slug', 'one.example'), matching: VALID_MATCHING.replace('geography: 50', 'geography: 10') },
    });
    const { issues } = loadMarketplaceConfigsSafe(root);
    expect(issues.length).toBeGreaterThanOrEqual(2);
  });

  it('fails loudly when the config root is empty', () => {
    const root = mkdtempSync(join(tmpdir(), 'mkt-empty-'));
    roots.push(root);
    const { issues } = loadMarketplaceConfigsSafe(root);
    expect(issues.join('\n')).toContain('no marketplace directories');
  });
});
