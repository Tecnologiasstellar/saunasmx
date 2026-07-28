import {
  boolean,
  char,
  date,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

/**
 * Transactional schema. Source: docs/04-data-model.md, docs/05-api-contracts.md.
 *
 * Rules enforced here rather than in application code:
 *  - money is always integer minor units plus an ISO 4217 code (docs/02-stack.md);
 *  - timestamps are timestamptz, stored UTC;
 *  - state values are database enums so an invalid transition cannot be written;
 *  - hostname and external event uniqueness are database constraints, because
 *    they are authorization and idempotency boundaries, not conveniences.
 */

const id = () => uuid('id').primaryKey().defaultRandom();
const createdAt = () => timestamp('created_at', { withTimezone: true }).notNull().defaultNow();
const money = (name: string) => integer(name);
const currency = (name = 'currency') => char(name, { length: 3 });

/* -------------------------------------------------------------------------- */
/* Enums                                                                      */
/* -------------------------------------------------------------------------- */

export const organizationStatus = pgEnum('organization_status', ['active', 'suspended']);
export const marketplaceStatus = pgEnum('marketplace_status', ['draft', 'active', 'paused', 'retired']);
export const domainKind = pgEnum('domain_kind', ['canonical', 'alias', 'redirect']);
export const configStatus = pgEnum('config_status', ['draft', 'published', 'superseded']);

export const userStatus = pgEnum('user_status', ['active', 'invited', 'suspended']);
export const appRole = pgEnum('app_role', [
  'consumer',
  'provider_owner',
  'provider_member',
  'operator',
  'content_editor',
  'finance_operator',
  'admin',
]);

export const providerCompanyStatus = pgEnum('provider_company_status', ['pending', 'active', 'suspended', 'archived']);
export const providerMarketplaceStatus = pgEnum('provider_marketplace_status', [
  'pending',
  'approved',
  'paused',
  'rejected',
  'suspended',
]);
export const verificationStatus = pgEnum('verification_status', ['unverified', 'documents_submitted', 'verified']);

/**
 * What kind of thing a directory profile describes. A place is somewhere a
 * consumer goes; a provider is someone who builds for them. The two render
 * through one component set and differ only in data and call to action.
 */
export const directoryKind = pgEnum('directory_kind', ['place', 'provider']);

/**
 * How well public evidence supports a directory record, from the research
 * package that seeds it. Distinct from publication: `core` is high-confidence
 * research, but nothing is public until an operator publishes it, and `verify`
 * is never public at all.
 */
export const evidenceStatus = pgEnum('evidence_status', ['core', 'secondary', 'verify', 'inactive']);

/** docs/05-api-contracts.md → State transitions → Project */
export const projectStatus = pgEnum('project_status', [
  'draft',
  'submitted',
  'qualified',
  'matched',
  'in_progress',
  'won',
  'lost',
  'spam',
  'withdrawn',
]);

/** docs/05-api-contracts.md → State transitions → Lead */
export const leadLifecycleStatus = pgEnum('lead_lifecycle_status', [
  'created',
  'review_required',
  'ready_for_matching',
  'assigned',
  'contacted',
  'quoted',
  'rejected',
  'won',
  'lost',
  'expired',
]);

/** docs/06-workflows.md → Qualification */
export const qualificationStatus = pgEnum('qualification_status', ['pending', 'qualified', 'review_required', 'incomplete', 'spam']);

/** Sellable lead quality, computed at submission by an optional per-marketplace lead-scoring config. */
export const leadGrade = pgEnum('lead_grade', ['A', 'B', 'C']);

/** Human validation of a lead's WhatsApp/contact reachability — a grade A is never sold as "verified" before this. */
export const contactValidationStatus = pgEnum('contact_validation_status', [
  'pending_contact',
  'contact_confirmed',
  'unreachable',
]);

export const assignmentStatus = pgEnum('assignment_status', ['assigned', 'accepted', 'rejected', 'expired', 'withdrawn']);
export const actorType = pgEnum('actor_type', ['consumer', 'provider_user', 'operator', 'system']);

export const communicationChannel = pgEnum('communication_channel', ['email', 'whatsapp', 'phone', 'in_app']);
export const communicationDirection = pgEnum('communication_direction', ['outbound', 'inbound']);
export const communicationStatus = pgEnum('communication_status', ['queued', 'sent', 'delivered', 'failed', 'logged']);

export const appointmentStatus = pgEnum('appointment_status', ['scheduled', 'completed', 'cancelled', 'no_show']);
export const quoteStatus = pgEnum('quote_status', ['draft', 'submitted', 'accepted', 'rejected', 'expired']);
export const outcomeKind = pgEnum('outcome_kind', ['won', 'lost', 'unknown']);

export const invoiceStatus = pgEnum('invoice_status', ['draft', 'open', 'paid', 'void', 'uncollectible']);
export const commissionTrigger = pgEnum('commission_trigger', [
  'qualified_lead',
  'accepted_lead',
  'appointment',
  'verified_win',
]);
export const commissionStatus = pgEnum('commission_status', ['pending_verification', 'verified', 'invoiced', 'reversed', 'disputed']);
export const paymentStatus = pgEnum('payment_status', ['pending', 'succeeded', 'failed', 'refunded']);
export const disputeStatus = pgEnum('dispute_status', ['open', 'under_review', 'resolved', 'rejected']);

export const contentStatus = pgEnum('content_status', ['draft', 'in_review', 'published', 'archived']);
export const outboxStatus = pgEnum('outbox_status', ['pending', 'processing', 'completed', 'failed', 'dead_letter']);
export const webhookStatus = pgEnum('webhook_status', ['received', 'processed', 'ignored', 'failed']);
export const aiRunStatus = pgEnum('ai_run_status', ['succeeded', 'invalid_output', 'failed', 'skipped']);
export const reviewStatus = pgEnum('review_status', ['pending', 'published', 'rejected']);

/* -------------------------------------------------------------------------- */
/* Tenancy and marketplace                                                    */
/* -------------------------------------------------------------------------- */

export const organization = pgTable('organization', {
  id: id(),
  name: text('name').notNull(),
  status: organizationStatus('status').notNull().default('active'),
  createdAt: createdAt(),
});

export const marketplace = pgTable(
  'marketplace',
  {
    id: id(),
    organizationId: uuid('organization_id').notNull().references(() => organization.id),
    slug: text('slug').notNull(),
    name: text('name').notNull(),
    categoryKey: text('category_key').notNull(),
    locale: text('locale').notNull(),
    currency: currency().notNull(),
    countryCode: char('country_code', { length: 2 }).notNull(),
    status: marketplaceStatus('status').notNull().default('draft'),
    canonicalDomain: text('canonical_domain').notNull(),
    themeKey: text('theme_key').notNull(),
    createdAt: createdAt(),
  },
  (table) => [uniqueIndex('marketplace_slug_key').on(table.slug)],
);

export const domain = pgTable(
  'domain',
  {
    id: id(),
    marketplaceId: uuid('marketplace_id').notNull().references(() => marketplace.id),
    hostname: text('hostname').notNull(),
    kind: domainKind('kind').notNull(),
    isCanonical: boolean('is_canonical').notNull().default(false),
    redirectTarget: text('redirect_target'),
    verifiedAt: timestamp('verified_at', { withTimezone: true }),
    createdAt: createdAt(),
  },
  // Ambiguous host resolution would be a tenancy bug, so uniqueness is a constraint.
  (table) => [uniqueIndex('domain_hostname_key').on(table.hostname)],
);

export const marketplaceConfigVersion = pgTable(
  'marketplace_config_version',
  {
    id: id(),
    marketplaceId: uuid('marketplace_id').notNull().references(() => marketplace.id),
    version: text('version').notNull(),
    configJson: jsonb('config_json').notNull(),
    status: configStatus('status').notNull().default('published'),
    publishedAt: timestamp('published_at', { withTimezone: true }),
    createdAt: createdAt(),
  },
  (table) => [uniqueIndex('marketplace_config_version_key').on(table.marketplaceId, table.version)],
);

/* -------------------------------------------------------------------------- */
/* Identity and access                                                        */
/* -------------------------------------------------------------------------- */

export const appUser = pgTable(
  'app_user',
  {
    id: id(),
    authSubject: text('auth_subject'),
    email: text('email').notNull(),
    name: text('name'),
    status: userStatus('status').notNull().default('active'),
    createdAt: createdAt(),
  },
  (table) => [uniqueIndex('app_user_email_key').on(table.email)],
);

export const providerCompany = pgTable('provider_company', {
  id: id(),
  legalName: text('legal_name').notNull(),
  displayName: text('display_name').notNull(),
  status: providerCompanyStatus('status').notNull().default('pending'),
  contactPhone: text('contact_phone'),
  contactEmail: text('contact_email'),
  createdAt: createdAt(),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
});

export const userRole = pgTable(
  'user_role',
  {
    id: id(),
    userId: uuid('user_id').notNull().references(() => appUser.id),
    role: appRole('role').notNull(),
    organizationId: uuid('organization_id').references(() => organization.id),
    providerCompanyId: uuid('provider_company_id').references(() => providerCompany.id),
    createdAt: createdAt(),
  },
  (table) => [index('user_role_user_idx').on(table.userId)],
);

export const providerTeamMembership = pgTable(
  'provider_team_membership',
  {
    id: id(),
    providerCompanyId: uuid('provider_company_id').notNull().references(() => providerCompany.id),
    userId: uuid('user_id').notNull().references(() => appUser.id),
    role: appRole('role').notNull(),
    createdAt: createdAt(),
  },
  (table) => [uniqueIndex('provider_team_membership_key').on(table.providerCompanyId, table.userId)],
);

export const authSession = pgTable(
  'auth_session',
  {
    id: id(),
    userId: uuid('user_id').notNull().references(() => appUser.id),
    // Only the hash is stored; the raw token lives in the user's cookie.
    tokenHash: text('token_hash').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    createdAt: createdAt(),
  },
  (table) => [uniqueIndex('auth_session_token_key').on(table.tokenHash)],
);

export const loginToken = pgTable(
  'login_token',
  {
    id: id(),
    email: text('email').notNull(),
    tokenHash: text('token_hash').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    consumedAt: timestamp('consumed_at', { withTimezone: true }),
    createdAt: createdAt(),
  },
  (table) => [uniqueIndex('login_token_key').on(table.tokenHash)],
);

/* -------------------------------------------------------------------------- */
/* Provider                                                                   */
/* -------------------------------------------------------------------------- */

export const commercialPlan = pgTable('commercial_plan', {
  id: id(),
  marketplaceId: uuid('marketplace_id').notNull().references(() => marketplace.id),
  name: text('name').notNull(),
  termsJson: jsonb('terms_json').notNull(),
  active: boolean('active').notNull().default(true),
  createdAt: createdAt(),
});

export const providerMarketplace = pgTable(
  'provider_marketplace',
  {
    id: id(),
    providerCompanyId: uuid('provider_company_id').notNull().references(() => providerCompany.id),
    marketplaceId: uuid('marketplace_id').notNull().references(() => marketplace.id),
    status: providerMarketplaceStatus('status').notNull().default('pending'),
    approvedAt: timestamp('approved_at', { withTimezone: true }),
    commercialPlanId: uuid('commercial_plan_id').references(() => commercialPlan.id),
    /** Concurrent open assignments the provider is willing to hold. */
    capacityLimit: integer('capacity_limit').notNull().default(10),
    createdAt: createdAt(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (table) => [uniqueIndex('provider_marketplace_key').on(table.providerCompanyId, table.marketplaceId)],
);

export const providerService = pgTable(
  'provider_service',
  {
    id: id(),
    providerCompanyId: uuid('provider_company_id').notNull().references(() => providerCompany.id),
    marketplaceId: uuid('marketplace_id').notNull().references(() => marketplace.id),
    /** Matches a questionnaire answer value, e.g. "traditional" or "aluminum". */
    serviceKey: text('service_key').notNull(),
    minProjectValueMinor: money('min_project_value_minor').notNull().default(0),
    currency: currency().notNull(),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex('provider_service_key').on(table.providerCompanyId, table.marketplaceId, table.serviceKey),
    index('provider_service_lookup_idx').on(table.marketplaceId, table.serviceKey),
  ],
);

export const providerTerritory = pgTable(
  'provider_territory',
  {
    id: id(),
    providerCompanyId: uuid('provider_company_id').notNull().references(() => providerCompany.id),
    marketplaceId: uuid('marketplace_id').notNull().references(() => marketplace.id),
    regionCode: text('region_code'),
    /** Leading digits of a postal code. Empty string would match everything, so it is disallowed. */
    postalPrefix: text('postal_prefix').notNull(),
    radiusKm: integer('radius_km'),
    createdAt: createdAt(),
  },
  (table) => [
    index('provider_territory_lookup_idx').on(table.marketplaceId, table.regionCode, table.postalPrefix),
    uniqueIndex('provider_territory_key').on(table.providerCompanyId, table.marketplaceId, table.postalPrefix),
  ],
);

export const providerProfile = pgTable(
  'provider_profile',
  {
    id: id(),
    providerCompanyId: uuid('provider_company_id').notNull().references(() => providerCompany.id),
    marketplaceId: uuid('marketplace_id').notNull().references(() => marketplace.id),
    description: text('description'),
    specialtiesJson: jsonb('specialties_json'),
    verificationStatus: verificationStatus('verification_status').notNull().default('unverified'),
    createdAt: createdAt(),
  },
  (table) => [uniqueIndex('provider_profile_key').on(table.providerCompanyId, table.marketplaceId)],
);

export const providerPortfolioItem = pgTable('provider_portfolio_item', {
  id: id(),
  providerCompanyId: uuid('provider_company_id').notNull().references(() => providerCompany.id),
  marketplaceId: uuid('marketplace_id').notNull().references(() => marketplace.id),
  title: text('title').notNull(),
  mediaId: text('media_id'),
  locationLabel: text('location_label'),
  published: boolean('published').notNull().default(false),
  createdAt: createdAt(),
});

/* -------------------------------------------------------------------------- */
/* Public directory                                                           */
/* -------------------------------------------------------------------------- */

/**
 * An editorial directory listing: a place a consumer can book, or a provider a
 * consumer can request a quote from.
 *
 * Deliberately not `provider_company`. That table is a transactional
 * counterparty — it has logins, marketplace approval, territories, capacity,
 * assignments and commission events. A researched business has agreed to none
 * of that, and putting one here would make it a candidate for lead
 * distribution. A place is not a provider at all: it never receives a lead, it
 * receives a booking on its own site.
 *
 * `provider_company_id` is the bridge. When a researched supplier onboards for
 * real, its profile points at the live company and can show a verified badge —
 * without the directory ever having faked one.
 *
 * One table with a `kind` discriminator rather than two, because the public
 * page and card are the same component for both. `marketplace_id` is what lets
 * the next category reuse all of it: different rows, identical code.
 */
export const directoryProfile = pgTable(
  'directory_profile',
  {
    id: id(),
    marketplaceId: uuid('marketplace_id').notNull().references(() => marketplace.id),
    kind: directoryKind('kind').notNull(),
    /** Unique per kind: /lugares/[slug] and /proveedores/[slug] are separate namespaces. */
    slug: text('slug').notNull(),
    name: text('name').notNull(),
    aliases: text('aliases'),

    /** Which research file this came from, and its id there. Together they make re-import idempotent. */
    sourceDataset: text('source_dataset').notNull(),
    externalId: text('external_id').notNull(),

    /** Spanish display copy. Written at import from source-backed fields only. */
    blurb: text('blurb'),
    about: text('about'),
    /**
     * The access restriction in plain Spanish — hotel guests only, adult men
     * only, private buyout, membership. It sits next to the call to action
     * rather than inside a tooltip, because it is the thing most likely to
     * waste a visitor's trip.
     */
    accessNote: text('access_note'),

    websiteUrl: text('website_url'),
    /** External booking destination. Places only; a provider quote is an internal route. */
    bookingUrl: text('booking_url'),

    city: text('city'),
    state: text('state'),
    address: text('address'),
    /** Free text for the rare multi-site operator, e.g. Koti's three CDMX studios. */
    additionalLocations: text('additional_locations'),

    /** Kind-specific source values, validated by a Zod schema at the import boundary. */
    detailsJson: jsonb('details_json').notNull().default({}),
    /** Ordered display facts, `[{label, value}]`. Rendered verbatim, so an operator controls them. */
    factsJson: jsonb('facts_json').notNull().default([]),

    publicationStatus: contentStatus('publication_status').notNull().default('draft'),
    evidenceStatus: evidenceStatus('evidence_status').notNull().default('verify'),
    sourceQuality: char('source_quality', { length: 1 }),
    /** Public source URLs. The audit trail behind every published claim. */
    sourceUrlsJson: jsonb('source_urls_json').notNull().default([]),
    /** Internal researcher note. Never rendered publicly. */
    evidenceNote: text('evidence_note'),
    lastVerifiedAt: date('last_verified_at'),

    providerCompanyId: uuid('provider_company_id').references(() => providerCompany.id),

    /**
     * What the last import wrote, field by field. A re-import compares against
     * this: a field still matching is refreshed, a field an operator has since
     * edited is reported as a conflict and left alone.
     */
    importedJson: jsonb('imported_json'),

    createdAt: createdAt(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('directory_profile_slug_key').on(table.marketplaceId, table.kind, table.slug),
    uniqueIndex('directory_profile_source_key').on(table.marketplaceId, table.sourceDataset, table.externalId),
    index('directory_profile_public_idx').on(
      table.marketplaceId,
      table.kind,
      table.publicationStatus,
      table.evidenceStatus,
    ),
    index('directory_profile_state_idx').on(table.marketplaceId, table.kind, table.state),
  ],
);

/* -------------------------------------------------------------------------- */
/* Consumer, project, lead                                                    */
/* -------------------------------------------------------------------------- */

export const consumer = pgTable(
  'consumer',
  {
    id: id(),
    name: text('name').notNull(),
    email: text('email').notNull(),
    /** E.164 where derivable from the submitted value. */
    phone: text('phone'),
    locale: text('locale').notNull(),
    createdAt: createdAt(),
    anonymizedAt: timestamp('anonymized_at', { withTimezone: true }),
  },
  (table) => [index('consumer_email_idx').on(table.email)],
);

export const project = pgTable(
  'project',
  {
    id: id(),
    marketplaceId: uuid('marketplace_id').notNull().references(() => marketplace.id),
    consumerId: uuid('consumer_id').notNull().references(() => consumer.id),
    status: projectStatus('status').notNull().default('draft'),
    sourceChannel: text('source_channel'),
    sourceCampaign: text('source_campaign'),
    /** Client-supplied per-submission key; makes a retried POST harmless. */
    idempotencyKey: text('idempotency_key'),
    createdAt: createdAt(),
  },
  (table) => [
    index('project_marketplace_created_idx').on(table.marketplaceId, table.createdAt),
    uniqueIndex('project_idempotency_key').on(table.marketplaceId, table.idempotencyKey),
  ],
);

export const projectLocation = pgTable('project_location', {
  id: id(),
  projectId: uuid('project_id').notNull().references(() => project.id),
  countryCode: char('country_code', { length: 2 }).notNull(),
  stateCode: text('state_code'),
  city: text('city'),
  postalCode: text('postal_code').notNull(),
  propertyType: text('property_type'),
  /**
   * Optional, consumer-provided. Never used in automatic eligibility/matching
   * and never leaves this table into analytics, logs, outbox payloads or
   * notifications — visible only to an operator, and to an assigned provider
   * after that provider accepts (see provider/queries.ts).
   */
  streetAddress: text('street_address'),
  createdAt: createdAt(),
});

export const projectRequirement = pgTable(
  'project_requirement',
  {
    id: id(),
    projectId: uuid('project_id').notNull().references(() => project.id),
    requirementKey: text('requirement_key').notNull(),
    valueJson: jsonb('value_json').notNull(),
    /** "questionnaire" for consumer answers, "ai" for extracted attributes. */
    source: text('source').notNull().default('questionnaire'),
    confidence: integer('confidence'),
    createdAt: createdAt(),
  },
  (table) => [uniqueIndex('project_requirement_key').on(table.projectId, table.requirementKey, table.source)],
);

export const questionnaireResponse = pgTable('questionnaire_response', {
  id: id(),
  projectId: uuid('project_id').notNull().references(() => project.id),
  questionnaireId: text('questionnaire_id').notNull(),
  questionnaireVersion: integer('questionnaire_version').notNull(),
  /** The original payload is preserved verbatim alongside structured requirements. */
  answersJson: jsonb('answers_json').notNull(),
  completedAt: timestamp('completed_at', { withTimezone: true }),
  createdAt: createdAt(),
});

export const consentRecord = pgTable(
  'consent_record',
  {
    id: id(),
    projectId: uuid('project_id').notNull().references(() => project.id),
    purpose: text('purpose').notNull(),
    policyVersion: text('policy_version').notNull(),
    granted: boolean('granted').notNull(),
    capturedAt: timestamp('captured_at', { withTimezone: true }).notNull().defaultNow(),
    captureSource: text('capture_source').notNull(),
    createdAt: createdAt(),
  },
  (table) => [index('consent_record_project_idx').on(table.projectId, table.purpose)],
);

export const attributionTouch = pgTable('attribution_touch', {
  id: id(),
  projectId: uuid('project_id').notNull().references(() => project.id),
  touchType: text('touch_type').notNull(),
  channel: text('channel'),
  campaign: text('campaign'),
  medium: text('medium'),
  referrer: text('referrer'),
  landingPath: text('landing_path'),
  occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull().defaultNow(),
});

export const lead = pgTable(
  'lead',
  {
    id: id(),
    projectId: uuid('project_id').notNull().references(() => project.id),
    lifecycleStatus: leadLifecycleStatus('lifecycle_status').notNull().default('created'),
    qualificationStatus: qualificationStatus('qualification_status').notNull().default('pending'),
    qualifiedAt: timestamp('qualified_at', { withTimezone: true }),
    /** Null when this marketplace has no lead-scoring config (see marketplace-config). */
    leadScore: integer('lead_score'),
    leadGrade: leadGrade('lead_grade'),
    leadScoreReasons: jsonb('lead_score_reasons'),
    contactValidationStatus: contactValidationStatus('contact_validation_status').notNull().default('pending_contact'),
    contactConfirmedAt: timestamp('contact_confirmed_at', { withTimezone: true }),
    createdAt: createdAt(),
  },
  (table) => [
    index('lead_status_created_idx').on(table.lifecycleStatus, table.createdAt),
    uniqueIndex('lead_project_key').on(table.projectId),
  ],
);

export const projectStatusHistory = pgTable(
  'project_status_history',
  {
    id: id(),
    projectId: uuid('project_id').notNull().references(() => project.id),
    fromStatus: projectStatus('from_status'),
    toStatus: projectStatus('to_status').notNull(),
    reason: text('reason'),
    actorType: actorType('actor_type').notNull(),
    actorId: uuid('actor_id'),
    createdAt: createdAt(),
  },
  (table) => [index('project_status_history_idx').on(table.projectId, table.createdAt)],
);

export const leadStatusHistory = pgTable(
  'lead_status_history',
  {
    id: id(),
    leadId: uuid('lead_id').notNull().references(() => lead.id),
    fromStatus: leadLifecycleStatus('from_status'),
    toStatus: leadLifecycleStatus('to_status').notNull(),
    reason: text('reason'),
    actorType: actorType('actor_type').notNull(),
    actorId: uuid('actor_id'),
    createdAt: createdAt(),
  },
  (table) => [index('lead_status_history_idx').on(table.leadId, table.createdAt)],
);

/* -------------------------------------------------------------------------- */
/* Matching and distribution                                                  */
/* -------------------------------------------------------------------------- */

export const routingPolicy = pgTable('routing_policy', {
  id: id(),
  marketplaceId: uuid('marketplace_id').notNull().references(() => marketplace.id),
  version: integer('version').notNull(),
  policyJson: jsonb('policy_json').notNull(),
  activeFrom: timestamp('active_from', { withTimezone: true }).notNull().defaultNow(),
  activeTo: timestamp('active_to', { withTimezone: true }),
});

export const providerAssignment = pgTable(
  'provider_assignment',
  {
    id: id(),
    leadId: uuid('lead_id').notNull().references(() => lead.id),
    providerCompanyId: uuid('provider_company_id').notNull().references(() => providerCompany.id),
    /** Score in basis points of the configured weight total, so it stays an integer. */
    score: integer('score').notNull(),
    rank: smallint('rank').notNull(),
    status: assignmentStatus('status').notNull().default('assigned'),
    assignedAt: timestamp('assigned_at', { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    respondedAt: timestamp('responded_at', { withTimezone: true }),
    createdAt: createdAt(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (table) => [
    index('provider_assignment_company_status_idx').on(table.providerCompanyId, table.status),
    // One provider is assigned to a lead at most once, which also makes a
    // retried assignment command idempotent.
    uniqueIndex('provider_assignment_key').on(table.leadId, table.providerCompanyId),
  ],
);

export const matchExplanation = pgTable(
  'match_explanation',
  {
    id: id(),
    assignmentId: uuid('assignment_id').notNull().references(() => providerAssignment.id),
    eligibilityJson: jsonb('eligibility_json').notNull(),
    scoreBreakdownJson: jsonb('score_breakdown_json').notNull(),
    reasonsJson: jsonb('reasons_json').notNull(),
    ruleVersion: text('rule_version').notNull(),
    createdAt: createdAt(),
  },
  (table) => [uniqueIndex('match_explanation_key').on(table.assignmentId)],
);

export const leadRejection = pgTable('lead_rejection', {
  id: id(),
  assignmentId: uuid('assignment_id').notNull().references(() => providerAssignment.id),
  reasonCode: text('reason_code').notNull(),
  notes: text('notes'),
  createdAt: createdAt(),
});

/* -------------------------------------------------------------------------- */
/* Sales lifecycle                                                            */
/* -------------------------------------------------------------------------- */

export const communication = pgTable('communication', {
  id: id(),
  projectId: uuid('project_id').references(() => project.id),
  leadId: uuid('lead_id').references(() => lead.id),
  providerCompanyId: uuid('provider_company_id').references(() => providerCompany.id),
  channel: communicationChannel('channel').notNull(),
  direction: communicationDirection('direction').notNull(),
  templateKey: text('template_key'),
  status: communicationStatus('status').notNull().default('queued'),
  providerMessageId: text('provider_message_id'),
  createdAt: createdAt(),
});

export const appointment = pgTable('appointment', {
  id: id(),
  leadId: uuid('lead_id').notNull().references(() => lead.id),
  providerCompanyId: uuid('provider_company_id').notNull().references(() => providerCompany.id),
  status: appointmentStatus('status').notNull().default('scheduled'),
  scheduledAt: timestamp('scheduled_at', { withTimezone: true }).notNull(),
  createdAt: createdAt(),
});

export const quote = pgTable(
  'quote',
  {
    id: id(),
    leadId: uuid('lead_id').notNull().references(() => lead.id),
    providerCompanyId: uuid('provider_company_id').notNull().references(() => providerCompany.id),
    amountMinor: money('amount_minor').notNull(),
    currency: currency().notNull(),
    scopeNotes: text('scope_notes'),
    status: quoteStatus('status').notNull().default('submitted'),
    submittedAt: timestamp('submitted_at', { withTimezone: true }).notNull().defaultNow(),
    createdAt: createdAt(),
  },
  (table) => [index('quote_lead_idx').on(table.leadId)],
);

export const projectOutcome = pgTable(
  'project_outcome',
  {
    id: id(),
    projectId: uuid('project_id').notNull().references(() => project.id),
    providerCompanyId: uuid('provider_company_id').references(() => providerCompany.id),
    outcome: outcomeKind('outcome').notNull(),
    valueMinor: money('value_minor'),
    currency: currency(),
    verifiedBy: uuid('verified_by').references(() => appUser.id),
    verifiedAt: timestamp('verified_at', { withTimezone: true }),
    createdAt: createdAt(),
  },
  (table) => [uniqueIndex('project_outcome_key').on(table.projectId)],
);

export const providerReview = pgTable('provider_review', {
  id: id(),
  providerCompanyId: uuid('provider_company_id').notNull().references(() => providerCompany.id),
  projectId: uuid('project_id').references(() => project.id),
  rating: smallint('rating').notNull(),
  body: text('body'),
  status: reviewStatus('status').notNull().default('pending'),
  verifiedAt: timestamp('verified_at', { withTimezone: true }),
  createdAt: createdAt(),
});

export const providerPerformanceSnapshot = pgTable(
  'provider_performance_snapshot',
  {
    id: id(),
    providerCompanyId: uuid('provider_company_id').notNull().references(() => providerCompany.id),
    marketplaceId: uuid('marketplace_id').notNull().references(() => marketplace.id),
    periodStart: timestamp('period_start', { withTimezone: true }).notNull(),
    periodEnd: timestamp('period_end', { withTimezone: true }).notNull(),
    metricsJson: jsonb('metrics_json').notNull(),
    /** 0–100. Feeds the response_performance scoring dimension. */
    score: smallint('score').notNull(),
    createdAt: createdAt(),
  },
  (table) => [index('provider_performance_idx').on(table.providerCompanyId, table.marketplaceId, table.periodEnd)],
);

/* -------------------------------------------------------------------------- */
/* Commercial ledger                                                          */
/* -------------------------------------------------------------------------- */

export const providerAgreement = pgTable('provider_agreement', {
  id: id(),
  providerCompanyId: uuid('provider_company_id').notNull().references(() => providerCompany.id),
  marketplaceId: uuid('marketplace_id').notNull().references(() => marketplace.id),
  planId: uuid('plan_id').references(() => commercialPlan.id),
  startsAt: timestamp('starts_at', { withTimezone: true }).notNull().defaultNow(),
  endsAt: timestamp('ends_at', { withTimezone: true }),
  /** Terms are snapshotted so a later plan edit cannot rewrite history. */
  termsSnapshotJson: jsonb('terms_snapshot_json').notNull(),
  createdAt: createdAt(),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
});

export const subscription = pgTable('subscription', {
  id: id(),
  providerAgreementId: uuid('provider_agreement_id').notNull().references(() => providerAgreement.id),
  externalCustomerId: text('external_customer_id'),
  externalSubscriptionId: text('external_subscription_id'),
  status: text('status').notNull(),
  createdAt: createdAt(),
});

export const invoice = pgTable('invoice', {
  id: id(),
  providerAgreementId: uuid('provider_agreement_id').notNull().references(() => providerAgreement.id),
  invoiceType: text('invoice_type').notNull(),
  amountMinor: money('amount_minor').notNull(),
  currency: currency().notNull(),
  status: invoiceStatus('status').notNull().default('draft'),
  externalInvoiceId: text('external_invoice_id'),
  createdAt: createdAt(),
});

export const commissionAgreement = pgTable('commission_agreement', {
  id: id(),
  providerAgreementId: uuid('provider_agreement_id').notNull().references(() => providerAgreement.id),
  rateBps: integer('rate_bps'),
  fixedFeeMinor: money('fixed_fee_minor'),
  trigger: commissionTrigger('trigger').notNull(),
  termsSnapshotJson: jsonb('terms_snapshot_json').notNull(),
  createdAt: createdAt(),
});

export const commissionEvent = pgTable(
  'commission_event',
  {
    id: id(),
    projectId: uuid('project_id').notNull().references(() => project.id),
    providerAgreementId: uuid('provider_agreement_id').notNull().references(() => providerAgreement.id),
    trigger: commissionTrigger('trigger').notNull(),
    baseValueMinor: money('base_value_minor'),
    commissionValueMinor: money('commission_value_minor').notNull(),
    currency: currency().notNull(),
    status: commissionStatus('status').notNull().default('pending_verification'),
    /** Set on the reversing row; the original event is never mutated or deleted. */
    reversesEventId: uuid('reverses_event_id'),
    termsSnapshotJson: jsonb('terms_snapshot_json').notNull(),
    createdAt: createdAt(),
  },
  (table) => [index('commission_event_project_idx').on(table.projectId)],
);

export const payment = pgTable('payment', {
  id: id(),
  invoiceId: uuid('invoice_id').notNull().references(() => invoice.id),
  amountMinor: money('amount_minor').notNull(),
  currency: currency().notNull(),
  status: paymentStatus('status').notNull().default('pending'),
  externalPaymentId: text('external_payment_id'),
  receivedAt: timestamp('received_at', { withTimezone: true }),
  createdAt: createdAt(),
});

export const adjustment = pgTable('adjustment', {
  id: id(),
  invoiceId: uuid('invoice_id').notNull().references(() => invoice.id),
  reason: text('reason').notNull(),
  amountMinor: money('amount_minor').notNull(),
  currency: currency().notNull(),
  createdBy: uuid('created_by').references(() => appUser.id),
  createdAt: createdAt(),
});

export const dispute = pgTable('dispute', {
  id: id(),
  commercialEntityType: text('commercial_entity_type').notNull(),
  commercialEntityId: uuid('commercial_entity_id').notNull(),
  status: disputeStatus('status').notNull().default('open'),
  reason: text('reason').notNull(),
  resolution: text('resolution'),
  createdAt: createdAt(),
});

/* -------------------------------------------------------------------------- */
/* Content and SEO                                                            */
/* -------------------------------------------------------------------------- */

export const contentPage = pgTable(
  'content_page',
  {
    id: id(),
    marketplaceId: uuid('marketplace_id').notNull().references(() => marketplace.id),
    pageType: text('page_type').notNull(),
    slug: text('slug').notNull(),
    title: text('title').notNull(),
    description: text('description'),
    searchIntent: text('search_intent'),
    targetQuery: text('target_query'),
    status: contentStatus('status').notNull().default('draft'),
    canonicalUrl: text('canonical_url'),
    indexingPolicy: text('indexing_policy').notNull().default('index'),
    lastReviewedAt: timestamp('last_reviewed_at', { withTimezone: true }),
    createdAt: createdAt(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (table) => [uniqueIndex('content_page_key').on(table.marketplaceId, table.pageType, table.slug)],
);

export const contentBlock = pgTable(
  'content_block',
  {
    id: id(),
    pageId: uuid('page_id').notNull().references(() => contentPage.id),
    blockType: text('block_type').notNull(),
    contentJson: jsonb('content_json').notNull(),
    sortOrder: integer('sort_order').notNull().default(0),
  },
  (table) => [index('content_block_page_idx').on(table.pageId, table.sortOrder)],
);

export const contentSource = pgTable('content_source', {
  id: id(),
  pageId: uuid('page_id').notNull().references(() => contentPage.id),
  sourceType: text('source_type').notNull(),
  citation: text('citation').notNull(),
  reviewedBy: uuid('reviewed_by').references(() => appUser.id),
  reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
});

export const contentBrief = pgTable('content_brief', {
  id: id(),
  marketplaceId: uuid('marketplace_id').notNull().references(() => marketplace.id),
  targetQuery: text('target_query').notNull(),
  intent: text('intent'),
  outlineJson: jsonb('outline_json'),
  status: contentStatus('status').notNull().default('draft'),
  createdAt: createdAt(),
});

export const redirect = pgTable(
  'redirect',
  {
    id: id(),
    marketplaceId: uuid('marketplace_id').notNull().references(() => marketplace.id),
    fromPath: text('from_path').notNull(),
    toPath: text('to_path').notNull(),
    statusCode: smallint('status_code').notNull().default(308),
  },
  (table) => [uniqueIndex('redirect_key').on(table.marketplaceId, table.fromPath)],
);

export const seoObservation = pgTable('seo_observation', {
  id: id(),
  pageId: uuid('page_id').notNull().references(() => contentPage.id),
  observedAt: timestamp('observed_at', { withTimezone: true }).notNull().defaultNow(),
  indexStatus: text('index_status'),
  performanceJson: jsonb('performance_json'),
});

/* -------------------------------------------------------------------------- */
/* Platform reliability                                                       */
/* -------------------------------------------------------------------------- */

export const outboxEvent = pgTable(
  'outbox_event',
  {
    id: id(),
    eventType: text('event_type').notNull(),
    eventVersion: integer('event_version').notNull().default(1),
    entityType: text('entity_type').notNull(),
    entityId: uuid('entity_id').notNull(),
    marketplaceId: uuid('marketplace_id').references(() => marketplace.id),
    correlationId: text('correlation_id'),
    idempotencyKey: text('idempotency_key').notNull(),
    /** Reference IDs only — never full contact details (contracts/events.md). */
    payloadJson: jsonb('payload_json').notNull(),
    status: outboxStatus('status').notNull().default('pending'),
    attempts: integer('attempts').notNull().default(0),
    nextAttemptAt: timestamp('next_attempt_at', { withTimezone: true }).notNull().defaultNow(),
    lastError: text('last_error'),
    processedAt: timestamp('processed_at', { withTimezone: true }),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex('outbox_event_idempotency_key').on(table.idempotencyKey),
    index('outbox_event_claim_idx').on(table.status, table.nextAttemptAt),
  ],
);

export const auditLog = pgTable(
  'audit_log',
  {
    id: id(),
    actorType: actorType('actor_type').notNull(),
    actorId: uuid('actor_id'),
    action: text('action').notNull(),
    entityType: text('entity_type').notNull(),
    entityId: uuid('entity_id'),
    marketplaceId: uuid('marketplace_id').references(() => marketplace.id),
    /** Redacted metadata only. Never raw PII. */
    metadataJson: jsonb('metadata_json'),
    createdAt: createdAt(),
  },
  (table) => [index('audit_log_entity_idx').on(table.entityType, table.entityId, table.createdAt)],
);

export const webhookDelivery = pgTable(
  'webhook_delivery',
  {
    id: id(),
    provider: text('provider').notNull(),
    externalEventId: text('external_event_id').notNull(),
    eventType: text('event_type'),
    payloadHash: text('payload_hash').notNull(),
    status: webhookStatus('status').notNull().default('received'),
    receivedAt: timestamp('received_at', { withTimezone: true }).notNull().defaultNow(),
    processedAt: timestamp('processed_at', { withTimezone: true }),
  },
  // Replay protection: a duplicate delivery cannot insert twice.
  (table) => [uniqueIndex('webhook_delivery_key').on(table.provider, table.externalEventId)],
);

export const aiRun = pgTable('ai_run', {
  id: id(),
  taskKey: text('task_key').notNull(),
  promptVersion: text('prompt_version').notNull(),
  model: text('model').notNull(),
  inputHash: text('input_hash').notNull(),
  outputJson: jsonb('output_json'),
  confidence: integer('confidence'),
  status: aiRunStatus('status').notNull(),
  costMinor: money('cost_minor'),
  createdAt: createdAt(),
});

/** Product analytics. A plain table beats a vendor until the volume justifies one. */
export const analyticsEvent = pgTable(
  'analytics_event',
  {
    id: id(),
    name: text('name').notNull(),
    marketplaceId: uuid('marketplace_id').references(() => marketplace.id),
    entityType: text('entity_type'),
    entityId: uuid('entity_id'),
    /** Redacted properties only — never phone, email or free text. */
    propertiesJson: jsonb('properties_json'),
    occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('analytics_event_name_idx').on(table.name, table.occurredAt)],
);
