# Security, Privacy, and Trust

## Data collected

Potentially sensitive business data includes name, phone, email, location, budget, property details, project photos, communication history, and commercial outcome.

## Required controls

- explicit consent with policy version, purpose, timestamp, and source;
- data-sharing log for each provider assignment;
- provider isolation through server authorization and database RLS;
- least-privilege operator roles;
- no consumer PII in content-editor views;
- signed webhook verification and replay protection;
- rate limits and abuse detection on forms and authentication;
- secret management through environment/secrets tooling;
- redacted structured logs;
- encrypted storage and transport;
- retention, deletion, and anonymization workflow;
- access and audit logs for PII and financial records;
- backups and restore rehearsal;
- dependency and vulnerability checks.

## Threat cases to test

1. Provider changes URL/API parameters to access another provider’s lead.
2. Consumer resubmits the form repeatedly.
3. Webhook is delivered twice or replayed.
4. AI prompt injection attempts to reveal system instructions or alter assignment.
5. Provider uploads malicious media or HTML.
6. Operator exports more PII than needed.
7. Staging exposes production data.
8. Logs or analytics include phone/email/budget unintentionally.

## Trust rules

- Clearly disclose that provider information is shared to respond to the project.
- Disclose sponsored/featured placements.
- Do not claim a provider is “trusted,” “verified,” or “best” without a documented basis.
- Preserve match explanations for operator and consumer-support review.
- Offer a clear contact/withdrawal path.
