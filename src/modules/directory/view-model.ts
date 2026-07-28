import { parseDetails, parseFacts, parseSourceUrls, type DirectoryKind, type ProfileFact } from './details';
import type { DirectoryRow } from './queries';

/**
 * The adapter between a database row and the page.
 *
 * Components receive only what is on `DirectoryProfileView`. They never see a
 * column name, a raw details blob or a `PENDIENTE`, which is what lets one card
 * and one profile template serve both kinds — and what will let the next
 * category reuse them without touching a component.
 *
 * The two kind-dependent decisions in the whole feature live here: what the
 * primary call to action is, and what the location line is called.
 */

export type ProfileCta = { label: string; href: string; external: boolean };

export type DirectoryProfileView = {
  kind: DirectoryKind;
  slug: string;
  /** Canonical path for this profile. */
  href: string;
  name: string;
  /** Badge copy: what kind of listing this is. */
  typeLabel: string;
  /** What this business is, from its own classification. */
  categoryLabel: string;
  /**
   * `secondary` means the sauna is evidenced but access, availability or price
   * still needs confirming. Shown as words, never as colour alone.
   */
  needsConfirmation: boolean;
  blurb?: string;
  about?: string;
  /** "Acceso" for a place, "Cobertura" for a provider. */
  accessLabel: string;
  accessNote?: string;
  locationLine?: string;
  state?: string;
  address?: string;
  additionalLocations?: string;
  websiteUrl?: string;
  /** Places only. A provider is reached through the questionnaire, where consent is captured. */
  phone?: string;
  primaryCta?: ProfileCta;
  facts: ProfileFact[];
  sourceUrls: string[];
  /** Already formatted for display, e.g. "27 de julio de 2026". */
  lastVerified?: string;
  /** True only when this listing is linked to a provider approved on this marketplace. */
  verified: boolean;
};

export const KIND_PATH: Record<DirectoryKind, string> = { place: '/lugares', provider: '/proveedores' };

const TYPE_LABEL: Record<DirectoryKind, string> = {
  place: 'Lugar para sauna',
  provider: 'Proveedor de saunas',
};

const MONTHS = [
  'enero',
  'febrero',
  'marzo',
  'abril',
  'mayo',
  'junio',
  'julio',
  'agosto',
  'septiembre',
  'octubre',
  'noviembre',
  'diciembre',
];

/**
 * Formats `2026-07-27` as `27 de julio de 2026`.
 *
 * Built from the string's own parts rather than through `Date`: parsing
 * `2026-07-27` yields UTC midnight, which renders as the 26th anywhere west of
 * Greenwich — including every timezone in Mexico.
 */
export function formatVerifiedDate(iso: string | null): string | undefined {
  if (!iso) return undefined;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!match) return undefined;
  const month = MONTHS[Number(match[2]) - 1];
  return month ? `${Number(match[3])} de ${month} de ${match[1]}` : undefined;
}

/** The path to a filtered index, used by breadcrumbs and the "see more" links. */
export function stateHref(kind: DirectoryKind, state: string): string {
  return `${KIND_PATH[kind]}?estado=${encodeURIComponent(state)}`;
}

/** The internal quote route, with the supplier preselected. */
export function quoteHref(slug: string): string {
  return `/cotizar?proveedor=${encodeURIComponent(slug)}`;
}

/**
 * The call to action.
 *
 * A provider's is always internal: the quote form is where consent is captured
 * and where the lead enters the pipeline, so sending the highest-value visitor
 * straight off-site would be giving away the business.
 *
 * A place's is external and its wording depends on the access model, not on the
 * URL. Every venue in the research file publishes the same address for its site
 * and its booking page, so the link alone cannot distinguish "reserve now" from
 * "call and ask" — and a visitor sent to a hotel switchboard by a button that
 * said "Reservar sesión" has been misled by us, not by the hotel.
 */
export function primaryCta(row: DirectoryRow, directBooking: boolean): ProfileCta | undefined {
  if (row.kind === 'provider') {
    return { label: 'Solicitar cotización', href: quoteHref(row.slug), external: false };
  }

  const destination = row.bookingUrl ?? row.websiteUrl;
  if (!destination) return undefined;

  return {
    label: directBooking ? 'Reservar sesión' : 'Ver opciones de reserva',
    href: destination,
    external: true,
  };
}

/** "Roma Norte, Ciudad de México" — as much as the row actually knows. */
function locationLine(row: DirectoryRow): string | undefined {
  if (row.city && row.state && row.city !== row.state) return `${row.city}, ${row.state}`;
  return row.city ?? row.state ?? undefined;
}

const plain = (value: string) =>
  value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .trim();

/**
 * Drops a street address that only repeats the city and state.
 *
 * Several research rows have no street address and record the town twice — Tulum
 * Bath House stores "Tulum, Quintana Roo" as its address — which rendered as
 * "Tulum, Quintana Roo · Tulum, Quintana Roo". Matched exactly rather than by
 * containment, so an address like "Ensenada / Valle de Guadalupe" keeps the part
 * the location line does not carry.
 */
function usefulAddress(row: DirectoryRow, where: string | undefined): string | undefined {
  if (!row.address) return undefined;
  const address = plain(row.address);
  const redundant = [where, row.city, row.state].filter((value): value is string => !!value).map(plain);
  return redundant.includes(address) ? undefined : row.address;
}

/**
 * Builds the view. Returns null when the stored details fail validation, so a
 * single malformed row drops out of a listing instead of breaking the page.
 */
export function toProfileView(row: DirectoryRow, options: { verified?: boolean } = {}): DirectoryProfileView | null {
  const details = parseDetails(row.kind, row.detailsJson);
  if (!details) return null;

  const where = locationLine(row);
  const isPlace = row.kind === 'place';
  const place = isPlace && 'venueTypeLabel' in details ? details : null;
  const provider = !isPlace && 'supplierTypeLabel' in details ? details : null;

  return {
    kind: row.kind,
    slug: row.slug,
    href: `${KIND_PATH[row.kind]}/${row.slug}`,
    name: row.name,
    typeLabel: TYPE_LABEL[row.kind],
    categoryLabel: place?.venueTypeLabel ?? provider?.supplierTypeLabel ?? TYPE_LABEL[row.kind],
    needsConfirmation: row.evidenceStatus === 'secondary',
    blurb: row.blurb ?? undefined,
    about: row.about ?? undefined,
    accessLabel: isPlace ? 'Acceso' : 'Cobertura',
    accessNote: row.accessNote ?? undefined,
    locationLine: where,
    state: row.state ?? undefined,
    address: usefulAddress(row, where),
    additionalLocations: row.additionalLocations ?? undefined,
    websiteUrl: row.websiteUrl ?? undefined,
    phone: place?.phone,
    primaryCta: primaryCta(row, place?.directBooking ?? false),
    facts: parseFacts(row.factsJson),
    sourceUrls: parseSourceUrls(row.sourceUrlsJson),
    lastVerified: formatVerifiedDate(row.lastVerifiedAt),
    verified: options.verified ?? false,
  };
}

/** Maps a list, dropping rows whose stored details no longer validate. */
export function toProfileViews(rows: DirectoryRow[], verifiedIds: Set<string> = new Set()): DirectoryProfileView[] {
  return rows.flatMap((row) => {
    const view = toProfileView(row, { verified: !!row.providerCompanyId && verifiedIds.has(row.providerCompanyId) });
    return view ? [view] : [];
  });
}
