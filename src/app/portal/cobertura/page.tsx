import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireProviderUser } from '@/modules/auth/current-user';
import { getDb } from '@/modules/database/client';
import { getMarketplaceId } from '@/modules/marketplace-config/publish';
import { CoverageForm } from '@/modules/provider/coverage-form';
import { allowedServiceOptions, listCompanyCoverage } from '@/modules/provider/coverage';
import { resolveRequestHost } from '@/modules/site/context';

export const metadata = { title: 'Mi cobertura', robots: { index: false, follow: false } };

const STATUS_LABELS: Record<string, string> = {
  pending: 'En revisión',
  approved: 'Aprobado',
  paused: 'En pausa',
  rejected: 'Rechazado',
  suspended: 'Suspendido',
};

export default async function ProviderCoverage() {
  const session = await requireProviderUser('/portal/cobertura');
  const resolution = await resolveRequestHost();
  if (resolution.kind === 'unknown') notFound();

  const db = await getDb();
  const marketplaceId = await getMarketplaceId(db, resolution.config.slug);
  const companies = await listCompanyCoverage(db, session, marketplaceId);
  const serviceOptions = allowedServiceOptions(resolution.config);

  return (
    <main className="mx-auto max-w-4xl px-6 py-10">
      <h1 className="text-2xl font-semibold">Mi cobertura · {resolution.config.name}</h1>
      <p className="mt-1 text-sm text-[var(--ink-muted)]">
        Los cambios aplican a los próximos proyectos. Los que ya tienes asignados no se modifican.
      </p>
      <Link className="mt-2 inline-block underline" href="/portal">
        Volver a mis proyectos
      </Link>

      {companies.map((company) => (
        <section key={company.providerCompanyId} className="mt-8 rounded-[var(--radius)] border border-[var(--border)] p-5">
          <h2 className="font-semibold" data-testid={`coverage-company-${company.providerCompanyId}`}>
            {company.displayName}
          </h2>
          <p className="text-sm text-[var(--ink-muted)]">{STATUS_LABELS[company.status] ?? company.status}</p>

          {company.editable ? (
            <CoverageForm
              providerCompanyId={company.providerCompanyId}
              serviceOptions={serviceOptions}
              coverage={company.coverage}
              currency={resolution.config.localization.currency}
            />
          ) : (
            <div className="mt-4 space-y-1 text-sm" data-testid="coverage-readonly">
              <p>
                Servicios: {company.coverage.services.map((service) => service.serviceKey).join(', ') || 'ninguno'}
              </p>
              <p>Códigos postales: {company.coverage.postalPrefixes.join(', ') || 'ninguno'}</p>
              <p className="text-[var(--ink-muted)]">
                Solo el titular de la cuenta puede editar la cobertura, y únicamente mientras la cuenta está activa.
              </p>
            </div>
          )}
        </section>
      ))}

      {companies.length === 0 ? (
        <p className="mt-8 text-[var(--ink-muted)]">Tu empresa todavía no participa en este marketplace.</p>
      ) : null}
    </main>
  );
}
