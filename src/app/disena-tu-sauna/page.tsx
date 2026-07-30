import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { ConfiguratorForm } from '@/modules/configurator/configurator-form';
import { resolveRequestHost } from '@/modules/site/context';
import { SiteFooter, SiteHeader } from '@/modules/ui/site-chrome';

export const metadata: Metadata = {
  title: 'Diseña tu sauna',
  // Soft-launched: not linked from nav yet, and a visual pre-questionnaire is
  // not the page we want ranking on its own.
  robots: { index: false, follow: true },
};

export default async function ConfiguratorPage() {
  const resolution = await resolveRequestHost();
  if (resolution.kind === 'unknown') notFound();
  const config = resolution.config;

  // Only a marketplace that opted into `configurator` in marketplace.yaml gets
  // this page — pergolas-mx has none today, and 404 is correct for it.
  if (!config.configurator) notFound();

  return (
    <>
      <SiteHeader config={config} />
      <main className="bg-[var(--canvas)]">
        <ConfiguratorForm configurator={config.configurator} marketplaceSlug={config.slug} />
      </main>
      <SiteFooter config={config} />
    </>
  );
}
