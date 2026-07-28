import { and, eq, gte, sql } from 'drizzle-orm';
import type { Database, Tx } from '../database/client';
import {
  attributionTouch,
  consentRecord,
  consumer,
  lead,
  leadStatusHistory,
  project,
  projectLocation,
  projectRequirement,
  projectStatusHistory,
  providerMarketplace,
  providerTerritory,
  questionnaireResponse,
} from '../database/schema';
import type { MarketplaceConfig } from '../marketplace-config/types';
import { computeLeadScore } from '../lead-scoring/score';
import { parseBudgetBucket } from '../matching-engine/budget';
import { recordAudit, track } from '../observability/audit';
import { enqueueEvent } from '../observability/outbox';
import { CONSENT_PURPOSE_LEAD_CONTACT, CONSENT_PURPOSE_PROVIDER_SHARING, type IntakeInput } from '../forms-engine/intake-schema';

/**
 * Project intake (docs/06-workflows.md §1, docs/05-api-contracts.md).
 *
 * One transaction creates consumer, project, location, requirements, the raw
 * questionnaire response, consent records, attribution, the lead, both status
 * histories and the `project.created` outbox event.
 *
 * Providers are never notified from the request path — that is the outbox's job
 * (ADR-004), so a mail outage cannot lose a consumer's project.
 */

export type IntakeOutcome = {
  status: 'created' | 'duplicate_request' | 'spam';
  projectId: string;
  leadId: string | null;
  /** Machine-readable reasons; safe to log and to show an operator. */
  reasons: string[];
};

export type SubmitArgs = {
  config: MarketplaceConfig;
  marketplaceId: string;
  input: IntakeInput;
  correlationId: string;
  /** Coarse client identity for rate limiting. Never stored raw. */
  now?: Date;
};

const DUPLICATE_WINDOW_HOURS = 24;
const SPAM_SUBMISSION_LIMIT = 4;
const SPAM_WINDOW_HOURS = 1;
const URL_PATTERN = /https?:\/\//gi;

/** Deterministic spam and duplicate signals. AI is not involved (ADR-005). */
async function evaluateSubmission(
  tx: Tx,
  args: { marketplaceId: string; consumerId: string; input: IntakeInput; now: Date },
): Promise<{ spam: boolean; duplicate: boolean; reasons: string[] }> {
  const reasons: string[] = [];

  const spamWindow = new Date(args.now.getTime() - SPAM_WINDOW_HOURS * 3600_000);
  const recent = await tx
    .select({ id: project.id, createdAt: project.createdAt })
    .from(project)
    .where(and(eq(project.consumerId, args.consumerId), gte(project.createdAt, spamWindow)));

  const spamByVolume = recent.length >= SPAM_SUBMISSION_LIMIT;
  if (spamByVolume) reasons.push('submission_rate_exceeded');

  const freeText = Object.values(args.input.answers)
    .filter((value): value is string => typeof value === 'string')
    .join(' ');
  const linkCount = freeText.match(URL_PATTERN)?.length ?? 0;
  const spamByLinks = linkCount >= 2;
  if (spamByLinks) reasons.push('free_text_contains_links');

  const duplicateWindow = new Date(args.now.getTime() - DUPLICATE_WINDOW_HOURS * 3600_000);
  const sameMarketplace = await tx
    .select({ id: project.id })
    .from(project)
    .where(
      and(
        eq(project.consumerId, args.consumerId),
        eq(project.marketplaceId, args.marketplaceId),
        gte(project.createdAt, duplicateWindow),
      ),
    );
  const duplicate = sameMarketplace.length > 0;
  if (duplicate) reasons.push('possible_duplicate_within_24h');

  return { spam: spamByVolume || spamByLinks, duplicate, reasons };
}

/** Serviceability: is there at least one approved provider covering this postal code? */
async function hasServiceableProvider(tx: Tx, marketplaceId: string, postalCode: string): Promise<boolean> {
  const rows = await tx
    .select({ id: providerTerritory.id })
    .from(providerTerritory)
    .innerJoin(
      providerMarketplace,
      and(
        eq(providerMarketplace.providerCompanyId, providerTerritory.providerCompanyId),
        eq(providerMarketplace.marketplaceId, providerTerritory.marketplaceId),
      ),
    )
    .where(
      and(
        eq(providerTerritory.marketplaceId, marketplaceId),
        eq(providerMarketplace.status, 'approved'),
        sql`${postalCode} like ${providerTerritory.postalPrefix} || '%'`,
      ),
    )
    .limit(1);
  return rows.length > 0;
}

