# Implementation Plan

## Goal

Reach a working `suanas.mx`-configured marketplace while proving that a second category can be rendered and operated without category-specific rewrites.

## Phase 0 — Specification lock

Deliver:

- repository skeleton;
- config schema and validation;
- ADRs 001–008;
- database specification;
- seed fixtures;
- CI quality gates;
- local environment instructions.

Gate: configuration validates and documentation is internally consistent.

## Phase 1 — Platform foundation

Build:

- Next.js app shell;
- host/domain resolver;
- marketplace registry;
- shared theme tokens;
- auth/session scaffolding;
- database migrations;
- audit helper;
- error/logging baseline.

Gate: two fictional marketplace configs render distinct public pages from shared code.

## Phase 2 — Demand engine

Build:

- public landing, category, city, guide, and provider-profile templates;
- schema-driven questionnaire runtime;
- consumer/project/requirements/consent/attribution records;
- duplicate/spam checks;
- confirmation page and email adapter;
- ops lead inbox.

Gate: a synthetic consumer submission creates the correct records and outbox event, with no provider notification in the request path.

## Phase 3 — Supply and matching

Build:

- provider onboarding and approval;
- services, territories, capacity, and portfolio;
- deterministic eligibility;
- configurable scoring and explanations;
- manual review queue;
- assignment creation and provider notifications.

Gate: ineligible providers cannot receive a lead; eligible assignments show reproducible score reasons.

## Phase 4 — Provider workflow

Build:

- provider login and company-scoped access;
- assignment inbox;
- accept/reject;
- contact/quote/status updates;
- appointments;
- won/lost lifecycle;
- consumer-safe status communications.

Gate: provider actions are authorized, idempotent, auditable, and reflected in operator dashboards.

## Phase 5 — Commercial engine

Build:

- plans and provider-marketplace agreements;
- Stripe subscription adapter;
- invoice/payment records;
- commission event ledger;
- manual verification and dispute workflow;
- finance dashboard.

Gate: subscription and success-fee records can be reconciled from the internal ledger even if Stripe is unavailable.

## Phase 6 — Intelligence and automation

Build:

- AI gateway and evaluation fixtures;
- attribute extraction and lead summaries;
- spam/duplicate assistance;
- provider-performance score;
- n8n/outbox integrations;
- WhatsApp adapter;
- scheduled reminders and review requests.

Gate: AI failure falls back safely; all side effects are retryable and observable.

## Phase 7 — Category launch system

Build:

- `marketplace:create` generator;
- config validation command;
- category templates;
- default content/page seeds;
- domain onboarding checklist;
- analytics and sitemap setup;
- second marketplace test fixture.

Gate: a pergola marketplace can be generated and rendered by changing configuration/content/provider data, with shared tests passing.

## Phase 8 — Production readiness

Build/verify:

- backup and restore rehearsal;
- privacy/retention workflow;
- rate limits and abuse controls;
- accessibility and mobile QA;
- performance budgets;
- SEO indexing controls;
- runbooks;
- public-domain smoke tests;
- provider pilot onboarding.

Gate: launch checklist passes with evidence; no “deployed” claim without live verification.

## Task slicing for AI execution

Use vertical tasks no larger than one coherent user journey or one cross-cutting boundary. Each task must include:

```text
Task ID
Goal
Source docs
Files/modules in scope
Prerequisites
Acceptance criteria
Tests
Out of scope
Rollback or recovery
```

## Recommended first 10 tasks

1. Initialize monorepo and quality gates.
2. Add marketplace config schema and validation.
3. Add marketplace/domain database migrations.
4. Render two marketplace previews.
5. Add auth and role model.
6. Add project intake transaction.
7. Add questionnaire runtime from `suanas-mx` config.
8. Add ops lead inbox.
9. Add provider eligibility and score engine.
10. Add assignment review and notification outbox.
