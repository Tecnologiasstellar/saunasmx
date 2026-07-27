'use client';

import { useActionState } from 'react';
import { updateCoverageAction, type ProviderActionState } from './actions';
import type { Coverage } from './coverage';
import type { QuestionnaireOption } from '../marketplace-config/types';

const primary = 'rounded-[var(--radius)] bg-[var(--brand)] px-5 py-2.5 font-medium text-[var(--brand-ink)] disabled:opacity-60';
const field = 'mt-1 w-full rounded-[var(--radius)] border border-[var(--border)] px-4 py-3';

export function CoverageForm({
  providerCompanyId,
  serviceOptions,
  coverage,
  currency,
}: {
  providerCompanyId: string;
  serviceOptions: QuestionnaireOption[];
  coverage: Coverage;
  currency: string;
}) {
  const [state, submit, saving] = useActionState<ProviderActionState, FormData>(updateCoverageAction, {});
  const current = new Map(coverage.services.map((service) => [service.serviceKey, service.minProjectValueMinor]));

  return (
    <form action={submit} className="mt-4 space-y-6">
      <input type="hidden" name="providerCompanyId" value={providerCompanyId} />

      <fieldset>
        <legend className="font-medium">Servicios que ofreces</legend>
        <p className="text-sm text-[var(--ink-muted)]">
          Solo recibirás proyectos de los servicios que marques, por encima del valor mínimo que indiques.
        </p>
        <ul className="mt-3 space-y-2">
          {serviceOptions.map((option) => {
            const minimumMinor = current.get(option.value);
            return (
              <li key={option.value} className="flex flex-wrap items-center gap-3">
                <label className="flex min-w-52 items-center gap-2">
                  <input
                    type="checkbox"
                    name={`service:${option.value}`}
                    data-testid={`coverage-service-${option.value}`}
                    defaultChecked={minimumMinor !== undefined}
                  />
                  <span>{option.label}</span>
                </label>
                <label className="flex items-center gap-2 text-sm text-[var(--ink-muted)]">
                  <span>Mínimo ({currency})</span>
                  <input
                    type="number"
                    min="0"
                    step="1"
                    name={`min:${option.value}`}
                    data-testid={`coverage-min-${option.value}`}
                    defaultValue={minimumMinor === undefined ? 0 : minimumMinor / 100}
                    className="w-32 rounded-[var(--radius)] border border-[var(--border)] px-3 py-2"
                  />
                </label>
              </li>
            );
          })}
        </ul>
      </fieldset>

      <label className="block">
        <span className="font-medium">Códigos postales que cubres</span>
        <span className="mt-1 block text-sm text-[var(--ink-muted)]">
          Escribe los primeros 2 a 5 dígitos, separados por comas. Por ejemplo <code>011, 0500</code>.
        </span>
        <textarea
          name="postalPrefixes"
          rows={3}
          data-testid="coverage-postal-prefixes"
          defaultValue={coverage.postalPrefixes.join(', ')}
          className={field}
        />
      </label>

      <button type="submit" data-testid="coverage-save" className={primary} disabled={saving}>
        Guardar cobertura
      </button>

      {state.error ? (
        <p role="alert" data-testid="coverage-error" className="text-sm text-red-700">
          {state.error}
        </p>
      ) : null}
      {state.message ? (
        <p data-testid="coverage-message" className="text-sm text-green-800">
          {state.message}
        </p>
      ) : null}
    </form>
  );
}
