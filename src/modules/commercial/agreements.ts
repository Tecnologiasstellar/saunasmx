import { and, asc, desc, eq, isNull } from 'drizzle-orm';
import type { Database, Tx } from '../database/client';
import {
  commercialPlan,
  commissionAgreement,
  providerAgreement,
  providerCompany,
  providerMarketplace,
} from '../database/schema';
import { DomainError } from '../errors';
import { type Actor, recordAudit } from '../observability/audit';
import { commissionTermsFrom, parsePlanTerms, termsFingerprint, type CommissionTerms, type PlanTerms } from './terms';

/**
 * Plans and provider agreements (docs/07-billing-and-economics.md, COM-001).
 *
 * Commercial rules attach to the provider–marketplace relationship, so the same
 * company can be on different terms in two categories.
 *
 * The rule that everything else depends on: `provider_agreement.terms_snapshot_json`
 * is a copy taken at signature time. Editing or deactivating a plan afterwards
 * changes what *new* agreements will say and nothing else. An agreement is
 * never mutated or deleted — switching plans closes the current one with an
 * `ends_at` and opens a successor, so the history stays readable.
 *
 * No outbox event is emitted: contracts/events.md defines no `agreement.*`
 * type, and nothing external consumes an agreement yet. Stripe linkage is
 * COM-002 and the commission ledger is COM-003.
 */

type CommandContext = {
  actor: Actor;
  correlationId: string;
  now?: Date;
};

/* Plans ------------------------------------------------------------------- */

export async function createPlan(
  db: Database,
  args: { marketplaceId: string; name: string; terms: unknown } & CommandContext,
): Promise<{ planId: string; terms: PlanTerms }> {
  const terms = parsePlanTerms(args.terms);
  const name = args.name.trim();
  if (name.length === 0 || name.length > 120) {
    throw new DomainError('INVALID_PLAN_NAME', 'The plan needs a name of up to 120 characters.', 422);
  }

  return db.transaction(async (tx) => {
    const [row] = await tx
      .insert(commercialPlan)
      .values({ marketplaceId: args.marketplaceId, name, termsJson: terms, active: true })
      .returning({ id: commercialPlan.id });

    await recordAudit(tx, {
      actor: args.actor,
      action: 'commercial_plan.created',
      entityType: 'commercial_plan',
      entityId: row!.id,
      marketplaceId: args.marketplaceId,
      metadata: { correlationId: args.correlationId, name, terms },
    });

    return { planId: row!.id, terms };
  });
}

/** Loads a plan, refusing one that belongs to another marketplace. */
async function loadPlan(tx: Tx, planId: string, marketplaceId: string) {
  const [plan] = await tx
    .select()
    .from(commercialPlan)
    .where(and(eq(commercialPlan.id, planId), eq(commercialPlan.marketplaceId, marketplaceId)))
    .limit(1);
  // Same error either way: an operator on one host must not be able to probe
  // for the existence of another marketplace's plans.
  if (!plan) throw new DomainError('PLAN_NOT_FOUND', 'Plan not found in this marketplace.', 404);
  return plan;
}

/**
 * Rewrites a plan's terms for future agreements. Existing agreements keep the
 * snapshot they were signed with — that is what the snapshot is for.
 */
export async function updatePlanTerms(
  db: Database,
  args: { planId: string; marketplaceId: string; terms: unknown } & CommandContext,
): Promise<{ terms: PlanTerms }> {
  const terms = parsePlanTerms(args.terms);

  return db.transaction(async (tx) => {
    const plan = await loadPlan(tx, args.planId, args.marketplaceId);
    await tx.update(commercialPlan).set({ termsJson: terms }).where(eq(commercialPlan.id, plan.id));

    await recordAudit(tx, {
      actor: args.actor,
      action: 'commercial_plan.terms_updated',
      entityType: 'commercial_plan',
      entityId: plan.id,
      marketplaceId: args.marketplaceId,
      metadata: { correlationId: args.correlationId, before: plan.termsJson, after: terms },
    });

    return { terms };
  });
}

/** Retires a plan from the menu. Providers already on it keep their agreement. */
export async function setPlanActive(
  db: Database,
  args: { planId: string; marketplaceId: string; active: boolean } & CommandContext,
): Promise<{ changed: boolean }> {
  return db.transaction(async (tx) => {
    const plan = await loadPlan(tx, args.planId, args.marketplaceId);
    if (plan.active === args.active) return { changed: false };

    await tx.update(commercialPlan).set({ active: args.active }).where(eq(commercialPlan.id, plan.id));

    await recordAudit(tx, {
      actor: args.actor,
      action: args.active ? 'commercial_plan.activated' : 'commercial_plan.deactivated',
      entityType: 'commercial_plan',
      entityId: plan.id,
      marketplaceId: args.marketplaceId,
      metadata: { correlationId: args.correlationId },
    });

    return { changed: true };
  });
}

