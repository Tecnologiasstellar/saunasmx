import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getDb } from '@/modules/database/client';
import { serviceLabel, serviceLabels } from '@/modules/marketplace-config/labels';
import { getMarketplaceId } from '@/modules/marketplace-config/publish';
import {
  countPublicProviders,
  getProviderFacets,
  listPublicProviders,
  type PublicProviderFilters,
} from '@/modules/provider/public-queries';
import { isProduction, resolveRequestHost } from '@/modules/site/context';
import { Card, Container, Eyebrow, buttonClass } from '@/modules/ui/primitives';
import { SiteFooter, SiteHeader } from '@/modules/ui/site-chrome';
import { SupplierCard } from '@/modules/ui/supplier-card';

/**
 * Public provider directory.
 *
 * Filters are a plain GET form: no client component, no JavaScript, and every
 * control maps to a column that exists. The reference design's wood, delivery
 * time and warranty filters are not implemented, because the database stores
 * none of those — shipping them as decoration would be a nonfunctional control.
 *
 * Indexing is earned, not assumed: the route is only indexable in production,
 * on a marketplace that allows indexing, once it actually has the two approved
 * providers its SEO eligibility policy requires.
 */

const MIN_PROVIDERS_TO_INDEX = 2;

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function one(params: Record<string, string | string[] | undefined>, key: string): string | undefined {
  const value = params[key];
  const first = Array.isArray(value) ? value[0] : value;
  return first && first.length > 0 ? first : undefined;
}

export async function generateMetadata({ searchParams }: { searchParams: SearchParams }): Promise<Metadata> {
  const resolution = await resolveRequestHost();
  if (resolution.kind === 'unknown') return { title: 'Directorio', robots: { index: false, follow: false } };

  const db = await getDb();
  const total = await countPublicProviders(db, await getMarketplaceId(db, resolution.config.slug));

  const eligible = isProduction() && resolution.config.seo.defaultIndexing && total >= MIN_PROVIDERS_TO_INDEX;
  // A filtered view is a slice of the same list; it must not compete with the
  // canonical directory in search results.
  const filtered = !!(one(await searchParams, 'region') ?? one(await searchParams, 'servicio'));

  return {
    title: 'Directorio de proveedores',
    description: `Proveedores aprobados en ${resolution.config.name}, con la cobertura y los servicios que cada uno declaró.`,
    alternates: { canonical: '/directorio' },
    robots: { index: eligible && !filtered, follow: true },
  };
}

