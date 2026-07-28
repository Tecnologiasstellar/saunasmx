import { and, desc, eq, inArray } from 'drizzle-orm';
import type { Database } from '../database/client';
import {
  auditLog,
  libraryChannel,
  libraryCreator,
  libraryEditorialReview,
  libraryResource,
  libraryResourceCreator,
} from '../database/schema';

const REVIEW_QUEUE = ['needs_review', 'needs_revalidation', 'approved'] as const;
const PUBLISHABLE_RIGHTS = [
  'official_embed',
  'licensed',
  'creator_approved',
  'creative_commons',
  'public_domain',
  'link_only',
] as const;

export async function listReviewQueue(db: Database, marketplaceId: string) {
  return db
    .select({
      id: libraryResource.id,
      title: libraryResource.title,
      format: libraryResource.format,
      platform: libraryResource.externalPlatform,
      status: libraryResource.workflowStatus,
      creatorName: libraryCreator.name,
      sourceFetchedAt: libraryResource.sourceFetchedAt,
    })
    .from(libraryResource)
    .innerJoin(libraryChannel, eq(libraryChannel.id, libraryResource.sourceChannelId))
    .innerJoin(libraryResourceCreator, eq(libraryResourceCreator.resourceId, libraryResource.id))
    .innerJoin(libraryCreator, eq(libraryCreator.id, libraryResourceCreator.creatorId))
    .where(and(eq(libraryResource.marketplaceId, marketplaceId), inArray(libraryResource.workflowStatus, [...REVIEW_QUEUE])))
    .orderBy(desc(libraryResource.sourceFetchedAt));
}

export async function getReviewCandidate(db: Database, marketplaceId: string, resourceId: string) {
  const [row] = await db
    .select({
      resource: libraryResource,
      channel: libraryChannel,
      creator: libraryCreator,
    })
    .from(libraryResource)
    .innerJoin(libraryChannel, eq(libraryChannel.id, libraryResource.sourceChannelId))
    .innerJoin(libraryResourceCreator, eq(libraryResourceCreator.resourceId, libraryResource.id))
    .innerJoin(libraryCreator, eq(libraryCreator.id, libraryResourceCreator.creatorId))
    .where(and(eq(libraryResource.marketplaceId, marketplaceId), eq(libraryResource.id, resourceId)))
    .limit(1);
  return row ?? null;
}

export async function reviewResource(
  db: Database,
  input: {
    marketplaceId: string;
    resourceId: string;
    reviewerId: string;
    decision: 'needs_review' | 'approved' | 'published' | 'rejected';
    annotation: string;
    takeaways: string[];
    rightsStatus: (typeof PUBLISHABLE_RIGHTS)[number] | 'pending' | 'blocked';
    evidenceLevel:
      | 'systematic_review'
      | 'primary_research'
      | 'qualified_expert'
      | 'industry'
      | 'lived_experience'
      | 'commercial'
      | 'unrated';
    rightsVerified: boolean;
    sourceVerifiedOfficial: boolean;
    claimsReviewed: boolean;
    note?: string;
  },
): Promise<void> {
  const candidate = await getReviewCandidate(db, input.marketplaceId, input.resourceId);
  if (!candidate) throw new Error('Library resource not found in this marketplace');

  if (input.decision === 'published') {
    if (!candidate.channel.officialAccount || !candidate.resource.sourceOfficial || !input.sourceVerifiedOfficial) {
      throw new Error('Publication requires an approved official channel and a fresh source verification');
    }
    if (!PUBLISHABLE_RIGHTS.includes(input.rightsStatus as (typeof PUBLISHABLE_RIGHTS)[number]) || !input.rightsVerified) {
      throw new Error('Publication requires a publishable rights status and rights verification');
    }
    if (!input.claimsReviewed) throw new Error('Publication requires the claims/safety review checkbox');
    if (input.annotation.trim().length < 80) throw new Error('Publication requires an original editorial annotation of at least 80 characters');
    if (candidate.creator.publicationStatus !== 'published') throw new Error('The creator profile must be published first');
  }

  const now = new Date();
  await db.transaction(async (tx) => {
    await tx
      .update(libraryResource)
      .set({
        annotation: input.annotation.trim() || null,
        takeawaysJson: input.takeaways,
        rightsStatus: input.rightsStatus,
        evidenceLevel: input.evidenceLevel,
        workflowStatus: input.decision,
        lastReviewedAt: now,
        nextReviewAt: input.decision === 'published' ? new Date(now.getTime() + 180 * 86_400_000) : null,
        publishedAt: input.decision === 'published' ? candidate.resource.publishedAt ?? now : candidate.resource.publishedAt,
        updatedAt: now,
      })
      .where(and(eq(libraryResource.id, input.resourceId), eq(libraryResource.marketplaceId, input.marketplaceId)));

    await tx.insert(libraryEditorialReview).values({
      resourceId: input.resourceId,
      reviewerId: input.reviewerId,
      decision: input.decision,
      note: input.note,
      rightsVerified: input.rightsVerified,
      sourceVerifiedOfficial: input.sourceVerifiedOfficial,
      claimsReviewed: input.claimsReviewed,
    });

    await tx.insert(auditLog).values({
      actorType: 'operator',
      actorId: input.reviewerId,
      action: `library.resource.${input.decision}`,
      entityType: 'library_resource',
      entityId: input.resourceId,
      marketplaceId: input.marketplaceId,
      metadataJson: { rightsStatus: input.rightsStatus, evidenceLevel: input.evidenceLevel },
    });
  });
}

