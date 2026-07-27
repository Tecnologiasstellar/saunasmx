import { NextResponse, type NextRequest } from 'next/server';
import { publishDailyPost } from '@/modules/blog/publish';

/**
 * HTTP-triggered daily article, for a scheduled job on a platform with no shell
 * (Vercel Cron). The same work is available locally as `npm run blog:agent`.
 *
 * Protected by the same shared secret as the outbox drain: without WORKER_SECRET
 * set the endpoint refuses to run rather than defaulting to open. Publishing is
 * a write and an outward-facing action, so an open endpoint would let anyone
 * spend the Claude budget.
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// A measured run is ~75s (~85s with DataForSEO), so the default 10s is far too
// short. 300 is the ceiling Hobby accepts — a higher value fails the deploy
// outright rather than being clamped. Raise it only alongside a plan upgrade.
export const maxDuration = 300;

async function run(request: NextRequest) {
  const secret = process.env.WORKER_SECRET?.trim();
  if (!secret) {
    return NextResponse.json({ error: { code: 'WORKER_NOT_CONFIGURED' } }, { status: 503 });
  }

  const provided = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  if (provided !== secret) {
    return NextResponse.json({ error: { code: 'FORBIDDEN' } }, { status: 403 });
  }

  try {
    const result = await publishDailyPost({ dryRun: request.nextUrl.searchParams.get('dry') === '1' });
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'unknown';
    console.error('blog.publish_failed', message);
    return NextResponse.json({ error: { code: 'PUBLISH_FAILED', message } }, { status: 500 });
  }
}

export const POST = run;
// Vercel Cron invokes with GET and no body; same shared-secret check either way.
export const GET = run;
