import { afterEach, describe, expect, it, vi } from 'vitest';
import { fallbackHeroImage, heroPhotoFor, pickHeroImage, topicFor } from '@/modules/blog/hero-image';

/**
 * The blog publishes daily against a catalogue of ten photos, so images
 * repeated and matched their article only by accident. These pin the two things
 * that fixed it: the search follows the subject, and no two posts get the same
 * photograph.
 */

const KEY = 'test-key';

function pexelsResponse(ids: number[]) {
  return {
    ok: true,
    json: async () => ({
      photos: ids.map((id) => ({
        url: `https://www.pexels.com/photo/${id}/`,
        photographer: `Photographer ${id}`,
        src: { large2x: `https://images.pexels.com/photos/${id}/x.jpeg` },
      })),
    }),
  } as unknown as Response;
}

afterEach(() => vi.unstubAllGlobals());

describe('topicFor', () => {
  it.each([
    ['Crioterapia: qué es, tipos y riesgos reales', 'cryotherapy'],
    ['Baño de vapor: temperaturas reales y protocolo', 'steam room'],
    ['Beneficios del sauna infrarrojo', 'infrared'],
    ['Temazcal: qué es y cómo entrar seguro', 'sweat lodge'],
    ['Ducha fría: beneficios reales', 'cold shower'],
    ['Sauna para exterior: instalación y costos', 'outdoor'],
    ['Sauna portátil: qué esperar', 'portable'],
    ['Recuperación muscular: qué funciona', 'recovery'],
  ])('routes %s to a %s search', (title, expected) => {
    expect(topicFor(title).query).toContain(expected);
  });

  it('falls back to a sauna interior when nothing matches', () => {
    expect(topicFor('Un título sin tema reconocible').query).toBe('sauna wood interior');
  });

  it('always describes the photo as illustrative, never as a real installation', () => {
    // These are stock photos, not work by providers in the directory.
    for (const title of ['Crioterapia', 'Sauna en casa', 'algo sin tema']) {
      expect(topicFor(title).alt.toLowerCase()).toContain('ilustrativa');
    }
  });

  it('matches a bare slug, not just a title', () => {
    // The slug is hyphenated and unaccented ("ducha-fria" vs "Ducha fría").
    // Before normalising, every pattern with a space or an accent silently
    // missed and the article fell through to the generic sauna default.
    expect(topicFor('ducha-fria-beneficios-reales').query).toContain('cold shower');
    expect(topicFor('inmersion-en-agua-fria-protocolo').query).toContain('cold water');
    expect(topicFor('sauna-portatil-que-esperar').query).toContain('portable');
  });

  it('routes the live archive to on-topic searches, with no article left on the default', () => {
    // The 16 slugs published on saunas.mx when this was built. Falling back to
    // the generic default is what "unrelated image" looked like.
    const live = [
      'bano-de-hielo-temperatura-tiempo-y-protocolo-real',
      'bano-de-vapor-temperaturas-reales-tiempos-y-protocolo-seguro',
      'beneficios-del-sauna-infrarrojo-lo-que-si-sostiene-la-evidencia',
      'crioterapia-que-es-tipos-temperaturas-y-riesgos-reales',
      'ducha-fria-beneficios-reales-temperaturas-y-tiempos',
      'inmersion-en-agua-fria-temperaturas-tiempos-y-evidencia',
      'instalacion-de-sauna-requisitos-medidas-y-errores-comunes',
      'recuperacion-muscular-que-funciona-segun-la-evidencia',
      'sauna-en-casa-tipos-requisitos-costos-y-protocolo-real',
      'sauna-para-exterior-instalacion-costos-y-uso-real',
      'sauna-portatil-que-esperar-temperaturas-y-protocolo',
      'temazcal-que-es-temperaturas-reales-y-como-entrar-seguro',
      'terapia-de-contraste-frio-y-calor-para-que-sirve-realmente',
    ];
    for (const slug of live) {
      expect(topicFor(slug).query, `${slug} fell through to the default`).not.toBe('sauna wood interior');
    }
  });

  it('prefers the more specific subject when two could match', () => {
    // "baño de vapor" also contains no cold word, but "hielo" is the subject.
    expect(topicFor('Baño de hielo en casa').query).toContain('ice bath');
  });
});

