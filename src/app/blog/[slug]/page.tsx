import { marked } from 'marked';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getPublishedPost } from '@/db/queries';
import { getDb } from '@/modules/database/client';
import { serviceLabels } from '@/modules/marketplace-config/labels';
import { getMarketplaceId } from '@/modules/marketplace-config/publish';
import { listPublicProviders } from '@/modules/provider/public-queries';
import { canonicalOrigin, isProduction, resolveRequestHost } from '@/modules/site/context';
import { Container, Eyebrow, MediaPlaceholder, buttonClass } from '@/modules/ui/primitives';
import { SiteFooter, SiteHeader } from '@/modules/ui/site-chrome';
import { SupplierCard } from '@/modules/ui/supplier-card';

/**
 * Public article page. Markdown lives in Neon and is rendered server-side.
 *
 * Revalidate hourly: the daily agent writes at most one post per day, so an
 * hour-stale cache costs nothing and keeps Neon reads near zero.
 */
export const revalidate = 3600;

const RELATED_SUPPLIERS = 3;

async function siteOrigin(): Promise<string> {
  const resolution = await resolveRequestHost();
  return resolution.kind === 'unknown' ? 'https://saunas.mx' : canonicalOrigin(resolution.config);
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const resolution = await resolveRequestHost();
  if (resolution.kind === 'unknown' || !resolution.config.features.blog) {
    return { title: 'Artículo no encontrado', robots: { index: false, follow: false } };
  }

  const { slug } = await params;
  const post = await getPublishedPost(slug);
  if (!post) return { title: 'Artículo no encontrado', robots: { index: false, follow: false } };

  const indexable = isProduction() && resolution.config.seo.defaultIndexing;

  return {
    title: post.title,
    description: post.seoMetaDescription,
    alternates: { canonical: `/blog/${post.slug}` },
    robots: { index: indexable, follow: indexable },
    openGraph: {
      type: 'article',
      title: post.title,
      description: post.seoMetaDescription,
      url: `${await siteOrigin()}/blog/${post.slug}`,
      publishedTime: post.publishedAt?.toISOString(),
    },
  };
}

export default async function BlogPostPage({ params }: { params: Promise<{ slug: string }> }) {
  const resolution = await resolveRequestHost();
  if (resolution.kind === 'unknown') notFound();
  const config = resolution.config;
  if (!config.features.blog) notFound();

  const { slug } = await params;
  const post = await getPublishedPost(slug);
  if (!post) notFound();

  // Markdown is written exclusively by scripts/daily_agent.ts, never by an
  // untrusted user, so raw HTML passthrough is acceptable here. If a human
  // editor ever gets write access to `posts`, sanitize before this renders.
  const html = await marked.parse(post.contentMarkdown, { async: true, gfm: true });

  const db = await getDb();
  const related = await listPublicProviders(db, await getMarketplaceId(db, config.slug), {
    limit: RELATED_SUPPLIERS,
  });
  const labels = serviceLabels(config);

  const published = post.publishedAt;

  return (
    <>
      <SiteHeader config={config} />

      {/*
        JSON-LD. React 19 hoists this into <head>; Google reads it in either
        position. The Metadata API has no first-class JSON-LD field, so this is
        the pattern Next.js documents.
      */}
      <script
        type="application/ld+json"
        // The value is our own generated object, serialized here. `<` is escaped
        // so a stray "</script>" inside a string cannot close the tag early.
        dangerouslySetInnerHTML={{ __html: JSON.stringify(post.jsonLdSchema).replace(/</g, '\\u003c') }}
      />

      <main>
        <Container className="pb-8 pt-12 md:pt-16">
          <header className="max-w-[900px]">
            <Eyebrow>Guía</Eyebrow>
            <h1 className="mt-4 text-[clamp(2rem,5.5vw,3rem)] font-medium leading-[1.15] tracking-[-0.01em] text-balance text-[var(--ink)]">
              {post.title}
            </h1>
            <p className="mt-5 text-sm text-[var(--ink-subtle)]">
              Por Equipo {config.name}
              {published ? (
                <>
                  {' · '}
                  <time dateTime={published.toISOString()}>
                    {published.toLocaleDateString('es-MX', { year: 'numeric', month: 'long', day: 'numeric' })}
                  </time>
                </>
              ) : null}
            </p>
          </header>
        </Container>

        <Container className="pb-4">
          <MediaPlaceholder
            caption="pendiente: fotografía de portada del artículo"
            ratio="aspect-[21/9]"
            className="max-w-[1200px]"
          />
        </Container>

        <Container className="pb-16">
          <div className="grid max-w-[1200px] items-start gap-12 pt-10 lg:grid-cols-[1fr_360px] lg:gap-14">
            <article className="article-body min-w-0" dangerouslySetInnerHTML={{ __html: html }} />

            {/*
              Lead capture. It is a GET form to the real questionnaire, not a
              second intake endpoint: nothing is stored here, no consent is
              implied, and the postal code is revalidated by /cotizar before it
              reaches the form. On phones it follows the article body.
            */}
            <aside className="order-last flex flex-col gap-5 lg:sticky lg:top-24">
              <form
                method="get"
                action="/cotizar"
                className="flex flex-col gap-4 rounded-[var(--radius-panel)] border border-[var(--border)] bg-[var(--surface)] p-7 shadow-[var(--shadow)]"
              >
                <h2 className="font-[family-name:var(--font-heading)] text-xl font-semibold">
                  ¿Estás planeando algo así?
                </h2>
                <p className="text-sm leading-relaxed text-[var(--ink-muted)]">
                  Cuéntanos tu proyecto y lo revisamos antes de compartirlo con proveedores de tu zona.
                </p>
                <label className="block">
                  <span className="text-[0.6875rem] font-bold uppercase tracking-[0.15em] text-[var(--ink-subtle)]">
                    Código postal (opcional)
                  </span>
                  <input
                    type="text"
                    name="cp"
                    inputMode="numeric"
                    pattern="\d{5}"
                    maxLength={5}
                    placeholder="00000"
                    className="mt-2 w-full rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] px-4 py-3.5 text-[0.9375rem] tracking-[0.2em] placeholder:text-[var(--ink-subtle)]"
                  />
                </label>
                <button type="submit" className={buttonClass('primary', 'w-full py-3.5')}>
                  Continuar al cuestionario
                </button>
                <p className="text-xs leading-relaxed text-[var(--ink-subtle)]">
                  Te llevamos al cuestionario completo. No enviamos nada hasta que lo termines y des tu consentimiento.
                </p>
              </form>
            </aside>
          </div>
        </Container>

        {related.length > 0 ? (
          <section className="border-t border-[var(--border)] py-14 lg:py-16">
            <Container>
              <Eyebrow className="mb-6">Proveedores aprobados en {config.name}</Eyebrow>
              <ul className="grid max-w-[1200px] list-none gap-6 p-0 sm:grid-cols-2 lg:grid-cols-3">
                {related.map((provider) => (
                  <li key={provider.id} className="flex">
                    <SupplierCard provider={provider} serviceLabels={labels} compact />
                  </li>
                ))}
              </ul>
            </Container>
          </section>
        ) : null}
      </main>

      <SiteFooter config={config} />
    </>
  );
}
