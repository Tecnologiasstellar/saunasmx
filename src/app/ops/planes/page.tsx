import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireFinanceAccess } from '@/modules/auth/current-user';
import { listPlans, listProviderAgreements } from '@/modules/commercial/agreements';
import { AssignPlanForm, CreatePlanForm, EditPlanForm } from '@/modules/commercial/plan-forms';
import { describeTerms } from '@/modules/commercial/terms';
import { getDb } from '@/modules/database/client';
import { getMarketplaceId } from '@/modules/marketplace-config/publish';
import { resolveRequestHost } from '@/modules/site/context';

export const metadata = { title: 'Planes y acuerdos', robots: { index: false, follow: false } };

const TRIGGER_LABELS: Record<string, string> = {
  qualified_lead: 'lead calificado',
  accepted_lead: 'lead aceptado',
  appointment: 'cita',
  verified_win: 'venta verificada',
};

export default async function CommercialPlans() {
  await requireFinanceAccess('/ops/planes');
  const resolution = await resolveRequestHost();
  if (resolution.kind === 'unknown') notFound();

  const db = await getDb();
  const marketplaceId = await getMarketplaceId(db, resolution.config.slug);
  const plans = await listPlans(db, marketplaceId);
  const providers = await listProviderAgreements(db, marketplaceId);
  const currency = resolution.config.localization.currency;

  return (
    <main className="mx-auto max-w-5xl px-6 py-10">
      <h1 className="text-2xl font-semibold">Planes y acuerdos · {resolution.config.name}</h1>
      <p className="mt-1 text-sm text-[var(--ink-muted)]">
        Los términos se copian al acuerdo cuando se firma. Editar un plan después no cambia los acuerdos vigentes.
      </p>
      <Link className="mt-2 inline-block underline" href="/ops">
        Volver a la bandeja
      </Link>

      <section className="mt-8">
        <h2 className="font-semibold">Planes</h2>
        <ul className="mt-3 space-y-4" data-testid="plan-list">
          {plans.map((plan) => (
            <li key={plan.id} className="rounded-[var(--radius)] border border-[var(--border)] p-4">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h3 className="font-medium" data-testid={`plan-name-${plan.id}`}>
                  {plan.name}
                </h3>
                <span className="text-sm text-[var(--ink-muted)]">{plan.active ? 'Activo' : 'Retirado'}</span>
              </div>
              <p className="mt-1 text-sm text-[var(--ink-muted)]">{describeTerms(plan.terms).join(' · ')}</p>
              <details className="mt-2">
                <summary className="cursor-pointer text-sm underline">Editar términos</summary>
                <EditPlanForm plan={plan} currency={currency} />
              </details>
            </li>
          ))}
        </ul>
        {plans.length === 0 ? <p className="mt-3 text-[var(--ink-muted)]">Todavía no hay planes.</p> : null}

        <details className="mt-6">
          <summary className="cursor-pointer font-medium underline">Crear un plan</summary>
          <CreatePlanForm currency={currency} />
        </details>
      </section>

      <section className="mt-12">
        <h2 className="font-semibold">Acuerdos por proveedor</h2>
        <ul className="mt-3 space-y-4" data-testid="agreement-list">
          {providers.map((provider) => (
            <li key={provider.providerCompanyId} className="rounded-[var(--radius)] border border-[var(--border)] p-4">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h3 className="font-medium">{provider.displayName}</h3>
                <span className="text-sm text-[var(--ink-muted)]">{provider.relationshipStatus}</span>
              </div>

              <p className="mt-1 text-sm" data-testid={`agreement-terms-${provider.providerCompanyId}`}>
                {provider.terms
                  ? `${provider.planName ?? 'Plan'} · ${describeTerms(provider.terms).join(' · ')}`
                  : 'Sin acuerdo vigente'}
              </p>

              {provider.commissions.length > 0 ? (
                <p className="mt-1 text-sm text-[var(--ink-muted)]">
                  Comisiones:{' '}
                  {provider.commissions
                    .map((commission) => {
                      const parts = [
                        commission.rateBps ? `${commission.rateBps / 100}%` : null,
                        commission.fixedFeeMinor ? `${commission.fixedFeeMinor / 100} ${currency}` : null,
                      ].filter(Boolean);
                      return `${TRIGGER_LABELS[commission.trigger] ?? commission.trigger} (${parts.join(' + ')})`;
                    })
                    .join(', ')}
                </p>
              ) : null}

              {provider.startsAt ? (
                <p className="mt-1 text-xs text-[var(--ink-muted)]">
                  Vigente desde {provider.startsAt.toISOString().slice(0, 10)}
                </p>
              ) : null}

              <div className="mt-3">
                <AssignPlanForm provider={provider} plans={plans} />
              </div>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
