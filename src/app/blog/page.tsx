import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { listRecentPosts } from '@/db/queries';
import { isProduction, resolveRequestHost } from '@/modules/site/context';
import { Card, Container, MediaPlaceholder, SectionHeading } from '@/modules/ui/primitives';
import { SiteFooter, SiteHeader } from '@/modules/ui/site-chrome';

export const revalidate = 3600;

export async function generateMetadata(): Promise<Metadata> {
  const resolution = await resolveRequestHost();
  // A marketplace without the blog feature has no archive to describe.
  if (resolution.kind === 'unknown' || !resolution.config.features.blog) {
    return { title: 'Blog', robots: { index: false, follow: false } };
  }
  const indexable = isProduction() && resolution.config.seo.defaultIndexing;
  return {
    title: 'Blog',
    description: 'Guías de instalación, materiales y mantenimiento para proyectos de sauna y agua fría.',
    alternates: { canonical: '/blog' },
    robots: { index: indexable, follow: true },
  };
}

export default async function BlogIndexPage() {
  const resolution = await resolveRequestHost();
  if (resolution.kind === 'unknown') notFound();
  const config = resolution.config;
  // The editorial corpus is not marketplace-scoped in the database, so a
  // marketplace that has not declared the blog feature does not serve it. This
  // is what stops pergola visitors reading sauna articles under a pergola brand.
  if (!config.features.blog) notFound();

  const recent = await listRecentPosts(50);

  return (
    <>
      <SiteHeader config={config} />

      <main>
        <div className="border-b border-[var(--border)] py-12 md:py-14">
          <Container>
            <SectionHeading
              eyebrow="Bitácora"
              title="Guías y novedades"
              lead="Instalación, materiales y mantenimiento, explicados sin prometer resultados de salud."
            />
          </Container>
        </div>

        <Container className="py-12">
          {recent.length === 0 ? (
            <Card className="max-w-2xl">
              <h2 className="text-lg font-semibold">Aún no hay artículos publicados</h2>
              <p className="mt-2 text-[var(--ink-muted)]">
                Estamos escribiendo las primeras guías. Cuando se publiquen, aparecerán aquí.
              </p>
            </Card>
          ) : (
            <ul className="grid list-none gap-8 p-0 md:grid-cols-2 lg:grid-cols-3">
              {recent.map((post) => (
                <li key={post.slug}>
                  <Link href={`/blog/${post.slug}`} className="group flex flex-col gap-4 text-inherit">
                    <MediaPlaceholder caption="pendiente: imagen del artículo" className="lift" />
                    <div>
                      <h2 className="text-xl font-semibold leading-snug group-hover:text-[var(--brand)]">
                        {post.title}
                      </h2>
                      <p className="mt-2 text-sm leading-relaxed text-[var(--ink-muted)]">{post.seoMetaDescription}</p>
                      {post.publishedAt ? (
                        <time
                          dateTime={post.publishedAt.toISOString()}
                          className="mt-3 block text-[0.8125rem] text-[var(--ink-subtle)]"
                        >
                          {post.publishedAt.toLocaleDateString('es-MX', {
                            year: 'numeric',
                            month: 'long',
                            day: 'numeric',
                          })}
                        </time>
                      ) : null}
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Container>
      </main>

      <SiteFooter config={config} />
    </>
  );
}
