# Claude Code prompt — saunas.mx frontend implementation

You are implementing the public-facing frontend for an existing, working Next.js 16 + TypeScript + Tailwind v4 marketplace application. Work directly in this repository.

## Your goal

Transform the current utilitarian public UI into the high-fidelity saunas.mx design system supplied in `design_handoff_saunas_mx/`, while preserving the existing configuration-driven marketplace platform and every working business flow.

The first visual target is **Saunas México / `suanas-mx`**. The implementation must not turn the shared codebase into a sauna-only application: `pergolas-mx` must still render from the same routes, host resolution, content/configuration model, and questionnaire engine.

## Source of truth — read before changing code

Read these files in full before coding:

1. `CLAUDE.md`
2. `design_handoff_saunas_mx/README.md`
3. `design_handoff_saunas_mx/Homepage.dc.html`
4. `design_handoff_saunas_mx/Directorio.dc.html`
5. `design_handoff_saunas_mx/Articulo.dc.html`
6. `docs/00-product-brief.md`, `docs/01-architecture.md`, `docs/12-implementation-plan.md`, `docs/13-acceptance-criteria.md`
7. `docs/adrs/ADR-006-versioned-configuration.md` and `docs/adrs/ADR-009-single-app-modules.md`
8. `src/app/page.tsx`, `src/app/cotizar/page.tsx`, `src/app/gracias/page.tsx`, `src/app/layout.tsx`
9. `src/modules/ui/site-chrome.tsx`, `src/modules/ui/themes.ts`, `src/app/globals.css`
10. `src/modules/forms-engine/questionnaire-form.tsx`
11. `config/marketplaces/suanas-mx/*` and the matching `pergolas-mx` configuration
12. Existing tests, especially `tests/e2e/journey.spec.ts` and `tests/e2e/second-marketplace.spec.ts`.

The `.dc.html` files are visual references only. Do **not** copy them into the app, retain their inline styles, or introduce a second standalone HTML implementation.

## Non-negotiable product and engineering constraints

- Keep Next.js App Router, TypeScript, Tailwind v4, the existing database schema, host resolution, configuration validation, and module boundaries.
- Do not change or bypass the real intake submission path: `QuestionnaireForm` must continue to POST to `/api/marketplaces/[slug]/projects`, retain idempotency, validation, attribution, consent capture, and the redirect to `/gracias`.
- The visual handoff shows a static 4-step quiz. The actual product has a **9-step schema-driven questionnaire**. Do not hard-code four sauna questions or reduce the existing form. Instead, restyle the existing controlled questionnaire and, if appropriate, make the hero card a faithful first-step preview that routes/focuses into `/cotizar` without discarding the actual flow.
- Do not make public claims, provider badges, filter values, guarantees, delivery times, ratings, materials, or coverage that the database/configuration does not support. Never show fabricated production data merely to fill the reference design.
- Preserve multi-marketplace behavior. No `if (slug === 'suanas-mx')` branches scattered through shared components. The warm wellness theme can carry the sauna visual system; other marketplaces must keep their own correct theme/content.
- Keep the public questionnaire, `/gracias`, `/ops/**`, and `/portal/**` authorization and noindex behavior intact. Do not expose provider portal or consumer data on public pages.
- Do not add a CMS, authentication provider, analytics provider, payment provider, component library, or major dependency for this task.
- Do not claim production is live. This is a local frontend implementation.

## Locked visual system for the warm-wellness theme

Implement these as reusable CSS variables/theme tokens and reusable components, not one-off inline values:

| Purpose | Value |
|---|---|
| Thermal Heat / primary CTA | `#B8623A` |
| Thermal Heat hover | `#9C5330` |
| Glacier Cold | `#1F4750` |
| Glacier Cold hover | `#163A43` |
| Brass / glow | `#E8C39A` |
| Canvas page | `#FAF6F0` |
| Card surface | `#FFFFFF` |
| Dark surface | `#0C0E10` |
| Subtle tint | `#F1E4D8` |
| Primary text | `#1A1D20` |
| Secondary text | `#525B62` |
| Muted text | `#8C96A0` |
| Border | `#E8DED2` |

