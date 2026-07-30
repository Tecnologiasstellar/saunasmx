import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { configuratorFileSchema } from '@/modules/configurator/schema';
import { loadMarketplaceConfigs, loadMarketplaceConfigsSafe } from '@/modules/marketplace-config/loader';

/**
 * Visual configurator (docs: config/marketplaces/suanas-mx/configurator.json).
 * An optional per-marketplace file, same opt-in shape as lead-scoring.yaml.
 */

const VALID: Record<string, unknown> = {
  id: 'demo-configurator-v1',
  version: 1,
  locale: 'es-MX',
  sizeFieldId: 'size',
  steps: [
    {
      id: 'size',
      label: 'Tamaño',
      fields: [
        {
          id: 'size',
          label: 'Tamaño',
          options: [
            { value: 'small', label: 'Pequeña', image: { id: 1, photographer: 'A', sourcePage: 'https://example.com/a' } },
            { value: 'large', label: 'Grande', image: { id: 2, photographer: 'B', sourcePage: 'https://example.com/b' } },
          ],
        },
      ],
    },
  ],
  priceBands: [
    { sizeValue: 'small', label: '$50,000 – $100,000 MXN', minMxn: 50000, maxMxn: 100000 },
    { sizeValue: 'large', label: '$150,000 – $300,000 MXN', minMxn: 150000, maxMxn: 300000 },
  ],
};

describe('configuratorFileSchema', () => {
  it('accepts a valid configurator file', () => {
    const result = configuratorFileSchema.safeParse(VALID);
    expect(result.success).toBe(true);
  });

  it('rejects a priceBand that references an option the size field does not offer', () => {
    const bad = { ...VALID, priceBands: [{ sizeValue: 'huge', label: 'x', minMxn: 0, maxMxn: null }] };
    const result = configuratorFileSchema.safeParse(bad);
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.issues.some((issue) => issue.message.includes('does not offer'))).toBe(true);
  });

  it('rejects sizeFieldId pointing at a field that does not exist', () => {
    const bad = { ...VALID, sizeFieldId: 'nope' };
    const result = configuratorFileSchema.safeParse(bad);
    expect(result.success).toBe(false);
  });

  it('rejects a duplicate field id across steps', () => {
    const bad = { ...VALID, steps: [...VALID_STEPS(), ...VALID_STEPS()] };
    const result = configuratorFileSchema.safeParse(bad);
    expect(result.success).toBe(false);
  });

  it('rejects an unknown top-level key', () => {
    const bad = { ...VALID, surprise: true };
    const result = configuratorFileSchema.safeParse(bad);
    expect(result.success).toBe(false);
  });

  function VALID_STEPS() {
    return (VALID as { steps: unknown[] }).steps;
  }
});

describe('marketplace config loader (configurator wiring)', () => {
  const roots: string[] = [];
  afterEach(() => {
    for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
  });

  it('loads the real suanas-mx configurator', () => {
    const suanas = loadMarketplaceConfigs().find((config) => config.slug === 'suanas-mx')!;
    expect(suanas.configurator).toBeDefined();
    expect(suanas.configurator!.steps.map((step) => step.id)).toEqual(['size', 'wood', 'heater', 'shape', 'window_and_setting']);
  });

  it('leaves configurator undefined for a marketplace that opts out', () => {
    const pergolas = loadMarketplaceConfigs().find((config) => config.slug === 'pergolas-mx')!;
    expect(pergolas.configurator).toBeUndefined();
  });

  it('fails the whole marketplace load when the referenced configurator file is invalid', () => {
    const root = mkdtempSync(join(tmpdir(), 'configurator-'));
    roots.push(root);
    const dir = join(root, 'bad-mx');
    mkdirSync(dir, { recursive: true });
    writeFileSync(
      join(dir, 'marketplace.yaml'),
      `id: bad-mx
slug: bad-mx
name: Bad test
domain: bad-mx.example
aliases: []
category: sauna
localization:
  locale: es-MX
  currency: MXN
  country: MX
theme: warm-wellness
questionnaire: ./questionnaire.json
matching: ./matching.yaml
configurator: ./configurator.json
contact:
  legalName: Test SA de CV
  email: hola@example.com
features:
  providerPortal: true
seo:
  defaultIndexing: true
  pageEligibility: provider_count_gte_2
  primaryCta: obtener-cotizaciones
`,
    );
    writeFileSync(
      join(dir, 'questionnaire.json'),
      JSON.stringify({
        id: 'demo-v1',
        version: 1,
        locale: 'es-MX',
        steps: [
          { id: 'location', type: 'postal_code', label: '¿Dónde?', required: true },
          { id: 'contact', type: 'contact', label: 'Contacto', required: true, fields: ['name', 'email', 'phone'] },
          { id: 'consent', type: 'consent', label: 'Acepto', required: true },
        ],
      }),
    );
    writeFileSync(
      join(dir, 'matching.yaml'),
      `version: 1
review_policy: manual
distribution:
  mode: curated
  max_providers: 2
eligibility:
  required:
    - provider_marketplace_status_approved
answer_mapping:
  service: location
  budget: location
scoring:
  geography: 100
tie_breakers:
  - provider_id_asc
explanations_required: true
ai_role: attribute_extraction_and_summary_only
`,
    );
    writeFileSync(join(dir, 'configurator.json'), JSON.stringify({ ...VALID, sizeFieldId: 'nope' }));

    const { issues } = loadMarketplaceConfigsSafe(root);
    expect(issues.join('\n')).toContain('configurator.json');
  });
});
