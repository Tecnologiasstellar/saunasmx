# ADR-009: One Next.js Application with Internal Modules

Status: accepted

Supersedes the workspace layout sketched in `docs/03-repo-structure.md`. Does not change ADR-001.

## Current decision

`docs/03-repo-structure.md` and `docs/02-stack.md` describe a pnpm + Turborepo workspace with four `apps/` and thirteen `packages/`.

## Proposed decision

One Next.js application. The `packages/*` boundaries become `src/modules/*` folders with the same names, and the `apps/*` surfaces become route groups inside `src/app`:

| Specified | Implemented |
|---|---|
| `apps/web` | `src/app/(public routes)` — `/`, `/cotizar`, `/gracias` |
| `apps/ops-portal` | `src/app/ops/**` |
| `apps/provider-portal` | `src/app/portal/**` |
| `apps/worker` | `scripts/outbox-work.ts` and `POST /api/worker/outbox` |
| `packages/<name>` | `src/modules/<name>` |

## Reason

ADR-001 requires "one primary application and relational database with explicit modules". Module folders satisfy that literally. The workspace tooling adds build orchestration, four package manifests and a dependency graph without changing what runs in production, and `pnpm` is not installed on the development machine.

At this size the cost is real and the benefit is speculative: there is one deployable unit, one team, and no independent release cadence to coordinate.

## Impact

- `npm` replaces `pnpm`; there is no `turbo.json`.
- Quality gates keep the names required by `docs/02-stack.md`: `lint`, `typecheck`, `test`, `test:integration`, `test:e2e`, `build`.
- Import boundaries are a review responsibility rather than a package-manager one. `src/app/**` composes; it must not contain business rules.

## Migration and rollback

The mapping above is one-to-one, so extracting `src/modules/<name>` into `packages/<name>` later is a move plus a `package.json` per module. Do it when a second deployable unit actually exists — for example when the worker needs to scale or fail independently of web traffic.
