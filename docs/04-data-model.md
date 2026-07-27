# Data Model

## Modeling principles

- A provider identity is shared across marketplaces.
- A project is the consumer’s underlying need; a lead is a distribution opportunity.
- Requirements are structured where possible and preserve the original answer payload.
- Commercial state is ledger-like and auditable.
- State transitions are explicit and append history records.
- PII access is role- and assignment-scoped.

## Core entities

### Tenancy and marketplace

```text
organization(id, name, status, created_at)
marketplace(id, organization_id, slug, name, category_key, locale, currency, status, canonical_domain, theme_key)
domain(id, marketplace_id, hostname, kind, is_canonical, redirect_target, verified_at)
marketplace_config_version(id, marketplace_id, version, config_json, status, published_at)
```

### Identity and access

```text
user(id, auth_subject, email, status, created_at)
user_role(id, user_id, role, organization_id, provider_company_id)
provider_team_membership(id, provider_company_id, user_id, role)
```

Roles: `consumer` (future account), `provider_owner`, `provider_member`, `operator`, `content_editor`, `finance_operator`, `admin`.

### Provider

```text
provider_company(id, legal_name, display_name, status, contact_phone, contact_email)
provider_marketplace(id, provider_company_id, marketplace_id, status, approved_at, commercial_plan_id)
provider_service(id, provider_company_id, marketplace_id, service_key, min_project_value_minor, currency)
provider_territory(id, provider_company_id, marketplace_id, region_code, postal_prefix, radius_km)
provider_profile(id, provider_company_id, marketplace_id, description, specialties_json, verification_status)
provider_portfolio_item(id, provider_company_id, marketplace_id, title, media_id, location_label, published)
provider_review(id, provider_company_id, project_id, rating, body, status, verified_at)
provider_performance_snapshot(id, provider_company_id, marketplace_id, period_start, period_end, metrics_json, score)
```

### Consumer/project/lead

```text
consumer(id, name, email, phone, locale, created_at)
project(id, marketplace_id, consumer_id, status, source_channel, source_campaign, created_at)
project_location(id, project_id, country_code, state_code, city, postal_code, property_type)
project_requirement(id, project_id, requirement_key, value_json, source, confidence)
questionnaire_response(id, project_id, questionnaire_version, answers_json, completed_at)
consent_record(id, project_id, purpose, policy_version, granted, captured_at, capture_source)
attribution_touch(id, project_id, touch_type, channel, campaign, referrer, occurred_at)
lead(id, project_id, lifecycle_status, qualification_status, qualified_at)
lead_answer(id, lead_id, answer_key, value_json)
project_status_history(id, project_id, from_status, to_status, reason, actor_type, actor_id, created_at)
lead_status_history(id, lead_id, from_status, to_status, reason, actor_type, actor_id, created_at)
```

### Matching/distribution

```text
provider_assignment(id, lead_id, provider_company_id, score, rank, status, assigned_at, expires_at)
match_explanation(id, assignment_id, eligibility_json, score_breakdown_json, reasons_json, rule_version)
routing_policy(id, marketplace_id, version, policy_json, active_from, active_to)
lead_rejection(id, assignment_id, reason_code, notes, created_at)
```

### Sales lifecycle

```text
communication(id, project_id, lead_id, provider_company_id, channel, direction, template_key, status, provider_message_id)
appointment(id, lead_id, provider_company_id, status, scheduled_at)
quote(id, lead_id, provider_company_id, amount_minor, currency, status, submitted_at)
project_outcome(id, project_id, outcome, value_minor, currency, verified_by, verified_at)
```

### Commercial ledger

```text
commercial_plan(id, marketplace_id, name, terms_json, active)
provider_agreement(id, provider_company_id, marketplace_id, plan_id, starts_at, ends_at, terms_snapshot_json)
subscription(id, provider_agreement_id, external_customer_id, external_subscription_id, status)
invoice(id, provider_agreement_id, invoice_type, amount_minor, currency, status, external_invoice_id)
commission_agreement(id, provider_agreement_id, rate_bps, fixed_fee_minor, trigger, terms_snapshot_json)
commission_event(id, project_id, provider_agreement_id, trigger, base_value_minor, commission_value_minor, currency, status)
payment(id, invoice_id, amount_minor, currency, status, external_payment_id, received_at)
adjustment(id, invoice_id, reason, amount_minor, currency, created_by)
dispute(id, commercial_entity_type, commercial_entity_id, status, reason, resolution)
```

### Content/SEO

```text
content_page(id, marketplace_id, page_type, slug, title, status, canonical_url, last_reviewed_at)
content_block(id, page_id, block_type, content_json, sort_order)
content_source(id, page_id, source_type, citation, reviewed_by, reviewed_at)
content_brief(id, marketplace_id, target_query, intent, outline_json, status)
redirect(id, marketplace_id, from_path, to_path, status_code)
seo_observation(id, page_id, observed_at, index_status, performance_json)
```

### Platform reliability

```text
outbox_event(id, event_type, entity_type, entity_id, idempotency_key, payload_json, status, attempts, next_attempt_at, last_error)
audit_log(id, actor_type, actor_id, action, entity_type, entity_id, metadata_json, created_at)
webhook_delivery(id, provider, external_event_id, event_type, payload_hash, status, received_at, processed_at)
ai_run(id, task_key, prompt_version, model, input_hash, output_json, confidence, status, cost_minor, created_at)
```

## Important indexes

- `domain(hostname)` unique;
- `marketplace(slug)` unique;
- `project(marketplace_id, created_at)`;
- `lead(lifecycle_status, created_at)`;
- `provider_assignment(provider_company_id, status)`;
- `provider_territory(marketplace_id, region_code, postal_prefix)`;
- `outbox_event(status, next_attempt_at)`;
- `webhook_delivery(provider, external_event_id)` unique;
- full-text/search indexes added only after measured need.

## Deletion/retention

Use soft deletion for providers, content, agreements, and assignments. For consumer data, implement a documented retention and anonymization workflow. Do not cascade-delete financial or audit records.
