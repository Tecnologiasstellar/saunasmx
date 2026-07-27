# Initial AI Task Index

Use these IDs to create small implementation tasks from the foundation.

| ID | Task | Phase | Primary acceptance |
|---|---|---:|---|
| FND-001 | Initialize pnpm/Turborepo monorepo | 0 | Quality gates run from clean checkout |
| FND-002 | Add config schema and validator | 0 | Invalid config fails with actionable errors |
| FND-003 | Add marketplace/domain migrations | 0 | Clean DB migration and seed pass |
| FND-004 | Resolve host to marketplace context | 1 | Two configured hosts render correctly |
| FND-005 | Add shared theme/token system | 1 | Brand override changes render without shared-code fork |
| FND-006 | Add auth, roles, and RLS baseline | 1 | Provider isolation tests pass |
| DEM-001 | Build public marketplace page templates | 2 | Configured pages render server-side |
| DEM-002 | Build questionnaire runtime | 2 | Questionnaire is driven by JSON config |
| DEM-003 | Create project intake transaction | 2 | Project, lead, consent, attribution, outbox created |
| DEM-004 | Add duplicate/spam protections | 2 | Repeat and abuse fixtures are handled safely |
| DEM-005 | Build operator lead inbox | 2 | Operator can review status and requirements |
| SUP-001 | Build provider onboarding | 3 | Provider can be approved per marketplace |
| SUP-002 | Build territory/service eligibility | 3 | Hard disqualifiers are enforced |
| SUP-003 | Build scoring and explanations | 3 | Score is deterministic and persisted |
| SUP-004 | Build manual assignment flow | 3 | Max-two curated routing is enforced |
| PRO-001 | Build provider assignment inbox | 4 | Company-scoped assignments visible |
| PRO-002 | Add accept/reject/status commands | 4 | Idempotent transitions and history pass |
| PRO-003 | Add quote/outcome flow | 4 | Amounts, currency, and outcomes persist |
| PRO-004 | Add provider self-service coverage | 4 | Owner-only service/territory edits, validated against config and audited |
| COM-001 | Add plans and agreements | 5 | Terms snapshot is stored |
| COM-002 | Add Stripe subscription adapter | 5 | Webhook replay is harmless |
| COM-003 | Add commission ledger | 5 | Events, reversals, and adjustments reconcile |
| AI-001 | Add central AI gateway | 6 | Versioned structured output is logged |
| AI-002 | Add attribute extraction and summaries | 6 | Failure falls back to manual review |
| OPS-001 | Add outbox worker and adapters | 6 | Retry/dead-letter behavior is observable |
| LAUNCH-001 | Build marketplace generator | 7 | Second category generated from template |
| LAUNCH-002 | Build SEO/domain launch checks | 7–8 | Sitemap/canonical/robots checks pass |
| PROD-001 | Run privacy/security/performance review | 8 | Production gate checklist passes |
