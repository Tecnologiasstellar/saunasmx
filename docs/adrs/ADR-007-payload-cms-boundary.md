# ADR-007: CMS Owns Editorial Content, Not Transactions

Status: accepted

## Decision

Payload CMS owns editorial and SEO content, media, drafts, and publishing. PostgreSQL application tables own leads, projects, providers, assignments, billing, and audit state.

## Why

Editorial workflows need structured publishing; commercial workflows need transactional integrity and authorization.
