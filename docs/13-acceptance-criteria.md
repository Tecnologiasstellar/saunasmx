# Acceptance Criteria and Phase Gates

Boxes are ticked only where a test or a recorded observation demonstrates the behaviour. Deferred scope is listed as deferred, not as passing.

Last verified: 2026-07-27, against the local development environment (embedded PostgreSQL, fake email adapter).

Command evidence:

```text
npm run lint             ✓
npm run typecheck        ✓
npm test                 ✓  108 unit tests
npm run test:integration ✓  78 integration tests
npm run test:e2e         ✓  25 browser tests
npm run build            ✓
```

## Global definition of done

- [x] TypeScript strict mode passes (`strict`, `noUncheckedIndexedAccess`).
- [x] Lint and formatting pass.
- [x] Unit tests cover business rules and edge cases — `tests/unit/`.
- [x] Integration tests cover database transactions and authorization — `tests/integration/`.
- [x] E2E test covers every completed user-visible journey — `tests/e2e/`.
- [x] No secrets or real PII in fixtures/logs — fixtures use `example.com`; `src/modules/observability/logger.ts` redacts.
- [x] Docs reflect delivered behaviour — ADR-009/010/011 record the deviations.
- [x] Failure and retry behaviour is tested — outbox retry and dead-letter tests.

## Foundation gate

- [x] One shared app resolves marketplace by host — `tests/unit/resolve-host.test.ts`.
- [x] Canonical domain and alias redirect behaviour are tested — unit tests; `www.saunas.mx` → `saunas.mx` observed as a 308 preserving path and query.
- [x] Two marketplace configs render distinct name/theme/content — `tests/e2e/second-marketplace.spec.ts`.
- [x] Unknown host fails safely — 404 from `src/proxy.ts` with no branding, asserted in E2E.
- [x] Config schema rejects duplicate/invalid identifiers — 16 cases in `tests/unit/marketplace-config.test.ts`.
- [x] Migrations and seeds run from a clean database — `npm run db:reset && npm run db:seed`, run before every E2E suite.

## Consumer intake gate

- [x] Required location and contact fields validate — schema built from the questionnaire config.
- [x] Consent policy version and timestamp are stored — two `consent_record` rows per project.
- [x] Attribution is stored without trusting client values for authorization — stored on `attribution_touch`; tenancy comes from the Host header only.
- [x] Duplicate submissions are detected through idempotency and duplicate heuristics.
- [x] Project and lead are separate records.
- [x] Status histories are written — both project and lead.
- [x] `project.created` is written to the outbox, carrying reference ids only.
- [x] Provider notification is asynchronous — asserted: nothing is sent until the worker runs.
- [x] Consumer sees a safe confirmation — no qualification or spam verdict disclosed.

## Matching gate

- [x] Inactive/unapproved provider cannot qualify.
- [x] Territory mismatch disqualifies provider.
- [x] Service/project-type mismatch disqualifies provider.
- [x] Budget minimum is enforced; an unstated budget is never treated as zero.
- [x] Score weights are configuration-driven — changing weights changes the ranking.
- [x] Match explanations are stored — eligibility, breakdown, reasons and rule version per assignment.
- [x] Distribution max is enforced — including across separate assignment calls.
- [x] Manual review can override distribution only through an auditable action — an operator may choose among eligible providers but cannot route to a disqualified one.

## Provider portal gate

