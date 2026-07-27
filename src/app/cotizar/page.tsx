import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { QuestionnaireForm } from '@/modules/forms-engine/questionnaire-form';
import { consentStep } from '@/modules/forms-engine/intake-schema';
import { resolveRequestHost } from '@/modules/site/context';
import { SiteFooter, SiteHeader } from '@/modules/ui/site-chrome';

export const metadata: Metadata = {
  title: 'Cuéntanos tu proyecto',
  // The questionnaire is a funnel step, not a landing page.
  robots: { index: false, follow: true },
};

export default async function QuestionnairePage() {
  const resolution = await resolveRequestHost();
  if (resolution.kind === 'unknown') notFound();
  const config = resolution.config;

  const consent = consentStep(config.questionnaire);

  return (
    <>
      <SiteHeader config={config} />
      <main>
        <QuestionnaireForm
          questionnaire={config.questionnaire}
          marketplaceSlug={config.slug}
          consentLabel={consent?.label ?? 'Acepto que se compartan mis datos con proveedores relevantes.'}
        />
      </main>
      <SiteFooter config={config} />
    </>
  );
}
