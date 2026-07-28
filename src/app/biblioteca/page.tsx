import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { libraryIndexable, loadLibraryIndex } from '@/modules/library/page-data';
import type { LibraryResourceFormat } from '@/modules/library/types';
import { FORMAT_LABEL, LibraryCard, LibraryHero } from '@/modules/ui/library';
import { Card, Container } from '@/modules/ui/primitives';
import { SiteFooter, SiteHeader } from '@/modules/ui/site-chrome';

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const FILTERS: Array<{ value: LibraryResourceFormat | ''; label: string }> = [
  { value: '', label: 'Todo' },
  ...Object.entries(FORMAT_LABEL).map(([value, label]) => ({ value: value as LibraryResourceFormat, label })),
];

export async function generateMetadata({ searchParams }: { searchParams: SearchParams }): Promise<Metadata> {
  const data = await loadLibraryIndex(await searchParams);
  if (!data) return { title: 'Biblioteca', robots: { index: false, follow: false } };
  return {
    title: 'Biblioteca de sauna y terapia de contraste',
    description: 'Videos, podcasts, libros, artículos e investigación seleccionados desde las cuentas oficiales de sus creadores.',
    alternates: { canonical: '/biblioteca' },
    robots: { index: libraryIndexable(data.config) && !data.query && !data.format, follow: true },
  };
}

export default async function LibraryIndex({ searchParams }: { searchParams: SearchParams }) {
  const data = await loadLibraryIndex(await searchParams);
  if (!data) notFound();

  return (
    <>
      <SiteHeader config={data.config} />
      <main>
        <LibraryHero count={data.resources.length} />

        <Container className="py-10 md:py-14">
          <form action="/biblioteca" className="grid gap-4 rounded-[var(--radius-panel)] border border-[var(--border)] bg-[var(--surface)] p-4 md:grid-cols-[1fr_auto]">
            <label className="sr-only" htmlFor="library-search">Buscar en la biblioteca</label>
            <input
              id="library-search"
              name="q"
              defaultValue={data.query}
              placeholder="Busca un tema, autor o pregunta…"
              className="min-h-12 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--canvas)] px-4 text-base"
            />
            <button className="min-h-12 rounded-[var(--radius)] bg-[var(--brand)] px-7 text-sm font-semibold text-[var(--brand-ink)]">
              Buscar
            </button>
          </form>

          <nav aria-label="Filtrar por formato" className="mt-7 flex flex-wrap gap-2">
            {FILTERS.map((filter) => {
              const active = (data.format ?? '') === filter.value;
              const params = new URLSearchParams();
              if (filter.value) params.set('formato', filter.value);
              if (data.query) params.set('q', data.query);
              return (
                <Link
                  key={filter.value || 'all'}
                  href={`/biblioteca${params.size ? `?${params}` : ''}`}
                  aria-current={active ? 'page' : undefined}
                  className={`rounded-full border px-4 py-2 text-sm ${
                    active
                      ? 'border-[var(--brand)] bg-[var(--brand)] text-[var(--brand-ink)]'
                      : 'border-[var(--border)] bg-[var(--surface)] text-[var(--ink-muted)] hover:border-[var(--brand)]'
                  }`}
                >
                  {filter.label}
                </Link>
              );
            })}
          </nav>

          {data.resources.length === 0 ? (
            <Card className="mt-10 max-w-2xl">
              <h2 className="text-xl font-semibold">No encontramos recursos publicados</h2>
              <p className="mt-2 text-[var(--ink-muted)]">Prueba otra búsqueda o vuelve a ver toda la biblioteca.</p>
              <Link href="/biblioteca" className="mt-5 inline-block font-semibold text-[var(--brand)] underline underline-offset-4">
                Limpiar filtros
              </Link>
            </Card>
          ) : (
            <ul className="mt-10 grid list-none gap-x-7 gap-y-12 p-0 md:grid-cols-2 lg:grid-cols-3">
              {data.resources.map((resource) => <LibraryCard key={resource.id} resource={resource} />)}
            </ul>
          )}
        </Container>
      </main>
      <SiteFooter config={data.config} />
    </>
  );
}

