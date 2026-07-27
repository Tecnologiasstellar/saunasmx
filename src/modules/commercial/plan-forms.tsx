'use client';

import { useActionState } from 'react';
import {
  assignPlanAction,
  createPlanAction,
  setPlanActiveAction,
  updatePlanTermsAction,
  type CommercialActionState,
} from './actions';
import type { PlanRow, ProviderAgreementRow } from './agreements';
import type { PlanTerms } from './terms';

const primary = 'rounded-[var(--radius)] bg-[var(--brand)] px-5 py-2.5 font-medium text-[var(--brand-ink)] disabled:opacity-60';
const secondary = 'rounded-[var(--radius)] border border-[var(--border)] px-4 py-2 disabled:opacity-60';
const numberField = 'w-36 rounded-[var(--radius)] border border-[var(--border)] px-3 py-2';

function Feedback({ state, testId }: { state: CommercialActionState; testId: string }) {
  if (state.error) {
    return (
      <p role="alert" data-testid={`${testId}-error`} className="mt-2 text-sm text-red-700">
        {state.error}
      </p>
    );
  }
  if (state.message) {
    return (
      <p data-testid={`${testId}-message`} className="mt-2 text-sm text-green-800">
        {state.message}
      </p>
    );
  }
  return null;
}

/** The pricing primitives of docs/07, collected in the operator's own units. */
function PriceFields({ terms, currency, prefix }: { terms?: PlanTerms; currency: string; prefix: string }) {
  const money = (minor: number | undefined) => (minor === undefined ? 0 : minor / 100);
  const fields: Array<{ name: string; label: string; value: number }> = [
    { name: 'monthlySubscription', label: `Suscripción mensual (${currency})`, value: money(terms?.monthlySubscriptionMinor) },
    { name: 'qualifiedLeadFee', label: `Lead calificado (${currency})`, value: money(terms?.qualifiedLeadFeeMinor) },
    { name: 'acceptedLeadFee', label: `Lead aceptado (${currency})`, value: money(terms?.acceptedLeadFeeMinor) },
    { name: 'appointmentFee', label: `Cita (${currency})`, value: money(terms?.appointmentFeeMinor) },
    { name: 'fixedSuccessFee', label: `Éxito fijo (${currency})`, value: money(terms?.fixedSuccessFeeMinor) },
  ];

  return (
    <div className="mt-3 flex flex-wrap gap-4">
      {fields.map((field) => (
        <label key={field.name} className="block text-sm">
          <span className="text-[var(--ink-muted)]">{field.label}</span>
          <input
            type="number"
            min="0"
            step="1"
            name={field.name}
            data-testid={`${prefix}-${field.name}`}
            defaultValue={field.value}
            className={numberField}
          />
        </label>
      ))}
      <label className="block text-sm">
        <span className="text-[var(--ink-muted)]">Comisión por éxito (%)</span>
        <input
          type="number"
          min="0"
          max="100"
          step="0.01"
          name="successCommissionPercent"
          data-testid={`${prefix}-successCommissionPercent`}
          defaultValue={(terms?.successCommissionBps ?? 0) / 100}
          className={numberField}
        />
      </label>
      <label className="flex items-center gap-2 self-end text-sm">
        <input
          type="checkbox"
          name="featuredPlacement"
          data-testid={`${prefix}-featuredPlacement`}
          defaultChecked={terms?.featuredPlacement ?? false}
        />
        <span>Posición destacada</span>
      </label>
    </div>
  );
}

export function CreatePlanForm({ currency }: { currency: string }) {
  const [state, submit, saving] = useActionState<CommercialActionState, FormData>(createPlanAction, {});

  return (
    <form action={submit} className="mt-4">
      <label className="block text-sm">
        <span className="text-[var(--ink-muted)]">Nombre del plan</span>
        <input
          name="name"
          data-testid="plan-name"
          className="mt-1 w-full max-w-md rounded-[var(--radius)] border border-[var(--border)] px-4 py-3"
        />
      </label>
      <PriceFields currency={currency} prefix="plan" />
      <button type="submit" data-testid="create-plan" className={`${primary} mt-4`} disabled={saving}>
        Crear plan
      </button>
      <Feedback state={state} testId="create-plan" />
    </form>
  );
}

export function EditPlanForm({ plan, currency }: { plan: PlanRow; currency: string }) {
  const [termsState, saveTerms, savingTerms] = useActionState<CommercialActionState, FormData>(updatePlanTermsAction, {});
  const [activeState, toggleActive, togglingActive] = useActionState<CommercialActionState, FormData>(setPlanActiveAction, {});

  return (
    <div>
      <form action={saveTerms}>
        <input type="hidden" name="planId" value={plan.id} />
        <PriceFields terms={plan.terms} currency={currency} prefix={`edit-${plan.id}`} />
        <button type="submit" data-testid={`save-plan-${plan.id}`} className={`${secondary} mt-3`} disabled={savingTerms}>
          Guardar términos
        </button>
        <Feedback state={termsState} testId={`save-plan-${plan.id}`} />
      </form>

      <form action={toggleActive} className="mt-2">
        <input type="hidden" name="planId" value={plan.id} />
        <input type="hidden" name="active" value={plan.active ? 'false' : 'true'} />
        <button type="submit" data-testid={`toggle-plan-${plan.id}`} className={secondary} disabled={togglingActive}>
          {plan.active ? 'Retirar del menú' : 'Reactivar'}
        </button>
        <Feedback state={activeState} testId={`toggle-plan-${plan.id}`} />
      </form>
    </div>
  );
}

export function AssignPlanForm({ provider, plans }: { provider: ProviderAgreementRow; plans: PlanRow[] }) {
  const [state, submit, saving] = useActionState<CommercialActionState, FormData>(assignPlanAction, {});

  return (
    <form action={submit} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="providerCompanyId" value={provider.providerCompanyId} />
      <select
        name="planId"
        aria-label="Plan"
        data-testid={`plan-select-${provider.providerCompanyId}`}
        defaultValue={provider.planId ?? ''}
        className="rounded-[var(--radius)] border border-[var(--border)] px-3 py-2"
      >
        <option value="">Sin plan</option>
        {plans
          .filter((plan) => plan.active || plan.id === provider.planId)
          .map((plan) => (
            <option key={plan.id} value={plan.id}>
              {plan.name}
              {plan.active ? '' : ' (retirado)'}
            </option>
          ))}
      </select>
      <button type="submit" data-testid={`assign-plan-${provider.providerCompanyId}`} className={secondary} disabled={saving}>
        Aplicar
      </button>
      <Feedback state={state} testId={`assign-plan-${provider.providerCompanyId}`} />
    </form>
  );
}
