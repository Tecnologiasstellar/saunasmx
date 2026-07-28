import Link from 'next/link';
import type { DirectoryProfileView } from '../directory/view-model';
import { Badge, Chip } from './primitives';

/**
 * One card for both kinds of directory listing.
 *
 * It renders a `DirectoryProfileView`, never a database row, which is what lets
 * a place and a provider — and, later, a pergola builder — share it without a
 * branch. Everything shown is a field the adapter filled from stored data.
 *
 * The whole card is a single link to the profile. Not to the venue's booking
 * page: an index that throws visitors off-site on first click cannot show them
 * the access conditions, which are the most common reason a sauna trip is
 * wasted. One link per card also keeps the tab order short and the target large.
 */

/** "Koti Wellness" → "KW". Punctuation-only words are skipped so "Sauna & Steam" gives "SS". */
export function monogram(name: string): string {
  const initials = name
    .split(/\s+/)
    .map((word) => word.replace(/[^\p{L}\p{N}]/gu, ''))
    .filter((word) => word.length > 0)
    .slice(0, 2)
    .map((word) => word[0]!.toUpperCase());
  return initials.join('') || '·';
}

/** The neutral stand-in for a photograph we do not have the rights to. */
export function ProfileCanvas({ name, className = '' }: { name: string; className?: string }) {
  return (
    <div className={`profile-canvas relative flex items-center justify-center overflow-hidden ${className}`}>
      {/* Decorative: the name is already the heading beside it, so a screen
          reader announcing these initials again would only add noise. */}
      <span
        aria-hidden="true"
        className="font-[family-name:var(--font-heading)] text-[clamp(2.5rem,8vw,5rem)] font-semibold leading-none tracking-[-0.02em] text-[color-mix(in_srgb,var(--brand)_28%,transparent)]"
      >
        {monogram(name)}
      </span>
    </div>
  );
}

const FACTS_ON_CARD = 2;

/**
 * A chip has to stay a chip. Some facts are sentences — a provider's service
 * list, a venue's price note — and they belong on the profile page, not wrapped
 * across four lines of a grid card. Length is the filter rather than the fact's
 * label, so the rule survives a category whose facts are named differently.
 */
const CHIP_MAX_LENGTH = 44;

export function DirectoryCard({ profile }: { profile: DirectoryProfileView }) {
  const chips = profile.facts.filter((fact) => fact.value.length <= CHIP_MAX_LENGTH).slice(0, FACTS_ON_CARD);

  return (
    <Link
      href={profile.href}
      className="lift group flex h-full w-full flex-col overflow-hidden rounded-[var(--radius-card)] border border-[var(--border)] bg-[var(--surface)] hover:border-[var(--brand)]"
    >
      <ProfileCanvas name={profile.name} className="aspect-[16/10] w-full" />

      <div className="flex flex-1 flex-col gap-3 p-6">
        <div className="flex flex-wrap items-center gap-2">
          <Badge>{profile.typeLabel}</Badge>
          {profile.verified ? <Badge>Proveedor verificado</Badge> : null}
        </div>

        <h3 className="font-[family-name:var(--font-heading)] text-xl font-semibold text-[var(--ink)] group-hover:text-[var(--brand)]">
          {profile.name}
        </h3>

        {profile.locationLine ? (
          <p className="text-[0.8125rem] text-[var(--ink-subtle)]">{profile.locationLine}</p>
        ) : null}

        {profile.blurb ? (
          <p className="text-sm leading-relaxed text-[var(--ink-muted)]">{profile.blurb}</p>
        ) : null}

        {chips.length > 0 ? (
          <ul className="flex list-none flex-wrap gap-2 p-0">
            {chips.map((fact) => (
              <li key={fact.label}>
                <Chip>{fact.value}</Chip>
              </li>
            ))}
          </ul>
        ) : null}

        <span className="mt-auto pt-2 text-sm font-semibold text-[var(--brand)]">
          Ver perfil <span aria-hidden="true">→</span>
        </span>
      </div>
    </Link>
  );
}
