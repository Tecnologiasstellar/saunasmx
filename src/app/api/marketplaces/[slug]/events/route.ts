import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getDb } from '@/modules/database/client';
import { getMarketplaceId } from '@/modules/marketplace-config/publish';
import { track, type AnalyticsEventName } from '@/modules/observability/audit';
import { clientKey, rateLimit } from '@/modules/security/rate-limit';
import { resolveRequestHost } from '@/modules/site/context';
import { log, newCorrelationId } from '@/modules/observability/logger';

/**
 * POST /api/marketplaces/{slug}/events — questionnaire funnel analytics.
 *
 * A closed allow-list, both for event names and for properties: anything not
 * named here is rejected outright, not silently dropped. This is what
 * guarantees a name/email/whatsapp/streetAddress/free-text value can never
 * reach `analytics_event` through this path — the body only carries a step id
 * and campaign tags, and marketplaceSlug/questionnaireVersion are attached
 * server-side from the resolved config, never trusted from the client.
 */

export const runtime = 'nodejs';

const EVENTS_PER_HOUR = 120;

const FUNNEL_EVENT_NAMES = ['questionnaire_started', 'questionnaire_step_viewed', 'questionnaire_step_completed', 'questionnaire_abandoned'] as const;

const bodySchema = z
  .object({
    name: z.enum(FUNNEL_EVENT_NAMES),
    stepId: z.string().max(80).optional(),
    questionnaireVersion: z.number().int().positive().optional(),
    utm_source: z.string().max(120).optional(),
    utm_medium: z.string().max(120).optional(),
    utm_campaign: z.string().max(120).optional(),
  })
  .strict();

export async function POST(request: Request, context: { params: Promise<{ slug: string }> }) {
  const requestId = newCorrelationId();
  const { slug } = await context.params;

  const resolution = await resolveRequestHost();
  if (resolution.kind === 'unknown') {
    return NextResponse.json({ error: { code: 'MARKETPLACE_NOT_FOUND' } }, { status: 404 });
  }
  const config = resolution.config;
  if (config.slug !== slug) {
    return NextResponse.json({ error: { code: 'MARKETPLACE_NOT_FOUND' } }, { status: 404 });
  }

  const limit = rateLimit(clientKey(request.headers, `events:${config.slug}`), EVENTS_PER_HOUR, 3600);
  if (!limit.allowed) {
    return NextResponse.json({ error: { code: 'RATE_LIMITED' } }, { status: 429, headers: { 'Retry-After': String(limit.retryAfterSeconds) } });
  }

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json({ error: { code: 'INVALID_JSON' } }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: { code: 'VALIDATION_FAILED' } }, { status: 422 });
  }

  try {
    const db = await getDb();
    const marketplaceId = await getMarketplaceId(db, config.slug);
    await track(db, {
      name: parsed.data.name as AnalyticsEventName,
      marketplaceId,
      properties: {
        marketplaceSlug: config.slug,
        questionnaireVersion: parsed.data.questionnaireVersion ?? config.questionnaire.version,
        stepId: parsed.data.stepId,
        utm_source: parsed.data.utm_source,
        utm_medium: parsed.data.utm_medium,
        utm_campaign: parsed.data.utm_campaign,
      },
    });
    return NextResponse.json({ ok: true }, { status: 202 });
  } catch (error) {
    log.error('events.failed', { requestId, marketplace: config.slug, error: (error as Error).message });
    // Analytics must never surface as a user-facing failure.
    return NextResponse.json({ ok: false }, { status: 202 });
  }
}
