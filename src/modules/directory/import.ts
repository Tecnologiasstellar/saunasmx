import { and, eq } from 'drizzle-orm';
import type { Database } from '../database/client';
import { directoryProfile } from '../database/schema';
import { isoDate, list, number, slugify, url, value } from './csv';
import { placeDetails, providerDetails, type DirectoryKind, type ProfileFact } from './details';

/**
 * Turns the two research CSVs into canonical directory profiles.
 *
 * Three rules shape this file:
 *
 * 1. Nothing is invented. Every published string is either a translation of a
 *    column in the source row or a label from `terms.es.json`. Where the
 *    research says a fact is unconfirmed, the Spanish says so too.
 * 2. Unknown is not a value. `PENDIENTE` and masked placeholders become
 *    `undefined` in `csv.ts`, so no component can ever render the word.
 * 3. Re-running is safe. Records upsert on (marketplace, dataset, external id),
 *    and a field an operator has edited since the last import is reported as a
 *    conflict rather than overwritten — research refreshes should not silently
 *    undo a correction someone made after a phone call.
 */

export type Terms = {
  venueType: Record<string, string>;
  accessModel: Record<string, { label: string; note: string; bookable: boolean }>;
  supplierType: Record<string, string>;
  saunaType: Record<string, string>;
  amenity: Record<string, string>;
};

export type RecordCopy = {
  blurb?: string;
  accessNote?: string;
  priceNote?: string;
  serviceNote?: string;
  heaterNote?: string;
};

export type Copy = Record<string, RecordCopy>;

/** The fields the import owns. Everything else on the row belongs to the operator. */
export type CanonicalProfile = {
  kind: DirectoryKind;
  sourceDataset: string;
  externalId: string;
  slug: string;
  name: string;
  aliases?: string;
  blurb: string;
  about: string;
  accessNote?: string;
  websiteUrl?: string;
  bookingUrl?: string;
  city?: string;
  state?: string;
  address?: string;
  additionalLocations?: string;
  detailsJson: unknown;
  factsJson: ProfileFact[];
  evidenceStatus: 'core' | 'secondary' | 'verify' | 'inactive';
  sourceQuality?: string;
  sourceUrlsJson: string[];
  evidenceNote?: string;
  lastVerifiedAt?: string;
};

/** Issues that need a human before or after the run. Printed by the CLI. */
export type MappingIssue = { externalId: string; issue: string };

export type MappedRows = { profiles: CanonicalProfile[]; issues: MappingIssue[] };

/**
 * The suppliers file writes Mexico City as `CDMX` and the places file writes it
 * in full. They are one state, and a directory that lists both spellings splits
 * its own index.
 */
const STATE_ALIASES: Record<string, string> = {
  CDMX: 'Ciudad de México',
  'Estado de Mexico': 'Estado de México',
};

function normalizeState(raw: string | undefined): string | undefined {
  const state = value(raw);
  return state ? (STATE_ALIASES[state] ?? state) : undefined;
}

function evidenceOf(raw: string | undefined): CanonicalProfile['evidenceStatus'] {
  const status = value(raw);
  // Anything unrecognised is treated as unpublishable, never as publishable.
  return status === 'core' || status === 'secondary' || status === 'inactive' ? status : 'verify';
}

/** "Ciudad de México" or "Tepoztlán, Morelos" — the state is redundant when it repeats the city. */
function placeLine(city: string | undefined, state: string | undefined): string | undefined {
  if (city && state && city !== state) return `${city}, ${state}`;
  return city ?? state;
}

/** Translates `a; b; c` through a dictionary, reporting anything missing rather than emitting English. */
function translateList(
  raw: string | undefined,
  dictionary: Record<string, string>,
  onMissing: (token: string) => void,
): string[] {
  const output: string[] = [];
  for (const token of list(raw)) {
    const translated = dictionary[token];
    if (translated) output.push(translated);
    else onMissing(token);
  }
  return [...new Set(output)];
}

const AMENITIES_IN_FACT = 3;

