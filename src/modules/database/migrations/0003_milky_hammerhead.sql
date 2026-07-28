CREATE TYPE "public"."library_evidence_level" AS ENUM('systematic_review', 'primary_research', 'qualified_expert', 'industry', 'lived_experience', 'commercial', 'unrated');--> statement-breakpoint
CREATE TYPE "public"."library_ingestion_run_status" AS ENUM('running', 'succeeded', 'partial', 'failed');--> statement-breakpoint
CREATE TYPE "public"."library_platform" AS ENUM('youtube', 'spotify', 'rss', 'google_books', 'pubmed', 'website');--> statement-breakpoint
CREATE TYPE "public"."library_resource_format" AS ENUM('video', 'podcast_episode', 'book', 'article', 'research', 'report', 'course');--> statement-breakpoint
CREATE TYPE "public"."library_rights_status" AS ENUM('official_embed', 'licensed', 'creator_approved', 'creative_commons', 'public_domain', 'link_only', 'pending', 'blocked');--> statement-breakpoint
CREATE TYPE "public"."library_workflow_status" AS ENUM('discovered', 'enriched', 'needs_review', 'approved', 'scheduled', 'published', 'needs_revalidation', 'archived', 'rejected');--> statement-breakpoint
CREATE TABLE "library_channel" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"marketplace_id" uuid NOT NULL,
	"creator_id" uuid NOT NULL,
	"platform" "library_platform" NOT NULL,
	"external_id" text NOT NULL,
	"canonical_url" text NOT NULL,
	"feed_url" text,
	"verification_url" text NOT NULL,
	"official_account" boolean DEFAULT false NOT NULL,
	"active" boolean DEFAULT false NOT NULL,
	"last_checked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "library_collection" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"marketplace_id" uuid NOT NULL,
	"slug" text NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"estimated_minutes" integer,
	"publication_status" "content_status" DEFAULT 'draft' NOT NULL,
	"featured" boolean DEFAULT false NOT NULL,
	"published_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "library_collection_item" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"collection_id" uuid NOT NULL,
	"resource_id" uuid NOT NULL,
	"editor_note" text,
	"sort_order" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "library_creator" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"marketplace_id" uuid NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"summary" text,
	"credentials" text,
	"country_code" char(2),
	"languages_json" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"official_website_url" text,
	"profile_image_url" text,
	"profile_image_rights" "library_rights_status" DEFAULT 'pending' NOT NULL,
	"publication_status" "content_status" DEFAULT 'draft' NOT NULL,
	"claimed_at" timestamp with time zone,
	"last_verified_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "library_editorial_review" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"resource_id" uuid NOT NULL,
	"reviewer_id" uuid,
	"decision" "library_workflow_status" NOT NULL,
	"note" text,
	"rights_verified" boolean DEFAULT false NOT NULL,
	"source_verified_official" boolean DEFAULT false NOT NULL,
	"claims_reviewed" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "library_ingestion_run" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"channel_id" uuid NOT NULL,
	"status" "library_ingestion_run_status" DEFAULT 'running' NOT NULL,
	"discovered_count" integer DEFAULT 0 NOT NULL,
	"inserted_count" integer DEFAULT 0 NOT NULL,
	"updated_count" integer DEFAULT 0 NOT NULL,
	"skipped_count" integer DEFAULT 0 NOT NULL,
	"error" text,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "library_resource" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"marketplace_id" uuid NOT NULL,
	"source_channel_id" uuid NOT NULL,
	"slug" text NOT NULL,
	"format" "library_resource_format" NOT NULL,
	"title" text NOT NULL,
	"annotation" text,
	"takeaways_json" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"language" text DEFAULT 'es' NOT NULL,
	"canonical_url" text NOT NULL,
	"embed_url" text,
	"thumbnail_url" text,
	"external_platform" "library_platform" NOT NULL,
	"external_id" text NOT NULL,
	"duration_seconds" integer,
	"external_published_at" timestamp with time zone,
	"rights_status" "library_rights_status" DEFAULT 'pending' NOT NULL,
	"evidence_level" "library_evidence_level" DEFAULT 'unrated' NOT NULL,
	"workflow_status" "library_workflow_status" DEFAULT 'discovered' NOT NULL,
	"source_official" boolean DEFAULT false NOT NULL,
	"featured" boolean DEFAULT false NOT NULL,
	"metadata_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"metadata_hash" text NOT NULL,
	"source_fetched_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_reviewed_at" timestamp with time zone,
	"next_review_at" timestamp with time zone,
	"published_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "library_resource_creator" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"resource_id" uuid NOT NULL,
	"creator_id" uuid NOT NULL,
	"role" text DEFAULT 'creator' NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "library_resource_topic" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"resource_id" uuid NOT NULL,
	"topic_id" uuid NOT NULL,
	"is_primary" boolean DEFAULT false NOT NULL,
	"confidence" integer
);
--> statement-breakpoint
CREATE TABLE "library_topic" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"marketplace_id" uuid NOT NULL,
	"parent_id" uuid,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"publication_status" "content_status" DEFAULT 'draft' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "library_channel" ADD CONSTRAINT "library_channel_marketplace_id_marketplace_id_fk" FOREIGN KEY ("marketplace_id") REFERENCES "public"."marketplace"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "library_channel" ADD CONSTRAINT "library_channel_creator_id_library_creator_id_fk" FOREIGN KEY ("creator_id") REFERENCES "public"."library_creator"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "library_collection" ADD CONSTRAINT "library_collection_marketplace_id_marketplace_id_fk" FOREIGN KEY ("marketplace_id") REFERENCES "public"."marketplace"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "library_collection_item" ADD CONSTRAINT "library_collection_item_collection_id_library_collection_id_fk" FOREIGN KEY ("collection_id") REFERENCES "public"."library_collection"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "library_collection_item" ADD CONSTRAINT "library_collection_item_resource_id_library_resource_id_fk" FOREIGN KEY ("resource_id") REFERENCES "public"."library_resource"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "library_creator" ADD CONSTRAINT "library_creator_marketplace_id_marketplace_id_fk" FOREIGN KEY ("marketplace_id") REFERENCES "public"."marketplace"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "library_editorial_review" ADD CONSTRAINT "library_editorial_review_resource_id_library_resource_id_fk" FOREIGN KEY ("resource_id") REFERENCES "public"."library_resource"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "library_editorial_review" ADD CONSTRAINT "library_editorial_review_reviewer_id_app_user_id_fk" FOREIGN KEY ("reviewer_id") REFERENCES "public"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "library_ingestion_run" ADD CONSTRAINT "library_ingestion_run_channel_id_library_channel_id_fk" FOREIGN KEY ("channel_id") REFERENCES "public"."library_channel"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "library_resource" ADD CONSTRAINT "library_resource_marketplace_id_marketplace_id_fk" FOREIGN KEY ("marketplace_id") REFERENCES "public"."marketplace"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "library_resource" ADD CONSTRAINT "library_resource_source_channel_id_library_channel_id_fk" FOREIGN KEY ("source_channel_id") REFERENCES "public"."library_channel"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "library_resource_creator" ADD CONSTRAINT "library_resource_creator_resource_id_library_resource_id_fk" FOREIGN KEY ("resource_id") REFERENCES "public"."library_resource"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "library_resource_creator" ADD CONSTRAINT "library_resource_creator_creator_id_library_creator_id_fk" FOREIGN KEY ("creator_id") REFERENCES "public"."library_creator"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "library_resource_topic" ADD CONSTRAINT "library_resource_topic_resource_id_library_resource_id_fk" FOREIGN KEY ("resource_id") REFERENCES "public"."library_resource"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "library_resource_topic" ADD CONSTRAINT "library_resource_topic_topic_id_library_topic_id_fk" FOREIGN KEY ("topic_id") REFERENCES "public"."library_topic"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "library_topic" ADD CONSTRAINT "library_topic_marketplace_id_marketplace_id_fk" FOREIGN KEY ("marketplace_id") REFERENCES "public"."marketplace"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "library_channel_external_key" ON "library_channel" USING btree ("marketplace_id","platform","external_id");--> statement-breakpoint
