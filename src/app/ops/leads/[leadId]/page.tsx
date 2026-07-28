import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireOperator } from '@/modules/auth/current-user';
import { getDb } from '@/modules/database/client';
import { getMarketplaceId } from '@/modules/marketplace-config/publish';
import { rankProvidersForLead } from '@/modules/matching-engine/assign';
import { confirmLeadContactAction, discardLeadAction, markLeadUnreachableAction, qualifyLeadAction } from '@/modules/ops/actions';
import { AssignForm } from '@/modules/ops/assign-form';
import { getLeadDetail } from '@/modules/ops/queries';
import { resolveRequestHost } from '@/modules/site/context';

export const metadata = { title: 'Proyecto', robots: { index: false, follow: false } };

export default async function LeadDetailPage({ params }: { params: Promise<{ leadId: string }> }) {
  await requireOperator('/ops');
  const resolution = await resolveRequestHost();
  if (resolution.kind === 'unknown') notFound();
  const config = resolution.config;

  const { leadId } = await params;
  const db = await getDb();
  const marketplaceId = await getMarketplaceId(db, config.slug);

  const detail = await getLeadDetail(db, marketplaceId, leadId);
  if (!detail) notFound();

  const ranked = await rankProvidersForLead(db, { leadId, config, marketplaceId });
  const canAssign = ['ready_for_matching', 'assigned'].includes(detail.lifecycleStatus) && detail.leadGrade !== 'C';
  const isVerifiedA = detail.leadGrade === 'A' && detail.contactValidationStatus === 'contact_confirmed';

  return (
    <main className="mx-auto max-w-4xl px-6 py-10">
      <Link href="/ops" className="text-sm underline">
        ← Bandeja
      </Link>
      <h1 className="mt-3 text-2xl font-semibold">Proyecto {detail.projectId.slice(0, 8)}</h1>
      <p className="text-[var(--ink-muted)]">
        {detail.lifecycleStatus} · calificación: <span data-testid="qualification">{detail.qualificationStatus}</span>
      </p>

      {detail.leadGrade ? (
        <section className="mt-6 rounded-[var(--radius)] border border-[var(--border)] p-4" data-testid="lead-grade">
          <p className="font-semibold">
            Lead {detail.leadGrade}
            {isVerifiedA ? <span className="ml-2 text-sm font-normal text-[var(--ink-muted)]">(A verificado)</span> : null}
            {detail.leadScore !== null ? <span className="ml-2 text-sm font-normal text-[var(--ink-muted)]">score {detail.leadScore}</span> : null}
          </p>
          <p className="mt-1 text-sm text-[var(--ink-muted)]">
            Validación de contacto: <span data-testid="contact-validation-status">{detail.contactValidationStatus}</span>
          </p>
          {detail.leadScoreReasons ? (
            <ul className="mt-2 list-disc pl-6 text-sm text-[var(--ink-muted)]">
              {detail.leadScoreReasons.map((reason, index) => (
                <li key={index}>{reason}</li>
              ))}
            </ul>
          ) : null}
          {detail.contactValidationStatus === 'pending_contact' ? (
            <div className="mt-3 flex flex-wrap gap-3">
              <form action={confirmLeadContactAction}>
                <input type="hidden" name="leadId" value={leadId} />
                <button
                  type="submit"
                  data-testid="confirm-contact"
                  className="rounded-[var(--radius)] bg-[var(--brand)] px-4 py-2 text-sm font-medium text-[var(--brand-ink)]"
                >
                  Confirmar contacto
                </button>
              </form>
              <form action={markLeadUnreachableAction}>
                <input type="hidden" name="leadId" value={leadId} />
                <button type="submit" data-testid="mark-unreachable" className="rounded-[var(--radius)] border border-[var(--border)] px-4 py-2 text-sm">
                  No localizable
                </button>
              </form>
            </div>
          ) : null}
        </section>
      ) : null}

      <section className="mt-8 grid gap-6 sm:grid-cols-2">
        <div>
          <h2 className="font-semibold">Contacto</h2>
          <p className="text-sm">{detail.consumer.name}</p>
          <p className="text-sm text-[var(--ink-muted)]">{detail.consumer.email}</p>
          <p className="text-sm text-[var(--ink-muted)]">{detail.consumer.phone ?? '—'}</p>
        </div>
        <div>
          <h2 className="font-semibold">Ubicación</h2>
          <p className="text-sm">CP {detail.location?.postalCode ?? '—'}</p>
          <p className="text-sm text-[var(--ink-muted)]">{detail.location?.city ?? ''}</p>
          {detail.location?.streetAddress ? (
            <p className="text-sm text-[var(--ink-muted)]" data-testid="street-address">
              {detail.location.streetAddress}
            </p>
          ) : null}
        </div>
      </section>

      <section className="mt-8">
        <h2 className="font-semibold">Requisitos</h2>
        <dl className="mt-2 grid gap-2 text-sm sm:grid-cols-2">
          {detail.requirements.map((requirement) => (
            <div key={`${requirement.key}-${requirement.source}`} className="flex gap-2">
              <dt className="text-[var(--ink-muted)]">{requirement.key}</dt>
              <dd>{typeof requirement.value === 'string' ? requirement.value : JSON.stringify(requirement.value)}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section className="mt-8">
        <h2 className="font-semibold">Consentimiento</h2>
        <ul className="mt-2 space-y-1 text-sm">
          {detail.consents.map((consent) => (
            <li key={consent.purpose}>
              {consent.purpose}: {consent.granted ? 'otorgado' : 'no otorgado'} · {consent.policyVersion} ·{' '}
              {consent.capturedAt.toISOString()}
            </li>
          ))}
        </ul>
      </section>

      {detail.lifecycleStatus === 'review_required' ? (
        <section className="mt-8 flex flex-wrap gap-3">
          <form action={qualifyLeadAction}>
            <input type="hidden" name="leadId" value={leadId} />
            <button
              type="submit"
              data-testid="qualify-lead"
              className="rounded-[var(--radius)] bg-[var(--brand)] px-5 py-2.5 font-medium text-[var(--brand-ink)]"
            >
              Calificar y permitir asignación
            </button>
          </form>
          <form action={discardLeadAction}>
            <input type="hidden" name="leadId" value={leadId} />
            <input type="hidden" name="reasonCode" value="not_viable" />
            <button type="submit" data-testid="discard-lead" className="rounded-[var(--radius)] border border-[var(--border)] px-5 py-2.5">
              Descartar
            </button>
          </form>
        </section>
      ) : null}

      <section className="mt-10">
        <h2 className="font-semibold">Proveedores</h2>
        <p className="text-sm text-[var(--ink-muted)]">Regla de matching: {ranked.ruleVersion}</p>
        {canAssign ? (
          <AssignForm
            leadId={leadId}
            maxProviders={config.matching.distribution.maxProviders}
            recommendedIds={ranked.recommended.map((evaluation) => evaluation.providerCompanyId)}
            providers={ranked.evaluations.map((evaluation) => ({
              providerCompanyId: evaluation.providerCompanyId,
              displayName: evaluation.displayName,
              eligible: evaluation.eligible,
              score: evaluation.score,
              reasons: evaluation.reasons,
            }))}
          />
        ) : detail.leadGrade === 'C' ? (
          <p className="mt-2 text-[var(--ink-muted)]" data-testid="grade-c-notice">
            Lead C: no se asigna automáticamente a proveedores. Envía a nutrición/contenido o revisión manual.
          </p>
        ) : (
          <p className="mt-2 text-[var(--ink-muted)]">Califica el proyecto para poder asignar proveedores.</p>
        )}
      </section>

      {detail.assignments.length > 0 ? (
        <section className="mt-10">
          <h2 className="font-semibold">Asignaciones</h2>
          <ul className="mt-2 space-y-1 text-sm" data-testid="assignments">
            {detail.assignments.map((assignment) => (
              <li key={assignment.id}>
                #{assignment.rank} {assignment.providerName} · {assignment.status} · {assignment.score} pts
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="mt-10">
        <h2 className="font-semibold">Historial</h2>
        <ul className="mt-2 space-y-1 text-sm text-[var(--ink-muted)]">
          {detail.history.map((entry, index) => (
            <li key={index}>
              {entry.createdAt.toISOString()} · {entry.fromStatus ?? '—'} → {entry.toStatus} · {entry.actorType}
              {entry.reason ? ` · ${entry.reason}` : ''}
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
