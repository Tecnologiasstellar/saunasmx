import { and, eq } from 'drizzle-orm';
import type { Database } from '../database/client';
import {
  libraryChannel,
  libraryCreator,
  libraryIngestionRun,
  libraryResource,
  libraryResourceCreator,
} from '../database/schema';
import { fetchOfficialFeed } from './adapters/rss';
import { fetchYouTubeUploads } from './adapters/youtube';
import { canonicalizeResourceUrl, metadataHash, slugifyResource } from './official-source';
import type { DiscoveredLibraryResource } from './types';

type Channel = typeof libraryChannel.$inferSelect;
type Creator = typeof libraryCreator.$inferSelect;

export type IngestionSummary = {
  channelId: string;
  creator: string;
  platform: string;
  discovered: number;
  inserted: number;
  updated: number;
  skipped: number;
};

async function discover(channel: Channel, options: { youtubeApiKey?: string; maxResults?: number }) {
  if (channel.platform === 'youtube') {
    if (!options.youtubeApiKey) throw new Error('YOUTUBE_API_KEY is required for an approved YouTube channel');
    return fetchYouTubeUploads({
      channelId: channel.externalId,
      apiKey: options.youtubeApiKey,
      maxResults: options.maxResults,
    });
  }

  if (channel.feedUrl && (channel.platform === 'rss' || channel.platform === 'spotify' || channel.platform === 'website')) {
    return fetchOfficialFeed({
      feedUrl: channel.feedUrl,
      format: channel.platform === 'spotify' ? 'podcast_episode' : 'article',
      maxResults: options.maxResults,
    });
  }

  throw new Error(`No discovery adapter configured for ${channel.platform}:${channel.externalId}`);
}

function publicationStatusAfterRefresh(current: typeof libraryResource.$inferSelect.workflowStatus) {
  return current === 'published' ? 'needs_revalidation' : current;
}

async function storeResource(
  db: Database,
  channel: Channel,
  creator: Creator,
  resource: DiscoveredLibraryResource,
): Promise<'inserted' | 'updated' | 'skipped'> {
  const hash = metadataHash(resource);
  const [existing] = await db
    .select()
    .from(libraryResource)
    .where(
      and(
        eq(libraryResource.marketplaceId, channel.marketplaceId),
        eq(libraryResource.externalPlatform, resource.platform),
        eq(libraryResource.externalId, resource.externalId),
      ),
    )
    .limit(1);

  if (existing?.metadataHash === hash) return 'skipped';

  const canonicalUrl = canonicalizeResourceUrl(resource.canonicalUrl);
  const now = new Date();
  const sourceRights = resource.platform === 'youtube' ? 'official_embed' : 'link_only';

  if (existing) {
    await db
      .update(libraryResource)
      .set({
        title: resource.title,
        format: resource.format,
        canonicalUrl,
        embedUrl: resource.embedUrl ?? null,
        thumbnailUrl: resource.thumbnailUrl ?? null,
        language: resource.language ?? existing.language,
        durationSeconds: resource.durationSeconds ?? null,
        externalPublishedAt: resource.publishedAt ?? null,
        metadataJson: resource.metadata,
        metadataHash: hash,
        sourceFetchedAt: now,
        sourceOfficial: channel.officialAccount,
        workflowStatus: publicationStatusAfterRefresh(existing.workflowStatus),
        updatedAt: now,
      })
      .where(eq(libraryResource.id, existing.id));
    return 'updated';
  }

  const [created] = await db
    .insert(libraryResource)
    .values({
      marketplaceId: channel.marketplaceId,
      sourceChannelId: channel.id,
      slug: `${slugifyResource(resource.title)}-${hash.slice(0, 8)}`,
      format: resource.format,
      title: resource.title,
      language: resource.language ?? 'es',
      canonicalUrl,
      embedUrl: resource.embedUrl,
      thumbnailUrl: resource.thumbnailUrl,
      externalPlatform: resource.platform,
      externalId: resource.externalId,
      durationSeconds: resource.durationSeconds,
      externalPublishedAt: resource.publishedAt,
      rightsStatus: sourceRights,
      workflowStatus: 'needs_review',
      sourceOfficial: channel.officialAccount,
      metadataJson: resource.metadata,
      metadataHash: hash,
      sourceFetchedAt: now,
    })
    .returning({ id: libraryResource.id });

  await db.insert(libraryResourceCreator).values({
    resourceId: created!.id,
    creatorId: creator.id,
    role: 'publisher',
  });
  return 'inserted';
}

export async function ingestChannel(
  db: Database,
  channel: Channel,
  creator: Creator,
  options: { youtubeApiKey?: string; maxResults?: number } = {},
): Promise<IngestionSummary> {
  if (!channel.active || !channel.officialAccount) {
    throw new Error(`Refusing to ingest unapproved channel ${channel.platform}:${channel.externalId}`);
  }

  const [run] = await db
    .insert(libraryIngestionRun)
    .values({ channelId: channel.id, status: 'running' })
    .returning({ id: libraryIngestionRun.id });

  try {
    const discovered = await discover(channel, options);
    const counts = { inserted: 0, updated: 0, skipped: 0 };
    for (const resource of discovered) {
      counts[await storeResource(db, channel, creator, resource)] += 1;
    }

    await db
      .update(libraryIngestionRun)
      .set({
        status: 'succeeded',
        discoveredCount: discovered.length,
        insertedCount: counts.inserted,
        updatedCount: counts.updated,
        skippedCount: counts.skipped,
        finishedAt: new Date(),
      })
      .where(eq(libraryIngestionRun.id, run!.id));

    await db.update(libraryChannel).set({ lastCheckedAt: new Date(), updatedAt: new Date() }).where(eq(libraryChannel.id, channel.id));
    return { channelId: channel.id, creator: creator.name, platform: channel.platform, discovered: discovered.length, ...counts };
  } catch (error) {
    await db
      .update(libraryIngestionRun)
      .set({
        status: 'failed',
        error: error instanceof Error ? error.message : String(error),
        finishedAt: new Date(),
      })
      .where(eq(libraryIngestionRun.id, run!.id));
    throw error;
  }
}

export async function ingestApprovedChannels(
  db: Database,
  marketplaceId: string,
  options: { youtubeApiKey?: string; maxResults?: number } = {},
): Promise<IngestionSummary[]> {
  const rows = await db
    .select({ channel: libraryChannel, creator: libraryCreator })
    .from(libraryChannel)
    .innerJoin(libraryCreator, eq(libraryCreator.id, libraryChannel.creatorId))
    .where(
      and(
        eq(libraryChannel.marketplaceId, marketplaceId),
        eq(libraryChannel.active, true),
        eq(libraryChannel.officialAccount, true),
      ),
    );

  const summaries: IngestionSummary[] = [];
  for (const row of rows) summaries.push(await ingestChannel(db, row.channel, row.creator, options));
  return summaries;
}
