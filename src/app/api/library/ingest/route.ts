import { NextResponse, type NextRequest } from 'next/server';
import { getDb } from '@/modules/database/client';
import { ingestApprovedChannels } from '@/modules/library/ingest';
import { getMarketplaceId } from '@/modules/marketplace-config/publish';

/**
 * Scheduled discovery for the curated library.
 *
 * This endpoint can only create/update editorial candidates. It cannot publish
 * a resource; publication requires the authenticated /ops/biblioteca review.
 * Deliberately not added to vercel.json yet: production scheduling begins only
 * after WORKER_SECRET, YOUTUBE_API_KEY and the source allowlist are reviewed.
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

async function run(request: NextRequest) {
  const secret = process.env.WORKER_SECRET?.trim();
  if (!secret) return NextResponse.json({ error: { code: 'WORKER_NOT_CONFIGURED' } }, { status: 503 });
  const provided = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  if (provided !== secret) return NextResponse.json({ error: { code: 'FORBIDDEN' } }, { status: 403 });

  const marketplace = request.nextUrl.searchParams.get('marketplace') ?? 'suanas-mx';
  const limit = Number(request.nextUrl.searchParams.get('limit') ?? 25);
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
    return NextResponse.json({ error: { code: 'INVALID_LIMIT' } }, { status: 400 });
  }

  try {
    const db = await getDb();
    const summaries = await ingestApprovedChannels(db, await getMarketplaceId(db, marketplace), {
      youtubeApiKey: process.env.YOUTUBE_API_KEY?.trim(),
      maxResults: limit,
    });
    return NextResponse.json({ marketplace, summaries });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'unknown';
    console.error('library.ingest_failed', message);
    return NextResponse.json({ error: { code: 'INGEST_FAILED', message } }, { status: 500 });
  }
}

export const GET = run;
export const POST = run;