export default async function DirectoryPage({ searchParams }: { searchParams: SearchParams }) {
  const resolution = await resolveRequestHost();
  if (resolution.kind === 'unknown') notFound();
  const config = resolution.config;

  const params = await searchParams;
  const db = await getDb();
  const marketplaceId = await getMarketplaceId(db, config.slug);

  const facets = await getProviderFacets(db, marketplaceId);

  // Only a value the marketplace actually has survives, so a hand-typed query
  // string cannot make the form show a filter that matches nothing.
  const region = facets.regions.includes(one(params, 'region') ?? '') ? one(params, 'region') : undefined;
  const service = facets.services.includes(one(params, 'servicio') ?? '') ? one(params, 'servicio') : undefined;
  const sort: PublicProviderFilters['sort'] = one(params, 'orden') === 'recientes' ? 'recent' : 'name';

  const providers = await listPublicProviders(db, marketplaceId, { region, service, sort });
  const labels = serviceLabels(config);
  const filtering = !!(region ?? service);

  const filterGroup = 'mb-8 last:mb-0';
  const filterTitle = 'mb-4 text-[0.6875rem] font-bold uppercase tracking-[0.1em] text-[var(--ink-subtle)]';
  const filterRow = 'flex items-center gap-2.5 py-1 text-sm text-[var(--ink)] cursor-pointer';

  const filters = (
    <>
      {facets.regions.length > 0 ? (
        <fieldset className={`border-0 p-0 ${filterGroup}`}>
          <legend className={filterTitle}>Cobertura declarada</legend>
          <label className={filterRow}>
            <input type="radio" name="region" value="" defaultChecked={!region} className="accent-[var(--brand)]" />
            Todas
          </label>
          {facets.regions.map((value) => (
            <label key={value} className={filterRow}>
              <input
                type="radio"
                name="region"
                value={value}
                defaultChecked={region === value}
                className="accent-[var(--brand)]"
              />
              {value}
            </label>
          ))}
        </fieldset>
      ) : null}

      {facets.services.length > 0 ? (
        <fieldset className={`border-0 p-0 ${filterGroup}`}>
          <legend className={filterTitle}>Servicio</legend>
          <label className={filterRow}>
            <input type="radio" name="servicio" value="" defaultChecked={!service} className="accent-[var(--brand)]" />
            Todos
          </label>
          {facets.services.map((value) => (
            <label key={value} className={filterRow}>
              <input
                type="radio"
                name="servicio"
                value={value}
                defaultChecked={service === value}
                className="accent-[var(--brand)]"
              />
              {serviceLabel(labels, value)}
            </label>
          ))}
        </fieldset>
      ) : null}

      <div className={filterGroup}>
        <label className={filterTitle} htmlFor="orden">
          Orden
        </label>
        <select
          id="orden"
          name="orden"
          defaultValue={sort === 'recent' ? 'recientes' : 'nombre'}
          className="w-full rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] px-3.5 py-2.5 text-sm text-[var(--ink)]"
        >
          <option value="nombre">Nombre (A–Z)</option>
          <option value="recientes">Alta más reciente</option>
        </select>
      </div>

      <div className="flex flex-wrap gap-3">
        <button type="submit" className={buttonClass('primary', 'px-5 py-2.5')} data-testid="apply-filters">
          Aplicar
        </button>
        {filtering ? (
          <a href="/directorio" className={buttonClass('quiet', 'px-5 py-2.5')}>
            Limpiar
          </a>
        ) : null}
      </div>
    </>
  );

  return (
    <>
      <SiteHeader config={config} />

      <main>
        <div className="border-b border-[var(--border)] py-12 md:py-14">
          <Container>
            <Eyebrow>Marketplace de proveedores</Eyebrow>
            <h1 className="mt-3 text-[clamp(2rem,5.5vw,3rem)] font-medium leading-[1.1] tracking-[-0.01em] text-[var(--ink)]">
              Directorio de proveedores
            </h1>
            <p className="mt-3 max-w-[640px] text-base leading-relaxed text-[var(--ink-muted)]">
              Proveedores aprobados en {config.name}. La cobertura y los servicios que ves aquí son los que cada
              proveedor declaró; no publicamos calificaciones, tiempos de entrega ni garantías porque todavía no los
              medimos.
            </p>
          </Container>
        </div>

        <Container className="py-10">
          <form method="get" action="/directorio" className="grid items-start gap-8 lg:grid-cols-[260px_1fr] lg:gap-12">
            {/* Filters: a disclosure on phones, a sticky rail from lg up. */}
            <details
              open
              className="filter-disclosure rounded-[var(--radius-card)] border border-[var(--border)] bg-[var(--surface)] p-5 lg:sticky lg:top-24 lg:rounded-none lg:border-0 lg:border-r lg:border-[var(--border)] lg:bg-transparent lg:p-0 lg:pr-8 lg:pt-2"
            >
              <summary className="cursor-pointer list-none text-sm font-semibold text-[var(--ink)]">
                Filtros{filtering ? ' (activos)' : ''}
              </summary>
              <div className="mt-5 lg:mt-0">{filters}</div>
            </details>

            <section aria-label="Resultados">
              <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
                <p className="text-sm text-[var(--ink-muted)]" data-testid="result-count">
                  {providers.length}{' '}
                  {providers.length === 1 ? 'proveedor aprobado' : 'proveedores aprobados'}
                  {filtering ? ' con estos filtros' : ''}
                </p>
              </div>

              {providers.length > 0 ? (
                <ul className="grid list-none gap-6 p-0 sm:grid-cols-2 xl:grid-cols-3">
                  {providers.map((provider) => (
                    <li key={provider.id} className="flex">
                      <SupplierCard provider={provider} serviceLabels={labels} />
                    </li>
                  ))}
                </ul>
              ) : (
                <Card className="max-w-xl">
                  <h2 className="text-lg font-semibold">
                    {filtering ? 'Ningún proveedor coincide con estos filtros' : 'Todavía no hay proveedores publicados'}
                  </h2>
                  <p className="mt-2 text-[var(--ink-muted)]">
                    {filtering
                      ? 'Prueba con menos filtros, o cuéntanos tu proyecto y lo revisamos igual.'
                      : 'Estamos dando de alta a los primeros proveedores. Puedes enviar tu proyecto de todas formas.'}
                  </p>
                  <a href="/cotizar" className={buttonClass('primary', 'mt-6')}>
                    Cuéntanos tu proyecto
                  </a>
                </Card>
              )}
            </section>
          </form>
        </Container>
      </main>

      <SiteFooter config={config} />
    </>
  );
}
