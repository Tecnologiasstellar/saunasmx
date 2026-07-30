'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import type { ConfiguratorConfig, ConfiguratorField, ConfiguratorStep } from '../marketplace-config/types';
import { buttonClass, PhotoFigure } from '../ui/primitives';
import { resolveConfiguratorPhoto } from './photo';

/**
 * Visual configurator runtime.
 *
 * A standalone flow, not the graded /cotizar questionnaire (see ADR note in
 * src/modules/configurator/schema.ts). It never submits anywhere on its own —
 * the summary screen's CTA hands the visitor into /cotizar, which does the
 * actual submission and grading.
 */

type Answers = Record<string, string>;

const AUTO_ADVANCE_DELAY_MS = 350;

/**
 * Handoff into /cotizar (see cotizar/page.tsx, which re-validates each value
 * against the questionnaire's own option list before trusting it).
 *
 * Only `size` and `setting` have a real home in the graded questionnaire
 * today — wood species, heater type, cabin shape and window stay
 * configurator-only for now (captured in the funnel's own analytics events),
 * per the "prefill only" scope agreed for this pass.
 *
 * The configurator's 3 size buckets don't line up one-to-one with the
 * questionnaire's 5 capacity options; this picks the closest single value per
 * bucket. It's a prefill, not a commitment — the visitor can still change it
 * on the capacity step.
 */
const SIZE_TO_CAPACITY: Record<string, string> = {
  small: '2',
  medium: '6',
  large: 'more_than_8',
};

function cotizarHref(configurator: ConfiguratorConfig, answers: Answers): string {
  const params = new URLSearchParams();
  const size = answers[configurator.sizeFieldId];
  const capacity = size ? SIZE_TO_CAPACITY[size] : undefined;
  if (capacity) params.set('capacity', capacity);
  const setting = answers.setting;
  if (setting) params.set('setting', setting);
  const query = params.toString();
  return query ? `/cotizar?${query}` : '/cotizar';
}

function beacon(marketplaceSlug: string, name: string, properties: Record<string, string | number>) {
  try {
    const body = JSON.stringify({ name, ...properties });
    const blob = new Blob([body], { type: 'application/json' });
    navigator.sendBeacon?.(`/api/marketplaces/${marketplaceSlug}/events`, blob);
  } catch {
    // Best-effort only — analytics must never break the configurator.
  }
}

function stepFieldsAnswered(step: ConfiguratorStep, answers: Answers): boolean {
  return step.fields.every((field) => Boolean(answers[field.id]));
}

