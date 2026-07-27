import { describe, expect, it } from 'vitest';
import {
  commissionTermsFrom,
  describeTerms,
  isFreeOfCharge,
  parsePlanTerms,
  PLAN_TERMS_VERSION,
  termsFingerprint,
  type PlanTerms,
} from '@/modules/commercial/terms';
import { DomainError } from '@/modules/errors';

/**
 * Commercial gate — plan terms (docs/07-billing-and-economics.md).
 * Money is integer minor units; rates are basis points. Nothing here is a float.
 */

function terms(overrides: Partial<PlanTerms> = {}): PlanTerms {
  return parsePlanTerms({ currency: 'MXN', ...overrides });
}

function expectRejection(run: () => unknown, code = 'INVALID_TERMS'): void {
  try {
    run();
  } catch (error) {
    expect(error).toBeInstanceOf(DomainError);
    expect((error as DomainError).code).toBe(code);
    expect((error as DomainError).status).toBe(422);
    return;
  }
  throw new Error(`expected ${code} to be thrown`);
}

describe('parsePlanTerms', () => {
  it('fills every pricing primitive with zero, so a pilot plan is just a currency', () => {
    expect(terms()).toEqual({
      version: PLAN_TERMS_VERSION,
      currency: 'MXN',
      monthlySubscriptionMinor: 0,
      qualifiedLeadFeeMinor: 0,
      acceptedLeadFeeMinor: 0,
      appointmentFeeMinor: 0,
      fixedSuccessFeeMinor: 0,
      successCommissionBps: 0,
      featuredPlacement: false,
    });
  });

  it('requires a currency', () => {
    expectRejection(() => parsePlanTerms({}));
  });

  it('rejects a currency that is not a three-letter ISO code', () => {
    expectRejection(() => parsePlanTerms({ currency: 'pesos' }));
  });

  it('rejects fractional money', () => {
    expectRejection(() => parsePlanTerms({ currency: 'MXN', monthlySubscriptionMinor: 1500.5 }));
  });

  it('rejects negative money', () => {
    expectRejection(() => parsePlanTerms({ currency: 'MXN', qualifiedLeadFeeMinor: -1 }));
  });

  it('rejects a commission above 100%', () => {
    expectRejection(() => parsePlanTerms({ currency: 'MXN', successCommissionBps: 10_001 }));
  });

  it('accepts exactly 100%', () => {
    expect(terms({ successCommissionBps: 10_000 }).successCommissionBps).toBe(10_000);
  });

  it('rejects an unknown field rather than silently dropping it', () => {
    // A typo in a money field must not become a free plan.
    expectRejection(() => parsePlanTerms({ currency: 'MXN', succesFeeBps: 500 }));
  });

  it('rejects an unrecognized terms version', () => {
    expectRejection(() => parsePlanTerms({ version: 99, currency: 'MXN' }));
  });
});

describe('commissionTermsFrom', () => {
  it('produces nothing for a free plan', () => {
    expect(commissionTermsFrom(terms())).toEqual([]);
    expect(isFreeOfCharge(terms())).toBe(true);
  });

  it('does not turn a subscription into a commission', () => {
    // A monthly fee is billed on its own cycle, not triggered by a project.
    const subscriptionOnly = terms({ monthlySubscriptionMinor: 200_000 });
    expect(commissionTermsFrom(subscriptionOnly)).toEqual([]);
    expect(isFreeOfCharge(subscriptionOnly)).toBe(false);
  });

  it('maps each fee to its trigger', () => {
    const all = terms({
      qualifiedLeadFeeMinor: 25_000,
      acceptedLeadFeeMinor: 50_000,
      appointmentFeeMinor: 75_000,
    });
    expect(commissionTermsFrom(all)).toEqual([
      { trigger: 'qualified_lead', rateBps: null, fixedFeeMinor: 25_000 },
      { trigger: 'accepted_lead', rateBps: null, fixedFeeMinor: 50_000 },
      { trigger: 'appointment', rateBps: null, fixedFeeMinor: 75_000 },
    ]);
  });

  it('folds a fixed success fee and a percentage into one verified-win agreement', () => {
    expect(commissionTermsFrom(terms({ fixedSuccessFeeMinor: 100_000, successCommissionBps: 300 }))).toEqual([
      { trigger: 'verified_win', rateBps: 300, fixedFeeMinor: 100_000 },
    ]);
  });

  it('leaves the unused half null rather than zero', () => {
    // Null means "not part of this deal"; zero would read as "free".
    expect(commissionTermsFrom(terms({ successCommissionBps: 500 }))).toEqual([
      { trigger: 'verified_win', rateBps: 500, fixedFeeMinor: null },
    ]);
    expect(commissionTermsFrom(terms({ fixedSuccessFeeMinor: 500_000 }))).toEqual([
      { trigger: 'verified_win', rateBps: null, fixedFeeMinor: 500_000 },
    ]);
  });
});

describe('termsFingerprint', () => {
  it('ignores key order, because jsonb does not preserve it', () => {
    const a = parsePlanTerms({ currency: 'MXN', qualifiedLeadFeeMinor: 25_000, successCommissionBps: 300 });
    const shuffled = parsePlanTerms(
      Object.fromEntries(Object.entries(a).reverse()) as unknown as Record<string, unknown>,
    );
    expect(termsFingerprint(shuffled)).toBe(termsFingerprint(a));
  });

  it('still separates terms that actually differ', () => {
    expect(termsFingerprint(terms({ qualifiedLeadFeeMinor: 1 }))).not.toBe(termsFingerprint(terms()));
  });
});

describe('describeTerms', () => {
  it('says so plainly when nothing is charged', () => {
    expect(describeTerms(terms())).toEqual(['Sin costo']);
  });

  it('discloses featured placement as not affecting eligibility', () => {
    // docs/07 "Provider trust": placement may be sponsored, ranking may not.
    expect(describeTerms(terms({ featuredPlacement: true })).join(' ')).toContain('no afecta la elegibilidad');
  });

  it('renders a percentage from basis points', () => {
    expect(describeTerms(terms({ successCommissionBps: 350 })).join(' ')).toContain('3.5%');
  });
});
