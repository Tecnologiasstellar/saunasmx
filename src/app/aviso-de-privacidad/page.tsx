import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { resolveRequestHost } from '@/modules/site/context';
import { Prose, SiteFooter, SiteHeader } from '@/modules/ui/site-chrome';

export const metadata: Metadata = {
  title: 'Aviso de Privacidad',
};

/**
 * Minimal privacy notice required by the LFPDPPP before collecting name,
 * phone, address and budget from real people. This is a first draft, not a
 * substitute for a lawyer's review once the business grows beyond a small test.
 */
export default async function PrivacyNoticePage() {
  const resolution = await resolveRequestHost();
  if (resolution.kind === 'unknown') notFound();
  const config = resolution.config;

  return (
    <>
      <SiteHeader config={config} />
      <main className="py-16">
        <Prose>
          <h1 className="text-3xl font-semibold">Aviso de Privacidad</h1>
          <p className="mt-2 text-sm text-[var(--ink-muted)]">Última actualización: julio de 2026.</p>

          <h2 className="mt-8 text-xl font-semibold">Responsable</h2>
          <p className="mt-2 max-w-2xl text-[var(--ink-muted)]">
            {config.name} es operado por Alberto Villalpando. Aún no contamos con un domicilio físico registrado para
            atención al público; el contacto es exclusivamente por correo electrónico a{' '}
            <a className="underline" href={`mailto:${config.contact.email}`}>
              {config.contact.email}
            </a>
            .
          </p>

          <h2 className="mt-8 text-xl font-semibold">Datos que recabamos</h2>
          <p className="mt-2 max-w-2xl text-[var(--ink-muted)]">
            Cuando llenas el cuestionario recabamos: nombre, correo electrónico, teléfono, código postal, y las
            respuestas sobre tu proyecto (tipo, capacidad, presupuesto estimado y fecha deseada). No recabamos datos
            financieros, de salud ni ningún dato sensible en los términos de la ley.
          </p>

          <h2 className="mt-8 text-xl font-semibold">Para qué usamos tus datos</h2>
          <p className="mt-2 max-w-2xl text-[var(--ink-muted)]">
            Usamos tus datos únicamente para: (1) contactarte sobre tu proyecto, (2) compartir tu proyecto con hasta
            dos proveedores relevantes que operen en tu zona, para que puedan enviarte una cotización, y (3) mejorar
            el funcionamiento de este sitio. No vendemos tus datos ni los compartimos con nadie fuera de este
            propósito.
          </p>

          <h2 className="mt-8 text-xl font-semibold">Transferencia a proveedores</h2>
          <p className="mt-2 max-w-2xl text-[var(--ink-muted)]">
            Al aceptar el aviso de consentimiento en el cuestionario, autorizas que compartamos tu nombre, contacto y
            los detalles de tu proyecto con los proveedores que asignemos a tu caso, únicamente para que puedan
            responderte con una cotización.
          </p>

          <h2 className="mt-8 text-xl font-semibold">Tus derechos (ARCO)</h2>
          <p className="mt-2 max-w-2xl text-[var(--ink-muted)]">
            Puedes solicitar en cualquier momento el Acceso, Rectificación, Cancelación u Oposición (derechos ARCO) al
            uso de tus datos, así como revocar tu consentimiento o limitar su uso, escribiendo a{' '}
            <a className="underline" href={`mailto:${config.contact.email}`}>
              {config.contact.email}
            </a>
            . Responderemos en un plazo razonable y, salvo que existan registros que debamos conservar por ley,
            eliminaremos o anonimizaremos tus datos.
          </p>

          <h2 className="mt-8 text-xl font-semibold">Cambios a este aviso</h2>
          <p className="mt-2 max-w-2xl text-[var(--ink-muted)]">
            Si cambiamos este aviso de forma relevante, lo publicaremos en esta misma página con una nueva fecha de
            actualización.
          </p>
        </Prose>
      </main>
      <SiteFooter config={config} />
    </>
  );
}
