'use client';

import { useActionState } from 'react';
import { assignProvidersAction, type AssignActionState } from './actions';

export type RankedProvider = {
  providerCompanyId: string;
  displayName: string;
  eligible: boolean;
  score: number;
  reasons: string[];
};

/**
 * Curated assignment. The operator picks from the ranked eligible set; the
 * server recomputes eligibility, so disabling a checkbox here is a courtesy,
 * not the control (ADR-005).
 */
export function AssignForm({
  leadId,
  providers,
  maxProviders,
  recommendedIds,
}: {
  leadId: string;
  providers: RankedProvider[];
  maxProviders: number;
  recommendedIds: string[];
}) {
  const [state, formAction, pending] = useActionState<AssignActionState, FormData>(assignProvidersAction, {});

  const eligible = providers.filter((provider) => provider.eligible);
  const ineligible = providers.filter((provider) => !provider.eligible);

  return (
    <form action={formAction} className="mt-4 space-y-3">
      <input type="hidden" name="leadId" value={leadId} />

      {eligible.map((provider) => (
        <label key={provider.providerCompanyId} className="flex items-start gap-3 rounded-[var(--radius)] border border-[var(--border)] p-3">
          <input
            type="checkbox"
            name="providerCompanyId"
            value={provider.providerCompanyId}
            defaultChecked={recommendedIds.includes(provider.providerCompanyId)}
            data-testid={`assign-${provider.providerCompanyId}`}
            className="mt-1 h-5 w-5"
          />
          <span>
            <span className="font-medium">{provider.displayName}</span>
            <span className="ml-2 text-sm text-[var(--ink-muted)]">{provider.score} pts</span>
            <span className="block text-sm text-[var(--ink-muted)]">{provider.reasons.join(' · ')}</span>
          </span>
        </label>
      ))}

      {eligible.length === 0 ? <p className="text-[var(--ink-muted)]">Ningún proveedor es elegible para este proyecto.</p> : null}

      {state.error ? (
        <p role="alert" data-testid="assign-error" className="text-sm text-red-700">
          {state.error}
        </p>
      ) : null}
      {state.assigned ? (
        <p data-testid="assign-success" className="text-sm text-green-800">
          {state.assigned} proveedor(es) asignado(s).
        </p>
      ) : null}

      <button
        type="submit"
        data-testid="assign-submit"
        disabled={pending || eligible.length === 0}
        className="rounded-[var(--radius)] bg-[var(--brand)] px-5 py-2.5 font-medium text-[var(--brand-ink)] disabled:opacity-60"
      >
        {pending ? 'Asignando…' : `Asignar (máx. ${maxProviders})`}
      </button>

      {ineligible.length > 0 ? (
        <details className="mt-4 text-sm">
          <summary className="cursor-pointer text-[var(--ink-muted)]">
            {ineligible.length} proveedor(es) no elegible(s)
          </summary>
          <ul className="mt-2 space-y-1">
            {ineligible.map((provider) => (
              <li key={provider.providerCompanyId} className="text-[var(--ink-muted)]">
                <span className="font-medium">{provider.displayName}</span>: {provider.reasons.join(' · ')}
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </form>
  );
}
