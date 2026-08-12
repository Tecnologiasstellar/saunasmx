import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { indexable, loadIndex, siteOrigin } from '@/modules/directory/page-data';
import { JsonLd, itemListJsonLd } from '@/modules/seo/json-ld';
import { DirectoryIndexPage } from '@/modules/ui/directory-profile';
import { SiteFooter, SiteHeader } from '@/modules/ui/site-chrome';

/** Public index of sauna manufacturers and installers. See src/modules/directory/page-data.ts. */

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export async function generateMetadata({ searchParams }: { searchParams: SearchParams }): Promise<Metadata> {
  const data = await loadIndex('provider', await searchParams);
  if (!data) return { title: 'Proveedores de saunas', robots: { index: false, follow: false } };

  const eligible = indexable(data.config, data.total);

  return {
    title: data.activeState ? `Proveedores de saunas en ${data.activeState}` : 'Proveedores de saunas en México',
    description:
      'Fabricantes e instaladores de saunas a la medida en México, con la cobertura, los servicios y el tipo de calentador que cada uno declara públicamente.',
    alternates: { canonical: '/proveedores' },
    robots: { index: eligible && !data.activeState, follow: true },
  };
}

export default async function ProvidersIndex({ searchParams }: { searchParams: SearchParams }) {
  const data = await loadIndex('provider', await searchParams);
  if (!data) notFound();

  return (
    <>
      <SiteHeader config={data.config} />
      <JsonLd
        data={itemListJsonLd({
          origin: await siteOrigin(),
          path: '/proveedores',
          name: data.activeState
            ? `Proveedores de saunas en ${data.activeState}`
            : 'Proveedores de saunas en México',
          items: data.profiles,
        })}
      />
      <DirectoryIndexPage
        eyebrow="Directorio"
        title="Proveedores de saunas en México"
        lead="Fabricantes e instaladores que construyen saunas a la medida. Cada perfil resume lo que el proveedor declara públicamente sobre cobertura, servicios y calentador, y dice cuándo un dato está sin confirmar."
        basePath="/proveedores"
        states={data.states}
        activeState={data.activeState}
        profiles={data.profiles}
        emptyMessage="Todavía no publicamos proveedores en este estado. Revisa el resto del país o cuéntanos tu proyecto y lo evaluamos igual."
      />
      <SiteFooter config={data.config} />
    </>
  );
}
