/**
 * Picks the hero photograph for an article from the article's own subject.
 *
 * The problem this replaces: the image was derived by hashing the slug against
 * a fixed pool of ten. With one article a day the pool ran out immediately, so
 * photos repeated, and any match between a photo and its article was luck.
 *
 * Here the topic is read out of the title, turned into an English search (the
 * language Pexels actually indexes), and the first result not already used by
 * another post is frozen onto the row. Two guarantees follow: an article's
 * image never changes once published, and no two articles share one.
 *
 * Degrades instead of failing. No API key, a dead API, a search with no usable
 * result — each falls back to the static catalogue, which is worse but never
 * blank. The daily agent must not lose a day over a photograph.
 */
import { articlePhoto, photoSrc, type Photo } from '../ui/photos';

export type HeroImage = {
  url: string;
  alt: string;
  photographer: string;
  source: string;
};

/**
 * Subject → search terms, most specific first.
 *
 * English queries because Pexels' Spanish index is thin: "crioterapia" returns
 * almost nothing, "cryotherapy" returns hundreds. The Spanish half is the alt
 * text, which is what a screen reader in Mexico actually reads out.
 *
 * "Ilustrativa" is load-bearing in every alt: these are stock photographs, not
 * the installations of providers in the directory, and the alt text must not
 * let anyone believe otherwise.
 */
const TOPICS: Array<{ match: RegExp; query: string; alt: string }> = [
  { match: /temazcal/, query: 'sweat lodge steam ritual', alt: 'Imagen ilustrativa de un temazcal' },
  { match: /crioterapia|criogenic/, query: 'cryotherapy chamber', alt: 'Imagen ilustrativa de una cámara de crioterapia' },
  { match: /hielo/, query: 'ice bath cold plunge', alt: 'Imagen ilustrativa de un baño de hielo' },
  { match: /ducha fria/, query: 'cold shower water', alt: 'Imagen ilustrativa de una ducha fría' },
  { match: /vapor/, query: 'steam room', alt: 'Imagen ilustrativa de un baño de vapor' },
  { match: /infrarroj/, query: 'infrared sauna cabin', alt: 'Imagen ilustrativa de una sauna de infrarrojos' },
  { match: /contraste/, query: 'sauna and cold plunge', alt: 'Imagen ilustrativa de terapia de contraste' },
  { match: /inmersion|agua fria|plunge/, query: 'cold water immersion winter', alt: 'Imagen ilustrativa de inmersión en agua fría' },
  { match: /recuperacion|muscular|deportiv/, query: 'athlete recovery cold therapy', alt: 'Imagen ilustrativa de recuperación después del ejercicio' },
  // Form factor before generic aspects: "sauna para exterior: instalación y
  // costos" is an article about an outdoor sauna, not about installation.
  // Nearly every article mentions installation and cost, so those two match
  // last or they swallow everything.
  { match: /exterior|jardin|barril/, query: 'outdoor sauna cabin nature', alt: 'Imagen ilustrativa de una sauna de exterior' },
  { match: /portatil|plegable/, query: 'portable sauna tent', alt: 'Imagen ilustrativa de una sauna portátil' },
  { match: /casa|hogar|domestic/, query: 'home sauna interior', alt: 'Imagen ilustrativa de una sauna en casa' },
  { match: /instalacion|construir|construccion|medidas/, query: 'sauna construction cedar wood interior', alt: 'Imagen ilustrativa de la instalación de una sauna' },
  { match: /costo|precio|presupuesto/, query: 'modern sauna interior wood', alt: 'Imagen ilustrativa de una sauna de madera' },
];

/** Nothing matched: a sauna interior is right for this blog more often than not. */
const DEFAULT_TOPIC = { query: 'sauna wood interior', alt: 'Imagen ilustrativa de una sauna de madera' };

/**
 * Lowercase, unaccented, hyphens as spaces.
 *
 * The match runs over the title *and* the slug, and those are written
 * differently: "Ducha fría" against "ducha-fria". Normalising both to the same
 * shape is why the patterns above can stay plain ASCII with no `[ií]` variants
 * — and why a slug-only match still works when a title is missing.
 */
function normalize(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[-_]+/g, ' ')
    .toLowerCase();
}

export function topicFor(text: string): { query: string; alt: string } {
  const plain = normalize(text);
  const found = TOPICS.find((topic) => topic.match.test(plain));
  return found ? { query: found.query, alt: found.alt } : DEFAULT_TOPIC;
}

