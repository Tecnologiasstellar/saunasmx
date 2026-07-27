import { and, eq, isNull } from 'drizzle-orm';
import type { Database, Tx } from '../database/client';
import {
  communication,
  lead,
  leadRejection,
  leadStatusHistory,
  project,
  projectOutcome,
  projectStatusHistory,
  providerAssignment,
  quote,
} from '../database/schema';
import { DomainError, ERROR_CODES } from '../errors';
import { recordAudit, track } from '../observability/audit';
import { enqueueEvent } from '../observability/outbox';
import type { Session } from '../auth/session';

/**
 * Provider pipeline commands (docs/06-workflows.md §4–5).
 *
 * Authorization is checked against the session's company memberships on every
 * command — an assignment id in a URL grants nothing on its own. Every command
 * is idempotent and writes lead status history with the acting user.
 */

type CommandContext = {
  session: Session;
  correlationId: string;
  now?: Date;
};

async function loadAuthorizedAssignment(tx: Tx, assignmentId: string, session: Session) {
  const [assignment] = await tx
    .select()
    .from(providerAssignment)
    .where(and(eq(providerAssignment.id, assignmentId), isNull(providerAssignment.deletedAt)))
    .limit(1);

  // Same error for "does not exist" and "not yours": a provider must not be
  // able to probe for the existence of another company's assignments.
  if (!assignment || !session.providerCompanyIds.includes(assignment.providerCompanyId)) {
    throw new DomainError(ERROR_CODES.ASSIGNMENT_NOT_FOUND, 'Assignment not found.', 404);
  }

  const [leadRow] = await tx.select().from(lead).where(eq(lead.id, assignment.leadId)).limit(1);
  if (!leadRow) throw new DomainError(ERROR_CODES.LEAD_NOT_FOUND, 'Lead not found.', 404);

  const [projectRow] = await tx.select().from(project).where(eq(project.id, leadRow.projectId)).limit(1);
  if (!projectRow) throw new DomainError(ERROR_CODES.LEAD_NOT_FOUND, 'Project not found.', 404);

  return { assignment, leadRow, projectRow };
}

async function moveLead(
  tx: Tx,
  args: { leadId: string; from: string; to: 'contacted' | 'quoted' | 'won' | 'lost'; reason: string; session: Session },
): Promise<void> {
  await tx.update(lead).set({ lifecycleStatus: args.to }).where(eq(lead.id, args.leadId));
  await tx.insert(leadStatusHistory).values({
    leadId: args.leadId,
    // The enum is validated by the database; the cast keeps the helper generic.
    fromStatus: args.from as 'assigned',
    toStatus: args.to,
    reason: args.reason,
    actorType: 'provider_user',
    actorId: args.session.userId,
  });
}

export type AssignmentActionResult = { changed: boolean; status: string };

export async function acceptAssignment(
  db: Database,
  args: { assignmentId: string } & CommandContext,
): Promise<AssignmentActionResult> {
  const now = args.now ?? new Date();

  const outcome = await db.transaction(async (tx) => {
    const { assignment, leadRow, projectRow } = await loadAuthorizedAssignment(tx, args.assignmentId, args.session);

    // Idempotent: a double-submitted accept is not an error.
    if (assignment.status === 'accepted') return { changed: false, status: assignment.status };
    if (assignment.status === 'rejected' || assignment.status === 'withdrawn') {
      throw new DomainError(ERROR_CODES.ASSIGNMENT_ALREADY_RESOLVED, 'This assignment is no longer actionable.', 409);
    }
    if (assignment.status === 'expired' || (assignment.expiresAt && assignment.expiresAt <= now)) {
      // Reported after the transaction commits: throwing here would roll back
      // the very status change that records the expiry.
      return { changed: false, status: 'expired', lapsed: true as const, assignmentId: assignment.id };
    }

    await tx
      .update(providerAssignment)
      .set({ status: 'accepted', respondedAt: now })
      .where(eq(providerAssignment.id, assignment.id));

    await tx.insert(leadStatusHistory).values({
      leadId: assignment.leadId,
      fromStatus: leadRow.lifecycleStatus,
      toStatus: leadRow.lifecycleStatus,
      reason: 'assignment_accepted',
      actorType: 'provider_user',
      actorId: args.session.userId,
    });

    await enqueueEvent(tx, {
      eventType: 'lead.accepted',
      entityType: 'provider_assignment',
      entityId: assignment.id,
      marketplaceId: projectRow.marketplaceId,
      correlationId: args.correlationId,
      payload: { assignmentId: assignment.id, leadId: assignment.leadId, providerCompanyId: assignment.providerCompanyId },
    });

    await track(tx, {
      name: 'provider_assignment_accepted',
      marketplaceId: projectRow.marketplaceId,
      entityType: 'provider_assignment',
      entityId: assignment.id,
      // Response latency is the provider SLA metric in docs/11.
      properties: { responseMinutes: Math.round((now.getTime() - assignment.assignedAt.getTime()) / 60_000) },
    });

    await recordAudit(tx, {
      actor: { type: 'provider_user', id: args.session.userId },
      action: 'assignment.accepted',
      entityType: 'provider_assignment',
      entityId: assignment.id,
      marketplaceId: projectRow.marketplaceId,
      metadata: { correlationId: args.correlationId },
    });

    return { changed: true, status: 'accepted' };
  });

  if ('lapsed' in outcome && outcome.lapsed) {
    await db.update(providerAssignment).set({ status: 'expired' }).where(eq(providerAssignment.id, outcome.assignmentId));
    throw new DomainError(ERROR_CODES.ASSIGNMENT_EXPIRED, 'The response window for this project has closed.', 409);
  }

  return { changed: outcome.changed, status: outcome.status };
}

