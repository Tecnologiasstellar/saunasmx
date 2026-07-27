# Operating Runbooks

## New marketplace launch

1. Score category opportunity and approve business case.
2. Create config from template.
3. Validate slug/domain uniqueness.
4. Define questionnaire, category fields, matching, pricing, and content eligibility.
5. Add brand tokens and initial content.
6. Onboard at least two serviceable providers.
7. Configure analytics and error monitoring.
8. Test canonical and alias domains.
9. Submit synthetic projects through the full lifecycle.
10. Publish only after the launch checklist passes.

## Provider onboarding

1. Capture identity, services, territories, contact, portfolio, and documents.
2. Verify claims and serviceability.
3. Approve marketplace relationship.
4. Sign/store commercial terms snapshot.
5. Send test assignment and confirm response path.
6. Monitor first opportunities manually.

## Failed outbox event

1. Inspect event type, correlation ID, attempts, and last error.
2. Confirm whether external side effect actually happened.
3. Use adapter/provider ID to deduplicate before retry.
4. Retry transient failures.
5. Resolve or dead-letter permanent failures with an operator note.
6. Add a regression test if the failure exposed a bug.

## Consumer data deletion/anonymization

1. Verify requestor and scope.
2. Identify projects, assignments, communications, and consent records.
3. Preserve financial/audit records required for operations; anonymize personal fields where permitted.
4. Remove or expire provider access to the data.
5. Record completion in audit log.

## Public launch verification

1. Open root and `www` independently if both exist.
2. Confirm HTTPS certificate and canonical redirects.
3. Test direct routes, mobile layout, questionnaire, confirmation, robots, sitemap, and structured data.
4. Submit a synthetic lead and verify the ops inbox and notification event.
5. Record URL, timestamp, environment, and evidence before calling the launch live.
