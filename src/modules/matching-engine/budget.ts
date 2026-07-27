/**
 * Budget bucket parsing.
 *
 * Questionnaire budget options follow a documented key convention so that a new
 * category needs no code: `under_50000`, `50000_100000`, `over_200000`, and any
 * other value (typically `unsure`) meaning "not stated".
 *
 * Values in the keys are major units; everything downstream is minor units.
 */

export type BudgetRange = {
  /** False when the consumer did not state a budget. Never treat this as zero. */
  known: boolean;
  minMinor: number | null;
  maxMinor: number | null;
};

const MINOR_UNITS_PER_MAJOR = 100;

const UNDER = /^under_(\d+)$/;
const OVER = /^over_(\d+)$/;
const BETWEEN = /^(\d+)_(\d+)$/;

export function parseBudgetBucket(bucket: string | null | undefined): BudgetRange {
  if (!bucket) return { known: false, minMinor: null, maxMinor: null };

  const under = UNDER.exec(bucket);
  if (under?.[1]) return { known: true, minMinor: 0, maxMinor: Number(under[1]) * MINOR_UNITS_PER_MAJOR };

  const over = OVER.exec(bucket);
  if (over?.[1]) return { known: true, minMinor: Number(over[1]) * MINOR_UNITS_PER_MAJOR, maxMinor: null };

  const between = BETWEEN.exec(bucket);
  if (between?.[1] && between[2]) {
    return {
      known: true,
      minMinor: Number(between[1]) * MINOR_UNITS_PER_MAJOR,
      maxMinor: Number(between[2]) * MINOR_UNITS_PER_MAJOR,
    };
  }

  return { known: false, minMinor: null, maxMinor: null };
}

/**
 * Whether a stated budget can reach a provider's minimum project value.
 *
 * An unstated budget does not disqualify — it is an operator decision, not an
 * automatic rejection, so the lead is reviewed rather than silently dropped.
 */
export function budgetMeetsMinimum(range: BudgetRange, minimumMinor: number): boolean {
  if (!range.known) return true;
  if (range.maxMinor === null) return true;
  return range.maxMinor >= minimumMinor;
}
