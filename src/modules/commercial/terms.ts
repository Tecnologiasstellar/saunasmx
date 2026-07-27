import { z } from 'zod';
import { DomainError } from '../errors';

/**
 * Commercial plan terms (docs/07-billing-and-economics.md).
 *
 * One flat, validated shape covering every pricing primitive the doc lists.
 * Money is always integer minor units and rates are always basis points, so
 * nothing downstream has to guess at a float. A plan that charges nothing is
 * valid and is the pilot default: terms are recorded long before they are
 * billed.
 *
 * Terms are snapshotted onto `provider_agreement` when a plan is assigned, so
 * this schema also describes what a historical agreement contains. Add fields
 * as optional-with-default; never repurpose an existing one.
 */

export const PLAN_TERMS_VERSION = 1;

const minorUnits = z.number().int().min(0).max(1_000_000_000);

export const planTermsSchema = z.strictObject({
  version: z.literal(PLAN_TERMS_VERSION).default(PLAN_TERMS_VERSION),
  currency: z.string().regex(/^[A-Z]{3}$/, 'Currency must be a three-letter ISO code'),
  monthlySubscriptionMinor: minorUnits.default(0),
  qualifiedLeadFeeMinor: minorUnits.default(0),
  acceptedLeadFeeMinor: minorUnits.default(0),
  appointmentFeeMinor: minorUnits.default(0),
  fixedSuccessFeeMinor: minorUnits.default(0),
  /** 10 000 bps = 100%. A success commission above the project value is a typo, not a deal. */
  successCommissionBps: z.number().int().min(0).max(10_000).default(0),
  /** Disclosed placement only. It must never reach the matching engine (docs/07 "Provider trust"). */
  featuredPlacement: z.boolean().default(false),
  note: z.string().max(500).optional(),
});

export type PlanTerms = z.infer<typeof planTermsSchema>;

/** Parses untrusted terms — a form body, a seed fixture, or a stored snapshot. */
export function parsePlanTerms(input: unknown): PlanTerms {
  const result = planTermsSchema.safeParse(input);
  if (!result.success) {
    const issues = result.error.issues.map((issue) => `${issue.path.join('.') || 'terms'}: ${issue.message}`);
    throw new DomainError('INVALID_TERMS', `These plan terms are not valid — ${issues.join('; ')}`, 422);
  }
  return result.data;
}

const TERMS_KEYS = Object.keys(planTermsSchema.shape).sort();

/**
 * Order-independent identity for a set of terms.
 *
 * PostgreSQL `jsonb` does not preserve key order, so a stored snapshot never
 * stringifies the same way as the object that produced it. Comparing on this
 * fingerprint is what makes "assign the plan they already hold" a no-op.
 */
export function termsFingerprint(terms: PlanTerms): string {
  return JSON.stringify(terms, TERMS_KEYS);
}

export type CommissionTrigger = 'qualified_lead' | 'accepted_lead' | 'appointment' | 'verified_win';

export type CommissionTerms = {
  trigger: CommissionTrigger;
  rateBps: number | null;
  fixedFeeMinor: number | null;
};

/**
 * The commission agreements a plan implies. Pure, so the same terms always
 * produce the same rows and a stored agreement can be re-derived and compared.
 *
 * A monthly subscription produces nothing here: it is billed on its own cycle,
 * not triggered by a project event.
 */
export function commissionTermsFrom(terms: PlanTerms): CommissionTerms[] {
  const rows: CommissionTerms[] = [];

  if (terms.qualifiedLeadFeeMinor > 0) {
    rows.push({ trigger: 'qualified_lead', rateBps: null, fixedFeeMinor: terms.qualifiedLeadFeeMinor });
  }
  if (terms.acceptedLeadFeeMinor > 0) {
    rows.push({ trigger: 'accepted_lead', rateBps: null, fixedFeeMinor: terms.acceptedLeadFeeMinor });
  }
  if (terms.appointmentFeeMinor > 0) {
    rows.push({ trigger: 'appointment', rateBps: null, fixedFeeMinor: terms.appointmentFeeMinor });
  }
  // A win can carry a fixed fee, a percentage, or both — one agreement covers it.
  if (terms.fixedSuccessFeeMinor > 0 || terms.successCommissionBps > 0) {
    rows.push({
      trigger: 'verified_win',
      rateBps: terms.successCommissionBps > 0 ? terms.successCommissionBps : null,
      fixedFeeMinor: terms.fixedSuccessFeeMinor > 0 ? terms.fixedSuccessFeeMinor : null,
    });
  }

  return rows;
}

/** True when no money can ever change hands under these terms. */
export function isFreeOfCharge(terms: PlanTerms): boolean {
  return terms.monthlySubscriptionMinor === 0 && commissionTermsFrom(terms).length === 0;
}

/** Short human-readable lines for the operator screen and audit metadata. */
export function describeTerms(terms: PlanTerms): string[] {
  const money = (minor: number) => `${(minor / 100).toLocaleString('es-MX')} ${terms.currency}`;
  const lines: string[] = [];

  if (terms.monthlySubscriptionMinor > 0) lines.push(`Suscripción mensual ${money(terms.monthlySubscriptionMinor)}`);
  if (terms.qualifiedLeadFeeMinor > 0) lines.push(`Por lead calificado ${money(terms.qualifiedLeadFeeMinor)}`);
  if (terms.acceptedLeadFeeMinor > 0) lines.push(`Por lead aceptado ${money(terms.acceptedLeadFeeMinor)}`);
  if (terms.appointmentFeeMinor > 0) lines.push(`Por cita ${money(terms.appointmentFeeMinor)}`);
  if (terms.fixedSuccessFeeMinor > 0) lines.push(`Éxito fijo ${money(terms.fixedSuccessFeeMinor)}`);
  if (terms.successCommissionBps > 0) lines.push(`Comisión por éxito ${terms.successCommissionBps / 100}%`);
  if (terms.featuredPlacement) lines.push('Incluye posición destacada (no afecta la elegibilidad)');

  return lines.length > 0 ? lines : ['Sin costo'];
}
