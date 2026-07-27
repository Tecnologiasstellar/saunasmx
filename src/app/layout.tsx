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
      <head>
        {/*
          Webfonts are requested by the browser, never by the build: `next/font`
          would fetch Google Fonts during `next build` and turn a network blip
          into a failed deploy. `display=swap` plus the serif/sans fallbacks in
          the theme tokens means a blocked request costs typography, not text.
        */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        {/* eslint-disable-next-line @next/next/no-page-custom-font -- the rule
            targets the Pages Router's per-page <Head>; this is the App Router
            root layout, so the stylesheet is added once for the whole app. */}
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@500;600&family=Plus+Jakarta+Sans:wght@400;500;600;700&display=swap"
        />
      </head>
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
