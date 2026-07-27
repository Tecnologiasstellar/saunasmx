# API and State Contracts

## Contract rules

- Every endpoint has an input schema, output schema, auth requirement, idempotency behavior, and error model.
- Prefer typed domain commands over arbitrary table updates.
- Return a correlation ID for support/debugging.
- Do not return consumer PII to providers until assignment and consent rules permit it.

## Core commands

```text
POST /api/marketplaces/{slug}/projects
POST /api/projects/{projectId}/questionnaire
POST /api/projects/{projectId}/complete
POST /api/leads/{leadId}/qualify
POST /api/leads/{leadId}/match
POST /api/assignments/{assignmentId}/accept
POST /api/assignments/{assignmentId}/reject
POST /api/assignments/{assignmentId}/status
POST /api/quotes
POST /api/projects/{projectId}/outcome
POST /api/reviews
```

## Consumer project creation

Input must contain:

```json
{
  "marketplaceSlug": "suanas-mx",
  "contact": {"name": "", "email": "", "phone": ""},
  "location": {"postalCode": "", "city": "", "state": ""},
  "answers": {},
  "consent": {
    "leadContact": true,
    "providerSharing": true,
    "policyVersion": "privacy-2026-01"
  },
  "attribution": {"source": "", "medium": "", "campaign": "", "landingPath": ""},
  "idempotencyKey": "client-generated-uuid"
}
```

The transaction creates/links consumer, project, location, questionnaire response, consent, attribution, lead, status history, and `project.created` outbox event. It must not notify providers synchronously.

## Assignment acceptance

An assigned provider may accept only if:

- assignment is active and unexpired;
- provider relationship is approved and commercially eligible;
- current user belongs to the provider company;
- assignment has not already been accepted/rejected;
- required consent exists;
- request passes idempotency check.

## Error model

```json
{
  "error": {
    "code": "ASSIGNMENT_ALREADY_RESOLVED",
    "message": "The assignment is no longer actionable.",
    "requestId": "req_123",
    "details": {}
  }
}
```

Use stable machine codes, safe human messages, and no secrets or raw PII in errors.

## State transitions

### Project

```text
draft → submitted → qualified → matched → in_progress → won
                                                     ↘ lost
submitted → spam
submitted → withdrawn
```

### Lead

```text
created → review_required → ready_for_matching → assigned → contacted
                                                       ↘ rejected
assigned → quoted → won | lost | expired
```

Transitions require a command, actor, timestamp, reason when applicable, and history record.

## OpenAPI starter

The implementation should materialize these commands into OpenAPI/typed contracts before external consumers are integrated. The source of truth is the command behavior and acceptance criteria, not generated prose.