export async function rejectAssignment(
  db: Database,
  args: { assignmentId: string; reasonCode: string; notes?: string } & CommandContext,
): Promise<AssignmentActionResult> {
  const now = args.now ?? new Date();

  return db.transaction(async (tx) => {
    const { assignment, projectRow } = await loadAuthorizedAssignment(tx, args.assignmentId, args.session);

    if (assignment.status === 'rejected') return { changed: false, status: assignment.status };
    if (assignment.status === 'accepted') {
      throw new DomainError(ERROR_CODES.ASSIGNMENT_ALREADY_RESOLVED, 'This assignment was already accepted.', 409);
    }

    await tx
      .update(providerAssignment)
      .set({ status: 'rejected', respondedAt: now })
      .where(eq(providerAssignment.id, assignment.id));

    await tx.insert(leadRejection).values({
      assignmentId: assignment.id,
      reasonCode: args.reasonCode,
      notes: args.notes?.slice(0, 1000) ?? null,
    });

    await enqueueEvent(tx, {
      eventType: 'lead.rejected',
      entityType: 'provider_assignment',
      entityId: assignment.id,
      marketplaceId: projectRow.marketplaceId,
      correlationId: args.correlationId,
      payload: { assignmentId: assignment.id, leadId: assignment.leadId, reasonCode: args.reasonCode },
    });

    await track(tx, {
      name: 'provider_assignment_rejected',
      marketplaceId: projectRow.marketplaceId,
      entityType: 'provider_assignment',
      entityId: assignment.id,
      properties: { reasonCode: args.reasonCode },
    });

    await recordAudit(tx, {
      actor: { type: 'provider_user', id: args.session.userId },
      action: 'assignment.rejected',
      entityType: 'provider_assignment',
      entityId: assignment.id,
      marketplaceId: projectRow.marketplaceId,
      metadata: { correlationId: args.correlationId, reasonCode: args.reasonCode },
    });

    return { changed: true, status: 'rejected' };
  });
}

/** Records that the provider reached the consumer. Requires an accepted assignment. */
export async function recordContact(
  db: Database,
  args: { assignmentId: string; channel: 'email' | 'whatsapp' | 'phone' } & CommandContext,
): Promise<AssignmentActionResult> {
  return db.transaction(async (tx) => {
    const { assignment, leadRow, projectRow } = await loadAuthorizedAssignment(tx, args.assignmentId, args.session);

    if (assignment.status !== 'accepted') {
      throw new DomainError(ERROR_CODES.INVALID_TRANSITION, 'Accept the project before recording contact.', 409);
    }

    await tx.insert(communication).values({
      projectId: projectRow.id,
      leadId: assignment.leadId,
      providerCompanyId: assignment.providerCompanyId,
      channel: args.channel,
      direction: 'outbound',
      templateKey: 'provider_manual_contact',
      status: 'logged',
    });

    if (leadRow.lifecycleStatus === 'assigned') {
      await moveLead(tx, {
        leadId: assignment.leadId,
        from: leadRow.lifecycleStatus,
        to: 'contacted',
        reason: 'provider_contacted_consumer',
        session: args.session,
      });
    }

    await track(tx, {
      name: 'provider_contacted',
      marketplaceId: projectRow.marketplaceId,
      entityType: 'lead',
      entityId: assignment.leadId,
      properties: { channel: args.channel },
    });

    return { changed: true, status: 'contacted' };
  });
}