export function ConfiguratorForm({
  configurator,
  marketplaceSlug,
}: {
  configurator: ConfiguratorConfig;
  marketplaceSlug: string;
}) {
  const steps = configurator.steps;
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<Answers>({});
  const completedRef = useRef(false);

  const onSummary = index >= steps.length;
  const step = onSummary ? null : steps[index];

  useEffect(() => {
    beacon(marketplaceSlug, 'configurator_started', { configuratorVersion: configurator.version });
    const onHide = () => {
      if (!completedRef.current) {
        beacon(marketplaceSlug, 'configurator_abandoned', {
          configuratorVersion: configurator.version,
          stepId: steps[index]?.id ?? 'summary',
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
    if (onSummary) {
      completedRef.current = true;
      beacon(marketplaceSlug, 'configurator_completed', { configuratorVersion: configurator.version });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onSummary]);

  function advance(fromStep: ConfiguratorStep) {
    beacon(marketplaceSlug, 'configurator_step_completed', { configuratorVersion: configurator.version, stepId: fromStep.id });
    setIndex((value) => value + 1);
  }

  function selectOption(field: ConfiguratorField, value: string, ownerStep: ConfiguratorStep) {
    const next = { ...answers, [field.id]: value };
    setAnswers(next);
    // Single-field steps move on as soon as you pick — that's the point of a
    // visual, tap-through flow. A step with two fields (window + setting)
    // waits for both, via the explicit "Continuar" button below.
    if (ownerStep.fields.length === 1) {
      window.setTimeout(() => advance(ownerStep), AUTO_ADVANCE_DELAY_MS);
    }
  }

  if (onSummary) {
    return (
      <Summary
        configurator={configurator}
        marketplaceSlug={marketplaceSlug}
        answers={answers}
        onBack={() => {
          completedRef.current = false;
          setIndex(steps.length - 1);
        }}
      />
    );
  }

  const current = step!;
  const isLastStep = index === steps.length - 1;
  const canContinue = stepFieldsAnswered(current, answers);

  return (
    <div className="gutter mx-auto w-full max-w-[720px] py-10 md:py-16">
      <div className="rounded-[var(--radius-panel)] border border-[var(--border)] bg-[var(--surface)] p-6 shadow-[var(--shadow)] md:p-9">
        <div className="flex items-center justify-between gap-4">
          <p className="text-[0.6875rem] font-bold uppercase tracking-[0.15em] text-[var(--ink-subtle)]">
            Paso {index + 1} de {steps.length}
          </p>
          <div aria-hidden="true" className="flex gap-1.5">
            {steps.map((entry, position) => (
              <span
                key={entry.id}
                className={`h-1 w-4 rounded-sm sm:w-5 ${position <= index ? 'bg-[var(--brand)]' : 'bg-[var(--border)]'}`}
              />
            ))}
          </div>
        </div>
        <progress className="sr-only" value={index + 1} max={steps.length} />

        <h1
          className="mt-6 font-[family-name:var(--font-heading)] text-[1.625rem] font-semibold leading-tight text-[var(--ink)]"
          data-testid="configurator-step-label"
        >
          {current.label}
        </h1>

        <div className="mt-7 space-y-8">
          {current.fields.map((field) => (
            <div key={field.id}>
              {current.fields.length > 1 ? (
                <p className="mb-3 text-[0.9375rem] font-semibold text-[var(--ink)]">{field.label}</p>
              ) : null}
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {field.options.map((option) => {
                  const selected = answers[field.id] === option.value;
                  const photo = resolveConfiguratorPhoto(option.image, option.label);
                  return (
                    <button
                      key={option.value}
                      type="button"
                      data-testid={`configurator-option-${field.id}-${option.value}`}
                      aria-pressed={selected}
                      onClick={() => selectOption(field, option.value, current)}
                      className={`lift rounded-[var(--radius-card)] p-1.5 text-left transition-colors ${
                        selected ? 'border-2 border-[var(--brand)] bg-[var(--surface)]' : 'border border-[var(--border)] bg-[var(--canvas)]'
                      }`}
                    >
                      <PhotoFigure photo={photo} ratio="aspect-square" sizes="(min-width: 768px) 200px, 33vw" className="pointer-events-none" />
                      <p className="mt-2 px-1 pb-1 text-center text-[0.8125rem] font-semibold leading-snug text-[var(--ink)]">
                        {option.label}
                      </p>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        <div className="mt-8 flex items-center justify-between gap-4 border-t border-[var(--border)] pt-6">
          <button
            type="button"
            className="text-sm font-medium text-[var(--ink-muted)] underline underline-offset-4 hover:text-[var(--brand)] disabled:opacity-40 disabled:hover:text-[var(--ink-muted)]"
            onClick={() => setIndex((value) => Math.max(0, value - 1))}
            disabled={index === 0}
          >
            Atrás
          </button>
          {/* Only shown for a multi-field step (window + setting): single-field
              steps auto-advance on selection, so there is nothing to click. */}
          {current.fields.length > 1 ? (
            <button
              type="button"
              data-testid="configurator-continue"
              className={buttonClass('primary', 'px-7 py-3.5')}
              onClick={() => advance(current)}
              disabled={!canContinue}
            >
              {isLastStep ? 'Ver mi resumen' : 'Continuar'}
              <span aria-hidden="true">→</span>
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function Summary({
  configurator,
  marketplaceSlug,
  answers,
  onBack,
}: {
  configurator: ConfiguratorConfig;
  marketplaceSlug: string;
  answers: Answers;
  onBack: () => void;
}) {
  const sizeValue = answers[configurator.sizeFieldId];
  const band = configurator.priceBands.find((entry) => entry.sizeValue === sizeValue);

  const chosen = configurator.steps.flatMap((step) =>
    step.fields.flatMap((field) => {
      const value = answers[field.id];
      const option = field.options.find((candidate) => candidate.value === value);
      return option ? [{ field, option }] : [];
    }),
  );

  return (
    <div className="gutter mx-auto w-full max-w-[720px] py-10 md:py-16" data-testid="configurator-summary">
      <div className="rounded-[var(--radius-panel)] border border-[var(--border)] bg-[var(--surface)] p-6 shadow-[var(--shadow)] md:p-9">
        <p className="text-[0.6875rem] font-bold uppercase tracking-[0.15em] text-[var(--brand)]">Tu sauna, a tu medida</p>
        <h1 className="mt-2 font-[family-name:var(--font-heading)] text-[1.625rem] font-semibold leading-tight text-[var(--ink)]">
          Esto es lo que armaste
        </h1>

        <div className="mt-7 grid grid-cols-2 gap-4 sm:grid-cols-3">
          {chosen.map(({ field, option }) => {
            const photo = resolveConfiguratorPhoto(option.image, option.label);
            return (
              <div key={field.id}>
                <PhotoFigure photo={photo} ratio="aspect-square" sizes="(min-width: 768px) 200px, 33vw" />
                <p className="mt-2 text-center text-[0.8125rem] font-semibold leading-snug text-[var(--ink)]">{option.label}</p>
              </div>
            );
          })}
        </div>

        {band ? (
          <div className="mt-8 rounded-[var(--radius-card)] border border-[var(--border)] bg-[var(--canvas)] p-5 text-center">
            <p className="text-[0.6875rem] font-bold uppercase tracking-[0.15em] text-[var(--ink-subtle)]">Estimado aproximado</p>
            <p className="mt-1 text-2xl font-semibold text-[var(--ink)]">{band.label}</p>
            <p className="mt-1 text-sm text-[var(--ink-muted)]">
              Un rango orientativo, no una cotización — el precio real depende de tu ubicación y del proveedor.
            </p>
          </div>
        ) : null}

        <div className="mt-8 flex flex-col-reverse items-center gap-4 border-t border-[var(--border)] pt-6 sm:flex-row sm:justify-between">
          <button
            type="button"
            className="text-sm font-medium text-[var(--ink-muted)] underline underline-offset-4 hover:text-[var(--brand)]"
            onClick={onBack}
          >
            Atrás
          </button>
          <Link
            href={cotizarHref(configurator, answers)}
            data-testid="configurator-cta"
            className={buttonClass('primary', 'w-full px-7 py-3.5 text-center sm:w-auto')}
            onClick={() => beacon(marketplaceSlug, 'configurator_to_cotizar_handoff', { configuratorVersion: configurator.version })}
          >
            Cotizar mi proyecto
            <span aria-hidden="true">→</span>
          </Link>
        </div>
      </div>
    </div>
  );
}
