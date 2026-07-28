import Link from 'next/link';
import { KIND_PATH, stateHref, type DirectoryProfileView } from '../directory/view-model';
import { DirectoryCard, ProfileCanvas } from './directory-card';
import { Badge, Card, Container, Eyebrow, buttonClass } from './primitives';

/**
 * The individual directory profile page.
 *
 * One component renders both kinds. The data decides everything that differs:
 * the badge, the facts, the wording of the location row, and the primary call
 * to action — which is external for a place and internal for a provider. There
 * is no `kind === 'place'` branch below, and adding a third kind should not
 * introduce one.
 *
 * The hero is deliberately thin: name, one factual line, where it is, how you
 * get in, and one button. The access note sits directly under the button rather
 * than in a tooltip or an expander, because "hotel guests only" or "solo
 * hombres adultos" is exactly what a visitor needs before they act, not after.
 */

type Crumb = { label: string; href?: string };

const RELATED_HEADING: Record<DirectoryProfileView['kind'], string> = {
  place: 'Otros lugares para sauna',
  provider: 'Otros proveedores de saunas',
};

const CROSS_LINK: Record<DirectoryProfileView['kind'], { text: string; label: string; href: string }> = {
  place: {
    text: '¿Quieres un sauna en casa o para tu negocio?',
    label: 'Explora proveedores',
    href: KIND_PATH.provider,
  },
  provider: {
    text: '¿Buscas una sesión de sauna cerca de ti?',
    label: 'Explora lugares',
    href: KIND_PATH.place,
  },
};

/** An external link always says so, in the accessible name as well as visually. */
function ExternalAction({
  cta,
  variant,
  className = '',
}: {
  cta: { label: string; href: string; external: boolean };
  variant: 'primary' | 'outline';
  className?: string;
}) {
  if (!cta.external) {
    return (
      <Link href={cta.href} className={buttonClass(variant, className)}>
        {cta.label}
      </Link>
    );
  }
  return (
    <a
      href={cta.href}
      target="_blank"
      rel="noopener noreferrer nofollow"
      className={buttonClass(variant, className)}
    >
      {cta.label}
      <span aria-hidden="true">↗</span>
      <span className="sr-only">(se abre en el sitio del establecimiento)</span>
    </a>
  );
}

