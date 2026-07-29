import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { isProduction, resolveRequestHost } from '@/modules/site/context';
import { Container, Eyebrow, buttonClass } from '@/modules/ui/primitives';
import { SiteFooter, SiteHeader } from '@/modules/ui/site-chrome';

export const revalidate = 3600;

export async function generateMetadata(): Promise<Metadata> {
  const resolution = await resolveRequestHost();
  if (resolution.kind === 'unknown' || !resolution.config.features.blog) {
    return { title: 'Colchón Simple Premium', robots: { index: false, follow: false } };
  }

  const indexable = isProduction() && resolution.config.seo.defaultIndexing;

  return {
    title: 'Colchón SIMPLE Premium Memory Foam | Recuperación después del entrenamiento',
    description:
      'Colchón de espuma con gel refrigerante. Diseñado para mejorar el descanso y la recuperación muscular después de sauna y entrenamiento. Tamaños y precios en México.',
    alternates: { canonical: '/descanso/productos/colchon-simple' },
    robots: { index: indexable, follow: indexable },
    openGraph: {
      type: 'article',
      title: 'Colchón SIMPLE Premium Memory Foam',
      description: 'Recuperación muscular a través del descanso de calidad',
      url: 'https://saunas.mx/descanso/productos/colchon-simple',
    },
  };
}

