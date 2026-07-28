import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { loadLibraryResource } from '@/modules/library/page-data';
import { FORMAT_LABEL, OfficialSourcePanel } from '@/modules/ui/library';
import { Card, Chip, Container, Eyebrow } from '@/modules/ui/primitives';
import { SiteFooter, SiteHeader } from '@/modules/ui/site-chrome';

type Params = Promise<{ slug: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const data = await loadLibraryResource((await params).slug);
  if (!data) return { title: 'Recurso', robots: { index: false, follow: false } };
  return {
    title: data.resource.title,
    description: data.resource.annotation ?? `Recurso oficial de ${data.resource.creatorName}, seleccionado por Saunas.mx.`,
    alternates: { canonical: `/biblioteca/${data.resource.slug}` },
  };
}

export default async function LibraryResourcePage({ params }: { params: Params }) {
  const data = await loadLibraryResource((await params).slug);
  if (!data) notFound();
  const { resource } = data;

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': resource.format === 'video' ? 'VideoObject' : resource.format === 'podcast_episode' ? 'PodcastEpisode' : 'CreativeWork',
    name: resource.title,
    url: `${data.origin}/biblioteca/${resource.slug}`,
    creator: { '@type': resource.creatorName.includes('Society') ? 'Organization' : 'Person', name: resource.creatorName },
    sameAs: resource.canonicalUrl,
    ...(resource.externalPublishedAt ? { datePublished: resource.externalPublishedAt.toISOString() } : {}),
    ...(resource.thumbnailUrl ? { thumbnailUrl: resource.thumbnailUrl } : {}),
    ...(resource.embedUrl ? { embedUrl: resource.embedUrl } : {}),
  };

  return (
    <>
      <SiteHeader config={data.config} />
      <main>
        <Container className="py-12 md:py-16">
          <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_360px] lg:gap-14">
            <article>
              <Eyebrow>{FORMAT_LABEL[resource.format]}</Eyebrow>
              <h1 className="mt-4 max-w-4xl text-[clamp(2.4rem,6vw,4.8rem)] font-medium leading-[1] tracking-[-0.03em]">
                {resource.title}
              </h1>
              <p className="mt-6 text-lg text-[var(--ink-muted)]">Por {resource.creatorName}</p>

              {resource.embedUrl && resource.rightsStatus !== 'link_only' ? (
                <div className="mt-10 aspect-video overflow-hidden rounded-[var(--radius-panel)] bg-black shadow-[var(--shadow)]">
                  <iframe
                    src={resource.embedUrl}
                    title={`${resource.title} — reproductor oficial`}
                    className="h-full w-full border-0"
                    allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
                    allowFullScreen
                    loading="lazy"
                  />
                </div>
              ) : resource.thumbnailUrl ? (
                <div
                  className="mt-10 aspect-video rounded-[var(--radius-panel)] bg-[var(--surface-dark)] bg-cover bg-center"
                  style={{ backgroundImage: `url("${resource.thumbnailUrl.replace(/["\\]/g, '')}")` }}
                  role="img"
                  aria-label=""
                />
              ) : null}

              <section className="mt-12 border-t border-[var(--border)] pt-10">
                <Eyebrow>Por qué lo seleccionamos</Eyebrow>
                {resource.annotation ? (
                  <p className="mt-4 max-w-3xl text-lg leading-relaxed text-[var(--ink)]">{resource.annotation}</p>
                ) : (
                  <p className="mt-4 text-[var(--ink-muted)]">
                    Este recurso está pendiente de una anotación editorial. Su publicación permanece atribuida a la fuente original.
                  </p>
                )}
              </section>

              {resource.takeaways.length > 0 ? (
                <section className="mt-10">
                  <h2 className="text-2xl font-semibold">Qué aprenderás</h2>
                  <ul className="mt-5 grid gap-3">
                    {resource.takeaways.map((takeaway) => (
                      <li key={takeaway} className="rounded-[var(--radius-card)] bg-[var(--brand-soft)] p-4 leading-relaxed">
                        {takeaway}
                      </li>
                    ))}
                  </ul>
                </section>
              ) : null}
            </article>

            <aside className="space-y-6 lg:pt-16">
              <OfficialSourcePanel resource={resource} />
              <Card>
                <h2 className="text-lg font-semibold">Sobre la fuente</h2>
                {resource.creatorSummary ? <p className="mt-3 text-sm leading-relaxed text-[var(--ink-muted)]">{resource.creatorSummary}</p> : null}
                <dl className="mt-5 grid gap-3 text-sm">
                  <div><dt className="text-[var(--ink-subtle)]">Formato</dt><dd className="font-semibold">{FORMAT_LABEL[resource.format]}</dd></div>
                  <div><dt className="text-[var(--ink-subtle)]">Idioma</dt><dd className="font-semibold">{resource.language.toUpperCase()}</dd></div>
                  <div><dt className="text-[var(--ink-subtle)]">Nivel editorial</dt><dd className="font-semibold">{resource.evidenceLevel.replaceAll('_', ' ')}</dd></div>
                </dl>
                {resource.topics.length > 0 ? (
                  <div className="mt-5 flex flex-wrap gap-2">{resource.topics.map((topic) => <Chip key={topic.slug}>{topic.name}</Chip>)}</div>
                ) : null}
              </Card>
            </aside>
          </div>
        </Container>
      </main>
      <SiteFooter config={data.config} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, '\\u003c') }} />
    </>
  );
}