- Heading/display type: Playfair Display, weight 500/600, serif fallback.
- Body/UI type: Plus Jakarta Sans, weights 400–700, sans-serif fallback.
- Do not make the build depend on a network font fetch. Use a safe local/fallback strategy if the project cannot reliably bundle the Google fonts.
- Type scale: hero 76px/1.02 desktop; display 48px/1.1; section headings 40px; subheads 28–32px; body 15–18px; labels 11px uppercase, 700 weight, 0.15em tracking.
- Radii: 8px controls, 12px supplier/media cards, 16px quiz and lead cards.
- Shadows: normal `0 20px 40px rgba(0,0,0,.06)`; hero quiz `0 30px 60px rgba(0,0,0,.35)`.
- Interactions: card hover uses a restrained `translateY(-2px)`; buttons/links use the specified color swaps. Honor `prefers-reduced-motion`.
- Retain visible keyboard focus and semantic labels; never trade accessibility for visual fidelity.

## Components to create or upgrade

Put reusable public presentation components under an appropriate existing module (for example `src/modules/ui/`). Keep data access in domain/query modules and keep route files as composition layers.

1. **Site header and footer**
   - Desktop: sticky white header, 1px border, 20px vertical / 64px horizontal visual rhythm, wordmark left; Directorio, Ciencia, Blog, and primary “Cotizar ahora” right.
   - Map links only to implemented, valid routes/anchors. The CTA always goes to `/cotizar`. Do not leave `href="#"`.
   - Mobile: accessible menu or a carefully simplified responsive nav; never allow horizontal overflow.
   - Footer: dark surface, wordmark left, valid site/legal links right. Keep the existing privacy notice and contact path available.

2. **Buttons, label/eyebrow, cards, chips, media placeholder**
   - Build small reusable primitives so homepage, directory, article, questionnaire and confirmation use the same system.
   - While photography/video assets are absent, retain clearly non-production, accessible placeholders based on the handoff (not deceptive stock imagery). Make asset replacement straightforward with `next/image` or a documented media field later.

3. **Verified Supplier Card**
   - 12px white card, subtle border, 24px padding; optional logo/media slot; verification badge; name, accurate coverage/description; truthful service tags; outline CTA that fills terracotta on hover.
   - Never render “Proveedor Verificado México” unless the public query proves this provider is approved for the resolved marketplace.
   - The CTA must use the legitimate inquiry flow (`/cotizar`); it must not imply a private direct-contact path that does not exist.

4. **Questionnaire UI**
   - Restyle `QuestionnaireForm` using the card treatment: progress indicator, strong heading, readable errors, choice cards, inputs, back/continue controls, mobile-friendly width.
   - Maintain its test IDs and current client/server validation behavior.
   - The hero preview should not duplicate stateful intake logic. It can be a presentational conversion card whose CTA navigates to `/cotizar`, ideally with the correct first question/step count derived from configuration.

## Screens and routes

### A. Homepage (`/`) — build first

Recompose `src/app/page.tsx` with real config/content as the source of copy.

- Sticky header.
- Full-bleed dark hero with a warm wood/vapor **placeholder** and a bottom-heavy dark overlay. Desktop height ~92vh. Content is bottom-aligned.
- Lowercase hero display; brass eyebrow; ghost-link CTA; desktop floating quiz preview on the right.
- Supplier section: heading and up to three verified/approved suppliers from a proper marketplace-scoped public query. Empty state must remain useful and honest.
- Science section (`#ciencia`): cream-tint background, centered header, two balanced heat/cold cards. Keep language educational and non-medical; do not make unsupported health claims.
- Editorial section: two media/article cards only if backed by published content. If content is not yet modeled, implement the clean section shell with an honest empty/coming-soon state rather than pretending articles exist.
- Dark footer.

### B. Directory (`/directorio`)

Implement a responsive, marketplace-scoped directory only after the homepage is complete.