export function mapPlaces(rows: Array<Record<string, string>>, terms: Terms, copy: Copy): MappedRows {
  const issues: MappingIssue[] = [];
  const taken = new Set<string>();
  const profiles: CanonicalProfile[] = [];

  for (const row of rows) {
    const externalId = value(row.id);
    const name = value(row.name);
    if (!externalId || !name) {
      issues.push({ externalId: externalId ?? '(sin id)', issue: 'Fila sin id o sin nombre; se omite.' });
      continue;
    }

    const note = (issue: string) => issues.push({ externalId, issue });

    const venueType = value(row.venue_type) ?? '';
    const venueTypeLabel = terms.venueType[venueType];
    const accessModel = value(row.access_model) ?? '';
    const access = terms.accessModel[accessModel];

    if (!venueTypeLabel) note(`Falta la traducción de venue_type "${venueType}" en terms.es.json.`);
    if (!access) note(`Falta la traducción de access_model "${accessModel}" en terms.es.json.`);

    const saunaTypes = translateList(row.sauna_type, terms.saunaType, (token) =>
      note(`Falta la traducción de sauna_type "${token}" en terms.es.json.`),
    );
    const amenities = translateList(row.amenities, terms.amenity, (token) =>
      note(`Falta la traducción de amenities "${token}" en terms.es.json.`),
    );

    const record = copy[externalId] ?? {};
    if (!record.priceNote) note('Falta priceNote en copy.es.json; el perfil se publicará sin dato de precio.');

    const city = value(row.city);
    const state = normalizeState(row.state);
    const where = placeLine(city, state);

    const blurb = record.blurb ?? [venueTypeLabel ?? 'Lugar para sauna', where ? `en ${where}` : null].filter(Boolean).join(' ') + '.';
    const accessNote = record.accessNote ?? access?.note;

    const details = placeDetails.parse({
      venueType,
      venueTypeLabel: venueTypeLabel ?? 'Lugar para sauna',
      accessModel,
      accessLabel: access?.label ?? 'Consultar acceso',
      directBooking: access?.bookable ?? false,
      saunaTypes,
      amenities,
      phone: value(row.phone),
      heatSource: value(row.heat_source),
      priceFromMxn: number(row.price_from_mxn),
      priceNote: record.priceNote,
      hours: value(row.hours),
      operatorEntity: value(row.operator_entity),
    });

    const facts: ProfileFact[] = [];
    if (access) facts.push({ label: 'Acceso', value: access.label });
    if (saunaTypes.length > 0) facts.push({ label: 'Sauna', value: saunaTypes.join(' · ') });
    if (amenities.length > 0) {
      facts.push({ label: 'Amenidades', value: amenities.slice(0, AMENITIES_IN_FACT).join(' · ') });
    }
    if (record.priceNote) facts.push({ label: 'Precio', value: record.priceNote });

    const about = [blurb, accessNote, amenities.length > 0 ? `Entre sus instalaciones: ${amenities.join(', ')}.` : null]
      .filter(Boolean)
      .join(' ');

    profiles.push({
      kind: 'place',
      sourceDataset: 'sauna_places',
      externalId,
      slug: uniqueSlug(name, taken),
      name,
      blurb,
      about,
      accessNote,
      websiteUrl: url(row.website),
      bookingUrl: url(row.booking_url),
      city,
      state,
      address: value(row.address),
      detailsJson: details,
      factsJson: facts,
      evidenceStatus: evidenceOf(row.directory_status),
      sourceQuality: value(row.source_quality),
      sourceUrlsJson: list(row.source_urls).flatMap((entry) => {
        const parsed = url(entry);
        return parsed ? [parsed] : [];
      }),
      evidenceNote: value(row.evidence_notes),
      lastVerifiedAt: isoDate(row.last_verified),
    });
  }

  return { profiles, issues };
}