export async function submitProject(db: Database, args: SubmitArgs): Promise<IntakeOutcome> {
  const now = args.now ?? new Date();
  const { config, marketplaceId, input, correlationId } = args;

  return db.transaction(async (tx) => {
    // 1. Idempotency: a retried submit returns the original project untouched.
    const [existing] = await tx
      .select({ id: project.id })
      .from(project)
      .where(and(eq(project.marketplaceId, marketplaceId), eq(project.idempotencyKey, input.idempotencyKey)))
      .limit(1);

    if (existing) {
      const [existingLead] = await tx.select({ id: lead.id }).from(lead).where(eq(lead.projectId, existing.id)).limit(1);
      return {
        status: 'duplicate_request' as const,
        projectId: existing.id,
        leadId: existingLead?.id ?? null,
        reasons: ['idempotency_key_replayed'],
      };
    }

    // 2. Consumer identity is shared across marketplaces.
    const email = input.contact.email as string;
    const [found] = await tx.select({ id: consumer.id }).from(consumer).where(eq(consumer.email, email)).limit(1);
    const consumerId =
      found?.id ??
      (
        await tx
          .insert(consumer)
          .values({
            name: (input.contact.name as string | undefined) ?? '',
            email,
            phone: (input.contact.phone as string | undefined) ?? null,
            locale: config.localization.locale,
          })
          .returning({ id: consumer.id })
      )[0]!.id;

    const signals = await evaluateSubmission(tx, { marketplaceId, consumerId, input, now });

    // 3. Project.
    const projectStatusValue = signals.spam ? 'spam' : 'submitted';
    const [projectRow] = await tx
      .insert(project)
      .values({
        marketplaceId,
        consumerId,
        status: projectStatusValue,
        sourceChannel: input.attribution.source ?? null,
        sourceCampaign: input.attribution.campaign ?? null,
        idempotencyKey: input.idempotencyKey,
      })
      .returning({ id: project.id });
    const projectId = projectRow!.id;

    await tx.insert(projectStatusHistory).values({
      projectId,
      fromStatus: 'draft',
      toStatus: projectStatusValue,
      reason: signals.spam ? signals.reasons.join(',') : null,
      actorType: 'consumer',
    });

    await tx.insert(projectLocation).values({
      projectId,
      countryCode: config.localization.country,
      postalCode: input.location.postalCode,
      city: input.location.city ?? null,
      stateCode: input.location.state ?? null,
      // Structured, optional, and confined to this table — never read by
      // matching/eligibility and never forwarded to track()/enqueueEvent()/
      // recordAudit() below.
      streetAddress: input.location.streetAddress ?? null,
    });

    // 4. Requirements: the answers as given, plus the derived matching dimensions.
    const requirementRows = Object.entries(input.answers)
      .filter(([, value]) => value !== undefined && value !== '')
      .map(([requirementKey, value]) => ({
        projectId,
        requirementKey,
        valueJson: value as unknown,
        source: 'questionnaire',
      }));

    const serviceKey = input.answers[config.matching.answerMapping.service];
    const budgetBucket = input.answers[config.matching.answerMapping.budget];
    const budget = parseBudgetBucket(typeof budgetBucket === 'string' ? budgetBucket : null);

    requirementRows.push(
      { projectId, requirementKey: 'service_key', valueJson: serviceKey ?? null, source: 'derived' },
      { projectId, requirementKey: 'budget_range', valueJson: budget, source: 'derived' },
    );

    // A provider the consumer asked for, recorded as a requirement the operator
    // can see on the lead. Deliberately not an assignment: eligibility and
    // routing stay where ADR-005 and ADR-008 put them, so arriving from a
    // provider's page cannot buy that provider a lead it would not otherwise
    // qualify for — and the provider may not even be onboarded yet.
    if (input.preferredProviderSlug) {
      requirementRows.push({
        projectId,
        requirementKey: 'preferred_provider',
        valueJson: input.preferredProviderSlug,
        source: 'consumer_preference',
      });
    }

    await tx.insert(projectRequirement).values(requirementRows);

    // 5. The original payload is preserved verbatim next to the structured values.
    await tx.insert(questionnaireResponse).values({
      projectId,
      questionnaireId: config.questionnaire.id,
      questionnaireVersion: config.questionnaire.version,
      answersJson: input.answers,
      completedAt: now,
    });

    // 6. Consent: purpose, policy version, timestamp and source, per docs/10.
    await tx.insert(consentRecord).values([
      {
        projectId,
        purpose: CONSENT_PURPOSE_LEAD_CONTACT,
        policyVersion: input.consent.policyVersion,
        granted: input.consent.leadContact,
        capturedAt: now,
        captureSource: 'questionnaire',
      },
      {
        projectId,
        purpose: CONSENT_PURPOSE_PROVIDER_SHARING,
        policyVersion: input.consent.policyVersion,
        granted: input.consent.providerSharing,
        capturedAt: now,
        captureSource: 'questionnaire',
      },
    ]);

    // 7. Attribution is recorded, never trusted for authorization.
    await tx.insert(attributionTouch).values({
      projectId,
      touchType: 'submission',
      channel: input.attribution.source ?? null,
      medium: input.attribution.medium ?? null,
      campaign: input.attribution.campaign ?? null,
      referrer: input.attribution.referrer ?? null,
      landingPath: input.attribution.landingPath ?? null,
      occurredAt: now,
    });

    if (signals.spam) {
      await recordAudit(tx, {
        actor: { type: 'system' },
        action: 'project.rejected_as_spam',
        entityType: 'project',
        entityId: projectId,
        marketplaceId,
        metadata: { reasons: signals.reasons, correlationId },
      });
      // No lead: a spam project is never a distribution opportunity.
      return { status: 'spam' as const, projectId, leadId: null, reasons: signals.reasons };
    }

    // 8. Deterministic qualification. Manual review policy still gates routing.
    const serviceable = await hasServiceableProvider(tx, marketplaceId, input.location.postalCode);
    const qualificationReasons = [...signals.reasons];
    if (!serviceable) qualificationReasons.push('no_serviceable_provider_in_territory');

    const qualification = serviceable && !signals.duplicate ? 'qualified' : 'review_required';
    const lifecycle = config.matching.reviewPolicy === 'manual' ? 'review_required' : qualification === 'qualified' ? 'ready_for_matching' : 'review_required';

    // Lead grading is opt-in per marketplace (config.leadScoring is undefined
    // unless a marketplace's marketplace.yaml sets `lead_scoring`) — this is
    // never a slug check, so a marketplace that never configures it (e.g.
    // pergolas-mx) simply never grades leads.
    const scored = config.leadScoring ? computeLeadScore(config.leadScoring, input.answers, { serviceable }) : null;

    const [leadRow] = await tx
      .insert(lead)
      .values({
        projectId,
        lifecycleStatus: lifecycle,
        qualificationStatus: qualification,
        qualifiedAt: qualification === 'qualified' ? now : null,
        leadScore: scored?.score ?? null,
        leadGrade: scored?.grade ?? null,
        leadScoreReasons: scored?.reasons ?? null,
      })
      .returning({ id: lead.id });
    const leadId = leadRow!.id;

    await tx.insert(leadStatusHistory).values({
      leadId,
      fromStatus: 'created',
      toStatus: lifecycle,
      reason: qualificationReasons.length > 0 ? qualificationReasons.join(',') : null,
      actorType: 'system',
    });

    // 9. Outbox. Reference ids only — no contact details in the payload.
    await enqueueEvent(tx, {
      eventType: 'project.created',
      entityType: 'project',
      entityId: projectId,
      marketplaceId,
      correlationId,
      payload: {
        projectId,
        leadId,
        marketplaceSlug: config.slug,
        qualificationStatus: qualification,
        lifecycleStatus: lifecycle,
      },
    });

    await track(tx, {
      name: 'project_submitted',
      marketplaceId,
      entityType: 'project',
      entityId: projectId,
      properties: {
        category: config.category,
        qualificationStatus: qualification,
        serviceable,
        budgetKnown: budget.known,
      },
    });

    if (scored) {
      // Allow-listed properties only — never `reasons` (operator-only, via
      // the ops page/audit log) and never any raw answer/contact value.
      await track(tx, {
        name: 'lead_scored',
        marketplaceId,
        entityType: 'lead',
        entityId: leadId,
        properties: {
          marketplaceSlug: config.slug,
          questionnaireVersion: config.questionnaire.version,
          leadGrade: scored.grade,
          leadScore: scored.score,
          serviceable,
        },
      });
    }

    await recordAudit(tx, {
      actor: { type: 'consumer' },
      action: 'project.submitted',
      entityType: 'project',
      entityId: projectId,
      marketplaceId,
      metadata: { correlationId, qualification, reasons: qualificationReasons },
    });

    return { status: 'created' as const, projectId, leadId, reasons: qualificationReasons };
  });
}
