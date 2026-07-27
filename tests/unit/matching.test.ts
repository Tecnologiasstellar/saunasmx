import { describe, expect, it } from 'vitest';
import { budgetMeetsMinimum, parseBudgetBucket } from '@/modules/matching-engine/budget';
import { evaluateProviders, selectForDistribution, type ProjectFacts, type ProviderCandidate } from '@/modules/matching-engine/evaluate';
import type { MatchingConfig } from '@/modules/marketplace-config/types';

/**
 * Matching gate — docs/13-acceptance-criteria.md.
 * Every hard disqualifier gets its own test.
 */

const MATCHING: MatchingConfig = {
  version: 1,
  reviewPolicy: 'manual',
  distribution: { mode: 'curated', maxProviders: 2 },
  eligibility: {
    required: [
      'provider_marketplace_status_approved',
      'service_matches_project_type',
      'territory_matches_location',
      'project_budget_meets_provider_minimum',
      'provider_capacity_available',
    ],
  },
  answerMapping: { service: 'type', budget: 'budget' },
  scoring: { geography: 25, specialization: 25, budget_fit: 15, response_performance: 15, consumer_rating: 10, capacity: 10 },
  tieBreakers: ['response_performance_desc', 'assignment_load_asc', 'provider_id_asc'],
  explanationsRequired: true,
  aiRole: 'attribute_extraction_and_summary_only',
};

function candidate(overrides: Partial<ProviderCandidate> & { providerCompanyId: string }): ProviderCandidate {
  return {
    displayName: overrides.providerCompanyId,
    status: 'approved',
    services: [{ serviceKey: 'traditional', minProjectValueMinor: 5_000_000 }],
    postalPrefixes: ['01'],
    capacityLimit: 10,
    openAssignments: 0,
    averageRating: null,
    responseScore: null,
    ...overrides,
  };
}

const FACTS: ProjectFacts = {
  postalCode: '01000',
  serviceKey: 'traditional',
  budget: parseBudgetBucket('100000_200000'),
};

function evaluateOne(overrides: Partial<ProviderCandidate>, facts: ProjectFacts = FACTS) {
  const result = evaluateProviders([candidate({ providerCompanyId: 'p1', ...overrides })], facts, MATCHING);
  return result[0]!;
}

describe('budget buckets', () => {
  it.each([
    ['under_50000', { known: true, minMinor: 0, maxMinor: 5_000_000 }],
    ['50000_100000', { known: true, minMinor: 5_000_000, maxMinor: 10_000_000 }],
    ['over_200000', { known: true, minMinor: 20_000_000, maxMinor: null }],
    ['unsure', { known: false, minMinor: null, maxMinor: null }],
  ])('parses %s', (bucket, expected) => {
    expect(parseBudgetBucket(bucket)).toEqual(expected);
  });

  it('never treats an unstated budget as zero', () => {
    expect(budgetMeetsMinimum(parseBudgetBucket('unsure'), 50_000_000)).toBe(true);
  });

  it('rejects a budget ceiling below the provider minimum', () => {
    expect(budgetMeetsMinimum(parseBudgetBucket('under_50000'), 8_000_000)).toBe(false);
  });
});

describe('hard eligibility', () => {
  it('accepts a fully matching provider', () => {
    expect(evaluateOne({}).eligible).toBe(true);
  });

  it.each(['pending', 'paused', 'rejected', 'suspended'])('disqualifies a provider whose relationship is %s', (status) => {
    const evaluation = evaluateOne({ status });
    expect(evaluation.eligible).toBe(false);
    expect(evaluation.checks.find((check) => check.rule === 'provider_marketplace_status_approved')?.passed).toBe(false);
  });

  it('disqualifies a territory mismatch', () => {
    const evaluation = evaluateOne({ postalPrefixes: ['44', '45'] });
    expect(evaluation.eligible).toBe(false);
    expect(evaluation.checks.find((check) => check.rule === 'territory_matches_location')?.passed).toBe(false);
  });

  it('disqualifies a service mismatch', () => {
    const evaluation = evaluateOne({ services: [{ serviceKey: 'steam', minProjectValueMinor: 0 }] });
    expect(evaluation.eligible).toBe(false);
    expect(evaluation.checks.find((check) => check.rule === 'service_matches_project_type')?.passed).toBe(false);
  });

  it('enforces the provider budget minimum', () => {
    const evaluation = evaluateOne(
      { services: [{ serviceKey: 'traditional', minProjectValueMinor: 30_000_000 }] },
      { ...FACTS, budget: parseBudgetBucket('under_50000') },
    );
    expect(evaluation.eligible).toBe(false);
    expect(evaluation.checks.find((check) => check.rule === 'project_budget_meets_provider_minimum')?.passed).toBe(false);
  });

  it('disqualifies a provider at capacity', () => {
    const evaluation = evaluateOne({ capacityLimit: 2, openAssignments: 2 });
    expect(evaluation.eligible).toBe(false);
    expect(evaluation.checks.find((check) => check.rule === 'provider_capacity_available')?.passed).toBe(false);
  });

  it('does not disqualify anyone when the consumer did not state a service type', () => {
    const evaluation = evaluateOne({ services: [{ serviceKey: 'steam', minProjectValueMinor: 0 }] }, { ...FACTS, serviceKey: 'unsure' });
    expect(evaluation.eligible).toBe(true);
  });

  it('scores an ineligible provider zero, so a high score cannot compensate', () => {
    const evaluation = evaluateOne({ status: 'pending', averageRating: 5, responseScore: 100 });
    expect(evaluation.score).toBe(0);
  });

  it('explains why a provider was disqualified', () => {
    const evaluation = evaluateOne({ postalPrefixes: ['99'] });
    expect(evaluation.reasons.join(' ')).toContain('territory_matches_location');
  });

  it('only applies the rules the marketplace configured', () => {
    const relaxed: MatchingConfig = { ...MATCHING, eligibility: { required: ['provider_marketplace_status_approved'] } };
    const [evaluation] = evaluateProviders([candidate({ providerCompanyId: 'p1', postalPrefixes: ['99'] })], FACTS, relaxed);
    expect(evaluation?.eligible).toBe(true);
    expect(evaluation?.checks).toHaveLength(1);
  });
});

