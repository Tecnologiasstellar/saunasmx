CREATE TYPE "public"."actor_type" AS ENUM('consumer', 'provider_user', 'operator', 'system');--> statement-breakpoint
CREATE TYPE "public"."ai_run_status" AS ENUM('succeeded', 'invalid_output', 'failed', 'skipped');--> statement-breakpoint
CREATE TYPE "public"."app_role" AS ENUM('consumer', 'provider_owner', 'provider_member', 'operator', 'content_editor', 'finance_operator', 'admin');--> statement-breakpoint
CREATE TYPE "public"."appointment_status" AS ENUM('scheduled', 'completed', 'cancelled', 'no_show');--> statement-breakpoint
CREATE TYPE "public"."assignment_status" AS ENUM('assigned', 'accepted', 'rejected', 'expired', 'withdrawn');--> statement-breakpoint
CREATE TYPE "public"."commission_status" AS ENUM('pending_verification', 'verified', 'invoiced', 'reversed', 'disputed');--> statement-breakpoint
CREATE TYPE "public"."commission_trigger" AS ENUM('qualified_lead', 'accepted_lead', 'appointment', 'verified_win');--> statement-breakpoint
CREATE TYPE "public"."communication_channel" AS ENUM('email', 'whatsapp', 'phone', 'in_app');--> statement-breakpoint
CREATE TYPE "public"."communication_direction" AS ENUM('outbound', 'inbound');--> statement-breakpoint
CREATE TYPE "public"."communication_status" AS ENUM('queued', 'sent', 'delivered', 'failed', 'logged');--> statement-breakpoint
CREATE TYPE "public"."config_status" AS ENUM('draft', 'published', 'superseded');--> statement-breakpoint
CREATE TYPE "public"."content_status" AS ENUM('draft', 'in_review', 'published', 'archived');--> statement-breakpoint
CREATE TYPE "public"."dispute_status" AS ENUM('open', 'under_review', 'resolved', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."domain_kind" AS ENUM('canonical', 'alias', 'redirect');--> statement-breakpoint
CREATE TYPE "public"."invoice_status" AS ENUM('draft', 'open', 'paid', 'void', 'uncollectible');--> statement-breakpoint
CREATE TYPE "public"."lead_lifecycle_status" AS ENUM('created', 'review_required', 'ready_for_matching', 'assigned', 'contacted', 'quoted', 'rejected', 'won', 'lost', 'expired');--> statement-breakpoint
CREATE TYPE "public"."marketplace_status" AS ENUM('draft', 'active', 'paused', 'retired');--> statement-breakpoint
CREATE TYPE "public"."organization_status" AS ENUM('active', 'suspended');--> statement-breakpoint
CREATE TYPE "public"."outbox_status" AS ENUM('pending', 'processing', 'completed', 'failed', 'dead_letter');--> statement-breakpoint
CREATE TYPE "public"."outcome_kind" AS ENUM('won', 'lost', 'unknown');--> statement-breakpoint
CREATE TYPE "public"."payment_status" AS ENUM('pending', 'succeeded', 'failed', 'refunded');--> statement-breakpoint
CREATE TYPE "public"."project_status" AS ENUM('draft', 'submitted', 'qualified', 'matched', 'in_progress', 'won', 'lost', 'spam', 'withdrawn');--> statement-breakpoint
CREATE TYPE "public"."provider_company_status" AS ENUM('pending', 'active', 'suspended', 'archived');--> statement-breakpoint
CREATE TYPE "public"."provider_marketplace_status" AS ENUM('pending', 'approved', 'paused', 'rejected', 'suspended');--> statement-breakpoint
CREATE TYPE "public"."qualification_status" AS ENUM('pending', 'qualified', 'review_required', 'incomplete', 'spam');--> statement-breakpoint
CREATE TYPE "public"."quote_status" AS ENUM('draft', 'submitted', 'accepted', 'rejected', 'expired');--> statement-breakpoint
CREATE TYPE "public"."review_status" AS ENUM('pending', 'published', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."user_status" AS ENUM('active', 'invited', 'suspended');--> statement-breakpoint
CREATE TYPE "public"."verification_status" AS ENUM('unverified', 'documents_submitted', 'verified');--> statement-breakpoint
CREATE TYPE "public"."webhook_status" AS ENUM('received', 'processed', 'ignored', 'failed');--> statement-breakpoint
CREATE TABLE "adjustment" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"invoice_id" uuid NOT NULL,
	"reason" text NOT NULL,
	"amount_minor" integer NOT NULL,
	"currency" char(3) NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_run" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"task_key" text NOT NULL,
	"prompt_version" text NOT NULL,
	"model" text NOT NULL,
	"input_hash" text NOT NULL,
	"output_json" jsonb,
	"confidence" integer,
	"status" "ai_run_status" NOT NULL,
	"cost_minor" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "analytics_event" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"marketplace_id" uuid,
	"entity_type" text,
	"entity_id" uuid,
	"properties_json" jsonb,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "app_user" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"auth_subject" text,
	"email" text NOT NULL,
	"name" text,
	"status" "user_status" DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "appointment" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"lead_id" uuid NOT NULL,
	"provider_company_id" uuid NOT NULL,
	"status" "appointment_status" DEFAULT 'scheduled' NOT NULL,
	"scheduled_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "attribution_touch" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"touch_type" text NOT NULL,
	"channel" text,
	"campaign" text,
	"medium" text,
	"referrer" text,
	"landing_path" text,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor_type" "actor_type" NOT NULL,
	"actor_id" uuid,
	"action" text NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" uuid,
	"marketplace_id" uuid,
	"metadata_json" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "auth_session" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "commercial_plan" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"marketplace_id" uuid NOT NULL,
	"name" text NOT NULL,
	"terms_json" jsonb NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "commission_agreement" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider_agreement_id" uuid NOT NULL,
	"rate_bps" integer,
	"fixed_fee_minor" integer,
	"trigger" "commission_trigger" NOT NULL,
	"terms_snapshot_json" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "commission_event" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"provider_agreement_id" uuid NOT NULL,
	"trigger" "commission_trigger" NOT NULL,
	"base_value_minor" integer,
	"commission_value_minor" integer NOT NULL,
	"currency" char(3) NOT NULL,
	"status" "commission_status" DEFAULT 'pending_verification' NOT NULL,
	"reverses_event_id" uuid,
	"terms_snapshot_json" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "communication" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid,
	"lead_id" uuid,
	"provider_company_id" uuid,
	"channel" "communication_channel" NOT NULL,
	"direction" "communication_direction" NOT NULL,
	"template_key" text,
	"status" "communication_status" DEFAULT 'queued' NOT NULL,
	"provider_message_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "consent_record" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"purpose" text NOT NULL,
	"policy_version" text NOT NULL,
	"granted" boolean NOT NULL,
	"captured_at" timestamp with time zone DEFAULT now() NOT NULL,
	"capture_source" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "consumer" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"phone" text,
	"locale" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"anonymized_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "content_block" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"page_id" uuid NOT NULL,
	"block_type" text NOT NULL,
	"content_json" jsonb NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "content_brief" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"marketplace_id" uuid NOT NULL,
	"target_query" text NOT NULL,
	"intent" text,
	"outline_json" jsonb,
	"status" "content_status" DEFAULT 'draft' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "content_page" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"marketplace_id" uuid NOT NULL,
	"page_type" text NOT NULL,
	"slug" text NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"search_intent" text,
	"target_query" text,
	"status" "content_status" DEFAULT 'draft' NOT NULL,
	"canonical_url" text,
	"indexing_policy" text DEFAULT 'index' NOT NULL,
	"last_reviewed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "content_source" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"page_id" uuid NOT NULL,
	"source_type" text NOT NULL,
	"citation" text NOT NULL,
	"reviewed_by" uuid,
	"reviewed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "dispute" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"commercial_entity_type" text NOT NULL,
	"commercial_entity_id" uuid NOT NULL,
	"status" "dispute_status" DEFAULT 'open' NOT NULL,
	"reason" text NOT NULL,
	"resolution" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "domain" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"marketplace_id" uuid NOT NULL,
	"hostname" text NOT NULL,
	"kind" "domain_kind" NOT NULL,
	"is_canonical" boolean DEFAULT false NOT NULL,
	"redirect_target" text,
	"verified_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invoice" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider_agreement_id" uuid NOT NULL,
	"invoice_type" text NOT NULL,
	"amount_minor" integer NOT NULL,
	"currency" char(3) NOT NULL,
	"status" "invoice_status" DEFAULT 'draft' NOT NULL,
	"external_invoice_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lead" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"lifecycle_status" "lead_lifecycle_status" DEFAULT 'created' NOT NULL,
	"qualification_status" "qualification_status" DEFAULT 'pending' NOT NULL,
	"qualified_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lead_rejection" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"assignment_id" uuid NOT NULL,
	"reason_code" text NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lead_status_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"lead_id" uuid NOT NULL,
	"from_status" "lead_lifecycle_status",
	"to_status" "lead_lifecycle_status" NOT NULL,
	"reason" text,
	"actor_type" "actor_type" NOT NULL,
	"actor_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "login_token" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"consumed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "marketplace" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"category_key" text NOT NULL,
	"locale" text NOT NULL,
	"currency" char(3) NOT NULL,
	"country_code" char(2) NOT NULL,
	"status" "marketplace_status" DEFAULT 'draft' NOT NULL,
	"canonical_domain" text NOT NULL,
	"theme_key" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "marketplace_config_version" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"marketplace_id" uuid NOT NULL,
	"version" text NOT NULL,
	"config_json" jsonb NOT NULL,
	"status" "config_status" DEFAULT 'published' NOT NULL,
	"published_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "match_explanation" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"assignment_id" uuid NOT NULL,
	"eligibility_json" jsonb NOT NULL,
	"score_breakdown_json" jsonb NOT NULL,
	"reasons_json" jsonb NOT NULL,
	"rule_version" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "organization" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"status" "organization_status" DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "outbox_event" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_type" text NOT NULL,
	"event_version" integer DEFAULT 1 NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" uuid NOT NULL,
	"marketplace_id" uuid,
	"correlation_id" text,
	"idempotency_key" text NOT NULL,
	"payload_json" jsonb NOT NULL,
	"status" "outbox_status" DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"next_attempt_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_error" text,
	"processed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payment" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"invoice_id" uuid NOT NULL,
	"amount_minor" integer NOT NULL,
	"currency" char(3) NOT NULL,
	"status" "payment_status" DEFAULT 'pending' NOT NULL,
	"external_payment_id" text,
	"received_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "project" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"marketplace_id" uuid NOT NULL,
	"consumer_id" uuid NOT NULL,
	"status" "project_status" DEFAULT 'draft' NOT NULL,
	"source_channel" text,
	"source_campaign" text,
	"idempotency_key" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "project_location" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"country_code" char(2) NOT NULL,
	"state_code" text,
	"city" text,
	"postal_code" text NOT NULL,
	"property_type" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "project_outcome" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"provider_company_id" uuid,
	"outcome" "outcome_kind" NOT NULL,
	"value_minor" integer,
	"currency" char(3),
	"verified_by" uuid,
	"verified_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "project_requirement" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"requirement_key" text NOT NULL,
	"value_json" jsonb NOT NULL,
	"source" text DEFAULT 'questionnaire' NOT NULL,
	"confidence" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "project_status_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"from_status" "project_status",
	"to_status" "project_status" NOT NULL,
	"reason" text,
	"actor_type" "actor_type" NOT NULL,
	"actor_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "provider_agreement" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider_company_id" uuid NOT NULL,
	"marketplace_id" uuid NOT NULL,
	"plan_id" uuid,
	"starts_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ends_at" timestamp with time zone,
	"terms_snapshot_json" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "provider_assignment" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"lead_id" uuid NOT NULL,
	"provider_company_id" uuid NOT NULL,
	"score" integer NOT NULL,
	"rank" smallint NOT NULL,
	"status" "assignment_status" DEFAULT 'assigned' NOT NULL,
	"assigned_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone,
	"responded_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "provider_company" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"legal_name" text NOT NULL,
	"display_name" text NOT NULL,
	"status" "provider_company_status" DEFAULT 'pending' NOT NULL,
	"contact_phone" text,
	"contact_email" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "provider_marketplace" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider_company_id" uuid NOT NULL,
	"marketplace_id" uuid NOT NULL,
	"status" "provider_marketplace_status" DEFAULT 'pending' NOT NULL,
	"approved_at" timestamp with time zone,
	"commercial_plan_id" uuid,
	"capacity_limit" integer DEFAULT 10 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "provider_performance_snapshot" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider_company_id" uuid NOT NULL,
	"marketplace_id" uuid NOT NULL,
	"period_start" timestamp with time zone NOT NULL,
	"period_end" timestamp with time zone NOT NULL,
	"metrics_json" jsonb NOT NULL,
	"score" smallint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "provider_portfolio_item" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider_company_id" uuid NOT NULL,
	"marketplace_id" uuid NOT NULL,
	"title" text NOT NULL,
	"media_id" text,
	"location_label" text,
	"published" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "provider_profile" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider_company_id" uuid NOT NULL,
	"marketplace_id" uuid NOT NULL,
	"description" text,
	"specialties_json" jsonb,
	"verification_status" "verification_status" DEFAULT 'unverified' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "provider_review" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider_company_id" uuid NOT NULL,
	"project_id" uuid,
	"rating" smallint NOT NULL,
	"body" text,
	"status" "review_status" DEFAULT 'pending' NOT NULL,
	"verified_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "provider_service" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider_company_id" uuid NOT NULL,
	"marketplace_id" uuid NOT NULL,
	"service_key" text NOT NULL,
	"min_project_value_minor" integer DEFAULT 0 NOT NULL,
	"currency" char(3) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "provider_team_membership" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider_company_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role" "app_role" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "provider_territory" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider_company_id" uuid NOT NULL,
	"marketplace_id" uuid NOT NULL,
	"region_code" text,
	"postal_prefix" text NOT NULL,
	"radius_km" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "questionnaire_response" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"questionnaire_id" text NOT NULL,
	"questionnaire_version" integer NOT NULL,
	"answers_json" jsonb NOT NULL,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "quote" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"lead_id" uuid NOT NULL,
	"provider_company_id" uuid NOT NULL,
	"amount_minor" integer NOT NULL,
	"currency" char(3) NOT NULL,
	"scope_notes" text,
	"status" "quote_status" DEFAULT 'submitted' NOT NULL,
	"submitted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "redirect" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"marketplace_id" uuid NOT NULL,
	"from_path" text NOT NULL,
	"to_path" text NOT NULL,
	"status_code" smallint DEFAULT 308 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "routing_policy" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"marketplace_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"policy_json" jsonb NOT NULL,
	"active_from" timestamp with time zone DEFAULT now() NOT NULL,
	"active_to" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "seo_observation" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"page_id" uuid NOT NULL,
	"observed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"index_status" text,
	"performance_json" jsonb
);
--> statement-breakpoint
CREATE TABLE "subscription" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider_agreement_id" uuid NOT NULL,
	"external_customer_id" text,
	"external_subscription_id" text,
	"status" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_role" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"role" "app_role" NOT NULL,
	"organization_id" uuid,
	"provider_company_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "webhook_delivery" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider" text NOT NULL,
	"external_event_id" text NOT NULL,
	"event_type" text,
	"payload_hash" text NOT NULL,
	"status" "webhook_status" DEFAULT 'received' NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"processed_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "adjustment" ADD CONSTRAINT "adjustment_invoice_id_invoice_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoice"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "adjustment" ADD CONSTRAINT "adjustment_created_by_app_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "analytics_event" ADD CONSTRAINT "analytics_event_marketplace_id_marketplace_id_fk" FOREIGN KEY ("marketplace_id") REFERENCES "public"."marketplace"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appointment" ADD CONSTRAINT "appointment_lead_id_lead_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."lead"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appointment" ADD CONSTRAINT "appointment_provider_company_id_provider_company_id_fk" FOREIGN KEY ("provider_company_id") REFERENCES "public"."provider_company"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attribution_touch" ADD CONSTRAINT "attribution_touch_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_marketplace_id_marketplace_id_fk" FOREIGN KEY ("marketplace_id") REFERENCES "public"."marketplace"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auth_session" ADD CONSTRAINT "auth_session_user_id_app_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commercial_plan" ADD CONSTRAINT "commercial_plan_marketplace_id_marketplace_id_fk" FOREIGN KEY ("marketplace_id") REFERENCES "public"."marketplace"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commission_agreement" ADD CONSTRAINT "commission_agreement_provider_agreement_id_provider_agreement_id_fk" FOREIGN KEY ("provider_agreement_id") REFERENCES "public"."provider_agreement"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commission_event" ADD CONSTRAINT "commission_event_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commission_event" ADD CONSTRAINT "commission_event_provider_agreement_id_provider_agreement_id_fk" FOREIGN KEY ("provider_agreement_id") REFERENCES "public"."provider_agreement"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "communication" ADD CONSTRAINT "communication_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "communication" ADD CONSTRAINT "communication_lead_id_lead_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."lead"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "communication" ADD CONSTRAINT "communication_provider_company_id_provider_company_id_fk" FOREIGN KEY ("provider_company_id") REFERENCES "public"."provider_company"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consent_record" ADD CONSTRAINT "consent_record_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_block" ADD CONSTRAINT "content_block_page_id_content_page_id_fk" FOREIGN KEY ("page_id") REFERENCES "public"."content_page"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_brief" ADD CONSTRAINT "content_brief_marketplace_id_marketplace_id_fk" FOREIGN KEY ("marketplace_id") REFERENCES "public"."marketplace"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_page" ADD CONSTRAINT "content_page_marketplace_id_marketplace_id_fk" FOREIGN KEY ("marketplace_id") REFERENCES "public"."marketplace"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_source" ADD CONSTRAINT "content_source_page_id_content_page_id_fk" FOREIGN KEY ("page_id") REFERENCES "public"."content_page"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_source" ADD CONSTRAINT "content_source_reviewed_by_app_user_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "domain" ADD CONSTRAINT "domain_marketplace_id_marketplace_id_fk" FOREIGN KEY ("marketplace_id") REFERENCES "public"."marketplace"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice" ADD CONSTRAINT "invoice_provider_agreement_id_provider_agreement_id_fk" FOREIGN KEY ("provider_agreement_id") REFERENCES "public"."provider_agreement"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead" ADD CONSTRAINT "lead_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_rejection" ADD CONSTRAINT "lead_rejection_assignment_id_provider_assignment_id_fk" FOREIGN KEY ("assignment_id") REFERENCES "public"."provider_assignment"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_status_history" ADD CONSTRAINT "lead_status_history_lead_id_lead_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."lead"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "marketplace" ADD CONSTRAINT "marketplace_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "marketplace_config_version" ADD CONSTRAINT "marketplace_config_version_marketplace_id_marketplace_id_fk" FOREIGN KEY ("marketplace_id") REFERENCES "public"."marketplace"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "match_explanation" ADD CONSTRAINT "match_explanation_assignment_id_provider_assignment_id_fk" FOREIGN KEY ("assignment_id") REFERENCES "public"."provider_assignment"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outbox_event" ADD CONSTRAINT "outbox_event_marketplace_id_marketplace_id_fk" FOREIGN KEY ("marketplace_id") REFERENCES "public"."marketplace"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment" ADD CONSTRAINT "payment_invoice_id_invoice_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoice"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project" ADD CONSTRAINT "project_marketplace_id_marketplace_id_fk" FOREIGN KEY ("marketplace_id") REFERENCES "public"."marketplace"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project" ADD CONSTRAINT "project_consumer_id_consumer_id_fk" FOREIGN KEY ("consumer_id") REFERENCES "public"."consumer"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_location" ADD CONSTRAINT "project_location_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_outcome" ADD CONSTRAINT "project_outcome_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_outcome" ADD CONSTRAINT "project_outcome_provider_company_id_provider_company_id_fk" FOREIGN KEY ("provider_company_id") REFERENCES "public"."provider_company"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_outcome" ADD CONSTRAINT "project_outcome_verified_by_app_user_id_fk" FOREIGN KEY ("verified_by") REFERENCES "public"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_requirement" ADD CONSTRAINT "project_requirement_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_status_history" ADD CONSTRAINT "project_status_history_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "provider_agreement" ADD CONSTRAINT "provider_agreement_provider_company_id_provider_company_id_fk" FOREIGN KEY ("provider_company_id") REFERENCES "public"."provider_company"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "provider_agreement" ADD CONSTRAINT "provider_agreement_marketplace_id_marketplace_id_fk" FOREIGN KEY ("marketplace_id") REFERENCES "public"."marketplace"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "provider_agreement" ADD CONSTRAINT "provider_agreement_plan_id_commercial_plan_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."commercial_plan"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "provider_assignment" ADD CONSTRAINT "provider_assignment_lead_id_lead_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."lead"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "provider_assignment" ADD CONSTRAINT "provider_assignment_provider_company_id_provider_company_id_fk" FOREIGN KEY ("provider_company_id") REFERENCES "public"."provider_company"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "provider_marketplace" ADD CONSTRAINT "provider_marketplace_provider_company_id_provider_company_id_fk" FOREIGN KEY ("provider_company_id") REFERENCES "public"."provider_company"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "provider_marketplace" ADD CONSTRAINT "provider_marketplace_marketplace_id_marketplace_id_fk" FOREIGN KEY ("marketplace_id") REFERENCES "public"."marketplace"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "provider_marketplace" ADD CONSTRAINT "provider_marketplace_commercial_plan_id_commercial_plan_id_fk" FOREIGN KEY ("commercial_plan_id") REFERENCES "public"."commercial_plan"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "provider_performance_snapshot" ADD CONSTRAINT "provider_performance_snapshot_provider_company_id_provider_company_id_fk" FOREIGN KEY ("provider_company_id") REFERENCES "public"."provider_company"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "provider_performance_snapshot" ADD CONSTRAINT "provider_performance_snapshot_marketplace_id_marketplace_id_fk" FOREIGN KEY ("marketplace_id") REFERENCES "public"."marketplace"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "provider_portfolio_item" ADD CONSTRAINT "provider_portfolio_item_provider_company_id_provider_company_id_fk" FOREIGN KEY ("provider_company_id") REFERENCES "public"."provider_company"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "provider_portfolio_item" ADD CONSTRAINT "provider_portfolio_item_marketplace_id_marketplace_id_fk" FOREIGN KEY ("marketplace_id") REFERENCES "public"."marketplace"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "provider_profile" ADD CONSTRAINT "provider_profile_provider_company_id_provider_company_id_fk" FOREIGN KEY ("provider_company_id") REFERENCES "public"."provider_company"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "provider_profile" ADD CONSTRAINT "provider_profile_marketplace_id_marketplace_id_fk" FOREIGN KEY ("marketplace_id") REFERENCES "public"."marketplace"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "provider_review" ADD CONSTRAINT "provider_review_provider_company_id_provider_company_id_fk" FOREIGN KEY ("provider_company_id") REFERENCES "public"."provider_company"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "provider_review" ADD CONSTRAINT "provider_review_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "provider_service" ADD CONSTRAINT "provider_service_provider_company_id_provider_company_id_fk" FOREIGN KEY ("provider_company_id") REFERENCES "public"."provider_company"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "provider_service" ADD CONSTRAINT "provider_service_marketplace_id_marketplace_id_fk" FOREIGN KEY ("marketplace_id") REFERENCES "public"."marketplace"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "provider_team_membership" ADD CONSTRAINT "provider_team_membership_provider_company_id_provider_company_id_fk" FOREIGN KEY ("provider_company_id") REFERENCES "public"."provider_company"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "provider_team_membership" ADD CONSTRAINT "provider_team_membership_user_id_app_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "provider_territory" ADD CONSTRAINT "provider_territory_provider_company_id_provider_company_id_fk" FOREIGN KEY ("provider_company_id") REFERENCES "public"."provider_company"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "provider_territory" ADD CONSTRAINT "provider_territory_marketplace_id_marketplace_id_fk" FOREIGN KEY ("marketplace_id") REFERENCES "public"."marketplace"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "questionnaire_response" ADD CONSTRAINT "questionnaire_response_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quote" ADD CONSTRAINT "quote_lead_id_lead_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."lead"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quote" ADD CONSTRAINT "quote_provider_company_id_provider_company_id_fk" FOREIGN KEY ("provider_company_id") REFERENCES "public"."provider_company"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "redirect" ADD CONSTRAINT "redirect_marketplace_id_marketplace_id_fk" FOREIGN KEY ("marketplace_id") REFERENCES "public"."marketplace"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "routing_policy" ADD CONSTRAINT "routing_policy_marketplace_id_marketplace_id_fk" FOREIGN KEY ("marketplace_id") REFERENCES "public"."marketplace"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seo_observation" ADD CONSTRAINT "seo_observation_page_id_content_page_id_fk" FOREIGN KEY ("page_id") REFERENCES "public"."content_page"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscription" ADD CONSTRAINT "subscription_provider_agreement_id_provider_agreement_id_fk" FOREIGN KEY ("provider_agreement_id") REFERENCES "public"."provider_agreement"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_role" ADD CONSTRAINT "user_role_user_id_app_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_role" ADD CONSTRAINT "user_role_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_role" ADD CONSTRAINT "user_role_provider_company_id_provider_company_id_fk" FOREIGN KEY ("provider_company_id") REFERENCES "public"."provider_company"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "analytics_event_name_idx" ON "analytics_event" USING btree ("name","occurred_at");--> statement-breakpoint
CREATE UNIQUE INDEX "app_user_email_key" ON "app_user" USING btree ("email");--> statement-breakpoint
CREATE INDEX "audit_log_entity_idx" ON "audit_log" USING btree ("entity_type","entity_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "auth_session_token_key" ON "auth_session" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "commission_event_project_idx" ON "commission_event" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "consent_record_project_idx" ON "consent_record" USING btree ("project_id","purpose");--> statement-breakpoint
CREATE INDEX "consumer_email_idx" ON "consumer" USING btree ("email");--> statement-breakpoint
CREATE INDEX "content_block_page_idx" ON "content_block" USING btree ("page_id","sort_order");--> statement-breakpoint
CREATE UNIQUE INDEX "content_page_key" ON "content_page" USING btree ("marketplace_id","page_type","slug");--> statement-breakpoint
CREATE UNIQUE INDEX "domain_hostname_key" ON "domain" USING btree ("hostname");--> statement-breakpoint
CREATE INDEX "lead_status_created_idx" ON "lead" USING btree ("lifecycle_status","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "lead_project_key" ON "lead" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "lead_status_history_idx" ON "lead_status_history" USING btree ("lead_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "login_token_key" ON "login_token" USING btree ("token_hash");--> statement-breakpoint
CREATE UNIQUE INDEX "marketplace_slug_key" ON "marketplace" USING btree ("slug");--> statement-breakpoint
CREATE UNIQUE INDEX "marketplace_config_version_key" ON "marketplace_config_version" USING btree ("marketplace_id","version");--> statement-breakpoint
CREATE UNIQUE INDEX "match_explanation_key" ON "match_explanation" USING btree ("assignment_id");--> statement-breakpoint
CREATE UNIQUE INDEX "outbox_event_idempotency_key" ON "outbox_event" USING btree ("idempotency_key");--> statement-breakpoint
CREATE INDEX "outbox_event_claim_idx" ON "outbox_event" USING btree ("status","next_attempt_at");--> statement-breakpoint
CREATE INDEX "project_marketplace_created_idx" ON "project" USING btree ("marketplace_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "project_idempotency_key" ON "project" USING btree ("marketplace_id","idempotency_key");--> statement-breakpoint
CREATE UNIQUE INDEX "project_outcome_key" ON "project_outcome" USING btree ("project_id");--> statement-breakpoint
CREATE UNIQUE INDEX "project_requirement_key" ON "project_requirement" USING btree ("project_id","requirement_key","source");--> statement-breakpoint
CREATE INDEX "project_status_history_idx" ON "project_status_history" USING btree ("project_id","created_at");--> statement-breakpoint
CREATE INDEX "provider_assignment_company_status_idx" ON "provider_assignment" USING btree ("provider_company_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "provider_assignment_key" ON "provider_assignment" USING btree ("lead_id","provider_company_id");--> statement-breakpoint
CREATE UNIQUE INDEX "provider_marketplace_key" ON "provider_marketplace" USING btree ("provider_company_id","marketplace_id");--> statement-breakpoint
CREATE INDEX "provider_performance_idx" ON "provider_performance_snapshot" USING btree ("provider_company_id","marketplace_id","period_end");--> statement-breakpoint
CREATE UNIQUE INDEX "provider_profile_key" ON "provider_profile" USING btree ("provider_company_id","marketplace_id");--> statement-breakpoint
CREATE UNIQUE INDEX "provider_service_key" ON "provider_service" USING btree ("provider_company_id","marketplace_id","service_key");--> statement-breakpoint
CREATE INDEX "provider_service_lookup_idx" ON "provider_service" USING btree ("marketplace_id","service_key");--> statement-breakpoint
CREATE UNIQUE INDEX "provider_team_membership_key" ON "provider_team_membership" USING btree ("provider_company_id","user_id");--> statement-breakpoint
CREATE INDEX "provider_territory_lookup_idx" ON "provider_territory" USING btree ("marketplace_id","region_code","postal_prefix");--> statement-breakpoint
CREATE UNIQUE INDEX "provider_territory_key" ON "provider_territory" USING btree ("provider_company_id","marketplace_id","postal_prefix");--> statement-breakpoint
CREATE INDEX "quote_lead_idx" ON "quote" USING btree ("lead_id");--> statement-breakpoint
CREATE UNIQUE INDEX "redirect_key" ON "redirect" USING btree ("marketplace_id","from_path");--> statement-breakpoint
CREATE INDEX "user_role_user_idx" ON "user_role" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "webhook_delivery_key" ON "webhook_delivery" USING btree ("provider","external_event_id");