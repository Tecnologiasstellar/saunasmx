import { z } from 'zod';

/**
 * Raw file schemas. These validate exactly what an operator authors on disk,
 * so validation errors point at the authored key path. The loader maps them to
 * the camelCase domain types in `types.ts`.
 *
 * Source: contracts/marketplace-config.schema.json, docs/06-workflows.md,
 * docs/08-seo-content-engine.md, ADR-006.
 */

const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const KEY = /^[a-z0-9]+(_[a-z0-9]+)*$/;
// hostname, optionally with an explicit port for local development
const HOSTNAME = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*(:\d{2,5})?$/;

export const marketplaceFileSchema = z.strictObject({
  id: z.string().regex(SLUG, 'must be lowercase kebab-case'),
  slug: z.string().regex(SLUG, 'must be lowercase kebab-case'),
  name: z.string().min(1),
  domain: z.string().regex(HOSTNAME, 'must be a bare hostname with no protocol or path'),
  aliases: z.array(z.string().regex(HOSTNAME, 'must be a bare hostname')).default([]),
  category: z.string().regex(KEY, 'must be a lowercase snake_case category key'),
  localization: z.strictObject({
    locale: z.string().min(2),
    currency: z.string().length(3).regex(/^[A-Z]{3}$/, 'must be an ISO 4217 code'),
    country: z.string().length(2).regex(/^[A-Z]{2}$/, 'must be an ISO 3166-1 alpha-2 code'),
  }),
  theme: z.string().regex(SLUG),
  questionnaire: z.string().min(1),
  matching: z.string().min(1),
  /**
   * Public header/footer links. Each marketplace lists only the destinations it
   * actually has, so a shared header can never render a link to a section this
   * marketplace does not publish. The primary "cotizar" CTA is not listed here:
   * it is part of the funnel and always present.
   */
  nav: z
    .array(
      z.strictObject({
        label: z.string().min(1),
        href: z
          .string()
          .regex(/^(\/[A-Za-z0-9\-._~/]*)?(#[A-Za-z0-9\-_]+)?$/, 'must be a site-relative path and/or fragment')
          .refine((value) => value.length > 0 && value !== '#', 'must point somewhere real, not "#"'),
      }),
    )
    .default([]),
  /**
   * The public contact point. Required, because a marketplace that collects
   * personal data must tell people where to write to correct or delete it —
   * the privacy notice and the footer both read this one value rather than
   * each hardcoding an address that can drift out of sync.
   */
  contact: z.strictObject({
    /**
     * Who legally operates this marketplace. The privacy notice names it as the
     * responsable for the data collected, so it must be the entity that would
     * answer an ARCO request — not a brand name and not a person standing in
     * for a company.
     */
    legalName: z.string().min(1),
    email: z.email('must be a valid email address'),
    /**
     * Social handles, stored bare (`saunasmx`, not a URL) so the profile URL is
     * built in one place. A network left null renders as a plain, unlinked icon
     * marked "próximamente": the brand shows its intent to be there without the
     * site shipping a link to a profile that does not exist.
     */
    social: z
      .strictObject({
        instagram: z.string().min(1).nullable().default(null),
        tiktok: z.string().min(1).nullable().default(null),
      })
      .default({ instagram: null, tiktok: null }),
  }),
  features: z.record(z.string().regex(/^[a-z][A-Za-z0-9]*$/), z.boolean()),
  seo: z.strictObject({
    defaultIndexing: z.boolean(),
    pageEligibility: z.string().min(1),
    primaryCta: z.string().min(1),
  }),
});

export type MarketplaceFile = z.infer<typeof marketplaceFileSchema>;

/* -------------------------------------------------------------------------- */
/* Questionnaire                                                              */
/* -------------------------------------------------------------------------- */

/**
 * A selectable answer.
 *
 * A number stands on its own — "4" reads the same to a consumer as it does to
 * the matching engine. A key like `indoor` does not, so it must carry the words
 * the consumer actually sees. Making the terse string form invalid is what stops
 * a marketplace shipping raw database keys into its own questionnaire.
 */
const optionValue = z.union(
  [
    z.number(),
    z.strictObject({
      value: z.union([z.string().min(1), z.number()]),
      label: z.string().min(1),
    }),
  ],
  { error: 'must be a number, or {"value": "...", "label": "..."} — a bare string would show the raw key to consumers' },
);

const stepBase = {
  id: z.string().regex(KEY),
  label: z.string().min(1),
  required: z.boolean().default(false),
  help: z.string().optional(),
};

export const questionnaireStepSchema = z.discriminatedUnion('type', [
  z.strictObject({ ...stepBase, type: z.literal('postal_code') }),
  z.strictObject({ ...stepBase, type: z.literal('single_select'), options: z.array(optionValue).min(2) }),
  z.strictObject({ ...stepBase, type: z.literal('multi_select'), options: z.array(optionValue).min(2) }),
  z.strictObject({ ...stepBase, type: z.literal('long_text'), maxLength: z.number().int().min(1).max(10_000).default(2000) }),
  z.strictObject({ ...stepBase, type: z.literal('contact'), fields: z.array(z.enum(['name', 'email', 'phone'])).min(1) }),
  z.strictObject({ ...stepBase, type: z.literal('consent') }),
]);

export const questionnaireFileSchema = z
  .strictObject({
    id: z.string().regex(SLUG),
    version: z.number().int().positive(),
    locale: z.string().min(2),
    steps: z.array(questionnaireStepSchema).min(1),
  })
  .superRefine((value, ctx) => {
    const seen = new Set<string>();
    for (const [index, step] of value.steps.entries()) {
      if (seen.has(step.id)) {
        ctx.addIssue({ code: 'custom', path: ['steps', index, 'id'], message: `duplicate step id "${step.id}"` });
      }
      seen.add(step.id);
    }
    const count = (type: string) => value.steps.filter((s) => s.type === type).length;
    if (count('contact') !== 1) {
      ctx.addIssue({ code: 'custom', path: ['steps'], message: 'questionnaire must contain exactly one contact step' });
    }
    if (count('consent') !== 1) {
      ctx.addIssue({ code: 'custom', path: ['steps'], message: 'questionnaire must contain exactly one consent step' });
    }
    if (count('postal_code') < 1) {
      ctx.addIssue({ code: 'custom', path: ['steps'], message: 'questionnaire must collect a postal code for territory matching' });
    }
    const consentStep = value.steps.find((s) => s.type === 'consent');
    if (consentStep && !consentStep.required) {
      ctx.addIssue({ code: 'custom', path: ['steps'], message: 'the consent step must be required' });
    }
  });

export type QuestionnaireFile = z.infer<typeof questionnaireFileSchema>;

/* -------------------------------------------------------------------------- */
/* Matching                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Rule and dimension names are closed enums on purpose. A typo in matching.yaml
 * must fail validation rather than silently disable an eligibility filter.
 */
export const eligibilityRuleSchema = z.enum([
  'provider_marketplace_status_approved',
  'service_matches_project_type',
  'territory_matches_location',
  'project_budget_meets_provider_minimum',
  'provider_capacity_available',
]);

export const scoringDimensionSchema = z.enum([
  'geography',
  'specialization',
  'budget_fit',
  'response_performance',
  'consumer_rating',
  'capacity',
]);

export const tieBreakerSchema = z.enum([
  'response_performance_desc',
  'assignment_load_asc',
  'provider_id_asc',
]);

export const matchingFileSchema = z
  .strictObject({
    version: z.number().int().positive(),
    review_policy: z.enum(['manual', 'automatic']),
    distribution: z.strictObject({
      mode: z.enum(['curated', 'broadcast']),
      // ADR-008 caps early distribution. Raising this is a policy amendment.
      max_providers: z.number().int().min(1).max(5),
    }),
    eligibility: z.strictObject({
      required: z.array(eligibilityRuleSchema).min(1),
    }),
    /**
     * Which questionnaire answers carry the matching dimensions. Saunas use
     * `type`, pergolas use `material` — the difference belongs in config, not
     * in a branch inside the matching engine (ADR-006).
     */
    answer_mapping: z.strictObject({
      service: z.string().regex(KEY),
      budget: z.string().regex(KEY),
    }),
    // Partial: a marketplace may weight only the dimensions it cares about.
    // The total-100 check below is what keeps the ranking meaningful.
    scoring: z.partialRecord(scoringDimensionSchema, z.number().int().min(0).max(100)),
    tie_breakers: z.array(tieBreakerSchema).min(1),
    explanations_required: z.boolean(),
    ai_role: z.enum(['attribute_extraction_and_summary_only', 'disabled']),
  })
  .superRefine((value, ctx) => {
    const total = Object.values(value.scoring).reduce((sum, weight) => sum + (weight ?? 0), 0);
    if (total !== 100) {
      ctx.addIssue({ code: 'custom', path: ['scoring'], message: `scoring weights must total 100, got ${total}` });
    }
    const uniqueTieBreakers = new Set(value.tie_breakers);
    if (uniqueTieBreakers.size !== value.tie_breakers.length) {
      ctx.addIssue({ code: 'custom', path: ['tie_breakers'], message: 'tie breakers must be unique' });
    }
    if (!value.tie_breakers.includes('provider_id_asc')) {
      // Without a total order the ranking is not reproducible across runs.
      ctx.addIssue({ code: 'custom', path: ['tie_breakers'], message: 'tie breakers must end with provider_id_asc to guarantee a deterministic order' });
    }
    const uniqueRules = new Set(value.eligibility.required);
    if (uniqueRules.size !== value.eligibility.required.length) {
      ctx.addIssue({ code: 'custom', path: ['eligibility', 'required'], message: 'eligibility rules must be unique' });
    }
  });

export type MatchingFile = z.infer<typeof matchingFileSchema>;
