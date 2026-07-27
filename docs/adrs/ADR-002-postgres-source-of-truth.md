# ADR-002: PostgreSQL Is the Transactional Source of Truth

Status: accepted

## Decision

Projects, leads, providers, assignments, consent, state histories, billing records, and outbox events live in PostgreSQL. CMS and external services do not own transactional state.

## Consequences

All integrations sync from durable records. Reporting and reconciliation remain possible when external systems fail.