function Breadcrumbs({ crumbs }: { crumbs: Crumb[] }) {
  return (
    <nav aria-label="Ruta de navegación" className="mb-6">
      <ol className="flex list-none flex-wrap items-center gap-x-2 gap-y-1 p-0 text-[0.8125rem] text-[var(--ink-subtle)]">
        {crumbs.map((crumb, index) => (
          <li key={`${crumb.label}-${index}`} className="flex items-center gap-2">
            {index > 0 ? <span aria-hidden="true">/</span> : null}
            {crumb.href ? (
              <Link href={crumb.href} className="hover:text-[var(--brand)] hover:underline">
                {crumb.label}
              </Link>
            ) : (
              <span aria-current="page" className="text-[var(--ink-muted)]">
                {crumb.label}
              </span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}

export function DirectoryProfilePage({
  profile,
  related,
  indexLabel,
}: {
  profile: DirectoryProfileView;
  related: DirectoryProfileView[];
  /** "Lugares" or "Proveedores" — the label of this kind's index in the breadcrumb. */
  indexLabel: string;
}) {
  const cross = CROSS_LINK[profile.kind];
  const crumbs: Crumb[] = [
    { label: 'Inicio', href: '/' },
    { label: indexLabel, href: KIND_PATH[profile.kind] },
    ...(profile.state ? [{ label: profile.state, href: stateHref(profile.kind, profile.state) }] : []),
    { label: profile.name },
  ];

  return (
    <main>
      <Container className="pb-10 pt-8 md:pt-10">
        <Breadcrumbs crumbs={crumbs} />

        <article>
          {/* Hero. Image left from lg up, above the content on phones. */}
          <div
            className="overflow-hidden rounded-[var(--radius-panel)] border border-[var(--border)] bg-[var(--surface)] shadow-[var(--shadow)]"
            data-testid="profile-hero"
          >
            <div className="grid lg:grid-cols-[minmax(0,45%)_minmax(0,1fr)]">
              <ProfileCanvas name={profile.name} className="aspect-[16/10] w-full lg:aspect-auto lg:min-h-[22rem]" />

              <div className="flex flex-col gap-4 p-6 md:p-9">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge>{profile.typeLabel}</Badge>
                  {profile.verified ? <Badge>Proveedor verificado</Badge> : null}
                </div>

                <h1 className="text-[clamp(1.75rem,4.5vw,2.5rem)] font-medium leading-[1.1] tracking-[-0.01em] text-[var(--ink)]">
                  {profile.name}
                </h1>

                {profile.blurb ? (
                  <p className="text-base leading-relaxed text-[var(--ink-muted)]">{profile.blurb}</p>
                ) : null}

                <dl className="grid gap-2 text-sm">
                  {profile.locationLine ? (
                    <div className="flex flex-wrap gap-x-2">
                      <dt className="font-semibold text-[var(--ink)]">Dónde</dt>
                      <dd className="m-0 text-[var(--ink-muted)]">
                        {profile.address ? `${profile.address} · ` : ''}
                        {profile.locationLine}
                      </dd>
                    </div>
                  ) : null}
                  {profile.additionalLocations ? (
                    <div className="flex flex-wrap gap-x-2">
                      <dt className="font-semibold text-[var(--ink)]">También en</dt>
                      <dd className="m-0 text-[var(--ink-muted)]">{profile.additionalLocations}</dd>
                    </div>
                  ) : null}
                  {profile.phone ? (
                    <div className="flex flex-wrap gap-x-2">
                      <dt className="font-semibold text-[var(--ink)]">Teléfono</dt>
                      <dd className="m-0 text-[var(--ink-muted)]">{profile.phone}</dd>
                    </div>
                  ) : null}
                </dl>

                <div className="mt-2 flex flex-col gap-3">
                  {profile.primaryCta ? (
                    <ExternalAction cta={profile.primaryCta} variant="primary" className="w-full py-3.5 sm:w-auto" />
                  ) : null}

                  {/* The condition that most often wastes a trip, next to the
                      button rather than hidden behind one. */}
                  {profile.accessNote ? (
                    <p className="text-sm leading-relaxed text-[var(--ink-muted)]">
                      <span className="font-semibold text-[var(--ink)]">{profile.accessLabel}:</span>{' '}
                      {profile.accessNote}
                    </p>
                  ) : null}

                  {profile.websiteUrl ? (
                    <a
                      href={profile.websiteUrl}
                      target="_blank"
                      rel="noopener noreferrer nofollow"
                      className="self-start text-sm font-semibold text-[var(--brand)] underline underline-offset-4"
                    >
                      Visitar sitio web
                      <span aria-hidden="true"> ↗</span>
                    </a>
                  ) : null}
                </div>

                {profile.lastVerified ? (
                  <p className="mt-1 text-xs text-[var(--ink-subtle)]">
                    Información revisada el {profile.lastVerified}
                    {profile.needsConfirmation ? ' · Confirma acceso y precio antes de ir' : ''}
                  </p>
                ) : null}
              </div>
            </div>
          </div>

          {profile.facts.length > 0 ? (
            <section aria-labelledby="datos" className="mt-12">
              <Eyebrow as="h2" id="datos" className="mb-5">
                Datos del perfil
              </Eyebrow>
              <ul className="grid list-none gap-4 p-0 sm:grid-cols-2">
                {profile.facts.map((fact) => (
                  <li key={fact.label}>
                    <Card className="h-full">
                      <p className="text-[0.6875rem] font-bold uppercase tracking-[0.1em] text-[var(--ink-subtle)]">
                        {fact.label}
                      </p>
                      <p className="mt-2 text-[0.9375rem] leading-relaxed text-[var(--ink)]">{fact.value}</p>
                    </Card>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {profile.about ? (
            <section aria-labelledby="acerca" className="mt-12 max-w-3xl">
              <Eyebrow as="h2" id="acerca" className="mb-4">
                Sobre este perfil
              </Eyebrow>
              <p className="text-base leading-relaxed text-[var(--ink-muted)]">{profile.about}</p>
            </section>
          ) : null}

          {/* Action footer: the same primary action, no competing one. */}
          <section className="mt-12 rounded-[var(--radius-panel)] border border-[var(--border)] bg-[var(--surface-muted)] p-6 md:p-8">
            <div className="flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
              <div className="max-w-xl">
                <h2 className="font-[family-name:var(--font-heading)] text-xl font-semibold text-[var(--ink)]">
                  {profile.kind === 'provider'
                    ? `¿Quieres una cotización de ${profile.name}?`
                    : `¿Listo para ir a ${profile.name}?`}
                </h2>
                <p className="mt-2 text-sm leading-relaxed text-[var(--ink-muted)]">
                  {profile.kind === 'provider'
                    ? 'Cuéntanos tu proyecto una sola vez. Revisamos la solicitud antes de compartirla y sólo con tu consentimiento.'
                    : 'La reserva se hace en el sitio del establecimiento. Verifica horarios, precio y condiciones de acceso ahí mismo.'}
                </p>
              </div>
              {profile.primaryCta ? (
                <ExternalAction cta={profile.primaryCta} variant="primary" className="shrink-0 py-3.5" />
              ) : null}
            </div>

            <div className="mt-6 flex flex-wrap gap-x-6 gap-y-2 border-t border-[var(--border)] pt-5 text-sm">
              {profile.state ? (
                <Link
                  href={stateHref(profile.kind, profile.state)}
                  className="font-semibold text-[var(--brand)] hover:underline"
                >
                  Ver todo en {profile.state}
                </Link>
              ) : null}
              <a
                href={`mailto:albertovillalpando@gmail.com?subject=${encodeURIComponent(`Actualización de ${profile.name} en saunas.mx`)}`}
                className="text-[var(--ink-muted)] hover:text-[var(--brand)] hover:underline"
              >
                Reportar una actualización
              </a>
            </div>
          </section>

          {/* Sources are audit data, not sales copy: available, de-emphasised,
              and never presented as an endorsement. */}
          {profile.sourceUrls.length > 0 ? (
            <details className="mt-8 max-w-3xl text-sm">
              <summary className="cursor-pointer font-semibold text-[var(--ink-muted)]">
                Fuentes ({profile.sourceUrls.length})
              </summary>
              <ul className="mt-3 grid list-none gap-2 p-0">
                {profile.sourceUrls.map((source) => (
                  <li key={source}>
                    <a
                      href={source}
                      target="_blank"
                      rel="noopener noreferrer nofollow"
                      className="break-all text-[var(--ink-subtle)] underline underline-offset-2 hover:text-[var(--brand)]"
                    >
                      {source}
                    </a>
                  </li>
                ))}
              </ul>
            </details>
          ) : null}
        </article>
      </Container>

      {related.length > 0 ? (
        <section aria-labelledby="relacionados" className="border-t border-[var(--border)] py-14">
          <Container>
            <Eyebrow as="h2" id="relacionados" className="mb-6">
              {RELATED_HEADING[profile.kind]}
            </Eyebrow>
            <ul className="grid list-none gap-6 p-0 sm:grid-cols-2 lg:grid-cols-3">
              {related.map((item) => (
                <li key={item.slug} className="flex">
                  <DirectoryCard profile={item} />
                </li>
              ))}
            </ul>

            <p className="mt-8 text-sm text-[var(--ink-muted)]">
              {cross.text}{' '}
              <Link href={cross.href} className="font-semibold text-[var(--brand)] hover:underline">
                {cross.label}
              </Link>
            </p>
          </Container>
        </section>
      ) : null}
    </main>
  );
}

/** Shared index shell: heading, state filter, result grid. Used by both kinds. */
export function DirectoryIndexPage({
  title,
  lead,
  eyebrow,
  basePath,
  states,
  activeState,
  profiles,
  emptyMessage,
}: {
  title: string;
  lead: string;
  eyebrow: string;
  basePath: string;
  states: string[];
  activeState?: string;
  profiles: DirectoryProfileView[];
  emptyMessage: string;
}) {
  return (
    <main>
      <div className="border-b border-[var(--border)] py-12 md:py-14">
        <Container>
          <Eyebrow>{eyebrow}</Eyebrow>
          <h1 className="mt-3 text-[clamp(2rem,5.5vw,3rem)] font-medium leading-[1.1] tracking-[-0.01em] text-[var(--ink)]">
            {title}
          </h1>
          <p className="mt-3 max-w-[680px] text-base leading-relaxed text-[var(--ink-muted)]">{lead}</p>
        </Container>
      </div>

      <Container className="py-10">
        {states.length > 0 ? (
          // A plain link set, not a form: one filter with a handful of values
          // needs no JavaScript, and every state is a crawlable URL.
          <nav aria-label="Filtrar por estado" className="mb-8">
            <ul className="flex list-none flex-wrap gap-2 p-0">
              <li>
                <Link
                  href={basePath}
                  aria-current={activeState ? undefined : 'true'}
                  className={
                    activeState
                      ? 'inline-block rounded-full border border-[var(--border)] px-3.5 py-2 text-sm text-[var(--ink-muted)] hover:border-[var(--brand)]'
                      : 'inline-block rounded-full border border-[var(--brand)] bg-[var(--brand)] px-3.5 py-2 text-sm font-semibold text-[var(--brand-ink)]'
                  }
                >
                  Todo México
                </Link>
              </li>
              {states.map((state) => {
                const active = state === activeState;
                return (
                  <li key={state}>
                    <Link
                      href={`${basePath}?estado=${encodeURIComponent(state)}`}
                      aria-current={active ? 'true' : undefined}
                      className={
                        active
                          ? 'inline-block rounded-full border border-[var(--brand)] bg-[var(--brand)] px-3.5 py-2 text-sm font-semibold text-[var(--brand-ink)]'
                          : 'inline-block rounded-full border border-[var(--border)] px-3.5 py-2 text-sm text-[var(--ink-muted)] hover:border-[var(--brand)]'
                      }
                    >
                      {state}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </nav>
        ) : null}

        <p className="mb-6 text-sm text-[var(--ink-muted)]" data-testid="result-count">
          {profiles.length} {profiles.length === 1 ? 'perfil' : 'perfiles'}
          {activeState ? ` en ${activeState}` : ''}
        </p>

        {profiles.length > 0 ? (
          <ul className="grid list-none gap-6 p-0 sm:grid-cols-2 xl:grid-cols-3">
            {profiles.map((profile) => (
              <li key={profile.slug} className="flex">
                <DirectoryCard profile={profile} />
              </li>
            ))}
          </ul>
        ) : (
          <Card className="max-w-xl">
            <h2 className="text-lg font-semibold">Todavía no hay perfiles aquí</h2>
            <p className="mt-2 text-[var(--ink-muted)]">{emptyMessage}</p>
            <Link href={basePath} className={buttonClass('quiet', 'mt-6')}>
              Ver todo México
            </Link>
          </Card>
        )}
      </Container>
    </main>
  );
}
