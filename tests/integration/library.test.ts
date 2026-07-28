import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import type { Database } from '@/modules/database/client';
import {
  appUser,
  libraryChannel,
  libraryCreator,
  libraryResource,
  libraryResourceCreator,
} from '@/modules/database/schema';
import { getPublishedResource, listPublishedResources } from '@/modules/library/queries';
import { reviewResource } from '@/modules/library/review';
import { createTestDatabase } from '../helpers/database';
import { publishRepoConfigs, type PublishedMarketplaces } from '../helpers/fixtures';

let db: Database;
let published: PublishedMarketplaces;
let marketplaceId: string;
let resourceId: string;
let reviewerId: string;

beforeEach(async () => {
  db = await createTestDatabase();
  published = await publishRepoConfigs(db);
  marketplaceId = published.id('suanas-mx');

  const [creator] = await db
    .insert(libraryCreator)
    .values({
      marketplaceId,
      slug: 'official-expert',
      name: 'Official Expert',
      summary: 'Verified source',
      officialWebsiteUrl: 'https://official.example',
      publicationStatus: 'published',
    })
    .returning();
  const [channel] = await db
    .insert(libraryChannel)
    .values({
      marketplaceId,
      creatorId: creator!.id,
      platform: 'youtube',
      externalId: 'UCofficial',
      canonicalUrl: 'https://youtube.com/@official',
      verificationUrl: 'https://official.example/watch',
      officialAccount: true,
      active: true,
    })
    .returning();
  const [resource] = await db
    .insert(libraryResource)
    .values({
      marketplaceId,
      sourceChannelId: channel!.id,
      slug: 'official-sauna-video',
      format: 'video',
      title: 'Official sauna video',
      canonicalUrl: 'https://youtube.com/watch?v=official',
      embedUrl: 'https://youtube-nocookie.com/embed/official',
      externalPlatform: 'youtube',
      externalId: 'official',
      rightsStatus: 'official_embed',
      workflowStatus: 'needs_review',
      sourceOfficial: true,
      metadataHash: 'hash',
    })
    .returning();
  resourceId = resource!.id;
  await db.insert(libraryResourceCreator).values({ resourceId, creatorId: creator!.id, role: 'publisher' });
  const [reviewer] = await db.insert(appUser).values({ email: 'editor@example.com', name: 'Editor' }).returning();
  reviewerId = reviewer!.id;
});

describe('library publication gates', () => {
  it('keeps discovered and review resources out of every public query', async () => {
    expect(await listPublishedResources(db, marketplaceId)).toEqual([]);
    expect(await getPublishedResource(db, marketplaceId, 'official-sauna-video')).toBeNull();
  });

  it('still hides a forced published row when official provenance is false', async () => {
    await db
      .update(libraryResource)
      .set({ workflowStatus: 'published', publishedAt: new Date(), sourceOfficial: false })
      .where(eq(libraryResource.id, resourceId));
    expect(await listPublishedResources(db, marketplaceId)).toEqual([]);
  });

  it('publishes only after all human review controls pass', async () => {
    await reviewResource(db, {
      marketplaceId,
      resourceId,
      reviewerId,
      decision: 'published',
      annotation:
        'Seleccionamos esta conversación porque explica los fundamentos con contexto claro y dirige al material original del autor.',
      takeaways: ['Distingue calor, vapor y enfriamiento.'],
      rightsStatus: 'official_embed',
      evidenceLevel: 'qualified_expert',
      rightsVerified: true,
      sourceVerifiedOfficial: true,
      claimsReviewed: true,
    });

    const rows = await listPublishedResources(db, marketplaceId);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ slug: 'official-sauna-video', creatorName: 'Official Expert' });
  });

  it('rejects publication when an editor has not checked provenance', async () => {
    await expect(
      reviewResource(db, {
        marketplaceId,
        resourceId,
        reviewerId,
        decision: 'published',
        annotation:
          'Seleccionamos esta conversación porque explica los fundamentos con contexto claro y dirige al material original del autor.',
        takeaways: [],
        rightsStatus: 'official_embed',
        evidenceLevel: 'qualified_expert',
        rightsVerified: true,
        sourceVerifiedOfficial: false,
        claimsReviewed: true,
      }),
    ).rejects.toThrow('official');
  });
});

