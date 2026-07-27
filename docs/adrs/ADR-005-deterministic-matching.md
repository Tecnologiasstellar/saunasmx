# ADR-005: Deterministic Eligibility Before AI

Status: accepted

## Decision

Hard eligibility filters run first. Configured deterministic scoring ranks eligible providers. AI may extract attributes or suggest candidates, but cannot bypass eligibility or silently assign leads.

## Why

Commercial routing must be explainable, testable, and defensible to consumers and providers.
