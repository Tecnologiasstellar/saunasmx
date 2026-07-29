import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { isProduction, resolveRequestHost } from '@/modules/site/context';
import { Card, Container, Eyebrow, SectionHeading } from '@/modules/ui/primitives';
import { SiteFooter, SiteHeader } from '@/modules/ui/site-chrome';

export const revalidate = 3600;

export async function generateMetadata(): Promise<Metadata> {
  const resolution = await resolveRequestHost();
  if (resolution.kind === 'unknown') {
    return { title: 'Productos para dormir', robots: { index: false, follow: false } };
  }

  const indexable = isProduction() && resolution.config.seo.defaultIndexing;

  return {
    title: 'Productos para el sueño y recuperación | Saunas.mx',
    description: 'Colchones y productos asociados recomendados para mejorar el descanso después de entrenar o usar sauna.',
    alternates: { canonical: '/descanso/productos' },
    robots: { index: indexable, follow: indexable },
  };
}

export default async function ProductsPage() {
  const resolution = await resolveRequestHost();
  if (resolution.kind === 'unknown') notFound();
  const config = resolution.config;

  const products = [
    {
      name: 'SIMPLE Premium Memory Foam Mattress',
      slug: 'colchon-simple',
      description: 'Colchón de espuma de memoria con gel refrigerante. Diseñado para recuperación después del entrenar.',
      partner: 'SIMPLE',
      price: 'Desde $4,800 MXN',
    },
  ];

  return (
    <>
      <SiteHeader config={config} />

      <main>
        <div className="border-b border-[var(--border)] py-12 md:py-14">
          <Container>
            <SectionHeading
              eyebrow="Recuperación"
              title="Productos para dormir mejor"
              lead="Recomendaciones verificadas de marcas asociadas que mejoran el descanso y la recuperación muscular."
            />
          </Container>
        </div>

        <Container className="py-12">
          {products.length === 0 ? (
            <Card className="max-w-2xl">
              <h2 className="text-lg font-semibold">Próximamente</h2>
              <p className="mt-2 text-[var(--ink-muted)]">
                Estamos verificando productos de calidad para recomendar. Vuelve pronto.
              </p>
            </Card>
          ) : (
            <ul className="grid list-none gap-6 p-0 md:grid-cols-2">
              {products.map((product) => (
                <li key={product.slug}>
                  <Link
                    href={`/descanso/productos/${product.slug}`}
                    className="group block rounded-[var(--radius-card)] border border-[var(--border)] bg-[var(--surface)] p-6 hover:border-[var(--brand)] transition-colors"
                  >
                    <div className="flex items-start justify-between gap-4 mb-3">
                      <h2 className="text-lg font-semibold group-hover:text-[var(--brand)]">{product.name}</h2>
                      <span className="text-xs font-semibold text-[var(--brand)] whitespace-nowrap">
                        Asociado: {product.partner}
                      </span>
                    </div>
                    <p className="text-sm text-[var(--ink-muted)] mb-4">{product.description}</p>
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-[var(--brand)]">{product.price}</span>
                      <span className="text-xs text-[var(--ink-subtle)] group-hover:text-[var(--brand)]">Ver más →</span>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}

          <div className="mt-16 rounded-[var(--radius-card)] border border-[var(--border)] bg-[var(--surface-muted)] p-8">
            <Eyebrow>Sobre estas recomendaciones</Eyebrow>
            <p className="mt-4 text-[var(--ink)]">
              Los productos listados aquí son de marcas asociadas con Saunas.mx. Cada recomendación incluye datos verificados,
              especificaciones reales y políticas de garantía. No recibimos comisión por ventas. El valor está en
              recomendaciones transparentes que completan tu rutina de recuperación.
            </p>
          </div>
        </Container>
      </main>

      <SiteFooter config={config} />
    </>
  );
}
