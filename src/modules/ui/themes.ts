/**
 * Theme token table. A marketplace selects a theme by key in marketplace.yaml.
 *
 * Adding a marketplace that reuses an existing look is pure configuration.
 * Adding a new look adds a data entry here — never a branch in a component.
 *
 * `warm-wellness` carries the saunas.mx visual system from
 * design_handoff_saunas_mx/. Those hexes are locked; change them here, never at
 * a call site.
 */

export type ThemeTokens = {
  /** Primary CTA fill. */
  brand: string;
  brandHover: string;
  /** Text drawn on top of `brand`. */
  brandInk: string;
  /** Tint used for badges and alternating sections. */
  brandSoft: string;
  /** Secondary accent — the cold half of the contrast pair. */
  accent: string;
  accentHover: string;
  /** Warm highlight for eyebrows over dark surfaces and hover states in the footer. */
  glow: string;
  /** Page background. */
  canvas: string;
  /** Card background. */
  surface: string;
  surfaceMuted: string;
  /** Hero and footer background. */
  surfaceDark: string;
  ink: string;
  inkMuted: string;
  /** Captions and metadata. */
  inkSubtle: string;
  border: string;
  /** Controls: buttons, inputs. */
  radius: string;
  /** Supplier and media cards. */
  radiusCard: string;
  /** Quiz and lead-capture cards. */
  radiusPanel: string;
  fontHeading: string;
  fontBody: string;
};

const SANS = "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif";

const FALLBACK: ThemeTokens = {
  brand: '#1f2937',
  brandHover: '#111827',
  brandInk: '#ffffff',
  brandSoft: '#f3f4f6',
  accent: '#2563eb',
  accentHover: '#1d4ed8',
  glow: '#cbd5e1',
  canvas: '#ffffff',
  surface: '#ffffff',
  surfaceMuted: '#f8fafc',
  surfaceDark: '#0f172a',
  ink: '#0f172a',
  inkMuted: '#52606d',
  inkSubtle: '#7b8794',
  border: '#e2e8f0',
  radius: '0.5rem',
  radiusCard: '0.75rem',
  radiusPanel: '1rem',
  fontHeading: SANS,
  fontBody: SANS,
};

export const THEMES: Record<string, ThemeTokens> = {
  'warm-wellness': {
    ...FALLBACK,
    brand: '#B8623A',
    brandHover: '#9C5330',
    brandInk: '#FAF6F0',
    brandSoft: '#F1E4D8',
    accent: '#1F4750',
    accentHover: '#163A43',
    glow: '#E8C39A',
    canvas: '#FAF6F0',
    surface: '#FFFFFF',
    surfaceMuted: '#FAF6F0',
    surfaceDark: '#0C0E10',
    ink: '#1A1D20',
    inkMuted: '#525B62',
    inkSubtle: '#8C96A0',
    border: '#E8DED2',
    // Playfair and Plus Jakarta are requested from Google Fonts by the browser
    // and are never a build dependency. The fallbacks carry the same
    // serif/sans contrast if that request fails.
    fontHeading: "'Playfair Display', Georgia, 'Times New Roman', serif",
    fontBody: `'Plus Jakarta Sans', ${SANS}`,
  },
  'outdoor-living': {
    ...FALLBACK,
    brand: '#1f4d35',
    brandHover: '#163826',
    brandInk: '#f5fbf7',
    brandSoft: '#e9f3ec',
    accent: '#2f7d4f',
    accentHover: '#256540',
    glow: '#bcd6c4',
    canvas: '#f3f7f4',
    surface: '#ffffff',
    surfaceMuted: '#f3f7f4',
    surfaceDark: '#12261b',
    ink: '#12261b',
    inkMuted: '#4a5f52',
    inkSubtle: '#7c8f84',
    border: '#d7e5dc',
  },
};

export function themeTokens(themeKey: string): ThemeTokens {
  return THEMES[themeKey] ?? FALLBACK;
}

/** Renders the token set as CSS custom properties for an inline style attribute. */
export function themeStyle(themeKey: string): Record<string, string> {
  const tokens = themeTokens(themeKey);
  return {
    '--brand': tokens.brand,
    '--brand-hover': tokens.brandHover,
    '--brand-ink': tokens.brandInk,
    '--brand-soft': tokens.brandSoft,
    '--accent': tokens.accent,
    '--accent-hover': tokens.accentHover,
    '--glow': tokens.glow,
    '--canvas': tokens.canvas,
    '--surface': tokens.surface,
    '--surface-muted': tokens.surfaceMuted,
    '--surface-dark': tokens.surfaceDark,
    '--ink': tokens.ink,
    '--ink-muted': tokens.inkMuted,
    '--ink-subtle': tokens.inkSubtle,
    '--border': tokens.border,
    '--radius': tokens.radius,
    '--radius-card': tokens.radiusCard,
    '--radius-panel': tokens.radiusPanel,
    '--font-heading': tokens.fontHeading,
    '--font-body': tokens.fontBody,
  };
}
