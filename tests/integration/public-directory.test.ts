import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import type { Database } from '@/modules/database/client';
import { providerProfile } from '@/modules/database/schema';
import { serviceLabels } from '@/modules/marketplace-config/labels';
import {
  countPublicProviders,
  getProviderFacets,
  listPublicProviders,
} from '@/modules/provider/public-queries';
import { createTestDatabase } from '../helpers/database';
import { publishRepoConfigs, seedProvider, type PublishedMarketplaces } from '../helpers/fixtures';

/**
 * The public directory is the only place provider records are shown to
 * strangers. These tests hold the two rules that make that safe:
 *
 *   - scope: approved on THIS marketplace, or invisible;
 *   - truth: nothing rendered that the database does not store.
 */

let db: Database;
let published: PublishedMarketplaces;

beforeEach(async () => {
  db = await createTestDatabase();
  published = await publishRepoConfigs(db);
});

const sauna = () => published.id('suanas-mx');
const pergola = () => published.id('pergolas-mx');

describe('public provider directory', () => {
  it('lists only providers approved on the resolved marketplace', async () => {
    await seedProvider(db, {
      name: 'Aprobado Saunas',
      marketplaceId: sauna(),
      status: 'approved',
      services: ['traditional'],
      postalPrefixes: ['01'],
    });
    await seedProvider(db, {
      name: 'Pendiente Saunas',
      marketplaceId: sauna(),
      status: 'pending',
      services: ['traditional'],
      postalPrefixes: ['01'],
    });
    await seedProvider(db, {
      name: 'Aprobado Pergolas',
      marketplaceId: pergola(),
      status: 'approved',
      services: ['wood'],
      postalPrefixes: ['01'],
    });

    const listed = await listPublicProviders(db, sauna());
    expect(listed.map((provider) => provider.displayName)).toEqual(['Aprobado Saunas']);
    expect(await countPublicProviders(db, sauna())).toBe(1);

    // The other marketplace sees its own provider and nobody else's.
    const other = await listPublicProviders(db, pergola());
    expect(other.map((provider) => provider.displayName)).toEqual(['Aprobado Pergolas']);
  });

  it('reports coverage and services exactly as the provider declared them', async () => {
    await seedProvider(db, {
      name: 'Cobertura Real',
      marketplaceId: sauna(),
      services: ['traditional', 'infrared'],
      postalPrefixes: ['01', '03'],
      regionCode: 'CDMX',
    });

    const [provider] = await listPublicProviders(db, sauna());
    expect(provider!.regionCodes).toEqual(['CDMX']);
    expect(provider!.postalPrefixes).toEqual(['01', '03']);
    expect(provider!.serviceKeys.sort()).toEqual(['infrared', 'traditional']);

    // Service keys resolve to the words the questionnaire already shows
    // consumers, never to a raw database key.
    const labels = serviceLabels(published.config('suanas-mx'));
    expect(labels.infrared).toBe('Sauna infrarroja');
  });

  it('does not mark a provider verified unless the operator verified it', async () => {
    const company = await seedProvider(db, { name: 'Sin Verificar', marketplaceId: sauna(), services: ['traditional'] });
    await db
      .update(providerProfile)
      .set({ verificationStatus: 'documents_submitted' })
      .where(eq(providerProfile.providerCompanyId, company.companyId));

    const [provider] = await listPublicProviders(db, sauna());
    expect(provider!.verified).toBe(false);
  });

  it('filters by declared region and service, and returns nothing for an impossible pair', async () => {
    await seedProvider(db, {
      name: 'CDMX Tradicional',
      marketplaceId: sauna(),
      services: ['traditional'],
      postalPrefixes: ['01'],
      regionCode: 'CDMX',
    });
    await seedProvider(db, {
      name: 'Jalisco Infrarrojo',
      marketplaceId: sauna(),
      services: ['infrared'],
      postalPrefixes: ['44'],
      regionCode: 'JAL',
    });

    expect((await listPublicProviders(db, sauna(), { region: 'JAL' })).map((p) => p.displayName)).toEqual([
      'Jalisco Infrarrojo',
    ]);
    expect((await listPublicProviders(db, sauna(), { service: 'traditional' })).map((p) => p.displayName)).toEqual([
      'CDMX Tradicional',
    ]);
    // Region and service must both hold — an impossible pair is empty, not "all".
    expect(await listPublicProviders(db, sauna(), { region: 'JAL', service: 'traditional' })).toEqual([]);
  });

  it('offers only facet values that belong to an approved provider', async () => {
    await seedProvider(db, {
      name: 'Aprobado',
      marketplaceId: sauna(),
      services: ['traditional'],
      postalPrefixes: ['01'],
      regionCode: 'CDMX',
    });
    await seedProvider(db, {
      name: 'Pendiente',
      marketplaceId: sauna(),
      status: 'pending',
      services: ['steam'],
      postalPrefixes: ['99'],
      regionCode: 'BC',
    });

    const facets = await getProviderFacets(db, sauna());
    expect(facets.regions).toEqual(['CDMX']);
    expect(facets.services).toEqual(['traditional']);
  });

  it('returns an empty directory rather than every provider when nobody is approved', async () => {
    await seedProvider(db, { name: 'Pendiente', marketplaceId: sauna(), status: 'pending', services: ['traditional'] });

    expect(await listPublicProviders(db, sauna())).toEqual([]);
    expect(await countPublicProviders(db, sauna())).toBe(0);
    expect(await getProviderFacets(db, sauna())).toEqual({ regions: [], services: [] });
  });

  it('does not expose contact details on the public read model', async () => {
    await seedProvider(db, { name: 'Con Contacto', marketplaceId: sauna(), services: ['traditional'] });

    const [provider] = await listPublicProviders(db, sauna());
    const keys = Object.keys(provider!);
    expect(keys).not.toContain('contactEmail');
    expect(keys).not.toContain('contactPhone');
    expect(JSON.stringify(provider)).not.toContain('@example.com');
  });
});
