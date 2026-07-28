import { z } from 'zod';
import type { GroupField, MarketplaceConfig, Questionnaire } from '../marketplace-config/types';

/**
 * Builds the project-intake input schema from a marketplace's questionnaire.
 *
 * The wire shape is fixed by docs/05-api-contracts.md; which answers are
 * allowed, required, and what option values are valid come entirely from the
 * questionnaire configuration. Adding a category adds no code here.
 */

export const CONSENT_PURPOSE_PROVIDER_SHARING = 'provider_sharing';
export const CONSENT_PURPOSE_LEAD_CONTACT = 'lead_contact';

/** Steps whose answers live in `answers`, rather than in a dedicated payload section. */
export function answerSteps(questionnaire: Questionnaire) {
  return questionnaire.steps.filter(
    (step) => step.type === 'single_select' || step.type === 'multi_select' || step.type === 'long_text',
  );
}

/**
 * Field ids reserved for the intake payload's `location` object — see
 * marketplace-config/schema.ts. Every other group field lands in `answers`,
 * same as a `single_select` step's answer would.
 */
export const LOCATION_FIELD_IDS = new Set(['postal_code', 'city', 'state', 'street_address']);

/** Group-step fields that answer into `answers`, i.e. every field except the reserved location ones. */
export function groupAnswerFields(questionnaire: Questionnaire): GroupField[] {
  return questionnaire.steps.flatMap((step) =>
    step.type === 'group' ? step.fields.filter((field) => !LOCATION_FIELD_IDS.has(field.id)) : [],
  );
}

export function postalCodeStep(questionnaire: Questionnaire) {
  return questionnaire.steps.find((step) => step.type === 'postal_code');
}

export function contactStep(questionnaire: Questionnaire) {
  return questionnaire.steps.find((step) => step.type === 'contact');
}

export function consentStep(questionnaire: Questionnaire) {
  return questionnaire.steps.find((step) => step.type === 'consent');
}

/**
 * Mexican postal codes are exactly five digits. Kept as a config-independent
 * rule for now; move it into localization when a non-MX marketplace appears.
 */
const postalCode = z
  .string()
  .trim()
  .regex(/^\d{5}$/, 'Introduce un código postal de 5 dígitos');

/** Normalizes a Mexican phone number to E.164 where the input allows it. */
export function normalizePhone(raw: string): string | null {
  const trimmed = raw.trim();
  const digits = trimmed.replace(/\D/g, '');
  if (trimmed.startsWith('+')) {
    return digits.length >= 11 && digits.length <= 15 ? `+${digits}` : null;
  }
  if (digits.length === 10) return `+52${digits}`;
  if (digits.length === 12 && digits.startsWith('52')) return `+${digits}`;
  if (digits.length === 13 && digits.startsWith('521')) return `+52${digits.slice(3)}`;
  return null;
}

const phone = z
  .string()
  .trim()
  .min(1, 'Introduce un teléfono')
  .transform((value, ctx) => {
    const normalized = normalizePhone(value);
    if (!normalized) {
      ctx.addIssue({ code: 'custom', message: 'Introduce un teléfono válido de 10 dígitos' });
      return z.NEVER;
    }
    return normalized;
  });

