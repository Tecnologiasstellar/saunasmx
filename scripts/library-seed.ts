/**
 * Imports reviewed creator/channel/topic configuration. The source file is
 * intentionally small and hand-auditable; a crawler cannot add an account to
 * the allowlist.
 *
 * Usage: npm run library:seed -- --marketplace=suanas-mx
 */
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { getDb, migrateDatabase } from '../src/modules/database/client';
import { libraryChannel, libraryCreator, libraryTopic } from '../src/modules/database/schema';
import { getMarketplaceId } from '../src/modules/marketplace-config/publish';

const platform = z.enum(['youtube', 'spotify', 'rss', 'google_books', 'pubmed', 'website']);
const fileSchema = z.strictObject({
  marketplace: z.string().min(1),
  topics: z.array(
    z.strictObject({
      slug: z.string().min(1),
      name: z.string().min(1),
      description: z.string().min(1),
      sortOrder: z.number().int().nonnegative(),
    }),
  ),
  creators: z.array(
    z.strictObject({
      slug: z.string().min(1),
      name: z.string().min(1),
      summary: z.string().min(1),
      countryCode: z.string().length(2),
      languages: z.array(z.string().min(2)),
      officialWebsiteUrl: z.url(),
      channels: z.array(
        z.strictObject({
          platform,
          externalId: z.string().min(1),
          canonicalUrl: z.url(),
          feedUrl: z.url().optional(),
          verificationUrl: z.url(),
          officialAccount: z.boolean(),
          active: z.boolean(),
        }),
      ),
    }),
  ),
});

function arg(name: string): string | undefined {
  const prefix = `--${name}=`;
  return process.argv.find((value) => value.startsWith(prefix))?.slice(prefix.length);
}

const marketplaceSlug = arg('marketplace') ?? 'suanas-mx';
const sourcePath = resolve(process.cwd(), 'config/library', marketplaceSlug, 'sources.json');
const source = fileSchema.parse(JSON.parse(await readFile(sourcePath, 'utf8')));
if (source.marketplace !== marketplaceSlug) throw new Error(`Source declares ${source.marketplace}, expected ${marketplaceSlug}`);

const db = await getDb();
await migrateDatabase(db);
const marketplaceId = await getMarketplaceId(db, marketplaceSlug);

for (const topic of source.topics) {
  await db
    .insert(libraryTopic)
    .values({ marketplaceId, ...topic, publicationStatus: 'published' })
    .onConflictDoUpdate({
      target: [libraryTopic.marketplaceId, libraryTopic.slug],
      set: { name: topic.name, description: topic.description, sortOrder: topic.sortOrder, updatedAt: new Date() },
    });
}

for (const input of source.creators) {
  await db
    .insert(libraryCreator)
    .values({
      marketplaceId,
      slug: input.slug,
      name: input.name,
      summary: input.summary,
      countryCode: input.countryCode,
      languagesJson: input.languages,
      officialWebsiteUrl: input.officialWebsiteUrl,
      publicationStatus: 'published',
      lastVerifiedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: [libraryCreator.marketplaceId, libraryCreator.slug],
      set: {
        name: input.name,
        summary: input.summary,
        countryCode: input.countryCode,
        languagesJson: input.languages,
        officialWebsiteUrl: input.officialWebsiteUrl,
        updatedAt: new Date(),
      },
    });

  const [creator] = await db
    .select()
    .from(libraryCreator)
    .where(and(eq(libraryCreator.marketplaceId, marketplaceId), eq(libraryCreator.slug, input.slug)))
    .limit(1);

  for (const channel of input.channels) {
    await db
      .insert(libraryChannel)
      .values({ marketplaceId, creatorId: creator!.id, ...channel })
      .onConflictDoUpdate({
        target: [libraryChannel.marketplaceId, libraryChannel.platform, libraryChannel.externalId],
        set: {
          canonicalUrl: channel.canonicalUrl,
          feedUrl: channel.feedUrl,
          verificationUrl: channel.verificationUrl,
          officialAccount: channel.officialAccount,
          active: channel.active,
          updatedAt: new Date(),
        },
      });
  }
}

console.log(`Seeded ${source.topics.length} topics and ${source.creators.length} reviewed creator(s) for ${marketplaceSlug}.`);