export function mapProviders(rows: Array<Record<string, string>>, terms: Terms, copy: Copy): MappedRows {
  const issues: MappingIssue[] = [];
  const taken = new Set<string>();
  const profiles: CanonicalProfile[] = [];

  for (const row of rows) {
    const externalId = value(row.id);
    const name = value(row.name);
    if (!externalId || !name) {
      issues.push({ externalId: externalId ?? '(sin id)', issue: 'Fila sin id o sin nombre; se omite.' });
      continue;
    }

    const note = (issue: string) => issues.push({ externalId, issue });

    const supplierType = value(row.supplier_type) ?? '';
    const supplierTypeLabel = terms.supplierType[supplierType];
    if (!supplierTypeLabel) note(`Falta la traducción de supplier_type "${supplierType}" en terms.es.json.`);

    const record = copy[externalId] ?? {};
    if (!record.serviceNote) note('Falta serviceNote en copy.es.json.');
    if (!record.accessNote) note('Falta accessNote (cobertura) en copy.es.json.');

    const city = value(row.primary_city);
    const state = normalizeState(row.state);
    const where = placeLine(city, state);
    const customBuild = value(row.custom_build) === 'true';

    const blurb =
      record.blurb ??
      `${supplierTypeLabel ?? 'Proveedor'} de saunas${customBuild ? ' a la medida' : ''}${where ? ` en ${where}` : ''}.`;

    const details = providerDetails.parse({
      supplierType,
      supplierTypeLabel: supplierTypeLabel ?? 'Proveedor de saunas',
      customBuild,
      establishedYear: number(row.established_year),
      serviceNote: record.serviceNote,
      heaterNote: record.heaterNote,
      priceNote: record.priceNote,
      deliveryScope: value(row.delivery_scope),
      installationScope: value(row.installation_scope),
      heaterTypes: value(row.heater_types),
      woodSpecies: value(row.wood_species),
      experienceClaimed: value(row.experience_claimed),
      featuredProjects: value(row.featured_projects),
      priceTier: number(row.price_tier_1_5),
    });

    const facts: ProfileFact[] = [];
    if (supplierTypeLabel) facts.push({ label: 'Tipo', value: supplierTypeLabel });
    if (record.serviceNote) facts.push({ label: 'Servicios', value: record.serviceNote });
    if (record.heaterNote) facts.push({ label: 'Calentador', value: record.heaterNote });
    if (details.establishedYear) facts.push({ label: 'Opera desde', value: String(details.establishedYear) });
    if (record.priceNote) facts.push({ label: 'Precio publicado', value: record.priceNote });

    const about = [blurb, record.serviceNote, record.accessNote].filter(Boolean).join(' ');

    profiles.push({
      kind: 'provider',
      sourceDataset: 'sauna_suppliers',
      externalId,
      slug: uniqueSlug(name, taken),
      name,
      aliases: value(row.aliases),
      blurb,
      about,
      accessNote: record.accessNote,
      websiteUrl: url(row.website),
      city,
      state,
      additionalLocations: value(row.additional_locations),
      detailsJson: details,
      factsJson: facts,
      evidenceStatus: evidenceOf(row.directory_status),
      sourceQuality: value(row.source_quality),
      sourceUrlsJson: list(row.source_urls).flatMap((entry) => {
        const parsed = url(entry);
        return parsed ? [parsed] : [];
      }),
      evidenceNote: value(row.evidence_notes),
      lastVerifiedAt: isoDate(row.last_verified),
    });
  }

  return { profiles, issues };
}

/** Two venues can share a name across states; the URL cannot. */
function uniqueSlug(name: string, taken: Set<string>): string {
  const base = slugify(name) || 'perfil';
  let slug = base;
  for (let suffix = 2; taken.has(slug); suffix += 1) slug = `${base}-${suffix}`;
  taken.add(slug);
  return slug;
}

/* -------------------------------------------------------------------------- */
/* Upsert                                                                     */
/* -------------------------------------------------------------------------- */

/** The text fields a re-import refreshes, and therefore the ones it can collide on. */
const OWNED_FIELDS = [
  'name',
  'blurb',
  'about',
  'accessNote',
  'websiteUrl',
  'bookingUrl',
  'city',
  'state',
  'address',
  'additionalLocations',
  'facts',
] as const;

type OwnedField = (typeof OWNED_FIELDS)[number];
type Snapshot = Partial<Record<OwnedField, string | null>>;

