import { and, desc, isNotNull, lte, sql } from 'drizzle-orm';
import { eq } from 'drizzle-orm';
import { blogConfigured, getBlogDb } from './client';
import { posts, type Post } from './schema';

/**
 * Read paths for the public blog. A post is public only when `published_at` is
 * set and not in the future — that single predicate gives us drafts and
 * scheduling without a status enum.
 *
 * When no blog database is configured (local development, CI, the E2E suite)
 * these read as "no posts yet" rather than throwing. The public surfaces then
 * render their honest empty state, which is the truth: this environment has no
 * published articles. Writers still use `getBlogDb()` directly and still fail
 * loudly, because writing to the wrong place is a real error.
 */
const isLive = () => and(isNotNull(posts.publishedAt), lte(posts.publishedAt, sql`now()`));

export async function getPublishedPost(slug: string): Promise<Post | null> {
  if (!blogConfigured()) return null;
  const db = getBlogDb();
  const [row] = await db
    .select()
    .from(posts)
    .where(and(eq(posts.slug, slug), isLive()))
    .limit(1);
  return row ?? null;
}

export type PostSummary = Pick<Post, 'slug' | 'title' | 'seoMetaDescription' | 'publishedAt'>;

export async function listRecentPosts(limit: number): Promise<PostSummary[]> {
  if (!blogConfigured()) return [];
  const db = getBlogDb();
  return db
    .select({
      slug: posts.slug,
      title: posts.title,
      seoMetaDescription: posts.seoMetaDescription,
      publishedAt: posts.publishedAt,
    })
    .from(posts)
    .where(isLive())
    .orderBy(desc(posts.publishedAt))
    .limit(limit);
}

/** Slugs for generateStaticParams / sitemap. */
export async function listPublishedSlugs(): Promise<string[]> {
  if (!blogConfigured()) return [];
  const db = getBlogDb();
  const rows = await db.select({ slug: posts.slug }).from(posts).where(isLive());
  return rows.map((r) => r.slug);
}
