import { and, eq, isNull } from 'drizzle-orm';
import type { Database } from '../database/client';
import { contentBlock, contentPage } from '../database/schema';

/**
 * The landing page copy, and the one function that publishes it.
 *
 * This is site content, not a test fixture: it carries no synthetic people, no
 * example.com addresses and no invented providers, so production is entitled to
 * it. `scripts/seed.ts` and `scripts/bootstrap-production.ts` both call
 * `publishLandingPage` rather than each holding their own copy of the words —
 * which is how production ended up with a homepage that had none.
 *
 * Section copy is deliberately about the installation decision, not about
 * physiological effects. We have no medical source, so the site makes no health
 * claim.
 */

export type ColumnsCopy = {
  /** Anchor id. `nav` in marketplace.yaml links to it, so the two must agree. */
  anchor: string;
  eyebrow: string;
  title: string;
  lead: string;
  columns: Array<{ title: string; tone: 'dark' | 'cold'; items: string[] }>;
};

export type LandingCopy = {
  title: string;
  description: string;
  eyebrow: string;
  hero: string;
  bullets: string[];
  columns: ColumnsCopy;
  faq: Array<{ q: string; a: string }>;
};

export const LANDING_COPY: Record<string, LandingCopy> = {
  'suanas-mx': {
    title: 'Saunas a medida en México',
    description: 'Compara proveedores de saunas verificados y recibe hasta dos propuestas para tu proyecto, sin costo.',
    eyebrow: 'Terapia de contraste en México',
    hero: 'Cuéntanos tu proyecto de sauna y te conectamos con proveedores que sí trabajan en tu zona.',
    columns: {
      anchor: 'ciencia',
      eyebrow: 'Terapia de contraste 101',
      title: 'Lo que cambia entre el calor y el frío',
      lead: 'Un resumen de lo que cada modalidad exige de tu espacio y tu instalación. No damos consejo médico: para eso, consulta a un profesional de la salud.',
      columns: [
        {
          title: 'Calor / Sauna',
          tone: 'dark',
          items: [
            'Tres caminos distintos: tradicional de piedras, infrarroja o baño de vapor',
            'Cada uno pide una instalación eléctrica y una ventilación diferentes',
            'Interior o exterior define el aislamiento, la madera y el mantenimiento',
          ],
        },
        {
          title: 'Frío / Inmersión',
          tone: 'cold',
          items: [
            'La temperatura se sostiene con un enfriador, no cargando hielo',
            'Necesita filtración, desagüe y una toma eléctrica cerca',
            'El tamaño depende de si te sientas o te recuestas dentro',
          ],
        },
      ],
    },
    bullets: [
      'Proveedores que atienden tu código postal',
      'Hasta dos propuestas relevantes, no diez llamadas',
      'Revisamos cada proyecto antes de compartirlo',
    ],
    faq: [
      { q: '¿Cuánto cuesta?', a: 'Para ti es gratis. Los proveedores pagan por participar en el marketplace.' },
      { q: '¿Cuántos proveedores me contactan?', a: 'Un máximo de dos, elegidos por zona, especialidad y presupuesto.' },
      { q: '¿Qué hacen con mis datos?', a: 'Solo los compartimos con los proveedores asignados, y únicamente si nos das tu consentimiento.' },
    ],
  },
  'pergolas-mx': {
    title: 'Pérgolas a medida en México',
    description: 'Compara fabricantes de pérgolas y recibe hasta dos propuestas para tu terraza o jardín, sin costo.',
    eyebrow: 'Sombra a medida en México',
    hero: 'Cuéntanos qué espacio quieres cubrir y te conectamos con fabricantes que trabajan en tu zona.',
    columns: {
      anchor: 'guia',
      eyebrow: 'Materiales 101',
      title: 'Lo que cambia entre la madera y el metal',
      lead: 'Un resumen de lo que cada material exige de tu terraza y de tu presupuesto de mantenimiento.',
      columns: [
        {
          title: 'Madera',
          tone: 'dark',
          items: [
            'Se ve cálida y se integra al jardín sin esfuerzo',
            'Pide sellado periódico, más seguido si le pega el sol directo',
            'La sección de las vigas depende del claro que quieras cubrir',
          ],
        },
        {
          title: 'Aluminio y acero',
          tone: 'cold',
          items: [
            'Aguanta claros más largos con perfiles más delgados',
            'Mantenimiento mínimo, pero la cimentación pesa más en el costo',
            'Permite techos móviles o de lamas, que la madera complica',
          ],
        },
      ],
    },
    bullets: [
      'Fabricantes que atienden tu código postal',
      'Madera, aluminio o acero según tu proyecto',
      'Revisamos cada proyecto antes de compartirlo',
    ],
    faq: [
      { q: '¿Cuánto cuesta?', a: 'Para ti es gratis. Los fabricantes pagan por participar en el marketplace.' },
      { q: '¿Cuántos fabricantes me contactan?', a: 'Un máximo de dos, elegidos por zona, material y presupuesto.' },
      { q: '¿Qué hacen con mis datos?', a: 'Solo los compartimos con los proveedores asignados, y únicamente si nos das tu consentimiento.' },
    ],
  },
};

export type PublishResult = 'created' | 'already-present' | 'no-copy';

/**
 * Publishes the landing page for a marketplace, once.
 *
 * Insert-only by design: if a page already exists it is left alone, because an
 * operator may have edited the copy through the database and a re-run must not
 * silently overwrite their words. Safe to call on every deploy.
 */
export async function publishLandingPage(
  db: Database,
  slug: string,
  marketplaceId: string,
): Promise<PublishResult> {
  const copy = LANDING_COPY[slug];
  if (!copy) return 'no-copy';

  const existing = await db
    .select({ id: contentPage.id })
    .from(contentPage)
    .where(
      and(
        eq(contentPage.marketplaceId, marketplaceId),
        eq(contentPage.pageType, 'landing'),
        eq(contentPage.slug, 'home'),
        isNull(contentPage.deletedAt),
      ),
    )
    .limit(1);
  if (existing.length > 0) return 'already-present';

  const [page] = await db
    .insert(contentPage)
    .values({
      marketplaceId,
      pageType: 'landing',
      slug: 'home',
      title: copy.title,
      description: copy.description,
      searchIntent: 'transactional',
      status: 'published',
      indexingPolicy: 'index',
      lastReviewedAt: new Date(),
    })
    .returning({ id: contentPage.id });

  await db.insert(contentBlock).values([
    {
      pageId: page!.id,
      blockType: 'hero',
      contentJson: { headline: copy.title, body: copy.hero, eyebrow: copy.eyebrow },
      sortOrder: 0,
    },
    { pageId: page!.id, blockType: 'bullets', contentJson: { items: copy.bullets }, sortOrder: 1 },
    { pageId: page!.id, blockType: 'columns', contentJson: copy.columns, sortOrder: 2 },
    { pageId: page!.id, blockType: 'faq', contentJson: { items: copy.faq }, sortOrder: 3 },
  ]);

  return 'created';
}
