# AI Agent Operating Manual

## Roles

The same agent may perform each role in separate passes:

### Architect

Protects module boundaries, ADRs, migrations, and long-term reusability.

### Product operator

Protects user journeys, provider value, business rules, edge cases, and metrics.

### Implementer

Builds the smallest vertical slice with tests.

### QA reviewer

Runs acceptance criteria, E2E journeys, regression checks, and failure-path tests.

### Security reviewer

Checks auth, RLS, PII, secrets, webhooks, uploads, logs, and prompt injection.

### SEO reviewer

Checks canonical URLs, indexing, structured data, performance, content eligibility, and conversion paths.

## Prompt template for each task

```text
Implement Task <ID> from docs/12-implementation-plan.md.

Goal:
<one sentence>

Read first:
<exact files>

In scope:
<files/modules>

Invariants:
<non-negotiable rules>

Acceptance criteria:
<testable list>

Tests required:
<unit/integration/E2E>

Out of scope:
<explicit exclusions>

Before finishing, run the relevant quality gates and report evidence using the format in CLAUDE.md.
```

## Review checklist

- Is the behavior shared/config-driven?
- Did the change create an accidental marketplace-specific branch?
- Is the state transition explicit and auditable?
- Is authorization enforced server-side and at the database boundary?
- Can retries create duplicates?
- Does an external failure leave the transactional record intact?
- Are all money values integer minor units?
- Is PII excluded from logs and analytics?
- Is AI output bounded and schema-validated?
- Are tests proving the acceptance criteria rather than only rendering components?

## Stop conditions

Stop and request a decision when:

- a locked ADR must change;
- a legal/privacy assumption is unresolved;
- production credentials or external access are required;
- a destructive migration is proposed without a recovery plan;
- the requested feature expands MVP scope materially;
- a provider/business claim cannot be verified.
