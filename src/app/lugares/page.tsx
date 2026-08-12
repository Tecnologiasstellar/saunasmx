import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { indexable, loadIndex, siteOrigin } from '@/modules/directory/page-data';
import { JsonLd, itemListJsonLd } from '@/modules/seo/json-ld';
import { DirectoryIndexPage } from '@/modules/ui/directory-profile';
import { SiteFooter, SiteHeader } from '@/modules/ui/site-chrome';

/** Public index of places you can take a sauna. See src/modules/directory/page-data.ts. */

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export async function generateMetadata({ searchParams }: { searchParams: SearchParams }): Promise<Metadata> {
  const data = await loadIndex('place', await searchParams);
  if (!data) return { title: 'Lugares para sauna', robots: { index: false, follow: false } };

  const eligible = indexable(data.config, data.total);

  return {
    title: data.activeState ? `Lugares para sauna en ${data.activeState}` : 'Lugares para sauna en México',
    description:
      'Estudios de contraste, casas de baños, spas de hotel y clubes con sauna en México, con su modelo de acceso y lo que cada uno publica sobre precios.',
    alternates: { canonical: '/lugares' },
    // A state view is a slice of the same list; it must not compete with the
    // canonical index in search results.
    robots: { index: eligible && !data.activeState, follow: true },
  };
}

export default async function PlacesIndex({ searchParams }: { searchParams: SearchParams }) {
  const data = await loadIndex('place', await searchParams);
  if (!data) notFound();

  return (
    <>
      <SiteHeader config={data.config} />
      <JsonLd
        data={itemListJsonLd({
          origin: await siteOrigin(),
          path: '/lugares',
          name: data.activeState ? `Lugares para sauna en ${data.activeState}` : 'Lugares para sauna en México',
          items: data.profiles,
        })}
      />
      <DirectoryIndexPage
        eyebrow="Directorio"
        title="Lugares para sauna en México"
        lead="Estudios de terapia de contraste, casas de baños, spas de hotel, clubes y saunas móviles con evidencia pública de sauna. Cada perfil dice cómo se entra y qué precio publica el lugar; la reserva se hace en su propio sitio."
        basePath="/lugares"
        states={data.states}
        activeState={data.activeState}
        profiles={data.profiles}
        emptyMessage="Todavía no publicamos lugares en este estado. Revisa el resto del país o cuéntanos de uno que falte."
      />
      <SiteFooter config={data.config} />
    </>
  );
}
