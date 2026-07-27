# Marketplace OS Foundation

Reusable, configuration-driven marketplace and lead-generation platform for high-ticket home and wellness categories in Mexico.

This folder is the execution foundation for Claude Fable 5. It converts the Sauna Lead Gen Strategy into an implementation-ready product, architecture, operating model, configuration contract, and staged build plan.

## Strategic outcome

Build one modular monolith that can launch multiple category-specialist marketplaces:

- `suanas.mx` as the first wedge
- pergolas, cold plunges, hot tubs, pools, solar, kitchens, and other categories later

Each public marketplace has its own domain, brand, content, questionnaire, and matching rules. The underlying platform shares identity, providers, leads, projects, routing, billing, analytics, workflows, and operations.

## Read first

1. `CLAUDE.md` — operating instructions for the implementation agent.
2. `docs/00-product-brief.md` — product boundary and success metrics.
3. `docs/01-architecture.md` — system shape and non-negotiable principles.
4. `docs/12-implementation-plan.md` — ordered build phases.
5. `docs/13-acceptance-criteria.md` — definition of done and end-to-end gates.
6. `config/marketplaces/suanas-mx/` — first marketplace configuration.

## Core rule

The first implementation must prove reusability. A second marketplace should be launchable primarily through configuration, content, provider setup, and domain onboarding—not by copying the codebase or adding category-specific business logic to shared modules.

## Recommended stack

| Layer | Choice |
|---|---|
| Application | Next.js App Router + TypeScript |
| Architecture | Modular monolith, monorepo-ready |
| Hosting | Vercel |
| Database | Supabase PostgreSQL |
| Auth | Supabase Auth + database Row Level Security |
| ORM | Drizzle ORM |
| CMS | Payload CMS |
| UI | Tailwind CSS + internal component system |
| Validation | Zod |
| Automation | n8n via an outbox/event interface |
| Email | Resend |
| WhatsApp | Meta Cloud API or replaceable BSP adapter |
| Payments | Stripe Billing |
| Analytics | PostHog, GA4, Search Console, Bing Webmaster Tools |
| Monitoring | Sentry + structured application logs |
| Testing | Vitest + Playwright |
| AI | Central gateway with versioned prompts and structured outputs |

## Scope of this foundation

Included:

- product and business specifications
- architecture and module boundaries
- data model and access-control expectations
- API and event contracts
- configuration examples
- lead, provider, billing, content, and AI workflows
- implementation phases
- acceptance criteria
- agent operating rules
- ADRs and runbooks

Not included:

- production credentials
- actual provider contracts
- live domain/DNS changes
- production application code
- legal advice
- claims that a tool or integration is already configured

## Execution convention

Claude Fable 5 should work in small, reviewable slices. Every implementation task must identify:

- the source specification
- files/modules in scope
- invariants that must remain true
- tests to add or update
- acceptance criteria verified
- unresolved assumptions

Never mark a phase complete because code was written. Mark it complete only when the relevant acceptance criteria pass in a running environment.

## Running it

No database server, container or cloud account is needed: with `DATABASE_URL`
unset the app runs PostgreSQL embedded in-process (ADR-010).

```bash
npm install && cp .env.example .env.local && npm run db:reset && npm run db:seed && npm run dev
```

Then open `http://localhost:3000` (Suanas) and `http://pergolas.localhost:3000`
(Pérgolas) — two marketplaces, one codebase, distinguished only by
`config/marketplaces/*`.

Seeded accounts, all synthetic: `operator@example.com` for `/ops` and
`/ops/planes`, `owner.nordic@example.com` for `/portal` and `/portal/cobertura`. Sign-in is a magic link; outside
production the link is shown on the page, so no mailbox is required.

Background work (provider notifications, assignment expiry):

```bash
npm run outbox:work
```

### Quality gates

```bash
npm run lint && npm run typecheck && npm test && npm run test:integration && npm run test:e2e && npm run build
```

### Adding a marketplace

```bash
npm run marketplace:create -- --slug=albercas-mx --name="Albercas México" --domain=albercas.mx --category=pool
```

It refuses duplicate slugs and hostnames, and prints a launch checklist. Then
edit the generated questionnaire and matching rules and run
`npm run config:validate`.

## Implementation status

Phases 0–4 of `docs/12-implementation-plan.md` are built and tested, plus the
second-marketplace proof from phase 7: config-driven foundation, questionnaire
runtime, project intake, operator review, deterministic matching and
assignment, and the provider pipeline through quote and outcome.

Deferred with reasons recorded in `docs/13-acceptance-criteria.md`: the
commercial engine (phase 5), the AI gateway (phase 6), WhatsApp, Payload CMS,
and production readiness (phase 8).

Deployment: GitHub → Vercel, against Neon PostgreSQL. The database is migrated
and bootstrapped; `saunas.mx` is not verified live until the checks in
`docs/17-launch-saunas-mx.md` pass.

Deviations from the specification are recorded as ADR-009, ADR-010 and ADR-011.

## Terminology

- **Marketplace**: an independent consumer-facing category brand/domain.
- **Project**: the consumer’s underlying need.
- **Lead**: a commercial opportunity distributed to one or more providers for a project.
- **Provider company**: a supplier/installer business that can participate in multiple marketplaces.
- **Operator**: internal user who approves providers, reviews leads, and manages commercial operations.
- **Configuration**: versioned category, brand, questionnaire, routing, and SEO inputs that change behavior without changing shared code.
