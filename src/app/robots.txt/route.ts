import { canonicalOrigin, isProduction, resolveRequestHost } from '@/modules/site/context';

/**
 * /robots.txt — written by hand rather than via next/robots because the rules
 * depend on the request host: one deployment serves several marketplaces, each
 * with its own canonical origin and its own indexing switch.
 *
 * Policy: allow every crawler the whole public site, block the authenticated and
 * operational areas. Named AI crawlers are listed explicitly and permissively —
 * an allow-all wildcard already covers them, but writing them out is what makes
 * the decision reviewable later, when someone asks whether ChatGPT is allowed to
 * quote the articles.
 *
 * GPTBot (model *training*, as opposed to OAI-SearchBot's search index) is a
 * business decision, not an SEO one. It is allowed here; flip it to Disallow if
 * the answer changes.
 */
export const revalidate = 3600;

/** Never public: session-gated or operator-only. */
const PRIVATE_PATHS = ['/api/', '/ops', '/portal', '/entrar', '/gracias'];

const SEARCH_CRAWLERS = ['Googlebot', 'Bingbot'];
const AI_CRAWLERS = ['OAI-SearchBot', 'ChatGPT-User', 'GPTBot', 'PerplexityBot', 'Perplexity-User', 'ClaudeBot'];

export async function GET() {
  const resolution = await resolveRequestHost();
  if (resolution.kind === 'unknown') {
    return new Response('User-agent: *\nDisallow: /\n', {
      headers: { 'content-type': 'text/plain; charset=utf-8' },
    });
  }

  const origin = canonicalOrigin(resolution.config);
  const indexable = isProduction() && resolution.config.seo.defaultIndexing;

  // A preview deployment that says "index me" would compete with production for
  // its own rankings. Staging stays out of the index entirely.
  if (!indexable) {
    return new Response('User-agent: *\nDisallow: /\n', {
      headers: { 'content-type': 'text/plain; charset=utf-8' },
    });
  }

  const disallow = PRIVATE_PATHS.map((path) => `Disallow: ${path}`);
  const group = (agent: string) => [`User-agent: ${agent}`, 'Allow: /', ...disallow, ''];

  const body = [
    ...group('*'),
    ...SEARCH_CRAWLERS.flatMap(group),
    ...AI_CRAWLERS.flatMap(group),
    `Sitemap: ${origin}/sitemap.xml`,
    '',
  ].join('\n');

  return new Response(body, {
    headers: {
      'content-type': 'text/plain; charset=utf-8',
      'cache-control': 'public, max-age=0, s-maxage=3600, stale-while-revalidate=86400',
    },
  });
}
