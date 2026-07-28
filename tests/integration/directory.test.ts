import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import type { Database } from '@/modules/database/client';
import { directoryProfile } from '@/modules/database/schema';
import { importProfiles, type CanonicalProfile } from '@/modules/directory/import';
import {
  approvedProviderIds,
  countPublicProfiles,
  getPublicProfile,
  listPublicPaths,
  listPublicProfiles,
  listPublicStates,
  listRelatedProfiles,
} from '@/modules/directory/queries';
import { createTestDatabase } from '../helpers/database';
import { publishRepoConfigs, seedProvider, type PublishedMarketplaces } from '../helpers/fixtures';

/**
 * Two guarantees are tested here, because breaking either one publishes
 * something we said we would not:
 *
 *   1. Nothing reaches a visitor unless an operator published it AND the
 *      research evidence supports a public page.
 *   2. Re-importing refreshed research never silently overwrites an edit an
 *      operator made after a phone call.
 */

let db: Database;
let published: PublishedMarketplaces;

beforeEach(async () => {
  db = await createTestDatabase();
  published = await publishRepoConfigs(db);
});

const sauna = () => published.id('suanas-mx');
const pergola = () => published.id('pergolas-mx');

function profile(overrides: Partial<CanonicalProfile> = {}): CanonicalProfile {
  return {
    kind: 'place',
    sourceDataset: 'sauna_places',
    externalId: 'mxp-001',
    slug: 'ejemplo',
    name: 'Ejemplo Wellness',
    blurb: 'Spa de día en Ciudad de México.',
    about: 'Spa de día en Ciudad de México.',
    accessNote: 'Puedes reservar una sesión directamente.',
    websiteUrl: 'https://ejemplo.mx/',
    city: 'Ciudad de México',
    state: 'Ciudad de México',
    detailsJson: {
      venueType: 'day_spa',
      venueTypeLabel: 'Spa de día',
      accessModel: 'bookable_public',
      accessLabel: 'Reserva pública',
      directBooking: true,
      saunaTypes: ['Sauna'],
      amenities: [],
    },
    factsJson: [{ label: 'Acceso', value: 'Reserva pública' }],
    evidenceStatus: 'core',
    sourceUrlsJson: ['https://ejemplo.mx/'],
    lastVerifiedAt: '2026-07-27',
    ...overrides,
  };
}

const apply = (profiles: CanonicalProfile[], marketplaceId = sauna()) =>
  importProfiles(db, { marketplaceId, profiles, mode: 'apply' });

