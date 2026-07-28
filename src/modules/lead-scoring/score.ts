import type { LeadScoringConfig, LeadScoringGradeRule } from '../marketplace-config/types';

/**
 * Computes a lead's quality score and A/B/C grade from a marketplace's
 * optional lead-scoring config and the consumer's questionnaire answers.
 *
 * Pure and deterministic (ADR-005 keeps AI out of eligibility/grading) — no
 * DB access, so it's directly unit-testable against the spec's fixtures.
 */

export type LeadScoreResult = { score: number; grade: 'A' | 'B' | 'C'; reasons: string[] };

function rankIndex(points: Record<string, number>, value: string | undefined): number | null {
  if (value === undefined) return null;
  const index = Object.keys(points).indexOf(value);
  return index === -1 ? null : index;
}

function atLeastAsGoodAs(
  dimensions: LeadScoringConfig['dimensions'],
  field: string,
  candidate: string | undefined,
  threshold: string,
): boolean {
  const dimension = dimensions.find((d) => d.field === field);
  if (!dimension) return false;
  const candidateIndex = rankIndex(dimension.points, candidate);
  const thresholdIndex = rankIndex(dimension.points, threshold);
  if (candidateIndex === null || thresholdIndex === null) return false;
  return candidateIndex <= thresholdIndex;
}

function matchesGrade(
  rule: LeadScoringGradeRule,
  score: number,
  answers: Record<string, unknown>,
  serviceable: boolean,
  dimensions: LeadScoringConfig['dimensions'],
): boolean {
  if (rule.minScore !== undefined && score < rule.minScore) return false;
  if (rule.maxScore !== undefined && score > rule.maxScore) return false;
  if (rule.requireServiceable && !serviceable) return false;

  if (rule.minRank) {
    const candidate = answers[rule.minRank.field];
    if (!atLeastAsGoodAs(dimensions, rule.minRank.field, typeof candidate === 'string' ? candidate : undefined, rule.minRank.atLeastAsGoodAs)) {
      return false;
    }
  }
  if (rule.maxRank) {
    const candidate = answers[rule.maxRank.field];
    if (!atLeastAsGoodAs(dimensions, rule.maxRank.field, typeof candidate === 'string' ? candidate : undefined, rule.maxRank.atLeastAsGoodAs)) {
      return false;
    }
  }
  if (rule.fieldIn) {
    for (const [field, allowed] of Object.entries(rule.fieldIn)) {
      const candidate = answers[field];
      if (typeof candidate !== 'string' || !allowed.includes(candidate)) return false;
    }
  }
  if (rule.fieldNotIn) {
    for (const [field, disallowed] of Object.entries(rule.fieldNotIn)) {
      const candidate = answers[field];
      if (typeof candidate === 'string' && disallowed.includes(candidate)) return false;
    }
  }
  return true;
}

export function computeLeadScore(
  config: LeadScoringConfig,
  answers: Record<string, unknown>,
  context: { serviceable: boolean },
): LeadScoreResult {
  const reasons: string[] = [];
  let score = 0;

  // Completeness of the core specs (type/setting/capacity or equivalent).
  const coreValues = config.completeness.fields.map((field) => answers[field]);
  const allAnswered = coreValues.every((value) => typeof value === 'string' && value.length > 0);
  const anyUnsure = coreValues.some((value) => value === config.completeness.unsureValue);
  if (allAnswered && !anyUnsure) {
    score += config.completeness.pointsComplete;
    reasons.push(`Especificaciones completas y definidas (+${config.completeness.pointsComplete})`);
  } else {
    score += config.completeness.pointsPartial;
    reasons.push(`Especificaciones incompletas o "aún no lo sé" (+${config.completeness.pointsPartial})`);
  }

  // Each configured answer dimension.
  for (const dimension of config.dimensions) {
    const value = answers[dimension.field];
    if (typeof value !== 'string' || value.length === 0) {
      const points = dimension.pointsIfUnanswered ?? 0;
      score += points;
      reasons.push(`${dimension.field}: sin respuesta (+${points})`);
      continue;
    }
    const points = dimension.points[value] ?? 0;
    score += points;
    reasons.push(`${dimension.field}: ${value} (+${points})`);
  }

  // WhatsApp validation and both consents are already required to submit at
  // all, so this bonus always applies — kept explicit for operator context.
  score += config.contactBonus;
  reasons.push(`WhatsApp válido y consentimientos otorgados (+${config.contactBonus})`);

  score = Math.max(0, Math.min(100, score));

  const matched = config.grades.find((rule) => matchesGrade(rule, score, answers, context.serviceable, config.dimensions));
  const grade = matched?.grade ?? 'C';
  reasons.push(`Calificación: ${grade} (score ${score}${context.serviceable ? '' : ', fuera de cobertura'})`);

  return { score, grade, reasons };
}
