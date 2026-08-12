import Image from 'next/image';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { listRecentPosts } from '@/db/queries';
import { asBullets, asColumns, asFaq, asHero, getPublishedPage } from '@/modules/content/queries';
import { getDb } from '@/modules/database/client';
import { getMarketplaceId } from '@/modules/marketplace-config/publish';
import { listPublicProfiles } from '@/modules/directory/queries';
import { toProfileViews } from '@/modules/directory/view-model';
import { resolveRequestHost } from '@/modules/site/context';
import { HERO_PHOTO, photoCredit, photoFocus, photoSrc } from '@/modules/ui/photos';
import { heroPhotoFor } from '@/modules/blog/hero-image';
import { ButtonLink, Card, Chip, Container, Eyebrow, PhotoFigure, SectionHeading } from '@/modules/ui/primitives';
import { QuizPreview } from '@/modules/ui/quiz-preview';
import { SiteFooter, SiteHeader } from '@/modules/ui/site-chrome';
import { DirectoryCard } from '@/modules/ui/directory-card';

/**
 * Public landing page. One template, every marketplace.
 *
 * Brand, copy, sections and navigation all come from configuration and content
 * rows; the only thing this file decides is layout. A section that has no
 * backing data does not render, and nothing here invents a supplier, an article
 * or a claim to fill the design.
 */

const FEATURED_SUPPLIERS = 3;
const FEATURED_ARTICLES = 2;

