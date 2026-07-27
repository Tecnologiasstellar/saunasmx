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

export type QuestionnaireStep =
  | { id: string; type: 'postal_code'; label: string; required: boolean; help?: string }
  | { id: string; type: 'single_select'; label: string; required: boolean; help?: string; options: QuestionnaireOption[] }
  | { id: string; type: 'multi_select'; label: string; required: boolean; help?: string; options: QuestionnaireOption[] }
  | { id: string; type: 'long_text'; label: string; required: boolean; help?: string; maxLength: number }
  | { id: string; type: 'contact'; label: string; required: boolean; help?: string; fields: Array<'name' | 'email' | 'phone'> }
  | { id: string; type: 'consent'; label: string; required: boolean; help?: string };

export type Questionnaire = {
  id: string;
  version: number;
  locale: string;
  steps: QuestionnaireStep[];
};

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
  features: Record<string, boolean>;
  seo: { defaultIndexing: boolean; pageEligibility: string; primaryCta: string };
  questionnaire: Questionnaire;
  matching: MatchingConfig;
  /** Hash of the three source files; identifies the published config version. */
  configVersion: string;
};

export class ConfigValidationError extends Error {
  constructor(readonly issues: string[]) {
    super(`Marketplace configuration is invalid:\n${issues.map((i) => `  - ${i}`).join('\n')}`);
    this.name = 'ConfigValidationError';
  }
}
