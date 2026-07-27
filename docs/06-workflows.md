# Core Workflows

## 1. Consumer project intake

1. Resolve marketplace from host.
2. Render questionnaire from versioned config.
3. Capture answers, attribution, and consent.
4. Validate and normalize contact/location data.
5. Detect likely duplicate or spam submission.
6. Create project, requirements, lead, histories, and outbox event in one transaction.
7. Show consumer confirmation.
8. Send confirmation asynchronously.

Failure rule: a notification failure does not undo the project.

## 2. Qualification

1. Load questionnaire answers and category rules.
2. Normalize structured values.
3. Run deterministic minimum completeness and serviceability checks.
4. Use AI only for unstructured extraction/summarization when needed.
5. Store extracted values, confidence, prompt/model version, and raw source reference.
6. Mark `qualified`, `review_required`, or `incomplete` with reasons.

## 3. Matching and routing

1. Load active provider-marketplace relationships.
2. Filter hard eligibility: service, territory, budget minimum, project type, status, capacity, commercial eligibility.
3. Calculate deterministic score using the active category weighting config.
4. Store score breakdown and reasons.
5. Apply distribution policy: initial default is manual review and max two relevant providers.
6. Create assignments and `lead.assigned` events transactionally.
7. Notify providers asynchronously.

AI may suggest candidate attributes but cannot override a hard disqualification.

## 4. Provider response

1. Provider opens authenticated assignment.
2. Platform verifies company membership and assignment state.
3. Provider accepts, rejects, or requests clarification.
4. Record status history and reason.
5. Notify operator/consumer only according to configured policy.
6. Start response-time metrics.

## 5. Quote and outcome

1. Provider records contact and quote status.
2. Provider submits quote with amount/currency and scope notes.
3. Operator can request evidence or mark verified.
4. Project outcome is recorded as won/lost/unknown.
5. A verified win creates a commission event from the agreement snapshot.
6. Finance reviews and invoices manually in early phases.
7. Review request is scheduled after a configured delay.

## 6. Provider onboarding

1. Capture company, contact, services, territories, credentials, portfolio, and commercial terms.
2. Operator verifies evidence and approves marketplace relationship.
3. Create agreement with terms snapshot.
4. Provider can receive assignments only after approval and commercial eligibility checks pass.

## 7. Content publishing

1. Create brief with target query and intent.
2. Gather source material and local provider evidence.
3. AI may draft; a human/editor must review factual claims.
4. Validate SEO fields, canonical URL, internal links, and structured data.
5. Publish through CMS.
6. Record reviewer and last-reviewed date.

## 8. Outbox processing

1. Lock available event.
2. Check idempotency key.
3. Call adapter.
4. Record provider response and mark complete.
5. Retry transient failures.
6. Move exhausted failures to dead letter and alert ops.
