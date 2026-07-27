import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { consentStep } from '@/modules/forms-engine/intake-schema';
import { QuestionnaireForm } from '@/modules/forms-engine/questionnaire-form';
import { resolveRequestHost } from '@/modules/site/context';
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

  // Only a well-formed five-digit code survives; anything else is dropped
  // rather than echoed into the form. The API validates it again on submit.
  const cp = (await searchParams).cp;
  const candidate = Array.isArray(cp) ? cp[0] : cp;
  const initialPostalCode = candidate && /^\d{5}$/.test(candidate) ? candidate : '';

  return (
    <>
      <SiteHeader config={config} />
      <main className="bg-[var(--canvas)]">
        <QuestionnaireForm
          questionnaire={config.questionnaire}
          marketplaceSlug={config.slug}
          consentLabel={consent?.label ?? 'Acepto que se compartan mis datos con proveedores relevantes.'}
          initialPostalCode={initialPostalCode}
        />
      </main>
      <SiteFooter config={config} />
    </>
  );
}
