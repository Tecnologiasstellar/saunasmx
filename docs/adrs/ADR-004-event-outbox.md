# ADR-004: Use an Outbox for External Side Effects

Status: accepted

## Decision

Create durable events in the same transaction as business records. Workers/adapters perform email, WhatsApp, analytics, billing, and automation side effects asynchronously.

## Why

It prevents partial writes, supports retries, and makes failures observable.
