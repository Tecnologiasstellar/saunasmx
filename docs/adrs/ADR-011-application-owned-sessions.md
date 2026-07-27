# ADR-011: Application-Owned Sessions, RLS Deferred

Status: accepted

Refines `docs/02-stack.md` and the access controls in `docs/10-security-privacy.md`.

## Current decision

`docs/02-stack.md` specifies Supabase Auth plus database Row Level Security.

## Proposed decision

Authentication is a passwordless email link owned by the application: `login_token` and `auth_session` tables, SHA-256 hashes only, single-use tokens with a 20 minute lifetime and 30 day sessions.

Authorization is enforced in the server-side query layer. Every provider-scoped read takes the caller's company ids and filters on them in SQL; every provider command re-checks membership and returns `ASSIGNMENT_NOT_FOUND` for another company's record, so the API cannot be used to probe for existence.

Row Level Security is deferred until a Supabase project is provisioned.

## Reason

There is no Supabase project yet, so Supabase Auth could not be wired or tested. The acceptance criteria in `docs/13-acceptance-criteria.md` — "provider user sees only company-authorized data", "provider changes URL parameters to access another provider's lead" — are about application behaviour, and are covered by integration and E2E tests today.

RLS is defence in depth against a bug in that layer. It is valuable, but it cannot be written against a database that does not exist, and adding it later does not change any calling code.

## Consequences

- Swapping in Supabase Auth means replacing `issueLoginToken` / `consumeLoginToken` and the `/entrar/verificar` route. `resolveSession` and everything above it is unchanged.
- Until RLS exists, a missing filter in a repository function is a real data-exposure risk. New provider-scoped queries must take company ids as a parameter, and must be covered by a cross-company test.
- Login email delivery is synchronous rather than via the outbox: no business record depends on it, and "request another link" is a better retry than a queue.

## Follow-up

When the Supabase project exists: enable RLS on `provider_assignment`, `lead`, `project`, `consumer`, `quote` and `communication`, add policies keyed to provider company membership, and re-run the provider isolation tests with RLS on.