describe('pickHeroImage', () => {
  it('searches on the article subject, not the slug hash', async () => {
    const fetchMock = vi.fn().mockResolvedValue(pexelsResponse([1]));
    vi.stubGlobal('fetch', fetchMock);

    await pickHeroImage({ title: 'Crioterapia: riesgos reales', slug: 'crioterapia', apiKey: KEY });

    expect(fetchMock).toHaveBeenCalledOnce();
    expect(String(fetchMock.mock.calls[0]![0])).toContain('cryotherapy');
  });

  it('never returns a photo another article is already using', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(pexelsResponse([1, 2, 3])));

    const used = new Set(['https://images.pexels.com/photos/1/x.jpeg', 'https://images.pexels.com/photos/2/x.jpeg']);
    const hero = await pickHeroImage({ title: 'Sauna en casa', slug: 'sauna-en-casa', usedUrls: used, apiKey: KEY });

    expect(hero.url).toBe('https://images.pexels.com/photos/3/x.jpeg');
  });

  it('skips photos credited to a sauna manufacturer', async () => {
    // This site ranks sauna vendors. A manufacturer's cabin as our hero, with
    // their name in the credit under the headline, reads as a partnership we
    // have not disclosed. The static catalogue excludes these already; the
    // search reintroduced them until this filter existed — the live Pexels
    // result for "temazcal" was a HUUM product shot.
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          photos: [
            { url: 'https://www.pexels.com/photo/1/', photographer: 'HUUM  │sauna heaters', src: { large2x: 'https://images.pexels.com/photos/1/x.jpeg' } },
            { url: 'https://www.pexels.com/photo/2/', photographer: 'Harvia', src: { large2x: 'https://images.pexels.com/photos/2/x.jpeg' } },
            { url: 'https://www.pexels.com/photo/3/', photographer: 'Ana Fotógrafa', src: { large2x: 'https://images.pexels.com/photos/3/x.jpeg' } },
          ],
        }),
      } as unknown as Response),
    );

    const hero = await pickHeroImage({ title: 'Temazcal: qué es', slug: 'temazcal', apiKey: KEY });
    expect(hero.photographer).toBe('Ana Fotógrafa');
    expect(hero.url).toBe('https://images.pexels.com/photos/3/x.jpeg');
  });

  it('falls back rather than publishing a brand photo when every result is one', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          photos: [{ url: 'https://www.pexels.com/photo/1/', photographer: 'Sunlighten', src: { large2x: 'https://images.pexels.com/photos/1/x.jpeg' } }],
        }),
      } as unknown as Response),
    );

    const hero = await pickHeroImage({ title: 'Sauna en casa', slug: 'sauna-en-casa', apiKey: KEY });
    expect(hero.url.startsWith('/img/')).toBe(true);
  });

  it('keeps the photographer and the source page for the credit line', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(pexelsResponse([7])));

    const hero = await pickHeroImage({ title: 'Sauna en casa', slug: 's', apiKey: KEY });
    expect(hero.photographer).toBe('Photographer 7');
    expect(hero.source).toBe('https://www.pexels.com/photo/7/');
  });

  it('falls back to the catalogue instead of throwing when the API fails', async () => {
    // A dead image API must not cost the agent its daily article.
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')));

    const hero = await pickHeroImage({ title: 'Sauna en casa', slug: 'sauna-en-casa', apiKey: KEY });
    expect(hero.url).toBe(fallbackHeroImage('sauna-en-casa').url);
    expect(hero.url.startsWith('/img/')).toBe(true);
  });

  it('falls back when Pexels answers with an error status', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 429, statusText: 'Too Many Requests' }));

    const hero = await pickHeroImage({ title: 'Sauna en casa', slug: 'sauna-en-casa', apiKey: KEY });
    expect(hero.url.startsWith('/img/')).toBe(true);
  });

  it('falls back when every result is already taken', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(pexelsResponse([1])));

    const hero = await pickHeroImage({
      title: 'Sauna en casa',
      slug: 'sauna-en-casa',
      usedUrls: ['https://images.pexels.com/photos/1/x.jpeg'],
      apiKey: KEY,
    });
    expect(hero.url.startsWith('/img/')).toBe(true);
  });

  it('does not call the API at all without a key', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const hero = await pickHeroImage({ title: 'Sauna en casa', slug: 'sauna-en-casa', apiKey: '' });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(hero.url.startsWith('/img/')).toBe(true);
  });
});

describe('heroPhotoFor', () => {
  it('renders the stored image when the post has one', () => {
    const photo = heroPhotoFor({
      slug: 'x',
      heroImageUrl: 'https://images.pexels.com/photos/9/x.jpeg',
      heroImageAlt: 'Imagen ilustrativa de una sauna',
      heroImagePhotographer: 'Ada',
    });
    expect(photo).toMatchObject({ url: 'https://images.pexels.com/photos/9/x.jpeg', photographer: 'Ada' });
  });

  it('falls back to the catalogue for a post published before hero images existed', () => {
    const photo = heroPhotoFor({
      slug: 'inmersion-en-agua-fria',
      heroImageUrl: null,
      heroImageAlt: null,
      heroImagePhotographer: null,
    });
    expect('id' in photo).toBe(true);
  });
});
