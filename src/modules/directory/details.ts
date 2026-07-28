import { z } from 'zod';

/**
 * The kind-specific half of a directory profile.
 *
 * These live in one JSONB column rather than two detail tables. The reason is
 * reuse: the next category's profiles will have entirely different attributes,
 * and adding `pergola_details` — then `pool_details` — would make the schema
 * grow with the catalogue. What must stay queryable (kind, state, publication,
 * evidence) is a real indexed column; what is only ever read back with the row
 * it belongs to is JSON, validated here at the boundary.
 *
 * Several fields are deliberately stored and never rendered. `priceTier` is an
 * editorial 1–5 market-position score the research package assigned, not a price
 * the supplier published; labelling a third party "premium" on their own profile
 * is a claim we have no standing to make. `heatSource`, `experienceClaimed` and
 * `featuredProjects` are kept in the source language for an operator checking a
 * record, not for a visitor.
 */

const optionalText = z.string().trim().min(1).optional();

export const placeDetails = z.object({
  venueType: z.string().trim().min(1),
  venueTypeLabel: z.string().trim().min(1),
  accessModel: z.string().trim().min(1),
  accessLabel: z.string().trim().min(1),
  /**
   * Whether this access model lets a visitor reserve directly.
   *
   * Every venue in the research file publishes its booking URL as its own
   * homepage, so the URL alone cannot tell "reserve a session now" from "call
   * the hotel and ask". The access model can, and it decides the CTA wording —
   * promising a booking that turns out to need a concierge wastes a trip.
   */
  directBooking: z.boolean().default(false),
  /** Spanish, display-ready. */
  saunaTypes: z.array(z.string().trim().min(1)).default([]),
  amenities: z.array(z.string().trim().min(1)).default([]),
  /** Business phone as published on the venue's own site. Places only — see view-model.ts. */
  phone: optionalText,
  /** Source language, internal. The research package rarely establishes it. */
  heatSource: optionalText,
  /** Published starting price where one exists. Kept for future sorting; the visible price is `priceNote`. */
  priceFromMxn: z.number().nonnegative().optional(),
  priceNote: optionalText,
  hours: optionalText,
  operatorEntity: optionalText,
});

export const providerDetails = z.object({
  supplierType: z.string().trim().min(1),
  supplierTypeLabel: z.string().trim().min(1),
  customBuild: z.boolean(),
  establishedYear: z.number().int().min(1800).max(2100).optional(),
  /** Spanish, display-ready. */
  serviceNote: optionalText,
  heaterNote: optionalText,
  priceNote: optionalText,
  /** Source language, internal — an operator's re-verification notes. */
  deliveryScope: optionalText,
  installationScope: optionalText,
  heaterTypes: optionalText,
  woodSpecies: optionalText,
  experienceClaimed: optionalText,
  featuredProjects: optionalText,
  /** Editorial market position, 1–5. Never rendered publicly. */
  priceTier: z.number().int().min(1).max(5).optional(),
});

export type PlaceDetails = z.infer<typeof placeDetails>;
export type ProviderDetails = z.infer<typeof providerDetails>;

export type DirectoryKind = 'place' | 'provider';

/** One row of the facts strip. Written at import, editable by an operator afterwards. */
export const profileFact = z.object({
  label: z.string().trim().min(1),
  value: z.string().trim().min(1),
});

export const profileFacts = z.array(profileFact);

export type ProfileFact = z.infer<typeof profileFact>;

/**
 * Parses a stored details blob. Returns null rather than throwing: one
 * malformed row must not take down a whole index page, and the caller drops the
 * record instead of rendering half of it.
 */
export function parseDetails(kind: DirectoryKind, raw: unknown): PlaceDetails | ProviderDetails | null {
  const schema = kind === 'place' ? placeDetails : providerDetails;
  const result = schema.safeParse(raw);
  return result.success ? result.data : null;
}

export function parseFacts(raw: unknown): ProfileFact[] {
  const result = profileFacts.safeParse(raw);
  return result.success ? result.data : [];
}

/** Source URLs are audit data; anything that is not a valid http(s) URL is dropped. */
export function parseSourceUrls(raw: unknown): string[] {
  const result = z.array(z.string().url()).safeParse(raw);
  return result.success ? result.data.filter((value) => value.startsWith('http')) : [];
}