/* Agreements -------------------------------------------------------------- */

function currentAgreementWhere(providerCompanyId: string, marketplaceId: string) {
  return and(
    eq(providerAgreement.providerCompanyId, providerCompanyId),
    eq(providerAgreement.marketplaceId, marketplaceId),
    isNull(providerAgreement.endsAt),
    isNull(providerAgreement.deletedAt),
  );
}

export type AssignPlanResult = { agreementId: string; changed: boolean };

/**
 * Puts a provider on a plan in one marketplace, snapshotting the terms.
 *
 * Idempotent: re-assigning the plan a provider already holds, with terms that
 * have not moved, changes nothing rather than churning the history.
 */
export async function assignPlan(
  db: Database,
  args: { providerCompanyId: string; marketplaceId: string; planId: string } & CommandContext,
): Promise<AssignPlanResult> {
  const now = args.now ?? new Date();

  return db.transaction(async (tx) => {
    const [relationship] = await tx
      .select({ id: providerMarketplace.id })
      .from(providerMarketplace)
      .where(
        and(
          eq(providerMarketplace.providerCompanyId, args.providerCompanyId),
          eq(providerMarketplace.marketplaceId, args.marketplaceId),
          isNull(providerMarketplace.deletedAt),
        ),
      )
      .limit(1);

    if (!relationship) {
      throw new DomainError(
        'PROVIDER_NOT_IN_MARKETPLACE',
        'This company does not participate in this marketplace.',
        404,
      );
    }

    const plan = await loadPlan(tx, args.planId, args.marketplaceId);
    if (!plan.active) {
      throw new DomainError('PLAN_INACTIVE', 'This plan is retired and cannot be assigned.', 409);
    }
    // Re-parsed rather than trusted: a plan row predating a schema change must
    // not silently become an agreement snapshot in an old shape.
    const terms = parsePlanTerms(plan.termsJson);

    const [current] = await tx
      .select()
      .from(providerAgreement)
      .where(currentAgreementWhere(args.providerCompanyId, args.marketplaceId))
      .orderBy(desc(providerAgreement.startsAt))
      .limit(1);

    const unchanged =
      current &&
      current.planId === plan.id &&
      termsFingerprint(parsePlanTerms(current.termsSnapshotJson)) === termsFingerprint(terms);
    if (current && unchanged) return { agreementId: current.id, changed: false };

    // Closed, never deleted: the superseded agreement is what a past commission
    // event points at.
    if (current) {
      await tx.update(providerAgreement).set({ endsAt: now }).where(eq(providerAgreement.id, current.id));
    }

    const [agreement] = await tx
      .insert(providerAgreement)
      .values({
        providerCompanyId: args.providerCompanyId,
        marketplaceId: args.marketplaceId,
        planId: plan.id,
        startsAt: now,
        termsSnapshotJson: terms,
      })
      .returning({ id: providerAgreement.id });

    const commissions = commissionTermsFrom(terms);
    if (commissions.length > 0) {
      await tx.insert(commissionAgreement).values(
        commissions.map((commission) => ({
          providerAgreementId: agreement!.id,
          trigger: commission.trigger,
          rateBps: commission.rateBps,
          fixedFeeMinor: commission.fixedFeeMinor,
          // Snapshotted again at this level, so a commission event can cite the
          // exact terms without joining back through the plan.
          termsSnapshotJson: { ...commission, currency: terms.currency, version: terms.version },
        })),
      );
    }

    // The relationship's pointer follows the current agreement; the agreement
    // rows remain the record of what was true when.
    await tx
      .update(providerMarketplace)
      .set({ commercialPlanId: plan.id })
      .where(eq(providerMarketplace.id, relationship.id));

    await recordAudit(tx, {
      actor: args.actor,
      action: 'provider_agreement.created',
      entityType: 'provider_agreement',
      entityId: agreement!.id,
      marketplaceId: args.marketplaceId,
      metadata: {
        correlationId: args.correlationId,
        providerCompanyId: args.providerCompanyId,
        planId: plan.id,
        supersedes: current?.id ?? null,
        terms,
      },
    });

    return { agreementId: agreement!.id, changed: true };
  });
}

