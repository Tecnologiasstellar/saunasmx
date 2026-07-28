/**
 * Domain types for marketplace configuration.
 *
 * Everything a marketplace can change about its behaviour without a code change
 * is reachable from `MarketplaceConfig`. See ADR-006.
 */

export type QuestionnaireOption = {
  /** Stable key stored in project_requirement.value_json. */
  value: string;
  /** What the consumer sees. Falls back to the value when no label is configured. */
  label: string;
};

/** A field's visibility gated on another field's answer within the same group. */
export type ShowIf = { field: string; equals?: string; notEquals?: string };

export type GroupField =
  | {
      id: string;
      label: string;
      required: boolean;
      kind: 'text';
      placeholder?: string;
      pattern?: string;
      patternMessage?: string;
      showIf?: ShowIf;
    }
  | { id: string; label: string; required: boolean; kind: 'select'; options: QuestionnaireOption[]; showIf?: ShowIf };

/** One of the two consent purposes, rendered as its own checkbox on the contact step. */
export type ContactConsent = { purpose: 'lead_contact' | 'provider_sharing'; label: string };

export type QuestionnaireStep =
  | { id: string; type: 'postal_code'; label: string; required: boolean; help?: string }
  | { id: string; type: 'single_select'; label: string; required: boolean; help?: string; options: QuestionnaireOption[] }
  | { id: string; type: 'multi_select'; label: string; required: boolean; help?: string; options: QuestionnaireOption[] }
  | { id: string; type: 'long_text'; label: string; required: boolean; help?: string; maxLength: number }
  | {
      id: string;
      type: 'contact';
      label: string;
      required: boolean;
      help?: string;
      fields: Array<'name' | 'email' | 'phone'>;
      phoneLabel?: string;
      consents?: ContactConsent[];
    }
  | { id: string; type: 'consent'; label: string; required: boolean; help?: string }
  | { id: string; type: 'group'; label: string; required: boolean; help?: string; fields: GroupField[] };

export type Questionnaire = {
  id: string;
  version: number;
  locale: string;
  submitLabel: string;
  steps: QuestionnaireStep[];
};

/**
 * Finds the selectable options behind an answer field id — whether it's a
 * top-level `single_select`/`multi_select` step or a `select`-kind field
 * nested inside a `group` step. Shared by the config loader's cross-checks
 * and by provider/coverage.ts, so both agree on what "the service field"
 * means without duplicating the lookup.
 */
export function findSelectOptions(questionnaire: Questionnaire, id: string): QuestionnaireOption[] | null {
  for (const step of questionnaire.steps) {
    if (step.id === id && (step.type === 'single_select' || step.type === 'multi_select')) return step.options;
    if (step.type === 'group') {
      const field = step.fields.find((candidate) => candidate.id === id);
      if (field && field.kind === 'select') return field.options;
    }
  }
  return null;
}

export type EligibilityRule =
  | 'provider_marketplace_status_approved'
  | 'service_matches_project_type'
  | 'territory_matches_location'
  | 'project_budget_meets_provider_minimum'
  | 'provider_capacity_available';

export type ScoringDimension =
  | 'geography'
  | 'specialization'
  | 'budget_fit'
  | 'response_performance'
  | 'consumer_rating'
  | 'capacity';

export type TieBreaker = 'response_performance_desc' | 'assignment_load_asc' | 'provider_id_asc';

export type MatchingConfig = {
  version: number;
  reviewPolicy: 'manual' | 'automatic';
  distribution: { mode: 'curated' | 'broadcast'; maxProviders: number };
  eligibility: { required: EligibilityRule[] };
  /** Questionnaire step ids that supply the service and budget dimensions. */
  answerMapping: { service: string; budget: string };
  scoring: Partial<Record<ScoringDimension, number>>;
  tieBreakers: TieBreaker[];
  explanationsRequired: boolean;
  aiRole: 'attribute_extraction_and_summary_only' | 'disabled';
};

/** A public header/footer destination this marketplace actually publishes. */
export type NavLink = { label: string; href: string };

/** Bare handles, not URLs. `null` means the account does not exist yet. */
export type SocialHandles = { instagram: string | null; tiktok: string | null };

/** Where the public writes to us, and where they can find us. */
export type Contact = { legalName: string; email: string; social: SocialHandles };

export type MarketplaceConfig = {
  id: string;
  slug: string;
  name: string;
  /** Canonical hostname. All aliases redirect here. */
  domain: string;
  aliases: string[];
  category: string;
  localization: { locale: string; currency: string; country: string };
  themeKey: string;
  nav: NavLink[];
  contact: Contact;
  features: Record<string, boolean>;
  seo: { defaultIndexing: boolean; pageEligibility: string; primaryCta: string };
  questionnaire: Questionnaire;
  matching: MatchingConfig;
  /** Optional lead-grading config; undefined means this marketplace grades no leads. */
  leadScoring?: LeadScoringConfig;
  /** Hash of the three source files; identifies the published config version. */
  configVersion: string;
};

/**
 * Optional lead-quality grading, opted into per marketplace. See
 * src/modules/lead-scoring/schema.ts for the authored YAML shape this is
 * derived from.
 */
export type LeadScoringDimension = { field: string; points: Record<string, number>; pointsIfUnanswered?: number };
export type LeadScoringRankRule = { field: string; atLeastAsGoodAs: string };
export type LeadScoringGradeRule = {
  grade: 'A' | 'B' | 'C';
  minScore?: number;
  maxScore?: number;
  requireServiceable?: boolean;
  minRank?: LeadScoringRankRule;
  maxRank?: LeadScoringRankRule;
  fieldIn?: Record<string, string[]>;
  fieldNotIn?: Record<string, string[]>;
};
export type LeadScoringConfig = {
  version: number;
  completeness: { fields: string[]; unsureValue: string; pointsComplete: number; pointsPartial: number };
  dimensions: LeadScoringDimension[];
  contactBonus: number;
  grades: LeadScoringGradeRule[];
};

export class ConfigValidationError extends Error {
  constructor(readonly issues: string[]) {
    super(`Marketplace configuration is invalid:\n${issues.map((i) => `  - ${i}`).join('\n')}`);
    this.name = 'ConfigValidationError';
  }
}
