import { describe, expect, it } from 'vitest';
import { DomainError } from '@/modules/errors';
import { loadMarketplaceConfigs } from '@/modules/marketplace-config/loader';
import { allowedServiceKeys, parseCoverage, type CoverageInput } from '@/modules/provider/coverage';

/**
 * Provider portal gate — "provider can update services and territories only
 * within allowed workflow" (docs/13-acceptance-criteria.md).
 *
 * These cover the pure rules. Authorization and persistence are in
 * tests/integration/coverage.test.ts.
 */

const configs = loadMarketplaceConfigs();
const suanas = configs.find((config) => config.slug === 'suanas-mx')!;
const pergolas = configs.find((config) => config.slug === 'pergolas-mx')!;

function input(overrides: Partial<CoverageInput> = {}): CoverageInput {
  return {
    services: [{ serviceKey: 'traditional', minProjectValueMinor: 5_000_000 }],
    postalPrefixes: ['011'],
    ...overrides,
  };
}

function expectRejection(run: () => unknown, code: string): void {
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

describe('allowed service keys come from configuration', () => {
  it('uses the questionnaire step named by the matching answer mapping', () => {
    expect(suanas.matching.answerMapping.service).toBe('type');
    expect(allowedServiceKeys(suanas)).toEqual(['traditional', 'infrared', 'steam']);
  });

  it('differs per marketplace without a code change', () => {
    // The second category maps a different step, which is the whole point of ADR-006.
    expect(pergolas.matching.answerMapping.service).not.toBe('type');
    expect(allowedServiceKeys(pergolas)).not.toEqual(allowedServiceKeys(suanas));
  });

  it('never offers "unsure" as a service a provider can claim', () => {
    const step = suanas.questionnaire.steps.find((candidate) => candidate.id === 'type');
    expect(step && 'options' in step ? step.options.map((option) => option.value) : []).toContain('unsure');
    expect(allowedServiceKeys(suanas)).not.toContain('unsure');
  });
});

describe('parseCoverage', () => {
  it('accepts a valid set and normalizes it', () => {
    const coverage = parseCoverage(
      suanas,
      input({
        services: [
          { serviceKey: 'steam', minProjectValueMinor: 0 },
          { serviceKey: ' traditional ', minProjectValueMinor: 5_000_000 },
        ],
        postalPrefixes: [' 06 ', '011', '', '011'],
      }),
    );

    // Sorted and deduplicated, so repeated submissions store identical rows.
    expect(coverage.services.map((service) => service.serviceKey)).toEqual(['steam', 'traditional']);
    expect(coverage.postalPrefixes).toEqual(['011', '06']);
  });

  it('rejects a service the marketplace does not offer', () => {
    expectRejection(() => parseCoverage(suanas, input({ services: [{ serviceKey: 'pool', minProjectValueMinor: 0 }] })), 'INVALID_SERVICE');
  });

  it('rejects a service borrowed from another marketplace', () => {
    const other = allowedServiceKeys(pergolas)[0]!;
    expectRejection(
      () => parseCoverage(suanas, input({ services: [{ serviceKey: other, minProjectValueMinor: 0 }] })),
      'INVALID_SERVICE',
    );
  });

  it('rejects "unsure" as a claimed service', () => {
    expectRejection(() => parseCoverage(suanas, input({ services: [{ serviceKey: 'unsure', minProjectValueMinor: 0 }] })), 'INVALID_SERVICE');
  });

  it('rejects a fractional minimum project value', () => {
    expectRejection(
      () => parseCoverage(suanas, input({ services: [{ serviceKey: 'traditional', minProjectValueMinor: 1_500.5 }] })),
      'INVALID_AMOUNT',
    );
  });

  it('rejects a negative minimum project value', () => {
    expectRejection(
      () => parseCoverage(suanas, input({ services: [{ serviceKey: 'traditional', minProjectValueMinor: -1 }] })),
      'INVALID_AMOUNT',
    );
  });

  it('accepts a zero minimum, which means "any budget"', () => {
    const coverage = parseCoverage(suanas, input({ services: [{ serviceKey: 'traditional', minProjectValueMinor: 0 }] }));
    expect(coverage.services[0]!.minProjectValueMinor).toBe(0);
  });

  it('rejects a non-numeric postal prefix', () => {
    expectRejection(() => parseCoverage(suanas, input({ postalPrefixes: ['CDMX'] })), 'INVALID_TERRITORY');
  });

  it('rejects a single-digit prefix, which would claim a tenth of the country', () => {
    expectRejection(() => parseCoverage(suanas, input({ postalPrefixes: ['0'] })), 'INVALID_TERRITORY');
  });

  it('rejects a prefix longer than a postal code', () => {
    expectRejection(() => parseCoverage(suanas, input({ postalPrefixes: ['012345'] })), 'INVALID_TERRITORY');
  });

  it('rejects an empty service set instead of silently stopping all leads', () => {
    expectRejection(() => parseCoverage(suanas, input({ services: [] })), 'COVERAGE_EMPTY');
  });

  it('rejects an empty territory set', () => {
    expectRejection(() => parseCoverage(suanas, input({ postalPrefixes: ['', '  '] })), 'COVERAGE_EMPTY');
  });

  it('caps how many prefixes one provider can claim', () => {
    const many = Array.from({ length: 51 }, (_, index) => String(10_000 + index));
    expectRejection(() => parseCoverage(suanas, input({ postalPrefixes: many })), 'COVERAGE_TOO_BROAD');
  });
});