type PexelsPhoto = {
  url: string;
  photographer: string;
  src: { large2x?: string; large?: string; original?: string };
};

/**
 * Photographers who are sauna manufacturers publishing their own product shots.
 *
 * This site ranks sauna vendors. A manufacturer's cabin as the hero of our
 * article — credited to that manufacturer by name, right under the headline —
 * reads as a partnership we do not have and have not disclosed. The static
 * catalogue in ui/photos.ts excludes them for the same reason; the search has to
 * apply the rule too, or it quietly reintroduces what the catalogue kept out.
 *
 * Matched loosely (substring, case-insensitive) because Pexels names carry
 * inconsistent punctuation — "HUUM │sauna heaters" arrives with a box-drawing
 * character in the middle.
 */
const BRAND_PHOTOGRAPHERS = ['huum', 'harvia', 'tylo', 'tylöhelo', 'klafs', 'sunlighten', 'clearlight'];

function isBrandOwned(photographer: string): boolean {
  const name = photographer.toLowerCase();
  return BRAND_PHOTOGRAPHERS.some((brand) => name.includes(brand));
}

/**
 * The static catalogue, used when Pexels is unavailable.
 *
 * Delegates to `articlePhoto`, so it still gets the heat/cold narrowing — but
 * it is still hash-based over a pool of ten, which is exactly the repetition
 * this module exists to end. Kept only so a missing key degrades the blog
 * instead of breaking it. Its own alt text is more accurate than the generic
 * one we synthesise for a search result, so it wins.
 */
export function fallbackHeroImage(slug: string): HeroImage {
  const photo = articlePhoto(slug);
  return { url: photoSrc(photo), alt: photo.alt, photographer: photo.photographer, source: photo.source };
}

/**
 * The photo to render for a post.
 *
 * Posts published before hero images existed have no stored image, so they keep
 * falling through to the catalogue rather than rendering a hole. Once the
 * backfill has run this branch only serves rows written while Pexels was down.
 */
export function heroPhotoFor(post: {
  slug: string;
  heroImageUrl: string | null;
  heroImageAlt: string | null;
  heroImagePhotographer: string | null;
  heroImageSource?: string | null;
}): Photo {
  if (!post.heroImageUrl) return articlePhoto(post.slug);
  return {
    url: post.heroImageUrl,
    alt: post.heroImageAlt ?? '',
    photographer: post.heroImagePhotographer ?? 'Pexels',
    source: post.heroImageSource ?? '',
  };
}

export async function pickHeroImage(input: {
  /** Title and keyword both feed the topic match; the title carries the subject. */
  title: string;
  slug: string;
  keyword?: string;
  /** Hero URLs already taken by other posts. Guarantees no two articles match. */
  usedUrls?: Iterable<string>;
  apiKey?: string;
}): Promise<HeroImage> {
  const { query, alt } = topicFor(`${input.title} ${input.keyword ?? ''} ${input.slug}`);
  const used = new Set(input.usedUrls ?? []);
  const apiKey = input.apiKey ?? process.env.PEXELS_API_KEY?.trim();

  if (!apiKey) {
    console.warn('PEXELS_API_KEY is not set — falling back to the static photo catalogue, which repeats.');
    return fallbackHeroImage(input.slug);
  }

  try {
    // Landscape only: every slot that renders this is wider than it is tall, so
    // a portrait source would be cropped to a strip.
    const url = `https://api.pexels.com/v1/search?query=${encodeURIComponent(query)}&per_page=40&orientation=landscape`;
    const response = await fetch(url, { headers: { Authorization: apiKey } });
    if (!response.ok) throw new Error(`Pexels returned ${response.status} ${response.statusText}`);

    const body = (await response.json()) as { photos?: PexelsPhoto[] };
    const photos = body.photos ?? [];

    for (const photo of photos) {
      const src = photo.src.large2x ?? photo.src.large ?? photo.src.original;
      if (!src || used.has(src)) continue;
      if (isBrandOwned(photo.photographer)) continue;
      return { url: src, alt, photographer: photo.photographer, source: photo.url };
    }

    console.warn(`Pexels had no unused photo for "${query}" (${photos.length} checked) — using the catalogue.`);
  } catch (error) {
    console.warn(`Pexels lookup failed (${(error as Error).message}) — using the catalogue.`);
  }

  return fallbackHeroImage(input.slug);
}
