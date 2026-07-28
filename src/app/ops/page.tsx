import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireOperator } from '@/modules/auth/current-user';
import { getDb } from '@/modules/database/client';
import { getMarketplaceId } from '@/modules/marketplace-config/publish';
import { listLeads, listOutboxProblems } from '@/modules/ops/queries';
import { resolveRequestHost } from '@/modules/site/context';

export const metadata = { title: 'Bandeja de proyectos', robots: { index: false, follow: false } };

const STATUS_LABELS: Record<string, string> = {
  created: 'Nuevo',
  review_required: 'Por revisar',
  ready_for_matching: 'Listo para asignar',
  assigned: 'Asignado',
  contacted: 'Contactado',
  quoted: 'Cotizado',
  rejected: 'Descartado',
  won: 'Ganado',
  lost: 'Perdido',
  expired: 'Caducado',
};

export default async function OpsInbox({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  await requireOperator('/ops');
  const resolution = await resolveRequestHost();
  if (resolution.kind === 'unknown') notFound();

  const params = await searchParams;
  const db = await getDb();
  const marketplaceId = await getMarketplaceId(db, resolution.config.slug);
  const leads = await listLeads(db, marketplaceId, { lifecycleStatus: params.status });
  const deadLetters = await listOutboxProblems(db, marketplaceId);

  return (
    <main className="mx-auto max-w-5xl px-6 py-10">
      <h1 className="text-2xl font-semibold">Bandeja · {resolution.config.name}</h1>
      <Link className="mt-2 inline-block underline" data-testid="open-plans" href="/ops/planes">
        Planes y acuerdos
      </Link>
      {resolution.config.features.library ? (
        <Link className="ml-5 mt-2 inline-block underline" href="/ops/biblioteca">
          Biblioteca editorial
        </Link>
      ) : null}

      {deadLetters.length > 0 ? (
        <p className="mt-4 rounded-[var(--radius)] bg-red-50 p-3 text-sm text-red-800">
          {deadLetters.length} evento(s) en cola muerta. Revisa las notificaciones fallidas.
        </p>
      ) : null}

      <nav className="mt-6 flex flex-wrap gap-2 text-sm">
        <Link href="/ops" className="rounded-full border border-[var(--border)] px-3 py-1">
          Todos
        </Link>
        {['review_required', 'ready_for_matching', 'assigned', 'quoted'].map((status) => (
          <Link key={status} href={`/ops?status=${status}`} className="rounded-full border border-[var(--border)] px-3 py-1">
            {STATUS_LABELS[status]}
          </Link>
        ))}
      </nav>

      <table className="mt-6 w-full text-left text-sm">
        <thead className="text-[var(--ink-muted)]">
          <tr>
            <th className="py-2">Creado</th>
            <th>CP</th>
            <th>Servicio</th>
            <th>Estado</th>
            <th>Calificación</th>
            <th>Asignados</th>
            <th />
          </tr>
        </thead>
        <tbody data-testid="lead-rows">
          {leads.map((row) => (
            <tr key={row.leadId} className="border-t border-[var(--border)]">
              <td className="py-2">{row.createdAt.toISOString().slice(0, 16).replace('T', ' ')}</td>
              <td>{row.postalCode ?? '—'}</td>
              <td>{row.serviceKey ?? '—'}</td>
              <td>{STATUS_LABELS[row.lifecycleStatus] ?? row.lifecycleStatus}</td>
              <td>{row.qualificationStatus}</td>
              <td>{row.assignmentCount}</td>
              <td>
                <Link className="underline" href={`/ops/leads/${row.leadId}`} data-testid={`open-lead-${row.leadId}`}>
                  Abrir
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {leads.length === 0 ? <p className="mt-6 text-[var(--ink-muted)]">No hay proyectos con este filtro.</p> : null}
    </main>
  );
}
