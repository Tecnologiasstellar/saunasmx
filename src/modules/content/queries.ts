import { and, asc, eq, isNull } from 'drizzle-orm';
import type { Database } from '../database/client';
import { contentBlock, contentPage } from '../database/schema';

export type PageBlock = { id: string; blockType: string; content: unknown; sortOrder: number };

export type PublishedPage = {
  id: string;
  pageType: string;
  slug: string;
  title: string;
  description: string | null;
  indexingPolicy: string;
  blocks: PageBlock[];
};

/**
 * Loads a published editorial page and its blocks.
 * Draft and archived pages are never served on the public site.
 */
export async function getPublishedPage(
  db: Database,
  marketplaceId: string,
  pageType: string,
  slug: string,
): Promise<PublishedPage | null> {
  const [page] = await db
    .select()
    .from(contentPage)
    .where(
      and(
        eq(contentPage.marketplaceId, marketplaceId),
        eq(contentPage.pageType, pageType),
        eq(contentPage.slug, slug),
        eq(contentPage.status, 'published'),
        isNull(contentPage.deletedAt),
      ),
    )
    .limit(1);

  if (!page) return null;

  const blocks = await db
    .select()
    .from(contentBlock)
    .where(eq(contentBlock.pageId, page.id))
    .orderBy(asc(contentBlock.sortOrder));

  return {
    id: page.id,
    pageType: page.pageType,
    slug: page.slug,
    title: page.title,
    description: page.description,
    indexingPolicy: page.indexingPolicy,
    blocks: blocks.map((block) => ({
      id: block.id,
      blockType: block.blockType,
      content: block.contentJson,
      sortOrder: block.sortOrder,
    })),
  };
}

/** Narrowing helpers keep `unknown` block payloads out of the components. */
export function asHero(content: unknown): { headline: string; body: string; eyebrow: string | null } | null {
  const value = content as { headline?: unknown; body?: unknown; eyebrow?: unknown } | null;
  if (!value || typeof value.headline !== 'string' || typeof value.body !== 'string') return null;
  return {
    headline: value.headline,
    body: value.body,
    eyebrow: typeof value.eyebrow === 'string' ? value.eyebrow : null,
  };
}

export type ColumnsBlock = {
  /** Anchor id, so `config.nav` can link straight to this section. */
  anchor: string;
  eyebrow: string | null;
  title: string;
  lead: string | null;
  columns: Array<{ title: string; tone: 'dark' | 'cold'; items: string[] }>;
};

/**
 * A two-up explainer section. The sauna site uses it for heat vs cold; the
 * pergola site uses it for materials. Which one renders is data, not a branch.
 */
export function asColumns(content: unknown): ColumnsBlock | null {
  const value = content as Partial<ColumnsBlock> | null;
  if (!value || typeof value.anchor !== 'string' || typeof value.title !== 'string') return null;
  if (!Array.isArray(value.columns)) return null;

  const columns = value.columns.filter(
    (column): column is ColumnsBlock['columns'][number] =>
      typeof column === 'object' &&
      column !== null &&
      typeof column.title === 'string' &&
      (column.tone === 'dark' || column.tone === 'cold') &&
      Array.isArray(column.items) &&
      column.items.every((item) => typeof item === 'string'),
  );
  if (columns.length === 0) return null;

  return {
    anchor: value.anchor,
    eyebrow: typeof value.eyebrow === 'string' ? value.eyebrow : null,
    title: value.title,
    lead: typeof value.lead === 'string' ? value.lead : null,
    columns,
  };
}

export function asBullets(content: unknown): string[] | null {
  const value = content as { items?: unknown } | null;
  if (!value || !Array.isArray(value.items)) return null;
  return value.items.filter((item): item is string => typeof item === 'string');
}

export function asFaq(content: unknown): Array<{ q: string; a: string }> | null {
  const value = content as { items?: unknown } | null;
  if (!value || !Array.isArray(value.items)) return null;
  return value.items.filter(
    (item): item is { q: string; a: string } =>
      typeof item === 'object' && item !== null && typeof (item as { q?: unknown }).q === 'string' && typeof (item as { a?: unknown }).a === 'string',
  );
}
