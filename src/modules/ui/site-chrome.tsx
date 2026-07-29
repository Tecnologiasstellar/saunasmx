import Link from 'next/link';
import type { MarketplaceConfig, SocialHandles } from '../marketplace-config/types';
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

/* -------------------------------------------------------------------------- */
/* Footer                                                                     */
/* -------------------------------------------------------------------------- */

const SOCIAL_ICONS: Record<keyof SocialHandles, { label: string; url: (handle: string) => string; path: string }> = {
  instagram: {
    label: 'Instagram',
    url: (handle) => `https://instagram.com/${handle}`,
    path: 'M12 2.16c3.2 0 3.58.01 4.85.07 1.17.05 1.8.25 2.23.41.56.22.96.48 1.38.9.42.42.68.82.9 1.38.16.42.36 1.06.41 2.23.06 1.27.07 1.65.07 4.85s-.01 3.58-.07 4.85c-.05 1.17-.25 1.8-.41 2.23-.22.56-.48.96-.9 1.38-.42.42-.82.68-1.38.9-.42.16-1.06.36-2.23.41-1.27.06-1.65.07-4.85.07s-3.58-.01-4.85-.07c-1.17-.05-1.8-.25-2.23-.41-.56-.22-.96-.48-1.38-.9-.42-.42-.68-.82-.9-1.38-.16-.42-.36-1.06-.41-2.23C2.17 15.58 2.16 15.2 2.16 12s.01-3.58.07-4.85c.05-1.17.25-1.8.41-2.23.22-.56.48-.96.9-1.38.42-.42.82-.68 1.38-.9.42-.16 1.06-.36 2.23-.41C8.42 2.17 8.8 2.16 12 2.16Zm0 5.68a4.16 4.16 0 1 0 0 8.32 4.16 4.16 0 0 0 0-8.32Zm0 6.86a2.7 2.7 0 1 1 0-5.4 2.7 2.7 0 0 1 0 5.4Zm5.3-7.02a.97.97 0 1 1-1.94 0 .97.97 0 0 1 1.94 0Z',
  },
  tiktok: {
    label: 'TikTok',
    url: (handle) => `https://tiktok.com/@${handle}`,
    path: 'M16.6 5.82A4.28 4.28 0 0 1 15.54 3h-3.09v12.4a2.59 2.59 0 1 1-1.79-2.46V9.8a5.77 5.77 0 1 0 4.88 5.7V9.01a7.35 7.35 0 0 0 4.3 1.38v-3.1a4.29 4.29 0 0 1-3.24-1.47Z',
  },
};

/**
 * Social presence.
 *
 * A network without a handle still renders — the brand shows where it intends
 * to be — but as plain text, not an anchor. Shipping `href="#"` or a guessed
 * profile URL would be a link to nowhere, and the public-site suite fails the
 * build over exactly that.
 */
function SocialLinks({ social }: { social: SocialHandles }) {
  const entries = Object.entries(SOCIAL_ICONS) as Array<[keyof SocialHandles, (typeof SOCIAL_ICONS)[keyof SocialHandles]]>;

  return (
    <ul className="flex list-none items-center gap-3 p-0">
      {entries.map(([network, icon]) => {
        const handle = social[network];
        const glyph = (
          <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className="h-[18px] w-[18px]">
            {/* evenodd, or the lens and the body of the Instagram mark fill solid. */}
            <path d={icon.path} fillRule="evenodd" clipRule="evenodd" />
          </svg>
        );
        const shell =
          'flex h-10 w-10 items-center justify-center rounded-full border border-[color-mix(in_srgb,var(--brand-ink)_16%,transparent)]';

        return (
          <li key={network}>
            {handle ? (
              <a
                href={icon.url(handle)}
                target="_blank"
                rel="noreferrer noopener"
                aria-label={icon.label}
                className={`${shell} text-[var(--brand-ink)] transition-colors hover:border-[var(--glow)] hover:text-[var(--glow)]`}
              >
                {glyph}
              </a>
            ) : (
              <span
                aria-label={`${icon.label} — próximamente`}
                title="Próximamente"
                className={`${shell} text-[color-mix(in_srgb,var(--brand-ink)_28%,transparent)]`}
              >
                {glyph}
              </span>
            )}
          </li>
        );
      })}
    </ul>
  );
}