/**
 * Serializes with keys in a fixed order.
 *
 * `jsonb` stores object keys in its own order — by key length, then bytewise —
 * so a value read back from Postgres never stringifies to the byte sequence
 * that was written. Comparing with plain `JSON.stringify` therefore reports
 * every JSON column as changed on every run, which would make the conflict
 * detector cry wolf and hide the edits that matter.
 */
function stableJson(candidate: unknown): string {
  if (candidate === null || candidate === undefined) return 'null';
  if (Array.isArray(candidate)) return `[${candidate.map(stableJson).join(',')}]`;
  if (typeof candidate === 'object') {
    const entries = Object.entries(candidate as Record<string, unknown>)
      .filter(([, value]) => value !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([key, value]) => `${JSON.stringify(key)}:${stableJson(value)}`).join(',')}}`;
  }
  return JSON.stringify(candidate);
}

function snapshotOf(profile: CanonicalProfile): Snapshot {
  return {
    name: profile.name,
    blurb: profile.blurb,
    about: profile.about,
    accessNote: profile.accessNote ?? null,
    websiteUrl: profile.websiteUrl ?? null,
    bookingUrl: profile.bookingUrl ?? null,
    city: profile.city ?? null,
    state: profile.state ?? null,
    address: profile.address ?? null,
    additionalLocations: profile.additionalLocations ?? null,
    facts: stableJson(profile.factsJson),
  };
}

function currentSnapshot(row: typeof directoryProfile.$inferSelect): Snapshot {
  return {
    name: row.name,
    blurb: row.blurb,
    about: row.about,
    accessNote: row.accessNote,
    websiteUrl: row.websiteUrl,
    bookingUrl: row.bookingUrl,
    city: row.city,
    state: row.state,
    address: row.address,
    additionalLocations: row.additionalLocations,
    facts: stableJson(row.factsJson),
  };
}

export type ImportOperation = 'create' | 'update' | 'unchanged';

export type ImportResult = {
  operations: Array<{ externalId: string; name: string; operation: ImportOperation; published: boolean }>;
  /** Fields left alone because an operator had edited them since the last import. */
  conflicts: Array<{ externalId: string; name: string; fields: OwnedField[] }>;
  /** Published records forced back to draft because the research downgraded their evidence. */
  unpublished: Array<{ externalId: string; name: string }>;
};

function publishableAt(evidence: CanonicalProfile['evidenceStatus']): boolean {
  return evidence === 'core' || evidence === 'secondary';
}

/**
 * Upserts mapped profiles.
 *
 * With `mode: 'dry_run'` nothing is written and the same summary is returned, so
 * an operator can read exactly what an apply would do — including which fields
 * it would refuse to touch.
 */
export async function importProfiles(
  db: Database,
  args: { marketplaceId: string; profiles: CanonicalProfile[]; mode: 'dry_run' | 'apply'; now?: Date },
): Promise<ImportResult> {
  const now = args.now ?? new Date();
  const result: ImportResult = { operations: [], conflicts: [], unpublished: [] };

  for (const profile of args.profiles) {
    const [existing] = await db
      .select()
      .from(directoryProfile)
      .where(
        and(
          eq(directoryProfile.marketplaceId, args.marketplaceId),
          eq(directoryProfile.sourceDataset, profile.sourceDataset),
          eq(directoryProfile.externalId, profile.externalId),
        ),
      )
      .limit(1);

    const snapshot = snapshotOf(profile);

    if (!existing) {
      const published = publishableAt(profile.evidenceStatus);
      if (args.mode === 'apply') {
        await db.insert(directoryProfile).values({
          marketplaceId: args.marketplaceId,
          kind: profile.kind,
          slug: profile.slug,
          name: profile.name,
          aliases: profile.aliases ?? null,
          sourceDataset: profile.sourceDataset,
          externalId: profile.externalId,
          blurb: profile.blurb,
          about: profile.about,
          accessNote: profile.accessNote ?? null,
          websiteUrl: profile.websiteUrl ?? null,
          bookingUrl: profile.bookingUrl ?? null,
          city: profile.city ?? null,
          state: profile.state ?? null,
          address: profile.address ?? null,
          additionalLocations: profile.additionalLocations ?? null,
          detailsJson: profile.detailsJson,
          factsJson: profile.factsJson,
          publicationStatus: published ? 'published' : 'draft',
          evidenceStatus: profile.evidenceStatus,
          sourceQuality: profile.sourceQuality ?? null,
          sourceUrlsJson: profile.sourceUrlsJson,
          evidenceNote: profile.evidenceNote ?? null,
          lastVerifiedAt: profile.lastVerifiedAt ?? null,
          importedJson: snapshot,
          updatedAt: now,
        });
      }
      result.operations.push({ externalId: profile.externalId, name: profile.name, operation: 'create', published });
      continue;
    }

    // A field still matching what the last import wrote is ours to refresh. A
    // field that has drifted was edited by an operator, so we leave it and say so.
    const lastImport = (existing.importedJson ?? {}) as Snapshot;
    const current = currentSnapshot(existing);
    const conflicted: OwnedField[] = [];
    const update: Record<string, unknown> = {};

    for (const field of OWNED_FIELDS) {
      if (snapshot[field] === current[field]) continue;
      if (lastImport[field] !== undefined && lastImport[field] !== current[field]) {
        conflicted.push(field);
        continue;
      }
      if (field === 'facts') update.factsJson = profile.factsJson;
      else update[field] = snapshot[field];
    }

    // Research metadata is never operator-owned: it describes the evidence, not
    // the listing. Each is compared so that an unchanged row reports as
    // unchanged — an import that claims to have updated all 64 records every
    // time it runs tells an operator nothing.
    if (stableJson(existing.detailsJson) !== stableJson(profile.detailsJson)) update.detailsJson = profile.detailsJson;
    if (existing.evidenceStatus !== profile.evidenceStatus) update.evidenceStatus = profile.evidenceStatus;
    if (existing.sourceQuality !== (profile.sourceQuality ?? null)) update.sourceQuality = profile.sourceQuality ?? null;
    if (stableJson(existing.sourceUrlsJson) !== stableJson(profile.sourceUrlsJson)) {
      update.sourceUrlsJson = profile.sourceUrlsJson;
    }
    if (existing.evidenceNote !== (profile.evidenceNote ?? null)) update.evidenceNote = profile.evidenceNote ?? null;
    if (existing.lastVerifiedAt !== (profile.lastVerifiedAt ?? null)) {
      update.lastVerifiedAt = profile.lastVerifiedAt ?? null;
    }
    if (existing.aliases !== (profile.aliases ?? null)) update.aliases = profile.aliases ?? null;

    // Safety beats operator preference in one direction only: evidence that no
    // longer supports publication pulls the page down. Re-publishing stays manual.
    const mustUnpublish = !publishableAt(profile.evidenceStatus) && existing.publicationStatus === 'published';
    if (mustUnpublish) {
      update.publicationStatus = 'draft';
      result.unpublished.push({ externalId: profile.externalId, name: profile.name });
    }

    const changed = Object.keys(update).length > 0;

    if (changed) {
      // The snapshot records what this import wrote, so the next run can tell an
      // operator's edit from a stale value. Conflicted fields keep their old
      // baseline: overwriting it would silently adopt the edit as ours.
      const nextSnapshot: Snapshot = { ...snapshot };
      for (const field of conflicted) nextSnapshot[field] = lastImport[field] ?? null;
      update.importedJson = nextSnapshot;
      update.updatedAt = now;

      if (args.mode === 'apply') {
        await db.update(directoryProfile).set(update).where(eq(directoryProfile.id, existing.id));
      }
    }

    if (conflicted.length > 0) {
      result.conflicts.push({ externalId: profile.externalId, name: profile.name, fields: conflicted });
    }

    result.operations.push({
      externalId: profile.externalId,
      name: profile.name,
      operation: changed ? 'update' : 'unchanged',
      published: existing.publicationStatus === 'published' && !mustUnpublish,
    });
  }

  return result;
}
