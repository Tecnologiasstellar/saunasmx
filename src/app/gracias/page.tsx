import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { resolveRequestHost } from '@/modules/site/context';
import { Prose, SiteFooter, SiteHeader } from '@/modules/ui/site-chrome';

export const metadata: Metadata = {
  title: 'Recibimos tu proyecto',
  robots: { index: false, follow: false },
};

/**
 * Confirmation page.
 *
 * Deliberately says nothing about qualification, spam scoring or which
 * providers will be contacted — that information is not the consumer's to
 * receive at this point, and it must not leak routing logic.
 */
export default async function ThanksPage() {
  const resolution = await resolveRequestHost();
  if (resolution.kind === 'unknown') notFound();
  const config = resolution.config;

  return (
    <>
      <SiteHeader config={config} />
      <main className="py-16">
        <Prose>
          <h1 className="text-3xl font-semibold" data-testid="confirmation">
            Recibimos tu proyecto
          </h1>
          <p className="mt-4 max-w-xl text-[var(--ink-muted)]">
            Lo revisamos y te contactamos con hasta dos proveedores que trabajen en tu zona. Si necesitamos algún dato
            más, te escribimos al correo que nos diste.
          </p>
          <p className="mt-4 max-w-xl text-[var(--ink-muted)]">
            Compartimos tus datos únicamente con los proveedores asignados a este proyecto.
          </p>
          <Link href="/" className="mt-8 inline-block underline">
            Volver al inicio
          </Link>
        </Prose>
      </main>
      <SiteFooter config={config} />
    </>
  );
}
