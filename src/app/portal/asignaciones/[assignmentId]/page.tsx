import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireProviderUser } from '@/modules/auth/current-user';
import { getDb } from '@/modules/database/client';
import { getMarketplaceId } from '@/modules/marketplace-config/publish';
import { PipelineForms, RespondForm } from '@/modules/provider/assignment-actions';
import { getAssignmentDetail } from '@/modules/provider/queries';
import { resolveRequestHost } from '@/modules/site/context';

export const metadata = { title: 'Proyecto asignado', robots: { index: false, follow: false } };

function formatMoney(amountMinor: number, currency: string): string {
  return `${(amountMinor / 100).toLocaleString('es-MX', { minimumFractionDigits: 2 })} ${currency}`;
}

export default async function AssignmentPage({ params }: { params: Promise<{ assignmentId: string }> }) {
  const session = await requireProviderUser('/portal');
  const resolution = await resolveRequestHost();
  if (resolution.kind === 'unknown') notFound();
  const config = resolution.config;

  const { assignmentId } = await params;
  const db = await getDb();
  const marketplaceId = await getMarketplaceId(db, config.slug);

  const detail = await getAssignmentDetail(db, assignmentId, session.providerCompanyIds, marketplaceId);
  // Another company's assignment is indistinguishable from one that does not exist.
  if (!detail) notFound();

  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <Link href="/portal" className="text-sm underline">
        ← Mis proyectos
      </Link>
      <h1 className="mt-3 text-2xl font-semibold">Proyecto en CP {detail.location?.postalCode ?? '—'}</h1>
      <p className="text-[var(--ink-muted)]" data-testid="assignment-status">
        Estado: {detail.status}
        {detail.expiresAt ? ` · responde antes del ${detail.expiresAt.toISOString().slice(0, 16).replace('T', ' ')}` : ''}
      </p>

      <section className="mt-8">
        <h2 className="font-semibold">Detalles del proyecto</h2>
        <dl className="mt-2 grid gap-2 text-sm sm:grid-cols-2">
          {detail.requirements.map((requirement) => (
            <div key={requirement.key} className="flex gap-2">
              <dt className="text-[var(--ink-muted)]">{requirement.key}</dt>
              <dd>{typeof requirement.value === 'string' ? requirement.value : JSON.stringify(requirement.value)}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section className="mt-8">
        <h2 className="font-semibold">Contacto</h2>
        {detail.contact ? (
          <div data-testid="consumer-contact" className="mt-2 text-sm">
            <p>{detail.contact.name}</p>
            <p className="text-[var(--ink-muted)]">{detail.contact.email}</p>
            <p className="text-[var(--ink-muted)]">{detail.contact.phone ?? '—'}</p>
          </div>
        ) : (
          <p className="mt-2 text-sm text-[var(--ink-muted)]" data-testid="contact-hidden">
            Acepta el proyecto para ver los datos de contacto del cliente.
          </p>
        )}
      </section>

      {detail.status === 'assigned' ? (
        <section className="mt-8">
          <h2 className="font-semibold">¿Tomas este proyecto?</h2>
          <div className="mt-3">
            <RespondForm assignmentId={assignmentId} />
          </div>
        </section>
      ) : null}

      {detail.status === 'accepted' ? (
        <PipelineForms assignmentId={assignmentId} currency={config.localization.currency} />
      ) : null}

      {detail.quotes.length > 0 ? (
        <section className="mt-10">
          <h2 className="font-semibold">Cotizaciones</h2>
          <ul className="mt-2 space-y-1 text-sm" data-testid="quotes">
            {detail.quotes.map((quote) => (
              <li key={quote.id}>
                {formatMoney(quote.amountMinor, quote.currency)} · {quote.status} ·{' '}
                {quote.submittedAt.toISOString().slice(0, 10)}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </main>
  );
}
