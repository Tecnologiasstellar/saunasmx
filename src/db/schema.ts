import { index, jsonb, pgTable, text, timestamp, uniqueIndex, uuid, vector } from 'drizzle-orm/pg-core';

/**
 * Programmatic blog schema (contrast therapy / sauna / cold plunge).
 *
 * Deliberately separate from src/modules/database/schema.ts: this table lives on
 * pgvector, which the embedded PGlite used for local marketplace dev does not
 * ship. Keeping it in its own schema + migration chain means `npm run db:migrate`
 * (PGlite) stays working while `npm run blog:migrate` targets Neon.
 */

/**
 * 1536 = OpenAI text-embedding-3-small output width. Changing this is a
 * destructive migration: the column type carries the dimension.
 */
export const EMBEDDING_DIMENSIONS = 1536;

export const posts = pgTable(
  'posts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    /** URL segment under /blog/. Unique because it is the public identifier. */
    slug: text('slug').notNull(),
    title: text('title').notNull(),
    contentMarkdown: text('content_markdown').notNull(),
    seoMetaDescription: text('seo_meta_description').notNull(),
    /** Full JSON-LD object rendered verbatim into the page. */
    jsonLdSchema: jsonb('json_ld_schema').notNull(),
    /**
     * NULL = drafted but not live. The public routes filter on
     * `published_at IS NOT NULL AND published_at <= now()`, which also gives us
     * free scheduling.
     */
    publishedAt: timestamp('published_at', { withTimezone: true }),
    /** Semantic vector over title + body, used to pick internal link targets. */
    vectorEmbedding: vector('vector_embedding', { dimensions: EMBEDDING_DIMENSIONS }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('posts_slug_key').on(table.slug),
    // Drives the archive list and llms.txt; both order by published_at desc.
    index('posts_published_at_idx').on(table.publishedAt),
    // HNSW over cosine distance: the daily agent asks for nearest neighbours on
    // every run, so the index earns its write cost immediately.
    index('posts_embedding_idx').using('hnsw', table.vectorEmbedding.op('vector_cosine_ops')),
  ],
);

export type Post = typeof posts.$inferSelect;
export type NewPost = typeof posts.$inferInsert;
