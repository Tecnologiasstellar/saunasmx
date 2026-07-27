import Link from 'next/link';
import type { MarketplaceConfig } from '../marketplace-config/types';

export function SiteHeader({ config }: { config: MarketplaceConfig }) {
  return (
    <header className="border-b border-[var(--border)] bg-[var(--surface)]">
      <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-6 py-4">
        <Link href="/" className="text-lg font-semibold text-[var(--brand)]">
          {config.name}
        </Link>
        <Link
          href="/cotizar"
          className="rounded-[var(--radius)] bg-[var(--brand)] px-4 py-2 text-sm font-medium text-[var(--brand-ink)]"
        >
          Obtener cotizaciones
        </Link>
      </div>
    </header>
  );
}

export function SiteFooter({ config }: { config: MarketplaceConfig }) {
  return (
    <footer className="mt-16 border-t border-[var(--border)] bg-[var(--surface-muted)]">
      <div className="mx-auto flex max-w-5xl flex-col gap-2 px-6 py-8 text-sm text-[var(--ink-muted)]">
        <p>
          {config.name} conecta proyectos con proveedores. Compartimos tus datos únicamente con los proveedores
          asignados a tu proyecto y solo con tu consentimiento.
        </p>
        <p>
          ¿Quieres corregir o eliminar tus datos? Escríbenos a{' '}
          <a className="underline" href="mailto:albertovillalpando@gmail.com">
            albertovillalpando@gmail.com
          </a>
          . Lee nuestro <Link className="underline" href="/aviso-de-privacidad">Aviso de Privacidad</Link>.
        </p>
      </div>
    </footer>
  );
}

export function Prose({ children }: { children: React.ReactNode }) {
  return <div className="mx-auto max-w-5xl px-6">{children}</div>;
}