describe('what the public can see', () => {
  it('publishes core and secondary evidence, and holds back verify', async () => {
    await apply([
      profile({ externalId: 'a', slug: 'core-uno', evidenceStatus: 'core' }),
      profile({ externalId: 'b', slug: 'secundario', evidenceStatus: 'secondary' }),
      profile({ externalId: 'c', slug: 'sin-verificar', evidenceStatus: 'verify' }),
      profile({ externalId: 'd', slug: 'inactivo', evidenceStatus: 'inactive' }),
    ]);

    const slugs = (await listPublicProfiles(db, sauna(), 'place')).map((row) => row.slug);
    expect(slugs).toEqual(['core-uno', 'secundario']);
    expect(await getPublicProfile(db, sauna(), 'place', 'sin-verificar')).toBeNull();
    expect(await getPublicProfile(db, sauna(), 'place', 'inactivo')).toBeNull();
    expect(await countPublicProfiles(db, sauna(), 'place')).toBe(2);
  });

  it('hides a published record whose evidence is only verify', async () => {
    await apply([profile({ externalId: 'x', slug: 'oculto', evidenceStatus: 'verify' })]);
    // Even an operator forcing it public cannot beat the evidence predicate.
    await db.update(directoryProfile).set({ publicationStatus: 'published' }).where(eq(directoryProfile.slug, 'oculto'));
    expect(await getPublicProfile(db, sauna(), 'place', 'oculto')).toBeNull();
  });

  it('hides a draft even when its evidence is core', async () => {
    await apply([profile({ slug: 'borrador' })]);
    await db.update(directoryProfile).set({ publicationStatus: 'draft' }).where(eq(directoryProfile.slug, 'borrador'));
    expect(await getPublicProfile(db, sauna(), 'place', 'borrador')).toBeNull();
  });

  it('never leaks one marketplace into another', async () => {
    await apply([profile({ slug: 'solo-saunas' })]);
    expect(await listPublicProfiles(db, pergola(), 'place')).toHaveLength(0);
    expect(await getPublicProfile(db, pergola(), 'place', 'solo-saunas')).toBeNull();
  });

  it('separates the two kinds, so a slug collision across kinds is fine', async () => {
    await apply([
      profile({ externalId: 'p', kind: 'place', slug: 'nordic' }),
      profile({
        externalId: 's',
        kind: 'provider',
        sourceDataset: 'sauna_suppliers',
        slug: 'nordic',
        detailsJson: { supplierType: 'manufacturer', supplierTypeLabel: 'Fabricante', customBuild: true },
      }),
    ]);
    expect(await getPublicProfile(db, sauna(), 'place', 'nordic')).not.toBeNull();
    expect(await getPublicProfile(db, sauna(), 'provider', 'nordic')).not.toBeNull();
  });

  it('offers only states that actually have public profiles', async () => {
    await apply([
      profile({ externalId: 'a', slug: 'uno', state: 'Yucatán' }),
      profile({ externalId: 'b', slug: 'dos', state: 'Oaxaca', evidenceStatus: 'verify' }),
    ]);
    expect(await listPublicStates(db, sauna(), 'place')).toEqual(['Yucatán']);
  });

  it('keeps non-public profiles out of the sitemap', async () => {
    await apply([
      profile({ externalId: 'a', slug: 'publico' }),
      profile({ externalId: 'b', slug: 'privado', evidenceStatus: 'verify' }),
    ]);
    expect(await listPublicPaths(db, sauna())).toEqual(['/lugares/publico']);
  });

  it('prefers related profiles in the same state and excludes the current one', async () => {
    await apply([
      profile({ externalId: 'a', slug: 'actual', state: 'Yucatán' }),
      profile({ externalId: 'b', slug: 'vecino', state: 'Yucatán' }),
      profile({ externalId: 'c', slug: 'lejano', state: 'Oaxaca' }),
    ]);

    const current = await getPublicProfile(db, sauna(), 'place', 'actual');
    const related = await listRelatedProfiles(db, sauna(), 'place', {
      excludeId: current!.id,
      state: 'Yucatán',
      limit: 2,
    });

    expect(related.map((row) => row.slug)).toEqual(['vecino', 'lejano']);
  });
});

describe('the verified badge', () => {
  it('is earned by an approved provider company, not by a research listing', async () => {
    const { companyId } = await seedProvider(db, {
      name: 'Nordic Sauna',
      marketplaceId: sauna(),
      status: 'approved',
      services: ['traditional'],
      postalPrefixes: ['01'],
    });

    await apply([
      profile({
        externalId: 's1',
        kind: 'provider',
        sourceDataset: 'sauna_suppliers',
        slug: 'con-cuenta',
        detailsJson: { supplierType: 'manufacturer', supplierTypeLabel: 'Fabricante', customBuild: true },
      }),
      profile({
        externalId: 's2',
        kind: 'provider',
        sourceDataset: 'sauna_suppliers',
        slug: 'sin-cuenta',
        detailsJson: { supplierType: 'manufacturer', supplierTypeLabel: 'Fabricante', customBuild: true },
      }),
    ]);
    await db
      .update(directoryProfile)
      .set({ providerCompanyId: companyId })
      .where(eq(directoryProfile.slug, 'con-cuenta'));

    const rows = await listPublicProfiles(db, sauna(), 'provider');
    const verified = await approvedProviderIds(db, sauna(), rows);

    expect(verified.has(companyId)).toBe(true);
    expect(rows.find((row) => row.slug === 'sin-cuenta')?.providerCompanyId).toBeNull();
  });
});