export function buildIntakeSchema(config: MarketplaceConfig) {
  const questionnaire = config.questionnaire;

  const answerShape: Record<string, z.ZodTypeAny> = {};
  for (const step of answerSteps(questionnaire)) {
    if (step.type === 'long_text') {
      const base = z.string().trim().max(step.maxLength, `Máximo ${step.maxLength} caracteres`);
      answerShape[step.id] = step.required ? base.min(1, 'Este campo es obligatorio') : base.optional();
      continue;
    }
    const allowed = step.options.map((option) => option.value);
    const value = z.string().refine((candidate) => allowed.includes(candidate), {
      message: 'Selecciona una de las opciones disponibles',
    });
    if (step.type === 'multi_select') {
      const many = z.array(value).min(step.required ? 1 : 0);
      answerShape[step.id] = step.required ? many : many.optional();
    } else {
      answerShape[step.id] = step.required ? value : value.optional();
    }
  }

  // Group-step fields (e.g. the sauna type/setting/capacity screen) answer
  // into `answers` exactly like a single_select step would. A field with
  // `showIf` can't be required at the type level — visibility depends on a
  // sibling field's answer — so it's always optional here; the superRefine
  // below enforces "required when visible" once the whole `answers` object
  // is available to check against.
  for (const field of groupAnswerFields(questionnaire)) {
    const conditional = Boolean(field.showIf);
    if (field.kind === 'text') {
      const base = z.string().trim();
      let value: z.ZodTypeAny;
      if (field.pattern) {
        const regex = new RegExp(field.pattern);
        value = conditional
          ? base.refine((candidate) => candidate.length === 0 || regex.test(candidate), field.patternMessage ?? 'Formato inválido')
          : base.regex(regex, field.patternMessage ?? 'Formato inválido');
      } else {
        value = conditional ? base : base.min(1, 'Este campo es obligatorio');
      }
      answerShape[field.id] = conditional || !field.required ? value.optional() : value;
    } else {
      const allowed = field.options.map((option) => option.value);
      const value = z.string().refine((candidate) => allowed.includes(candidate), {
        message: 'Selecciona una de las opciones disponibles',
      });
      answerShape[field.id] = conditional || !field.required ? value.optional() : value;
    }
  }

  const contact = contactStep(questionnaire);
  const contactFields = contact?.type === 'contact' ? contact.fields : ['name', 'email', 'phone'];

  const contactShape: Record<string, z.ZodTypeAny> = {};
  if (contactFields.includes('name')) contactShape.name = z.string().trim().min(2, 'Introduce tu nombre').max(120);
  if (contactFields.includes('email')) contactShape.email = z.string().trim().toLowerCase().pipe(z.email('Introduce un correo válido'));
  if (contactFields.includes('phone')) contactShape.phone = phone;

  const schema = z.object({
    marketplaceSlug: z.literal(config.slug),
    contact: z.object(contactShape),
    location: z.object({
      postalCode,
      city: z.string().trim().max(120).optional(),
      state: z.string().trim().max(120).optional(),
      /**
       * Optional. Never used for eligibility/matching, never leaves
       * project_location into analytics, logs, outbox payloads or
       * notifications (see submit-project.ts and docs/10-security-privacy.md).
       */
      streetAddress: z.string().trim().max(200).optional(),
    }),
    answers: z.object(answerShape),
    consent: z.object({
      // Both are required: without provider sharing there is nothing to route.
      leadContact: z.literal(true, { message: 'Necesitamos tu consentimiento para responderte' }),
      providerSharing: z.literal(true, { message: 'Necesitamos tu consentimiento para compartir tu proyecto' }),
      policyVersion: z.string().trim().min(1),
    }),
    attribution: z
      .object({
        source: z.string().trim().max(120).optional(),
        medium: z.string().trim().max(120).optional(),
        campaign: z.string().trim().max(120).optional(),
        referrer: z.string().trim().max(500).optional(),
        landingPath: z.string().trim().max(500).optional(),
      })
      .default({}),
    /**
     * The directory profile the consumer arrived from, when they started at a
     * provider's page.
     *
     * It is a preference, not an assignment. Matching still runs its own
     * eligibility rules and an operator still routes the lead (ADR-005,
     * ADR-008) — a slug in a query string must never be able to hand a lead to
     * a provider who is not approved, in territory and within capacity. Shape
     * is constrained to a slug so the value is safe to store and display.
     */
    preferredProviderSlug: z
      .string()
      .trim()
      .max(80)
      .regex(/^[a-z0-9-]+$/, 'Proveedor no válido')
      .optional(),
    idempotencyKey: z.string().trim().min(8).max(200),
  });

  // A group field's showIf makes it required only when visible — checked here
  // rather than at the field's own type, since visibility depends on a
  // sibling answer that's only available once the whole object has parsed.
  return schema.superRefine((value, ctx) => {
    for (const field of groupAnswerFields(questionnaire)) {
      if (!field.required || !field.showIf) continue;
      const siblingValue = value.answers[field.showIf.field];
      const visible =
        field.showIf.equals !== undefined
          ? siblingValue === field.showIf.equals
          : field.showIf.notEquals !== undefined
            ? siblingValue !== field.showIf.notEquals
            : true;
      if (!visible) continue;
      const current = value.answers[field.id];
      const empty = current === undefined || (typeof current === 'string' && current.trim().length === 0);
      if (empty) {
        ctx.addIssue({ code: 'custom', path: ['answers', field.id], message: 'Este campo es obligatorio' });
      }
    }
  });
}

export type IntakeInput = z.infer<ReturnType<typeof buildIntakeSchema>>;
