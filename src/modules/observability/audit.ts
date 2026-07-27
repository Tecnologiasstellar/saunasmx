import type { Database, Tx } from '../database/client';
import { analyticsEvent, auditLog } from '../database/schema';
import { redact } from './logger';

export type Actor =
  | { type: 'consumer'; id?: string | null }
  | { type: 'provider_user'; id: string }
  | { type: 'operator'; id: string }
  | { type: 'system'; id?: null };

/**
 * Append-only record of who did what to which entity.
 * Metadata is redacted on the way in — audit records are read by humans and
 * exported to support, so they must never carry raw contact details.
 */
export async function recordAudit(
  tx: Tx | Database,
  input: {
    actor: Actor;
    action: string;
    entityType: string;
    entityId?: string | null;
    marketplaceId?: string | null;
    metadata?: Record<string, unknown>;
  },
): Promise<void> {
  await tx.insert(auditLog).values({
    actorType: input.actor.type,
    actorId: input.actor.id ?? null,
    action: input.action,
    entityType: input.entityType,
    entityId: input.entityId ?? null,
    marketplaceId: input.marketplaceId ?? null,
    metadataJson: input.metadata ? (redact(input.metadata) as Record<string, unknown>) : null,
  });
}

/** Product analytics. Names come from docs/11-observability.md. */
export type AnalyticsEventName =
  | 'marketplace_viewed'
  | 'content_viewed'
  | 'questionnaire_started'
  | 'questionnaire_step_completed'
  | 'project_submitted'
  | 'project_qualified'
  | 'provider_assignment_created'
  | 'provider_assignment_viewed'
  | 'provider_assignment_accepted'
  | 'provider_assignment_rejected'
  | 'provider_contacted'
  | 'quote_submitted'
  | 'project_won'
  | 'project_lost'
  | 'review_submitted';

export async function track(
  tx: Tx | Database,
  input: {
    name: AnalyticsEventName;
    marketplaceId?: string | null;
    entityType?: string;
    entityId?: string;
    properties?: Record<string, unknown>;
  },
): Promise<void> {
  await tx.insert(analyticsEvent).values({
    name: input.name,
    marketplaceId: input.marketplaceId ?? null,
    entityType: input.entityType ?? null,
    entityId: input.entityId ?? null,
    propertiesJson: input.properties ? (redact(input.properties) as Record<string, unknown>) : null,
  });
}
