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

type PhotoBase = {
  alt: string;
  photographer: string;
  /** Pexels page for this photo — the licence trail. */
  source: string;
  /**
   * CSS object-position. Set per photo because most of these are portrait and
   * the slots are wide: a default centre crop cuts the subject's head off.
   */
  focus?: string;
};

/** One of the images committed under public/img and served by us. */
export type CataloguePhoto = PhotoBase & {
  /** Pexels photo id. Also the filename stem, so any image traces back to its source page. */
  id: number;
  /** Width requested from the Pexels CDN. Natural aspect ratio; CSS does the cropping. */
  width: number;
  /** Which half of contrast therapy this shows. Used to match a photo to an article. */
  mode: 'heat' | 'cold';
};

/**
 * A photo found at publish time and stored on the article, served from the
 * Pexels CDN rather than by us.
 *
 * The catalogue is self-hosted precisely so the site does not depend on someone
 * else's CDN. This one cannot be: it is discovered while the daily agent runs,
 * and Vercel's filesystem is read-only. A real trade-off, accepted because the
 * alternative is a blog whose images repeat forever.
 */
export type RemotePhoto = PhotoBase & { url: string };

export type Photo = CataloguePhoto | RemotePhoto;

export const photoSrc = (photo: Photo) => ('url' in photo ? photo.url : `/img/pexels-${photo.id}.jpg`);
export const photoCredit = (photo: Photo) => `Foto: ${photo.photographer} / Pexels`;
export const photoFocus = (photo: Photo) => photo.focus ?? '50% 50%';

/** Above the fold on every landing page. Fetched wider than the rest because it goes full-bleed. */
export const HERO_PHOTO: CataloguePhoto = {
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
export const ARTICLE_PHOTOS: CataloguePhoto[] = [
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

/**
 * Option-card imagery for /disena-tu-sauna (see src/modules/configurator).
 * `mode` is inert here — these never pass through `poolFor`/`articlePhoto`,
 * it exists only because the shared `Photo` type requires it.
 */
export const CONFIGURATOR_PHOTOS: CataloguePhoto[] = [
  { id: 7598363, alt: 'Interior de una sauna pequeña con acabados en madera', photographer: 'Max Vakhtbovych', source: 'https://www.pexels.com/photo/view-of-a-brown-room-7598363/', width: 1200, mode: 'heat' },
  { id: 32504779, alt: 'Interior de una sauna mediana con una estufa de piedras al centro', photographer: 'HUUM sauna heaters', source: 'https://www.pexels.com/photo/modern-wooden-sauna-interior-with-heater-32504779/', width: 1200, mode: 'heat' },
  { id: 23330922, alt: 'Vista superior de una sauna grande con varias filas de bancas de madera', photographer: 'Batuhan Kocabaş', source: 'https://www.pexels.com/photo/high-angle-view-of-a-sauna-23330922/', width: 1200, mode: 'heat' },
  { id: 19447148, alt: 'Textura cercana de madera de cedro rojo', photographer: 'Karlee Heck', source: 'https://www.pexels.com/photo/wooden-nailed-red-siding-19447148/', width: 1200, mode: 'heat' },
  { id: 29618523, alt: 'Textura cercana de duela de madera clara tipo pino', photographer: 'Qing Luo', source: 'https://www.pexels.com/photo/close-up-of-wooden-floor-with-shadow-pattern-29618523/', width: 1200, mode: 'heat' },
  { id: 36091247, alt: 'Textura de tablones de madera blanca envejecida', photographer: 'wal_ 172619', source: 'https://www.pexels.com/photo/white-rustic-wooden-plank-background-36091247/', width: 1200, mode: 'heat' },
  { id: 10899603, alt: 'Textura cercana de tablones de madera café oscuro', photographer: 'Engin Akyurt', source: 'https://www.pexels.com/photo/brown-wooden-planks-in-close-up-photography-10899603/', width: 1200, mode: 'heat' },
  { id: 36818217, alt: 'Estufa eléctrica con piedras dentro de una cabina de sauna de madera', photographer: 'HUUM sauna heaters', source: 'https://www.pexels.com/photo/modern-sauna-heater-with-stones-in-wooden-cabin-36818217/', width: 1200, mode: 'heat' },
  { id: 31092909, alt: 'Estufa de leña con piedras dentro de una sauna de madera', photographer: 'HUUM sauna heaters', source: 'https://www.pexels.com/photo/modern-sauna-with-wood-fired-heater-and-stones-31092909/', width: 1200, mode: 'heat' },
  { id: 37381280, alt: 'Cabaña rústica de madera de forma rectangular', photographer: 'Margo Evardson', source: 'https://www.pexels.com/photo/rustic-wooden-cabin-in-tartu-county-estonia-37381280/', width: 1200, mode: 'heat' },
  { id: 15857059, alt: 'Sauna tipo barril de madera sobre una terraza rodeada de árboles', photographer: 'Curtis Adams', source: 'https://www.pexels.com/photo/wooden-sauna-on-terrace-15857059/', width: 1200, mode: 'heat' },
  { id: 34923434, alt: 'Cabañas de madera tipo A-frame en un bosque nevado', photographer: 'Helena Jankovičová Kováčová', source: 'https://www.pexels.com/photo/a-frame-wooden-cabins-in-snowy-forest-setting-34923434/', width: 1200, mode: 'heat' },
  { id: 7598370, alt: 'Interior de una sauna con una ventana grande y vista al bosque', photographer: 'Max Vakhtbovych', source: 'https://www.pexels.com/photo/a-sauna-bath-with-a-wooden-interior-7598370/', width: 1200, mode: 'heat' },
  { id: 37816610, alt: 'Interior de una sauna cerrada sin ventana, con bancas de madera', photographer: 'HUUM sauna heaters', source: 'https://www.pexels.com/photo/elegant-modern-indoor-sauna-with-wooden-benches-37816610/', width: 1200, mode: 'heat' },
  { id: 29306914, alt: 'Sauna de madera al aire libre junto a una cabaña rodeada de vegetación', photographer: 'Teju', source: 'https://www.pexels.com/photo/cozy-cabin-in-the-woods-with-outdoor-sauna-29306914/', width: 1200, mode: 'heat' },
];

export const ALL_PHOTOS: CataloguePhoto[] = [HERO_PHOTO, ...ARTICLE_PHOTOS, ...CONFIGURATOR_PHOTOS];

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
function poolFor(slug: string): CataloguePhoto[] {
  const plain = slug.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();
  const wantsCold = COLD_WORDS.some((word) => plain.includes(word));
  const pool = ARTICLE_PHOTOS.filter((photo) => photo.mode === (wantsCold ? 'cold' : 'heat'));
  return pool.length > 0 ? pool : ARTICLE_PHOTOS;
}

export function articlePhoto(slug: string): CataloguePhoto {
  const pool = poolFor(slug);
  return pool[hash(slug) % pool.length]!;
}

/**
 * Same assignment as `articlePhoto`, except no two cards in one list repeat.
 * Without this, two articles whose slugs happen to collide sit side by side on
 * the homepage showing the identical photo, which reads as a bug. Once a pool is
 * exhausted repeats resume — that is better than showing an off-topic photo.
 */
export function articlePhotos(slugs: string[]): CataloguePhoto[] {
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
