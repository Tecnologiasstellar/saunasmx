# Technology Stack and Engineering Standards

## Core stack

| Concern | Standard |
|---|---|
| Language | TypeScript, strict mode |
| Web | Next.js App Router |
| Package manager | pnpm |
| Build orchestration | Turborepo |
| UI | Tailwind CSS plus shared accessible components |
| Database | PostgreSQL on Supabase |
| ORM/migrations | Drizzle ORM and committed migrations |
| Auth | Supabase Auth, application roles, RLS |
| CMS | Payload CMS for editorial/SEO content |
| Schemas | Zod at API/config/integration boundaries |
| Email | Resend adapter |
| WhatsApp | Meta Cloud API/BSP adapter |
| Billing | Stripe Billing adapter |
| Automation | n8n consumes outbox events |
| AI | Central gateway, structured outputs, logged versions |
| Analytics | PostHog plus GA4/Search Console/Bing |
| Errors | Sentry |
| Tests | Vitest, Playwright, database integration tests |
| Hosting | Vercel initially |

## Rules

- Use SQL transactions for project creation, assignment, and ledger events.
- All schema changes use migrations and seed data; no manual production edits.
- Use UTC timestamps in storage and display localized timestamps in UI.
- Store money as integer minor units plus ISO currency code; do not use floating point.
- Store phone numbers in normalized international format where possible.
- Validate all external input and webhook signatures.
- Use stable IDs and explicit status-transition functions rather than arbitrary updates.
- Keep category and marketplace configuration versioned with the codebase.
- Keep secrets only in environment variables or a secrets manager.

## Environments

| Environment | Purpose | Data policy |
|---|---|---|
| Local | Development and tests | Synthetic fixtures only |
| Preview | Branch review | Synthetic or scrubbed data only |
| Staging | Full integration rehearsal | No production PII unless explicitly approved and scrubbed |
| Production | Live marketplaces | Protected PII, backups, audit logs |

## Required quality gates

```text
pnpm lint
pnpm typecheck
pnpm test
pnpm test:integration
pnpm test:e2e
pnpm build
```

The exact scripts may evolve, but each must exist before the foundation phase is considered complete.
