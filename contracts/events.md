# Event Contract

Events are durable facts emitted after a successful database transaction. Use an outbox table and idempotency keys.

## Envelope

```json
{
  "eventId": "evt_uuid",
  "eventType": "project.created",
  "eventVersion": 1,
  "occurredAt": "2026-07-26T12:00:00Z",
  "marketplaceId": "marketplace_uuid",
  "entity": {"type": "project", "id": "project_uuid"},
  "correlationId": "req_uuid",
  "idempotencyKey": "project-created-project_uuid-v1",
  "payload": {}
}
```

## Initial event types

```text
project.created
project.submitted
project.qualified
lead.ready_for_matching
lead.assigned
lead.accepted
lead.rejected
consumer.contacted
quote.created
appointment.created
project.won
project.lost
commission.created
invoice.created
payment.received
review.requested
review.submitted
content.published
```

## Processing rules

- Consumers must be idempotent.
- Retry transient failures with exponential backoff.
- Move exhausted events to a visible dead-letter state.
- Record external provider IDs and delivery status.
- Never put full contact details in event logs when a reference ID is sufficient.
