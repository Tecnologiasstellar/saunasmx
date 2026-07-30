'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { GroupField, Questionnaire, QuestionnaireStep } from '../marketplace-config/types';
import { buttonClass } from '../ui/primitives';
import { PRIVACY_POLICY_VERSION } from './policy';

/**
 * Questionnaire runtime.
 *
 * Every field, option and label comes from the marketplace's questionnaire
 * JSON. There is no category-specific code here — this component renders the
 * sauna and pergola questionnaires identically (ADR-006), including the
 * "group" step type that bundles several fields onto one screen.
 *
 * The server re-validates everything; client checks only keep the form kind.
 */

type Answers = Record<string, string>;
type Contact = { name: string; email: string; phone: string };
/** The four field ids that route into the intake payload's `location` object rather than `answers`. */
type Location = { postalCode: string; city: string; state: string; streetAddress: string };

type FieldError = { field: string; message: string };

/** Group-field ids that route into `location` (camelCase keys) instead of `answers`. */
const LOCATION_FIELD_MAP: Record<string, keyof Location> = {
  postal_code: 'postalCode',
  city: 'city',
  state: 'state',
  street_address: 'streetAddress',
};

function beacon(marketplaceSlug: string, name: string, properties: Record<string, string | number>) {
  try {
    const body = JSON.stringify({ name, ...properties });
    const blob = new Blob([body], { type: 'application/json' });
    navigator.sendBeacon?.(`/api/marketplaces/${marketplaceSlug}/events`, blob);
  } catch {
    // Best-effort only — analytics must never break the questionnaire.
  }
}

