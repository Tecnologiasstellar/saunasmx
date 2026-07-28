import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { resolveRequestHost } from '@/modules/site/context';
import { ButtonLink, Container, Eyebrow } from '@/modules/ui/primitives';
import { SiteFooter, SiteHeader } from '@/modules/ui/site-chrome';

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
      <main className="py-16 md:py-24">
        <Container>
          <div className="mx-auto max-w-2xl rounded-[var(--radius-panel)] border border-[var(--border)] bg-[var(--surface)] p-8 shadow-[var(--shadow)] md:p-12">
            <Eyebrow>Proyecto recibido</Eyebrow>
            <h1
              className="mt-4 text-[clamp(1.875rem,5vw,2.75rem)] font-medium leading-tight text-[var(--ink)]"
              data-testid="confirmation"
            >
              Recibimos tu proyecto
            </h1>
            <p className="mt-5 text-lg leading-relaxed text-[var(--ink-muted)]">
              Lo revisamos y te contactamos con hasta dos proveedores que trabajen en tu zona. Si necesitamos algún dato
              más, te escribimos al correo que nos diste.
            </p>
            <p className="mt-4 leading-relaxed text-[var(--ink-muted)]">
              Compartimos tus datos únicamente con los proveedores asignados a este proyecto.
            </p>

            <div className="mt-9 flex flex-wrap gap-4">
              <ButtonLink href="/">Volver al inicio</ButtonLink>
              <ButtonLink href="/proveedores" variant="quiet">
                Ver el directorio
              </ButtonLink>
            </div>
          </div>
        </Container>
      </main>
      <SiteFooter config={config} />
    </>
  );
}
