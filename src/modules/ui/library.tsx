import Link from 'next/link';
import { Badge, Card, Chip, Container, Eyebrow } from './primitives';
import { platformLabel } from '../library/official-source';
import type { LibraryResourceCard, LibraryResourceDetail } from '../library/queries';
import type { LibraryResourceFormat } from '../library/types';

export const FORMAT_LABEL: Record<LibraryResourceFormat, string> = {
  video: 'Video',
  podcast_episode: 'Podcast',
  book: 'Libro',
  article: 'Artículo',
  research: 'Investigación',
  report: 'Informe',
  course: 'Curso',
};

function duration(seconds: number | null): string | null {
  if (!seconds) return null;
  const minutes = Math.round(seconds / 60);
  return minutes >= 60 ? `${Math.floor(minutes / 60)} h ${minutes % 60} min` : `${minutes} min`;
}

function ResourceArtwork({ resource }: { resource: LibraryResourceCard }) {
  return (
    <div
      className="relative aspect-[16/10] overflow-hidden rounded-[var(--radius-card)] border border-[var(--border)] bg-[var(--surface-dark)]"
      style={
        resource.thumbnailUrl
          ? {
              backgroundImage: `linear-gradient(180deg, transparent 35%, rgb(0 0 0 / .72)), url("${resource.thumbnailUrl.replace(/["\\]/g, '')}")`,
              backgroundPosition: 'center',
              backgroundSize: 'cover',
            }
          : undefined
      }
    >
      <div className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-3 p-4 text-white">
        <span className="rounded-full bg-black/55 px-3 py-1.5 text-xs font-semibold backdrop-blur-sm">
          {FORMAT_LABEL[resource.format]}
        </span>
        {duration(resource.durationSeconds) ? <span className="text-xs text-white/80">{duration(resource.durationSeconds)}</span> : null}
      </div>
    </div>
  );
}

export function LibraryCard({ resource }: { resource: LibraryResourceCard }) {
  return (
    <li>
      <Link href={`/biblioteca/${resource.slug}`} className="group block text-inherit">
        <ResourceArtwork resource={resource} />
        <div className="mt-4">
          <div className="flex items-center gap-2 text-[0.75rem] font-semibold uppercase tracking-[0.08em] text-[var(--brand)]">
            <span>Fuente oficial</span>
            <span aria-hidden="true">·</span>
            <span>{platformLabel(resource.platform as Parameters<typeof platformLabel>[0])}</span>
          </div>
          <h2 className="mt-2 text-xl font-semibold leading-snug group-hover:text-[var(--brand)]">{resource.title}</h2>
          <p className="mt-2 text-sm text-[var(--ink-muted)]">{resource.creatorName}</p>
          {resource.annotation ? <p className="mt-3 line-clamp-3 text-sm leading-relaxed text-[var(--ink-muted)]">{resource.annotation}</p> : null}
        </div>
      </Link>
    </li>
  );
}

export function LibraryHero({ count }: { count: number }) {
  return (
    <div className="overflow-hidden border-b border-[var(--border)] bg-[var(--surface-dark)] text-[var(--brand-ink)]">
      <Container className="grid gap-10 py-16 md:py-20 lg:grid-cols-[1.4fr_.6fr] lg:items-end">
        <div>
          <Eyebrow tone="glow">Biblioteca Saunas.mx</Eyebrow>
          <h1 className="mt-5 max-w-4xl text-[clamp(2.7rem,7vw,5.6rem)] font-medium leading-[0.95] tracking-[-0.035em]">
            El mejor conocimiento sobre sauna, en un solo lugar.
          </h1>
          <p className="mt-7 max-w-2xl text-lg leading-relaxed text-[color-mix(in_srgb,var(--brand-ink)_72%,transparent)]">
            Videos, podcasts, libros, artículos e investigación seleccionados desde las cuentas oficiales de sus autores
            y organizaciones.
          </p>
        </div>
        <div className="border-l border-[color-mix(in_srgb,var(--brand-ink)_18%,transparent)] pl-6">
          <p className="text-4xl font-medium">{count}</p>
          <p className="mt-2 text-sm leading-relaxed text-[color-mix(in_srgb,var(--brand-ink)_55%,transparent)]">
            recursos publicados después de verificar procedencia, derechos y utilidad editorial.
          </p>
        </div>
      </Container>
    </div>
  );
}

export function OfficialSourcePanel({ resource }: { resource: LibraryResourceDetail }) {
  return (
    <Card className="border-[var(--brand)] bg-[var(--brand-soft)]">
      <div className="flex flex-wrap items-center gap-2">
        <Badge>Fuente oficial verificada</Badge>
        <Chip>{platformLabel(resource.platform as Parameters<typeof platformLabel>[0])}</Chip>
      </div>
      <p className="mt-4 text-sm leading-relaxed text-[var(--ink-muted)]">
        Saunas.mx no rehostea este contenido. Lo mostramos mediante el reproductor oficial o enlazamos a la publicación
        original de {resource.creatorName}.
      </p>
      <div className="mt-4 flex flex-wrap gap-4 text-sm font-semibold">
        <a className="text-[var(--brand)] underline underline-offset-4" href={resource.canonicalUrl} target="_blank" rel="noreferrer noopener">
          Abrir original ↗
        </a>
        <a className="text-[var(--ink-muted)] underline underline-offset-4" href={resource.channelVerificationUrl} target="_blank" rel="noreferrer noopener">
          Ver cuenta oficial ↗
        </a>
      </div>
    </Card>
  );
}

