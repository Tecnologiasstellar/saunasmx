import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { resolveRequestHost } from '@/modules/site/context';
import { ButtonLink } from '@/modules/ui/primitives';
import { Prose, SiteFooter, SiteHeader } from '@/modules/ui/site-chrome';

export const metadata: Metadata = {
  title: 'Contacto',
};

/**
 * Contact page.
 *
 * There is no contact form on purpose: a form implies an inbox someone watches
 * and a reply time we have not committed to. Until there is a real support
 * process, this page does one honest thing — hands you the address and opens
 * your mail client.
 *
 * It is a page rather than a bare `mailto:` in the nav because a link that
 * launches a mail client with no warning is hostile on a phone, and because a
 * 404-free `/contacto` is what people type and what other sites link to.
 */
export default async function ContactPage() {
  const resolution = await resolveRequestHost();
  if (resolution.kind === 'unknown') notFound();
  const config = resolution.config;
  const { email } = config.contact;

  return (
    <>
      <SiteHeader config={config} />
      <main className="py-16">
        <Prose>
          <h1 className="text-3xl font-semibold">Contacto</h1>
          <p className="mt-4 max-w-2xl leading-relaxed text-[var(--ink-muted)]">
            Escríbenos por correo. Es el único canal que atendemos por ahora, así que llega directo a quien puede
            responderte.
          </p>

          <div className="mt-8 rounded-[var(--radius-panel)] border border-[var(--border)] bg-[var(--surface)] p-8">
            <p className="font-mono text-[0.6875rem] font-bold uppercase tracking-[0.15em] text-[var(--ink-subtle)]">
              Correo
            </p>
            <a
              href={`mailto:${email}`}
              className="mt-2 block break-all text-xl font-semibold text-[var(--brand)] hover:underline"
            >
              {email}
            </a>
            <ButtonLink href={`mailto:${email}`} className="mt-6">
              Escribir un correo
            </ButtonLink>
          </div>

          <h2 className="mt-12 text-xl font-semibold">¿Buscas cotizar un proyecto?</h2>
          <p className="mt-2 max-w-2xl leading-relaxed text-[var(--ink-muted)]">
            El cuestionario es más rápido que un correo: nos das los datos que los proveedores necesitan para
            responderte, y lo revisamos antes de compartirlo con nadie.
          </p>
          <ButtonLink href="/cotizar" variant="outline" className="mt-6">
            Cotizar mi proyecto
          </ButtonLink>

          <h2 className="mt-12 text-xl font-semibold">¿Eres proveedor?</h2>
          <p className="mt-2 max-w-2xl leading-relaxed text-[var(--ink-muted)]">
            Escríbenos al mismo correo con el nombre de tu empresa, las zonas que atiendes y lo que instalas. Damos de
            alta a los proveedores manualmente, uno por uno.
          </p>

          <h2 className="mt-12 text-xl font-semibold">Tus datos</h2>
          <p className="mt-2 max-w-2xl leading-relaxed text-[var(--ink-muted)]">
            Para corregir o eliminar tus datos, escribe al mismo correo. El detalle está en el{' '}
            <a className="underline" href="/aviso-de-privacidad">
              Aviso de Privacidad
            </a>
            .
          </p>
        </Prose>
      </main>
      <SiteFooter config={config} />
    </>
  );
}
