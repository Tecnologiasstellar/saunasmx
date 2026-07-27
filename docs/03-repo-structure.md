# Repository Structure

```text
marketplace-os/
├── apps/
│   ├── web/                    # Public multi-domain marketplace sites
│   ├── provider-portal/        # Provider-facing experience
│   ├── ops-portal/             # Internal operations and finance UI
│   └── worker/                 # Outbox consumers and scheduled jobs
├── packages/
│   ├── database/               # Drizzle schema, migrations, repositories
│   ├── auth/                   # Session, roles, policies
│   ├── ui/                     # Shared accessible components and tokens
│   ├── marketplace-config/     # Config schema, resolver, loader
│   ├── forms-engine/           # Questionnaire schema and runtime
│   ├── matching-engine/        # Eligibility, scoring, distribution
│   ├── billing-engine/         # Agreements, invoices, ledger
│   ├── messaging/              # Email/WhatsApp interfaces and adapters
│   ├── ai/                     # Gateway, prompts, evaluators, schemas
│   ├── seo/                    # Metadata, sitemap, canonical rules
│   ├── analytics/              # Typed event names and tracking adapters
│   ├── validation/             # Shared Zod schemas
│   └── observability/          # Logs, audit, tracing, error helpers
├── marketplaces/
│   ├── suanas-mx/
│   │   ├── marketplace.yaml
│   │   ├── theme.ts
│   │   ├── questionnaire.json
│   │   ├── matching.yaml
│   │   └── seed/
│   └── pergolas-mx/
├── cms/
│   ├── collections/
│   ├── blocks/
│   └── migrations/
├── contracts/
│   ├── api.yaml
│   ├── events.md
│   └── schemas/
├── docs/
│   ├── architecture/
│   ├── data-model/
│   ├── runbooks/
│   └── ai-agent-instructions/
├── tests/
│   ├── fixtures/
│   ├── integration/
│   └── e2e/
├── scripts/
│   ├── marketplace-create.ts
│   ├── config-validate.ts
│   └── seed.ts
├── .github/workflows/
├── package.json
├── pnpm-workspace.yaml
├── turbo.json
└── README.md
```

## Boundary rules

- `apps` compose experiences; they do not duplicate core business rules.
- `packages` expose typed domain services and adapters.
- `marketplaces` contain brand/category configuration and seed content only.
- `contracts` are the interface between modules and external workers.
- `docs` describe decisions and acceptance criteria; implementation changes must update them when behavior changes.

## Marketplace creation contract

`pnpm marketplace:create` should generate a validated directory from a template, including brand tokens, questionnaire starter, matching rules starter, SEO defaults, fixtures, and a launch checklist. It must refuse to generate a duplicate slug/domain and must not modify existing marketplace configuration without explicit confirmation.
