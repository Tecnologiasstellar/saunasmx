# Handoff: saunas.mx — Lead Generation Marketplace

## Overview
saunas.mx is a lead-generation marketplace connecting Mexican buyers with verified sauna/cold-plunge manufacturers. This package covers 3 screens: Homepage, Manufacturer Directory, and a Blog Article view with lead-gen sidebar.

## About the Design Files
The `.dc.html` files in this bundle are **design references** — high-fidelity HTML/CSS prototypes showing intended look, layout, and copy. They are not production code to copy directly. Recreate these designs in the target codebase's existing environment (React, Vue, etc.) using its established component patterns — or, if no environment exists yet, choose the most appropriate framework and implement there.

## Fidelity
**High-fidelity (hifi)**: final colors, typography, spacing, and component states are locked. Recreate pixel-perfectly.

## Screens

### 1. Homepage (`Homepage.dc.html`)
- **Purpose**: Convert visitors into leads via a hero quiz funnel; showcase suppliers, education, editorial content.
- **Layout**: Single column, full-width sections stacked vertically. Sticky top nav (white, 1px bottom border, 20px/64px padding).
- **Hero**: Full-bleed dark section (`min-height:92vh`), striped photo placeholder background with dark gradient overlay (bottom-heavy: `rgba(12,14,16,0.92)` → `0.15` → `0.35`). Content bottom-aligned via flex. Lowercase Playfair Display headline at 76px/1.02 line-height. Ghost-link CTA (bottom-border only, no fill). Floating glass quiz card (400px wide, `rgba(255,255,255,0.96)`, `backdrop-filter: blur(6px)`, 16px radius, shadow `0 30px 60px rgba(0,0,0,.35)`) anchored bottom-right of hero via flex `justify-content:space-between`.
- **Quiz widget internals**: progress bar (4 segments, 24×4px pills), 3-option grid (icon circle/diamond/square + label), selected state = 2px terracotta border + small dot badge top-right, full-width CTA button.
- **Featured Suppliers**: 3-col grid of Supplier Cards (see Component B below).
- **Science 101**: centered header + 2-col grid, dark (`#0C0E10`) "Calor" card and glacier (`#1F4750`) "Frío" card, each with bullet list.
- **Editorial**: 2-col grid (1.1fr/1fr), video card (16:9, play-badge overlay shown on hover) + guide card (16:9 placeholder).
- **Footer**: dark bar, logo left, nav links right.

### 2. Directory (`Directorio.dc.html`)
- **Purpose**: Browse/filter verified manufacturers.
- **Layout**: Header block (48px/64px title area) → `grid-template-columns: 260px 1fr` (sticky filter sidebar + main grid).
- **Sidebar**: 4 filter groups (Ubicación, Tipo de Madera, Tiempo de Entrega, Garantía), checkboxes/radios with `accent-color:#B8623A`.
- **Main**: result count + sort `<select>`, 3-col grid of 6 Supplier Cards.

### 3. Blog Article (`Articulo.dc.html`)
- **Purpose**: Long-form educational content with persistent lead capture.
- **Layout**: Article header (max-width 900px) → full-width featured media (21:9 placeholder) → `grid-template-columns: 1fr 360px` two-column body (article content + sticky sidebar, `position:sticky;top:96px`).
- **Article content**: drop-cap opening paragraph, H2 subheads, pull-quote (`background:#F1E4D8`, left border `#B8623A`), embedded video placeholder (16:9), data table.
- **Sticky sidebar**: lead-capture card (postal code input, project-type select, submit button) + secondary PDF download link.
- **Related**: 3-col supplier card grid at page bottom.

## Reusable Components

### Component A — Match Engine Quiz Widget
Rounded 16px, white/glass surface, shadow `0 20px 40px rgba(0,0,0,.06)` (solid card contexts) or `0 30px 60px rgba(0,0,0,.35)` (over dark hero). Step cards: unselected = `#FAF6F0` bg + 1px `#E8DED2` border; hover = `translateY(-2px)` + terracotta border; selected = white bg + 2px terracotta border + small dot badge.

### Component B — Verified Supplier Card
12px radius, white bg, 1px `#E8DED2` border, 24px padding. Contents: 64×64px logo placeholder (striped, monochrome slate), status badge (`#F1E4D8` bg / `#B8623A` text, uppercase, "PROVEEDOR VERIFICADO MÉXICO"), H3 name, muted coverage line, 2 metadata pill tags, outline CTA button ("Solicitar Cotización Directa") that fills terracotta on hover.

### Component C — Editorial Media Card
16:9 (video) or 4:3 (feature) aspect ratio placeholder, category uppercase tag (terracotta or glacier), H3 title, metadata line (time + author). Hover: image/placeholder scales 1.04 over 400ms (play-badge fades in for video cards).

## Interactions & Behavior
- Quiz widget currently **static** (shows Step 1 of 4 with "Interior" pre-selected as an example state) — not wired to advance. Implement as a controlled multi-step form: 4 steps (Tipo de Espacio → Modalidad → Fuente de Poder → Datos de Contacto/CP), each updates progress bar fill, "Continuar" advances state, final step posts to lead-routing endpoint.
- Nav links: Directorio → directory screen, Blog → article screen, Ciencia → homepage `#ciencia` anchor.
- All card CTAs are placeholder links (`href="#"` on directory/article cards) — wire to real routing.
- Hover states throughout use `translateY(-2px)` (cards) or color/border swaps (links, buttons) — see inline `style-hover` attributes in source for exact values.

## Design Tokens

### Colors
| Token | Hex | Usage |
|---|---|---|
| Thermal Heat (primary accent) | `#B8623A` | CTAs, active states, links |
| Thermal Heat hover | `#9C5330` | button/link hover |
| Glacier Cold (secondary accent) | `#1F4750` | cold-themed accents, icons |
| Glacier Cold hover | `#163A43` | hover state |
| Brass/Glow accent | `#E8C39A` | hero eyebrow text, dividers, play icon |
| Canvas Light | `#FAF6F0` | page background |
| Canvas Card | `#FFFFFF` | card surfaces |
| Canvas Dark | `#0C0E10` | hero/footer background |
| Subtle Tint | `#F1E4D8` | alternating sections, badge backgrounds |
| Text Primary | `#1A1D20` | body text |
| Text Secondary | `#525B62` | secondary copy |
| Text Muted | `#8C96A0` | captions/metadata |
| Border Subtle | `#E8DED2` | dividers, card borders |

### Typography
- Display/Headings: **Playfair Display** (500/600 weight), serif
- Body/UI: **Plus Jakarta Sans** (400–700 weight), sans-serif
- Scale: hero H1 76px/1.02, display-lg 48px/1.1, heading-md 28–32px, heading-sm 20–22px, body-lg 18px/1.6, body-md 15–16px, caption 13px, label-uppercase 11px/700/+0.15em tracking

### Radii & Shadows
- Card radius: 12px (supplier/media cards), 16px (quiz widget, sticky lead card)
- Ambient shadow: `0 20px 40px rgba(0,0,0,0.06)`
- Hero-floating shadow: `0 30px 60px rgba(0,0,0,0.35)`

## Assets
All imagery is **striped placeholder divs** with monospace captions describing the intended photo/video (e.g. "foto: luz cálida sobre madera de cedro"). Real photography/video needs to be sourced and dropped in before production use.

## Files
- `Homepage.dc.html`
- `Directorio.dc.html`
- `Articulo.dc.html`

Each is a self-contained HTML file — open directly in a browser to view/inspect.
