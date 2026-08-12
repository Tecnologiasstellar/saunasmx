# Product Brief

## Goal

Create a reusable Marketplace OS that turns high-intent traffic into qualified, consented project opportunities and monetizes provider participation through subscriptions, qualified lead fees, and verified success fees.

## First marketplace

`saunas.mx` is the first implementation. The domain stays configurable and canonical, with alias redirects, so a future domain change does not require a rebuild.

## Customer promise

For consumers: understand the category, describe the project, and receive relevant provider options for free.

For providers: receive relevant, serviceable project opportunities and manage the resulting sales pipeline with less wasted time.

For the operator: launch and operate multiple category marketplaces from one system with measurable unit economics.

## Actors

| Actor | Primary needs |
|---|---|
| Consumer | Education, project qualification, trustworthy provider comparison, follow-up |
| Provider owner | Profile, territories, services, leads, quotes, billing, performance |
| Provider team member | Assigned leads and status updates within company permissions |
| Marketplace operator | Provider approval, lead review/routing, content, disputes, analytics |
| Content editor | Publish reviewed content without consumer PII access |
| Finance operator | Plans, invoices, commission events, reconciliation |
| System/worker | Notifications, retries, analytics events, scheduled reminders |

## Core consumer journey

```text
Landing page → education → project questionnaire → consent → project created
→ qualification → operator review (if required) → provider matching
→ provider notification → quote/contact lifecycle → outcome → review request
```

## Business model

Support these models at the platform level, even if the first marketplace enables only a subset:

- monthly provider subscription;
- qualified lead fee;
- accepted lead fee;
- appointment/site-visit fee;
- fixed success fee;
- percentage success commission;
- disclosed featured placement;
- future consumer-side services.

Initial operating recommendation: manual review and no more than two relevant provider assignments per project. Begin with simple provider pricing and verify lead quality before automating commission collection.

## Success metrics

### Demand

- visitor-to-questionnaire-start rate;
- questionnaire completion rate;
- qualified project rate;
- consented project rate;
- cost per qualified project by channel;
- organic landing pages with meaningful engagement.

### Supply

- active approved providers;
- provider response rate;
- time to first acknowledgment;
- contact rate;
- quote rate;
- consumer complaint rate;
- provider retention.

### Economics

- revenue per qualified project;
- lead-to-quote rate;
- quote-to-win rate;
- average project value;
- gross revenue and contribution margin per marketplace;
- subscription collection rate;
- verified success-fee recovery rate.

### Reusability

- time to configure a new marketplace;
- percentage of marketplace behavior controlled by configuration;
- number of category-specific shared-code branches;
- defects found when a second marketplace is enabled.

## Assumptions to validate

- Mexican high-ticket home/wellness categories have fragmented providers and enough commercial intent.
- Providers will pay for quality and follow-up, not merely directory exposure.
- WhatsApp is a high-value communication channel for consumers and providers.
- Two-provider comparison is enough to create consumer value without commoditizing or spamming the lead.
- A small operator can manually review early leads while demand is being validated.

## Explicit non-goals for MVP

- native mobile apps;
- consumer accounts;
- live provider bidding or auctioning;
- financing, escrow, or consumer payments;
- automated revenue-share debits;
- microservices;
- visual questionnaire/page builders;
- uncontrolled AI assignment decisions.