- [x] Provider user sees only company-authorized data — cross-company reads return nothing; commands return `ASSIGNMENT_NOT_FOUND`.
- [x] Assignment accept/reject is idempotent — one `lead.accepted` event for repeated accepts.
- [x] Lead status history captures actor and timestamp.
- [x] Quote amount stores integer minor units and currency — fractional amounts rejected.
- [x] Won/lost outcome requires appropriate permissions — only `provider_owner` may record a win.
- [x] Provider can update services and territories only within allowed workflow — `/portal/cobertura`, `src/modules/provider/coverage.ts`. Company owner only (checked against the membership for *that* company, not the session's flat role list); the marketplace comes from the Host header, never the form; service keys are restricted to the questionnaire options the config exposes; postal prefixes must be 2–5 digits, capped at 50; an empty set is rejected rather than silently stopping all leads; a relationship under review (`rejected`/`suspended`) is read-only. Each change writes a `provider.coverage_updated` audit record with before/after. Covered by 16 unit, 13 integration and 1 browser test.
  - Applies to future matching only: an existing assignment and its stored explanation are never rewritten — asserted in `tests/integration/coverage.test.ts`.

## Commercial gate — partial (phase 5)

COM-001 (plans and agreements) is delivered. COM-002 (Stripe) and COM-003 (commission ledger) are not started; the tables they need already exist (`commission_event` with `reverses_event_id`, `invoice`, `payment`, `adjustment`, `dispute`, `webhook_delivery`), so no destructive migration is needed later.

- [x] Terms are stored on provider-marketplace agreement — `/ops/planes`, `src/modules/commercial/`. `plan_terms` is a versioned Zod contract covering every pricing primitive in docs/07, in integer minor units and basis points; unknown fields are rejected rather than dropped, so a typo in a fee cannot silently become a free plan. Assigning a plan copies the terms onto `provider_agreement.terms_snapshot_json` and derives `commission_agreement` rows with their own snapshot. Editing or retiring the plan afterwards changes nothing about agreements already signed — asserted in `tests/integration/agreements.test.ts` and, through the operator UI, in `tests/e2e/commercial.spec.ts`.
  - An agreement is never mutated or deleted: switching plans stamps `ends_at` on the current one and opens a successor, so the history a commission event will cite stays readable. Re-assigning an unchanged plan is a no-op.
  - Plan and agreement are scoped to the marketplace resolved from the Host header; a plan from another marketplace returns `PLAN_NOT_FOUND` rather than confirming it exists.
  - Commercial terms cannot buy ranking (docs/07 "Provider trust"): the matching engine never reads them, asserted by ranking a lead before and after a premium plan with `featured_placement`.
  - Reachable by `operator`, `admin` and `finance_operator`; a provider user is redirected.
- [ ] Stripe IDs are linked but not treated as the only source of truth — **COM-002, not started**. `subscription.external_*` and `invoice.external_invoice_id` columns exist and are unused.
- [ ] Duplicate payment webhook is harmless — `webhook_delivery(provider, external_event_id)` is unique, but no webhook handler exists.
- [ ] Commission event snapshots agreement terms — **COM-003**. The agreement side of the snapshot is done; no `commission_event` is written yet.
- [ ] Adjustments/reversals preserve the original event.
- [ ] Finance operator can reconcile outstanding items.

## AI gate — deferred (phase 6)

`ai_run` exists and `matching.yaml` pins `ai_role: attribute_extraction_and_summary_only`. No AI gateway is implemented, so nothing in the system calls a model today.

- [ ] AI outputs validate against a schema.
- [ ] Invalid/unavailable output falls back to manual review.
- [ ] Prompt/model/version/cost are logged.
- [x] AI cannot override deterministic eligibility — structurally guaranteed: `evaluate.ts` is a pure function of candidates, project facts and config, with no model in the path.
- [ ] Prompt-injection fixture is handled safely.
- [ ] Low-confidence outputs are visible to operators.

## Public site gate

The saunas.mx design system from `design_handoff_saunas_mx/` is implemented as theme tokens and shared components. The rule applied throughout: a public surface may only state what the database or the configuration can prove.

- [x] The warm-wellness visual system lives in tokens, not in components — `src/modules/ui/themes.ts` carries the locked palette, radii and type stacks; `src/app/globals.css` carries elevation, gutters and prose. Adding a look is a data entry; `pergolas-mx` renders the same routes under `outdoor-living` with its own palette and its own hero texture. Asserted in `tests/e2e/second-marketplace.spec.ts`.
- [x] Webfonts are never a build dependency — Playfair Display and Plus Jakarta Sans are requested by the browser from the root layout, with serif/sans fallbacks in the tokens. `next build` performs no font fetch.
- [x] Navigation is configuration, not code — `nav` in `marketplace.yaml`, validated to site-relative paths and anchors, rejecting `#` and off-site URLs. Pérgolas lists no blog entry and `features.blog: false` makes `/blog`, `/blog/[slug]` and `/llms.txt` return 404 there, so the sauna corpus cannot surface under another brand. 4 unit tests plus 2 browser tests.
- [x] No public link is a placeholder — asserted across `/`, `/lugares`, `/proveedores`, `/cotizar` and `/gracias` in `tests/e2e/public-site.spec.ts`.
- [x] The hero conversion card does not fork the intake path — it is presentational, derives its question and the real step count (9, not the mockup's 4) from the questionnaire config, and its CTA navigates to `/cotizar`. Asserted in E2E.
- [x] The questionnaire keeps its behaviour through the restyle — same test IDs, same client and server validation, same POST to `/api/marketplaces/[slug]/projects`, same idempotency key, same consent capture, same `/gracias` redirect. The full consumer journey in `tests/e2e/journey.spec.ts` is unchanged and passes.
- [x] An article's lead card cannot bypass consent — it is a GET form to `/cotizar`; only a well-formed five-digit postal code survives, validated server-side in the route and again by the intake API. A malformed `?cp=` is dropped, not echoed. Asserted in E2E.
- [x] The provider directory shows only what this marketplace publishes — scope is enforced in SQL in `src/modules/directory/queries.ts`, which filters on `marketplace_id`, `publication_status = 'published'` and `evidence_status in ('core','secondary')` in one predicate used by every read. `/directorio` 308-redirects to `/proveedores`. 21 integration tests plus 13 browser tests.
- [x] The verification badge reflects a real commercial relationship, not research — it is resolved from `provider_marketplace.status = 'approved'` through `directory_profile.provider_company_id`. A researched listing that has never signed up cannot display it.
- [x] No fabricated public claim — coverage is the provider's own territories, service tags resolve through the questionnaire's own labels, and the result count is the real count. The handoff's wood, delivery-time, warranty, rating and "24 fabricantes" controls are **deliberately not implemented**: no column backs them. Filters and sort are region, service and name/recency, all of which do.
- [x] The public read model exposes no supplier contact details — a supplier profile renders no phone or email, because reaching one goes through `/cotizar`, where consent is captured. A venue publishes its own phone, since a booking is not a lead. Asserted in `tests/unit/directory-view-model.test.ts`.
- [x] Explainer copy makes no medical claim — the heat/cold section describes what each modality asks of the installation and points readers to a health professional. Copy lives in a content block, so it is editable without a deploy.
- [x] Media placeholders cannot be mistaken for photography — abstract striped surfaces with a visible caption naming the pending shot, and an `aria-label` for the logo slot. Swapping in `next/image` at the same aspect ratio causes no layout shift.
- [x] Public pages fit a 360px phone with no horizontal overflow — asserted for `/`, `/lugares`, `/proveedores`, both profile templates, `/cotizar`, `/gracias` and `/blog`.
- [x] The directory indexes only when it has earned it — production, plus the marketplace's own `defaultIndexing`, plus at least two published profiles; state-filtered views are always `noindex`. Verified locally as `noindex` outside production.
- [x] One page template serves both record kinds — `/lugares/[slug]` and `/proveedores/[slug]` render the same `DirectoryProfilePage`, and `DirectoryCard` serves both indexes and every related strip. The only kind-dependent decisions live in the adapter (`src/modules/directory/view-model.ts`): the primary call to action, and whether the location row is labelled *Acceso* or *Cobertura*.
- [x] Unknown is never published — `PENDIENTE` and masked placeholders become `null` at the CSV boundary. Asserted for all 64 mapped records in unit tests and again in the browser across six public pages.
- [x] Records the research cannot support are unreachable — the four `verify` records 404 and appear in no index, related strip or sitemap. Publishing a `verify` record by hand still does not expose it: the evidence predicate is in SQL, not in a caller.
- [x] A call to action never promises more than the evidence — every venue in the research file publishes its homepage as its booking URL, so wording is derived from `access_model`: 12 of 22 models take a direct booking and read *Reservar sesión*; the other 10 read *Ver opciones de reserva*. A record with no valid URL gets no button at all.
- [x] A supplier's lead stays in the consented pipeline — the provider call to action is the internal `/cotizar?proveedor=[slug]`, resolved against a published profile before it is displayed or submitted, and stored as a `preferred_provider` project requirement. It is a preference, never an assignment: eligibility and routing stay with matching and the operator (ADR-005, ADR-008).
- [x] Re-importing refreshed research does not overwrite an operator — fields still matching the last import are refreshed; fields edited since are reported as conflicts and left alone. Evidence that weakens to `verify` pulls a live page down; recovery never re-publishes on its own. 13 integration tests.
- [x] Publishing needs no deploy — every directory route is server-rendered per request (`ƒ` in `next build`), because tenant resolution reads the Host header. An operator's edit is live on the next request, including in the sitemap and the JSON-LD.
- [x] Structured data claims nothing unverified — `LocalBusiness`/`ProfessionalService` plus `BreadcrumbList`, with no `aggregateRating`, `priceRange`, `openingHours` or `image`. Asserted in the browser.
- [x] No directory profile implies a photograph we do not have — the research package licenses no image of any listed business, so every profile renders a monogram on a brand-tinted field. Stock photography is never placed beside a named business (`src/modules/ui/photos.ts`).
- [ ] An accessibility audit has been run — focus styles, semantics, labels, `aria-live` errors and `prefers-reduced-motion` are implemented and spot-checked, but no automated audit (axe/Lighthouse) has been executed. Tracked under the production-readiness gate.
- [ ] Real photography and video are in place — every image slot is still a placeholder, and directory profiles will stay on the monogram fallback until a business grants a licensed asset.
- [ ] The directory has an operator CRUD screen — profiles are editable in the database and the import respects those edits, but there is no `/ops` form yet. Tracked with the production-readiness gate.
- [ ] The research has been re-verified by phone — the package requires confirming price, schedule and access before launch and every 90 days after. `last_verified_at` is stored and rendered on every profile so the age is never hidden.

## Second-marketplace gate

- [x] `pergolas-mx` is generated from a template — `npm run marketplace:create` was used to generate a third marketplace, which validated on the first run and was then removed.
- [x] Shared app renders it without a category-specific route.
- [x] Questionnaire options differ through config — `terrace/garden/rooftop` versus `indoor/outdoor`, each with its own consumer-facing Spanish label ("Terraza", "Bajo techo").
- [x] No consumer ever sees a raw option key — a string option must declare an explicit `label`; only numeric options (capacity `2`, `4`, `6`) may stand alone. Enforced by `optionValue` in `src/modules/marketplace-config/schema.ts`, so `npm run config:validate` fails before a bare key can ship. Guarded across every configured marketplace in `tests/unit/marketplace-config.test.ts`.
- [x] Matching dimensions differ through config — `answer_mapping.service` is `material` here and `type` for saunas.
- [x] Provider identity can participate in both marketplaces — Grupo Exterior MX.
- [x] Shared tests pass for both configurations.

## Production-readiness gate — not started (phase 8)

- [x] robots/indexing rules differ correctly by environment — public pages are indexable only when `APP_ENV=production` *and* the config allows it; portals and the questionnaire are always `noindex`. Verified locally, not on a live domain.
- [ ] sitemap and canonical URLs are verified on each public domain — **no sitemap is implemented**. Canonical URL metadata exists.
- [ ] mobile and accessibility smoke tests pass — layouts are responsive and focus styles exist, but no audit has been run.
- [ ] error monitoring receives a test event — no Sentry integration; errors go to structured logs only.
- [ ] backups and restore are rehearsed.
- [ ] data retention/deletion runbook is executable — `consumer.anonymized_at` exists; no workflow uses it.
- [ ] live public URL is independently checked before launch is declared — nothing is deployed.