describe('scoring', () => {
  it('is driven by the configured weights', () => {
    const geographyOnly: MatchingConfig = { ...MATCHING, scoring: { geography: 100 } };
    const [evaluation] = evaluateProviders([candidate({ providerCompanyId: 'p1', postalPrefixes: ['01000'] })], FACTS, geographyOnly);
    // Full 5-digit prefix match against a 5-digit postal code: 100 × 1.0 × 100 bps.
    expect(evaluation?.score).toBe(10_000);
    expect(evaluation?.breakdown).toHaveLength(1);
  });

  it('changes the ranking when the weights change', () => {
    const local = candidate({ providerCompanyId: 'aaa-local', postalPrefixes: ['01000'], responseScore: 10 });
    const responsive = candidate({ providerCompanyId: 'bbb-responsive', postalPrefixes: ['0'], responseScore: 100 });

    const byGeography = evaluateProviders([local, responsive], FACTS, { ...MATCHING, scoring: { geography: 100 } });
    expect(byGeography[0]?.providerCompanyId).toBe('aaa-local');

    const byResponse = evaluateProviders([local, responsive], FACTS, { ...MATCHING, scoring: { response_performance: 100 } });
    expect(byResponse[0]?.providerCompanyId).toBe('bbb-responsive');
  });

  it('gives a provider with no history a neutral prior rather than a zero', () => {
    const evaluation = evaluateOne({ averageRating: null, responseScore: null });
    const response = evaluation.breakdown.find((component) => component.dimension === 'response_performance');
    expect(response?.value).toBe(0.5);
  });

  it('produces integer basis points only', () => {
    const evaluation = evaluateOne({ averageRating: 4.37, responseScore: 83 });
    expect(Number.isInteger(evaluation.score)).toBe(true);
    for (const component of evaluation.breakdown) expect(Number.isInteger(component.points)).toBe(true);
  });

  it('is deterministic across runs and input order', () => {
    const candidates = [
      candidate({ providerCompanyId: 'ccc', responseScore: 70 }),
      candidate({ providerCompanyId: 'aaa', responseScore: 70 }),
      candidate({ providerCompanyId: 'bbb', responseScore: 70 }),
    ];
    const first = evaluateProviders(candidates, FACTS, MATCHING).map((evaluation) => evaluation.providerCompanyId);
    const reversed = evaluateProviders([...candidates].reverse(), FACTS, MATCHING).map((evaluation) => evaluation.providerCompanyId);
    expect(first).toEqual(reversed);
    // Identical scores fall through to the configured tie breakers.
    expect(first).toEqual(['aaa', 'bbb', 'ccc']);
  });

  it('breaks ties by response performance before assignment load', () => {
    const candidates = [
      candidate({ providerCompanyId: 'aaa', responseScore: 50, openAssignments: 0 }),
      candidate({ providerCompanyId: 'bbb', responseScore: 50, openAssignments: 0 }),
    ];
    const weightless: MatchingConfig = { ...MATCHING, scoring: { specialization: 100 } };
    const ranked = evaluateProviders(candidates, FACTS, weightless);
    expect(ranked.map((evaluation) => evaluation.providerCompanyId)).toEqual(['aaa', 'bbb']);
  });

  it('ranks eligible providers ahead of ineligible ones', () => {
    const ranked = evaluateProviders(
      [candidate({ providerCompanyId: 'zzz-eligible' }), candidate({ providerCompanyId: 'aaa-ineligible', status: 'pending' })],
      FACTS,
      MATCHING,
    );
    expect(ranked[0]?.providerCompanyId).toBe('zzz-eligible');
    expect(ranked[1]?.eligible).toBe(false);
  });
});

describe('distribution', () => {
  it('caps the recommendation at the configured maximum', () => {
    const candidates = ['aaa', 'bbb', 'ccc', 'ddd'].map((id) => candidate({ providerCompanyId: id }));
    const ranked = evaluateProviders(candidates, FACTS, MATCHING);
    expect(selectForDistribution(ranked, MATCHING)).toHaveLength(2);
  });

  it('never recommends an ineligible provider to fill the quota', () => {
    const candidates = [
      candidate({ providerCompanyId: 'aaa' }),
      candidate({ providerCompanyId: 'bbb', status: 'pending' }),
      candidate({ providerCompanyId: 'ccc', postalPrefixes: ['99'] }),
    ];
    const selected = selectForDistribution(evaluateProviders(candidates, FACTS, MATCHING), MATCHING);
    expect(selected.map((evaluation) => evaluation.providerCompanyId)).toEqual(['aaa']);
  });
});
