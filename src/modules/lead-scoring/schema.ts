import { z } from 'zod';

/**
 * Raw file schema for an optional per-marketplace lead-scoring config
 * (`config/marketplaces/<slug>/lead-scoring.yaml`). Mirrors matching.yaml's
 * style: named dimensions with a point table, a grade ladder evaluated in
 * order. A marketplace that has no use for lead grading simply omits
 * `lead_scoring` from marketplace.yaml — see marketplace-config/schema.ts.
 */

const KEY = /^[a-z0-9]+(_[a-z0-9]+)*$/;

const dimensionSchema = z.strictObject({
  field: z.string().regex(KEY),
  points: z.record(z.string(), z.number().int()),
  /** Awarded when the field is absent, e.g. a conditional field the consumer never saw. */
  pointsIfUnanswered: z.number().int().optional(),
});

const rankRuleSchema = z.strictObject({
  field: z.string().regex(KEY),
  /** The candidate's point-table key must rank at least this good (by table order). */
  atLeastAsGoodAs: z.string(),
});

const gradeRuleSchema = z.strictObject({
  grade: z.enum(['A', 'B', 'C']),
  minScore: z.number().int().min(0).max(100).optional(),
  maxScore: z.number().int().min(0).max(100).optional(),
  requireServiceable: z.boolean().optional(),
  minRank: rankRuleSchema.optional(),
  maxRank: rankRuleSchema.optional(),
  fieldIn: z.record(z.string(), z.array(z.string())).optional(),
  fieldNotIn: z.record(z.string(), z.array(z.string())).optional(),
});

export const leadScoringFileSchema = z
  .strictObject({
    version: z.number().int().positive(),
    completeness: z.strictObject({
      fields: z.array(z.string().regex(KEY)).min(1),
      unsureValue: z.string().min(1),
      pointsComplete: z.number().int().min(0),
      pointsPartial: z.number().int().min(0),
    }),
    dimensions: z.array(dimensionSchema).min(1),
    contactBonus: z.number().int().min(0),
    grades: z.array(gradeRuleSchema).min(1),
  })
  .superRefine((value, ctx) => {
    const grades = value.grades.map((g) => g.grade);
    if (new Set(grades).size !== grades.length) {
      ctx.addIssue({ code: 'custom', path: ['grades'], message: 'grade rules must not repeat a grade' });
    }
    if (!grades.includes('C')) {
      ctx.addIssue({ code: 'custom', path: ['grades'], message: 'grades must include a "C" fallback rule' });
    }
  });

export type LeadScoringFile = z.infer<typeof leadScoringFileSchema>;
