import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { list, number, parseCsv, slugify, url, value } from '@/modules/directory/csv';
import { mapPlaces, mapProviders, type Copy, type Terms } from '@/modules/directory/import';

/**
 * The import is where research data becomes public copy, so these tests guard
 * the two failure modes that would actually hurt: publishing "PENDIENTE" as if
 * it were a fact, and publishing an English source string as if it were Spanish.
 */

const dir = join(process.cwd(), 'data', 'directory');
const read = (file: string) => readFileSync(join(dir, file), 'utf8');

const terms = JSON.parse(read('terms.es.json')) as Terms;
const copy = JSON.parse(read('copy.es.json')) as Copy;
const placeRows = parseCsv(read('sauna_places.csv'));
const providerRows = parseCsv(read('sauna_suppliers.csv'));

describe('CSV parsing', () => {
  it('keeps commas and semicolons inside a quoted field', () => {
    const rows = parseCsv('a,b\n"uno, dos; tres",cuatro\n');
    expect(rows).toEqual([{ a: 'uno, dos; tres', b: 'cuatro' }]);
  });

  it('unescapes doubled quotes', () => {
    expect(parseCsv('a\n"dice ""hola"""\n')).toEqual([{ a: 'dice "hola"' }]);
  });

  it('reads a newline inside a quoted field as content, not a row break', () => {
    expect(parseCsv('a,b\n"linea1\nlinea2",z\n')).toEqual([{ a: 'linea1\nlinea2', b: 'z' }]);
  });

  it('parses both research files into the expected row counts', () => {
    expect(placeRows).toHaveLength(39);
    expect(providerRows).toHaveLength(25);
  });
});

describe('unknown values', () => {
  it('treats PENDIENTE as missing, never as a string', () => {
    expect(value('PENDIENTE')).toBeUndefined();
    expect(value('  PENDIENTE  ')).toBeUndefined();
    expect(list('a; PENDIENTE; b')).toEqual(['a', 'b']);
  });

  // saunasystems.mx publishes this literal placeholder instead of an address.
  it('treats a masked placeholder as missing', () => {
    expect(value('[email  protected]')).toBeUndefined();
  });

  it('drops a URL that is not http(s)', () => {
    expect(url('javascript:alert(1)')).toBeUndefined();
    expect(url('no soy una url')).toBeUndefined();
    expect(url('https://saunasteam.com.mx/')).toBe('https://saunasteam.com.mx/');
  });

  it('reads a number only when the cell is one', () => {
    expect(number('1,200')).toBe(1200);
    expect(number('PENDIENTE')).toBeUndefined();
  });
});

describe('slugs', () => {
  it('folds accents rather than dropping the letters', () => {
    expect(slugify('Térmica')).toBe('termica');
    expect(slugify('Saunas y Vapores de Puebla')).toBe('saunas-y-vapores-de-puebla');
  });

  it('collapses punctuation', () => {
    expect(slugify('Sauna & Steam')).toBe('sauna-steam');
    expect(slugify("D'Steam & Sauna / Saunas y Vapores")).toBe('d-steam-sauna-saunas-y-vapores');
  });
});

