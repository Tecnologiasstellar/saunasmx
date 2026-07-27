import type { Questionnaire } from '../marketplace-config/types';
import { ButtonLink, Eyebrow } from './primitives';

/**
 * Conversion card floating over the hero.
 *
 * It is presentational on purpose: the real questionnaire is a controlled
 * 9-step form that captures consent and posts a project, and duplicating any of
 * that here would create a second, weaker intake path. So this card previews
 * the first choice the consumer will be asked to make — read from the
 * marketplace's own questionnaire — states the real number of steps, and hands
 * over to `/cotizar`.
 *
 * The options are list items, not buttons. Nothing here pretends to be a
 * control that does not work.
 */
export function QuizPreview({ questionnaire }: { questionnaire: Questionnaire }) {
  const stepCount = questionnaire.steps.length;
  // The first single-select is the first visually meaningful question; the
  // postal-code step ahead of it previews as an empty box.
  const preview = questionnaire.steps.find((step) => step.type === 'single_select');
  const options = preview && 'options' in preview ? preview.options.slice(0, 3) : [];

  return (
    <aside
      aria-labelledby="quiz-preview-heading"
      className="w-full max-w-[400px] rounded-[var(--radius-panel)] border border-[var(--border)] bg-[color-mix(in_srgb,var(--surface)_96%,transparent)] p-7 text-[var(--ink)] shadow-[var(--shadow-float)] backdrop-blur-sm"
    >
      <div className="mb-5 flex items-center justify-between gap-4">
        <Eyebrow tone="subtle">Empieza aquí</Eyebrow>
        <p className="text-[0.6875rem] font-bold uppercase tracking-[0.15em] text-[var(--ink-subtle)]">
          {stepCount} pasos
        </p>
      </div>

      <h2 id="quiz-preview-heading" className="text-xl font-semibold leading-snug">
        {preview?.label ?? 'Cuéntanos tu proyecto'}
      </h2>

      {options.length > 0 ? (
        <ul className="mt-5 grid list-none grid-cols-3 gap-2.5 p-0">
          {options.map((option) => (
            <li
              key={option.value}
              className="flex flex-col items-center gap-2 rounded-[var(--radius-card)] border border-[var(--border)] bg-[var(--canvas)] px-2 py-4 text-center text-[0.78rem] font-medium leading-tight"
            >
              <span
                aria-hidden="true"
                className="h-7 w-7 rounded-full border-2 border-[var(--brand)] bg-[var(--brand-soft)]"
              />
              {option.label}
            </li>
          ))}
        </ul>
      ) : null}

      <ButtonLink href="/cotizar" data-testid="hero-cta" className="mt-6 w-full py-4 text-[0.9375rem]">
        Comenzar <span aria-hidden="true">→</span>
      </ButtonLink>

      <p className="mt-3 text-center text-xs text-[var(--ink-subtle)]">
        Gratis y sin compromiso. Toma unos dos minutos.
      </p>
    </aside>
  );
}
