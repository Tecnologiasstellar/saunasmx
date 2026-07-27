import { listRecentPosts } from '@/db/queries';
import { canonicalOrigin, resolveRequestHost } from '@/modules/site/context';

/**
 * /llms.txt — the llmstxt.org convention. One flat, link-dense file so an AI
 * crawler can enumerate the corpus without rendering 50 pages of HTML.
 *
 * Route handlers bypass the root layout, so unknown-host handling is done here
 * rather than inherited.
 */
export const revalidate = 3600;

const POST_LIMIT = 50;

export async function GET() {
  const resolution = await resolveRequestHost();
  // Same gate as /blog: a marketplace that does not serve the editorial corpus
  // does not advertise it either.
  if (resolution.kind === 'unknown' || !resolution.config.features.blog) {
    return new Response('Not found\n', { status: 404, headers: { 'content-type': 'text/plain; charset=utf-8' } });
  }

  const origin = canonicalOrigin(resolution.config);
  const recent = await listRecentPosts(POST_LIMIT);

  const body = [
    `# ${resolution.config.name}`,
    '',
    '> Terapia de contraste, sauna y baños de hielo: protocolos con temperaturas y tiempos concretos, basados en evidencia.',
    '',
    '## Artículos',
    '',
    ...(recent.length === 0
      ? ['Aún no hay artículos publicados.']
      : recent.map((post) => {
          const date = post.publishedAt?.toISOString().slice(0, 10) ?? '';
          return `- [${post.title}](${origin}/blog/${post.slug})${date ? ` (${date})` : ''}: ${post.seoMetaDescription}`;
        })),
    '',
  ].join('\n');

  return new Response(body, {
    headers: {
      'content-type': 'text/plain; charset=utf-8',
      'cache-control': 'public, max-age=0, s-maxage=3600, stale-while-revalidate=86400',
    },
  });
}
