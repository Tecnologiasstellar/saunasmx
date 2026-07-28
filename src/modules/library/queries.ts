import { and, desc, eq, ilike, inArray, isNotNull, lte, or, sql } from 'drizzle-orm';
import type { Database } from '../database/client';
import {
  libraryChannel,
  libraryCreator,
  libraryResource,
  libraryResourceCreator,
  libraryResourceTopic,
  libraryTopic,
} from '../database/schema';
import type { LibraryResourceFormat } from './types';

const PUBLIC_RIGHTS = [
  'official_embed',
  'licensed',
  'creator_approved',
  'creative_commons',
  'public_domain',
  'link_only',
] as const;

const publicResource = (marketplaceId: string) =>
  and(
    eq(libraryResource.marketplaceId, marketplaceId),
    eq(libraryResource.workflowStatus, 'published'),
    eq(libraryResource.sourceOfficial, true),
    isNotNull(libraryResource.publishedAt),
    lte(libraryResource.publishedAt, sql`now()`),
    inArray(libraryResource.rightsStatus, [...PUBLIC_RIGHTS]),
    eq(libraryChannel.officialAccount, true),
    eq(libraryCreator.publicationStatus, 'published'),
  );

export type LibraryResourceCard = {
  id: string;
  slug: string;
  title: string;
  annotation: string | null;
  format: LibraryResourceFormat;
  platform: string;
  creatorName: string;
  creatorSlug: string;
  thumbnailUrl: string | null;
  externalPublishedAt: Date | null;
  durationSeconds: number | null;
  rightsStatus: string;
  featured: boolean;
};

export type LibraryResourceDetail = LibraryResourceCard & {
  canonicalUrl: string;
  embedUrl: string | null;
  takeaways: string[];
  language: string;
  evidenceLevel: string;
  creatorSummary: string | null;
  creatorWebsiteUrl: string | null;
  channelUrl: string;
  channelVerificationUrl: string;
  topics: Array<{ slug: string; name: string }>;
};

function cardSelection() {
  return {
    id: libraryResource.id,
    slug: libraryResource.slug,
    title: libraryResource.title,
    annotation: libraryResource.annotation,
    format: libraryResource.format,
    platform: libraryResource.externalPlatform,
    creatorName: libraryCreator.name,
    creatorSlug: libraryCreator.slug,
    thumbnailUrl: libraryResource.thumbnailUrl,
    externalPublishedAt: libraryResource.externalPublishedAt,
    durationSeconds: libraryResource.durationSeconds,
    rightsStatus: libraryResource.rightsStatus,
    featured: libraryResource.featured,
  };
}

function resourceJoin(db: Database) {
  return db
    .selectDistinct(cardSelection())
    .from(libraryResource)
    .innerJoin(libraryChannel, eq(libraryChannel.id, libraryResource.sourceChannelId))
    .innerJoin(libraryResourceCreator, eq(libraryResourceCreator.resourceId, libraryResource.id))
    .innerJoin(libraryCreator, eq(libraryCreator.id, libraryResourceCreator.creatorId));
}

export async function listPublishedResources(
  db: Database,
  marketplaceId: string,
  filters: { query?: string; format?: LibraryResourceFormat; limit?: number } = {},
): Promise<LibraryResourceCard[]> {
  const query = filters.query?.trim();
  return resourceJoin(db)
    .where(
      and(
        publicResource(marketplaceId),
        filters.format ? eq(libraryResource.format, filters.format) : undefined,
        query
          ? or(ilike(libraryResource.title, `%${query}%`), ilike(libraryResource.annotation, `%${query}%`))
          : undefined,
      ),
    )
    .orderBy(desc(libraryResource.featured), desc(libraryResource.externalPublishedAt))
    .limit(Math.min(filters.limit ?? 60, 100));
}

export async function getPublishedResource(
  db: Database,
  marketplaceId: string,
  slug: string,
): Promise<LibraryResourceDetail | null> {
  const [row] = await db
    .select({
      ...cardSelection(),
      canonicalUrl: libraryResource.canonicalUrl,
      embedUrl: libraryResource.embedUrl,
      takeaways: libraryResource.takeawaysJson,
      language: libraryResource.language,
      evidenceLevel: libraryResource.evidenceLevel,
      creatorSummary: libraryCreator.summary,
      creatorWebsiteUrl: libraryCreator.officialWebsiteUrl,
      channelUrl: libraryChannel.canonicalUrl,
      channelVerificationUrl: libraryChannel.verificationUrl,
    })
    .from(libraryResource)
    .innerJoin(libraryChannel, eq(libraryChannel.id, libraryResource.sourceChannelId))
    .innerJoin(libraryResourceCreator, eq(libraryResourceCreator.resourceId, libraryResource.id))
    .innerJoin(libraryCreator, eq(libraryCreator.id, libraryResourceCreator.creatorId))
    .where(and(publicResource(marketplaceId), eq(libraryResource.slug, slug)))
    .limit(1);
  if (!row) return null;

  const topics = await db
    .select({ slug: libraryTopic.slug, name: libraryTopic.name })
    .from(libraryResourceTopic)
    .innerJoin(libraryTopic, eq(libraryTopic.id, libraryResourceTopic.topicId))
    .where(and(eq(libraryResourceTopic.resourceId, row.id), eq(libraryTopic.publicationStatus, 'published')))
    .orderBy(desc(libraryResourceTopic.isPrimary), libraryTopic.sortOrder);

  return {
    ...row,
    takeaways: Array.isArray(row.takeaways) ? row.takeaways.filter((item): item is string => typeof item === 'string') : [],
    topics,
  };
}

export async function listLibraryPublicPaths(db: Database, marketplaceId: string): Promise<string[]> {
  const rows = await db
    .selectDistinct({ slug: libraryResource.slug })
    .from(libraryResource)
    .innerJoin(libraryChannel, eq(libraryChannel.id, libraryResource.sourceChannelId))
    .innerJoin(libraryResourceCreator, eq(libraryResourceCreator.resourceId, libraryResource.id))
    .innerJoin(libraryCreator, eq(libraryCreator.id, libraryResourceCreator.creatorId))
    .where(publicResource(marketplaceId));
  return ['/biblioteca', ...rows.map((row) => `/biblioteca/${row.slug}`)];
}

export async function countPublishedResources(db: Database, marketplaceId: string): Promise<number> {
  const [row] = await db
    .select({ count: sql<number>`count(distinct ${libraryResource.id})` })
    .from(libraryResource)
    .innerJoin(libraryChannel, eq(libraryChannel.id, libraryResource.sourceChannelId))
    .innerJoin(libraryResourceCreator, eq(libraryResourceCreator.resourceId, libraryResource.id))
    .innerJoin(libraryCreator, eq(libraryCreator.id, libraryResourceCreator.creatorId))
    .where(publicResource(marketplaceId));
  return Number(row?.count ?? 0);
}
