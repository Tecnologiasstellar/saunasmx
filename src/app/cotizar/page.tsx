import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getDb } from '@/modules/database/client';
import { getPublicProfile } from '@/modules/directory/queries';
import { consentStep } from '@/modules/forms-engine/intake-schema';
import { QuestionnaireForm } from '@/modules/forms-engine/questionnaire-form';
import { getMarketplaceId } from '@/modules/marketplace-config/publish';
import { resolveRequestHost } from '@/modules/site/context';
import { Container } from '@/modules/ui/primitives';
import { SiteFooter, SiteHeader } from '@/modules/ui/site-chrome';

export const metadata: Metadata = {
  title: 'Cuéntanos tu proyecto',
  // The questionnaire is a funnel step, not a landing page.
  robots: { index: false, follow: true },
};

export default async function QuestionnairePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const resolution = await resolveRequestHost();
  if (resolution.kind === 'unknown') notFound();
  const config = resolution.config;

  const consent = consentStep(config.questionnaire);
  const params = await searchParams;

  const one = (key: string) => {
    const raw = params[key];
    const first = Array.isArray(raw) ? raw[0] : raw;
    return first && first.length > 0 ? first : undefined;
  };

  // Only a well-formed five-digit code survives; anything else is dropped
  // rather than echoed into the form. The API validates it again on submit.
  const cp = one('cp');
  const initialPostalCode = cp && /^\d{5}$/.test(cp) ? cp : '';

  // `?proveedor=` is resolved against a published profile before it is shown or
  // submitted. An unknown or unpublished slug is dropped silently: echoing it
  // back would let a crafted link put arbitrary text on our page, and passing
  // it on would record a preference for a provider that does not exist.
  const requested = one('proveedor');
  const db = await getDb();
  const provider = requested
    ? await getPublicProfile(db, await getMarketplaceId(db, config.slug), 'provider', requested)
    : null;

  return (
    <>
      <SiteHeader config={config} />
      <main className="bg-[var(--canvas)]">
        {provider ? (
          <Container className="pt-8">
            <div
              className="flex flex-wrap items-center justify-between gap-3 rounded-[var(--radius-card)] border border-[var(--border)] bg-[var(--surface)] px-5 py-4"
              data-testid="selected-provider"
            >
              <p className="text-sm text-[var(--ink-muted)]">
                Proveedor seleccionado:{' '}
                <Link
                  href={`/proveedores/${provider.slug}`}
                  className="font-semibold text-[var(--ink)] hover:underline"
                >
                  {provider.name}
                </Link>
              </p>
              <Link href="/proveedores" className="text-sm font-semibold text-[var(--brand)] hover:underline">
                Cambiar proveedor
              </Link>
            </div>
            {/* Said before the form, not after it: we route on eligibility, and
                a visitor should not finish the questionnaire believing they
                have already chosen who contacts them. */}
            <p className="mt-3 max-w-2xl text-xs leading-relaxed text-[var(--ink-subtle)]">
              Lo tomamos en cuenta al revisar tu proyecto. Confirmamos cobertura y disponibilidad antes de compartir tus
              datos, así que podríamos proponerte otro proveedor.
            </p>
          </Container>
        ) : null}

        <QuestionnaireForm
          questionnaire={config.questionnaire}
          marketplaceSlug={config.slug}
          consentLabel={consent?.label ?? 'Acepto que se compartan mis datos con proveedores relevantes.'}
          initialPostalCode={initialPostalCode}
          preferredProviderSlug={provider?.slug}
        />
      </main>
      <SiteFooter config={config} />
    </>
  );
}