describe('mapping the real research files', () => {
  const places = mapPlaces(placeRows, terms, copy);
  const providers = mapProviders(providerRows, terms, copy);
  const all = [...places.profiles, ...providers.profiles];

  it('maps every row with no unresolved issues', () => {
    expect(places.issues).toEqual([]);
    expect(providers.issues).toEqual([]);
    expect(all).toHaveLength(64);
  });

  it('never emits PENDIENTE in any field a visitor can see', () => {
    for (const profile of all) {
      const visible = JSON.stringify([
        profile.name,
        profile.blurb,
        profile.about,
        profile.accessNote,
        profile.factsJson,
        profile.city,
        profile.state,
        profile.address,
        profile.additionalLocations,
      ]);
      expect(visible, `${profile.externalId} leaked an unknown value`).not.toContain('PENDIENTE');
    }
  });

  it('gives every profile a unique slug', () => {
    const slugs = places.profiles.map((profile) => profile.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it('gives every published profile a blurb no other one shares', () => {
    // The templated blurb is venue/supplier type plus city, so it collides
    // whenever two businesses share both — four contrast studios in CDMX, six
    // manufacturers in CDMX. `copy.es.json` carries a per-record override; this
    // test is what stops the next research refresh from quietly undoing them.
    const published = all.filter((profile) => profile.evidenceStatus !== 'verify');
    const seen = new Map<string, string[]>();
    for (const profile of published) {
      seen.set(profile.blurb, [...(seen.get(profile.blurb) ?? []), profile.externalId]);
    }

    const shared = [...seen].filter(([, ids]) => ids.length > 1);
    expect(
      shared.map(([blurb, ids]) => `${ids.join(', ')} → "${blurb}"`),
      'add a `blurb` override in data/directory/copy.es.json for these records',
    ).toEqual([]);
  });

  it('carries the research evidence status through unchanged', () => {
    const summit = places.profiles.find((profile) => profile.externalId === 'mxp-015');
    expect(summit?.evidenceStatus).toBe('verify');
    expect(places.profiles.filter((profile) => profile.evidenceStatus === 'verify')).toHaveLength(1);
    expect(providers.profiles.filter((profile) => profile.evidenceStatus === 'verify')).toHaveLength(3);
  });

  it('translates a place into Spanish display copy', () => {
    const koti = places.profiles.find((profile) => profile.externalId === 'mxp-001');
    expect(koti?.slug).toBe('koti-wellness');
    expect(koti?.detailsJson).toMatchObject({
      saunaTypes: ['Seca tradicional', 'Infrarrojo', 'Vapor'],
      directBooking: true,
    });
    expect(koti?.factsJson.find((fact) => fact.label === 'Acceso')?.value).toBe('Sesión social o privada');
  });

  it('prefers a hand-written blurb over the templated one', () => {
    const koti = places.profiles.find((profile) => profile.externalId === 'mxp-001');
    expect(koti?.blurb).toBe(copy['mxp-001']?.blurb);
    expect(koti?.blurb).toContain('tres sedes');
    // The About paragraph is built from the blurb, so an override reaches it too.
    expect(koti?.about?.startsWith(copy['mxp-001']!.blurb!)).toBe(true);
  });

  it('falls back to the template when a record has no override', () => {
    // ReWire Lab carries no `blurb` in copy.es.json, so it exercises the
    // venue-type-plus-city sentence the override exists to replace.
    const rewire = places.profiles.find((profile) => profile.externalId === 'mxp-005');
    expect(copy['mxp-005']?.blurb).toBeUndefined();
    expect(rewire?.blurb).toBe('Casa de baños y club de recuperación en Ciudad de México.');
  });

  it('marks a hotel spa as not directly bookable', () => {
    // The URL cannot tell these apart: every venue lists its homepage as its
    // booking page. Only the access model can.
    const cape = places.profiles.find((profile) => profile.externalId === 'mxp-034');
    expect(cape?.detailsJson).toMatchObject({ directBooking: false });
  });

  it('keeps a provider price note only where a real published price exists', () => {
    const withPrice = providers.profiles.filter((profile) =>
      profile.factsJson.some((fact) => fact.label === 'Precio publicado'),
    );
    expect(withPrice.map((profile) => profile.externalId)).toEqual(['mx-016']);
  });

  it('never publishes the editorial price tier', () => {
    for (const profile of providers.profiles) {
      const facts = JSON.stringify(profile.factsJson);
      expect(facts).not.toContain('Rango estimado');
      expect(facts).not.toContain('priceTier');
    }
  });

  it('normalises CDMX so both files land in one state', () => {
    const states = new Set([...places.profiles, ...providers.profiles].map((profile) => profile.state));
    expect(states).toContain('Ciudad de México');
    expect(states).not.toContain('CDMX');
  });

  it('keeps only valid http(s) source URLs', () => {
    for (const profile of all) {
      for (const source of profile.sourceUrlsJson) expect(source).toMatch(/^https?:\/\//);
    }
  });
});

describe('an incomplete dictionary', () => {
  it('reports a missing translation instead of emitting the English token', () => {
    const stripped: Terms = { ...terms, amenity: {} };
    const { profiles, issues } = mapPlaces(placeRows.slice(0, 1), stripped, copy);

    expect(issues.length).toBeGreaterThan(0);
    expect(issues[0]?.issue).toContain('Falta la traducción');
    expect(profiles[0]?.detailsJson).toMatchObject({ amenities: [] });
    expect(JSON.stringify(profiles[0]?.factsJson)).not.toContain('cold plunge');
  });
});
