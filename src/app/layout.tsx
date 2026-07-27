import type { Metadata } from 'next';

import './globals.css';
import { canonicalOrigin, isProduction, resolveRequestHost } from '@/modules/site/context';
import { themeStyle } from '@/modules/ui/themes';

export async function generateMetadata(): Promise<Metadata> {
  const resolution = await resolveRequestHost();
  if (resolution.kind === 'unknown') {
    return { title: 'Sitio no disponible', robots: { index: false, follow: false } };
  }

  const config = resolution.config;
  // Indexing is only ever allowed in production, whatever the config says.
  const indexable = isProduction() && config.seo.defaultIndexing;

  return {
    metadataBase: new URL(canonicalOrigin(config)),
    title: { default: config.name, template: `%s · ${config.name}` },
    alternates: { canonical: '/' },
    robots: { index: indexable, follow: indexable },
    openGraph: { siteName: config.name, locale: config.localization.locale, type: 'website' },
  };
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const resolution = await resolveRequestHost();

  // An unconfigured host is normally answered with a 404 by src/proxy.ts. This
  // is the defence in depth for any path that bypasses it: render a neutral
  // shell rather than falling back to some tenant's branding. `notFound()` is
  // not available in a root layout.
  if (resolution.kind === 'unknown') {
    return (
      <html lang="es">
        <body className="min-h-screen antialiased">
          <main className="mx-auto max-w-xl px-6 py-16 text-center">
            <h1 className="text-xl font-semibold">Sitio no disponible</h1>
            <p className="mt-2">Este dominio no está configurado.</p>
          </main>
        </body>
      </html>
    );
  }

  const config = resolution.config;

  return (
    <html lang={config.localization.locale} style={themeStyle(config.themeKey)}>
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
