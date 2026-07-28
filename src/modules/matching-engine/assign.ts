import { and, eq, inArray, isNull } from 'drizzle-orm';
import type { Database } from '../database/client';
import {
  consentRecord,
  lead,
  leadStatusHistory,
  matchExplanation,
  project,
  projectStatusHistory,
  providerAssignment,
} from '../database/schema';
import { DomainError, ERROR_CODES } from '../errors';
import { CONSENT_PURPOSE_PROVIDER_SHARING } from '../forms-engine/intake-schema';
import type { MarketplaceConfig } from '../marketplace-config/types';
import { recordAudit, track, type Actor } from '../observability/audit';
import { enqueueEvent } from '../observability/outbox';
import { loadCandidates, loadProjectFacts } from './candidates';
import { evaluateProviders, ruleVersion, selectForDistribution, type Evaluation } from './evaluate';

/** How long a provider has to respond before the assignment lapses. */
export const ASSIGNMENT_TTL_HOURS = 72;

export type RankedProviders = {
  evaluations: Evaluation[];
  /** The engine's own recommendation, already capped by distribution.max_providers. */
  recommended: Evaluation[];
  ruleVersion: string;
};

/** Ranks providers for a lead without changing anything. Used by the operator review queue. */
export async function rankProvidersForLead(
  db: Database,
  args: { leadId: string; config: MarketplaceConfig; marketplaceId: string },
): Promise<RankedProviders> {
  const [leadRow] = await db.select().from(lead).where(eq(lead.id, args.leadId)).limit(1);
  if (!leadRow) throw new DomainError(ERROR_CODES.LEAD_NOT_FOUND, 'Lead not found', 404);

  const facts = await loadProjectFacts(db, leadRow.projectId);
  const candidates = await loadCandidates(db, args.marketplaceId);
  const evaluations = evaluateProviders(candidates, facts, args.config.matching);

  return {
    evaluations,
    recommended: selectForDistribution(evaluations, args.config.matching),
    ruleVersion: ruleVersion(args.config.matching, args.config.configVersion),
  };
}

export type AssignArgs = {
  leadId: string;
  config: MarketplaceConfig;
  marketplaceId: string;
  /** Chosen by the operator. Must be a subset of the eligible set. */
  providerCompanyIds: string[];
  actor: Actor;
  correlationId: string;
  now?: Date;
};

export type AssignResult = {
  assignments: Array<{ assignmentId: string; providerCompanyId: string; rank: number; score: number }>;
  alreadyAssigned: string[];
};

/**
 * Creates provider assignments for a lead (docs/06-workflows.md §3).
 *
 * Every guarantee that matters happens inside one transaction:
 *  - consent to share with providers must exist and be granted;
 *  - eligibility is recomputed server-side, never taken from the caller;
 *  - the distribution maximum counts assignments that already exist;
 *  - an explanation is stored for every assignment;
 *  - notifications go through the outbox, so a mail failure cannot undo routing.
 */
