# Billing and Marketplace Economics

## Principle

Commercial rules attach to the provider–marketplace relationship. The same provider may have different terms in different categories.

## Supported pricing primitives

```text
monthly_subscription
qualified_lead_fee
accepted_lead_fee
appointment_fee
fixed_success_fee
percentage_success_commission
featured_placement
```

## Initial monetization sequence

1. Recruit providers and measure lead quality.
2. Start with a simple monthly participation or pilot fee only when value is demonstrated.
3. Add qualified/accepted lead pricing with written qualification criteria.
4. Add verified success fees for providers with reliable reporting.
5. Automate only after disputes, refunds, and close attribution are understood.

## Unit economics model

Track per marketplace, channel, provider, and month:

```text
qualified_projects
provider_assignments
accepted_assignments
quotes
wins
gross_project_value
subscription_revenue
lead_fee_revenue
success_fee_revenue
refunds_and_adjustments
acquisition_cost
messaging_cost
operator_time_cost
contribution_margin
```

## Commission rules

- Store rate in basis points or fixed minor units.
- Snapshot agreement terms when a commission event is created.
- Keep base project value and commission value separate.
- Support partial, canceled, disputed, and adjusted events.
- Require an actor and evidence for manual verification.
- Never delete a commission event; reverse/adjust it.

## Provider trust

Provider ranking cannot be purchased by subscription tier alone. Commercial sponsorship may affect disclosed placement, but eligibility, quality, response history, complaints, and consumer fit must remain protected.
