/**
 * Safe fallback for an unconfigured host or a missing page.
 * Deliberately carries no marketplace branding and leaks no configuration.
 */
export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col justify-center gap-4 px-6 py-16 text-center">
      <h1 className="text-2xl font-semibold">Esta página no está disponible</h1>
      <p className="text-[var(--ink-muted)]">
        Revisa la dirección o vuelve al inicio del sitio que estabas visitando.
      </p>
    </main>
  );
}