export async function assignProviders(db: Database, args: AssignArgs): Promise<AssignResult> {
  const now = args.now ?? new Date();

  return db.transaction(async (tx) => {
    const [leadRow] = await tx.select().from(lead).where(eq(lead.id, args.leadId)).limit(1);
    if (!leadRow) throw new DomainError(ERROR_CODES.LEAD_NOT_FOUND, 'Lead not found', 404);

    if (!['ready_for_matching', 'review_required', 'assigned'].includes(leadRow.lifecycleStatus)) {
      throw new DomainError(
        ERROR_CODES.LEAD_NOT_ROUTABLE,
        'This lead is not in a state that can be routed to providers.',
        409,
        { lifecycleStatus: leadRow.lifecycleStatus },
      );
    }

    // Grade C is never sold to a provider — it goes to nutrition/manual
    // review instead. Structural, not just a UI convention: even though
    // review_policy is manual today and nothing auto-assigns, this makes the
    // rule hold regardless of how this function is called.
    if (leadRow.leadGrade === 'C') {
      throw new DomainError(
        ERROR_CODES.LEAD_GRADE_NOT_ASSIGNABLE,
        'This lead is graded C and is not assigned to providers automatically.',
        409,
        { leadGrade: leadRow.leadGrade },
      );
    }

    // Consent is a precondition for sharing, not a formality.
    const consents = await tx
      .select()
      .from(consentRecord)
      .where(
        and(
          eq(consentRecord.projectId, leadRow.projectId),
          eq(consentRecord.purpose, CONSENT_PURPOSE_PROVIDER_SHARING),
          eq(consentRecord.granted, true),
        ),
      )
      .limit(1);
    if (consents.length === 0) {
      throw new DomainError(ERROR_CODES.CONSENT_MISSING, 'This project has no consent to share data with providers.', 409);
    }

    const facts = await loadProjectFacts(tx, leadRow.projectId);
    const candidates = await loadCandidates(tx, args.marketplaceId);
    const evaluations = evaluateProviders(candidates, facts, args.config.matching);
    const byId = new Map(evaluations.map((evaluation) => [evaluation.providerCompanyId, evaluation]));

    const existing = await tx
      .select()
      .from(providerAssignment)
      .where(and(eq(providerAssignment.leadId, args.leadId), isNull(providerAssignment.deletedAt)));
    const existingIds = new Set(existing.map((row) => row.providerCompanyId));
    const activeExisting = existing.filter((row) => ['assigned', 'accepted'].includes(row.status));

    const requested = [...new Set(args.providerCompanyIds)];
    const alreadyAssigned = requested.filter((id) => existingIds.has(id));
    const toAssign = requested.filter((id) => !existingIds.has(id));

    // Eligibility is authoritative: an operator may choose among eligible
    // providers, but may not route to a disqualified one (ADR-005).
    for (const providerCompanyId of toAssign) {
      const evaluation = byId.get(providerCompanyId);
      if (!evaluation) {
        throw new DomainError(ERROR_CODES.PROVIDER_NOT_ELIGIBLE, 'That provider does not participate in this marketplace.', 409, {
          providerCompanyId,
        });
      }
      if (!evaluation.eligible) {
        throw new DomainError(ERROR_CODES.PROVIDER_NOT_ELIGIBLE, 'That provider is not eligible for this project.', 409, {
          providerCompanyId,
          failedRules: evaluation.checks.filter((check) => !check.passed).map((check) => check.rule),
        });
      }
    }

    const limit = args.config.matching.distribution.maxProviders;
    if (activeExisting.length + toAssign.length > limit) {
      throw new DomainError(
        ERROR_CODES.DISTRIBUTION_LIMIT_EXCEEDED,
        `This marketplace distributes a project to at most ${limit} providers.`,
        409,
        { limit, active: activeExisting.length, requested: toAssign.length },
      );
    }

    const version = ruleVersion(args.config.matching, args.config.configVersion);
    const expiresAt = new Date(now.getTime() + ASSIGNMENT_TTL_HOURS * 3600_000);
    const assignments: AssignResult['assignments'] = [];

    // Rank is the engine's ordering among the providers being assigned now.
    const ordered = toAssign
      .map((id) => byId.get(id)!)
      .sort((a, b) => b.score - a.score || a.providerCompanyId.localeCompare(b.providerCompanyId));

    for (const [offset, evaluation] of ordered.entries()) {
      const [row] = await tx
        .insert(providerAssignment)
        .values({
          leadId: args.leadId,
          providerCompanyId: evaluation.providerCompanyId,
          score: evaluation.score,
          rank: activeExisting.length + offset + 1,
          status: 'assigned',
          assignedAt: now,
          expiresAt,
        })
        .returning({ id: providerAssignment.id });
      const assignmentId = row!.id;

      await tx.insert(matchExplanation).values({
        assignmentId,
        eligibilityJson: evaluation.checks,
        scoreBreakdownJson: evaluation.breakdown,
        reasonsJson: evaluation.reasons,
        ruleVersion: version,
      });

      await enqueueEvent(tx, {
        eventType: 'lead.assigned',
        entityType: 'provider_assignment',
        entityId: assignmentId,
        marketplaceId: args.marketplaceId,
        correlationId: args.correlationId,
        payload: {
          assignmentId,
          leadId: args.leadId,
          projectId: leadRow.projectId,
          providerCompanyId: evaluation.providerCompanyId,
          rank: activeExisting.length + offset + 1,
          expiresAt: expiresAt.toISOString(),
        },
      });

      await track(tx, {
        name: 'provider_assignment_created',
        marketplaceId: args.marketplaceId,
        entityType: 'provider_assignment',
        entityId: assignmentId,
        properties: { score: evaluation.score, rank: activeExisting.length + offset + 1 },
      });

      assignments.push({
        assignmentId,
        providerCompanyId: evaluation.providerCompanyId,
        rank: activeExisting.length + offset + 1,
        score: evaluation.score,
      });
    }

    if (assignments.length > 0 && leadRow.lifecycleStatus !== 'assigned') {
      await tx.update(lead).set({ lifecycleStatus: 'assigned' }).where(eq(lead.id, args.leadId));
      await tx.insert(leadStatusHistory).values({
        leadId: args.leadId,
        fromStatus: leadRow.lifecycleStatus,
        toStatus: 'assigned',
        reason: `assigned_to_${assignments.length}_providers`,
        actorType: args.actor.type,
        actorId: args.actor.id ?? null,
      });

      const [projectRow] = await tx.select().from(project).where(eq(project.id, leadRow.projectId)).limit(1);
      if (projectRow && projectRow.status !== 'matched') {
        await tx.update(project).set({ status: 'matched' }).where(eq(project.id, leadRow.projectId));
        await tx.insert(projectStatusHistory).values({
          projectId: leadRow.projectId,
          fromStatus: projectRow.status,
          toStatus: 'matched',
          actorType: args.actor.type,
          actorId: args.actor.id ?? null,
        });
      }
    }

    await recordAudit(tx, {
      actor: args.actor,
      action: 'lead.assigned',
      entityType: 'lead',
      entityId: args.leadId,
      marketplaceId: args.marketplaceId,
      metadata: {
        correlationId: args.correlationId,
        assigned: assignments.map((assignment) => assignment.providerCompanyId),
        alreadyAssigned,
        ruleVersion: version,
      },
    });

    return { assignments, alreadyAssigned };
  });
}

/** Assignments whose response window has lapsed. Run from the worker. */
export async function expireStaleAssignments(db: Database, now = new Date()): Promise<number> {
  const stale = await db
    .select({ id: providerAssignment.id })
    .from(providerAssignment)
    .where(and(eq(providerAssignment.status, 'assigned'), isNull(providerAssignment.deletedAt)));

  const expired: string[] = [];
  for (const row of stale) {
    const [full] = await db.select().from(providerAssignment).where(eq(providerAssignment.id, row.id));
    if (full?.expiresAt && full.expiresAt <= now) expired.push(row.id);
  }
  if (expired.length === 0) return 0;

  await db.update(providerAssignment).set({ status: 'expired' }).where(inArray(providerAssignment.id, expired));
  return expired.length;
}