export async function submitQuote(
  db: Database,
  args: { assignmentId: string; amountMinor: number; currency: string; scopeNotes?: string } & CommandContext,
): Promise<{ quoteId: string }> {
  if (!Number.isInteger(args.amountMinor) || args.amountMinor <= 0) {
    // Money is integer minor units. A float here would be a rounding bug later.
    throw new DomainError('INVALID_AMOUNT', 'The quote amount must be a positive whole number of cents.', 422);
  }
  if (!/^[A-Z]{3}$/.test(args.currency)) {
    throw new DomainError('INVALID_CURRENCY', 'The currency must be a three-letter ISO code.', 422);
  }

  return db.transaction(async (tx) => {
    const { assignment, leadRow, projectRow } = await loadAuthorizedAssignment(tx, args.assignmentId, args.session);

    if (assignment.status !== 'accepted') {
      throw new DomainError(ERROR_CODES.INVALID_TRANSITION, 'Accept the project before sending a quote.', 409);
    }

    const [row] = await tx
      .insert(quote)
      .values({
        leadId: assignment.leadId,
        providerCompanyId: assignment.providerCompanyId,
        amountMinor: args.amountMinor,
        currency: args.currency,
        scopeNotes: args.scopeNotes?.slice(0, 2000) ?? null,
        status: 'submitted',
      })
      .returning({ id: quote.id });

    if (['assigned', 'contacted'].includes(leadRow.lifecycleStatus)) {
      await moveLead(tx, {
        leadId: assignment.leadId,
        from: leadRow.lifecycleStatus,
        to: 'quoted',
        reason: 'provider_submitted_quote',
        session: args.session,
      });
    }

    await enqueueEvent(tx, {
      eventType: 'quote.created',
      entityType: 'quote',
      entityId: row!.id,
      marketplaceId: projectRow.marketplaceId,
      correlationId: args.correlationId,
      payload: { quoteId: row!.id, leadId: assignment.leadId, amountMinor: args.amountMinor, currency: args.currency },
    });

    await track(tx, {
      name: 'quote_submitted',
      marketplaceId: projectRow.marketplaceId,
      entityType: 'quote',
      entityId: row!.id,
      properties: { amountMinor: args.amountMinor, currency: args.currency },
    });

    await recordAudit(tx, {
      actor: { type: 'provider_user', id: args.session.userId },
      action: 'quote.submitted',
      entityType: 'quote',
      entityId: row!.id,
      marketplaceId: projectRow.marketplaceId,
      metadata: { correlationId: args.correlationId, amountMinor: args.amountMinor, currency: args.currency },
    });

    return { quoteId: row!.id };
  });
}

export async function recordOutcome(
  db: Database,
  args: { assignmentId: string; outcome: 'won' | 'lost'; valueMinor?: number; currency?: string } & CommandContext,
): Promise<{ changed: boolean }> {
  const now = args.now ?? new Date();

  // Declaring a win creates a future commercial obligation, so it is an
  // owner-level action rather than something any team member can record.
  if (args.outcome === 'won' && !args.session.roles.includes('provider_owner') && !args.session.roles.includes('admin')) {
    throw new DomainError(ERROR_CODES.FORBIDDEN, 'Only a provider owner can record a won project.', 403);
  }
  if (args.outcome === 'won' && args.valueMinor !== undefined && (!Number.isInteger(args.valueMinor) || args.valueMinor <= 0)) {
    throw new DomainError('INVALID_AMOUNT', 'The project value must be a positive whole number of cents.', 422);
  }

  return db.transaction(async (tx) => {
    const { assignment, leadRow, projectRow } = await loadAuthorizedAssignment(tx, args.assignmentId, args.session);

    if (assignment.status !== 'accepted') {
      throw new DomainError(ERROR_CODES.INVALID_TRANSITION, 'Accept the project before recording an outcome.', 409);
    }

    const existing = await tx.select().from(projectOutcome).where(eq(projectOutcome.projectId, projectRow.id)).limit(1);
    if (existing.length > 0) return { changed: false };

    await tx.insert(projectOutcome).values({
      projectId: projectRow.id,
      providerCompanyId: assignment.providerCompanyId,
      outcome: args.outcome,
      valueMinor: args.valueMinor ?? null,
      currency: args.currency ?? null,
      // Provider-reported, not yet verified by an operator.
      verifiedAt: null,
    });

    await moveLead(tx, {
      leadId: assignment.leadId,
      from: leadRow.lifecycleStatus,
      to: args.outcome,
      reason: 'provider_reported_outcome',
      session: args.session,
    });

    await tx.update(project).set({ status: args.outcome }).where(eq(project.id, projectRow.id));
    await tx.insert(projectStatusHistory).values({
      projectId: projectRow.id,
      fromStatus: projectRow.status,
      toStatus: args.outcome,
      reason: 'provider_reported_outcome',
      actorType: 'provider_user',
      actorId: args.session.userId,
    });

    await enqueueEvent(tx, {
      eventType: args.outcome === 'won' ? 'project.won' : 'project.lost',
      entityType: 'project',
      entityId: projectRow.id,
      marketplaceId: projectRow.marketplaceId,
      correlationId: args.correlationId,
      payload: {
        projectId: projectRow.id,
        providerCompanyId: assignment.providerCompanyId,
        valueMinor: args.valueMinor ?? null,
        currency: args.currency ?? null,
        reportedAt: now.toISOString(),
      },
    });

    await track(tx, {
      name: args.outcome === 'won' ? 'project_won' : 'project_lost',
      marketplaceId: projectRow.marketplaceId,
      entityType: 'project',
      entityId: projectRow.id,
      properties: { valueMinor: args.valueMinor ?? null },
    });

    await recordAudit(tx, {
      actor: { type: 'provider_user', id: args.session.userId },
      action: `project.${args.outcome}`,
      entityType: 'project',
      entityId: projectRow.id,
      marketplaceId: projectRow.marketplaceId,
      metadata: { correlationId: args.correlationId, valueMinor: args.valueMinor ?? null },
    });

    return { changed: true };
  });
}
