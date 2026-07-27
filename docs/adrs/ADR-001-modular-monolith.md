# ADR-001: Use a Configuration-Driven Modular Monolith

Status: accepted

## Decision

Use one primary application and relational database with explicit modules. Resolve each domain to marketplace configuration.

## Why

It minimizes operational overhead, supports SEO/server rendering, and proves reuse before distributed-system complexity is justified.

## Consequences

Module boundaries, tests, and ownership must be enforced in code review. A future service split remains possible because external side effects already cross adapter/event boundaries.
