# Architecture

## Architectural decision

Build a configuration-driven modular monolith with one shared application and PostgreSQL database. Resolve the incoming host to a marketplace configuration, then render the correct brand, content, questionnaire, routing policy, and SEO metadata.

```text
Incoming domain
   ↓
Domain resolver
   ↓
Marketplace configuration
   ↓
Public site / provider portal / ops portal
   ↓
Shared modules and database
   ↓
Outbox events and external adapters
```

## Logical modules

1. Marketplace registry and domain resolution
2. Brand/theme and content delivery
3. Identity, authentication, roles, and authorization
4. Consumer, project, requirements, attribution, and consent
5. Questionnaire/form engine
6. Provider onboarding, service catalog, territory, and portfolio
7. Eligibility, scoring, assignment, and distribution
8. Lead lifecycle and provider pipeline
9. Communication adapters
10. Billing, commercial agreements, and ledger
11. Content/SEO publishing and indexing
12. AI gateway
13. Analytics, audit, jobs, and observability

## Deployment topology

Start with one Next.js deployment and one Supabase project per environment:

- local
- preview/staging
- production

Use separate credentials and storage buckets per environment. The worker can initially run as a scheduled/HTTP-triggered process in the same repository. Split it only when execution volume or isolation requires it.

## Request-time tenant resolution

```ts
type MarketplaceContext = {
  marketplaceId: string;
  canonicalDomain: string;
  locale: string;
  currency: string;
  themeKey: string;
  categoryKey: string;
};
```

The resolver must:

- normalize host and protocol;
- reject unknown domains or show a safe default;
- redirect aliases to the canonical domain;
- never trust a client-provided marketplace ID for authorization;
- cache published configuration with explicit invalidation.

## Boundaries

Shared business rules live in packages/modules and receive marketplace configuration as input. Public pages, provider UI, and ops UI may differ visually, but must call the same domain services for project, lead, routing, and billing state transitions.

External services are adapters:

```text
EmailProvider
WhatsAppProvider
PaymentProvider
AnalyticsProvider
AIProvider
```

Every adapter must have a fake implementation for tests and a recorded result/error in the platform.

## Data flow rule

Synchronous request path: validate input, commit transaction, create outbox event, return safe result.

Asynchronous path: consume outbox event, perform external side effect, record idempotency key and result, retry with backoff, surface dead letters to ops.

## Scalability posture

Optimize first for correctness, launch speed, and clean boundaries. Add queues, read replicas, search infrastructure, or separate services only when measured constraints require them.

## Failure posture

- Provider notification failure must not roll back an already-created project.
- Duplicate webhook delivery must be harmless.
- Duplicate questionnaire submission must be detectable and idempotent.
- A failed AI classification must fall back to manual review or deterministic rules.
- A payment provider outage must not erase commercial records.
