# ADR-010: Embedded PostgreSQL for Development and Tests

Status: accepted

Refines `docs/02-stack.md`. Does not change ADR-002.

## Current decision

`docs/02-stack.md` names Supabase PostgreSQL for every environment.

## Proposed decision

Keep Supabase (or any managed PostgreSQL) for preview, staging and production, selected by `DATABASE_URL`. When `DATABASE_URL` is unset, run PGlite — PostgreSQL compiled to WebAssembly — from `.pgdata/`.

Integration tests get a fresh in-memory PGlite instance per file.

## Reason

ADR-002 requires PostgreSQL as the transactional source of truth; PGlite *is* PostgreSQL, so transactions, enums, unique indexes, `FOR UPDATE SKIP LOCKED` and constraint behaviour are the real thing rather than a mock.

The alternative was a Docker container (ruled out for local development) or a shared cloud database (requires credentials, cannot be reset per test, and costs money before there is revenue). With PGlite a clean checkout runs `npm install && npm run db:reset && npm run db:seed` and has a working system with no accounts and no infrastructure.

## Consequences

- The same committed SQL migrations run on both backends; `src/modules/database/client.ts` picks the driver.
- `scripts/db-reset.ts` refuses to run when `DATABASE_URL` is set, so it can never drop a shared database.
- Extension-dependent features (PostGIS, `pg_cron`) would need verification against managed PostgreSQL before use. None are used today.
- Before the first production deploy, run the migrations against a real Supabase project and re-run the integration suite with `DATABASE_URL` set. That check has not been performed yet.
