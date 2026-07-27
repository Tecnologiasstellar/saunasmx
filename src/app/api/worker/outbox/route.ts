import { NextResponse, type NextRequest } from 'next/server';
import { getDb } from '@/modules/database/client';
import { expireStaleAssignments } from '@/modules/matching-engine/assign';
import { log } from '@/modules/observability/logger';
import { processOutbox } from '@/modules/worker/outbox-worker';

/**
 * HTTP-triggered outbox drain, for a scheduled job on a platform with no shell
 * (Vercel Cron). The same work is available locally as `npm run outbox:work`.
 *
 * Protected by a shared secret: without WORKER_SECRET set, the endpoint refuses
 * to run rather than defaulting to open.
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function run(request: NextRequest) {
  const secret = process.env.WORKER_SECRET?.trim();
  if (!secret) {
    log.error('worker.secret_not_configured');
    return NextResponse.json({ error: { code: 'WORKER_NOT_CONFIGURED' } }, { status: 503 });
  }

  const provided = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  if (provided !== secret) {
    return NextResponse.json({ error: { code: 'FORBIDDEN' } }, { status: 403 });
  }

  const db = await getDb();
  const expired = await expireStaleAssignments(db);
  const result = await processOutbox(db);

  log.info('worker.run', { ...result, expired });
  return NextResponse.json({ ...result, expiredAssignments: expired });
}

export const POST = run;
// Vercel Cron invokes with GET and no body; same shared-secret check either way.
export const GET = run;
