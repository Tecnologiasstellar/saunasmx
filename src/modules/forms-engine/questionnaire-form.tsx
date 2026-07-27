'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Questionnaire, QuestionnaireStep } from '../marketplace-config/types';
import { PRIVACY_POLICY_VERSION } from './policy';

/**
 * Questionnaire runtime.
 *
 * Every field, option and label comes from the marketplace's questionnaire
 * JSON. There is no category-specific code here — this component renders the
 * sauna and pergola questionnaires identically (ADR-006).
 *
 * The server re-validates everything; client checks only keep the form kind.
 */

type Answers = Record<string, string>;
type Contact = { name: string; email: string; phone: string };

type FieldError = { field: string; message: string };

export function QuestionnaireForm({
  questionnaire,
  marketplaceSlug,
  consentLabel,
}: {
  questionnaire: Questionnaire;
  marketplaceSlug: string;
  consentLabel: string;
}) {
  const router = useRouter();
  const steps = questionnaire.steps;

  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<Answers>({});
  const [postalCode, setPostalCode] = useState('');
  const [contact, setContact] = useState<Contact>({ name: '', email: '', phone: '' });
  const [consent, setConsent] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [serverErrors, setServerErrors] = useState<FieldError[]>([]);
  const [submitting, setSubmitting] = useState(false);

  // One key per form instance: a double-click or a retried request cannot
  // create two projects.
  const idempotencyKey = useMemo(() => crypto.randomUUID(), []);

  const step = steps[index];
  if (!step) return null;

  const isLast = index === steps.length - 1;

  function stepIsAnswered(current: QuestionnaireStep): boolean {
    if (!current.required) return true;
    switch (current.type) {
      case 'postal_code':
        return /^\d{5}$/.test(postalCode);
      case 'consent':
        return consent;
      case 'contact':
        return (
          (!current.fields.includes('name') || contact.name.trim().length >= 2) &&
          (!current.fields.includes('email') || /.+@.+\..+/.test(contact.email)) &&
          (!current.fields.includes('phone') || contact.phone.replace(/\D/g, '').length >= 10)
        );
      default:
        return (answers[current.id] ?? '').trim().length > 0;
    }
  }

  function next() {
    if (!stepIsAnswered(step!)) {
      setLocalError('Completa este paso para continuar.');
      return;
    }
    setLocalError(null);
    setIndex((value) => Math.min(value + 1, steps.length - 1));
  }

  async function submit() {
    if (!stepIsAnswered(step!)) {
      setLocalError('Completa este paso para continuar.');
      return;
    }
    setLocalError(null);
    setServerErrors([]);
    setSubmitting(true);

    // Read attribution at submit time rather than in an effect: the values are
    // only needed once, and an effect here would cause a cascading render.
    const params = new URLSearchParams(window.location.search);
    const attribution: Record<string, string> = { landingPath: window.location.pathname };
    for (const [key, param] of [
      ['source', 'utm_source'],
      ['medium', 'utm_medium'],
      ['campaign', 'utm_campaign'],
    ] as const) {
      const value = params.get(param);
      if (value) attribution[key] = value;
    }
    if (document.referrer) attribution.referrer = document.referrer.slice(0, 500);

    const payload = {
      marketplaceSlug,
      contact: { name: contact.name, email: contact.email, phone: contact.phone },
      location: { postalCode },
      answers,
      consent: { leadContact: consent, providerSharing: consent, policyVersion: PRIVACY_POLICY_VERSION },
      attribution,
      idempotencyKey,
    };

    try {
      const response = await fetch(`/api/marketplaces/${marketplaceSlug}/projects`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (response.ok) {
        router.push('/gracias');
        return;
      }

      const body = (await response.json()) as { error?: { message?: string; details?: { fieldErrors?: FieldError[] } } };
      setServerErrors(body.error?.details?.fieldErrors ?? []);
      setLocalError(body.error?.message ?? 'No pudimos enviar tu proyecto. Inténtalo de nuevo.');
    } catch {
      setLocalError('No pudimos enviar tu proyecto. Revisa tu conexión e inténtalo de nuevo.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto max-w-xl px-6 py-10">
      <p className="text-sm text-[var(--ink-muted)]">
        Paso {index + 1} de {steps.length}
      </p>
      <div className="mt-2 h-1 w-full rounded bg-[var(--border)]">
        <div
          className="h-1 rounded bg-[var(--brand)] transition-all"
          style={{ width: `${((index + 1) / steps.length) * 100}%` }}
        />
      </div>

      <h1 className="mt-6 text-2xl font-semibold" data-testid="step-label">
        {step.label}
      </h1>
      {step.help ? <p className="mt-2 text-[var(--ink-muted)]">{step.help}</p> : null}

      <div className="mt-6 space-y-4">
        {step.type === 'postal_code' ? (
          <input
            data-testid="input-postal-code"
            className="w-full rounded-[var(--radius)] border border-[var(--border)] px-4 py-3"
            inputMode="numeric"
            maxLength={5}
            placeholder="00000"
            aria-label={step.label}
            value={postalCode}
            onChange={(event) => setPostalCode(event.target.value.replace(/\D/g, ''))}
          />
        ) : null}

        {step.type === 'single_select'
          ? step.options.map((option) => (
              <button
                key={option.value}
                type="button"
                data-testid={`option-${step.id}-${option.value}`}
                onClick={() => setAnswers((current) => ({ ...current, [step.id]: option.value }))}
                className={`block w-full rounded-[var(--radius)] border px-4 py-3 text-left ${
                  answers[step.id] === option.value
                    ? 'border-[var(--brand)] bg-[var(--brand-soft)] font-medium'
                    : 'border-[var(--border)]'
                }`}
                aria-pressed={answers[step.id] === option.value}
              >
                {option.label}
              </button>
            ))
          : null}

        {step.type === 'long_text' ? (
          <textarea
            data-testid={`input-${step.id}`}
            className="w-full rounded-[var(--radius)] border border-[var(--border)] px-4 py-3"
            rows={5}
            maxLength={step.maxLength}
            aria-label={step.label}
            value={answers[step.id] ?? ''}
            onChange={(event) => setAnswers((current) => ({ ...current, [step.id]: event.target.value }))}
          />
        ) : null}

        {step.type === 'contact' ? (
          <>
            {step.fields.includes('name') ? (
              <label className="block">
                <span className="text-sm text-[var(--ink-muted)]">Nombre</span>
                <input
                  data-testid="input-name"
                  className="mt-1 w-full rounded-[var(--radius)] border border-[var(--border)] px-4 py-3"
                  autoComplete="name"
                  value={contact.name}
                  onChange={(event) => setContact((current) => ({ ...current, name: event.target.value }))}
                />
              </label>
            ) : null}
            {step.fields.includes('email') ? (
              <label className="block">
                <span className="text-sm text-[var(--ink-muted)]">Correo</span>
                <input
                  data-testid="input-email"
                  type="email"
                  className="mt-1 w-full rounded-[var(--radius)] border border-[var(--border)] px-4 py-3"
                  autoComplete="email"
                  value={contact.email}
                  onChange={(event) => setContact((current) => ({ ...current, email: event.target.value }))}
                />
              </label>
            ) : null}
            {step.fields.includes('phone') ? (
              <label className="block">
                <span className="text-sm text-[var(--ink-muted)]">Teléfono (10 dígitos)</span>
                <input
                  data-testid="input-phone"
                  type="tel"
                  className="mt-1 w-full rounded-[var(--radius)] border border-[var(--border)] px-4 py-3"
                  autoComplete="tel"
                  value={contact.phone}
                  onChange={(event) => setContact((current) => ({ ...current, phone: event.target.value }))}
                />
              </label>
            ) : null}
          </>
        ) : null}

        {step.type === 'consent' ? (
          <label className="flex items-start gap-3">
            <input
              data-testid="input-consent"
              type="checkbox"
              className="mt-1 h-5 w-5"
              checked={consent}
              onChange={(event) => setConsent(event.target.checked)}
            />
            <span className="text-[var(--ink)]">{consentLabel}</span>
          </label>
        ) : null}
      </div>

      {localError ? (
        <p role="alert" data-testid="form-error" className="mt-4 text-sm text-red-700">
          {localError}
        </p>
      ) : null}
      {serverErrors.length > 0 ? (
        <ul className="mt-2 list-disc pl-5 text-sm text-red-700">
          {serverErrors.map((error) => (
            <li key={error.field}>{error.message}</li>
          ))}
        </ul>
      ) : null}

      <div className="mt-8 flex items-center justify-between">
        <button
          type="button"
          className="text-sm text-[var(--ink-muted)] underline disabled:opacity-40"
          onClick={() => setIndex((value) => Math.max(0, value - 1))}
          disabled={index === 0 || submitting}
        >
          Atrás
        </button>
        <button
          type="button"
          data-testid={isLast ? 'submit' : 'next'}
          className="rounded-[var(--radius)] bg-[var(--brand)] px-6 py-3 font-medium text-[var(--brand-ink)] disabled:opacity-60"
          onClick={isLast ? submit : next}
          disabled={submitting}
        >
          {isLast ? (submitting ? 'Enviando…' : 'Enviar proyecto') : 'Continuar'}
        </button>
      </div>
    </div>
  );
}
