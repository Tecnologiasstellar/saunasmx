import { z } from 'zod';

/**
 * Raw file schema for an optional per-marketplace visual configurator
 * (`config/marketplaces/<slug>/configurator.json`). A marketplace that has no
 * use for a visual pre-questionnaire simply omits `configurator` from
 * marketplace.yaml — see marketplace-config/schema.ts.
 *
 * This is deliberately its own small schema rather than a reuse of
 * questionnaireFileSchema: the configurator has no contact/consent step, every
 * field is image-driven, and it is never graded (see lead-scoring). It shares
 * only the id/value/label vocabulary already established by the questionnaire.
 */

const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const KEY = /^[a-z0-9]+(_[a-z0-9]+)*$/;

const optionSchema = z.strictObject({
  value: z.string().regex(KEY),
  label: z.string().min(1),
  image: z.strictObject({
    /** Pexels photo id. Downloaded into public/img by scripts/fetch-photos.ts — see src/modules/ui/photos.ts. */
    id: z.number().int().positive(),
    photographer: z.string().min(1),
    sourcePage: z.url(),
  }),
});

const fieldSchema = z.strictObject({
  id: z.string().regex(KEY),
  label: z.string().min(1),
  options: z.array(optionSchema).min(2),
});

const stepSchema = z.strictObject({
  id: z.string().regex(KEY),
  label: z.string().min(1),
  // Normally one field (one photo-grid choice) per step. The last step is
  // allowed a second field so two short related choices (window, setting)
  // share one screen instead of stretching a 5-step flow to 6.
  fields: z.array(fieldSchema).min(1).max(2),
});

const priceBandSchema = z.strictObject({
  /** References an option value of the step named by `sizeFieldId` below. */
  sizeValue: z.string().regex(KEY),
  label: z.string().min(1),
  minMxn: z.number().int().min(0),
  maxMxn: z.number().int().min(0).nullable(),
});

export const configuratorFileSchema = z
  .strictObject({
    id: z.string().regex(SLUG),
    version: z.number().int().positive(),
    locale: z.string().min(2),
    steps: z.array(stepSchema).min(1),
    /** The field id whose option values `priceBands` keys off of. Must name a real field. */
    sizeFieldId: z.string().regex(KEY),
    /** A rough, directional MXN range per size — not a quote. See docs/00-product-brief.md. */
    priceBands: z.array(priceBandSchema).min(1),
  })
  .superRefine((value, ctx) => {
    const fieldIds = new Set<string>();
    for (const [stepIndex, step] of value.steps.entries()) {
      for (const [fieldIndex, field] of step.fields.entries()) {
        if (fieldIds.has(field.id)) {
          ctx.addIssue({ code: 'custom', path: ['steps', stepIndex, 'fields', fieldIndex, 'id'], message: `duplicate field id "${field.id}"` });
        }
        fieldIds.add(field.id);
      }
    }

    const sizeField = value.steps.flatMap((step) => step.fields).find((field) => field.id === value.sizeFieldId);
    if (!sizeField) {
      ctx.addIssue({ code: 'custom', path: ['sizeFieldId'], message: `references unknown field "${value.sizeFieldId}"` });
    } else {
      const known = new Set(sizeField.options.map((option) => option.value));
      for (const [index, band] of value.priceBands.entries()) {
        if (!known.has(band.sizeValue)) {
          ctx.addIssue({
            code: 'custom',
            path: ['priceBands', index, 'sizeValue'],
            message: `references option "${band.sizeValue}", which "${value.sizeFieldId}" does not offer`,
          });
        }
      }
    }
  });

export type ConfiguratorFile = z.infer<typeof configuratorFileSchema>;
