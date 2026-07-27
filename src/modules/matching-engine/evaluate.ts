import type { EligibilityRule, MatchingConfig, ScoringDimension } from '../marketplace-config/types';
import { budgetMeetsMinimum, type BudgetRange } from './budget';

/**
 * Deterministic eligibility and scoring (ADR-005).
 *
 * Pure function of (candidates, project facts, matching config). No database,
 * no clock, no randomness — the same inputs always produce the same ranking,
 * which is what makes an explanation defensible to a provider or a consumer.
 *
 * AI never reaches this module. It may enrich `ProjectFacts` upstream, but it
 * cannot add, remove or reorder a provider here.
 */

export type CandidateService = { serviceKey: string; minProjectValueMinor: number };

export type ProviderCandidate = {
  providerCompanyId: string;
  displayName: string;
  /** Provider-marketplace relationship status. */
  status: string;
  services: CandidateService[];
  postalPrefixes: string[];
  capacityLimit: number;
  openAssignments: number;
  /** 0–5, null when the provider has no published reviews yet. */
  averageRating: number | null;
  /** 0–100, null when the provider has no measured response history yet. */
  responseScore: number | null;
};

export type ProjectFacts = {
  postalCode: string;
  /** Null or "unsure" means the consumer did not commit to a service type. */
  serviceKey: string | null;
  budget: BudgetRange;
};

export type EligibilityCheck = { rule: EligibilityRule; passed: boolean; detail: string };

export type ScoreComponent = { dimension: ScoringDimension; weight: number; value: number; points: number };

export type Evaluation = {
  providerCompanyId: string;
  displayName: string;
  eligible: boolean;
  checks: EligibilityCheck[];
  /** Basis points of the configured weight total. Integer, so it stores exactly. */
  score: number;
  breakdown: ScoreComponent[];
  reasons: string[];
};

/** A neutral prior for a provider with no history yet, so newcomers are neither favoured nor buried. */
const NEUTRAL_PRIOR = 0.5;

const UNSPECIFIED = new Set(['', 'unsure', 'unknown']);

/** True for answers that state no preference. Exported so provider coverage cannot claim one as a service. */
export function isUnspecified(value: string | null): boolean {
  return value === null || UNSPECIFIED.has(value);
}

function matchingPrefixLength(postalCode: string, prefixes: string[]): number {
  let best = 0;
  for (const prefix of prefixes) {
    if (prefix.length > 0 && postalCode.startsWith(prefix) && prefix.length > best) best = prefix.length;
  }
  return best;
}

/** Lowest minimum project value among the services relevant to this project. */
function relevantMinimum(candidate: ProviderCandidate, serviceKey: string | null): number {
  const relevant = isUnspecified(serviceKey)
    ? candidate.services
    : candidate.services.filter((service) => service.serviceKey === serviceKey);
  const pool = relevant.length > 0 ? relevant : candidate.services;
  if (pool.length === 0) return 0;
  return Math.min(...pool.map((service) => service.minProjectValueMinor));
}

function runEligibility(
  candidate: ProviderCandidate,
  facts: ProjectFacts,
  required: EligibilityRule[],
): EligibilityCheck[] {
  return required.map((rule): EligibilityCheck => {
    switch (rule) {
      case 'provider_marketplace_status_approved': {
        const passed = candidate.status === 'approved';
        return { rule, passed, detail: `relationship status is "${candidate.status}"` };
      }
      case 'service_matches_project_type': {
        if (isUnspecified(facts.serviceKey)) {
          // An unstated service type cannot disqualify anyone; the operator decides.
          return { rule, passed: true, detail: 'consumer did not specify a service type' };
        }
        const passed = candidate.services.some((service) => service.serviceKey === facts.serviceKey);
        return { rule, passed, detail: passed ? `offers "${facts.serviceKey}"` : `does not offer "${facts.serviceKey}"` };
      }
      case 'territory_matches_location': {
        const length = matchingPrefixLength(facts.postalCode, candidate.postalPrefixes);
        return {
          rule,
          passed: length > 0,
          detail: length > 0 ? `covers postal prefix of length ${length}` : `does not cover ${facts.postalCode}`,
        };
      }
      case 'project_budget_meets_provider_minimum': {
        const minimum = relevantMinimum(candidate, facts.serviceKey);
        const passed = budgetMeetsMinimum(facts.budget, minimum);
        return {
          rule,
          passed,
          detail: facts.budget.known
            ? `budget ceiling ${facts.budget.maxMinor ?? 'open'} vs minimum ${minimum}`
            : 'consumer did not state a budget',
        };
      }
      case 'provider_capacity_available': {
        const passed = candidate.openAssignments < candidate.capacityLimit;
        return { rule, passed, detail: `${candidate.openAssignments}/${candidate.capacityLimit} open assignments` };
      }
    }
  });
}

