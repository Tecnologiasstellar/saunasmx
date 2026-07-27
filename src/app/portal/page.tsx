import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireProviderUser } from '@/modules/auth/current-user';
import { getDb } from '@/modules/database/client';
import { getMarketplaceId } from '@/modules/marketplace-config/publish';
import { listAssignments } from '@/modules/provider/queries';
import { resolveRequestHost } from '@/modules/site/context';

export const metadata = { title: 'Mis proyectos', robots: { index: false, follow: false } };

const STATUS_LABELS: Record<string, string> = {
  assigned: 'Por responder',
  accepted: 'Aceptado',
  rejected: 'Rechazado',
  expired: 'Caducado',
  withdrawn: 'Retirado',
};

export default async function ProviderInbox() {
  const session = await requireProviderUser('/portal');
  const resolution = await resolveRequestHost();
  if (resolution.kind === 'unknown') notFound();

  const db = await getDb();
  const marketplaceId = await getMarketplaceId(db, resolution.config.slug);
  // Scoped to this session's companies in SQL, not filtered afterwards.
  const assignments = await listAssignments(db, session.providerCompanyIds, marketplaceId);

  return (
    <main className="mx-auto max-w-4xl px-6 py-10">
      <h1 className="text-2xl font-semibold">Mis proyectos · {resolution.config.name}</h1>
      <p className="mt-1 text-sm text-[var(--ink-muted)]">{session.email}</p>
      <Link className="mt-2 inline-block underline" data-testid="open-coverage" href="/portal/cobertura">
        Editar mi cobertura
      </Link>

      <ul className="mt-8 space-y-3" data-testid="assignment-list">
        {assignments.map((assignment) => (
          <li key={assignment.assignmentId} className="rounded-[var(--radius)] border border-[var(--border)] p-4">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="font-medium">
                  CP {assignment.postalCode ?? '—'} · {assignment.serviceKey ?? 'sin especificar'}
                </p>
                <p className="text-sm text-[var(--ink-muted)]">
                  {STATUS_LABELS[assignment.status] ?? assignment.status} · recibido{' '}
                  {assignment.assignedAt.toISOString().slice(0, 16).replace('T', ' ')}
                </p>
              </div>
              <Link
                className="underline"
                data-testid={`open-assignment-${assignment.assignmentId}`}
                href={`/portal/asignaciones/${assignment.assignmentId}`}
              >
                Ver
              </Link>
            </div>
          </li>
        ))}
      </ul>

      {assignments.length === 0 ? (
        <p className="mt-8 text-[var(--ink-muted)]">Todavía no tienes proyectos asignados en este marketplace.</p>
      ) : null}
    </main>
  );
}
