#!/usr/bin/env tsx
/**
 * Gives every already-published article a hero image.
 *
 * The daily agent only picks an image for the article it is writing, so the
 * posts published before hero images existed would keep their hashed,
 * repeating photo forever. This runs the same picker over the archive, oldest
 * first, accumulating the used set as it goes so no two articles come out with
 * the same photograph.
 *
 * Idempotent: a post that already has an image is skipped, so a rerun costs
 * nothing and never reshuffles an article people have already seen. Use
 * --force to re-pick everything, and --dry to see the plan without writing.
 *
 * Usage:
 *   npm run blog:backfill-images -- [--dry] [--force]
 */
import { asc, eq } from 'drizzle-orm';
import { getBlogDb } from '../src/db/client';
import { posts } from '../src/db/schema';
import { pickHeroImage } from '../src/modules/blog/hero-image';

const dryRun = process.argv.includes('--dry');
const force = process.argv.includes('--force');

if (!process.env.BLOG_DATABASE_URL?.trim()) {
  console.error('Refusing to run: BLOG_DATABASE_URL is not set. This script targets the real blog database.');
  process.exit(1);
}

if (!process.env.PEXELS_API_KEY?.trim()) {
  console.error('Refusing to run: PEXELS_API_KEY is not set.');
  console.error('Without it every article would fall back to the same repeating catalogue this script exists to fix.');
  console.error('Get a free key at https://www.pexels.com/api/ and export PEXELS_API_KEY.');
  process.exit(1);
}

const db = getBlogDb();

const rows = await db
  .select({ slug: posts.slug, title: posts.title, heroImageUrl: posts.heroImageUrl })
  .from(posts)
  .orderBy(asc(posts.publishedAt));

console.log(`${rows.length} post(s) found. ${force ? 'Re-picking all.' : 'Skipping those that already have an image.'}\n`);

// Seeded with what is already taken, so a partial rerun does not hand out a
// photo another post is holding.
const used = new Set(rows.map((row) => row.heroImageUrl).filter((url): url is string => Boolean(url)));

let updated = 0;
let skipped = 0;

for (const row of rows) {
  if (row.heroImageUrl && !force) {
    skipped += 1;
    continue;
  }

  // Its own current image must not block it from being re-picked.
  if (force && row.heroImageUrl) used.delete(row.heroImageUrl);

  const hero = await pickHeroImage({ title: row.title, slug: row.slug, usedUrls: used });
  used.add(hero.url);

  console.log(`${row.slug}\n  → ${hero.alt}\n  → ${hero.photographer} · ${hero.url}`);

  if (!dryRun) {
    await db
      .update(posts)
      .set({
        heroImageUrl: hero.url,
        heroImageAlt: hero.alt,
        heroImagePhotographer: hero.photographer,
        heroImageSource: hero.source,
      })
      .where(eq(posts.slug, row.slug));
  }
  updated += 1;

  // Pexels allows 200 requests/hour; this keeps a 16-post backfill far under it
  // and is polite to an API we are using for free.
  await new Promise((resolve) => setTimeout(resolve, 400));
}

console.log(`\n${dryRun ? 'Would update' : 'Updated'} ${updated} post(s). Skipped ${skipped}.`);
console.log(`${used.size} distinct image(s) across ${rows.length} post(s).`);
process.exit(0);