- Desktop architecture: header block, then a 260px sticky sidebar plus results grid. Collapse filters into a mobile-friendly disclosure/drawer below desktop breakpoint.
- Every displayed provider must be approved and scoped to the active marketplace in the database.
- Only implement filters and sort criteria supported by current data. The handoff’s wood, delivery and warranty controls are visual references; do not show them as working filters unless the data and query implementation exist. Prefer coverage/service filters that are truthfully derived from `providerTerritory` and `providerService`.
- Result count is the actual count, not the reference’s “24”. No nonfunctional controls.
- All supplier CTAs go to the legitimate quote route, optionally carrying only safe non-authoritative UI context.
- Add metadata/canonical behavior consistent with the existing app. Do not index a new route unless its production eligibility is actually satisfied.

### C. Article template (`/blog/[slug]` or the repository’s established public-content route)

Implement the template only if it can read published content through the existing content boundary. Do not create a fake hard-coded article system.

- Article header max width 900px; 21:9 featured media; 1fr + 360px article/sidebar grid; sticky sidebar at 96px desktop.
- Style prose: 18px/1.6 body, Playfair H2s, terracotta drop cap when appropriate, warm pull quote, responsive tables and 16:9 embedded media slot.
- Sidebar is a compact lead-capture card that routes safely into the actual full questionnaire rather than bypassing consent or posting an incomplete project. A postal-code prefill is allowed only if it is safely validated by the existing form.
- Related supplier cards obey the same truthful, marketplace-scoped public query policy.
- On mobile, render a single readable column and move the lead card below introductory content or article body.

## Responsive, accessibility and performance requirements

- Add intentional breakpoints for narrow phones, tablet and desktop. The desktop 64px gutters must become sensible 20–24px gutters on phones.
- No fixed desktop widths that create overflow. The hero must stack gracefully; quiz preview must become full-width in-flow.
- Use semantic `header`, `nav`, `main`, `section`, `article`, `aside`, headings in order, native form controls, correct button types, associated labels, and descriptive link text.
- Preserve or improve focus-visible styling, color contrast, error announcements, and keyboard behavior.
- Avoid layout shifts: reserve media aspect ratios and avoid client-only content that changes the initial layout.
- Use images only with meaningful `alt` text; placeholders must not be announced as real photographs.

## Suggested execution sequence

1. Inspect the source-of-truth files and write a short implementation plan in your response: files to change, data gaps, and tests affected.
2. Create/extend the token layer for the warm-wellness theme and global typography/base styles without regressing pergolas.
3. Build reusable chrome and primitives, then implement the homepage and the restyled actual questionnaire/confirmation page.
4. Add the honest marketplace-scoped supplier query and directory route. Add only supported filters.
5. Add the article template only through the published-content model; if no published article exists, implement the reusable route/template and a tested no-content/404 behavior rather than invented content.
6. Update or add tests for all changed routes, critical CTA navigation, responsive behavior where practical, and the second marketplace regression.
7. Run and report the exact results of:

```bash
npm run lint
npm run typecheck
npm test
npm run test:integration
npm run test:e2e
npm run build
```

Use the local database reset/seed workflow as required. Do not leave generated database files or test artifacts untracked.

## Definition of done

- The warm-wellness Saunas experience visually matches the three handoff references in hierarchy, color, typography, spacing, components and interaction states, without copied inline-prototype markup.
- `/`, `/cotizar`, and `/gracias` are visibly coherent, responsive and functional.
- The original consumer journey, consent storage, authorization boundaries, host resolution, and second-marketplace behavior all continue to pass tests.
- New public directory/content screens, if added, use truthful database/configuration-backed data and no fake working controls.
- No production, legal, medical, supplier-verification or commercial claim has been introduced without a real source.
- Lint, typecheck, unit, integration, E2E and production build pass.

At the end, summarize: files changed, design decisions, any intentional deviations from the handoff, known data/content gaps, and the full validation output. Do not declare the public domain deployed or launch-ready.