describe('re-importing refreshed research', () => {
  it('writes nothing on a dry run', async () => {
    await importProfiles(db, { marketplaceId: sauna(), profiles: [profile()], mode: 'dry_run' });
    expect(await db.select().from(directoryProfile)).toHaveLength(0);
  });

  it('is idempotent: the same file twice reports no changes', async () => {
    const first = await apply([profile()]);
    expect(first.operations[0]?.operation).toBe('create');

    const second = await apply([profile()]);
    expect(second.operations[0]?.operation).toBe('unchanged');
    expect(second.conflicts).toEqual([]);
    expect(await db.select().from(directoryProfile)).toHaveLength(1);
  });

  it('matches on the research id, so a renamed record updates instead of duplicating', async () => {
    await apply([profile({ name: 'Nombre Viejo' })]);
    await apply([profile({ name: 'Nombre Nuevo' })]);

    const rows = await db.select().from(directoryProfile);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.name).toBe('Nombre Nuevo');
  });

  it('refreshes a field the operator has not touched', async () => {
    await apply([profile({ blurb: 'Original.' })]);
    const result = await apply([profile({ blurb: 'Actualizado.' })]);

    expect(result.conflicts).toEqual([]);
    const [row] = await db.select().from(directoryProfile);
    expect(row?.blurb).toBe('Actualizado.');
  });

  it('reports a conflict and preserves an operator edit', async () => {
    await apply([profile({ blurb: 'Original.' })]);

    // The operator corrects the copy after calling the venue.
    await db.update(directoryProfile).set({ blurb: 'Corregido a mano.' }).where(eq(directoryProfile.externalId, 'mxp-001'));

    const result = await apply([profile({ blurb: 'Otra versión de la investigación.' })]);

    expect(result.conflicts).toEqual([
      { externalId: 'mxp-001', name: 'Ejemplo Wellness', fields: ['blurb'] },
    ]);
    const [row] = await db.select().from(directoryProfile);
    expect(row?.blurb).toBe('Corregido a mano.');
  });

  it('keeps reporting the same conflict until a human resolves it', async () => {
    await apply([profile({ blurb: 'Original.' })]);
    await db.update(directoryProfile).set({ blurb: 'Corregido a mano.' }).where(eq(directoryProfile.externalId, 'mxp-001'));

    const second = await apply([profile({ blurb: 'Nueva.' })]);
    const third = await apply([profile({ blurb: 'Nueva.' })]);

    expect(second.conflicts).toHaveLength(1);
    expect(third.conflicts).toHaveLength(1);
    const [row] = await db.select().from(directoryProfile);
    expect(row?.blurb).toBe('Corregido a mano.');
  });

  it('still refreshes untouched fields alongside a conflicted one', async () => {
    await apply([profile({ blurb: 'Original.', accessNote: 'Acceso original.' })]);
    await db.update(directoryProfile).set({ blurb: 'A mano.' }).where(eq(directoryProfile.externalId, 'mxp-001'));

    await apply([profile({ blurb: 'Ignorada.', accessNote: 'Acceso nuevo.' })]);

    const [row] = await db.select().from(directoryProfile);
    expect(row?.blurb).toBe('A mano.');
    expect(row?.accessNote).toBe('Acceso nuevo.');
  });

  it('pulls a page down when the evidence stops supporting it', async () => {
    await apply([profile({ evidenceStatus: 'core' })]);
    expect(await getPublicProfile(db, sauna(), 'place', 'ejemplo')).not.toBeNull();

    const result = await apply([profile({ evidenceStatus: 'verify' })]);

    expect(result.unpublished).toEqual([{ externalId: 'mxp-001', name: 'Ejemplo Wellness' }]);
    expect(await getPublicProfile(db, sauna(), 'place', 'ejemplo')).toBeNull();
  });

  it('does not re-publish on its own when the evidence recovers', async () => {
    await apply([profile({ evidenceStatus: 'verify' })]);
    await apply([profile({ evidenceStatus: 'core' })]);
    // Publishing stays a deliberate act, so a research flip-flop cannot put a
    // page back up without anyone looking at it.
    expect(await getPublicProfile(db, sauna(), 'place', 'ejemplo')).toBeNull();
  });

  it('leaves a slug alone once it has been published as a URL', async () => {
    await apply([profile({ slug: 'url-original' })]);
    await apply([profile({ slug: 'url-nueva' })]);

    const [row] = await db.select().from(directoryProfile);
    expect(row?.slug).toBe('url-original');
  });
});