export default async function LandingPage() {
  const resolution = await resolveRequestHost();
  if (resolution.kind === 'unknown') notFound();
  const config = resolution.config;

  const db = await getDb();
  const marketplaceId = await getMarketplaceId(db, config.slug);

  const [page, providers, articles] = await Promise.all([
    getPublishedPage(db, marketplaceId, 'landing', 'home'),
    listPublicProfiles(db, marketplaceId, 'provider', { limit: FEATURED_SUPPLIERS }),
    config.features.blog ? listRecentPosts(FEATURED_ARTICLES) : Promise.resolve([]),
  ]);

  const blocks = page?.blocks ?? [];
  const hero = blocks.map((block) => (block.blockType === 'hero' ? asHero(block.content) : null)).find(Boolean);
  const bullets = blocks.map((block) => (block.blockType === 'bullets' ? asBullets(block.content) : null)).find(Boolean);
  const columns = blocks.map((block) => (block.blockType === 'columns' ? asColumns(block.content) : null)).find(Boolean);
  const faq = blocks.map((block) => (block.blockType === 'faq' ? asFaq(block.content) : null)).find(Boolean);

  // Assigned as a set so the two cards in this row never show the same photo.

  return (
    <>
      <SiteHeader config={config} />

      <main>
        {/* HERO ------------------------------------------------------------ */}
        <section className="relative flex min-h-[80vh] flex-col justify-end overflow-hidden bg-[var(--surface-dark)] pb-14 pt-24 text-[var(--brand-ink)] lg:min-h-[92vh] lg:pb-[72px]">
          {/* Decorative: the headline carries the meaning, so an empty alt keeps a
              screen reader from reading out a stock photo before the h1. */}
          <Image
            src={photoSrc(HERO_PHOTO)}
            alt=""
            fill
            priority
            sizes="100vw"
            className="object-cover"
            style={{ objectPosition: photoFocus(HERO_PHOTO) }}
          />
          <div
            aria-hidden="true"
            className="absolute inset-0 bg-[linear-gradient(0deg,rgba(12,14,16,0.92)_0%,rgba(12,14,16,0.45)_45%,rgba(12,14,16,0.15)_70%,rgba(12,14,16,0.35)_100%)]"
          />
          <p className="absolute right-6 top-6 font-mono text-[0.6875rem] text-[color-mix(in_srgb,var(--brand-ink)_70%,transparent)] [text-shadow:0_1px_3px_rgb(0_0_0_/_0.6)]">
            {photoCredit(HERO_PHOTO)}
          </p>

          <Container className="relative">
            <div className="flex flex-wrap items-end justify-between gap-12">
              <div className="max-w-[640px]">
                {hero?.eyebrow ? <Eyebrow tone="glow">{hero.eyebrow}</Eyebrow> : null}
                {/* Lowercase is a type treatment, not the content: the accessible
                    name keeps the real capitalisation. */}
                <h1 className="mt-6 text-[clamp(2.75rem,8.5vw,4.75rem)] font-medium lowercase leading-[1.02] tracking-[-0.01em]">
                  {hero?.headline ?? page?.title ?? config.name}
                </h1>
                {hero?.body ? (
                  <p className="mt-7 max-w-[460px] text-[1.0625rem] leading-relaxed text-[color-mix(in_srgb,var(--brand-ink)_68%,transparent)] md:text-lg">
                    {hero.body}
                  </p>
                ) : null}
                <ButtonLink href="/cotizar" variant="ghost" data-testid="primary-cta" className="mt-9 text-[0.9375rem]">
                  Comienza tu búsqueda <span aria-hidden="true">→</span>
                </ButtonLink>
              </div>

              <QuizPreview questionnaire={config.questionnaire} />
            </div>
          </Container>
        </section>

        {/* WHY ------------------------------------------------------------- */}
        {bullets && bullets.length > 0 ? (
          <section className="border-b border-[var(--border)] py-14">
            <Container>
              <ul className="grid list-none gap-4 p-0 sm:grid-cols-3">
                {bullets.map((item) => (
                  <li
                    key={item}
                    className="rounded-[var(--radius-card)] border border-[var(--border)] bg-[var(--surface)] p-6 text-[0.9375rem] leading-relaxed text-[var(--ink)]"
                  >
                    {item}
                  </li>
                ))}
              </ul>
            </Container>
          </section>
        ) : null}

        {/* SUPPLIERS ------------------------------------------------------- */}
        <section className="py-20 lg:py-[88px]">
          <Container>
            <SectionHeading
              eyebrow="Directorio de proveedores"
              title={`Proveedores de saunas en ${config.name}`}
            />

            {providers.length > 0 ? (
              <>
                <ul className="mt-11 grid list-none gap-6 p-0 sm:grid-cols-2 lg:grid-cols-3">
                  {toProfileViews(providers).map((provider) => (
                    <li key={provider.slug} className="flex">
                      <DirectoryCard profile={provider} />
                    </li>
                  ))}
                </ul>
                <ButtonLink href="/proveedores" variant="quiet" className="mt-10">
                  Ver el directorio completo
                </ButtonLink>
              </>
            ) : (
              <Card className="mt-11 max-w-2xl">
                <h3 className="text-lg font-semibold">Todavía no hay proveedores publicados</h3>
                <p className="mt-2 text-[var(--ink-muted)]">
                  Estamos dando de alta a los primeros proveedores. Puedes enviar tu proyecto de todas formas: lo
                  revisamos y te avisamos en cuanto haya alguien que trabaje en tu zona.
                </p>
                <ButtonLink href="/cotizar" className="mt-6">
                  Enviar mi proyecto
                </ButtonLink>
              </Card>
            )}
          </Container>
        </section>

        {/* EXPLAINER ------------------------------------------------------- */}
        {columns ? (
          <section id={columns.anchor} className="scroll-mt-24 bg-[var(--brand-soft)] py-20 lg:py-[88px]">
            <Container>
              <SectionHeading
                align="center"
                eyebrow={columns.eyebrow ?? undefined}
                title={columns.title}
                lead={columns.lead ?? undefined}
              />
              <div className="mx-auto mt-12 grid max-w-[1100px] gap-6 md:grid-cols-2">
                {columns.columns.map((column) => (
                  <article
                    key={column.title}
                    className={`rounded-[var(--radius-panel)] p-8 text-[var(--brand-ink)] lg:p-10 ${
                      column.tone === 'dark' ? 'bg-[var(--surface-dark)]' : 'bg-[var(--accent)]'
                    }`}
                  >
                    <h3 className="text-[1.75rem] font-medium">{column.title}</h3>
                    <ul className="mt-5 flex list-none flex-col gap-3.5 p-0">
                      {column.items.map((item) => (
                        <li
                          key={item}
                          className="flex items-baseline gap-3 text-[0.9375rem] leading-relaxed text-[color-mix(in_srgb,var(--brand-ink)_82%,transparent)] md:text-base"
                        >
                          <span
                            aria-hidden="true"
                            className={`h-1.5 w-1.5 flex-none rounded-full ${
                              column.tone === 'dark' ? 'bg-[var(--brand)]' : 'bg-[var(--glow)]'
                            }`}
                          />
                          {item}
                        </li>
                      ))}
                    </ul>
                  </article>
                ))}
              </div>
            </Container>
          </section>
        ) : null}

        {/* EDITORIAL ------------------------------------------------------- */}
        {config.features.blog ? (
          <section className="py-20 lg:py-[88px]">
            <Container>
              <SectionHeading eyebrow="Bitácora" title="Guías y novedades" />

              {articles.length > 0 ? (
                // One published article should not leave half the row empty.
                <div
                  className={`mt-11 grid gap-6 ${
                    articles.length > 1 ? 'md:grid-cols-[1.1fr_1fr]' : 'md:max-w-[640px]'
                  }`}
                >
                  {articles.map((article, index) => (
                    <Link
                      key={article.slug}
                      href={`/blog/${article.slug}`}
                      className="group flex flex-col gap-4 text-inherit"
                    >
                      <PhotoFigure
                        photo={heroPhotoFor(article)}
                        sizes="(min-width: 768px) 45vw, 100vw"
                        className="lift"
                      />
                      <div>
                        <h3 className="text-xl font-semibold leading-snug group-hover:text-[var(--brand)]">
                          {article.title}
                        </h3>
                        <p className="mt-2 text-sm leading-relaxed text-[var(--ink-muted)]">
                          {article.seoMetaDescription}
                        </p>
                      </div>
                    </Link>
                  ))}
                </div>
              ) : (
                <Card className="mt-11 max-w-2xl">
                  <h3 className="text-lg font-semibold">Aún no hay artículos publicados</h3>
                  <p className="mt-2 text-[var(--ink-muted)]">
                    Estamos escribiendo las primeras guías de instalación. Mientras tanto, cuéntanos tu proyecto y te
                    respondemos con opciones concretas.
                  </p>
                </Card>
              )}
            </Container>
          </section>
        ) : null}

        {/* FAQ ------------------------------------------------------------- */}
        {faq && faq.length > 0 ? (
          <section className="border-t border-[var(--border)] py-20 lg:py-[88px]">
            <Container>
              <div className="grid gap-12 lg:grid-cols-[1fr_1.4fr]">
                <SectionHeading eyebrow="Preguntas frecuentes" title="Antes de empezar" />
                <dl className="grid gap-8">
                  {faq.map((item) => (
                    <div key={item.q}>
                      <dt className="text-lg font-semibold text-[var(--ink)]">{item.q}</dt>
                      <dd className="mt-2 leading-relaxed text-[var(--ink-muted)]">{item.a}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            </Container>
          </section>
        ) : null}

        {/* CLOSING CTA ----------------------------------------------------- */}
        <section className="pb-8">
          <Container>
            <div className="flex flex-col items-start gap-6 rounded-[var(--radius-panel)] bg-[var(--surface-dark)] p-10 text-[var(--brand-ink)] md:flex-row md:items-center md:justify-between lg:p-14">
              <div>
                <h2 className="text-[clamp(1.625rem,3.5vw,2.25rem)] font-medium leading-tight">
                  ¿Listo para cotizar tu proyecto?
                </h2>
                <p className="mt-3 max-w-lg text-[color-mix(in_srgb,var(--brand-ink)_68%,transparent)]">
                  Responde el cuestionario y lo revisamos antes de compartirlo con nadie.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-4">
                <ButtonLink href="/cotizar">Cotizar ahora</ButtonLink>
                <Chip>Gratis para ti</Chip>
              </div>
            </div>
          </Container>
        </section>
      </main>

      <SiteFooter config={config} />
    </>
  );
}