export function QuestionnaireForm({
  questionnaire,
  marketplaceSlug,
  consentLabel,
  initialPostalCode = '',
  initialAnswers,
  preferredProviderSlug,
}: {
  questionnaire: Questionnaire;
  marketplaceSlug: string;
  consentLabel: string;
  /**
   * Prefill from a `?cp=` link (an article's lead card). The route validates it
   * server-side before passing it here, it renders identically on server and
   * client, and the API revalidates it again — a crafted link cannot widen what
   * the questionnaire accepts, and it skips no step.
   */
  initialPostalCode?: string;
  /**
   * Prefill for `answers`-backed fields (e.g. `capacity`, `setting`), from the
   * /disena-tu-sauna configurator's handoff. The route validates each value
   * against this questionnaire's own option list before passing it here — see
   * cotizar/page.tsx — so a crafted link cannot pre-fill a value the
   * questionnaire would not itself have offered.
   */
  initialAnswers?: Answers;
  /**
   * Set when the visitor started on a provider's directory page. The route
   * resolves it against a published profile before passing it here, so an
   * unknown slug never reaches the payload.
   */
  preferredProviderSlug?: string;
}) {
  const router = useRouter();
  const steps = questionnaire.steps;

  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<Answers>(() => initialAnswers ?? {});
  const [location, setLocation] = useState<Location>({ postalCode: initialPostalCode, city: '', state: '', streetAddress: '' });
  const [contact, setContact] = useState<Contact>({ name: '', email: '', phone: '' });
  const [consent, setConsent] = useState(false);
  const [consents, setConsents] = useState<Record<string, boolean>>({});
  const [localError, setLocalError] = useState<string | null>(null);
  const [serverErrors, setServerErrors] = useState<FieldError[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const submittedRef = useRef(false);

  // One key per form instance: a double-click or a retried request cannot
  // create two projects.
  const idempotencyKey = useMemo(() => crypto.randomUUID(), []);

  const step = steps[index];

  function getValue(id: string): string {
    const locationKey = LOCATION_FIELD_MAP[id];
    return locationKey ? location[locationKey] : (answers[id] ?? '');
  }

  function setValue(id: string, value: string) {
    const locationKey = LOCATION_FIELD_MAP[id];
    if (locationKey) {
      setLocation((current) => ({ ...current, [locationKey]: value }));
    } else {
      setAnswers((current) => ({ ...current, [id]: value }));
    }
  }

  function fieldVisible(field: GroupField): boolean {
    if (!field.showIf) return true;
    const value = getValue(field.showIf.field);
    if (field.showIf.equals !== undefined) return value === field.showIf.equals;
    if (field.showIf.notEquals !== undefined) return value !== field.showIf.notEquals;
    return true;
  }

  // Funnel analytics — best-effort, no PII (see events route for the allow-list).
  useEffect(() => {
    beacon(marketplaceSlug, 'questionnaire_started', { questionnaireVersion: questionnaire.version });
    const onHide = () => {
      if (!submittedRef.current) {
        beacon(marketplaceSlug, 'questionnaire_abandoned', {
          questionnaireVersion: questionnaire.version,
          stepId: steps[index]?.id ?? '',
        });
      }
    };
    document.addEventListener('visibilitychange', onHide);
    window.addEventListener('pagehide', onHide);
    return () => {
      document.removeEventListener('visibilitychange', onHide);
      window.removeEventListener('pagehide', onHide);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!step) return;
    beacon(marketplaceSlug, 'questionnaire_step_viewed', { questionnaireVersion: questionnaire.version, stepId: step.id });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index]);

  if (!step) return null;

  const isLast = index === steps.length - 1;
  const contactConsents = step.type === 'contact' ? (step.consents ?? []) : [];
  const usesEmbeddedConsents = contactConsents.length > 0;

  function groupFieldAnswered(field: GroupField): boolean {
    if (!fieldVisible(field)) return true;
    if (!field.required) return true;
    const value = getValue(field.id);
    if (value.trim().length === 0) return false;
    if (field.kind === 'text' && field.pattern) return new RegExp(field.pattern).test(value);
    return true;
  }

  function stepIsAnswered(current: QuestionnaireStep): boolean {
    switch (current.type) {
      case 'postal_code':
        return !current.required || /^\d{5}$/.test(location.postalCode);
      case 'consent':
        return !current.required || consent;
      case 'contact': {
        const fieldsOk =
          (!current.fields.includes('name') || contact.name.trim().length >= 2) &&
          (!current.fields.includes('email') || /.+@.+\..+/.test(contact.email)) &&
          (!current.fields.includes('phone') || contact.phone.replace(/\D/g, '').length >= 10);
        const consentsOk = contactConsents.length === 0 || contactConsents.every((item) => consents[item.purpose]);
        return fieldsOk && consentsOk;
      }
      case 'group':
        return current.fields.every(groupFieldAnswered);
      default:
        return !current.required || (answers[current.id] ?? '').trim().length > 0;
    }
  }

  function next() {
    if (!stepIsAnswered(step!)) {
      setLocalError('Completa este paso para continuar.');
      return;
    }
    setLocalError(null);
    beacon(marketplaceSlug, 'questionnaire_step_completed', { questionnaireVersion: questionnaire.version, stepId: step!.id });
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

    const leadContact = usesEmbeddedConsents ? (consents.lead_contact ?? false) : consent;
    const providerSharing = usesEmbeddedConsents ? (consents.provider_sharing ?? false) : consent;

    const payload = {
      marketplaceSlug,
      contact: { name: contact.name, email: contact.email, phone: contact.phone },
      location: {
        postalCode: location.postalCode,
        city: location.city || undefined,
        state: location.state || undefined,
        streetAddress: location.streetAddress || undefined,
      },
      answers,
      consent: { leadContact, providerSharing, policyVersion: PRIVACY_POLICY_VERSION },
      attribution,
      ...(preferredProviderSlug ? { preferredProviderSlug } : {}),
      idempotencyKey,
    };

    try {
      const response = await fetch(`/api/marketplaces/${marketplaceSlug}/projects`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (response.ok) {
        submittedRef.current = true;
        beacon(marketplaceSlug, 'questionnaire_step_completed', { questionnaireVersion: questionnaire.version, stepId: step!.id });
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

  const inputClass =
    'w-full rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] px-4 py-3.5 text-[0.9375rem] text-[var(--ink)] placeholder:text-[var(--ink-subtle)]';
  const fieldLabelClass = 'block text-[0.6875rem] font-bold uppercase tracking-[0.15em] text-[var(--ink-subtle)]';

  function renderOptions(fieldId: string, options: { value: string; label: string }[]) {
    return options.map((option) => {
      const selected = getValue(fieldId) === option.value;
      return (
        <button
          key={option.value}
          type="button"
          data-testid={`option-${fieldId}-${option.value}`}
          onClick={() => setValue(fieldId, option.value)}
          className={`lift flex w-full items-center gap-3 rounded-[var(--radius-card)] px-4 py-4 text-left text-[0.9375rem] hover:border-[var(--brand)] ${
            selected
              ? 'border-2 border-[var(--brand)] bg-[var(--surface)] font-semibold'
              : 'border border-[var(--border)] bg-[var(--canvas)]'
          }`}
          aria-pressed={selected}
        >
          <span
            aria-hidden="true"
            className={`h-4 w-4 flex-none rounded-full border-2 border-[var(--brand)] ${
              selected ? 'bg-[var(--brand)]' : 'bg-[var(--brand-soft)]'
            }`}
          />
          {option.label}
        </button>
      );
    });
  }

  function renderGroupField(field: GroupField) {
    if (!fieldVisible(field)) return null;
    return (
      <div key={field.id} className="space-y-2">
        <label className="block">
          <span className={fieldLabelClass}>{field.label}</span>
        </label>
        {field.kind === 'text' ? (
          <input
            data-testid={`input-${field.id}`}
            className={inputClass}
            placeholder={field.placeholder}
            aria-label={field.label}
            value={getValue(field.id)}
            onChange={(event) => setValue(field.id, event.target.value)}
          />
        ) : (
          <div className="space-y-2">{renderOptions(field.id, field.options)}</div>
        )}
      </div>
    );
  }

  return (
    <div className="gutter mx-auto w-full max-w-[560px] py-10 md:py-16">
      <div className="rounded-[var(--radius-panel)] border border-[var(--border)] bg-[var(--surface)] p-6 shadow-[var(--shadow)] md:p-9">
        <div className="flex items-center justify-between gap-4">
          <p className={fieldLabelClass}>
            Paso {index + 1} de {steps.length}
          </p>
          {/* Segment per step, mirroring the handoff's pill progress bar. The
              <progress> element carries the value for assistive technology. */}
          <div aria-hidden="true" className="flex gap-1.5">
            {steps.map((entry, position) => (
              <span
                key={entry.id}
                className={`h-1 w-4 rounded-sm sm:w-5 ${
                  position <= index ? 'bg-[var(--brand)]' : 'bg-[var(--border)]'
                }`}
              />
            ))}
          </div>
        </div>
        <progress className="sr-only" value={index + 1} max={steps.length} />

        <h1
          className="mt-6 font-[family-name:var(--font-heading)] text-[1.625rem] font-semibold leading-tight text-[var(--ink)]"
          data-testid="step-label"
        >
          {step.label}
        </h1>
        {step.help ? <p className="mt-2 text-[var(--ink-muted)]">{step.help}</p> : null}

        <div className="mt-7 space-y-3">
          {step.type === 'postal_code' ? (
            <label className="block">
              <span className={fieldLabelClass}>Código postal</span>
              <input
                data-testid="input-postal-code"
                className={`mt-2 ${inputClass} max-w-[180px] tracking-[0.2em]`}
                inputMode="numeric"
                maxLength={5}
                placeholder="00000"
                aria-label={step.label}
                value={location.postalCode}
                onChange={(event) => setLocation((current) => ({ ...current, postalCode: event.target.value.replace(/\D/g, '') }))}
              />
            </label>
          ) : null}

          {step.type === 'single_select' ? renderOptions(step.id, step.options) : null}

          {step.type === 'group' ? <div className="space-y-6">{step.fields.map(renderGroupField)}</div> : null}

          {step.type === 'long_text' ? (
            <textarea
              data-testid={`input-${step.id}`}
              className={inputClass}
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
                  <span className={fieldLabelClass}>Nombre</span>
                  <input
                    data-testid="input-name"
                    className={`mt-2 ${inputClass}`}
                    autoComplete="name"
                    value={contact.name}
                    onChange={(event) => setContact((current) => ({ ...current, name: event.target.value }))}
                  />
                </label>
              ) : null}
              {step.fields.includes('email') ? (
                <label className="block">
                  <span className={fieldLabelClass}>Correo</span>
                  <input
                    data-testid="input-email"
                    type="email"
                    className={`mt-2 ${inputClass}`}
                    autoComplete="email"
                    value={contact.email}
                    onChange={(event) => setContact((current) => ({ ...current, email: event.target.value }))}
                  />
                </label>
              ) : null}
              {step.fields.includes('phone') ? (
                <label className="block">
                  <span className={fieldLabelClass}>{step.phoneLabel ?? 'Teléfono'} (10 dígitos)</span>
                  <input
                    data-testid="input-phone"
                    type="tel"
                    className={`mt-2 ${inputClass}`}
                    autoComplete="tel"
                    value={contact.phone}
                    onChange={(event) => setContact((current) => ({ ...current, phone: event.target.value }))}
                  />
                </label>
              ) : null}
              {contactConsents.map((item) => (
                <label
                  key={item.purpose}
                  className="flex items-start gap-3 rounded-[var(--radius-card)] border border-[var(--border)] bg-[var(--canvas)] p-4"
                >
                  <input
                    data-testid={`input-consent-${item.purpose}`}
                    type="checkbox"
                    className="mt-1 h-5 w-5 flex-none accent-[var(--brand)]"
                    checked={consents[item.purpose] ?? false}
                    onChange={(event) => setConsents((current) => ({ ...current, [item.purpose]: event.target.checked }))}
                  />
                  <span className="text-[0.9375rem] leading-relaxed text-[var(--ink)]">{item.label}</span>
                </label>
              ))}
            </>
          ) : null}

          {step.type === 'consent' ? (
            <label className="flex items-start gap-3 rounded-[var(--radius-card)] border border-[var(--border)] bg-[var(--canvas)] p-4">
              <input
                data-testid="input-consent"
                type="checkbox"
                className="mt-1 h-5 w-5 flex-none accent-[var(--brand)]"
                checked={consent}
                onChange={(event) => setConsent(event.target.checked)}
              />
              <span className="text-[0.9375rem] leading-relaxed text-[var(--ink)]">{consentLabel}</span>
            </label>
          ) : null}
        </div>

        {/* aria-live so a validation failure is announced, not only shown. */}
        <div aria-live="polite">
          {localError ? (
            <p
              role="alert"
              data-testid="form-error"
              className="mt-5 rounded-[var(--radius)] border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-800"
            >
              {localError}
            </p>
          ) : null}
          {serverErrors.length > 0 ? (
            <ul className="mt-2 list-disc rounded-[var(--radius)] border border-red-200 bg-red-50 px-4 py-3 pl-8 text-sm text-red-800">
              {serverErrors.map((error) => (
                <li key={error.field}>{error.message}</li>
              ))}
            </ul>
          ) : null}
        </div>

        <div className="mt-8 flex items-center justify-between gap-4 border-t border-[var(--border)] pt-6">
          <button
            type="button"
            className="text-sm font-medium text-[var(--ink-muted)] underline underline-offset-4 hover:text-[var(--brand)] disabled:opacity-40 disabled:hover:text-[var(--ink-muted)]"
            onClick={() => setIndex((value) => Math.max(0, value - 1))}
            disabled={index === 0 || submitting}
          >
            Atrás
          </button>
          <button
            type="button"
            data-testid={isLast ? 'submit' : 'next'}
            className={buttonClass('primary', 'px-7 py-3.5')}
            onClick={isLast ? submit : next}
            disabled={submitting || (isLast && !stepIsAnswered(step))}
          >
            {isLast ? (submitting ? 'Enviando…' : questionnaire.submitLabel) : 'Continuar'}
            {isLast ? null : <span aria-hidden="true">→</span>}
          </button>
        </div>
      </div>

      <p className="mt-5 text-center text-sm text-[var(--ink-muted)]">
        Compartimos tus datos únicamente con los proveedores asignados a tu proyecto.
      </p>
    </div>
  );
}
