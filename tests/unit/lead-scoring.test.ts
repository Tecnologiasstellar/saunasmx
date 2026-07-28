import { describe, expect, it } from 'vitest';
import { computeLeadScore } from '@/modules/lead-scoring/score';
import { loadMarketplaceConfigs } from '@/modules/marketplace-config/loader';

/**
 * Lead grading (A/B/C) for suanas-mx questionnaire v2.
 *
 * Fixtures come straight from the task spec: a clear A, a clear B, and a
 * clear C. computeLeadScore is pure, so these run against the real
 * config/marketplaces/suanas-mx/lead-scoring.yaml with no DB involved.
 */

const suanas = loadMarketplaceConfigs().find((config) => config.slug === 'suanas-mx')!;
const config = suanas.leadScoring!;

describe('computeLeadScore (suanas-mx)', () => {
  it('grades a fully-qualified, fast, high-budget, decisive lead as A', () => {
    const answers = {
      type: 'traditional',
      setting: 'indoor',
      capacity: '4',
      project_stage: 'space_ready',
      professional_involved: 'architect',
      budget: '150000_300000',
      timeline: 'one_to_three_months',
      decision_authority: 'owner_primary',
    };
    const result = computeLeadScore(config, answers, { serviceable: true });
    expect(result.grade).toBe('A');
    expect(result.score).toBeGreaterThanOrEqual(75);
  });

  it('grades a mid-budget, planning-stage, joint-decision lead as B', () => {
    const answers = {
      type: 'infrared',
      setting: 'outdoor',
      capacity: '2',
      project_stage: 'planning',
      professional_involved: 'none',
      budget: '50000_100000',
      timeline: 'three_to_six_months',
      decision_authority: 'owner_joint',
    };
    const result = computeLeadScore(config, answers, { serviceable: true });
    expect(result.grade).toBe('B');
    expect(result.score).toBeGreaterThanOrEqual(45);
    expect(result.score).toBeLessThanOrEqual(74);
  });

  it('grades an unsure, only-researching, third-party lead as C with no auto-assignment path', () => {
    const answers = {
      type: 'unsure',
      setting: 'unsure',
      capacity: 'unsure',
      project_stage: 'researching',
      budget: 'unsure',
      timeline: 'researching',
      decision_authority: 'researching_for_other',
    };
    const result = computeLeadScore(config, answers, { serviceable: true });
    expect(result.grade).toBe('C');
    expect(result.score).toBeLessThan(45);
  });

  it('grades an otherwise-A lead as C when out of coverage', () => {
    const answers = {
      type: 'traditional',
      setting: 'indoor',
      capacity: '4',
      project_stage: 'space_ready',
      professional_involved: 'architect',
      budget: '150000_300000',
      timeline: 'one_to_three_months',
      decision_authority: 'owner_primary',
    };
    const result = computeLeadScore(config, answers, { serviceable: false });
    expect(result.grade).toBe('C');
  });

  it('never leaks reasons as anything other than an array of strings', () => {
    const result = computeLeadScore(config, { budget: 'unsure' }, { serviceable: true });
    expect(Array.isArray(result.reasons)).toBe(true);
    for (const reason of result.reasons) expect(typeof reason).toBe('string');
  });
});