CREATE INDEX "library_channel_poll_idx" ON "library_channel" USING btree ("marketplace_id","active","last_checked_at");--> statement-breakpoint
CREATE UNIQUE INDEX "library_collection_slug_key" ON "library_collection" USING btree ("marketplace_id","slug");--> statement-breakpoint
CREATE UNIQUE INDEX "library_collection_item_key" ON "library_collection_item" USING btree ("collection_id","resource_id");--> statement-breakpoint
CREATE UNIQUE INDEX "library_collection_item_order_key" ON "library_collection_item" USING btree ("collection_id","sort_order");--> statement-breakpoint
CREATE UNIQUE INDEX "library_creator_slug_key" ON "library_creator" USING btree ("marketplace_id","slug");--> statement-breakpoint
CREATE INDEX "library_editorial_review_resource_idx" ON "library_editorial_review" USING btree ("resource_id","created_at");--> statement-breakpoint
CREATE INDEX "library_ingestion_run_channel_idx" ON "library_ingestion_run" USING btree ("channel_id","started_at");--> statement-breakpoint
CREATE UNIQUE INDEX "library_resource_slug_key" ON "library_resource" USING btree ("marketplace_id","slug");--> statement-breakpoint
CREATE UNIQUE INDEX "library_resource_external_key" ON "library_resource" USING btree ("marketplace_id","external_platform","external_id");--> statement-breakpoint
CREATE UNIQUE INDEX "library_resource_canonical_key" ON "library_resource" USING btree ("marketplace_id","canonical_url");--> statement-breakpoint
CREATE INDEX "library_resource_public_idx" ON "library_resource" USING btree ("marketplace_id","workflow_status","source_official","external_published_at");--> statement-breakpoint
CREATE INDEX "library_resource_review_idx" ON "library_resource" USING btree ("marketplace_id","workflow_status","next_review_at");--> statement-breakpoint
CREATE UNIQUE INDEX "library_resource_creator_key" ON "library_resource_creator" USING btree ("resource_id","creator_id","role");--> statement-breakpoint
CREATE INDEX "library_resource_creator_order_idx" ON "library_resource_creator" USING btree ("resource_id","sort_order");--> statement-breakpoint
CREATE UNIQUE INDEX "library_resource_topic_key" ON "library_resource_topic" USING btree ("resource_id","topic_id");--> statement-breakpoint
CREATE INDEX "library_resource_topic_topic_idx" ON "library_resource_topic" USING btree ("topic_id","resource_id");--> statement-breakpoint
CREATE UNIQUE INDEX "library_topic_slug_key" ON "library_topic" USING btree ("marketplace_id","slug");--> statement-breakpoint
CREATE INDEX "library_topic_parent_idx" ON "library_topic" USING btree ("marketplace_id","parent_id","sort_order");