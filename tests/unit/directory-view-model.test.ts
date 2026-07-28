import { describe, expect, it } from 'vitest';
import type { DirectoryRow } from '@/modules/directory/queries';
import { formatVerifiedDate, primaryCta, toProfileView } from '@/modules/directory/view-model';
import { monogram } from '@/modules/ui/directory-card';

/**
 * The adapter decides what a visitor is promised. Its call-to-action rule is
 * the highest-consequence branch in the feature: one direction sends a lead
 * off-site, the other keeps it in the consented pipeline.
 */

function row(overrides: Partial<DirectoryRow> = {}): DirectoryRow {
  return {
    id: '00000000-0000-0000-0000-000000000001',
    marketplaceId: '00000000-0000-0000-0000-0000000000ff',
    kind: 'place',
    slug: 'ejemplo',
    name: 'Ejemplo Wellness',
    aliases: null,
    sourceDataset: 'sauna_places',
    externalId: 'mxp-999',
    blurb: 'Estudio de terapia de contraste en Ciudad de México.',
    about: null,
    accessNote: 'Puedes reservar una sesión directamente, sin membresía.',
    websiteUrl: 'https://ejemplo.mx/',
    bookingUrl: null,
    city: 'Ciudad de México',
    state: 'Ciudad de México',
    address: null,
    additionalLocations: null,
    detailsJson: {
      venueType: 'day_spa',
      venueTypeLabel: 'Spa de día',
      accessModel: 'bookable_public',
      accessLabel: 'Reserva pública',
      directBooking: true,
      saunaTypes: ['Sauna'],
      amenities: [],
    },
    factsJson: [],
    publicationStatus: 'published',
    evidenceStatus: 'core',
    sourceQuality: 'A',
    sourceUrlsJson: [],
    evidenceNote: null,
    lastVerifiedAt: '2026-07-27',
    providerCompanyId: null,
    importedJson: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as DirectoryRow;
}

describe('primary call to action', () => {
  it('sends a provider to the internal quote route with the slug preselected', () => {
    const cta = primaryCta(row({ kind: 'provider', slug: 'sauna-steam' }), false);
    expect(cta).toEqual({
      label: 'Solicitar cotización',
      href: '/cotizar?proveedor=sauna-steam',
      external: false,
    });
  });

  it('never sends a provider off-site, even when it has a website', () => {
    const cta = primaryCta(row({ kind: 'provider', websiteUrl: 'https://proveedor.mx/' }), false);
    expect(cta?.external).toBe(false);
    expect(cta?.href.startsWith('/cotizar')).toBe(true);
  });

  it('offers a booking only where the access model actually allows one', () => {
    expect(primaryCta(row(), true)?.label).toBe('Reservar sesión');
    expect(primaryCta(row(), false)?.label).toBe('Ver opciones de reserva');
  });

  it('prefers a distinct booking URL over the website', () => {
    const cta = primaryCta(row({ bookingUrl: 'https://reservas.ejemplo.mx/' }), true);
    expect(cta?.href).toBe('https://reservas.ejemplo.mx/');
  });

  it('renders no call to action rather than inventing a destination', () => {
    expect(primaryCta(row({ websiteUrl: null, bookingUrl: null }), true)).toBeUndefined();
  });
});

describe('verification date', () => {
  it('formats without drifting a day west of Greenwich', () => {
    // `new Date('2026-07-27')` is UTC midnight, which is the 26th in Mexico.
    expect(formatVerifiedDate('2026-07-27')).toBe('27 de julio de 2026');
    expect(formatVerifiedDate('2026-01-01')).toBe('1 de enero de 2026');
  });

  it('returns nothing for a missing or malformed date', () => {
    expect(formatVerifiedDate(null)).toBeUndefined();
    expect(formatVerifiedDate('julio 2026')).toBeUndefined();
  });
});

describe('the view', () => {
  it('drops an address that only repeats the city and state', () => {
    const view = toProfileView(row({ city: 'Tulum', state: 'Quintana Roo', address: 'Tulum, Quintana Roo' }));
    expect(view?.locationLine).toBe('Tulum, Quintana Roo');
    expect(view?.address).toBeUndefined();
  });

  it('keeps an address that carries something the location line does not', () => {
    const view = toProfileView(row({ city: 'Valle de Guadalupe', address: 'Ensenada / Valle de Guadalupe' }));
    expect(view?.address).toBe('Ensenada / Valle de Guadalupe');
  });

  it('labels the location row by kind', () => {
    expect(toProfileView(row())?.accessLabel).toBe('Acceso');
    expect(
      toProfileView(
        row({
          kind: 'provider',
          detailsJson: { supplierType: 'manufacturer', supplierTypeLabel: 'Fabricante', customBuild: true },
        }),
      )?.accessLabel,
    ).toBe('Cobertura');
  });

  it('marks a secondary record as needing confirmation', () => {
    expect(toProfileView(row({ evidenceStatus: 'secondary' }))?.needsConfirmation).toBe(true);
    expect(toProfileView(row({ evidenceStatus: 'core' }))?.needsConfirmation).toBe(false);
  });

  it('is unverified unless an approved provider company backs it', () => {
    expect(toProfileView(row())?.verified).toBe(false);
    expect(toProfileView(row(), { verified: true })?.verified).toBe(true);
  });

  it('exposes a phone for a place but never for a provider', () => {
    const place = toProfileView(
      row({ detailsJson: { ...(row().detailsJson as object), phone: '81 8375 7690' } }),
    );
    expect(place?.phone).toBe('81 8375 7690');

    const provider = toProfileView(
      row({
        kind: 'provider',
        detailsJson: { supplierType: 'manufacturer', supplierTypeLabel: 'Fabricante', customBuild: true },
      }),
    );
    expect(provider?.phone).toBeUndefined();
  });

  it('drops a row whose stored details no longer validate', () => {
    expect(toProfileView(row({ detailsJson: { garbage: true } }))).toBeNull();
  });
});

describe('monogram fallback', () => {
  it('uses the first two words', () => {
    expect(monogram('Koti Wellness')).toBe('KW');
  });

  it('skips punctuation-only words', () => {
    expect(monogram('Sauna & Steam')).toBe('SS');
  });

  it('always renders something', () => {
    expect(monogram('—')).toBe('·');
  });
});
