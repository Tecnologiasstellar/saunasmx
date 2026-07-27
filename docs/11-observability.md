# Analytics and Observability

## Product events

Use typed event names and stable properties. Initial events:

```text
marketplace_viewed
content_viewed
questionnaire_started
questionnaire_step_viewed
questionnaire_step_completed
questionnaire_abandoned
project_submitted
project_qualified
provider_assignment_created
provider_assignment_viewed
provider_assignment_accepted
provider_assignment_rejected
provider_contacted
quote_submitted
project_won
project_lost
review_submitted
```

Never send raw phone, email, full address, or unredacted free text to analytics.

## Operational dashboards

- lead inbox by marketplace/status;
- assignments awaiting provider response;
- provider response SLA;
- dead-letter outbox events;
- failed notifications;
- AI runs with low confidence or invalid output;
- duplicate/spam rate;
- invoices/commission events needing review;
- SEO pages failing eligibility or indexing checks.

## Alerts

Alert on:

- error-rate spike;
- outbox backlog or repeated failure;
- webhook signature failures;
- provider response SLA breach;
- sudden questionnaire completion drop;
- payment failure concentration;
- unexpected domain/config mismatch.

## Correlation

Carry `requestId`, `correlationId`, marketplace ID, and entity ID through application logs and events. Keep logs structured and redact PII.