/** Ends the current agreement without opening a successor: the provider is off-plan. */
export async function endAgreement(
  db: Database,
  args: { providerCompanyId: string; marketplaceId: string; reason: string } & CommandContext,
): Promise<{ changed: boolean }> {
  const now = args.now ?? new Date();

  return db.transaction(async (tx) => {
    const [current] = await tx
      .select({ id: providerAgreement.id })
      .from(providerAgreement)
      .where(currentAgreementWhere(args.providerCompanyId, args.marketplaceId))
      .orderBy(desc(providerAgreement.startsAt))
      .limit(1);

    if (!current) return { changed: false };

    await tx.update(providerAgreement).set({ endsAt: now }).where(eq(providerAgreement.id, current.id));
    await tx
      .update(providerMarketplace)
      .set({ commercialPlanId: null })
      .where(
        and(
          eq(providerMarketplace.providerCompanyId, args.providerCompanyId),
          eq(providerMarketplace.marketplaceId, args.marketplaceId),
        ),
      );

    await recordAudit(tx, {
      actor: args.actor,
      action: 'provider_agreement.ended',
      entityType: 'provider_agreement',
      entityId: current.id,
      marketplaceId: args.marketplaceId,
      metadata: { correlationId: args.correlationId, reason: args.reason },
    });

    return { changed: true };
  });
}

/* Read models ------------------------------------------------------------- */

export type PlanRow = { id: string; name: string; active: boolean; terms: PlanTerms; createdAt: Date };

export async function listPlans(db: Database, marketplaceId: string): Promise<PlanRow[]> {
  const rows = await db
    .select()
    .from(commercialPlan)
    .where(eq(commercialPlan.marketplaceId, marketplaceId))
    .orderBy(desc(commercialPlan.active), asc(commercialPlan.name));

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    active: row.active,
    terms: parsePlanTerms(row.termsJson),
    createdAt: row.createdAt,
  }));
}

export type ProviderAgreementRow = {
  providerCompanyId: string;
  displayName: string;
  relationshipStatus: string;
  agreementId: string | null;
  planId: string | null;
  planName: string | null;
  startsAt: Date | null;
  /** The snapshot, not the plan's current terms. */
  terms: PlanTerms | null;
  commissions: CommissionTerms[];
};

/** Every provider in this marketplace with the agreement in force today. */
export async function listProviderAgreements(db: Database, marketplaceId: string): Promise<ProviderAgreementRow[]> {
  const relationships = await db
    .select({
      providerCompanyId: providerMarketplace.providerCompanyId,
      relationshipStatus: providerMarketplace.status,
      displayName: providerCompany.displayName,
    })
    .from(providerMarketplace)
    .innerJoin(providerCompany, eq(providerCompany.id, providerMarketplace.providerCompanyId))
    .where(
      and(
        eq(providerMarketplace.marketplaceId, marketplaceId),
        isNull(providerMarketplace.deletedAt),
        isNull(providerCompany.deletedAt),
      ),
    )
    .orderBy(asc(providerCompany.displayName));

  return Promise.all(
    relationships.map(async (relationship): Promise<ProviderAgreementRow> => {
      const [agreement] = await db
        .select({ agreement: providerAgreement, planName: commercialPlan.name })
        .from(providerAgreement)
        .leftJoin(commercialPlan, eq(commercialPlan.id, providerAgreement.planId))
        .where(currentAgreementWhere(relationship.providerCompanyId, marketplaceId))
        .orderBy(desc(providerAgreement.startsAt))
        .limit(1);

      if (!agreement) {
        return { ...relationship, agreementId: null, planId: null, planName: null, startsAt: null, terms: null, commissions: [] };
      }

      const commissions = await db
        .select()
        .from(commissionAgreement)
        .where(eq(commissionAgreement.providerAgreementId, agreement.agreement.id))
        .orderBy(asc(commissionAgreement.trigger));

      return {
        ...relationship,
        agreementId: agreement.agreement.id,
        planId: agreement.agreement.planId,
        planName: agreement.planName,
        startsAt: agreement.agreement.startsAt,
        terms: parsePlanTerms(agreement.agreement.termsSnapshotJson),
        commissions: commissions.map((row) => ({
          trigger: row.trigger,
          rateBps: row.rateBps,
          fixedFeeMinor: row.fixedFeeMinor,
        })),
      };
    }),
  );
}

/** The agreement history for one provider, newest first. Nothing is ever removed from it. */
export async function listAgreementHistory(
  db: Database,
  providerCompanyId: string,
  marketplaceId: string,
): Promise<Array<{ id: string; planId: string | null; startsAt: Date; endsAt: Date | null; terms: PlanTerms }>> {
  const rows = await db
    .select()
    .from(providerAgreement)
    .where(
      and(
        eq(providerAgreement.providerCompanyId, providerCompanyId),
        eq(providerAgreement.marketplaceId, marketplaceId),
        isNull(providerAgreement.deletedAt),
      ),
    )
    .orderBy(desc(providerAgreement.startsAt));

  return rows.map((row) => ({
    id: row.id,
    planId: row.planId,
    startsAt: row.startsAt,
    endsAt: row.endsAt,
    terms: parsePlanTerms(row.termsSnapshotJson),
  }));
}
