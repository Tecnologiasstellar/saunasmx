import { eq } from 'drizzle-orm';
import type { Database } from '../database/client';
import { lead, leadStatusHistory, project, projectStatusHistory } from '../database/schema';
import { DomainError, ERROR_CODES } from '../errors';
import { recordAudit, track, type Actor } from '../observability/audit';
import { enqueueEvent } from '../observability/outbox';

/**
 * Operator lead commands.
 *
 * Every transition names an actor, writes history and is idempotent: repeating
 * a command that has already taken effect is a no-op, not an error or a
 * duplicate event.
 */

export type LeadCommandResult = { changed: boolean; lifecycleStatus: string };

export async function qualifyLead(
  db: Database,
  args: { leadId: string; marketplaceId: string; actor: Actor; correlationId: string; now?: Date },
): Promise<LeadCommandResult> {
  const now = args.now ?? new Date();

  return db.transaction(async (tx) => {
    const [leadRow] = await tx.select().from(lead).where(eq(lead.id, args.leadId)).limit(1);
    if (!leadRow) throw new DomainError(ERROR_CODES.LEAD_NOT_FOUND, 'Lead not found', 404);

    if (leadRow.lifecycleStatus === 'ready_for_matching') {
      return { changed: false, lifecycleStatus: leadRow.lifecycleStatus };
    }
    if (!['created', 'review_required'].includes(leadRow.lifecycleStatus)) {
      throw new DomainError(ERROR_CODES.INVALID_TRANSITION, 'This lead can no longer be qualified.', 409, {
        lifecycleStatus: leadRow.lifecycleStatus,
      });
    }

    await tx
      .update(lead)
      .set({ lifecycleStatus: 'ready_for_matching', qualificationStatus: 'qualified', qualifiedAt: now })
      .where(eq(lead.id, args.leadId));

    await tx.insert(leadStatusHistory).values({
      leadId: args.leadId,
      fromStatus: leadRow.lifecycleStatus,
      toStatus: 'ready_for_matching',
      reason: 'operator_qualified',
      actorType: args.actor.type,
      actorId: args.actor.id ?? null,
    });

    const [projectRow] = await tx.select().from(project).where(eq(project.id, leadRow.projectId)).limit(1);
    if (projectRow && projectRow.status === 'submitted') {
      await tx.update(project).set({ status: 'qualified' }).where(eq(project.id, leadRow.projectId));
      await tx.insert(projectStatusHistory).values({
        projectId: leadRow.projectId,
        fromStatus: projectRow.status,
        toStatus: 'qualified',
        actorType: args.actor.type,
        actorId: args.actor.id ?? null,
      });
    }

    await enqueueEvent(tx, {
      eventType: 'lead.ready_for_matching',
      entityType: 'lead',
      entityId: args.leadId,
      marketplaceId: args.marketplaceId,
      correlationId: args.correlationId,
      payload: { leadId: args.leadId, projectId: leadRow.projectId },
    });

    await track(tx, {
      name: 'project_qualified',
      marketplaceId: args.marketplaceId,
      entityType: 'project',
      entityId: leadRow.projectId,
    });

    await recordAudit(tx, {
      actor: args.actor,
      action: 'lead.qualified',
      entityType: 'lead',
      entityId: args.leadId,
      marketplaceId: args.marketplaceId,
      metadata: { correlationId: args.correlationId },
    });

    return { changed: true, lifecycleStatus: 'ready_for_matching' };
  });
}

export async function discardLead(
  db: Database,
  args: {
    leadId: string;
    marketplaceId: string;
    actor: Actor;
    correlationId: string;
    reasonCode: string;
    asSpam?: boolean;
  },
): Promise<LeadCommandResult> {
  return db.transaction(async (tx) => {
    const [leadRow] = await tx.select().from(lead).where(eq(lead.id, args.leadId)).limit(1);
    if (!leadRow) throw new DomainError(ERROR_CODES.LEAD_NOT_FOUND, 'Lead not found', 404);

    if (leadRow.lifecycleStatus === 'rejected') {
      return { changed: false, lifecycleStatus: leadRow.lifecycleStatus };
    }

    await tx
      .update(lead)
      .set({ lifecycleStatus: 'rejected', qualificationStatus: args.asSpam ? 'spam' : 'incomplete' })
      .where(eq(lead.id, args.leadId));

    await tx.insert(leadStatusHistory).values({
      leadId: args.leadId,
      fromStatus: leadRow.lifecycleStatus,
      toStatus: 'rejected',
      reason: args.reasonCode,
      actorType: args.actor.type,
      actorId: args.actor.id ?? null,
    });

    const [projectRow] = await tx.select().from(project).where(eq(project.id, leadRow.projectId)).limit(1);
    const target = args.asSpam ? 'spam' : 'withdrawn';
    if (projectRow && projectRow.status !== target) {
      await tx.update(project).set({ status: target }).where(eq(project.id, leadRow.projectId));
      await tx.insert(projectStatusHistory).values({
        projectId: leadRow.projectId,
        fromStatus: projectRow.status,
        toStatus: target,
        reason: args.reasonCode,
        actorType: args.actor.type,
        actorId: args.actor.id ?? null,
      });
    }

    await recordAudit(tx, {
      actor: args.actor,
      action: args.asSpam ? 'lead.marked_spam' : 'lead.discarded',
      entityType: 'lead',
      entityId: args.leadId,
      marketplaceId: args.marketplaceId,
      metadata: { correlationId: args.correlationId, reasonCode: args.reasonCode },
    });

    return { changed: true, lifecycleStatus: 'rejected' };
  });
}
