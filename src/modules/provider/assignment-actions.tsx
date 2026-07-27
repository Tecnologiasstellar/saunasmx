'use client';

import { useActionState } from 'react';
import {
  acceptAssignmentAction,
  recordContactAction,
  recordOutcomeAction,
  rejectAssignmentAction,
  submitQuoteAction,
  type ProviderActionState,
} from './actions';

function Feedback({ state }: { state: ProviderActionState }) {
  if (state.error) {
    return (
      <p role="alert" data-testid="action-error" className="text-sm text-red-700">
        {state.error}
      </p>
    );
  }
  if (state.message) {
    return (
      <p data-testid="action-message" className="text-sm text-green-800">
        {state.message}
      </p>
    );
  }
  return null;
}

const primary = 'rounded-[var(--radius)] bg-[var(--brand)] px-5 py-2.5 font-medium text-[var(--brand-ink)] disabled:opacity-60';
const secondary = 'rounded-[var(--radius)] border border-[var(--border)] px-5 py-2.5 disabled:opacity-60';
const field = 'mt-1 w-full rounded-[var(--radius)] border border-[var(--border)] px-4 py-3';

export function RespondForm({ assignmentId }: { assignmentId: string }) {
  const [acceptState, accept, accepting] = useActionState<ProviderActionState, FormData>(acceptAssignmentAction, {});
  const [rejectState, reject, rejecting] = useActionState<ProviderActionState, FormData>(rejectAssignmentAction, {});

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-3">
        <form action={accept}>
          <input type="hidden" name="assignmentId" value={assignmentId} />
          <button type="submit" data-testid="accept-assignment" className={primary} disabled={accepting}>
            Aceptar proyecto
          </button>
        </form>
        <form action={reject} className="flex items-center gap-2">
          <input type="hidden" name="assignmentId" value={assignmentId} />
          <select name="reasonCode" className="rounded-[var(--radius)] border border-[var(--border)] px-3 py-2" aria-label="Motivo">
            <option value="not_interested">No me interesa</option>
            <option value="out_of_area">Fuera de mi zona</option>
            <option value="budget_too_low">Presupuesto bajo</option>
            <option value="no_capacity">Sin capacidad</option>
          </select>
          <button type="submit" data-testid="reject-assignment" className={secondary} disabled={rejecting}>
            Rechazar
          </button>
        </form>
      </div>
      <Feedback state={acceptState} />
      <Feedback state={rejectState} />
    </div>
  );
}

export function PipelineForms({ assignmentId, currency }: { assignmentId: string; currency: string }) {
  const [contactState, contact, contacting] = useActionState<ProviderActionState, FormData>(recordContactAction, {});
  const [quoteState, quote, quoting] = useActionState<ProviderActionState, FormData>(submitQuoteAction, {});
  const [outcomeState, outcome, saving] = useActionState<ProviderActionState, FormData>(recordOutcomeAction, {});

  return (
    <div className="mt-8 space-y-10">
      <section>
        <h2 className="font-semibold">Registrar contacto</h2>
        <form action={contact} className="mt-3 flex flex-wrap items-center gap-2">
          <input type="hidden" name="assignmentId" value={assignmentId} />
          <select name="channel" className="rounded-[var(--radius)] border border-[var(--border)] px-3 py-2" aria-label="Canal">
            <option value="phone">Teléfono</option>
            <option value="whatsapp">WhatsApp</option>
            <option value="email">Correo</option>
          </select>
          <button type="submit" data-testid="record-contact" className={secondary} disabled={contacting}>
            Registrar
          </button>
        </form>
        <Feedback state={contactState} />
      </section>

      <section>
        <h2 className="font-semibold">Enviar cotización</h2>
        <form action={quote} className="mt-3 space-y-3">
          <input type="hidden" name="assignmentId" value={assignmentId} />
          <input type="hidden" name="currency" value={currency} />
          <label className="block">
            <span className="text-sm text-[var(--ink-muted)]">Importe ({currency})</span>
            <input data-testid="quote-amount" name="amount" type="number" min="1" step="0.01" className={field} />
          </label>
          <label className="block">
            <span className="text-sm text-[var(--ink-muted)]">Alcance</span>
            <textarea name="scopeNotes" rows={3} className={field} />
          </label>
          <button type="submit" data-testid="submit-quote" className={primary} disabled={quoting}>
            Enviar cotización
          </button>
        </form>
        <Feedback state={quoteState} />
      </section>

      <section>
        <h2 className="font-semibold">Resultado</h2>
        <form action={outcome} className="mt-3 flex flex-wrap items-end gap-3">
          <input type="hidden" name="assignmentId" value={assignmentId} />
          <label className="block">
            <span className="text-sm text-[var(--ink-muted)]">Resultado</span>
            <select name="outcome" className={field} aria-label="Resultado" data-testid="outcome-select">
              <option value="won">Ganado</option>
              <option value="lost">Perdido</option>
            </select>
          </label>
          <label className="block">
            <span className="text-sm text-[var(--ink-muted)]">Valor ({currency}, si ganaste)</span>
            <input data-testid="outcome-value" name="valueMinor" type="number" min="0" step="0.01" className={field} />
          </label>
          <button type="submit" data-testid="record-outcome" className={secondary} disabled={saving}>
            Guardar
          </button>
        </form>
        <Feedback state={outcomeState} />
      </section>
    </div>
  );
}