function FooterColumn({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h2 className="font-mono text-[0.6875rem] font-bold uppercase tracking-[0.15em] text-[color-mix(in_srgb,var(--brand-ink)_45%,transparent)]">
        {title}
      </h2>
      <ul className="mt-4 flex list-none flex-col gap-3 p-0 text-sm">{children}</ul>
    </div>
  );
}

function FooterLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <li>
      <Link href={href} className="transition-colors hover:text-[var(--glow)]">
        {children}
      </Link>
    </li>
  );
}

export function SiteFooter({ config }: { config: MarketplaceConfig }) {
  const { email, social } = config.contact;
  const year = new Date().getFullYear();

  return (
    <footer className="mt-24 bg-[var(--surface-dark)] text-[color-mix(in_srgb,var(--brand-ink)_60%,transparent)]">
      <Container className="py-14 lg:py-16">
        <div className="grid gap-12 border-b border-[color-mix(in_srgb,var(--brand-ink)_12%,transparent)] pb-12 md:grid-cols-2 lg:grid-cols-[1.6fr_1fr_1fr_1fr]">
          <div className="max-w-sm">
            <Link href="/" className="font-[family-name:var(--font-heading)] text-xl text-[var(--brand-ink)]">
              {config.name}
            </Link>
            <p className="mt-4 text-sm leading-relaxed">
              Conectamos proyectos con proveedores que trabajan en tu zona. Gratis para ti.
            </p>
            <div className="mt-6">
              <SocialLinks social={social} />
            </div>
          </div>

          {/* Only what this marketplace publishes: an empty nav renders no column. */}
          {config.nav.length > 0 ? (
            <FooterColumn title="Explora">
              {config.nav.map((link) => (
                <FooterLink key={link.href} href={link.href}>
                  {link.label}
                </FooterLink>
              ))}
            </FooterColumn>
          ) : null}

          <FooterColumn title="Empieza">
            <FooterLink href="/cotizar">Cotizar mi proyecto</FooterLink>
            <FooterLink href="/contacto">Contacto</FooterLink>
            <FooterLink href="/entrar">Acceso proveedores</FooterLink>
          </FooterColumn>

          <FooterColumn title="Legal">
            <FooterLink href="/aviso-de-privacidad">Aviso de Privacidad</FooterLink>
            <li>
              <a href={`mailto:${email}`} className="transition-colors hover:text-[var(--glow)]">
                {email}
              </a>
            </li>
          </FooterColumn>

          <FooterColumn title="Asociados">
            <li>
              <a
                href="https://simple.mx/product/premium-memory-foam-mattress"
                target="_blank"
                rel="noopener noreferrer"
                className="transition-colors hover:text-[var(--glow)]"
              >
                SIMPLE — Colchones
              </a>
            </li>
            <li className="text-xs text-[color-mix(in_srgb,var(--brand-ink)_45%,transparent)]">
              Recomendaciones verificadas de marcas asociadas para recuperación.
            </li>
          </FooterColumn>
        </div>

        <div className="mt-8 flex flex-col gap-4 text-sm leading-relaxed md:flex-row md:items-end md:justify-between">
          <p className="max-w-2xl">
            Compartimos tus datos únicamente con los proveedores asignados a tu proyecto y solo con tu consentimiento.
            ¿Quieres corregirlos o eliminarlos?{' '}
            <Link className="underline hover:text-[var(--glow)]" href="/contacto">
              Escríbenos
            </Link>
            .
          </p>
          <p className="whitespace-nowrap text-[color-mix(in_srgb,var(--brand-ink)_40%,transparent)]">
            © {year} {config.name}
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
