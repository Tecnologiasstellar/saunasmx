import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import {
  loadProfile,
  metaDescription,
  profileJsonLd,
  profileTitle,
  siteOrigin,
} from '@/modules/directory/page-data';
import { isProduction, resolveRequestHost } from '@/modules/site/context';
import { DirectoryProfilePage } from '@/modules/ui/directory-profile';
import { SiteFooter, SiteHeader } from '@/modules/ui/site-chrome';

/**
 * A single sauna manufacturer or installer. Same component as a venue profile;
 * the call to action differs because the data does — a provider's is the
 * internal quote route, which is where consent is captured.
 */

type Params = Promise<{ slug: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const data = await loadProfile('provider', (await params).slug);
  if (!data) return { title: 'Proveedor no encontrado', robots: { index: false, follow: false } };

  const canIndex = isProduction() && data.config.seo.defaultIndexing;

  return {
    title: profileTitle(data.profile),
    description: metaDescription(data.profile),
    alternates: { canonical: data.profile.href },
    robots: { index: canIndex, follow: canIndex },
    openGraph: {
      type: 'website',
      title: data.profile.name,
      description: metaDescription(data.profile),
      url: `${await siteOrigin()}${data.profile.href}`,
    },
  };
}

export default async function ProviderProfile({ params }: { params: Params }) {
  const resolution = await resolveRequestHost();
  if (resolution.kind === 'unknown') notFound();

  const data = await loadProfile('provider', (await params).slug);
  if (!data) notFound();

  const jsonLd = profileJsonLd(data.profile, await siteOrigin());

  return (
    <>
      <SiteHeader config={data.config} />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, '\\u003c') }}
      />
      <DirectoryProfilePage profile={data.profile} related={data.related} indexLabel="Proveedores" />
      <SiteFooter config={data.config} />
    </>
  );
}
