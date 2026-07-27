import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getDb } from '@/modules/database/client';
import { getMarketplaceId } from '@/modules/marketplace-config/publish';
import { asBullets, asFaq, asHero, getPublishedPage } from '@/modules/content/queries';
import { resolveRequestHost } from '@/modules/site/context';
import { Prose, SiteFooter, SiteHeader } from '@/modules/ui/site-chrome';

/**
 * Public landing page. One template, every marketplace.
 * Brand, copy, category and CTA all come from configuration and content rows.
 */
export default async function LandingPage() {
  const resolution = await resolveRequestHost();
  if (resolution.kind === 'unknown') notFound();
  const config = resolution.config;

  const db = await getDb();
  const marketplaceId = await getMarketplaceId(db, config.slug);
  const page = await getPublishedPage(db, marketplaceId, 'landing', 'home');

  const hero = page?.blocks.map((block) => (block.blockType === 'hero' ? asHero(block.content) : null)).find(Boolean);
  const bullets = page?.blocks.map((block) => (block.blockType === 'bullets' ? asBullets(block.content) : null)).find(Boolean);
  const faq = page?.blocks.map((block) => (block.blockType === 'faq' ? asFaq(block.content) : null)).find(Boolean);

  return (
    <>
      <SiteHeader config={config} />
      <main>
        <section className="bg-[var(--brand-soft)] py-16">
          <Prose>
            <h1 className="max-w-3xl text-4xl font-semibold leading-tight text-[var(--ink)]">
              {hero?.headline ?? page?.title ?? config.name}
            </h1>
            {hero?.body ? <p className="mt-4 max-w-2xl text-lg text-[var(--ink-muted)]">{hero.body}</p> : null}
            <Link
              href="/cotizar"
              data-testid="primary-cta"
              className="mt-8 inline-block rounded-[var(--radius)] bg-[var(--brand)] px-6 py-3 text-base font-medium text-[var(--brand-ink)]"
            >
              Obtener cotizaciones
            </Link>
            <p className="mt-3 text-sm text-[var(--ink-muted)]">Gratis para ti. Sin compromiso.</p>
          </Prose>
        </section>

        {bullets && bullets.length > 0 ? (
          <section className="py-12">
            <Prose>
              <ul className="grid gap-4 sm:grid-cols-3">
                {bullets.map((item) => (
                  <li
                    key={item}
                    className="rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface-muted)] p-5 text-[var(--ink)]"
                  >
                    {item}
                  </li>
                ))}
              </ul>
            </Prose>
          </section>
        ) : null}

        {faq && faq.length > 0 ? (
          <section className="py-12">
            <Prose>
              <h2 className="text-2xl font-semibold">Preguntas frecuentes</h2>
              <dl className="mt-6 space-y-6">
                {faq.map((item) => (
                  <div key={item.q}>
                    <dt className="font-medium text-[var(--ink)]">{item.q}</dt>
                    <dd className="mt-1 text-[var(--ink-muted)]">{item.a}</dd>
                  </div>
                ))}
              </dl>
            </Prose>
          </section>
        ) : null}
      </main>
      <SiteFooter config={config} />
    </>
  );
}
