import { NextResponse } from 'next/server';
import { getDb } from '@/modules/database/client';
import { buildIntakeSchema } from '@/modules/forms-engine/intake-schema';
import { submitProject } from '@/modules/intake/submit-project';
import { getMarketplaceId } from '@/modules/marketplace-config/publish';
import { clientKey, rateLimit } from '@/modules/security/rate-limit';
import { resolveRequestHost } from '@/modules/site/context';
import { log, newCorrelationId } from '@/modules/observability/logger';

/**
 * POST /api/marketplaces/{slug}/projects — docs/05-api-contracts.md.
 *
 * The slug in the path is client-supplied and therefore untrusted: it is only
 * accepted when it matches the marketplace resolved from the Host header.
 */

export const runtime = 'nodejs';

const SUBMISSIONS_PER_HOUR = 8;

function errorResponse(status: number, code: string, message: string, requestId: string, details?: unknown) {
  return NextResponse.json({ error: { code, message, requestId, details: details ?? {} } }, { status });
}

export async function POST(request: Request, context: { params: Promise<{ slug: string }> }) {
  const requestId = newCorrelationId();
  const { slug } = await context.params;

  const resolution = await resolveRequestHost();
  if (resolution.kind === 'unknown') {
    return errorResponse(404, 'MARKETPLACE_NOT_FOUND', 'No marketplace is configured for this host.', requestId);
  }
  const config = resolution.config;

  if (config.slug !== slug) {
    // A client cannot submit into a marketplace it is not browsing.
    log.warn('intake.slug_mismatch', { requestId, requested: slug, resolved: config.slug });
    return errorResponse(404, 'MARKETPLACE_NOT_FOUND', 'No marketplace is configured for this host.', requestId);
  }

  const limit = rateLimit(clientKey(request.headers, `intake:${config.slug}`), SUBMISSIONS_PER_HOUR, 3600);
  if (!limit.allowed) {
    return NextResponse.json(
      {
        error: {
          code: 'RATE_LIMITED',
          message: 'Demasiadas solicitudes. Inténtalo de nuevo más tarde.',
          requestId,
          details: {},
        },
      },
      { status: 429, headers: { 'Retry-After': String(limit.retryAfterSeconds) } },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return errorResponse(400, 'INVALID_JSON', 'El cuerpo de la solicitud no es JSON válido.', requestId);
  }

  const parsed = buildIntakeSchema(config).safeParse(body);
  if (!parsed.success) {
    // Field paths only — never echo submitted values back into an error body.
    const fieldErrors = parsed.error.issues.map((issue) => ({
      field: issue.path.join('.'),
      message: issue.message,
    }));
    return errorResponse(422, 'VALIDATION_FAILED', 'Revisa los datos del formulario.', requestId, { fieldErrors });
  }

  try {
    const db = await getDb();
    const marketplaceId = await getMarketplaceId(db, config.slug);
    const outcome = await submitProject(db, {
      config,
      marketplaceId,
      input: parsed.data,
      correlationId: requestId,
    });

    log.info('intake.submitted', {
      requestId,
      marketplace: config.slug,
      projectId: outcome.projectId,
      status: outcome.status,
      reasons: outcome.reasons,
    });

    // A spam verdict is not disclosed to the submitter; the response is the
    // same safe confirmation either way.
    return NextResponse.json(
      { projectId: outcome.projectId, status: outcome.status === 'spam' ? 'received' : outcome.status, requestId },
      { status: outcome.status === 'duplicate_request' ? 200 : 201 },
    );
  } catch (error) {
    log.error('intake.failed', { requestId, marketplace: config.slug, error: (error as Error).message });
    return errorResponse(500, 'INTAKE_FAILED', 'No pudimos guardar tu proyecto. Inténtalo de nuevo.', requestId);
  }
}
