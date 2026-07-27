# Acceptance Criteria and Phase Gates

Boxes are ticked only where a test or a recorded observation demonstrates the behaviour. Deferred scope is listed as deferred, not as passing.

Last verified: 2026-07-27, against the local development environment (embedded PostgreSQL, fake email adapter).

Command evidence:

```text
npm run lint             ✓
npm run typecheck        ✓
npm test                 ✓  101 unit tests
npm run test:integration ✓  71 integration tests
npm run test:e2e         ✓  14 browser tests
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
- [x] Canonical domain and alias redirect behaviour are tested — unit tests; `www.suanas.mx` → `suanas.mx` observed as a 308 preserving path and query.
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

## Second-marketplace gate

- [x] `pergolas-mx` is generated from a template — `npm run marketplace:create` was used to generate a third marketplace, which validated on the first run and was then removed.
- [x] Shared app renders it without a category-specific route.
- [x] Questionnaire options differ through config — `terrace/garden/rooftop` versus `indoor/outdoor`.
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
