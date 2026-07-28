/**
 * The photography catalogue.
 *
 * Every image is Pexels-licensed stock, downloaded into `public/img` so a page
 * render never depends on someone else's CDN staying up. Re-fetch them with
 * `npm run photos:fetch`; the catalogue below is the only source of truth for
 * what gets downloaded and where it came from.
 *
 * Two rules this file exists to keep:
 *
 * 1. These are illustrative photos, not photographs of work by providers in the
 *    directory. Nothing may caption them as a real installation, a real client
 *    or a real result.
 * 2. Several show identifiable people. The Pexels license allows commercial use
 *    but not implied endorsement, so a photo never sits next to a testimonial,
 *    a provider name or a health claim.
 *
 * The Pexels license does not require attribution. We show the photographer
 * anyway: it is the credit they are owed, and it is also what tells a reader
 * the image is stock rather than ours.
 *
 * Need more images? `sauna-cold-therapy-photo-database.csv` in the repo root is
 * the wider candidate pool these were chosen from — about twenty more frames
 * with their Pexels pages and rights notes. Two warnings before pulling from
 * it: its `title` column describes several photos wrongly (an ice bath that is
 * really a salon basin, winter swimming that is really a man on his phone), so
 * look at the frame before trusting the row; and it includes shots with a
 * visible manufacturer's hardware, which this file deliberately excludes.
 * Adding a row there does nothing on its own — a photo only reaches the site
 * by being added to the catalogue below.
 */

export type Photo = {
  /** Pexels photo id. Also the filename stem, so any image traces back to its source page. */
  id: number;
  alt: string;
  photographer: string;
  /** Pexels page for this photo — the licence trail. */
  source: string;
  /** Width requested from the Pexels CDN. Natural aspect ratio; CSS does the cropping. */
  width: number;
  /**
   * CSS object-position. Set per photo because most of these are portrait and
   * the slots are wide: a default centre crop cuts the subject's head off.
   */
  focus?: string;
  /** Which half of contrast therapy this shows. Used to match a photo to an article. */
  mode: 'heat' | 'cold';
};

export const photoSrc = (photo: Photo) => `/img/pexels-${photo.id}.jpg`;
export const photoCredit = (photo: Photo) => `Foto: ${photo.photographer} / Pexels`;
export const photoFocus = (photo: Photo) => photo.focus ?? '50% 50%';

/** Above the fold on every landing page. Fetched wider than the rest because it goes full-bleed. */
export const HERO_PHOTO: Photo = {
  id: 3967280,
  alt: 'Mujer recostada sobre la banca de madera de una sauna',
  photographer: 'Andrea Piacquadio',
  source: 'https://www.pexels.com/photo/woman-in-sauna-3967280/',
  width: 2000,
  mode: 'heat',
  focus: '50% 55%',
};

/**
 * Editorial imagery for blog cards and article covers.
 *
 * Deliberately excludes the frames whose rights note flags a visible
 * manufacturer's hardware: this site ranks sauna vendors, and a brand sitting in
 * our own header would read as a partnership we do not have. Also excludes the
 * cold-water rescue frame, which only belongs beside a safety article.
 */
