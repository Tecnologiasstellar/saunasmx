import type { Metadata } from 'next';
import { requestLoginLink } from '@/modules/auth/actions';

export const metadata: Metadata = {
  title: 'Entrar',
  // Portals are never indexable.
  robots: { index: false, follow: false },
};

const MESSAGES: Record<string, string> = {
  forbidden: 'Tu cuenta no tiene acceso a esa sección.',
  rate_limited: 'Demasiados intentos. Espera un momento e inténtalo de nuevo.',
  email_failed: 'No pudimos enviar el correo. Inténtalo de nuevo.',
  invalid_token: 'Ese enlace ya no es válido. Pide uno nuevo.',
};

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ sent?: string; error?: string; next?: string; devToken?: string }>;
}) {
  const params = await searchParams;
  const next = params.next ?? '/portal';

  return (
    <main className="mx-auto max-w-md px-6 py-16">
      <h1 className="text-2xl font-semibold">Entrar</h1>
      <p className="mt-2 text-[var(--ink-muted)]">
        Te enviamos un enlace de acceso por correo. No necesitas contraseña.
      </p>

      {params.error ? (
        <p role="alert" className="mt-4 rounded-[var(--radius)] bg-red-50 p-3 text-sm text-red-800">
          {MESSAGES[params.error] ?? 'Algo salió mal.'}
        </p>
      ) : null}

      {params.sent ? (
        <div className="mt-4 rounded-[var(--radius)] bg-[var(--brand-soft)] p-4 text-sm" data-testid="login-sent">
          <p>Si esa cuenta existe, el enlace ya va en camino.</p>
          {params.devToken ? (
            <p className="mt-3">
              Entorno local:{' '}
              <a
                className="underline"
                data-testid="dev-login-link"
                href={`/entrar/verificar?token=${params.devToken}&next=${encodeURIComponent(next)}`}
              >
                usar el enlace ahora
              </a>
            </p>
          ) : null}
        </div>
      ) : null}

      <form action={requestLoginLink} className="mt-6 space-y-4">
        <input type="hidden" name="next" value={next} />
        <label className="block">
          <span className="text-sm text-[var(--ink-muted)]">Correo</span>
          <input
            data-testid="login-email"
            name="email"
            type="email"
            required
            autoComplete="email"
            className="mt-1 w-full rounded-[var(--radius)] border border-[var(--border)] px-4 py-3"
          />
        </label>
        <button
          type="submit"
          data-testid="login-submit"
          className="w-full rounded-[var(--radius)] bg-[var(--brand)] px-6 py-3 font-medium text-[var(--brand-ink)]"
        >
          Enviar enlace
        </button>
      </form>
    </main>
  );
}
