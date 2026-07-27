import { eq } from 'drizzle-orm';
import type { Database } from '../database/client';
import {
  communication,
  lead,
  marketplace,
  project,
  providerAssignment,
  providerCompany,
} from '../database/schema';
import { getEmailProvider } from '../messaging/email';
import { log } from '../observability/logger';
import { claimNextEvent, markEventCompleted, markEventFailed } from '../observability/outbox';

/**
 * Outbox consumer (ADR-004, docs/06-workflows.md §8).
 *
 * Claims one due event at a time, performs the side effect, records the result
 * and either completes it or schedules a retry. Exhausted events land in
 * `dead_letter` where the operator dashboard can see them.
 *
 * Contact details are read from the database here, at delivery time — the event
 * payload only ever carries reference ids.
 */

export type ProcessResult = { processed: number; completed: number; failed: number };

async function notifyOperatorOfNewProject(db: Database, projectId: string): Promise<void> {
  const [projectRow] = await db.select().from(project).where(eq(project.id, projectId)).limit(1);
  if (!projectRow) return;
  const [marketplaceRow] = await db.select().from(marketplace).where(eq(marketplace.id, projectRow.marketplaceId)).limit(1);

  const to = process.env.OPS_NOTIFICATION_EMAIL?.trim() || 'operator@example.com';
  await getEmailProvider().send({
    to,
    subject: `Nuevo proyecto en ${marketplaceRow?.name ?? 'el marketplace'}`,
    text: [
      'Hay un proyecto nuevo esperando revisión.',
      '',
      `Marketplace: ${marketplaceRow?.name ?? 'desconocido'}`,
      `Proyecto: ${projectId}`,
      '',
      'Ábrelo en la bandeja de operaciones para revisarlo y asignar proveedores.',
    ].join('\n'),
  });
}

async function notifyProviderOfAssignment(db: Database, assignmentId: string): Promise<void> {
  const [assignment] = await db.select().from(providerAssignment).where(eq(providerAssignment.id, assignmentId)).limit(1);
  if (!assignment) return;

  const [company] = await db.select().from(providerCompany).where(eq(providerCompany.id, assignment.providerCompanyId)).limit(1);
  const [leadRow] = await db.select().from(lead).where(eq(lead.id, assignment.leadId)).limit(1);
  const [projectRow] = leadRow ? await db.select().from(project).where(eq(project.id, leadRow.projectId)).limit(1) : [];
  const [marketplaceRow] = projectRow
    ? await db.select().from(marketplace).where(eq(marketplace.id, projectRow.marketplaceId)).limit(1)
    : [];

  const to = company?.contactEmail;
  if (!to) throw new Error('provider has no contact email');

  const result = await getEmailProvider().send({
    to,
    subject: `Nuevo proyecto asignado en ${marketplaceRow?.name ?? 'el marketplace'}`,
    text: [
      `Hola ${company?.displayName ?? ''},`,
      '',
      'Tienes un proyecto nuevo asignado. Los datos de contacto del cliente están en tu portal.',
      '',
      'Entra en el portal de proveedores para aceptarlo o rechazarlo.',
      '',
      `Referencia: ${assignmentId}`,
    ].join('\n'),
  });

  // The delivery attempt is itself a record, so support can trace what was sent.
  await db.insert(communication).values({
    projectId: projectRow?.id ?? null,
    leadId: assignment.leadId,
    providerCompanyId: assignment.providerCompanyId,
    channel: 'email',
    direction: 'outbound',
    templateKey: 'provider_assignment_created',
    status: 'sent',
    providerMessageId: result.providerMessageId,
  });
}

async function handle(db: Database, event: { id: string; eventType: string; entityId: string }): Promise<void> {
  switch (event.eventType) {
    case 'project.created':
      await notifyOperatorOfNewProject(db, event.entityId);
      return;
    case 'lead.assigned':
      await notifyProviderOfAssignment(db, event.entityId);
      return;
    default:
      // Unknown event types complete without a side effect rather than
      // blocking the queue; they remain visible in the outbox table.
      log.warn('outbox.unhandled_event', { eventType: event.eventType });
  }
}

/** Drains up to `max` due events. Returns counts for the operator dashboard. */
export async function processOutbox(db: Database, max = 50, now = new Date()): Promise<ProcessResult> {
  const result: ProcessResult = { processed: 0, completed: 0, failed: 0 };

  for (let index = 0; index < max; index += 1) {
    const event = await claimNextEvent(db, now);
    if (!event) break;
    result.processed += 1;

    try {
      await handle(db, event);
      await markEventCompleted(db, event.id);
      result.completed += 1;
    } catch (error) {
      await markEventFailed(db, event.id, (error as Error).message, now);
      result.failed += 1;
      log.error('outbox.delivery_failed', { eventId: event.id, eventType: event.eventType, error: (error as Error).message });
    }
  }

  return result;
}
