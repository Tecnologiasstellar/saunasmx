import { and, eq, lte, sql } from 'drizzle-orm';
import type { Database, Tx } from '../database/client';
import { outboxEvent } from '../database/schema';

/**
 * Transactional outbox (ADR-004).
 *
 * Events are written inside the same transaction as the business records, then
 * delivered asynchronously. A failed notification can therefore never roll back
 * a project, and a retried delivery can never duplicate one.
 */

export type OutboxEventType =
  | 'project.created'
  | 'project.submitted'
  | 'project.qualified'
  | 'lead.ready_for_matching'
  | 'lead.assigned'
  | 'lead.accepted'
  | 'lead.rejected'
  | 'consumer.contacted'
  | 'quote.created'
  | 'appointment.created'
  | 'project.won'
  | 'project.lost'
  | 'review.requested';

export type EnqueueInput = {
  eventType: OutboxEventType;
  entityType: string;
  entityId: string;
  marketplaceId?: string | null;
  correlationId?: string | null;
  /** Reference IDs only. contracts/events.md forbids contact details in payloads. */
  payload: Record<string, unknown>;
  /** Defaults to `<eventType>-<entityId>-v1`, which makes a retried command harmless. */
  idempotencyKey?: string;
};

export function defaultIdempotencyKey(eventType: string, entityId: string, version = 1): string {
  return `${eventType.replace(/\./g, '-')}-${entityId}-v${version}`;
}

/** Enqueues an event. A duplicate idempotency key is a no-op, not an error. */
export async function enqueueEvent(tx: Tx | Database, input: EnqueueInput): Promise<void> {
  await tx
    .insert(outboxEvent)
    .values({
      eventType: input.eventType,
      entityType: input.entityType,
      entityId: input.entityId,
      marketplaceId: input.marketplaceId ?? null,
      correlationId: input.correlationId ?? null,
      idempotencyKey: input.idempotencyKey ?? defaultIdempotencyKey(input.eventType, input.entityId),
      payloadJson: input.payload,
      status: 'pending',
    })
    .onConflictDoNothing({ target: outboxEvent.idempotencyKey });
}

export const MAX_ATTEMPTS = 6;

/** Exponential backoff with a ceiling, so a broken adapter does not hot-loop. */
export function backoffSeconds(attempts: number): number {
  return Math.min(2 ** attempts * 15, 3600);
}

/**
 * Claims one due event for processing. `FOR UPDATE SKIP LOCKED` lets several
 * workers run without handing the same event to two of them.
 */
export async function claimNextEvent(db: Database, now = new Date()) {
  return db.transaction(async (tx) => {
    const claimed = await tx.execute(sql`
      select id from ${outboxEvent}
      where status = 'pending' and next_attempt_at <= ${now.toISOString()}
      order by next_attempt_at asc
      limit 1
      for update skip locked
    `);
    const rows = (claimed as unknown as { rows: Array<{ id: string }> }).rows;
    const id = rows[0]?.id;
    if (!id) return null;

    const [row] = await tx
      .update(outboxEvent)
      .set({ status: 'processing' })
      .where(eq(outboxEvent.id, id))
      .returning();
    return row ?? null;
  });
}

export async function markEventCompleted(db: Database, id: string): Promise<void> {
  await db
    .update(outboxEvent)
    .set({ status: 'completed', processedAt: new Date(), lastError: null })
    .where(eq(outboxEvent.id, id));
}

/** Records a failure, scheduling a retry until the attempt ceiling sends it to the dead letter queue. */
export async function markEventFailed(db: Database, id: string, error: string, now = new Date()): Promise<void> {
  const [current] = await db.select({ attempts: outboxEvent.attempts }).from(outboxEvent).where(eq(outboxEvent.id, id));
  const attempts = (current?.attempts ?? 0) + 1;
  const exhausted = attempts >= MAX_ATTEMPTS;
  await db
    .update(outboxEvent)
    .set({
      status: exhausted ? 'dead_letter' : 'pending',
      attempts,
      // Truncated: adapter errors can echo the payload back at us.
      lastError: error.slice(0, 500),
      nextAttemptAt: new Date(now.getTime() + backoffSeconds(attempts) * 1000),
    })
    .where(eq(outboxEvent.id, id));
}

export async function countPending(db: Database, now = new Date()): Promise<number> {
  const rows = await db
    .select({ id: outboxEvent.id })
    .from(outboxEvent)
    .where(and(eq(outboxEvent.status, 'pending'), lte(outboxEvent.nextAttemptAt, now)));
  return rows.length;
}
