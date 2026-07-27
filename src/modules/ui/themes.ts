/**
 * Theme token table. A marketplace selects a theme by key in marketplace.yaml.
 *
 * Adding a marketplace that reuses an existing look is pure configuration.
 * Adding a new look adds a data entry here — never a branch in a component.
 */

export type ThemeTokens = {
  brand: string;
  brandInk: string;
  brandSoft: string;
  accent: string;
  surface: string;
  surfaceMuted: string;
  ink: string;
  inkMuted: string;
  border: string;
  radius: string;
  fontHeading: string;
  fontBody: string;
};

const FALLBACK: ThemeTokens = {
  brand: '#1f2937',
  brandInk: '#ffffff',
  brandSoft: '#f3f4f6',
  accent: '#2563eb',
  surface: '#ffffff',
  surfaceMuted: '#f8fafc',
  ink: '#0f172a',
  inkMuted: '#52606d',
  border: '#e2e8f0',
  radius: '0.75rem',
  fontHeading: 'ui-sans-serif, system-ui, sans-serif',
  fontBody: 'ui-sans-serif, system-ui, sans-serif',
};

export const THEMES: Record<string, ThemeTokens> = {
  'warm-wellness': {
    ...FALLBACK,
    brand: '#7c3f19',
    brandInk: '#fffaf5',
    brandSoft: '#fdf3e7',
    accent: '#c2621c',
    surface: '#fffdfa',
    surfaceMuted: '#faf3ea',
    ink: '#2b1c11',
    inkMuted: '#6d5843',
    border: '#ecdcc9',
    fontHeading: 'ui-serif, Georgia, serif',
  },
  'outdoor-living': {
    ...FALLBACK,
    brand: '#1f4d35',
    brandInk: '#f5fbf7',
    brandSoft: '#e9f3ec',
    accent: '#2f7d4f',
    surface: '#ffffff',
    surfaceMuted: '#f3f7f4',
    ink: '#12261b',
    inkMuted: '#4a5f52',
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
    '--brand-ink': tokens.brandInk,
    '--brand-soft': tokens.brandSoft,
    '--accent': tokens.accent,
    '--surface': tokens.surface,
    '--surface-muted': tokens.surfaceMuted,
    '--ink': tokens.ink,
    '--ink-muted': tokens.inkMuted,
    '--border': tokens.border,
    '--radius': tokens.radius,
    '--font-heading': tokens.fontHeading,
    '--font-body': tokens.fontBody,
  };
}
