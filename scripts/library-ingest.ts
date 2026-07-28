/**
 * Discovers resources only from active, explicitly approved official channels.
 *
 * Usage:
 *   npm run library:ingest -- --marketplace=suanas-mx --limit=25
 *
 * Every discovered resource lands in `needs_review`; this script never
 * publishes. YouTube requires YOUTUBE_API_KEY. RSS-based official feeds do not.
 */
import { getDb, migrateDatabase } from '../src/modules/database/client';
import { ingestApprovedChannels } from '../src/modules/library/ingest';
import { getMarketplaceId } from '../src/modules/marketplace-config/publish';

function arg(name: string): string | undefined {
  const prefix = `--${name}=`;
  return process.argv.find((value) => value.startsWith(prefix))?.slice(prefix.length);
}

const slug = arg('marketplace') ?? 'suanas-mx';
const maxResults = Number(arg('limit') ?? 25);
if (!Number.isInteger(maxResults) || maxResults < 1 || maxResults > 100) {
  throw new Error('--limit must be an integer between 1 and 100');
}

const db = await getDb();
await migrateDatabase(db);
const marketplaceId = await getMarketplaceId(db, slug);
const summaries = await ingestApprovedChannels(db, marketplaceId, {
  youtubeApiKey: process.env.YOUTUBE_API_KEY?.trim(),
  maxResults,
});

if (summaries.length === 0) {
  console.log(`No active official library channels are configured for ${slug}.`);
} else {
  console.table(summaries);
}