export default async function MattressProductPage() {
  const resolution = await resolveRequestHost();
  if (resolution.kind === 'unknown') notFound();
  const config = resolution.config;

  return (
    <>
      <SiteHeader config={config} />

      {/* JSON-LD Product + Offer Schema */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            '@context': 'https://schema.org',
            '@type': 'Product',
            name: 'SIMPLE Premium Memory Foam Mattress',
            description: 'Colchón de espuma de memoria con gel refrigerante para recuperación y descanso',
            brand: { '@type': 'Brand', name: 'SIMPLE' },
            image: 'https://simple.mx/images/premium-memory-foam-mattress.jpg',
            url: 'https://simple.mx/product/premium-memory-foam-mattress',
            inLanguage: 'es-MX',
            offers: [
              {
                '@type': 'Offer',
                priceCurrency: 'MXN',
                price: '4800',
                name: 'Individual (100 × 190 × 25 cm)',
                availability: 'https://schema.org/InStock',
                seller: { '@type': 'Organization', name: 'SIMPLE' },
              },
              {
                '@type': 'Offer',
                priceCurrency: 'MXN',
                price: '6400',
                name: 'Matrimonial (135 × 190 × 25 cm)',
                availability: 'https://schema.org/InStock',
                seller: { '@type': 'Organization', name: 'SIMPLE' },
              },
              {
                '@type': 'Offer',
                priceCurrency: 'MXN',
                price: '8000',
                name: 'Queen (150 × 190 × 25 cm)',
                availability: 'https://schema.org/InStock',
                seller: { '@type': 'Organization', name: 'SIMPLE' },
              },
              {
                '@type': 'Offer',
                priceCurrency: 'MXN',
                price: '10400',
                name: 'King (200 × 190 × 25 cm)',
                availability: 'https://schema.org/InStock',
                seller: { '@type': 'Organization', name: 'SIMPLE' },
              },
            ],
            aggregateRating: {
              '@type': 'AggregateRating',
              ratingValue: '7',
              ratingCount: '100',
              bestRating: '10',
              worstRating: '1',
            },
          }).replace(/</g, '\\u003c'),
        }}
      />

      <main>
        <Container className="py-12 md:py-16">
          <header className="max-w-4xl">
            <Eyebrow>Asociado comercial</Eyebrow>
            <h1 className="mt-4 text-[clamp(2rem,5.5vw,3.5rem)] font-semibold leading-[1.1] tracking-[-0.01em] text-balance">
              Colchón SIMPLE Premium Memory Foam
            </h1>
            <p className="mt-6 text-lg leading-relaxed text-[var(--ink-muted)]">
              Un colchón diseñado para mejorar el descanso y la recuperación muscular después de entrenar o usar sauna.
              Espuma de memoria con gel refrigerante, firmeza media-firme y disponible en cuatro tamaños.
            </p>
          </header>

          <section className="mt-12 grid gap-12 md:grid-cols-3">
            {/* Left column: specs and purchasing */}
            <div className="md:col-span-2">
              <h2 className="text-2xl font-semibold mb-6">Especificaciones</h2>

              <div className="mb-8 border-b border-[var(--border)] pb-8">
                <h3 className="text-lg font-semibold mb-4">Tamaños y precios</h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-[var(--border)]">
                        <th className="text-left py-3 px-4 font-semibold text-[var(--ink-subtle)]">Tamaño</th>
                        <th className="text-left py-3 px-4 font-semibold text-[var(--ink-subtle)]">Dimensiones</th>
                        <th className="text-left py-3 px-4 font-semibold text-[var(--ink-subtle)]">Alto</th>
                        <th className="text-right py-3 px-4 font-semibold text-[var(--ink-subtle)]">Precio MXN</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[
                        { size: 'Individual', dims: '100 × 190 cm', height: '25 cm', price: '$4,800' },
                        { size: 'Matrimonial', dims: '135 × 190 cm', height: '25 cm', price: '$6,400' },
                        { size: 'Queen', dims: '150 × 190 cm', height: '25 cm', price: '$8,000' },
                        { size: 'King', dims: '200 × 190 cm', height: '25 cm', price: '$10,400' },
                      ].map((row) => (
                        <tr key={row.size} className="border-b border-[var(--border)]">
                          <td className="py-3 px-4">{row.size}</td>
                          <td className="py-3 px-4">{row.dims}</td>
                          <td className="py-3 px-4">{row.height}</td>
                          <td className="py-3 px-4 text-right font-semibold">{row.price}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="mt-4 text-xs text-[var(--ink-subtle)]">
                  Precios verificados al 29 de julio de 2026. Sujetos a cambios sin previo aviso.
                </p>
              </div>

              <div className="mb-8 border-b border-[var(--border)] pb-8">
                <h3 className="text-lg font-semibold mb-4">Construcción y materiales</h3>
                <ul className="space-y-3 text-[var(--ink)]">
                  <li>
                    <strong>Funda:</strong> Transpirable, removible, lavable a máquina. Proporciona aireación para
                    reducir acumulación de calor.
                  </li>
                  <li>
                    <strong>Espuma de memoria refrigerada:</strong> Infusión de gel que adapta el cuerpo mientras
                    mantiene una temperatura más fresca.
                  </li>
                  <li>
                    <strong>Espuma de soporte adaptativo:</strong> Brinda contorno y alivio de presión en hombros y
                    caderas.
                  </li>
                  <li>
                    <strong>Base de alta densidad:</strong> Núcleo de 50 kg/m³ que mantiene la estructura y el alineamiento
                    de la columna.
                  </li>
                  <li>
                    <strong>Firmeza:</strong> Media-firme (7/10), recomendado para todas las posiciones de sueño.
                  </li>
                </ul>
              </div>

              <div className="mb-8 border-b border-[var(--border)] pb-8">
                <h3 className="text-lg font-semibold mb-4">Garantía y política de devolución</h3>
                <ul className="space-y-3 text-[var(--ink)]">
                  <li>
                    <strong>Garantía:</strong> 10 años contra defectos de fabricación y hundimiento mayor a 2.5 cm.
                    Cubre defectos estructurales, de funda, cierre y tela.
                  </li>
                  <li>
                    <strong>Período de prueba:</strong> 101 noches. Devolución sin cargo, reembolso completo, sin
                    preguntas.
                  </li>
                  <li>
                    <strong>Recomendación:</strong> Pruébalo al menos 30 noches antes de decidir.
                  </li>
                  <li>
                    <strong>Entrega:</strong> Gratis en todo México. Tiempo estimado: 2–5 días hábiles. Se entrega
                    comprimido en caja; alcanza ~90% de su forma en 4 horas y firmeza completa en 24–48 horas.
                  </li>
                  <li>
                    <strong>Instalación:</strong> Entrega en puerta principal o planta baja. Costo adicional para pisos
                    superiores.
                  </li>
                </ul>
              </div>

              <div className="mb-8 border-b border-[var(--border)] pb-8">
                <h3 className="text-lg font-semibold mb-4">Certificaciones</h3>
                <p className="text-[var(--ink)]">
                  <strong>CertiPUR:</strong> Materiales seguros, incluso para bebés. Libre de sustancias nocivas.
                </p>
              </div>

              <div>
                <h3 className="text-lg font-semibold mb-4">¿Por qué ayuda en la recuperación?</h3>
                <div className="space-y-4 text-[var(--ink)]">
                  <p>
                    Un colchón de calidad acelera la recuperación muscular no porque cure, sino porque el <strong>descanso</strong> es
                    cuando realmente ocurre la reparación. Después de entrenar o una sesión de sauna, el cuerpo necesita:
                  </p>
                  <ul className="list-disc list-inside space-y-2 ml-2">
                    <li>
                      <strong>Presión aliviada:</strong> La espuma de memoria reduce puntos de tensión en hombros y caderas,
                      permitiendo que los músculos se relajen completamente.
                    </li>
                    <li>
                      <strong>Temperatura regulada:</strong> El gel refrigerante evita que el cuerpo se sobrecaliente, lo que
                      mejora la calidad del sueño profundo.
                    </li>
                    <li>
                      <strong>Alineamiento de columna:</strong> La base firme mantiene la postura neutral, reduciendo dolor de
                      cuello y espalda.
                    </li>
                    <li>
                      <strong>Sueño sin interrupciones:</strong> El aislamiento de movimiento reduce los despertares cuando tu
                      pareja se mueve.
                    </li>
                  </ul>
                  <p className="pt-2">
                    <em>
                      Nota: SIMPLE no proporciona evidencia clínica de que el colchón acelere específicamente la recuperación
                      muscular. Los beneficios descritos aquí se basan en cómo un sueño de calidad apoya la recuperación natural
                      del cuerpo.
                    </em>
                  </p>
                </div>
              </div>
            </div>

            {/* Right column: CTA and partnership disclosure */}
            <div>
              <div className="sticky top-24 space-y-6">
                <div className="rounded-[var(--radius-panel)] border border-[var(--brand)] bg-[var(--brand-soft)] p-6">
                  <h3 className="font-semibold mb-4">Sobre esta recomendación</h3>
                  <p className="text-sm text-[var(--ink)] mb-4">
                    <strong>SIMPLE es una empresa asociada de Saunas.mx.</strong> Recomendamos sus productos porque creemos
                    que son de calidad y relevantes para la recuperación del usuario. Todos los datos de precios,
                    especificaciones y políticas se verificaron el 29 de julio de 2026.
                  </p>
                  <p className="text-xs text-[var(--ink-subtle)]">
                    Esta página no es publicidad. No recibimos comisión por cada compra. El valor está en recomendaciones
                    transparentes.
                  </p>
                </div>

                <a
                  href="https://simple.mx/product/premium-memory-foam-mattress"
                  className={buttonClass('primary', 'w-full py-3.5 text-center')}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Ver en SIMPLE.mx
                </a>

                <div className="rounded-[var(--radius-card)] border border-[var(--border)] bg-[var(--surface-muted)] p-4">
                  <h4 className="font-semibold text-sm mb-3">Pasos siguientes</h4>
                  <ol className="text-sm space-y-2 text-[var(--ink)]">
                    <li>
                      <strong>1.</strong> Elige tu tamaño en SIMPLE.mx
                    </li>
                    <li>
                      <strong>2.</strong> Completa la prueba de 101 noches
                    </li>
                    <li>
                      <strong>3.</strong> Integra un sueño de calidad en tu rutina de recuperación
                    </li>
                  </ol>
                </div>

                <div className="rounded-[var(--radius-card)] border border-[var(--border)] bg-[var(--surface)] p-4">
                  <h4 className="font-semibold text-sm mb-3">Relacionado</h4>
                  <ul className="text-sm space-y-2">
                    <li>
                      <Link href="/blog" className="text-[var(--brand)] hover:underline">
                        Artículos sobre sueño y recuperación →
                      </Link>
                    </li>
                    <li>
                      <Link href="/#ciencia" className="text-[var(--brand)] hover:underline">
                        Sobre la recuperación →
                      </Link>
                    </li>
                  </ul>
                </div>
              </div>
            </div>
          </section>
        </Container>
      </main>

      <SiteFooter config={config} />
    </>
  );
}
