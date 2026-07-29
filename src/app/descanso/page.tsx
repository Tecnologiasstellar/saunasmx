import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { isProduction, resolveRequestHost } from '@/modules/site/context';
import { Container, Eyebrow, SectionHeading, buttonClass } from '@/modules/ui/primitives';
import { SiteFooter, SiteHeader } from '@/modules/ui/site-chrome';

export const revalidate = 3600;

export async function generateMetadata(): Promise<Metadata> {
  const resolution = await resolveRequestHost();
  if (resolution.kind === 'unknown') {
    return { title: 'Sueño y recuperación', robots: { index: false, follow: false } };
  }

  const indexable = isProduction() && resolution.config.seo.defaultIndexing;

  return {
    title: 'Sueño y recuperación después de sauna | Saunas.mx',
    description:
      'Guías sobre cómo el sueño de calidad acelera la recuperación muscular. Rutinas, productos y protocolos basados en evidencia.',
    alternates: { canonical: '/descanso' },
    robots: { index: indexable, follow: indexable },
  };
}

export default async function SleepRecoveryPage() {
  const resolution = await resolveRequestHost();
  if (resolution.kind === 'unknown') notFound();
  const config = resolution.config;

  return (
    <>
      <SiteHeader config={config} />

      <main>
        <div className="border-b border-[var(--border)] py-12 md:py-14">
          <Container>
            <SectionHeading
              eyebrow="Recuperación"
              title="Sueño y recuperación muscular"
              lead="Después de entrenar o una sesión de sauna, es en el sueño donde ocurre la reparación. Guías, protocolos y productos para dormir mejor."
            />
          </Container>
        </div>

        <Container className="py-12 md:py-16">
          <section className="grid gap-12 md:grid-cols-2 lg:grid-cols-3">
            <div className="rounded-[var(--radius-card)] border border-[var(--border)] bg-[var(--surface)] p-8">
              <h3 className="text-lg font-semibold mb-4">Artículos</h3>
              <p className="text-[var(--ink-muted)] mb-6">
                Guías sobre la relación entre sueño, recuperación y descanso después de sauna y entrenamiento.
              </p>
              <Link href="/blog" className={buttonClass('outline', 'w-full text-center')}>
                Ver blog de recuperación
              </Link>
            </div>

            <div className="rounded-[var(--radius-card)] border border-[var(--border)] bg-[var(--surface)] p-8">
              <h3 className="text-lg font-semibold mb-4">Productos asociados</h3>
              <p className="text-[var(--ink-muted)] mb-6">
                Colchones y productos verificados de marcas asociadas que mejoran la calidad del descanso.
              </p>
              <Link href="/descanso/productos" className={buttonClass('outline', 'w-full text-center')}>
                Ver productos
              </Link>
            </div>

            <div className="rounded-[var(--radius-card)] border border-[var(--border)] bg-[var(--surface)] p-8">
              <h3 className="text-lg font-semibold mb-4">Protocolos</h3>
              <p className="text-[var(--ink-muted)] mb-6">
                Rutinas prácticas para mejorar el sueño después de una sesión de sauna o entrenamiento intenso.
              </p>
              <Link href="/blog?#protocolo" className={buttonClass('outline', 'w-full text-center')}>
                Explorar protocolos
              </Link>
            </div>
          </section>

          <section className="mt-16 max-w-4xl">
            <Eyebrow>¿Por qué el sueño es la recuperación más importante?</Eyebrow>
            <div className="mt-6 space-y-6 text-[var(--ink)]">
              <p>
                Cuando entrenas duro o usas sauna, tu cuerpo entra en modo de reparación. Pero esa reparación
                <strong> no ocurre durante el ejercicio</strong> — ocurre mientras duermes. Durante el sueño profundo:
              </p>
              <ul className="space-y-3 ml-4">
                <li>
                  <strong>Se sintetiza proteína muscular:</strong> El cuerpo reconstruye fibras dañadas por el
                  entrenamiento.
                </li>
                <li>
                  <strong>Se libera hormona de crecimiento:</strong> Máxima durante las primeras horas de sueño profundo.
                </li>
                <li>
                  <strong>Se reduce la inflamación:</strong> El sueño es antiinflamatorio; la falta de sueño la aumenta.
                </li>
                <li>
                  <strong>Se consolida la memoria motor:</strong> Los nuevos movimientos se integran en la memoria muscular.
                </li>
              </ul>
              <p>
                Un colchón de calidad no acelera la recuperación, pero <strong>duerme mejor acelera lo que ya ocurre</strong>.
                Si estás despierto por dolor de espalda, temperatura incómoda o interrupciones, pierdes esas horas críticas.
              </p>
              <p className="pt-2 italic text-[var(--ink-muted)]">
                Todo lo anterior es ciencia del sueño establecida. No es publicidad.
              </p>
            </div>
          </section>

          <section className="mt-16 max-w-4xl border-t border-[var(--border)] pt-12">
            <Eyebrow>Empieza por aquí</Eyebrow>
            <div className="mt-6 space-y-6">
              <div>
                <h3 className="font-semibold mb-2">1. Entiende cómo funciona la recuperación</h3>
                <p className="text-[var(--ink-muted)]">
                  Lée nuestros artículos sobre sueño, recuperación muscular y cómo el descanso acelera lo que el
                  entrenamiento comenzó.
                </p>
              </div>
              <div>
                <h3 className="font-semibold mb-2">2. Evalúa tu sueño actual</h3>
                <p className="text-[var(--ink-muted)]">
                  ¿Despiertas con dolor? ¿Tienes calor durante la noche? ¿Te cuesta trabajo quedarte dormido? Estos son
                  señales de que tu colchón o ambiente de sueño no está optimizado.
                </p>
              </div>
              <div>
                <h3 className="font-semibold mb-2">3. Explora opciones verificadas</h3>
                <p className="text-[var(--ink-muted)]">
                  Si decides cambiar colchón, revisa nuestros productos asociados. Todos están verificados: especificaciones
                  reales, precios, garantías y políticas de devolución.
                </p>
              </div>
              <div>
                <h3 className="font-semibold mb-2">4. Prueba durante 30 noches</h3>
                <p className="text-[var(--ink-muted)]">
                  Nuestras recomendaciones incluyen períodos de prueba largos (101 noches con SIMPLE). Dale tiempo a tu
                  cuerpo a adaptarse antes de decidir.
                </p>
              </div>
            </div>
          </section>
        </Container>
      </main>

      <SiteFooter config={config} />
    </>
  );
}
