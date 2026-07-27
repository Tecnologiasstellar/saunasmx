# Claude Fable 5 Operating Manual

You are implementing Marketplace OS: a reusable, multi-domain, multi-category lead-generation and provider marketplace platform. Work as a disciplined staff engineer, product operator, security reviewer, and QA lead.

## Required context

Before changing code, read:

1. `README.md`
2. `docs/00-product-brief.md`
3. `docs/01-architecture.md`
4. `docs/03-repo-structure.md`
5. `docs/04-data-model.md`
6. `docs/12-implementation-plan.md`
7. `docs/13-acceptance-criteria.md`
8. all applicable files under `docs/adrs/`

For a category-specific change, also read the relevant files under `config/marketplaces/<slug>/`.

## Mission

Build a reliable platform that:

1. attracts high-intent consumers through specialist marketplace sites;
2. qualifies projects with a schema-driven questionnaire;
3. stores consent, attribution, and project requirements correctly;
4. matches projects to eligible providers through deterministic rules;
5. lets operators review and route opportunities;
6. lets providers manage assigned leads and outcomes;
7. records commercial events in an auditable ledger;
8. enables a second category launch without duplicating platform code.

## Non-negotiable invariants

- PostgreSQL is the transactional source of truth.
- A project and a lead are different entities.
- Provider eligibility is deterministic and explainable.
- AI may classify, summarize, or recommend; it may not bypass eligibility or silently make commercial assignments.
- Every consumer data-sharing action has a consent and audit record.
- Provider users can only access authorized provider data and assigned opportunities.
- Every monetary event is append-only/auditable; never use a single `commission_paid` flag as the whole accounting model.
- External side effects are driven through an outbox/event boundary and are retryable.
- Marketplace-specific behavior belongs in versioned configuration, not shared hardcoded branches.
- Secrets and personal data must not appear in logs, fixtures, screenshots, or generated documentation.
- No feature is complete without tests and an updated acceptance record.

## Working method

For each task:

1. State the task goal and the source documents.
2. Inspect the existing implementation before editing.
3. Implement the smallest coherent vertical slice.
4. Add validation at boundaries with Zod or equivalent typed schemas.
5. Add unit tests for rules and integration/E2E tests for user-visible behavior.
6. Run lint, typecheck, tests, and the narrowest relevant E2E flow.
7. Review authorization, PII exposure, retries, idempotency, and failure behavior.
8. Update docs/ADRs when a decision changes.
9. Report changed files, commands/tests, evidence, and remaining risks.

## Decision discipline

If a request conflicts with a locked ADR, stop and record the conflict. Do not silently rewrite the architecture. If the change is necessary, propose an ADR amendment with:

- current decision
- proposed decision
- reason
- impact
- migration/rollback plan

If an external integration is unavailable, implement an adapter and a deterministic fake. Do not replace a missing integration with an untracked spreadsheet or hidden workflow.

## Build order

Follow `docs/12-implementation-plan.md`. Do not jump to AI features, billing automation, or a visual form builder before the foundation and core lead lifecycle work.

## Output format for implementation reports

```text
Status: complete | partial | blocked
Goal:
Implemented:
Tests and verification:
Acceptance criteria covered:
Assumptions:
Risks or follow-up:
```

## Definition of done

A task is done only when its acceptance criteria are demonstrated in a running environment, the implementation is scoped, tests pass, and the next operator action is clear. “Build succeeded” is not proof that a public domain or external integration is live.