export const ARTICLE_PHOTOS: Photo[] = [
  {
    id: 8092430,
    alt: 'Interior de una sauna de madera con bancas, cubetas y estufa de piedras',
    photographer: 'Max Vakhtbovych',
    source: 'https://www.pexels.com/photo/interior-of-sauna-8092430/',
    width: 1600,
    mode: 'heat',
  },
  {
    id: 21038556,
    alt: 'Sauna con puerta de vidrio junto a una regadera y un lavabo',
    photographer: 'Alan Albegov',
    source: 'https://www.pexels.com/photo/contemporary-sauna-and-shower-area-21038556/',
    width: 1600,
    mode: 'heat',
  },
  {
    id: 14232280,
    alt: 'Hombre dentro de un agujero abierto en un lago congelado, sosteniendo una taza',
    photographer: 'Till Daling',
    source: 'https://www.pexels.com/photo/man-standing-in-the-frozen-river-and-holding-a-disposable-cup-14232280/',
    width: 1600,
    mode: 'cold',
    focus: '50% 45%',
  },
  {
    // Not the near-identical frame from the same shoot as the hero: two photos of
    // one model in one sauna reads as a stock library with nothing in it.
    id: 4345681,
    alt: 'Mujer en bata leyendo una revista en una sala de descanso con muros de madera',
    photographer: 'Vika Glitter',
    source: 'https://www.pexels.com/photo/focused-woman-reading-magazine-in-sauna-4345681/',
    width: 1600,
    mode: 'heat',
  },
  {
    id: 14815623,
    alt: 'Hombre saliendo por una escalera de un lago congelado',
    photographer: 'Olavi Anttila',
    source: 'https://www.pexels.com/photo/topless-man-in-lake-in-winter-14815623/',
    width: 1600,
    mode: 'cold',
    focus: '50% 45%',
  },
  {
    id: 13542803,
    alt: 'Hombre sentado en la banca de una sauna de madera con los ojos cerrados',
    photographer: 'Esteban Garcia',
    source: 'https://www.pexels.com/photo/man-inside-a-sauna-13542803/',
    width: 1600,
    mode: 'heat',
    focus: '50% 35%',
  },
  {
    id: 7041618,
    alt: 'Mujer recargada en el borde de una alberca al aire libre durante el invierno',
    photographer: 'Yaroslav Shuraev',
    source: 'https://www.pexels.com/photo/photo-of-a-woman-in-a-swimming-pool-during-winter-7041618/',
    width: 1600,
    mode: 'cold',
    focus: '50% 55%',
  },
  {
    id: 19459814,
    alt: 'Hombre saliendo del agua en un lago nevado mientras cae nieve',
    photographer: 'Till Daling',
    source: 'https://www.pexels.com/photo/man-walking-in-water-in-winter-19459814/',
    width: 1600,
    mode: 'cold',
    focus: '50% 32%',
  },
  {
    id: 20763349,
    alt: 'Mujer sumergida hasta los hombros en un lago helado rodeado de nieve',
    photographer: 'Nick Bulanov',
    source: 'https://www.pexels.com/photo/young-woman-bathing-in-a-winter-lake-20763349/',
    width: 1600,
    mode: 'cold',
    focus: '50% 65%',
  },
  {
    id: 35640103,
    alt: 'Persona cortando el hielo de un lago para abrir un acceso al agua',
    photographer: 'Jeff Prezio',
    source: 'https://www.pexels.com/photo/person-cutting-ice-in-frozen-lake-for-winter-swim-35640103/',
    width: 1600,
    mode: 'cold',
  },
];

export const ALL_PHOTOS: Photo[] = [HERO_PHOTO, ...ARTICLE_PHOTOS];

/** Stable across deploys, so an article keeps its image instead of reshuffling on every build. */
function hash(slug: string): number {
  let value = 0;
  for (const char of slug) value = (value * 31 + char.codePointAt(0)!) >>> 0;
  return value;
}

/** Slug words that mean the article is about the cold half, not the sauna. */
const COLD_WORDS = ['fria', 'frio', 'hielo', 'inmersion', 'plunge', 'nieve', 'contraste'];

/**
 * Narrows the pool to photos that match what the article is about.
 *
 * The blog writes a new article every day, so nobody is going to hand-pick an
 * image for each one; without this a cold-plunge guide gets a photo of a hot
 * sauna about half the time. Accent-insensitive because slugs are not reliably
 * normalised.
 */
function poolFor(slug: string): Photo[] {
  const plain = slug.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();
  const wantsCold = COLD_WORDS.some((word) => plain.includes(word));
  const pool = ARTICLE_PHOTOS.filter((photo) => photo.mode === (wantsCold ? 'cold' : 'heat'));
  return pool.length > 0 ? pool : ARTICLE_PHOTOS;
}

export function articlePhoto(slug: string): Photo {
  const pool = poolFor(slug);
  return pool[hash(slug) % pool.length]!;
}

/**
 * Same assignment as `articlePhoto`, except no two cards in one list repeat.
 * Without this, two articles whose slugs happen to collide sit side by side on
 * the homepage showing the identical photo, which reads as a bug. Once a pool is
 * exhausted repeats resume — that is better than showing an off-topic photo.
 */
export function articlePhotos(slugs: string[]): Photo[] {
  const used = new Set<number>();
  return slugs.map((slug) => {
    const pool = poolFor(slug);
    let index = hash(slug) % pool.length;
    for (let tries = 0; tries < pool.length && used.has(pool[index]!.id); tries += 1) {
      index = (index + 1) % pool.length;
    }
    used.add(pool[index]!.id);
    return pool[index]!;
  });
}
