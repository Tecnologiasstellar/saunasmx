#!/usr/bin/env tsx
/**
 * Generates a new marketplace configuration directory.
 *
 * Usage:
 *   npm run marketplace:create -- --slug=albercas-mx --name="Albercas México" \
 *     --domain=albercas.mx --category=pool --theme=warm-wellness
 *
 * Refuses to overwrite an existing slug or to claim a hostname another
 * marketplace already uses (docs/03-repo-structure.md). The generated files are
 * a starting point: edit the questionnaire and matching rules, then run
 * `npm run config:validate`.
 */
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { CONFIG_ROOT, loadMarketplaceConfigsSafe } from '../src/modules/marketplace-config/loader';
import { THEMES } from '../src/modules/ui/themes';

function arg(name: string): string | undefined {
  const match = process.argv.find((value) => value.startsWith(`--${name}=`));
  return match?.slice(name.length + 3);
}

const slug = arg('slug');
const name = arg('name');
const domain = arg('domain');
const category = arg('category');
const theme = arg('theme') ?? 'warm-wellness';
const locale = arg('locale') ?? 'es-MX';
const currency = arg('currency') ?? 'MXN';
const country = arg('country') ?? 'MX';

const missing = Object.entries({ slug, name, domain, category })
  .filter(([, value]) => !value)
  .map(([key]) => `--${key}`);

if (missing.length > 0) {
  console.error(`Missing required argument(s): ${missing.join(', ')}`);
  console.error('Example: npm run marketplace:create -- --slug=albercas-mx --name="Albercas México" --domain=albercas.mx --category=pool');
  process.exit(1);
}

if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug!)) {
  console.error(`Invalid slug "${slug}": use lowercase kebab-case.`);
  process.exit(1);
}

if (!THEMES[theme]) {
  console.error(`Unknown theme "${theme}". Available: ${Object.keys(THEMES).join(', ')}`);
  process.exit(1);
}

const target = join(CONFIG_ROOT, slug!);
if (existsSync(target)) {
  console.error(`Refusing to overwrite existing marketplace at ${target}.`);
  process.exit(1);
}

// A hostname may only ever belong to one marketplace.
const { configs } = loadMarketplaceConfigsSafe();
for (const existing of configs) {
  if ([existing.domain, ...existing.aliases].includes(domain!.toLowerCase())) {
    console.error(`Hostname "${domain}" is already claimed by "${existing.slug}".`);
    process.exit(1);
  }
  if (existing.slug === slug) {
    console.error(`Slug "${slug}" is already in use.`);
    process.exit(1);
  }
}

mkdirSync(target, { recursive: true });

writeFileSync(
  join(target, 'marketplace.yaml'),
  `id: ${slug}
slug: ${slug}
name: ${name}
domain: ${domain}
aliases: []
category: ${category}
localization:
  locale: ${locale}
  currency: ${currency}
  country: ${country}
theme: ${theme}
questionnaire: ./questionnaire.json
matching: ./matching.yaml
features:
  providerProfiles: true
  providerPortal: true
  manualLeadReview: true
  whatsapp: false
  subscriptions: false
  successFees: false
seo:
  defaultIndexing: false
  pageEligibility: provider_count_gte_2_and_local_value
  primaryCta: obtener-cotizaciones
`,
);

writeFileSync(
  join(target, 'questionnaire.json'),
  `${JSON.stringify(
    {
      id: `${category}-residential-v1`,
      version: 1,
      locale,
      steps: [
        { id: 'location', type: 'postal_code', label: '¿Dónde se instalaría?', required: true },
        {
          id: 'variant',
          type: 'single_select',
          label: 'TODO: ¿qué tipo te interesa?',
          required: true,
          // `value` is what matching and provider coverage key on; `label` is
          // the only part a consumer ever reads. Keep the keys, rewrite the labels.
          options: [
            { value: 'option_a', label: 'TODO: primera opción' },
            { value: 'option_b', label: 'TODO: segunda opción' },
            { value: 'unsure', label: 'Quiero que me asesoren' },
          ],
        },
        {
          id: 'budget',
          type: 'single_select',
          label: '¿Cuál es tu presupuesto estimado?',
          required: true,
          options: [
            { value: 'under_50000', label: 'Menos de $50,000 MXN' },
            { value: '50000_100000', label: '$50,000 – $100,000 MXN' },
            { value: '100000_200000', label: '$100,000 – $200,000 MXN' },
            { value: 'over_200000', label: 'Más de $200,000 MXN' },
            { value: 'unsure', label: 'Aún no lo sé' },
          ],
        },
        {
          id: 'timeline',
          type: 'single_select',
          label: '¿Cuándo te gustaría hacerlo?',
          required: true,
          options: [
            { value: 'now', label: 'Lo antes posible' },
            { value: 'one_to_three_months', label: 'En 1 a 3 meses' },
            { value: 'six_months', label: 'En unos 6 meses' },
            { value: 'researching', label: 'Sólo estoy investigando' },
          ],
        },
        { id: 'notes', type: 'long_text', label: 'Cuéntanos un poco más', required: false, maxLength: 2000 },
        { id: 'contact', type: 'contact', label: '¿A dónde te enviamos opciones?', required: true, fields: ['name', 'email', 'phone'] },
        {
          id: 'consent',
          type: 'consent',
          label: `Acepto que ${name} comparta mis datos con proveedores relevantes para responder a mi proyecto.`,
          required: true,
        },
      ],
    },
    null,
    2,
  )}\n`,
);

writeFileSync(
  join(target, 'matching.yaml'),
  `version: 1
review_policy: manual
distribution:
  mode: curated
  max_providers: 2
eligibility:
  required:
    - provider_marketplace_status_approved
    - service_matches_project_type
    - territory_matches_location
    - project_budget_meets_provider_minimum
    - provider_capacity_available
# Which questionnaire answers supply the matching dimensions.
answer_mapping:
  service: variant
  budget: budget
scoring:
  geography: 25
  specialization: 25
  budget_fit: 15
  response_performance: 15
  consumer_rating: 10
  capacity: 10
tie_breakers:
  - response_performance_desc
  - assignment_load_asc
  - provider_id_asc
explanations_required: true
ai_role: attribute_extraction_and_summary_only
`,
);

console.log(`Created ${target}`);
console.log('\nLaunch checklist:');
console.log('  1. Edit questionnaire.json — replace the TODO step and its options.');
console.log('     Every option label is consumer-facing copy; the value is the internal key.');
console.log('  2. Edit matching.yaml — answer_mapping.service must name a single_select step.');
console.log('  3. npm run config:validate');
console.log('  4. npm run db:seed          (publishes the marketplace and its domain)');
console.log('  5. Add providers, services and territories for this marketplace.');
console.log('  6. Add a landing content_page with hero/bullets/faq blocks.');
console.log('  7. Point DNS at the deployment and set seo.defaultIndexing when the content is ready.');
process.exit(0);