function dimensionValue(dimension: ScoringDimension, candidate: ProviderCandidate, facts: ProjectFacts): number {
  switch (dimension) {
    case 'geography': {
      // A more specific territory match means a more local provider.
      const length = matchingPrefixLength(facts.postalCode, candidate.postalPrefixes);
      return Math.min(1, length / Math.max(1, facts.postalCode.length));
    }
    case 'specialization': {
      if (isUnspecified(facts.serviceKey)) return NEUTRAL_PRIOR;
      if (!candidate.services.some((service) => service.serviceKey === facts.serviceKey)) return 0;
      // A specialist marketplace values focus: fewer competing services scores higher.
      const breadthPenalty = Math.min(candidate.services.length - 1, 4) * 0.1;
      return Math.max(0, 1 - breadthPenalty);
    }
    case 'budget_fit': {
      if (!facts.budget.known) return NEUTRAL_PRIOR;
      const minimum = relevantMinimum(candidate, facts.serviceKey);
      if (minimum <= 0) return 1;
      const ceiling = facts.budget.maxMinor;
      if (ceiling === null) return 1;
      if (ceiling < minimum) return 0;
      return ceiling >= minimum * 1.5 ? 1 : 0.7;
    }
    case 'response_performance':
      return candidate.responseScore === null ? NEUTRAL_PRIOR : Math.max(0, Math.min(1, candidate.responseScore / 100));
    case 'consumer_rating':
      return candidate.averageRating === null ? NEUTRAL_PRIOR : Math.max(0, Math.min(1, candidate.averageRating / 5));
    case 'capacity': {
      if (candidate.capacityLimit <= 0) return 0;
      const free = (candidate.capacityLimit - candidate.openAssignments) / candidate.capacityLimit;
      return Math.max(0, Math.min(1, free));
    }
  }
}

function scoreCandidate(candidate: ProviderCandidate, facts: ProjectFacts, matching: MatchingConfig) {
  const breakdown: ScoreComponent[] = [];
  let total = 0;

  // Sorted so the stored breakdown is byte-stable across runs.
  const dimensions = Object.keys(matching.scoring).sort() as ScoringDimension[];
  for (const dimension of dimensions) {
    const weight = matching.scoring[dimension] ?? 0;
    const value = dimensionValue(dimension, candidate, facts);
    // Basis points: weight (0–100) × value (0–1) × 100. Integer arithmetic only.
    const points = Math.round(weight * value * 100);
    breakdown.push({ dimension, weight, value, points });
    total += points;
  }

  return { score: total, breakdown };
}

function compare(a: Evaluation, b: Evaluation, candidates: Map<string, ProviderCandidate>, matching: MatchingConfig): number {
  if (b.score !== a.score) return b.score - a.score;

  for (const tieBreaker of matching.tieBreakers) {
    const left = candidates.get(a.providerCompanyId)!;
    const right = candidates.get(b.providerCompanyId)!;
    switch (tieBreaker) {
      case 'response_performance_desc': {
        const diff = (right.responseScore ?? -1) - (left.responseScore ?? -1);
        if (diff !== 0) return diff;
        break;
      }
      case 'assignment_load_asc': {
        const diff = left.openAssignments - right.openAssignments;
        if (diff !== 0) return diff;
        break;
      }
      case 'provider_id_asc':
        return a.providerCompanyId.localeCompare(b.providerCompanyId);
    }
  }
  return a.providerCompanyId.localeCompare(b.providerCompanyId);
}

export function evaluateProviders(
  candidates: ProviderCandidate[],
  facts: ProjectFacts,
  matching: MatchingConfig,
): Evaluation[] {
  const byId = new Map(candidates.map((candidate) => [candidate.providerCompanyId, candidate]));

  const evaluations = candidates.map((candidate): Evaluation => {
    const checks = runEligibility(candidate, facts, matching.eligibility.required);
    const eligible = checks.every((check) => check.passed);
    const { score, breakdown } = scoreCandidate(candidate, facts, matching);

    const reasons = eligible
      ? breakdown
          .filter((component) => component.points > 0)
          .sort((a, b) => b.points - a.points)
          .slice(0, 3)
          .map((component) => `${component.dimension}: ${component.points} pts`)
      : checks.filter((check) => !check.passed).map((check) => `${check.rule}: ${check.detail}`);

    // An ineligible provider scores zero. A hard disqualification is never
    // something a high score can compensate for.
    return {
      providerCompanyId: candidate.providerCompanyId,
      displayName: candidate.displayName,
      eligible,
      checks,
      score: eligible ? score : 0,
      breakdown,
      reasons,
    };
  });

  const eligible = evaluations.filter((evaluation) => evaluation.eligible).sort((a, b) => compare(a, b, byId, matching));
  const ineligible = evaluations
    .filter((evaluation) => !evaluation.eligible)
    .sort((a, b) => a.providerCompanyId.localeCompare(b.providerCompanyId));

  return [...eligible, ...ineligible];
}

/** Providers that may be assigned, capped by the configured distribution maximum (ADR-008). */
export function selectForDistribution(evaluations: Evaluation[], matching: MatchingConfig): Evaluation[] {
  return evaluations.filter((evaluation) => evaluation.eligible).slice(0, matching.distribution.maxProviders);
}

export function ruleVersion(matching: MatchingConfig, configVersion: string): string {
  return `matching-v${matching.version}+config-${configVersion}`;
}
