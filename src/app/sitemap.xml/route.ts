import { listRecentPosts } from '@/db/queries';
import { canonicalOrigin, isProduction, resolveRequestHost } from '@/modules/site/context';

/**
 * /sitemap.xml — the marketplace's public pages plus every published article.
 *
 * Hand-written for the same reason as robots.txt: next/sitemap resolves at build
 * time, and both the origin and the page list here depend on the request host.
 *
 * `lastmod` is the article's real publication timestamp. Crawlers discount a
 * sitemap whose dates all move on every deploy, so the static pages carry no
 * lastmod at all rather than a fabricated one.
 */
export const revalidate = 3600;

/** Generous: one post a day means years of runway, and the file stays tiny. */
const POST_LIMIT = 1000;

function urlEntry(loc: string, lastmod?: string): string {
  return ['  <url>', `    <loc>${loc}</loc>`, ...(lastmod ? [`    <lastmod>${lastmod}</lastmod>`] : []), '  </url>'].join(
    '\n',
  );
}

export async function GET() {
  const resolution = await resolveRequestHost();
  if (resolution.kind === 'unknown') {
    return new Response('Not found\n', { status: 404, headers: { 'content-type': 'text/plain; charset=utf-8' } });
  }
  // A sitemap on a non-indexable host is an invitation crawlers should not get.
  if (!isProduction() || !resolution.config.seo.defaultIndexing) {
    return new Response('Not found\n', { status: 404, headers: { 'content-type': 'text/plain; charset=utf-8' } });
  }

  const config = resolution.config;
  const origin = canonicalOrigin(config);

  // nav is this marketplace's own list of what it publishes, so the sitemap can
  // never advertise a route this tenant does not serve.
  const paths = ['/', ...config.nav.map((link) => link.href).filter((href) => href.startsWith('/'))];
  if (config.features.blog && !paths.includes('/blog')) paths.push('/blog');

  const entries = [...new Set(paths)].map((path) => urlEntry(`${origin}${path === '/' ? '' : path}`));

  if (config.features.blog) {
    const articles = await listRecentPosts(POST_LIMIT);
    entries.push(
      ...articles.map((post) => urlEntry(`${origin}/blog/${post.slug}`, post.publishedAt?.toISOString())),
    );
  }

  const body = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...entries,
    '</urlset>',
    '',
  ].join('\n');

  return new Response(body, {
    headers: {
      'content-type': 'application/xml; charset=utf-8',
      'cache-control': 'public, max-age=0, s-maxage=3600, stale-while-revalidate=86400',
    },
  });
}
