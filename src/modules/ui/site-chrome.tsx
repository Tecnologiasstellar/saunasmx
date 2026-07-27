import Link from 'next/link';
import type { MarketplaceConfig } from '../marketplace-config/types';
import { ButtonLink, Container } from './primitives';

/**
 * Shared public chrome.
 *
 * Navigation destinations come from `config.nav`, so a marketplace can only
 * link to sections it actually publishes. There is no fallback list of
 * hardcoded routes: an empty `nav` renders the wordmark and the CTA, which is
 * always valid.
 */

/** Wordmark. The marketplace name is the brand; there is no logo asset yet. */
function Wordmark({ config, className = '' }: { config: MarketplaceConfig; className?: string }) {
  return (
    <Link
      href="/"
      className={`font-[family-name:var(--font-heading)] text-2xl font-semibold text-[var(--ink)] ${className}`}
    >
      {config.name}
    </Link>
  );
}

export function SiteHeader({ config }: { config: MarketplaceConfig }) {
  const links = config.nav;

  return (
    <header className="sticky top-0 z-20 border-b border-[var(--border)] bg-[var(--surface)]">
      <Container className="flex items-center justify-between gap-4 py-4 md:py-5">
        <Wordmark config={config} />

        <nav aria-label="Principal" className="hidden items-center gap-10 md:flex">
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="text-[0.9375rem] text-[var(--ink-muted)] transition-colors hover:text-[var(--brand)]"
            >
              {link.label}
            </Link>
          ))}
          <ButtonLink href="/cotizar" className="px-6 py-3">
            Cotizar ahora
          </ButtonLink>
        </nav>

        {/* Mobile: the CTA stays visible; secondary links collapse into a
            native disclosure so the menu needs no JavaScript and no focus trap. */}
        <div className="flex items-center gap-2 md:hidden">
          <ButtonLink href="/cotizar" className="px-4 py-2.5 text-[0.8125rem]">
            Cotizar
          </ButtonLink>
          {links.length > 0 ? (
            <details className="relative">
              <summary
                className="flex h-11 w-11 cursor-pointer list-none items-center justify-center rounded-[var(--radius)] border border-[var(--border)] text-[var(--ink)] [&::-webkit-details-marker]:hidden"
                aria-label="Abrir menú"
              >
                <span aria-hidden="true" className="text-lg leading-none">
                  ☰
                </span>
              </summary>
              <nav
                aria-label="Secciones"
                className="absolute right-0 z-30 mt-2 flex w-56 flex-col rounded-[var(--radius-card)] border border-[var(--border)] bg-[var(--surface)] p-2 shadow-[var(--shadow)]"
              >
                {links.map((link) => (
                  <Link
                    key={link.href}
                    href={link.href}
                    className="rounded-[var(--radius)] px-3 py-3 text-[0.9375rem] text-[var(--ink)] hover:bg-[var(--canvas)]"
                  >
                    {link.label}
                  </Link>
                ))}
              </nav>
            </details>
          ) : null}
        </div>
      </Container>
    </header>
  );
}

export function SiteFooter({ config }: { config: MarketplaceConfig }) {
  return (
    <footer className="mt-24 bg-[var(--surface-dark)] text-[color-mix(in_srgb,var(--brand-ink)_60%,transparent)]">
      <Container className="py-12">
        <div className="flex flex-col gap-8 border-b border-[color-mix(in_srgb,var(--brand-ink)_12%,transparent)] pb-8 md:flex-row md:items-center md:justify-between">
          <Link href="/" className="font-[family-name:var(--font-heading)] text-xl text-[var(--brand-ink)]">
            {config.name}
          </Link>
          <nav aria-label="Pie de página" className="flex flex-wrap gap-x-8 gap-y-3 text-sm">
            {config.nav.map((link) => (
              <Link key={link.href} href={link.href} className="transition-colors hover:text-[var(--glow)]">
                {link.label}
              </Link>
            ))}
            <Link href="/cotizar" className="transition-colors hover:text-[var(--glow)]">
              Cotizar
            </Link>
            <Link href="/aviso-de-privacidad" className="transition-colors hover:text-[var(--glow)]">
              Aviso de Privacidad
            </Link>
            <a href="mailto:albertovillalpando@gmail.com" className="transition-colors hover:text-[var(--glow)]">
              Contacto
            </a>
          </nav>
        </div>

        <div className="mt-8 grid gap-3 text-sm leading-relaxed md:max-w-3xl">
          <p>
            {config.name} conecta proyectos con proveedores. Compartimos tus datos únicamente con los proveedores
            asignados a tu proyecto y solo con tu consentimiento.
          </p>
          <p>
            ¿Quieres corregir o eliminar tus datos? Escríbenos a{' '}
            <a className="underline hover:text-[var(--glow)]" href="mailto:albertovillalpando@gmail.com">
              albertovillalpando@gmail.com
            </a>
            .
          </p>
        </div>
      </Container>
    </footer>
  );
}

/** Reading-width wrapper for text-first pages. */
export function Prose({ children }: { children: React.ReactNode }) {
  return <div className="gutter mx-auto w-full max-w-3xl">{children}</div>;
}
