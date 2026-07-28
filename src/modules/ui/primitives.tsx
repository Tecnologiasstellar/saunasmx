import Image from 'next/image';
import Link from 'next/link';
import { type Photo, photoCredit, photoFocus, photoSrc } from './photos';

/**
 * Public presentation primitives.
 *
 * Every value here reads a theme token, so one component set renders the warm
 * wellness system for saunas and the outdoor-living system for pergolas without
 * a marketplace branch (ADR-006, ADR-009).
 */

/* -------------------------------------------------------------------------- */
/* Layout                                                                     */
/* -------------------------------------------------------------------------- */

/** Page-width container. Gutters come from --gutter, which is breakpoint-aware. */
export function Container({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <div className={`gutter mx-auto w-full max-w-[1280px] ${className}`}>{children}</div>;
}

/* -------------------------------------------------------------------------- */
/* Type                                                                       */
/* -------------------------------------------------------------------------- */

type Tone = 'brand' | 'glow' | 'accent' | 'subtle';

const TONE: Record<Tone, string> = {
  brand: 'text-[var(--brand)]',
  glow: 'text-[var(--glow)]',
  accent: 'text-[var(--accent)]',
  subtle: 'text-[var(--ink-subtle)]',
};

/** 11px / 700 / 0.15em uppercase label. */
export function Eyebrow({
  children,
  tone = 'brand',
  as: Tag = 'p',
  className = '',
  id,
}: {
  children: React.ReactNode;
  tone?: Tone;
  as?: 'p' | 'span' | 'h2';
  className?: string;
  /** Set when the eyebrow is the heading a section is labelled by. */
  id?: string;
}) {
  return (
    <Tag id={id} className={`text-[0.6875rem] font-bold uppercase tracking-[0.15em] ${TONE[tone]} ${className}`}>
      {children}
    </Tag>
  );
}

/** Section header: eyebrow + display heading, optionally centred. */
export function SectionHeading({
  eyebrow,
  title,
  lead,
  align = 'start',
  id,
}: {
  eyebrow?: string;
  title: string;
  lead?: string;
  align?: 'start' | 'center';
  id?: string;
}) {
  const centered = align === 'center';
  return (
    <div className={centered ? 'mx-auto max-w-2xl text-center' : 'max-w-3xl'}>
      {eyebrow ? <Eyebrow className="mb-3">{eyebrow}</Eyebrow> : null}
      <h2
        id={id}
        className="text-[clamp(1.875rem,4.5vw,2.5rem)] font-medium leading-[1.1] tracking-[-0.01em] text-[var(--ink)]"
      >
        {title}
      </h2>
      {lead ? <p className="mt-4 text-base leading-relaxed text-[var(--ink-muted)]">{lead}</p> : null}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Controls                                                                   */
/* -------------------------------------------------------------------------- */

export type ButtonVariant = 'primary' | 'outline' | 'ghost' | 'quiet';

const BASE =
  'inline-flex items-center justify-center gap-2 rounded-[var(--radius)] text-sm font-semibold transition-colors disabled:opacity-60';

const VARIANT: Record<ButtonVariant, string> = {
  primary: 'bg-[var(--brand)] text-[var(--brand-ink)] hover:bg-[var(--brand-hover)] px-6 py-3',
  outline:
    'border border-[var(--brand)] text-[var(--brand)] hover:bg-[var(--brand)] hover:text-[var(--brand-ink)] px-6 py-3',
  quiet: 'border border-[var(--border)] bg-[var(--surface)] text-[var(--ink)] hover:border-[var(--brand)] px-6 py-3',
  // Bottom-rule link used over the dark hero.
  ghost:
    'border-b border-[color-mix(in_srgb,var(--brand-ink)_40%,transparent)] pb-1.5 text-[var(--brand-ink)] hover:border-[var(--glow)] hover:text-[var(--glow)] rounded-none',
};

export function buttonClass(variant: ButtonVariant = 'primary', className = ''): string {
  return `${BASE} ${VARIANT[variant]} ${className}`;
}

export function ButtonLink({
  href,
  variant = 'primary',
  className = '',
  children,
  ...rest
}: {
  href: string;
  variant?: ButtonVariant;
  className?: string;
  children: React.ReactNode;
} & Omit<React.ComponentProps<typeof Link>, 'href' | 'className' | 'children'>) {
  return (
    <Link href={href} className={buttonClass(variant, className)} {...rest}>
      {children}
    </Link>
  );
}

/* -------------------------------------------------------------------------- */
/* Surfaces                                                                   */
/* -------------------------------------------------------------------------- */

export function Card({
  children,
  className = '',
  hover = false,
}: {
  children: React.ReactNode;
  className?: string;
  hover?: boolean;
}) {
  return (
    <div
      className={`rounded-[var(--radius-card)] border border-[var(--border)] bg-[var(--surface)] p-6 ${
        hover ? 'lift hover:border-[var(--brand)]' : ''
      } ${className}`}
    >
      {children}
    </div>
  );
}

/** Pill used for a factual attribute — never for a claim we cannot prove. */
export function Chip({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-full border border-[var(--border)] bg-[var(--canvas)] px-2.5 py-1 text-xs text-[var(--ink-muted)]">
      {children}
    </span>
  );
}

export function Badge({ children }: { children: React.ReactNode }) {
  return (
    <span className="self-start rounded-md bg-[var(--brand-soft)] px-2.5 py-1.5 text-[0.6875rem] font-bold uppercase tracking-[0.1em] text-[var(--brand)]">
      {children}
    </span>
  );
}

/* -------------------------------------------------------------------------- */
/* Media                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * A catalogue photo in a fixed aspect ratio.
 *
 * The frame owns the ratio and the image fills it, so a portrait source and a
 * landscape source both drop into the same slot with no layout shift. Where the
 * crop lands is the photo's own `focus`, not a global default — see photos.ts.
 *
 * `credit` is off by default: a photographer line under every thumbnail in a
 * three-up grid is noise. Turn it on for the large, standalone images.
 */
export function PhotoFigure({
  photo,
  ratio = 'aspect-video',
  sizes,
  className = '',
  priority = false,
  credit = false,
}: {
  photo: Photo;
  ratio?: string;
  sizes: string;
  className?: string;
  priority?: boolean;
  credit?: boolean;
}) {
  return (
    <figure className={`m-0 ${className}`}>
      {/* The dark backdrop is what shows while the image decodes, so a slow
          connection sees the theme rather than a white flash. */}
      <div className={`relative ${ratio} overflow-hidden rounded-[var(--radius-card)] bg-[var(--surface-dark)]`}>
        <Image
          src={photoSrc(photo)}
          alt={photo.alt}
          fill
          sizes={sizes}
          priority={priority}
          className="object-cover"
          style={{ objectPosition: photoFocus(photo) }}
        />
      </div>
      {credit ? (
        <figcaption className="mt-2 font-mono text-[0.6875rem] text-[var(--ink-subtle)]">
          {photoCredit(photo)}
        </figcaption>
      ) : null}
    </figure>
  );
}
